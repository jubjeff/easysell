import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const { data, error } = await db()
    .from("templates")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ templates: data });
}

export async function POST(req: NextRequest) {
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
}
