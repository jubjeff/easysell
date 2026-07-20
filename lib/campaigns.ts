import { SupabaseClient } from "@supabase/supabase-js";
import { normalizeText } from "./text";

/**
 * Garante que cada combinação (nicho, cidade) em `leads` tenha uma campanha —
 * cria a que faltar, já com todos os templates ativos vinculados (pronta
 * para disparar). Comparação tolerante a acento/caixa, igual à usada para
 * montar a fila da sessão. Não duplica se já existir uma campanha (ativa ou
 * não) para o par.
 */
export async function ensureCampaigns(
  client: SupabaseClient,
  leads: { nicho: string; cidade: string }[]
): Promise<{ id: string; nome: string }[]> {
  const pares = new Map<string, { nicho: string; cidade: string }>();
  for (const l of leads) {
    const key = `${normalizeText(l.nicho)}|${normalizeText(l.cidade)}`;
    if (!pares.has(key)) pares.set(key, { nicho: l.nicho, cidade: l.cidade });
  }
  if (pares.size === 0) return [];

  const { data: existentes } = await client.from("campaigns").select("nicho, cidade");
  const existentesKeys = new Set(
    (existentes ?? []).map((c) => `${normalizeText(c.nicho)}|${normalizeText(c.cidade)}`)
  );
  const novas = Array.from(pares.entries()).filter(([key]) => !existentesKeys.has(key));
  if (novas.length === 0) return [];

  const { data: templatesAtivos } = await client.from("templates").select("id").eq("ativo", true);
  const templateIds = (templatesAtivos ?? []).map((t) => t.id);

  const criadas: { id: string; nome: string }[] = [];
  for (const [, { nicho, cidade }] of novas) {
    const nomeNicho = nicho.charAt(0).toUpperCase() + nicho.slice(1);
    const { data: campaign, error } = await client
      .from("campaigns")
      .insert({ nome: `${nomeNicho} — ${cidade}`, nicho, cidade })
      .select()
      .single();
    if (error || !campaign) continue;
    criadas.push(campaign);
    if (templateIds.length > 0) {
      await client
        .from("campaign_templates")
        .insert(templateIds.map((template_id) => ({ campaign_id: campaign.id, template_id })));
    }
  }
  return criadas;
}
