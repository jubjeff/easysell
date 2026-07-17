import { NextResponse } from "next/server";

/**
 * Envolve um handler de rota garantindo que qualquer exceção vire uma
 * resposta JSON legível (em vez de um 500 de corpo vazio que quebra o
 * res.json() no client).
 */
export function withJsonError<A extends any[]>(
  fn: (...args: A) => Promise<NextResponse>
): (...args: A) => Promise<NextResponse> {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (e: any) {
      return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
    }
  };
}
