import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { requireUser, scopeFilter } from "@/lib/auth";
import { withJsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

export const POST = withJsonError(async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const me = await requireUser();
  const scope = scopeFilter(me);

  // vendedor só anota lead da própria carteira
  let lq = db().from("leads").select("id").eq("id", params.id);
  if (scope) lq = lq.eq("vendedor_id", scope);
  const { data: lead } = await lq.maybeSingle();
  if (!lead) return NextResponse.json({ error: "Lead não encontrado." }, { status: 404 });

  const { texto } = await req.json();
  if (!texto?.trim()) return NextResponse.json({ error: "Nota vazia." }, { status: 400 });
  const { data, error } = await db()
    .from("lead_notes")
    .insert({ lead_id: params.id, texto: texto.trim() })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ note: data });
});
