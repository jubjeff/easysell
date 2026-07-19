import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { withJsonError } from "@/lib/api";
import { captureThumbnail } from "@/lib/screenshot";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // captura + upload podem levar alguns segundos

/**
 * POST — admin captura (ou recaptura) a thumbnail da demo de forma síncrona.
 * O client mostra skeleton enquanto aguarda e troca pela imagem no retorno.
 * captureThumbnail nunca lança: em falha, grava status 'failed' (placeholder).
 */
export const POST = withJsonError(async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  await requireAdmin();

  const { data: demo, error: e0 } = await db()
    .from("demos")
    .select("id, url")
    .eq("id", params.id)
    .single();
  if (e0 || !demo) return NextResponse.json({ error: "Demo não encontrada." }, { status: 404 });

  await db().from("demos").update({ thumbnail_status: "pending" }).eq("id", demo.id);

  const shot = await captureThumbnail(demo.id, demo.url);

  const { data, error } = await db()
    .from("demos")
    .update({
      thumbnail_url: shot.thumbnail_url,
      thumbnail_status: shot.thumbnail_status,
      thumbnail_updated_at: new Date().toISOString(),
    })
    .eq("id", demo.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ demo: data });
});
