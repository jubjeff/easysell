import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** PATCH: pausar / retomar / encerrar sessão. body: { status } */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { status } = await req.json();
  if (!["ativa", "pausada", "encerrada", "concluida"].includes(status)) {
    return NextResponse.json({ error: "Status inválido." }, { status: 400 });
  }
  const patch: Record<string, unknown> = { status };
  if (status === "encerrada" || status === "concluida") {
    patch.ended_at = new Date().toISOString();
  }
  const { data, error } = await db()
    .from("dispatch_sessions")
    .update(patch)
    .eq("id", params.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ session: data });
}
