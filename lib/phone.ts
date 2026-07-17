/**
 * Normaliza telefone brasileiro para E.164 (+55DDDNÚMERO).
 * Retorna null se não conseguir extrair um número plausível.
 */
export function normalizePhone(raw: string): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  // remove 0 de operadora/tronco no início (ex: 081..., 0xx81...)
  digits = digits.replace(/^0+/, "");

  // já veio com 55? (13 dígitos = 55 + DDD + 9 dígitos; 12 = 55 + DDD + 8)
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return "+" + digits;
  }
  // DDD + número (10 = fixo, 11 = celular)
  if (digits.length === 10 || digits.length === 11) {
    return "+55" + digits;
  }
  return null;
}

/** Telefone para exibição: (81) 99999-9999 */
export function formatPhone(e164: string): string {
  const d = e164.replace(/\D/g, "").replace(/^55/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return e164;
}

/** Link wa.me — só dígitos, sem '+' */
export function waLink(e164: string, text?: string): string {
  const num = e164.replace(/\D/g, "");
  const q = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${num}${q}`;
}
