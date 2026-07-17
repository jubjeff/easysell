import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { texto } = await req.json();
  if (!texto?.trim()) return NextResponse.json({ error: "Nota vazia." }, { status: 400 });
  const { data, error } = await db()
    .from("lead_notes")
    .insert({ lead_id: params.id, texto: texto.trim() })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ note: data });
}
