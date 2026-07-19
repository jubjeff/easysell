-- ============================================================
-- EasySell / Tégui — 3 variantes de mensagem + primeiro_nome
-- ============================================================

-- 1. campo de personalização no lead (opcional; vazio = fallback "Olá")
alter table leads add column if not exists primeiro_nome text;

-- 2. identifica as 3 variantes canônicas
alter table templates add column if not exists variante text; -- 'A' | 'B' | 'C' | null

-- 3. semeia A/B/C só se ainda não existirem
insert into templates (nome, corpo, variante, ativo)
select * from (values
  ('A — Prova antes do pitch',
   '{saudacao}, vi as avaliações do {nome_negocio} no Google[[ ({rating} estrelas, {qtd_avaliacoes} pessoas)]] e reparei que quem chega até aí não encontra um site pra confirmar a confiança e chamar no WhatsApp.

Montei uma prévia de como ficaria a página de vocês, sem custo e sem compromisso. Posso te mandar o link pra você julgar? Se não gostar, é só ignorar.

— Jefferson, Tégui', 'A', true),
  ('B — Curiosidade / demo pronta',
   'Oi[[ Dr(a). {primeiro_nome}]], tudo certo? Encontrei o {nome_negocio} pesquisando {nicho} em {cidade} e a reputação de vocês chama atenção[[ ({rating} estrelas)]].

Como gostei do trabalho, já adiantei uma demo de site pra vocês. Queria só seu ok pra te enviar e ver o que acha. Levo 30 segundos do seu tempo.

Posso mandar?', 'B', true),
  ('C — Direto ao problema do cliente',
   '{saudacao}, uma pergunta rápida: quando alguém pesquisa "{nicho} em {cidade}" e encontra o {nome_negocio}, hoje cai direto no WhatsApp ou no Google, certo?

O problema é que muita gente pesquisa o nome, não acha um site e desiste no meio do caminho. Montei uma prévia de página pra resolver isso, gratuita. Te envio pra dar uma olhada?

— Jefferson, Tégui', 'C', true)
) as v(nome, corpo, variante, ativo)
where not exists (select 1 from templates where variante is not null);

-- 4. desativa os templates antigos (não apaga: campanhas referenciam)
update templates set ativo = false where variante is null;

-- 5. religa TODAS as campanhas para as 3 variantes A/B/C
delete from campaign_templates
where template_id in (select id from templates where variante is null);

insert into campaign_templates (campaign_id, template_id)
select c.id, t.id
from campaigns c
cross join templates t
where t.variante is not null
on conflict do nothing;
