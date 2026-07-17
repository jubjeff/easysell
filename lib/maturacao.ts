import { Chip, MaturationDay, Settings } from "./types";

/**
 * Cronograma de maturação em 4 fases (tabela de configuração — ajuste aqui,
 * não espalhe números pelo código). Baseado em comportamento humano saudável:
 * mão dupla, poucos contatos com profundidade, crescimento gradual.
 */
export interface Fase {
  n: number;
  nome: string;
  diaIni: number;
  diaFim: number;
  contatosSugeridos: string;
  msgsMin: number;
  msgsMax: number;
  tarefas: string[];
  permiteTrabalho: string;
  permiteLink: string;
}

export const FASES: Fase[] = [
  {
    n: 1,
    nome: "Cadastro",
    diaIni: 1,
    diaFim: 3,
    contatosSugeridos: "2–4",
    msgsMin: 8,
    msgsMax: 12,
    tarefas: [
      "Completar o perfil: foto, nome e descrição",
      "Verificar o número no app oficial",
      "Entrar em 2–3 grupos (família, amigos, bairro)",
      "Conversar com 2–4 conhecidos que vão responder",
    ],
    permiteTrabalho: "Não",
    permiteLink: "Não",
  },
  {
    n: 2,
    nome: "Movimento natural",
    diaIni: 4,
    diaFim: 7,
    contatosSugeridos: "3–5 (+1 novo/dia opcional)",
    msgsMin: 20,
    msgsMax: 30,
    tarefas: [
      "Enviar áudios e figurinhas nas conversas",
      "Postar 1 status/story por dia",
      "Manter conversas de mão dupla (receber resposta importa mais que enviar)",
    ],
    permiteTrabalho: "Não",
    permiteLink: "Não",
  },
  {
    n: 3,
    nome: "Escala",
    diaIni: 8,
    diaFim: 14,
    contatosSugeridos: "5–8",
    msgsMin: 40,
    msgsMax: 60,
    tarefas: [
      "Postar status diário",
      "Manter mão dupla com todos os contatos ativos",
      "Falar de trabalho SÓ com quem já respondeu antes",
    ],
    permiteTrabalho: "Só com quem já respondeu",
    permiteLink: "Não",
  },
  {
    n: 4,
    nome: "Pré-operação",
    diaIni: 15,
    diaFim: 21,
    contatosSugeridos: "6–10",
    msgsMin: 80,
    msgsMax: 150,
    tarefas: [
      "Inserir 1 link no meio de conversas reais que respondem",
      "Manter status, áudios e figurinhas",
      "Nunca mandar link cru na primeira mensagem",
    ],
    permiteTrabalho: "Sim",
    permiteLink: "Sim (1 link/conversa que responde)",
  },
];

/** Dias com status/story postado exigidos para liberar. */
export const STATUS_DIAS_MINIMO = 10;
/** Fração mínima dos dias com pelo menos 1 resposta recebida. */
export const TAXA_RESPOSTA_MINIMA = 0.6;
/** Volume acima de N× o teto da fase congela a progressão. */
export const FATOR_CONGELAMENTO = 2;

export function faseDoDia(dia: number): Fase {
  return FASES.find((f) => dia >= f.diaIni && dia <= f.diaFim) ?? FASES[FASES.length - 1];
}

export interface Criterio {
  ok: boolean;
  label: string;
}

export interface MaturationState {
  diasValidos: number;
  diaAtual: number;
  totalDias: number;
  progresso: number;
  fase: Fase;
  status: "Em maturação" | "Pronto para operar" | "Em risco / pausado";
  emRisco: boolean;
  registrouHoje: boolean;
  comStatus: number;
  comResposta: number;
  alertas48h: number;
  criterios: Criterio[];
  liberavel: boolean;
}

function mesmaDataLocal(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function maturationState(
  chip: Chip,
  days: MaturationDay[],
  settings: Settings
): MaturationState {
  const totalDias = Math.max(14, Number(settings.maturacao_dias) || 21);
  const validos = days.filter((d) => !d.congelou);
  const diasValidos = validos.length;
  const diaAtual = Math.min(diasValidos + 1, totalDias);
  const fase = faseDoDia(Math.min(diaAtual, 21));

  const agora = Date.now();
  const emRisco = !!chip.risco_ate && new Date(chip.risco_ate).getTime() > agora;
  const corte48h = agora - 48 * 3600 * 1000;
  const alertas48h = days.filter(
    (d) => new Date(d.created_at).getTime() >= corte48h && (d.congelou || d.bloqueios > 0)
  ).length;

  const comStatus = validos.filter((d) => d.status_postado).length;
  const comResposta = validos.filter((d) => d.msgs_recebidas > 0).length;
  const perfilCompleto = chip.perfil_foto && chip.perfil_nome && chip.perfil_descricao;
  const taxaOk =
    diasValidos >= totalDias && diasValidos > 0
      ? comResposta / diasValidos >= TAXA_RESPOSTA_MINIMA
      : diasValidos > 0 && comResposta / diasValidos >= TAXA_RESPOSTA_MINIMA;

  const criterios: Criterio[] = [
    { ok: diasValidos >= totalDias, label: `Ciclo concluído (${diasValidos}/${totalDias} dias registrados)` },
    { ok: perfilCompleto, label: "Perfil completo (foto, nome e descrição)" },
    {
      ok: comStatus >= STATUS_DIAS_MINIMO,
      label: `Status/story postado em pelo menos ${STATUS_DIAS_MINIMO} dias (${comStatus}/${STATUS_DIAS_MINIMO})`,
    },
    {
      ok: taxaOk,
      label: `Respostas recebidas em ≥60% dos dias (${comResposta}/${diasValidos || 0})`,
    },
    { ok: !emRisco && alertas48h === 0, label: "Nenhum alerta de risco nas últimas 48h" },
  ];
  const liberavel = criterios.every((c) => c.ok);

  const hoje = new Date();
  const registrouHoje = days.some((d) => mesmaDataLocal(new Date(d.created_at), hoje));

  return {
    diasValidos,
    diaAtual,
    totalDias,
    progresso: Math.min(100, Math.round((diasValidos / totalDias) * 100)),
    fase,
    status: emRisco ? "Em risco / pausado" : liberavel ? "Pronto para operar" : "Em maturação",
    emRisco,
    registrouHoje,
    comStatus,
    comResposta,
    alertas48h,
    criterios,
    liberavel,
  };
}
