-- =====================================================================
--  MURAILLE — classement en ligne (Supabase)
--  À coller une seule fois dans Supabase : menu « SQL Editor » → « New query » → coller → « Run ».
-- =====================================================================

-- Tous les scores envoyés par les joueurs
create table if not exists public.scores (
  id       bigint generated always as identity primary key,
  pseudo   text        not null check (char_length(pseudo) between 1 and 16),
  duree    integer     not null check (duree between 1 and 21600),   -- secondes tenues (6 h max)
  vague    integer     not null check (vague between 1 and 500),
  plateau  text        not null default '' check (char_length(plateau) <= 120),
  cree_le  timestamptz not null default now()
);

-- Sécurité : n'importe qui peut lire et ajouter un score, personne ne peut modifier ni effacer
alter table public.scores enable row level security;
drop policy if exists "lecture publique" on public.scores;
drop policy if exists "ajout public" on public.scores;
create policy "lecture publique" on public.scores for select to anon using (true);
create policy "ajout public"     on public.scores for insert to anon with check (true);

-- Le classement : le meilleur score de chaque pseudo
create or replace view public.classement with (security_invoker = true) as
  select distinct on (lower(pseudo)) pseudo, duree, vague, plateau, cree_le
  from public.scores
  order by lower(pseudo), duree desc;
grant select on public.classement to anon;
