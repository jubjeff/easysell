import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { db } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { withJsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

/** PATCH: edita perfil do vendedor (nome, whatsapp, comissão, ativo) ou reseta senha. Admin only. */
export const PATCH = withJsonError(async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  await requireAdmin();
  const body = await req.json();

  // reset de senha (opcional)
  if (body.nova_senha) {
    if (String(body.nova_senha).length < 6) {
      return NextResponse.json({ error: "A senha precisa ter ao menos 6 caracteres." }, { status: 400 });
    }
    const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });
    const { error } = await admin.auth.admin.updateUserById(params.id, { password: body.nova_senha });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const patch: Record<string, unknown> = {};
  for (const k of ["nome", "whatsapp_numero", "comissao_percentual", "ativo"]) {
    if (k in body) patch[k] = body[k];
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true });

  const { data, error } = await db()
    .from("profiles")
    .update(patch)
    .eq("id", params.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ vendedor: data });
});
