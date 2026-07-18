-- ============================================================
-- EasySell / Tégui — RLS (Módulo A, passo final)
-- O app roda no servidor com a chave service_role, que IGNORA RLS.
-- Estas políticas protegem o acesso DIRETO via chave anon (pública):
-- sem elas, qualquer um com a anon key leria todas as tabelas.
-- ============================================================

-- helper: o usuário logado é admin?
create or replace function is_admin() returns boolean as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$ language sql security definer stable;

-- ---- tabelas com vendedor_id: dono ou admin ----
do $$
declare t text;
begin
  foreach t in array array['leads','chips','dispatch_sessions','message_logs','commissions','settings']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I_owner on %I', t, t);
    execute format($f$
      create policy %I_owner on %I for all to authenticated
        using (is_admin() or vendedor_id = auth.uid())
        with check (is_admin() or vendedor_id = auth.uid())
    $f$, t, t);
  end loop;
end $$;

-- ---- profiles: cada um lê o próprio; admin gerencia todos ----
alter table profiles enable row level security;
drop policy if exists profiles_read on profiles;
drop policy if exists profiles_admin on profiles;
create policy profiles_read on profiles for select to authenticated
  using (is_admin() or id = auth.uid());
create policy profiles_admin on profiles for all to authenticated
  using (is_admin()) with check (is_admin());

-- ---- commission_rules: vendedor lê a própria/padrão; admin gerencia ----
alter table commission_rules enable row level security;
drop policy if exists rules_read on commission_rules;
drop policy if exists rules_admin on commission_rules;
create policy rules_read on commission_rules for select to authenticated
  using (is_admin() or vendedor_id = auth.uid() or vendedor_id is null);
create policy rules_admin on commission_rules for all to authenticated
  using (is_admin()) with check (is_admin());

-- ---- config global (estratégia compartilhada): todo logado lê, admin escreve ----
do $$
declare t text;
begin
  foreach t in array array['campaigns','templates','campaign_templates','contacted_phones']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I_read on %I', t, t);
    execute format('drop policy if exists %I_write on %I', t, t);
    execute format('create policy %I_read on %I for select to authenticated using (true)', t, t);
    execute format($f$
      create policy %I_write on %I for all to authenticated
        using (is_admin()) with check (is_admin())
    $f$, t, t);
  end loop;
end $$;

-- ---- tabelas-filhas: herdam o dono via o pai ----
alter table lead_notes enable row level security;
drop policy if exists lead_notes_owner on lead_notes;
create policy lead_notes_owner on lead_notes for all to authenticated
  using (is_admin() or exists (
    select 1 from leads l where l.id = lead_notes.lead_id and l.vendedor_id = auth.uid()
  ))
  with check (is_admin() or exists (
    select 1 from leads l where l.id = lead_notes.lead_id and l.vendedor_id = auth.uid()
  ));

alter table queue_items enable row level security;
drop policy if exists queue_owner on queue_items;
create policy queue_owner on queue_items for all to authenticated
  using (is_admin() or exists (
    select 1 from dispatch_sessions s where s.id = queue_items.session_id and s.vendedor_id = auth.uid()
  ))
  with check (is_admin() or exists (
    select 1 from dispatch_sessions s where s.id = queue_items.session_id and s.vendedor_id = auth.uid()
  ));

alter table maturation_days enable row level security;
drop policy if exists maturation_owner on maturation_days;
create policy maturation_owner on maturation_days for all to authenticated
  using (is_admin() or exists (
    select 1 from chips c where c.id = maturation_days.chip_id and c.vendedor_id = auth.uid()
  ))
  with check (is_admin() or exists (
    select 1 from chips c where c.id = maturation_days.chip_id and c.vendedor_id = auth.uid()
  ));
