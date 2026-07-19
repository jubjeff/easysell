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

/** Valor de uma variável para o lead. "" = ausente (dispara fallback). */
function varValue(name: string, lead: Lead, vendedorNome = ""): string {
  switch (name) {
    case "nome_negocio":
      return lead.nome ?? "";
    case "primeiro_nome":
      return (lead.primeiro_nome ?? "").trim();
    case "cidade":
      return lead.cidade ?? "";
    case "nicho":
      return lead.nicho ?? "";
    case "rating":
      return lead.rating != null ? String(lead.rating) : "";
    case "qtd_avaliacoes":
      return lead.qtd_avaliacoes ? String(lead.qtd_avaliacoes) : "";
    case "vendedor_nome":
      return vendedorNome ?? "";
    default:
      return "";
  }
}

const KNOWN_VARS = [
  "nome_negocio",
  "primeiro_nome",
  "cidade",
  "nicho",
  "rating",
  "qtd_avaliacoes",
  "vendedor_nome",
];

/** Blocos [[ ... ]] só sobrevivem se TODAS as variáveis internas existirem. */
function resolveConditionalBlocks(text: string, lead: Lead, vendedorNome: string): string {
  return text.replace(/\[\[([\s\S]*?)\]\]/g, (_, inner: string) => {
    const vars = Array.from(inner.matchAll(/\{(\w+)\}/g)).map((m) => m[1]);
    const todasPresentes = vars.every((v) => varValue(v, lead, vendedorNome) !== "");
    return todasPresentes ? inner : "";
  });
}

/** Preenche {var} conhecidas; deixa {a|b} (spintax) e {desconhecidas} intactas. */
function fillVariables(text: string, lead: Lead, vendedorNome = ""): string {
  return text.replace(/\{(\w+)\}/g, (m, name: string) =>
    KNOWN_VARS.includes(name) ? varValue(name, lead, vendedorNome) : m
  );
}

/** Limpeza final: garante que nada quebre por variável removida. */
function cleanup(s: string): string {
  return s
    .replace(/[ \t]{2,}/g, " ") // espaço duplo
    .replace(/ +([,.;:!?])/g, "$1") // espaço antes de pontuação
    .replace(/,\s*,/g, ",") // vírgula órfã ", ,"
    .replace(/\(\s*\)/g, "") // parêntese vazio "()"
    .replace(/ +\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Gera a mensagem final. Suporta:
 *  - {saudacao}: "Dr(a). <primeiro_nome>" com nome, ou "Olá" sem nome;
 *  - blocos [[ ... ]]: somem inteiros se qualquer variável interna faltar
 *    (ex: cláusula de rating/avaliações);
 *  - {social_proof} legado (templates antigos);
 *  - spintax {a|b}.
 */
export function generateMessage(template: Template, lead: Lead, vendedorNome = ""): string {
  let corpo = template.corpo;

  // 1. saudação adaptativa (com/sem primeiro_nome)
  const primeiro = (lead.primeiro_nome ?? "").trim();
  corpo = corpo.replaceAll("{saudacao}", primeiro ? `Dr(a). ${primeiro}` : "Olá");

  // 2. blocos condicionais — avaliados ANTES de preencher as variáveis
  corpo = resolveConditionalBlocks(corpo, lead, vendedorNome);

  // 3. social_proof legado (compat com templates antigos)
  const temProva = lead.rating != null && lead.rating >= 4 && (lead.qtd_avaliacoes ?? 0) >= 3;
  corpo = corpo.replaceAll("{social_proof}", temProva && template.social_proof ? template.social_proof : "");

  // 4. variáveis restantes
  corpo = fillVariables(corpo, lead, vendedorNome);

  // 5. spintax {a|b}
  corpo = resolveSpin(corpo);

  // 6. limpeza
  return cleanup(corpo);
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
  maxTries = 10,
  vendedorNome = ""
): { mensagem: string; hash: string } {
  for (let i = 0; i < maxTries; i++) {
    const mensagem = generateMessage(template, lead, vendedorNome);
    const hash = messageHash(mensagem);
    if (!usedHashes.has(hash)) return { mensagem, hash };
  }
  const sufixos = ["Abraço!", "Fico no aguardo!", "Qualquer coisa estou por aqui!", "Obrigado!"];
  for (const sufixo of sufixos) {
    const mensagem = generateMessage(template, lead, vendedorNome) + " " + sufixo;
    const hash = messageHash(mensagem);
    if (!usedHashes.has(hash)) return { mensagem, hash };
  }
  // último recurso: nunca deve acontecer na prática
  const mensagem = generateMessage(template, lead, vendedorNome) + " (ref " + Date.now() + ")";
  return { mensagem, hash: messageHash(mensagem) };
}
