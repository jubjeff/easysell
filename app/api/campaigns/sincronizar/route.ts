import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { withJsonError } from "@/lib/api";
import { ensureCampaigns } from "@/lib/campaigns";

export const dynamic = "force-dynamic";

/**
 * POST — backfill: cria uma campanha para todo par (nicho, cidade) já
 * existente na base de leads que ainda não tenha uma. Cobre os leads
 * capturados antes da criação automática de campanha na importação.
 */
export const POST = withJsonError(async function POST() {
  await requireAdmin();
  const client = db();
  const { data: leads } = await client.from("leads").select("nicho, cidade");
  const criadas = await ensureCampaigns(client, leads ?? []);
  return NextResponse.json({ criadas: criadas.length, campanhas: criadas.map((c) => c.nome) });
});
