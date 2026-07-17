-- ============================================================
-- EasySell — schema completo
-- Cole este arquivo inteiro no SQL Editor do Supabase e execute.
-- ============================================================

-- ENUMS
create type lead_temp      as enum ('quente','morno','frio');
create type lead_stage     as enum ('novo','contactado','respondeu','demo_enviada','negociacao','fechado','perdido');
create type lead_source    as enum ('places','csv','manual');
create type session_status as enum ('ativa','pausada','encerrada','concluida');
create type session_type   as enum ('disparo','aquecimento');
create type queue_status   as enum ('pendente','enviado','numero_invalido','pulado');
create type msg_event      as enum ('gerada','regenerada','editada','copiada','enviado','numero_invalido','pulado');

-- 1. LEADS
create table leads (
  id                uuid primary key default gen_random_uuid(),
  google_place_id   text unique,
  nome              text not null,
  telefone          text not null,
  endereco          text,
  cidade            text not null,
  nicho             text not null,
  rating            numeric(2,1),
  qtd_avaliacoes    int default 0,
  website           text,
  temperatura       lead_temp not null default 'quente',
  score             int not null default 0,
  source            lead_source not null default 'places',
  stage             lead_stage not null default 'novo',
  stage_changed_at  timestamptz not null default now(),
  demo_url          text,
  valor_proposto    numeric(10,2),
  plano             text,
  motivo_perda      text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index leads_telefone_uq on leads (telefone);
create index leads_stage_idx  on leads (stage);
create index leads_filtro_idx on leads (nicho, cidade, stage);

-- 2. NOTAS
create table lead_notes (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references leads(id) on delete cascade,
  texto      text not null,
  created_at timestamptz not null default now()
);
create index lead_notes_lead_idx on lead_notes (lead_id, created_at desc);

-- 3. TEMPLATES
create table templates (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null,
  corpo        text not null,
  social_proof text,
  ativo        boolean not null default true,
  created_at   timestamptz not null default now()
);

-- 4. CAMPANHAS
create table campaigns (
  id                    uuid primary key default gen_random_uuid(),
  nome                  text not null,
  nicho                 text not null,
  cidade                text not null,
  limite_diario         int not null default 15,
  limiar_taxa_resposta  numeric(5,2) default 5.0,
  ativa                 boolean not null default true,
  created_at            timestamptz not null default now()
);

create table campaign_templates (
  campaign_id uuid references campaigns(id) on delete cascade,
  template_id uuid references templates(id) on delete cascade,
  primary key (campaign_id, template_id)
);

-- 5. CHIPS (números físicos usados para disparo/aquecimento)
create table chips (
  id                     uuid primary key default gen_random_uuid(),
  nome                   text not null,
  telefone               text,
  ativado_em             date not null default current_date,
  limite_diario_override int,
  ativo                  boolean not null default true,
  -- maturação (aquecimento guiado de chip novo, ~21 dias)
  maturando              boolean not null default false,
  maturacao_inicio       date,
  perfil_foto            boolean not null default false,
  perfil_nome            boolean not null default false,
  perfil_descricao       boolean not null default false,
  liberado_em            timestamptz,
  risco_ate              timestamptz,
  created_at             timestamptz not null default now()
);

-- 5b. REGISTRO DIÁRIO DE MATURAÇÃO (1 registro por dia de atividade)
create table maturation_days (
  id              uuid primary key default gen_random_uuid(),
  chip_id         uuid not null references chips(id) on delete cascade,
  dia             int not null,
  msgs_enviadas   int not null default 0,
  msgs_recebidas  int not null default 0,
  contatos_ativos int not null default 0,
  contatos_novos  int not null default 0,
  status_postado  boolean not null default false,
  bloqueios       int not null default 0,
  congelou        boolean not null default false,
  notas           text,
  created_at      timestamptz not null default now()
);
create index maturation_days_chip_idx on maturation_days (chip_id, created_at);

-- 6. SESSÕES DE DISPARO / AQUECIMENTO
create table dispatch_sessions (
  id               uuid primary key default gen_random_uuid(),
  campaign_id      uuid not null references campaigns(id),
  chip_id          uuid references chips(id),
  tipo             session_type not null default 'disparo',
  meta_do_dia      int not null,
  intervalo_min_s  int not null default 180,
  intervalo_max_s  int not null default 540,
  status           session_status not null default 'ativa',
  started_at       timestamptz not null default now(),
  ended_at         timestamptz
);

-- 7. FILA DO DIA
create table queue_items (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references dispatch_sessions(id) on delete cascade,
  lead_id      uuid not null references leads(id),
  template_id  uuid not null references templates(id),
  posicao      int not null,
  mensagem     text not null,
  msg_hash     text not null,
  editada      boolean not null default false,
  status       queue_status not null default 'pendente',
  resolved_at  timestamptz,
  unique (session_id, lead_id),
  unique (session_id, msg_hash)
);
create index queue_items_session_idx on queue_items (session_id, posicao);

-- 8. LOG DE MENSAGENS
create table message_logs (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references leads(id) on delete cascade,
  queue_item_id uuid references queue_items(id) on delete set null,
  campaign_id   uuid references campaigns(id),
  chip_id       uuid references chips(id),
  template_id   uuid references templates(id),
  evento        msg_event not null,
  texto         text not null,
  created_at    timestamptz not null default now()
);
create index msg_logs_lead_idx   on message_logs (lead_id, created_at);
create index msg_logs_metric_idx on message_logs (template_id, evento);
create index msg_logs_day_idx    on message_logs (evento, created_at);
create index msg_logs_chip_idx   on message_logs (chip_id, evento, created_at);

-- 9. NÚMEROS JÁ CONTACTADOS (registro permanente anti-duplicidade)
-- Uma vez que um telefone recebeu mensagem, ele nunca mais entra em fila,
-- mesmo que o lead seja excluído e reimportado. Nunca apagar desta tabela.
create table contacted_phones (
  telefone      text primary key,
  first_sent_at timestamptz not null default now()
);

-- 10. CONFIG (linha única, preferências globais)
create table settings (
  id                        int primary key default 1 check (id = 1),
  janela_inicio             time not null default '08:00',
  janela_fim                time not null default '18:00',
  dias_uteis                int[] not null default '{1,2,3,4,5}',
  som_ativado               boolean not null default true,
  volume                    numeric(3,2) not null default 0.8,
  aquecimento_limite_diario int not null default 5,
  maturacao_dias            int not null default 21
);

insert into settings (id) values (1);

-- ============================================================
-- SEED: templates iniciais (edite à vontade na tela Templates)
-- ============================================================
insert into templates (nome, corpo, social_proof) values
(
  'Demo primeiro — padrão',
  '{Oi|Olá|Opa}, {tudo bem|tudo certo|tudo bom}? Me chamo Jefferson, sou desenvolvedor aqui de Pernambuco. {Encontrei|Achei|Vi} o {nome_negocio} no Google e {notei|percebi|vi} que vocês ainda não têm um site próprio. {social_proof}Eu crio páginas profissionais para {nicho} — e antes de falar de qualquer valor, prefiro mostrar: posso montar uma demonstração gratuita de como ficaria o site de vocês, sem compromisso nenhum. {Posso enviar|Te mando|Envio} o link quando estiver pronta?',
  'Vi que vocês têm {rating}⭐ no Google com {qtd_avaliacoes} avaliações — {parabéns|muito bom|excelente}! '
),
(
  'Demo primeiro — curto',
  '{Oi|Olá}, {tudo bem|tudo certo}? Sou o Jefferson, desenvolvedor web. {Vi|Encontrei} o {nome_negocio} no Google e notei que falta um site para vocês em {cidade}. {social_proof}Faço o seguinte: monto uma demo gratuita de como ficaria, sem compromisso, e você decide se gosta. {Topa|Pode ser|Fechado}?',
  'Com {rating}⭐ e {qtd_avaliacoes} avaliações, um site ia converter muita gente que pesquisa por {nicho} na região. '
);
