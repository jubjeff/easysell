import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { withJsonError } from "@/lib/api";
import { normalizeText } from "@/lib/text";

export const dynamic = "force-dynamic";

/**
 * GET: painel de distribuição (admin). Leads não atribuídos + vendedores
 * ativos + contagem de carteira de cada um. ?nicho= &cidade= filtram os não
 * atribuídos.
 */
export const GET = withJsonError(async function GET(req: NextRequest) {
  await requireAdmin();
  const client = db();
  const sp = req.nextUrl.searchParams;

  let q = client
    .from("leads")
    .select("id, nome, cidade, nicho, telefone, score, stage")
    .is("vendedor_id", null)
    .order("score", { ascending: false })
    .limit(1000);
  if (sp.get("nicho")) q = q.eq("nicho", sp.get("nicho"));
  if (sp.get("cidade")) q = q.eq("cidade", sp.get("cidade"));

  // qualquer perfil ativo pode receber leads (admin também prospecta, não só vendedor)
  const [{ data: naoAtribuidos }, { data: vendedores }, { data: carteira }] = await Promise.all([
    q,
    client.from("profiles").select("id, nome, role, ativo").order("role").order("nome"),
    client.from("leads").select("vendedor_id").not("vendedor_id", "is", null),
  ]);

  // contagem por vendedor
  const contagem: Record<string, number> = {};
  for (const l of carteira ?? []) {
    if (l.vendedor_id) contagem[l.vendedor_id] = (contagem[l.vendedor_id] ?? 0) + 1;
  }

  return NextResponse.json({
    naoAtribuidos: naoAtribuidos ?? [],
    vendedores: (vendedores ?? []).map((v) => ({ ...v, carteira: contagem[v.id] ?? 0 })),
  });
});

/**
 * POST: atribui/reatribui leads. Admin only.
 *  - manual: { lead_ids: string[], vendedor_id }  (vendedor_id null = desatribuir)
 *  - auto:   { modo: "auto", vendedor_ids: string[], nicho?, cidade? }
 *            round-robin dos não atribuídos entre os vendedores escolhidos.
 * Regra dura: cada lead fica com exatamente 1 vendedor (a coluna é única por lead).
 */
export const POST = withJsonError(async function POST(req: NextRequest) {
  await requireAdmin();
  const client = db();
  const body = await req.json();

  if (body.modo === "auto") {
    const vendedorIds: string[] = (body.vendedor_ids ?? []).filter(Boolean);
    if (vendedorIds.length === 0) {
      return NextResponse.json({ error: "Escolha ao menos um vendedor." }, { status: 400 });
    }
    // não atribuídos, opcionalmente filtrados por nicho/cidade (tolerante a acento)
    const { data: pool } = await client
      .from("leads")
      .select("id, nicho, cidade, score")
      .is("vendedor_id", null)
      .order("score", { ascending: false });
    const nichoAlvo = body.nicho ? normalizeText(body.nicho) : null;
    const cidadeAlvo = body.cidade ? normalizeText(body.cidade) : null;
    const alvo = (pool ?? []).filter(
      (l) =>
        (!nichoAlvo || normalizeText(l.nicho) === nichoAlvo) &&
        (!cidadeAlvo || normalizeText(l.cidade) === cidadeAlvo)
    );
    if (alvo.length === 0) {
      return NextResponse.json({ error: "Nenhum lead não atribuído para esse filtro." }, { status: 422 });
    }

    // round-robin: distribui em rodadas, o lead mais antigo/melhor primeiro
    let atribuidos = 0;
    const porVendedor: Record<string, number> = {};
    for (let i = 0; i < alvo.length; i++) {
      const vId = vendedorIds[i % vendedorIds.length];
      const { error } = await client.from("leads").update({ vendedor_id: vId }).eq("id", alvo[i].id);
      if (!error) {
        atribuidos++;
        porVendedor[vId] = (porVendedor[vId] ?? 0) + 1;
      }
    }
    return NextResponse.json({ atribuidos, porVendedor });
  }

  // manual
  const leadIds: string[] = (body.lead_ids ?? []).filter(Boolean);
  if (leadIds.length === 0) {
    return NextResponse.json({ error: "Selecione ao menos um lead." }, { status: 400 });
  }
  const vendedorId = body.vendedor_id || null;
  const { error, count } = await client
    .from("leads")
    .update({ vendedor_id: vendedorId }, { count: "exact" })
    .in("id", leadIds);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ atribuidos: count ?? leadIds.length });
});
