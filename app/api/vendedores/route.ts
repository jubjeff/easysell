import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { db } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { withJsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

/** GET: lista todos os perfis (admin only). */
export const GET = withJsonError(async function GET() {
  await requireAdmin();
  const { data, error } = await db()
    .from("profiles")
    .select("*")
    .order("role", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ vendedores: data });
});

/** POST: cria um vendedor (usuário no Auth + profile). Admin only. */
export const POST = withJsonError(async function POST(req: NextRequest) {
  await requireAdmin();
  const { nome, email, senha, whatsapp_numero, comissao_percentual } = await req.json();
  if (!nome?.trim() || !email?.trim() || !senha) {
    return NextResponse.json(
      { error: "Nome, e-mail e senha inicial são obrigatórios." },
      { status: 400 }
    );
  }
  if (String(senha).length < 6) {
    return NextResponse.json({ error: "A senha precisa ter ao menos 6 caracteres." }, { status: 400 });
  }

  // cria o usuário no Auth via service role (não precisa de confirmação de e-mail)
  const admin = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email: email.trim(),
    password: senha,
    email_confirm: true,
    user_metadata: { nome: nome.trim() },
  });
  if (cErr) {
    const msg = String(cErr.message).toLowerCase().includes("already")
      ? "Já existe um usuário com esse e-mail."
      : cErr.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const id = created.user.id;
  const { data: profile, error: pErr } = await db()
    .from("profiles")
    .insert({
      id,
      nome: nome.trim(),
      role: "vendedor",
      whatsapp_numero: whatsapp_numero || null,
      comissao_percentual: Number(comissao_percentual) || 0,
    })
    .select()
    .single();
  if (pErr) {
    // rollback do usuário Auth para não deixar órfão
    await admin.auth.admin.deleteUser(id);
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }

  // cada vendedor começa com sua própria linha de settings (janela/limite)
  await db().from("settings").insert({ vendedor_id: id });

  return NextResponse.json({ vendedor: profile });
});
