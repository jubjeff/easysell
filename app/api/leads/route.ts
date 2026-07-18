import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { normalizePhone } from "@/lib/phone";
import { classifyWebsite, computeScore } from "@/lib/score";
import { requireUser, requireAdmin, scopeFilter } from "@/lib/auth";
import { withJsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * GET: lista leads com filtros ?stage=&nicho=&cidade=&q=&vendedor=
 * Vendedor vê só a própria carteira; admin vê todos (e pode filtrar por vendedor).
 */
export const GET = withJsonError(async function GET(req: NextRequest) {
  const me = await requireUser();
  const scope = scopeFilter(me);
  const sp = req.nextUrl.searchParams;
  let q = db().from("leads").select("*").order("score", { ascending: false });
  if (scope) {
    q = q.eq("vendedor_id", scope);
  } else if (sp.get("vendedor")) {
    // admin filtrando por um vendedor específico ("nao_atribuido" = sem dono)
    const v = sp.get("vendedor")!;
    q = v === "nao_atribuido" ? q.is("vendedor_id", null) : q.eq("vendedor_id", v);
  }
  if (sp.get("stage")) q = q.eq("stage", sp.get("stage"));
  if (sp.get("nicho")) q = q.eq("nicho", sp.get("nicho"));
  if (sp.get("cidade")) q = q.eq("cidade", sp.get("cidade"));
  if (sp.get("q")) q = q.ilike("nome", `%${sp.get("q")}%`);
  const { data, error } = await q.limit(1000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ leads: data });
});

/**
 * POST: importa leads em lote (Places/CSV) — admin only. Entram NÃO atribuídos
 * (vendedor_id null); o admin distribui depois. Dedupe por telefone e place_id.
 */
export const POST = withJsonError(async function POST(req: NextRequest) {
  await requireAdmin();
  const body = await req.json();
  const source = body.source ?? "manual";
  const raw: any[] = body.leads ?? [];
  const client = db();

  const prepared: any[] = [];
  const invalidos: string[] = [];
  const seenPhones = new Set<string>();

  for (const l of raw) {
    const telefone = normalizePhone(l.telefone ?? "");
    if (!telefone || !l.nome || !l.cidade || !l.nicho) {
      invalidos.push(l.nome ?? l.telefone ?? "(sem nome)");
      continue;
    }
    if (seenPhones.has(telefone)) continue; // dupe dentro do próprio lote
    seenPhones.add(telefone);
    const temperatura = l.temperatura ?? classifyWebsite(l.website);
    prepared.push({
      google_place_id: l.google_place_id ?? null,
      nome: String(l.nome).trim(),
      telefone,
      endereco: l.endereco ?? null,
      cidade: String(l.cidade).trim(),
      nicho: String(l.nicho).trim().toLowerCase(),
      rating: l.rating != null && l.rating !== "" ? Number(l.rating) : null,
      qtd_avaliacoes: Number(l.qtd_avaliacoes ?? 0) || 0,
      website: l.website || null,
      temperatura,
      score: computeScore(
        l.rating != null && l.rating !== "" ? Number(l.rating) : null,
        Number(l.qtd_avaliacoes ?? 0) || 0,
        temperatura
      ),
      source,
    });
  }

  if (prepared.length === 0) {
    return NextResponse.json(
      { inserted: 0, duplicated: 0, invalid: invalidos.length, invalidos },
      { status: 200 }
    );
  }

  // dedupe contra a base: telefones e place_ids já existentes
  const phones = prepared.map((p) => p.telefone);
  const placeIds = prepared.map((p) => p.google_place_id).filter(Boolean);
  const { data: existing } = await client
    .from("leads")
    .select("telefone, google_place_id")
    .or(
      [
        `telefone.in.(${phones.map((p) => `"${p}"`).join(",")})`,
        placeIds.length
          ? `google_place_id.in.(${placeIds.map((p) => `"${p}"`).join(",")})`
          : null,
      ]
        .filter(Boolean)
        .join(",")
    );

  const existingPhones = new Set((existing ?? []).map((e) => e.telefone));
  const existingPlaceIds = new Set((existing ?? []).map((e) => e.google_place_id).filter(Boolean));
  const toInsert = prepared.filter(
    (p) =>
      !existingPhones.has(p.telefone) &&
      (!p.google_place_id || !existingPlaceIds.has(p.google_place_id))
  );
  const duplicated = prepared.length - toInsert.length;

  let inserted = 0;
  if (toInsert.length > 0) {
    const { data, error } = await client.from("leads").insert(toInsert).select("id");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    inserted = data?.length ?? 0;
  }

  return NextResponse.json({ inserted, duplicated, invalid: invalidos.length, invalidos });
});
