// Captação gratuita via OpenStreetMap (Overpass API) — sem chave, sem cartão.
// Limitações: sem rating/avaliações e cobertura de telefone menor que o Google.

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

/** Mapeia nichos comuns (PT-BR) para tags OSM. */
const NICHE_TAGS: Record<string, string[]> = {
  advogado: ['["office"="lawyer"]'],
  advocacia: ['["office"="lawyer"]'],
  oficina: ['["shop"="car_repair"]'],
  mecanica: ['["shop"="car_repair"]'],
  "oficina mecanica": ['["shop"="car_repair"]'],
  psicologo: ['["healthcare"="psychotherapist"]', '["office"="psychologist"]'],
  psicologa: ['["healthcare"="psychotherapist"]', '["office"="psychologist"]'],
  dentista: ['["amenity"="dentist"]'],
  clinica: ['["amenity"="clinic"]'],
  restaurante: ['["amenity"="restaurant"]'],
  lanchonete: ['["amenity"="fast_food"]'],
  barbearia: ['["shop"="hairdresser"]'],
  salao: ['["shop"="hairdresser"]', '["shop"="beauty"]'],
  "salao de beleza": ['["shop"="hairdresser"]', '["shop"="beauty"]'],
  academia: ['["leisure"="fitness_centre"]'],
  petshop: ['["shop"="pet"]'],
  veterinario: ['["amenity"="veterinary"]'],
  imobiliaria: ['["office"="estate_agent"]'],
  contador: ['["office"="accountant"]'],
  contabilidade: ['["office"="accountant"]'],
  padaria: ['["shop"="bakery"]'],
  farmacia: ['["amenity"="pharmacy"]'],
  hotel: ['["tourism"="hotel"]'],
  pousada: ['["tourism"="guest_house"]', '["tourism"="hotel"]'],
  "loja de roupas": ['["shop"="clothes"]'],
  otica: ['["shop"="optician"]'],
  autoescola: ['["amenity"="driving_school"]'],
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

export interface OsmPlace {
  osm_id: string;
  nome: string;
  telefone_raw: string | null;
  endereco: string | null;
  website: string | null;
}

/**
 * Busca negócios de um nicho numa cidade via Overpass.
 * Nichos mapeados usam tags OSM; desconhecidos caem em busca por nome.
 */
export async function searchOsm(nicho: string, cidade: string): Promise<OsmPlace[]> {
  const key = normalize(nicho);
  const tagFilters = NICHE_TAGS[key];
  // regex escapado para busca por nome quando o nicho não está mapeado
  const nameRegex = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const selectors = tagFilters
    ? tagFilters.map((t) => `nwr${t}(area.cidade);`).join("\n")
    : `nwr["name"~"${nameRegex}",i]["type"!="route"](area.cidade);`;

  const query = `
[out:json][timeout:40];
area["name"="${cidade.replace(/"/g, "")}"]["boundary"="administrative"]->.cidade;
(
${selectors}
);
out tags center 120;
`;

  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "EasySell/1.0 (uso pessoal, prospeccao local)",
    },
    body: "data=" + encodeURIComponent(query),
  });
  if (!res.ok) {
    throw new Error(`Overpass retornou ${res.status} — tente de novo em alguns segundos.`);
  }
  const data = await res.json();
  const elements: any[] = data.elements ?? [];

  const seen = new Set<string>();
  const places: OsmPlace[] = [];
  for (const el of elements) {
    const t = el.tags ?? {};
    const nome = t.name;
    if (!nome) continue;
    const id = `osm:${el.type}/${el.id}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const telefone =
      t.phone || t["contact:phone"] || t["contact:mobile"] || t["contact:whatsapp"] || null;
    const website = t.website || t["contact:website"] || t["contact:instagram"] || null;
    const endereco =
      [t["addr:street"], t["addr:housenumber"], t["addr:suburb"]]
        .filter(Boolean)
        .join(", ") || null;

    places.push({ osm_id: id, nome, telefone_raw: telefone, endereco, website });
  }
  return places;
}
