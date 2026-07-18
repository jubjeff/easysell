import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { normalizePhone } from "@/lib/phone";
import { classifyWebsite, computeScore } from "@/lib/score";
import { searchOsm } from "@/lib/osm";
import { requireAdmin } from "@/lib/auth";
import { withJsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * POST { nicho, cidade, pageToken?, provider? } — captação, admin only.
 * provider "google": Places API (New) Text Search — telefone/site/rating na
 * mesma chamada. provider "osm" (default sem chave Google): Overpass API,
 * gratuito, sem rating.
 * Retorna os resultados já classificados e marcados como duplicados ou não.
 */
export const POST = withJsonError(async function POST(req: NextRequest) {
  await requireAdmin();
  const key = process.env.GOOGLE_PLACES_API_KEY;
  const { nicho, cidade, pageToken, provider } = await req.json();
  if (!nicho || !cidade) {
    return NextResponse.json({ error: "Informe nicho e cidade." }, { status: 400 });
  }
  const useOsm = provider === "osm" || (!key && provider !== "google");
  if (useOsm) return searchViaOsm(nicho, cidade);
  if (!key) {
    return NextResponse.json(
      { error: "GOOGLE_PLACES_API_KEY não configurada no .env.local — use o provedor OpenStreetMap." },
      { status: 422 }
    );
  }

  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": [
        "places.id",
        "places.displayName",
        "places.nationalPhoneNumber",
        "places.internationalPhoneNumber",
        "places.formattedAddress",
        "places.rating",
        "places.userRatingCount",
        "places.websiteUri",
        "nextPageToken",
      ].join(","),
    },
    body: JSON.stringify({
      textQuery: `${nicho} em ${cidade}`,
      languageCode: "pt-BR",
      regionCode: "BR",
      pageSize: 20,
      ...(pageToken ? { pageToken } : {}),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json(
      { error: `Places API retornou erro ${res.status}: ${err.slice(0, 300)}` },
      { status: 502 }
    );
  }
  const data = await res.json();
  const places: any[] = data.places ?? [];

  const results = places.map((p) => {
    const telefoneRaw = p.internationalPhoneNumber || p.nationalPhoneNumber || "";
    const telefone = normalizePhone(telefoneRaw);
    const website = p.websiteUri ?? null;
    const temperatura = classifyWebsite(website);
    return {
      google_place_id: p.id,
      nome: p.displayName?.text ?? "(sem nome)",
      telefone,
      endereco: p.formattedAddress ?? null,
      cidade,
      nicho: String(nicho).toLowerCase(),
      rating: p.rating ?? null,
      qtd_avaliacoes: p.userRatingCount ?? 0,
      website,
      temperatura,
      score: computeScore(p.rating ?? null, p.userRatingCount ?? 0, temperatura),
      sem_telefone: !telefone,
    };
  });

  // marca duplicados contra a base
  const phones = results.map((r) => r.telefone).filter(Boolean) as string[];
  const placeIds = results.map((r) => r.google_place_id);
  const { data: existing } = await db()
    .from("leads")
    .select("telefone, google_place_id")
    .or(
      [
        phones.length ? `telefone.in.(${phones.map((p) => `"${p}"`).join(",")})` : null,
        `google_place_id.in.(${placeIds.map((p) => `"${p}"`).join(",")})`,
      ]
        .filter(Boolean)
        .join(",")
    );
  const existingPhones = new Set((existing ?? []).map((e) => e.telefone));
  const existingIds = new Set((existing ?? []).map((e) => e.google_place_id).filter(Boolean));

  const withDupe = results
    .map((r) => ({
      ...r,
      duplicado:
        (r.telefone != null && existingPhones.has(r.telefone)) ||
        existingIds.has(r.google_place_id),
    }))
    .sort((a, b) => b.score - a.score);

  return NextResponse.json({ results: withDupe, nextPageToken: data.nextPageToken ?? null });
});

/** Captação gratuita via OpenStreetMap (Overpass). Sem rating; sem paginação. */
async function searchViaOsm(nicho: string, cidade: string) {
  let places;
  try {
    places = await searchOsm(nicho, cidade);
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 502 });
  }

  const results = places.map((p) => {
    const telefone = p.telefone_raw ? normalizePhone(p.telefone_raw) : null;
    const temperatura = classifyWebsite(p.website);
    return {
      google_place_id: p.osm_id,
      nome: p.nome,
      telefone,
      endereco: p.endereco,
      cidade,
      nicho: String(nicho).toLowerCase(),
      rating: null as number | null,
      qtd_avaliacoes: 0,
      website: p.website,
      temperatura,
      score: computeScore(null, 0, temperatura),
      sem_telefone: !telefone,
    };
  });

  if (results.length === 0) {
    return NextResponse.json({
      results: [],
      nextPageToken: null,
      aviso:
        "Nada encontrado no OpenStreetMap para esse nicho/cidade. Tente outro termo (ex: 'advogado', 'dentista') ou importe via CSV.",
    });
  }

  const phones = results.map((r) => r.telefone).filter(Boolean) as string[];
  const placeIds = results.map((r) => r.google_place_id);
  const { data: existing } = await db()
    .from("leads")
    .select("telefone, google_place_id")
    .or(
      [
        phones.length ? `telefone.in.(${phones.map((p) => `"${p}"`).join(",")})` : null,
        `google_place_id.in.(${placeIds.map((p) => `"${p}"`).join(",")})`,
      ]
        .filter(Boolean)
        .join(",")
    );
  const existingPhones = new Set((existing ?? []).map((e) => e.telefone));
  const existingIds = new Set((existing ?? []).map((e) => e.google_place_id).filter(Boolean));

  const withDupe = results
    .map((r) => ({
      ...r,
      duplicado:
        (r.telefone != null && existingPhones.has(r.telefone)) ||
        existingIds.has(r.google_place_id),
    }))
    // com telefone primeiro, depois por score
    .sort((a, b) => Number(a.sem_telefone) - Number(b.sem_telefone) || b.score - a.score);

  return NextResponse.json({ results: withDupe, nextPageToken: null });
}
