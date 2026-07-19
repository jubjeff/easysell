export type LeadTemp = "quente" | "morno" | "frio";
export type LeadStage =
  | "novo"
  | "contactado"
  | "respondeu"
  | "demo_enviada"
  | "negociacao"
  | "fechado"
  | "perdido";
export type LeadSource = "places" | "csv" | "manual";
export type SessionStatus = "ativa" | "pausada" | "encerrada" | "concluida";
export type SessionType = "disparo" | "aquecimento";
export type QueueStatus = "pendente" | "enviado" | "numero_invalido" | "pulado";
export type MsgEvent =
  | "gerada"
  | "regenerada"
  | "editada"
  | "copiada"
  | "enviado"
  | "numero_invalido"
  | "pulado";

export type Role = "admin" | "vendedor";
export type CommissionStatus = "a_pagar" | "pago";

export interface Profile {
  id: string;
  nome: string;
  role: Role;
  whatsapp_numero: string | null;
  comissao_percentual: number;
  ativo: boolean;
  created_at: string;
}

export interface CommissionRule {
  id: string;
  vendedor_id: string | null; // null = regra padrão
  valor_min: number;
  valor_max: number | null;
  percentual: number;
  created_at: string;
}

export interface Commission {
  id: string;
  lead_id: string;
  vendedor_id: string;
  valor_venda: number;
  percentual: number;
  valor_comissao: number;
  status: CommissionStatus;
  fechado_em: string;
  pago_em: string | null;
}

export interface Lead {
  id: string;
  vendedor_id: string | null;
  google_place_id: string | null;
  nome: string;
  primeiro_nome: string | null;
  telefone: string;
  endereco: string | null;
  cidade: string;
  nicho: string;
  rating: number | null;
  qtd_avaliacoes: number;
  website: string | null;
  temperatura: LeadTemp;
  score: number;
  source: LeadSource;
  stage: LeadStage;
  stage_changed_at: string;
  demo_url: string | null;
  valor_proposto: number | null;
  valor_venda: number | null;
  plano: string | null;
  motivo_perda: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadNote {
  id: string;
  lead_id: string;
  texto: string;
  created_at: string;
}

export interface Template {
  id: string;
  nome: string;
  corpo: string;
  social_proof: string | null;
  variante: string | null;
  ativo: boolean;
  created_at: string;
}

export interface Campaign {
  id: string;
  nome: string;
  nicho: string;
  cidade: string;
  limite_diario: number;
  limiar_taxa_resposta: number;
  ativa: boolean;
  created_at: string;
}

export interface DispatchSession {
  id: string;
  vendedor_id: string | null;
  campaign_id: string;
  chip_id: string;
  tipo: SessionType;
  meta_do_dia: number;
  intervalo_min_s: number;
  intervalo_max_s: number;
  status: SessionStatus;
  started_at: string;
  ended_at: string | null;
}

export interface Chip {
  id: string;
  vendedor_id: string | null;
  nome: string;
  telefone: string | null;
  ativado_em: string;
  limite_diario_override: number | null;
  ativo: boolean;
  maturando: boolean;
  maturacao_inicio: string | null;
  perfil_foto: boolean;
  perfil_nome: boolean;
  perfil_descricao: boolean;
  liberado_em: string | null;
  risco_ate: string | null;
  created_at: string;
}

export interface MaturationDay {
  id: string;
  chip_id: string;
  dia: number;
  msgs_enviadas: number;
  msgs_recebidas: number;
  contatos_ativos: number;
  contatos_novos: number;
  status_postado: boolean;
  bloqueios: number;
  congelou: boolean;
  notas: string | null;
  created_at: string;
}

export interface QueueItem {
  id: string;
  session_id: string;
  lead_id: string;
  template_id: string;
  posicao: number;
  mensagem: string;
  msg_hash: string;
  editada: boolean;
  status: QueueStatus;
  resolved_at: string | null;
}

export interface Settings {
  id: number;
  vendedor_id: string | null;
  janela_inicio: string;
  janela_fim: string;
  dias_uteis: number[];
  som_ativado: boolean;
  volume: number;
  aquecimento_limite_diario: number;
  maturacao_dias: number;
}

export const STAGES: { key: LeadStage; label: string }[] = [
  { key: "novo", label: "Novo" },
  { key: "contactado", label: "Contactado" },
  { key: "respondeu", label: "Respondeu" },
  { key: "demo_enviada", label: "Demo enviada" },
  { key: "negociacao", label: "Negociação" },
  { key: "fechado", label: "Fechado" },
  { key: "perdido", label: "Perdido" },
];
