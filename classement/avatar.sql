-- =====================================================================
--  MURAILLE — avatar des joueurs dans le classement (Supabase), ajouté le 12/11/2026
--  À coller une seule fois dans « SQL Editor » (après supabase.sql). Sans effet sur les scores existants.
-- =====================================================================
alter table public.scores add column if not exists avatar text not null default ''
  check (avatar ~ '^[a-z]{0,20}$');

-- la vue du classement montre aussi l'avatar (celui de la meilleure partie de chaque joueur)
create or replace view public.classement with (security_invoker = true) as
  select distinct on (lower(pseudo)) pseudo, duree, vague, plateau, cree_le, avatar
  from public.scores
  order by lower(pseudo), duree desc;
grant select on public.classement to anon;
