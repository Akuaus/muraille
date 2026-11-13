-- =====================================================================
--  MURAILLE — classement du défi du jour (Supabase), ajouté le 13/11/2026
--  À coller une seule fois dans « SQL Editor » (après supabase.sql et avatar.sql).
--  Les scores de défi portent la date du défi (AAAA-MM-JJ) ; ils sont exclus du classement général.
-- =====================================================================
alter table public.scores add column if not exists defi text not null default ''
  check (defi ~ '^([0-9]{4}-[0-9]{2}-[0-9]{2})?$');

-- classement général : seulement les parties normales
create or replace view public.classement with (security_invoker = true) as
  select distinct on (lower(pseudo)) pseudo, duree, vague, plateau, cree_le, avatar
  from public.scores
  where defi = ''
  order by lower(pseudo), duree desc;
grant select on public.classement to anon;

-- classement de chaque défi du jour : meilleur temps de chaque joueur
create or replace view public.classement_defis with (security_invoker = true) as
  select distinct on (defi, lower(pseudo)) defi, pseudo, duree, vague, avatar, cree_le
  from public.scores
  where defi <> ''
  order by defi, lower(pseudo), duree desc;
grant select on public.classement_defis to anon;
