import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { normalizePhone } from "@/lib/phone";
import { computeScore } from "@/lib/score";
import { requireAdmin } from "@/lib/auth";
import { withJsonError } from "@/lib/api";
import { ensureCampaigns } from "@/lib/campaigns";

export const dynamic = "force-dynamic";

const HANDLE_RE = /^[a-zA-Z0-9._]{1,30}$/;

/** Aceita "@nome", "nome" ou até uma URL colada — extrai só o @ normalizado. */
function normalizeHandle(raw: string): string | null {
  let h = (raw ?? "").trim();
  h = h.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "");
  h = h.replace(/^@/, "").split(/[/?]/)[0].trim();
  if (!HANDLE_RE.test(h)) return null;
  return h.toLowerCase();
}

/**
 * POST — captura rápida de 1 perfil do Instagram (Módulo 1). Diferente do
 * POST /api/leads (import em lote de Places/CSV): aqui é 1 lead por vez,
 * com telefone opcional (Caminho B — só Instagram, sem WhatsApp na bio).
 */
export const POST = withJsonError(async function POST(req: NextRequest) {
  await requireAdmin();
  const body = await req.json();
  const client = db();

  const handle = normalizeHandle(body.instagram_handle ?? "");
  if (!handle) {
    return NextResponse.json(
      { error: "@ inválido — use letras, números, ponto ou underline (sem espaços)." },
      { status: 400 }
    );
  }
  const nicho = String(body.nicho ?? "").trim().toLowerCase();
  const cidade = String(body.cidade ?? "").trim();
  if (!nicho || !cidade) {
    return NextResponse.json({ error: "Nicho e cidade são obrigatórios." }, { status: 400 });
  }

  let telefone: string | null = null;
  if (body.tem_whatsapp_na_bio) {
    telefone = normalizePhone(body.whatsapp_numero ?? "");
    if (!telefone) {
      return NextResponse.json(
        { error: "Marcou que tem WhatsApp na bio, mas o número não é válido." },
        { status: 400 }
      );
    }
  }

  // dedupe: mesmo @ já capturado antes?
  const { data: existente } = await client
    .from("leads")
    .select("id")
    .ilike("instagram_handle", handle)
    .maybeSingle();
  if (existente) {
    return NextResponse.json({ error: `@${handle} já foi capturado antes.` }, { status: 409 });
  }

  const temSite = Boolean(body.link_bio_aponta_site);
  const temperatura = temSite ? "frio" : "quente";
  const nome = String(body.nome ?? "").trim() || `@${handle}`;

  const { data: lead, error } = await client
    .from("leads")
    .insert({
      nome,
      telefone,
      cidade,
      nicho,
      rating: null,
      qtd_avaliacoes: 0,
      website: null,
      temperatura,
      score: computeScore(null, 0, temperatura),
      source: "manual",
      origem: "instagram",
      instagram_handle: handle,
      tem_whatsapp_na_bio: Boolean(body.tem_whatsapp_na_bio),
      canal_contato_ativo: telefone ? "whatsapp" : "instagram_dm",
    })
    .select()
    .single();
  if (error) {
    const dup = error.code === "23505";
    return NextResponse.json(
      { error: dup ? "Perfil ou telefone já cadastrado." : error.message },
      { status: dup ? 409 : 500 }
    );
  }

  const notas = String(body.notas ?? "").trim();
  if (notas) {
    await client.from("lead_notes").insert({ lead_id: lead.id, texto: notas });
  }

  // mesma automação da captação por Places/CSV: garante campanha pro nicho+cidade
  const campanhasCriadas = await ensureCampaigns(client, [{ nicho, cidade }]);

  return NextResponse.json({
    lead,
    campanhas_criadas: campanhasCriadas.length,
    campanhas: campanhasCriadas.map((c) => c.nome),
  });
});
