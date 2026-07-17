import { db } from "./supabase";
import { Chip, Settings, SessionType } from "./types";

/** Preset de limite diário pela idade do chip. */
export function chipPreset(ativadoEm: string): {
  idadeDias: number;
  fase: string;
  limite: number;
} {
  const idadeDias = Math.floor(
    (Date.now() - new Date(ativadoEm + "T00:00:00").getTime()) / 86400000
  );
  if (idadeDias < 30) return { idadeDias, fase: "Chip novo (< 30 dias)", limite: 15 };
  if (idadeDias <= 90) return { idadeDias, fase: "Chip aquecido (30–90 dias)", limite: 40 };
  return { idadeDias, fase: "Chip maduro (> 90 dias)", limite: 80 };
}

export async function getSettings(): Promise<Settings> {
  const { data, error } = await db().from("settings").select("*").eq("id", 1).single();
  if (error) throw new Error("Erro ao ler settings: " + error.message);
  return data as Settings;
}

export async function getChip(id: string): Promise<Chip | null> {
  const { data } = await db().from("chips").select("*").eq("id", id).single();
  return (data as Chip) ?? null;
}

/**
 * Limite diário efetivo de um chip: override manual (ou preset por idade)
 * — e, em sessão de aquecimento, nunca mais que o teto de aquecimento
 * configurado globalmente, mesmo que o chip já esteja "maduro".
 */
export function effectiveDailyLimit(chip: Chip, tipo: SessionType, settings: Settings): number {
  const normal = chip.limite_diario_override ?? chipPreset(chip.ativado_em).limite;
  if (tipo === "aquecimento") return Math.min(normal, settings.aquecimento_limite_diario);
  return normal;
}

/** Envios de hoje e da semana (evento 'enviado' no log) de um chip específico. */
export async function sentCounts(chipId: string): Promise<{ hoje: number; semana: number }> {
  const now = new Date();
  const startDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startWeek = new Date(startDay);
  startWeek.setDate(startWeek.getDate() - ((startWeek.getDay() + 6) % 7)); // segunda

  const client = db();
  const [today, week] = await Promise.all([
    client
      .from("message_logs")
      .select("id", { count: "exact", head: true })
      .eq("evento", "enviado")
      .eq("chip_id", chipId)
      .gte("created_at", startDay.toISOString()),
    client
      .from("message_logs")
      .select("id", { count: "exact", head: true })
      .eq("evento", "enviado")
      .eq("chip_id", chipId)
      .gte("created_at", startWeek.toISOString()),
  ]);
  return { hoje: today.count ?? 0, semana: week.count ?? 0 };
}

/** Verifica se agora está dentro da janela de envio configurada. */
export function inSendWindow(s: Settings, now = new Date()): { ok: boolean; motivo?: string } {
  const isoDay = now.getDay() === 0 ? 7 : now.getDay(); // ISO: 1=seg ... 7=dom
  if (!s.dias_uteis.includes(isoDay)) {
    return { ok: false, motivo: "Hoje não é um dia de envio configurado." };
  }
  const hm = now.getHours() * 60 + now.getMinutes();
  const [hi, mi] = s.janela_inicio.split(":").map(Number);
  const [hf, mf] = s.janela_fim.split(":").map(Number);
  if (hm < hi * 60 + mi || hm >= hf * 60 + mf) {
    return {
      ok: false,
      motivo: `Fora da janela de envio (${s.janela_inicio.slice(0, 5)}–${s.janela_fim.slice(0, 5)}).`,
    };
  }
  return { ok: true };
}
