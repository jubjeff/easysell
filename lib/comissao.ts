import { db } from "./supabase";
import { CommissionRule, Lead, Profile } from "./types";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Resolve o percentual de comissão de uma venda:
 *  1. faixa específica do vendedor (commission_rules) que cubra o valor;
 *  2. senão, o % padrão do próprio vendedor (profiles.comissao_percentual);
 *  3. senão, a faixa da regra padrão (vendedor_id null).
 */
export async function resolveRate(vendedorId: string, valor: number): Promise<number> {
  const client = db();
  const { data: rules } = await client
    .from("commission_rules")
    .select("*")
    .or(`vendedor_id.eq.${vendedorId},vendedor_id.is.null`);

  const list = (rules ?? []) as CommissionRule[];
  const cobre = (r: CommissionRule) =>
    valor >= Number(r.valor_min) && (r.valor_max == null || valor <= Number(r.valor_max));

  const especifica = list.find((r) => r.vendedor_id === vendedorId && cobre(r));
  if (especifica) return Number(especifica.percentual);

  const { data: profile } = await client
    .from("profiles")
    .select("comissao_percentual")
    .eq("id", vendedorId)
    .maybeSingle();
  const flat = Number((profile as Partial<Profile>)?.comissao_percentual ?? 0);
  if (flat > 0) return flat;

  const padrao = list.find((r) => r.vendedor_id == null && cobre(r));
  return padrao ? Number(padrao.percentual) : 0;
}

/**
 * Mantém a comissão em sincronia com o estado do lead:
 *  - lead 'fechado' com valor_venda e dono → cria/atualiza a comissão;
 *  - saiu de fechado ou perdeu o valor → remove a comissão pendente
 *    (uma comissão já 'pago' é preservada — o dinheiro já mudou de mãos).
 */
export async function syncCommission(lead: Lead): Promise<void> {
  const client = db();
  const fechadoComValor =
    lead.stage === "fechado" && !!lead.vendedor_id && Number(lead.valor_venda) > 0;

  const { data: existing } = await client
    .from("commissions")
    .select("*")
    .eq("lead_id", lead.id)
    .maybeSingle();

  if (!fechadoComValor) {
    if (existing && existing.status !== "pago") {
      await client.from("commissions").delete().eq("lead_id", lead.id);
    }
    return;
  }

  const valor = Number(lead.valor_venda);
  const rate = await resolveRate(lead.vendedor_id!, valor);
  const valorComissao = round2((valor * rate) / 100);

  if (existing) {
    // preserva status/pago_em; só reajusta os valores
    await client
      .from("commissions")
      .update({ valor_venda: valor, percentual: rate, valor_comissao: valorComissao })
      .eq("lead_id", lead.id);
  } else {
    await client.from("commissions").insert({
      lead_id: lead.id,
      vendedor_id: lead.vendedor_id,
      valor_venda: valor,
      percentual: rate,
      valor_comissao: valorComissao,
      status: "a_pagar",
    });
  }
}
