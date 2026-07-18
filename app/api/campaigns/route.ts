import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { requireUser, requireAdmin } from "@/lib/auth";
import { withJsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = withJsonError(async function GET() {
  await requireUser();
  const { data, error } = await db()
    .from("campaigns")
    .select("*, campaign_templates(template_id, templates(nome))")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaigns: data });
});

export const POST = withJsonError(async function POST(req: NextRequest) {
  await requireAdmin();
  const { nome, nicho, cidade, limite_diario, limiar_taxa_resposta, template_ids } =
    await req.json();
  if (!nome?.trim() || !nicho?.trim() || !cidade?.trim()) {
    return NextResponse.json({ error: "Nome, nicho e cidade são obrigatórios." }, { status: 400 });
  }
  const client = db();
  const { data: campaign, error } = await client
    .from("campaigns")
    .insert({
      nome: nome.trim(),
      nicho: nicho.trim().toLowerCase(),
      cidade: cidade.trim(),
      limite_diario: Number(limite_diario) || 15,
      limiar_taxa_resposta: Number(limiar_taxa_resposta) || 5,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (Array.isArray(template_ids) && template_ids.length > 0) {
    await client
      .from("campaign_templates")
      .insert(template_ids.map((template_id: string) => ({ campaign_id: campaign.id, template_id })));
  }
  return NextResponse.json({ campaign });
});
