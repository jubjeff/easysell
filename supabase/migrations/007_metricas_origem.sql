-- ============================================================
-- EasySell / Tégui — Instagram Módulo 2: tempo até resposta por origem
-- Aditiva. `stage_changed_at` é sobrescrito a cada transição, então não dá
-- pra reconstruir "quando foi contactado" / "quando respondeu" depois que
-- o lead avança mais estágios. Estas 2 colunas gravam esses instantes uma
-- única vez (a primeira), preservando o dado para a métrica de performance
-- por canal (google/instagram/manual).
-- ============================================================

alter table leads add column if not exists contactado_em timestamptz;
alter table leads add column if not exists respondido_em timestamptz;

-- backfill com a melhor aproximação disponível hoje (stage_changed_at do
-- estado atual) — impreciso para leads que já passaram de estágio, mas
-- evita que o dashboard nasça vazio para quem já tem histórico
update leads set contactado_em = stage_changed_at
  where contactado_em is null and stage <> 'novo';

update leads set respondido_em = stage_changed_at
  where respondido_em is null
    and stage in ('respondeu', 'demo_enviada', 'negociacao', 'fechado');

create index if not exists leads_origem_metrica_idx on leads (origem, contactado_em, respondido_em);
