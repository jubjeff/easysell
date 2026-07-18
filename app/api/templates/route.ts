import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { requireUser, requireAdmin } from "@/lib/auth";
import { withJsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = withJsonError(async function GET() {
  await requireUser();
  const { data, error } = await db()
    .from("templates")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ templates: data });
});

export const POST = withJsonError(async function POST(req: NextRequest) {
  await requireAdmin();
  const { nome, corpo, social_proof } = await req.json();
  if (!nome?.trim() || !corpo?.trim()) {
    return NextResponse.json({ error: "Nome e corpo são obrigatórios." }, { status: 400 });
  }
  const { data, error } = await db()
    .from("templates")
    .insert({ nome: nome.trim(), corpo, social_proof: social_proof || null })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ template: data });
});
