import { createHash } from "crypto";
import { Lead, Template } from "./types";

/**
 * Resolve spin syntax {a|b|c} sorteando uma opção.
 * Blocos sem "|" (variáveis como {nome_negocio}) são preservados.
 */
export function resolveSpin(text: string): string {
  return text.replace(/\{([^{}]*\|[^{}]*)\}/g, (_, group: string) => {
    const options = group.split("|");
    return options[Math.floor(Math.random() * options.length)];
  });
}

/** Preenche as variáveis do template com dados do lead. */
function fillVariables(text: string, lead: Lead): string {
  return text
    .replaceAll("{nome_negocio}", lead.nome)
    .replaceAll("{cidade}", lead.cidade)
    .replaceAll("{nicho}", lead.nicho)
    .replaceAll("{rating}", lead.rating != null ? String(lead.rating) : "")
    .replaceAll("{qtd_avaliacoes}", String(lead.qtd_avaliacoes ?? 0));
}

/**
 * Gera a mensagem final: social_proof opcional (só entra se o lead tem
 * rating >= 4 e pelo menos 3 avaliações), variáveis preenchidas e spins
 * resolvidos por último para variar a cada chamada.
 */
export function generateMessage(template: Template, lead: Lead): string {
  let corpo = template.corpo;

  const temProva =
    lead.rating != null && lead.rating >= 4 && (lead.qtd_avaliacoes ?? 0) >= 3;
  const bloco = temProva && template.social_proof ? template.social_proof : "";
  corpo = corpo.replaceAll("{social_proof}", bloco);

  corpo = fillVariables(corpo, lead);
  corpo = resolveSpin(corpo);
  return corpo.replace(/[ \t]{2,}/g, " ").trim();
}

/** Hash da mensagem normalizada, para garantir unicidade na sessão. */
export function messageHash(msg: string): string {
  const norm = msg.toLowerCase().replace(/\s+/g, " ").trim();
  return createHash("sha256").update(norm).digest("hex").slice(0, 32);
}

/**
 * Gera mensagem única em relação a um conjunto de hashes já usados.
 * Re-sorteia os spins até `maxTries`; se ainda colidir, adiciona um
 * sufixo neutro variável para desempatar.
 */
export function generateUniqueMessage(
  template: Template,
  lead: Lead,
  usedHashes: Set<string>,
  maxTries = 10
): { mensagem: string; hash: string } {
  for (let i = 0; i < maxTries; i++) {
    const mensagem = generateMessage(template, lead);
    const hash = messageHash(mensagem);
    if (!usedHashes.has(hash)) return { mensagem, hash };
  }
  const sufixos = ["Abraço!", "Fico no aguardo!", "Qualquer coisa estou por aqui!", "Obrigado!"];
  for (const sufixo of sufixos) {
    const mensagem = generateMessage(template, lead) + " " + sufixo;
    const hash = messageHash(mensagem);
    if (!usedHashes.has(hash)) return { mensagem, hash };
  }
  // último recurso: nunca deve acontecer na prática
  const mensagem = generateMessage(template, lead) + " (ref " + Date.now() + ")";
  return { mensagem, hash: messageHash(mensagem) };
}
