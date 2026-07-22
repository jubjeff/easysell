import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { getProfile, requireUser } from "@/lib/auth";
import { withJsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Perfil do usuário logado — usado pelo Nav e telas para adaptar por papel. */
export const GET = withJsonError(async function GET() {
  const profile = await getProfile();
  return NextResponse.json({ profile });
});

/** PATCH: o próprio usuário edita nome/whatsapp (qualquer papel, só o próprio registro). */
export const PATCH = withJsonError(async function PATCH(req: NextRequest) {
  const me = await requireUser();
  const body = await req.json();
  const patch: Record<string, unknown> = {};
  for (const k of ["nome", "whatsapp_numero"]) {
    if (k in body) patch[k] = body[k];
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true });

  const { data, error } = await db()
    .from("profiles")
    .update(patch)
    .eq("id", me.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profile: data });
});
