import { LeadTemp } from "./types";

const SITES_FRACOS = /instagram\.com|linktr\.ee|linktree|facebook\.com|wa\.me|whatsapp\.com|bit\.ly/i;

/** Classifica a temperatura do lead a partir do campo website do Places. */
export function classifyWebsite(website: string | null | undefined): LeadTemp {
  if (!website || website.trim() === "") return "quente";
  if (SITES_FRACOS.test(website)) return "morno";
  return "frio";
}

/** Score 0–100: rating alto + muitas avaliações + sem site = prioridade máxima. */
export function computeScore(
  rating: number | null | undefined,
  qtdAvaliacoes: number | null | undefined,
  temperatura: LeadTemp
): number {
  let score = 0;
  const r = rating ?? 0;
  const q = qtdAvaliacoes ?? 0;

  if (r >= 4.5) score += 30;
  else if (r >= 4.0) score += 20;
  else if (r >= 3.5) score += 10;

  if (q >= 50) score += 30;
  else if (q >= 20) score += 20;
  else if (q >= 5) score += 10;

  if (temperatura === "quente") score += 40;
  else if (temperatura === "morno") score += 15;

  return Math.min(score, 100);
}
