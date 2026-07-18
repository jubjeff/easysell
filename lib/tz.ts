/**
 * Relógio do Brasil (UTC-3, sem horário de verão desde 2019).
 * O servidor da Vercel roda em UTC — sem este ajuste, "hoje" viraria às
 * 21h de Brasília e a janela de envio ficaria 3h adiantada.
 */
export const BR_OFFSET_MS = -3 * 3600 * 1000;

/** Data cujos campos getUTC*() correspondem ao relógio brasileiro. */
export function nowBr(base = new Date()): Date {
  return new Date(base.getTime() + BR_OFFSET_MS);
}

/** Início do dia brasileiro como instante real (para comparar com timestamps UTC). */
export function startOfDayBr(brClock = nowBr()): Date {
  return new Date(
    Date.UTC(brClock.getUTCFullYear(), brClock.getUTCMonth(), brClock.getUTCDate()) -
      BR_OFFSET_MS
  );
}

/** Dois instantes caem no mesmo dia do calendário brasileiro? */
export function mesmoDiaBr(a: Date, b: Date): boolean {
  const ba = nowBr(a);
  const bb = nowBr(b);
  return (
    ba.getUTCFullYear() === bb.getUTCFullYear() &&
    ba.getUTCMonth() === bb.getUTCMonth() &&
    ba.getUTCDate() === bb.getUTCDate()
  );
}
