import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { withJsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * POST — admin grava a nova ordem manual dos nichos.
 * Body: { ids: string[] } na ordem desejada; `ordem` vira o índice de cada um.
 */
export const POST = withJsonError(async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const { ids } = await req.json();
  if (!Array.isArray(ids) || ids.some((x) => typeof x !== "string")) {
    return NextResponse.json({ error: "Envie a lista de ids na nova ordem." }, { status: 400 });
  }
  const now = new Date().toISOString();
  await Promise.all(
    ids.map((id, i) =>
      db().from("demos").update({ ordem: i, editado_por: admin.id, atualizado_em: now }).eq("id", id)
    )
  );
  return NextResponse.json({ ok: true });
});
