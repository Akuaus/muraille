# Brancher le classement mondial (Supabase)

Le jeu a déjà tout ce qu'il faut : il manque seulement un projet Supabase (gratuit) à créer **par vous**.
Environ 3 minutes.

1. **Créer le compte** : aller sur https://supabase.com → « Start your project » → se connecter (avec GitHub ou un e‑mail).
2. **Créer le projet** : « New project » → nom : `muraille` → choisir un mot de passe de base de données
   (gardez‑le pour vous, le jeu n'en a pas besoin) → région : *West EU (Paris)* ou la plus proche → « Create new project ».
   Attendre une minute que le projet soit prêt.
3. **Créer la table du classement** : menu de gauche « SQL Editor » → « New query » → coller tout le contenu du fichier
   `supabase.sql` (dans ce même dossier) → « Run ». Le message « Success » doit s'afficher.
4. **Récupérer les deux codes** : menu « Project Settings » (roue dentée) → « API » (ou « Data API ») :
   - **Project URL** (ressemble à `https://abcdefgh.supabase.co`)
   - la clé **anon public** (une longue suite de lettres commençant souvent par `eyJ…`).
5. **Me les donner** dans la conversation, ou les coller vous‑même en haut de la section *CLASSEMENT DES JOUEURS* de
   `src/main.js` :
   ```js
   const CLASSEMENT = {
     url: 'https://abcdefgh.supabase.co',
     cle: 'eyJ…',
   };
   ```

La clé « anon public » est faite pour être dans le jeu : avec le script `supabase.sql`, la base n'autorise que **lire**
le classement et **ajouter** un score (impossible de modifier ou d'effacer). Ne donnez jamais la clé « service_role ».

Limite à connaître : comme dans tout jeu sans compte joueur, un tricheur habile pourrait envoyer un faux score.
On pourra ajouter des garde‑fous plus tard si le classement devient populaire (supprimer un score se fait depuis
Supabase → « Table Editor » → `scores`).
