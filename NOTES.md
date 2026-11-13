# Muraille

## Concept
Défense de muraille en survie infinie, format portrait (720 × 960).
Les monstres descendent un chemin sinueux vers la muraille ; sous la muraille,
le village (cartes sur un socle d'encre) se développe avec l'encre récoltée.
Pure gestion : les troupes tirent seules.
Monnaie = **gouttes d'encre** : chaque monstre abattu se liquéfie en encre ; la mine extrait de la pierre d'encre.

## Direction artistique (lavis d'encre / sumi-e, accents rouges)
Référence : maquette fournie (chemin aux bords d'encre, montagnes, bambous, pruniers en fleur,
silhouettes noires, muraille à pavillon, bannières rouges, braseros, cartes parchemin sur socle noir).
- Décor pré-dessiné une fois : papier, bords du chemin (doubles traits interrompus), montagnes en lavis,
  bambous, pruniers aux fleurs rouges, herbes, cailloux
- Outil `pinceau()` : coup à largeur variable + option « pinceau sec ». Sert partout (bords, bandeaux, socle…)
- Monstres : planches dessinées (voir « Sprites dessinés »), ombre lavée, barre de vie rouge.
  Secours si une image manque : silhouettes noires dessinées par le code.
- Mort : la silhouette s'affaisse dans une mare d'encre et coule ; éclaboussures étirées ; flaque à bord sombre.
  Les taches s'accumulent sur un calque qui pâlit lentement.
- Muraille incurvée : pierres, créneaux à losange, pavillon de porte à toit relevé, bannières à spirale,
  drapeaux qui flottent, braseros animés, archers en silhouette (3 variantes de coiffe)
- HUD en traînées de pinceau : « Vague N », encre, temps, engrenage (pause)
- **Profondeur de la vallée** (perspective atmosphérique façon lavis : le lointain pâlit dans la brume) :
  - le chemin se resserre fortement vers le haut (`cheminDemi` : 70 px de demi-largeur à l'horizon → 340 au mur)
  - deux chaînes de montagnes très pâles ferment la vallée ; une brume couleur papier (`brumeHorizon`) recouvre
    le haut du champ et dérive doucement
  - les monstres apparaissent à l'horizon (`Y_HORIZON`) et émergent de la brume ; leur taille suit
    `perspective(y)` (×0,5 au loin → ×1 au pied du mur), tout comme leur ombre, leur barre de vie et leur flaque
  - leur vitesse à l'écran suit la même échelle (lents au loin, rapides près du mur) ; `COMPENSATION_PROFONDEUR`
    = 1,27 garde exactement les anciens temps de trajet (gobelin 15 s, orc 23 s, troll 46 s)
  - les flèches visent le centre apparent du corps (`centreY`)
- **Inclinaison de la caméra** (`INCLINAISONS` en haut de main.js) : 0 = vue plongeante,
  1 = penchée, **2 = très penchée (choisie, `INCLINAISON_DEFAUT`)**. Test sans toucher au code : `index.html?inclinaison=1`.
  - penchée : horizon à y = 120 / 210, ciel lavé avec soleil rouge et nuages au pinceau sec, montagnes posées
    sur l'horizon, bande de brume à leur pied, chemin qui se resserre presque en point de fuite
- **Cycle jour / nuit** : `CYCLE` = jour 100 s → crépuscule 30 s → nuit 80 s → aube 30 s
  (240 s = 2 hordes), `niveauNuit(t)` de 0 à 1. `index.html?moment=nuit` force la nuit.
  - **Nuits dures** (`NUIT_EFFETS`, proportionnels à l'obscurité) : +70 % de monstres, portée des archers −25 %,
    butin +15 % ; +3 cristaux à l'aube si la nuit a été traversée. Bannières « La nuit tombe… » / « L'aube se lève ».
    Rappel des effets sous le HUD la nuit (texte clair sur le ciel sombre).
  - Simulation (IA naïve, 6 parties) : durée moyenne inchangée (~26-29 min) mais 4 parties sur 6 se terminent
    **pendant une nuit** ; +100 % de monstres était trop brutal (mort dès la 1re nuit, ~4 min)
  - couches : le fond de jour (soleil rouge) ; `cielNuit` (encre bleu nuit + nuages) en fondu par-dessus ;
    `astresNuit` (étoiles, lune et halo) posés après la teinte pour rester lumineux ; les deux sont découpés par
    `masque` (silhouettes des montagnes de l'horizon + sol), donc toujours derrière les montagnes
  - `teinteVallee(n)` multiplie la vallée et la muraille : orangé doux au crépuscule/à l'aube (concentré vers le
    ciel, estompé vers la muraille), bleu de lune uniforme la nuit
  - halos chauds des braseros proportionnels à la nuit ; la branche de prunier du haut est au premier plan
    (`premierPlan`) pour rester devant le ciel de nuit
  - HUD : soleil rouge à côté du temps, qui se fond en croissant de lune la nuit
  - l'interface (cartes, HUD, PV) n'est pas teintée, pour rester lisible
  - les montagnes de l'horizon ont un fond papier opaque (`montagne(..., masque = true)`) : elles cachent le
    soleil et les chaînes plus lointaines au lieu de les laisser transparaître
  - même temps de trajet à toutes les inclinaisons (compensation calculée) ; la portée des archers est exprimée
    en part du trajet (`PORTEE_PART_TRAJET` = 0,55), donc un gobelin reste ~8 s à portée quelle que soit la caméra

## Calligraphie (polices)
- Deux polices libres embarquées dans `assets/polices/` (téléchargées depuis le dépôt officiel Google Fonts, licences
  à côté) : **Pinceau** = Permanent Marker (Apache 2.0, 75 Ko) pour titres, boutons, chiffres (`SANS`) ;
  **Plume** = Caveat Brush (OFL, 296 Ko) pour les textes manuscrits, ex-italiques (`SERIF`).
- `fonte(style, taille, police)` : pas de faux gras sur le pinceau (taille × 0,94), pas de faux italique sur la plume
  (taille × 1,18). Utilisée par `texte()`, `lignesDe()` et les quelques réglages directs ; noms de cartes réduits s'ils débordent.
- `index.html` déclare les polices (@font-face, préchargées) et n'ajoute les scripts du jeu qu'une fois les polices
  prêtes (au plus 2,5 s), sinon les images dessinées au démarrage (cartes…) garderaient la police de secours.
  En ouvrant `index.html` directement (file://), le navigateur peut refuser les polices : polices de secours.

## Sprites dessinés (assets/)
- **Archers impériaux (12/11/2026)** : quand le **Temple** est choisi et au **niveau max (5)**, les archers prennent
  l'apparence impériale (casque à plumet rouge, tunique blanche) et leurs flèches font **+50 %** de dégâts
  (`archersImperiaux`, `IMPERIAL.bonus` ; bannière « Archers impériaux » ; annoncé dans la fiche du Temple dès le
  niveau 4). Planches du joueur `assets/archer-imperial-droite.webp` / `-gauche.webp` (8 × 3 images sur fond magenta,
  originaux dans `sources/`), détourées au chargement (`preparerImperial` : magenta → transparent, bords → encre ;
  pieds et hauteur mesurés image par image). Même orientation que l'archer de base : planche « droite » si la cible est
  à droite, « gauche » sinon ; ligne 0 image 7 = visée, ligne 1 = tir (l'image où la flèche part, repérée
  automatiquement, tombe au moment du lâcher), ligne 2 = repos (aller-retour). Ses planches tirant à l'horizontale, le
  haut du corps se penche vers la cible (un tiers de l'angle de visée de l'archer de base, pivot à la taille).
- `assets/sources/archer-planche.webp` : planche d'origine (fond magenta, 8 × 4)
- `assets/archer.png` : version détourée et réduite (cases de 112 px, fond transparent), utilisée par le jeu
  - ligne 0 : visée à droite (45° → vertical) · ligne 1 : tir à droite (lâcher en image 3)
  - ligne 2 : visée à gauche (vertical → 45°) · ligne 3 : tir à gauche (lâcher en image 0)
- L'archer se tourne vers sa cible, incline son arc selon l'angle, et la flèche part au lâcher (0,45 s de tir)
- `assets/sources/archer-attente-planche.webp` → `assets/archer-attente.png` : boucle d'attente (8 images,
  ligne du milieu, cases 120 × 107, échelle 0,5 pour égaler la hauteur des archers qui tirent — le corps
  y fait ~72 px contre ~59 px dans la planche de tir), jouée à 6 images/s quand aucun ennemi n'est à portée ;
  décalée d'un archer à l'autre, retournée selon le dernier côté visé
- Si l'image manque, le jeu revient aux archers dessinés par le code
- `assets/sources/gobelin-planche.webp` → `assets/gobelin.png` (cases de 120 × 80)
  - ligne 0 : marche · ligne 1 : attaque (au contact de la muraille) · ligne 2 : coup encaissé (images 1-3 quand il est touché)
  - ligne 3 : mort (effondrement en flaque), jouée pendant la fonte, au-dessus de la mare d'encre
- `assets/sources/orc-planche.webp` → `assets/orc.png` (cases de 120 × 80, échelle 0,74 : plus massifs que les gobelins)
  - même disposition ; `nettoyer` efface les débordements entre cases (hache levée de l'attaque qui mord sur
    la ligne de marche, coup de lame qui descend sur la ligne du dessous)
- `assets/sources/rodeur-planche.webp` → `assets/rodeur.png` (cases de 120 × 80, échelle 0,55 → ~30 px)
  - course rapide (le défilement suit la vitesse), attaque aux deux lames ; `nettoyer` efface les coups de
    lame qui débordent sur la gauche des images d'attaque 5 et 6
- `assets/sources/bouclier-planche.webp` → `assets/bouclier.png` (cases de 120 × 80, échelle 0,7, gabarit de l'orc)
  - bouclier de bois brun (seule couleur parmi les silhouettes, ce qui aide à repérer qui résiste aux flèches) ;
    `nettoyer` efface les débordements à gauche des images d'attaque 5 et 6
- `assets/sources/troll-planche.webp` → `assets/troll.png` (cases de 160 × 107, échelle 0,7 → ~60 px de haut)
  - attaque à la massue, rugissement quand il est touché ; `nettoyer` efface les coups qui débordent
    sur la gauche des cases voisines (attaque 4-6, touché 4)
- `assets/sources/chef-planche.webp` → `assets/chef.png` (8 × **5** lignes, cases de 160 × 91, échelle 0,92 → ~75 px)
  - lignes : marche · attaque à la hache · touché (0-3) · **rugissement** · mort ; `lignes` dans la config
    associe chaque rôle à sa ligne (les autres monstres utilisent l'ordre par défaut)
  - le chef rugit 1,4 s en atteignant la muraille (`CRI_DUREE`), puis frappe
  - lignes de hauteurs irrégulières dans l'original : découpées par **bandes** (bords y = 0, 139, 280, 417, 547, 667)
    et alignées par les pieds ; les colonnes de l'original dérivent de ~3,5 px par image → `centres` donne le
    centre du corps de chaque image (mesuré) pour qu'il ne tremble pas
- Pose « touché » : au plus une fois toutes les 1 à 1,5 s par monstre (sinon un monstre résistant sous le tir
  de nombreux archers restait figé dans cette pose)
- **Corbeaux** (décor, sans effet sur le jeu) : `assets/sources/corbeau-gauche-planche.webp` et
  `corbeau-droite-planche.webp` (fond **clair**, pas magenta) → `assets/corbeau-gauche.png` / `corbeau-droite.png`
  (8 battements, cases 120 × 147)
  - détourage par l'assombrissement par rapport au papier (l'alpha vient de la luminosité)
  - un corbeau seul ou un vol de 2-3 passe toutes les 14 à 32 s (`CORBEAU`), de gauche à droite ou l'inverse,
    entre y = 70 et 430 ; plus petits au loin ; passent devant la brume, derrière la muraille
  - opacité selon la distance au chemin : presque noirs au-dessus (0,8 à 0,95), transition douce, invisibles
    vers les bords de l'écran (ils « sortent » du décor en s'effaçant)
- Tous les monstres utilisent désormais une planche dessinée ; les silhouettes du code ne servent plus que de
  secours si une image manque
- ⚠ Les simulations lancées dans la page écrivent le record (localStorage `muraille-record`) si la partie
  dépasse le record : penser à le restaurer après un test
- Les monstres au contact du mur sont dessinés par-dessus la muraille (sinon le pavillon les cachait)
- Système générique `PLANCHES_MONSTRES` dans main.js : pour un nouveau monstre, ajouter une entrée
  (image, taille des cases, échelle, hauteur du corps, position des pieds par ligne) avec la même disposition
  des 4 lignes. Les monstres sans planche gardent leur silhouette dessinée par le code.
- Les monstres s'arrêtent `ARRET_MUR` = 22 px avant le haut du mur pour rester visibles devant les créneaux
- Pour détourer une nouvelle planche sur fond magenta : script PowerShell utilisé =
  alpha estimé par la « magentitude » (min(R,B) − V), puis retrait de la couleur de fond mélangée ;
  le refaire de la même façon pour les prochaines planches (monstres, etc.).
  Si les lignes ne sont pas régulières : tracer le profil vertical des pixels opaques, couper aux creux,
  aligner chaque bande par le bas.
- **Catapultes** : `assets/sources/catapulte-planche.webp` (fond crème) → `assets/catapulte.png`, 8 images de
  250 × 360 (roues vers (125, 345)), échelle 0,3. Détourage : remplissage du fond clair depuis les bords (l'intérieur
  du bouclier reste opaque), bords adoucis selon la noirceur ; le boulet en vol de la 6ᵉ image a été effacé (le jeu
  dessine son propre projectile). Script : PowerShell + WPF (`Detour.Run`), seuil de luminosité 200.
  - Placées **dans la cour**, au pied de la muraille côté village (`PLACE_CATAPULTES = 'cour'`, postes
    `POSTES_CATAS_COUR` = 72 / 648 / 132 / 588 px, de part et d'autre des étendards) : elles tirent par-dessus le mur.
    Variante `'parapet'` (base cachée par le mur) essayée : seuls les fanions dépassaient, moins lisible.
  - Tir animé : l'image 0 au repos, puis 8 images à 14 i/s ; le boulet part du bout du bras à l'image 4
    (`PLANCHE_CATA.bras`) ; la visée anticipe ce délai.
- **Muraille qui se renforce** : son apparence suit ses améliorations — `niveauMur()` = niveaux de Maçonnerie +
  « Pierres de taille » ÷ 2 + prestige de Maçonnerie (max 5). Ajouts cumulatifs dessinés sur `murTex`
  (`murTexNiveau`) : 1 bandeau de grosses pierres claires · 2 contreforts (x 44, 118, 602, 676) · 3 bande de fer
  cloutée sous le chemin de ronde · 4 créneaux laqués de rouge · 5 blasons dorés sur les contreforts + liseré d'or.
  Les 5 états de dégâts sont refaits pour chaque niveau (`etatsMurNiveau`, au premier besoin) : les brèches percent
  aussi les renforts. Éclair blanc quand la muraille change de niveau.
- **Muraille qui se dégrade** (la planche dessinée `assets/muraille.png` a été essayée puis abandonnée : son style
  ne collait pas au reste ; l'ancienne muraille dessinée par le code est revenue, haut du mur incurvé compris).
  `ETATS_MUR` : 5 états prérendus au chargement à partir de `murTex`, dans le même style d'encre, choisis par
  `etatMur()` selon les PV. Dégâts cumulatifs, tirés une fois pour toutes (graine fixe : toujours les mêmes) :
  - 1 (< 80 % PV) : 6 pierres éclatées (creux sombres) ;
  - 2 (< 60 %) : 7 trous, 2 petites brèches, premiers gravats au pied ;
  - 3 (< 40 %) : grands trous, 3 brèches, traces de suie, bannière de gauche déchirée ;
  - 4 (< 20 %) : **brèches béantes tout le long de la muraille** (x 62, 128, 248, 472, 592, 658), gravats, suie.
  Tout reste **au milieu de la face** : le haut du mur (chemin de ronde, créneaux) où se tiennent les archers n'est
  jamais abîmé (demande du joueur). Une brèche = face crevée : intérieur sombre du mur, bord d'encre ébréché,
  moellons au fond. Les dégâts évitent les bannières et le centre (pavillon, barre de vie), sauf la déchirure de bannière.
  Les fissures continues s'ajoutent par-dessus.
  La barre de vie reste à sa place, sur la face du mur.
- **Pavillon de la porte (le « château » au centre)** : sorti de `murTex`, dessiné à part (`PAVILLON`, toile 240 × 118,
  `dessinerPavillonBase`). Il se fissure selon les PV, comme la muraille (`ETATS_PAVILLON`, 5 états cumulatifs) :
  1 socle fendu, tuile du toit tombée · 2 lézardes dans la salle et le socle, faîte ébréché · 3 corne gauche du toit
  cassée, longues lézardes, suie · 4 pan droit du toit arraché, sceau rouge fendu, socle effrité.
  **À 0 PV, il s'effondre** (`G.effondrement`, `majEffondrement`) : pendant 1,5 s il bascule et s'enfonce derrière le
  chemin de ronde, la toile tremble, un nuage de poussière d'encre monte et un tas de décombres (`RUINES_PAVILLON`)
  le remplace ; l'écran de fin arrive à 2,4 s. Pendant la chute, le jeu est figé (temps, monstres) et clics et touches
  sont ignorés ; le record est enregistré dès 0 PV.
- **Château (pavillon) dessiné** : `assets/pavillon.webp` (copie de `sources/pavillon-planche.webp`, fond crème), 6 images
  en 2 rangées de 3 : intact, fissuré, lézardé, très abîmé, toit qui s'écroule, décombres. Échelle 0,42, posé au
  centre du mur (y = MUR_Y − 5). Préparé au chargement (`preparerPavillon`) : fond = couleur des coins, retiré par
  remplissage depuis les bords (écart ≤ 16), bords adoucis ; chaque image recalée sur le milieu de sa ligne de sol.
  PV → image (`PAVILLON_SPRITE.etats`) : > 80 % intact, > 60 % fissuré, > 40 % lézardé, sinon très abîmé.
  À 0 PV : très abîmé → écroulement (0,35 s) → décombres (1,05 s), avec de courts fondus ; poussière d'encre légère
  et tremblement par-dessus ; écran de fin à 2,4 s. Le pavillon dessiné par le code (`ETATS_PAVILLON`) reste en secours.
- **Dragon de la Pagode** : `assets/dragon.webp` (copie de `sources/dragon-planche.webp`, fond **magenta**), 8 battements
  d'ailes tournés vers la droite, 11 i/s, échelle 0,9 × profondeur (min 0,8). Préparé au chargement (`preparerDragon`) :
  alpha selon la magentitude (min(R,B) − V), magenta retiré des bords, puis liseré violet neutralisé (excès de rouge +
  bleu ôté). Chaque image est recalée sur le bout du museau (bord droit, hauteur du corps y 330 de la planche) : c'est
  le point qui frappe la rangée. Retourné quand il vole vers la gauche ; léger sillage d'encre derrière lui.
  L'ancien dragon au pinceau reste en secours si l'image ne charge pas.
- **Drapeaux du haut de la muraille** : `assets/drapeau.webp` = planche détaillée (`sources/drapeau-detaille-planche.webp`,
  fond crème, 3 rangées × 9 = 27 images ; l'ancienne planche à fond noir est `sources/drapeau-planche.webp`).
  12 i/s, échelle 0,33, aux deux bouts du mur (x 30 et 690) ; celui de droite en miroir (il flotte vers l'intérieur),
  décalé de 11 images pour ne pas onduler en même temps. Préparés au chargement (`preparerDrapeaux`) :
  - fond relié aux bords rendu transparent (la pierre, enfermée dans son contour, reste opaque), bords adoucis ;
  - chaque image ne garde que les pixels reliés à sa hampe (des pointes débordent dans la case voisine) ;
  - **la pierre ne bouge pas** : prise une fois sur la 1re image (24 px du bas) ; chaque image n'apporte que la
    hampe et le tissu, recalés sur le pied de la hampe (milieu des pixels opaques juste au-dessus de la pierre).
- **Balistes** : `assets/sources/baliste-planche.webp` → `assets/baliste.png`, 8 images de 250 × 420, échelle 0,28,
  dans la cour aux mêmes postes que les catapultes. Les images ne sont pas centrées pareil dans leurs cases : le x des
  pieds est mesuré image par image (`PLANCHE_BALISTE.piedsX`), bas des roues à 377. Tir : image 0 armée, 8 images à
  14 i/s, le carreau part à l'image 4 (`bout`) vers la cible du moment ; le carreau en vol de l'image 6 a été effacé.
  Les carreaux sont dessinés par-dessus le mur et ne disparaissent qu'en redescendant sous la muraille.
  Détourage (`detour3.ps1`) : comme les samouraïs, plus les grandes zones claires enfermées (≥ 700 px) et une zone
  effacée à la main (`-effacer`).
- **Samouraïs** (Dojo) : 3 planches à fond crème (`assets/sources/samourai-*-planche.webp`) →
  - `assets/samourai-dos.png` : 8 images 250 × 460 vu de dos (garde, puis frappe verticale), pieds (130, 428), échelle 0,18 ;
  - `assets/samourai-gauche.png` / `samourai-droite.png` : 3 rangées × 8 images 250 × 222,67 (attente, marche,
    frappe de côté), échelle 0,3 ; pieds mesurés par rangée (`PLANCHES_SAMOURAI`).
  - En jeu : en garde = image 0 de dos (face à la vallée) ; en déplacement = marche de profil ; frappe = 8 images
    sur 0,5 s (`SAMOURAI_COUP`), de dos si le monstre est devant, de profil s'il est sur le côté.
  - Samouraïs et monstres qu'ils retiennent sont dessinés au premier plan (avec les monstres au mur), sinon le
    pavillon cachait ceux du centre.
  - Détourage (`detour2.ps1`) : en plus du fond relié aux bords, les zones claires enfermées qui descendent jusqu'à la
    ligne des pieds (entre les jambes) deviennent transparentes ; sangles et ceinture restent blanches. Il reste deux
    petites taches crème entre les bras levés (frappe de côté, images 4-5), invisibles à l'échelle du jeu.

## Musique
- `musique/combat.js` : musique de combat **entièrement synthétisée** (Web Audio, aucun fichier son) — ré mineur,
  gamme hirajoshi, 112 bpm ; taiko, shime, gong, koto (Karplus-Strong), flûte façon shakuhachi, nappe de cordes,
  basse, cuivres, réverbération. 32 mesures (~69 s) : Intro → Marche → Thème → Assaut → Pont, puis boucle à la Marche.
  Nappe de cordes baissée de 60 % (sonnait comme un orgue trop présent).
- `musique/apercu.html` : page d'écoute seule (Jouer / Arrêter, volume, sections, export WAV d'une boucle).
- Dans le jeu (`Musique` dans main.js, volume par défaut `MUSIQUE_VOLUME` = 0,5) : démarre avec la partie (clic sur
  l'écran-titre, Espace/Entrée, ou « Recommencer »), fondu de 2 s à la défaite.
  - Menu pause : la musique continue **en sourdine** (×0,55) pour qu'on entende les réglages ; pause automatique
    (fenêtre quittée) : elle se fige.
  - **Volume** : ligne « [−] Musique 60 % [+] » du menu pause (pas de 10 %, jauge de 10 crans ; clic sur le libellé
    = couper / remettre), touches **+ / −** (rangée du haut ou pavé numérique) à tout moment, avec affichage bref du
    niveau sous le bouton de vitesse. **M** coupe / remet en gardant le volume choisi.
  - Mémorisé : localStorage `muraille-musique` (active / coupee) et `muraille-musique-volume` (0 à 1).
- Idée pour plus tard : version plus calme le jour, plus intense la nuit et pendant les hordes.

## Bruitages
- `musique/effets.js` (synthétisés, chaque appel varie un peu) : `fleche` (corde + sifflement), `flecheFeu`
  (corde + souffle de feu qui crépite), `murLame` (petits monstres : choc sur la pierre + tintement métallique grave
  vers 420 Hz + raclement), `murMassue` (troll, chef : impact sourd + éboulis + poussière).
  `musique/effets-apercu.html` : page d'écoute (sons seuls, scènes, option musique en fond).
- Dans le jeu (`Bruitages` dans main.js, volume par défaut `BRUITAGES_VOLUME` = 0,6) :
  - chaque flèche tirée joue `fleche` ou `flecheFeu`, placée en stéréo selon la position de l'archer ;
  - chaque monstre au contact de la muraille frappe à son rythme (0,9-1,4 s ; troll et chef 1,3-1,8 s, à la massue) ;
  - garde-fou `INTERVALLES_SONS` : un même son ne se répète pas plus vite que 0,1 s (flèche), 0,12 s (feu, lame),
    0,25 s (massue) → ~20 sons/s au plus avec 26 archers en ×3, au lieu de centaines.
  - volume séparé : ligne « [−] Bruitages 60 % [+] » du menu pause (un tir fait entendre le nouveau volume ; clic sur
    le libellé = couper) ; mémorisé (localStorage `muraille-bruitages`, `muraille-bruitages-volume`).

## Mobile (téléphone, tablette)
- **Jouer sur le téléphone** : lancer le serveur sur le PC (`jouer.cmd`), puis ouvrir sur le téléphone, connecté au
  même Wi-Fi, `http://<adresse du PC>:8080/muraille/` (ex. `http://192.168.1.59:8080/muraille/`). Le serveur écoute
  déjà sur toutes les interfaces ; Windows peut demander d'autoriser Node.js dans le pare-feu (réseau privé).
- **Installer** : menu du navigateur → « Ajouter à l'écran d'accueil » : icône (samouraï sur soleil rouge,
  `assets/icone-*.png`), `manifest.json` (plein écran, portrait).
- **Entrées** : événements « pointer » (souris, doigt, stylet) au lieu de « mouse » ; ni défilement, ni zoom, ni
  sélection, ni menu d'appui long (`touch-action: none`…). Au doigt, la carte touchée reste « survolée » : son aide
  reste affichée. Au relâchement du doigt : réveil du son (les navigateurs mobiles l'exigent) et passage en
  **plein écran** (+ verrouillage portrait quand c'est possible), sauf sur l'écran titre.
- **Netteté** : la toile garde ses coordonnées 720 × 960 mais sa résolution suit la densité de l'écran
  (`ajusterResolution`, jusqu'à ×2,5) ; taille d'affichage `min(100vw, 100dvh × 0,75)`.
- **Petit écran** (toile affichée sur moins de 520 px, `LOUPE` = 1,18) : textes de moins de 15 px agrandis (jusqu'à
  15), découpage des lignes recalculé ; sur l'écran de préparation, le résumé des cartes passe dans la zone du bas
  (nom + résumé + alliances de la carte touchée).
- **Textes tactiles** (`TACTILE`, pointeur grossier) : « Touchez… », aide du menu pause adaptée (barre de vie,
  médaillons, cristaux, bouton de vitesse) au lieu des raccourcis clavier.
- Petits boutons (croix de l'écran de préparation et du menu de sélection) : zone de toucher agrandie de 14 px
  tout autour (`dedansLarge`). Préparation et menu de sélection vérifiés en 375 × 812, au toucher.
- Limites : la plupart des textes restent petits sur un téléphone de 375 px (le jeu fait 720 px de large) ; non
  testé sur un vrai appareil (seulement en émulation 375 × 812).

## Publication (GitHub)
- Dépôt public : https://github.com/Akuaus/muraille (branche `main`, commits signés avec l'adresse noreply GitHub).
- Jouable en ligne (GitHub Pages, branche `main`, racine) : https://akuaus.github.io/muraille/
- **Avant chaque mise en ligne, changer `VERSION` dans `index.html`** (sinon les navigateurs gardent l'ancien `main.js` jusqu'à 10 min : c'est ce qui affichait encore « serveur injoignable » après la correction).
- Mettre à jour : `git add -A`, `git commit -m "…"`, `git push` depuis `jeux/muraille/` (le site se met à jour en ~1 min).
- `.gitignore` : `.claude/`, `RETOURS.md`. Le classement mondial (Supabase) fonctionne en ligne.
- **Idées et bugs en ligne** : table Supabase `retours` (`classement/retours.sql`, exécuté le 11/11/2026 : type idee/bug,
  texte ≤ 4000, contexte jsonb {infos, date}). Les joueurs peuvent seulement ajouter (aucune lecture publique, vérifié).
  `expedierRetour` envoie à la fois vers Supabase et vers le serveur de l'atelier (`RETOURS.md` en local) ; « envoyé »
  si l'un des deux a reçu. Sinon gardé dans le navigateur (`muraille-retours`) et renvoyé au lancement suivant.
  **Lire les messages** : Supabase → projet « Muraille project » → Table Editor → `retours`.

## Classement des joueurs
- **Médaillon trophée** : en haut à droite de l'écran titre (« Classement ») et au centre des médaillons de fin de partie
  (« Inscrire mon score », puis « Classement »). Fenêtre HTML (pinceau + plume) : en fin de partie, champ « Votre nom de
  guerrier » (16 lettres max, mémorisé : `muraille-pseudo`) + « Inscrire » ; puis le tableau des 20 meilleurs (rang,
  médailles or / argent / bronze, nom, vague, plateau, temps), votre ligne en rouge. Un score par partie.
- **Inscription automatique (12/11/2026)** : à la chute de la muraille, le score est inscrit tout seul sous le pseudo
  du profil (parties d'au moins 10 s) ; l'écran de fin affiche « Score inscrit au classement mondial (pseudo) ✓ »
  (ou « gardé sur cet appareil » hors ligne), et le médaillon devient « Classement ».
- **Style** : même papier fondu que le menu d'accueil et l'Héritage (`papierFondu`, généré à la taille réelle de la
  carte via un `ResizeObserver`, en fond CSS), sans cadre ; ✕ seul (rouge au survol) ; voile 0,38 (l'écran de fin
  derrière reste discret) ; hauteur minimale pour que la carte ne soit pas une bande étroite.
- **En ligne** : base Supabase (`classement/supabase.sql` : table `scores`, vue `classement` = meilleur score de chaque
  pseudo ; lecture et ajout seulement). Adresse et clé « anon public » à renseigner dans `CLASSEMENT` (`src/main.js`).
  Guide pas à pas pour créer le projet : `classement/BRANCHER-SUPABASE.md` (le compte doit être créé par le joueur).
- **Branché** (11/11/2026) : projet Supabase « Muraille project » (organisation « Muraille », région eu-west-1, réf.
  `bcaacbblwqxgibudzbhj`), script `supabase.sql` exécuté. Le jeu utilise la clé **publishable** (`sb_publishable_…`,
  publique par conception ; les clés « anon » historiques seront retirées en 2027). Vérifié : un score part et revient
  (« Classement mondial »), effacer / modifier avec la clé publique ne touche aucune ligne, la base refuse une durée
  impossible. Score de test retiré ensuite. Ne jamais mettre la clé **secrète** (`sb_secret_…`) dans le jeu.
- **Tant que ce n'est pas branché, ou sans Internet** : classement de cet appareil (`muraille-scores`, meilleur score
  par pseudo), avec une mention en bas de la fenêtre. Chaque score est aussi gardé localement.
- Attention : le navigateur intégré de l'app Claude a déjà été vidé deux fois à un redémarrage (record, réglages) ;
  le navigateur habituel (via `jouer.cmd`) garde ses données.

## Textes flottants
- **Encre** : plus un « +N » par monstre (trop nombreux, ils cachaient les cristaux) ; les gains sont regroupés et
  affichés une fois toutes les 0,9 s au milieu des monstres tombés (`majTextesEncre`), plus petits et un peu pâles.
- **Cristaux et PV** : dessinés par-dessus l'encre, plus gros (17 px), sur un halo de papier.

## Menu d'accueil et menu Options
- **Menu dessiné** (`assets/menu-accueil.webp`, 1024×1536, maquette du joueur) : posé en **carte réduite** (échelle
  `MENU_IMG.k` 0,345, à y 362) sur le décor du titre, qui reste visible autour (titre, record, sous-titre, muraille).
  On garde le haut de la page (boutons, médaillons, jusqu'à `coupe` 1165), prolongé d'une marge de papier vierge ;
  le haut du drapeau du coin bas gauche est recouvert de papier vierge (papier uni de la couleur exacte du bas de l'image + raccord en dégradé : plus de trait droit à la jonction). La carte est préparée une fois
  (`preparerCarteMenu`) : papier **recoloré** vers la teinte du décor (`PAPIER_IMAGE_MENU` → `PAPIER_DECOR`, les
  encres sombres restent inchangées) et **bords fondus** (`FONDU_MENU` 46 px, dégradé irrégulier façon lavis) : plus
  de rectangle, le cadre de l'image disparaît dans le fondu. Zones de clic mesurées dans `MENU_IMG` (Jouer, Héritage, Classement, Options, médaillons Idée / Bug) ; au
  survol, le coup de pinceau grossit de 6 %. Sceaux en réserve : petit sceau rouge au bout du bouton Héritage.
  Sous-menus (Options, Audio) : l'ancienne carte de papier. Si l'image ne se charge pas, l'ancien menu est utilisé.
- Écran titre → clic / Entrée → **menu d'accueil** (`ecran = 'accueil'`, `dessinerAccueil`) : décor du titre
  (`dessinerDecorTitre`, partagé), record, carte de papier encadrée au pinceau avec **Jouer** (rouge → préparation),
  **Héritage**, **Classement**, **Options**, et les médaillons **Une idée ? / Un bug ?**.
- **Options** (accueil et pause, `sousMenu`, `dessinerSousMenu` / `clicSousMenu`) : **Audio** (lignes Musique et
  Bruitages, `placerReglagesSon` ; un essai de son au réglage), **Commandes** (la fiche), **Retour**. Le titre du
  sous-menu (« Options », « Audio ») remplace la ligne de sous-titre.
  Fond : papier fondu façon lavis (`dessinerFondSousMenu`, `FOND_SOUS_MENU`), le même à l'accueil et en pause, sans cadre. La fiche des **Commandes** (`dessinerAide`) aussi : papier fondu à sa taille (`fondAide`), bandes en lavis.
- **Pause** : Reprendre · Vitesse · Recommencer · Options (+ médaillons Idée / Bug). Les réglages du son et le
  médaillon « ? » n'y sont plus directement : tout passe par Options.
- Clavier : Entrée / Espace = Jouer (accueil) ; H ou ? = Commandes ; Échap remonte d'un niveau (fiche → Options →
  menu), puis revient au titre (accueil) ou reprend la partie (pause).
- La croix et Échap de l'écran de préparation ramènent au menu d'accueil ; la fin de partie mène directement à la
  préparation.

## Héritage (progression d'une partie à l'autre)
- But : la difficulté monte sans fin (mur de difficulté vers 25-35 min). Pour aller toujours plus loin, chaque partie
  rapporte des **sceaux** : **1 par minute tenue**, **+5 pour un nouveau record** (affiché en fin de partie).
- Menu d'accueil → **Héritage** (`dessinerHeritage` / `clicHeritage`, `heritageOuvert`) : 7 bonus permanents,
  achetés avec les sceaux (coût = base × 1,7^niveau, `coutHeritage`) :
  Trésor de guerre (encre de départ +80/niv., max 5) · Fondations profondes (muraille +100 PV/niv., max 5) ·
  Mortier sacré (+1 PV/s/niv., max 4) · Lames ancestrales (dégâts +5 %/niv., max 6) · Archers vétérans (+1 archer
  et +1 place/niv., max 3) · Mémoire des anciens (XP +10 %/niv., max 5) · Veine de cristal (+3 cristaux/niv., max 4).
- **Fin de partie** : quand le pavillon a fini de s'effondrer, l'Héritage s'ouvre d'abord (`ouvrirHeritage(true)`,
  panneau plus haut) : « +N sceaux gagnés · M à dépenser », puis **Rejouer** (relance aussitôt avec le même plateau,
  Entrée) ou **Suivant →** (bilan de la partie, Échap / ✕ / flèche droite). Un clic à côté ne ferme pas le panneau.
- Appliqués dans `nouvellePartie`, `multDegats`, `regenMur`, `capArchers` et le gain d'XP, via `herit(id)`.
- Mémorisé dans le navigateur : `muraille-sceaux`, `muraille-heritage` (localStorage).
- Style : même papier que la carte du menu d'accueil (`papierFondu(w, h, fondu)` : teinte du décor, grain, bords
  estompés irréguliers façon lavis), voile léger (0,22), plus de cadre rectangulaire ; ✕ seul (rouge et plus gros au
  survol) ; bandes alternées en lavis aux extrémités estompées.
- Remarque : ces bonus rendent le classement moins équitable entre anciens et nouveaux joueurs.

## Lot du 13/11/2026 (6, 7, 8, 9, 10, 4, 3)
- **Sauvegarde en ligne** (`sauverEnLigne`, `chargerEnLigne`, `recupererSauvegarde`) : la progression
  (`CLES_SAUVEGARDE` : record, sceaux, héritage, pièces, cartes, plateau, tuto, profil, pseudo, succès, défis) est
  copiée dans Supabase sous un **code secret de 12 caractères** (`muraille-code`), toutes les 20 s si elle a changé,
  à chaque fin de partie et quand on quitte la page. Au lancement, la copie en ligne plus récente (autre appareil) est
  reprise. Fenêtre du profil : « Votre code : XXXX-XXXX-XXXX » + champ « Récupérer ». Base : `classement/sauvegardes.sql`
  (table `sauvegardes` sans accès direct ; fonctions `sauver_profil` / `charger_profil` qui exigent le code).
- **Statistiques de fin** (`dessinerStatsFin`) : sous les médaillons du bilan, « Ce qui a tenu la muraille » (5 sources
  de dégâts en barres, `G.stats` rempli par `compterDegats` : archers, catapultes, balistes, faucons, samouraïs,
  dragon, sorts, feu, poison, Fossé, Poudrerie) et la courbe de la muraille (`G.histoMur`, toutes les 5 s).
- **Impacts** : secousse de l'écran (`secouer`, `G.secousse` → transform du canvas) quand un troll / chef cogne la
  muraille, à la mort d'un chef / troll, au raz-de-marée ; éclaboussure d'encre à chaque mort (plus forte pour les
  gros) ; **coups critiques** des flèches (`CRITIQUE` : 8 %, ×2, chiffre rouge « 24 ! »).
- **Dojo** : bannières noires « 武 » aux deux bouts de la face de la muraille (`dessinerBannieresDojo` : 1 bannière, 2 dès le
  niveau 3, pompons dorés au max). **Fossé** : tranchée d'eau d'encre devant les pieux (plus large par niveau, rides
  animées, verdâtre avec le talent poison).
- **Panneau au doigt** (`PB`) : plus large, boutons de 46 px, texte plus grand ; description sur 2 lignes partout.
  **Appui long** sur une carte (0,45 s) : fiche de la carte (effet, niveau, suite, talent), qui disparaît au
  relâchement ; à la souris, la fiche s'affiche après 0,6 s de survol (panneau fermé).
- **Succès** (`SUCCES`, 17, `verifierSucces` chaque seconde en partie et à la fin) : récompensés en pièces, bannière
  en jeu, ligne sur le bilan, liste et progression dans la fenêtre du profil. Compteurs (`muraille-succes`) : monstres,
  trolls, chefs, sorts, raz-de-marée.
- **Défi du jour** (`defiDuJour` tiré de la date) : 4 cartes imposées (même verrouillées, `composerPlateau(true)`) +
  une règle (`MODIFS_DEFI` : sans réparation, encre −30 %, muraille −40 % PV, monstres +25 % plus vite, sans Héritage).
  Badge en haut à droite de l'accueil → fenêtre (plateau, règle, meilleur temps, classement du jour) → « Relever le
  défi ». Rappel de la règle dans le HUD. Pas de record ; premier défi ≥ 1 min de la journée : +10 pièces. Scores de
  défi : colonne `defi` + vues `classement` (sans défis) et `classement_defis` (`classement/defis.sql`) ; tant que la
  base n'a pas cette colonne, un score de défi reste sur l'appareil (jamais dans le classement général).
- **Scripts `sauvegardes.sql` et `defis.sql` exécutés le 13/11/2026** et vérifiés (sauvegarde / chargement par code,
  mauvais code → rien, lecture directe de la table → rien ; score de défi seulement dans `classement_defis`) ; données
  de test effacées.

## Profil : pseudo et avatars (12/11/2026)
- Avant la première partie, « Jouer » ouvre la fenêtre **Votre profil** (`ouvrirProfil(true)`, « Valider et jouer ») :
  pseudo (16 lettres, aussi utilisé pour le classement : `muraille-pseudo`) et choix d'un avatar. Ensuite accessible par
  le **badge** en haut à gauche de l'accueil (`BADGE_PROFIL`, portrait + pseudo).
- 14 avatars (`AVATARS`) : portraits ronds tirés des dessins du jeu (`premierDessin` détoure le premier dessin de chaque
  planche ; dragon = `imagesDragon` ; temple, pagode, faucon = icônes de cartes), sur le lavis des cercles.
  Libres : Archer, Gobelin. À débloquer : Corbeau (2 jours), Orc (tenir 5 min), Rôdeur (30 min de jeu au total),
  Samouraï (5 parties), Porte-bouclier (10 min), Faucon (1 h au total), Troll (15 min), Temple (7 jours), Chef de guerre
  (20 min), Baliste (25 parties), Dragon (30 min), Pagode (5 h au total). Chaque verrouillé montre sa condition et la
  progression ; « Nouvel avatar débloqué : … » en fin de partie.
- Statistiques (`profil`, localStorage `muraille-profil`) : pseudo, avatar, temps de jeu total (compté pendant les
  parties, hors pause), parties lancées, jours différents où l'on a ouvert le jeu, meilleure partie.
- **Classement** : l'avatar du profil part avec chaque score (`inscrireScore`) et s'affiche en portrait à côté du
  pseudo (`imageAvatarClassement` ; absent → Archer). Base : `classement/avatar.sql` (colonne `avatar` + vue
  `classement` qui la renvoie), **exécuté le 12/11/2026** et vérifié : un score avec avatar revient avec son portrait,
  un avatar invalide est refusé (400) ; score de test effacé ensuite. Le jeu marche aussi sans cette colonne.

## Tutoriel (premières parties)
- Conseils du maître d'armes (`TUTO`, `majTuto` / `dessinerTuto` / `clicTuto`) : chacun apparaît une seule fois, au moment
  où il devient utile ; le jeu se fige, la zone concernée est éclairée (voile percé + cadre rouge qui pulse), bulle de
  papier fondu reliée par un trait rouge. « Compris » / Entrée / Espace / Échap / clic ailleurs = suivant ;
  « Passer le tutoriel » coupe tout. Plus grand sur téléphone.
- 9 conseils, dans l'ordre : encre (1,5 s) · bâtiments (6 s et assez d'encre) · améliorer (premier panneau ouvert) ·
  muraille (sous 80 % : réparer) · expérience / niveaux (barre à moitié) · cristaux (sorts + reliques) · talents (✦,
  dès qu'un talent est achetable) · hordes (8 s avant) · nuit.
- Mémorisé : localStorage `muraille-tuto` (liste des conseils vus, ou 'fini'). Options → « Revoir le tutoriel ».

## Contrôles
- Clic sur une carte : ouvre son panneau (améliorer + action : recruter / catapulte / réparer)
- Pastille rouge sur une carte : quelque chose y est achetable
- Icône de la carte en noir si l'amélioration est abordable (ou au maximum), grisée sinon (le texte reste noir)
- 1 à 5 : choisir un bâtiment · Échap : fermer
- A : recruter un archer · C : catapulte · R : réparer
- Sorts : E pluie d'encre · B brume · F rempart · T raz-de-marée (ou clic sur les médaillons) · K reliques
- **Pause** : bouton rond en haut à droite (❚❚ noir → ▶ rouge en pause), Espace, P ou Échap (Échap ferme d'abord
  le panneau ouvert). Pause **automatique** quand on change d'onglet ou de fenêtre (message « pendant votre absence »).
  Menu : Reprendre · Vitesse · Recommencer (deux clics : le premier demande confirmation pendant 3 s),
  rappel vague / temps / monstres abattus. **Médaillon « ? » Commandes** (sous les réglages du son, ou touche H) :
  ouvre une fiche claire, une ligne par action avec sa touche (ou son geste au doigt sur mobile), plus un « Bon à
  savoir » (nuit, cristaux) ; un clic ou Échap la referme. Remplace l'ancien pavé d'astuces, jugé trop fouillis.
- **Idées et bugs** : médaillons ampoule (« Idée ») et insecte (« Bug ») de part et d'autre du « ? » dans le menu pause,
  et sous le texte de l'écran de fin. Ils ouvrent une petite fenêtre HTML (zone de texte, Annuler / Envoyer ;
  Échap ferme, Ctrl + Entrée envoie ; les touches du jeu sont coupées pendant la saisie). Le message part au serveur
  de l'atelier (`POST /__retour/muraille`) avec le contexte (moment de la partie, vague, niveau, PV, plateau, record,
  souris/tactile, taille d'écran) et s'ajoute à **`RETOURS.md`** du jeu (créé au premier retour) : c'est là qu'il faut
  lire les idées et bugs des joueurs. Sans serveur, ou avec un serveur lancé avant cette fonction, le message est
  gardé dans le navigateur (`muraille-retours`) et renvoyé automatiquement 3 s après le prochain chargement servi.
  - **Fenêtres « idée » et « bug »** : les images peintes par le joueur elles-mêmes (`assets/fenetre-idee.webp` et
    `assets/fenetre-bug.webp`, copies de `sources/fenetre-*-maquette.webp`, 1536 × 1024, même mise en page). Titre, texte,
    cadre et boutons y sont déjà dessinés : le jeu pose dessus une zone de saisie (fond couleur du papier, `fondSaisie`,
    qui cache l'exemple peint ; même exemple réécrit à la plume) et des boutons invisibles aux mêmes endroits
    (`FENETRES`, zones communes `ZONES_FENETRE` en % de l'image). Proportions 3:2, largeur ≤ 640 px, placée haut
    pour laisser la place au clavier sur téléphone. (Le décor peint par le code, essayé avant, a été retiré.)
    Style accordé aux autres menus (`preparerFenetreFondue`, au chargement) : le cadre noir au pinceau du bord est effacé
    (encre peu saturée à moins de `CADRE_FENETRE` px du bord → papier, sauf le ✕), papier recoloré vers la teinte du
    décor (fond de saisie aussi), bords estompés façon lavis (`FONDU_FENETRE`), voile 0,38, plus d'ombre portée.
- Vitesse ×1 → ×2 → ×3 : bouton rond sous l'engrenage (rouge quand le jeu est accéléré), touche V,
  ou menu pause. Le pas de simulation est découpé (×3 = 3 pas par image) pour rester stable.

## Économie et bâtiments
- Encre : à chaque monstre tué (valeur +3 %/min) + mine
- Mine (5 niv.) : 1 / 2,5 / 5 / 9 / 15 encre/s
- Forge (5 niv.) : +20 % de dégâts par niveau
  - action **Flèches enflammées** (`FEU`, achat unique, 300 encre, Forge niv. 1) : chaque flèche embrase sa cible
    3 s (2,5 dégâts/s × multiplicateur de Forge, sans armure) ; traînée de feu derrière les flèches, petites
    flammes sur les monstres en feu ; **la nuit**, flèches et monstres en feu projettent leur propre lueur
    (`lueursDeFeu`, posée après la teinte bleue, intensité selon la nuit)
  - simulation : ~+40 s de durée de vie moyenne quand l'IA l'achète (vers 6 min 20)
- Caserne (6 niv.) : 3 / 5 / 8 / 12 / 16 / 20 archers max
- Atelier de siège (4 niv.) : 1 à 4 catapultes (dégâts de zone de 85 px au pied du mur, plus petite au loin,
  ignorent les boucliers)
- Maçonnerie (5 niv.) : +250 PV de muraille et +1,5 PV/s par niveau ; réparation +120 PV pour 35
- **Réparer en cliquant sur la barre de PV** de la muraille (`ZONE_PV`, indice au survol) — même effet que R,
  quel que soit le plateau (même sans Maçonnerie).

## Plateau personnalisable (« Préparer la muraille »)
- **Écran d'après la maquette du joueur** (`assets/preparation.webp`, copie de `sources/preparation-maquette.webp`,
  1024 × 1536, `MAQUETTE_PREP`) : on reprend de l'image, à l'échelle 0,703 (largeur 720), le haut (titre « Préparer la
  muraille », ensō, sous-titre, croix, soleil et montagnes), les étiquettes des familles (icône + nom sur lavis gris),
  l'icône de chaque carte (détourée : papier de la carte et tout ce qui est clair retirés), et, à l'échelle 0,6, le
  cadre « Alliances actives » et le bouton « Partir au combat ».
- **(12/11/2026) Les 4 cartes de chaque famille dans des cercles** (`dessinerCerclesPrep`, `cerclePrep`, rayon 46,
  centres = colonnes de la maquette) : la choisie cerclée de rouge et cochée, les verrouillées estompées avec cadenas et
  « record mm:ss ». Toucher un cercle = choisir la carte ; toucher la carte déjà choisie = ouvrir le menu de détail.
  Survol (souris) : bulle avec l'effet et les alliances (« avec Forge (Soutien) »), coupée en lignes.
  Fond des cercles = le lavis de l'étiquette « Économie » de la maquette, encre effacée (`fondLavisCercle` : chaque
  pixel sombre prend la couleur médiane du lavis de sa ligne). Étiquettes de famille aux bords estompés
  (`etiquetteFondue` : fondu irrégulier, 34 px en haut / bas, 14 px sur les côtés pour ne pas manger le nom).
- **Menu de détail** (`dessinerSelectionFamille`) : papier fondu comme les autres menus (plus de cadre), ✕ seul ; chaque
  alliance montre l'**icône de l'autre carte et sa famille** (« avec Atelier · Siège ») pour savoir où la chercher.
- **Pièces (12/11/2026) : les cartes se débloquent en les achetant** (plus par le record). Chaque partie rapporte
  `piecesDePartie` = 2 par minute tenue + 1 tous les 50 monstres (affiché dans l'Héritage de fin et le bilan).
  Prix `PRIX_CARTE` : comptoir 10, fossé 15, balistes 18, poudrerie 25, monastère 28, fauconnerie 35, temple 40,
  dojo 50, sanctuaire 60, alchimiste 65, pagode 70 (les autres sont gratuites). Achat : toucher une carte verrouillée
  (« Débloquer ? prix », cercle pointillé rouge), la toucher à nouveau dans les 4 s (`clicCarteVerrouillee`) ; elle est
  alors débloquée et choisie. Compteur de pièces en haut à gauche de l'écran. Mémorisé : `muraille-pieces`,
  `muraille-cartes` ; à la première ouverture, les cartes déjà débloquées par le record restent acquises.
- **Survol d'une carte** : les cartes qui peuvent s'allier avec elle sont entourées d'un **cercle vert** (`alliesSurvol`).
- **Réparation** : chaque utilisation coûte 1 encre de plus (`G.reparations`, remis à zéro à chaque partie).
- **Pastille rouge des cartes** (en jeu) : amélioration, action ou talent payable ; et, pour la **Caserne**, tant qu'il
  reste des archers à recruter (même sans assez d'encre, même au niveau maximum).
- (Avant le 12/11) Une rangée par famille (`dessinerRangeePrep`, `rectFamille`) : la carte choisie en large — icône, nom au pinceau,
  effet à la plume, alliances actives qui la concernent en rouge — et, à droite, « Changer ▸ » avec les autres cartes
  de la famille en petit (pâles si verrouillées). Toucher la rangée ouvre le **menu de sélection** de la famille
  (`dessinerSelectionFamille`, `selectionFamille`) : ses 4 cartes en grand (icône, nom, effet, talent, alliances
  possibles avec ✓ si le partenaire est déjà choisi ; carte choisie cochée en rouge ; voile + cadenas + record si
  verrouillée). Toucher une carte la choisit et ferme le menu ; ✕, un clic dehors ou Échap le ferment.
- Les **cercles** du cadre « Alliances actives » montrent les alliances du plateau (icônes des deux cartes ; +N au-delà
  de 3) ; survoler un cercle affiche l'alliance. La **croix** (ou Échap) ramène au menu d'accueil.
- Titre ou écran de fin → écran **Préparer la muraille** : un bâtiment par **famille** ; la Caserne est toujours là.
  Clic sur une carte pour la choisir (cadre rouge), « Partir au combat » ou Entrée / Espace pour lancer.
  Le choix est mémorisé (`localStorage 'muraille-plateau'`) ; « Recommencer » (pause) garde le plateau.
- Code : `TOUS_BATIMENTS` (catalogue, champ `famille`), `FAMILLES`, `PLATEAU`, `composerPlateau()` → `BATIMENTS`
  (toujours 5 cartes dans l'ordre Économie, Soutien, Caserne, Siège, Défense ; touches 1 à 5 inchangées).
- **4 cartes par famille** sur l'écran (rangée par famille, résumé de 2 lignes sous chaque carte).
- **Déblocage par record** (`DEBLOCAGE`) : Rizière dès le départ, Comptoir 2 min, Fossé 4, Balistes 5, Poudrerie 7,
  Monastère 8, Fauconnerie 10, Temple 12, Dojo 15, Sanctuaire 18, Alchimiste 20, Pagode 22 min.
  Carte verrouillée : grisée, cadenas, « Record de MM:SS requis ».

| Famille | Classique | Alternative |
|---|---|---|
| Économie | Mine : revenu fixe | **Rizière** (5 niv.) : 0,8 / 1,6 / 2,6 / 3,8 / 5 encre/s, **+10 % par minute de jeu** ; talent « Irrigation » ×1,5 |
| Soutien | Forge : dégâts +20 %/niv., flèches de feu | **Fauconnerie** (5 niv.) : 1 / 2 / 2 / 3 / 4 faucons (sprites de corbeau) qui fondent sur les monstres rapides en priorité (50 dégâts, +5 %/min, +35 %/niv., repos 1,4 s) et les **marquent** 5 s : la proie subit +22 % à +50 % de dégâts de toutes sources (`bonusMarque`) — compense l'absence de Forge ; talent « Serres d'acier » |
| Siège | Atelier : catapultes, dégâts de zone | **Tour à balistes** (4 niv.) : 1 à 4 balistes ; carreau de 90 dégâts qui **traverse toute une file** (−15 % par monstre traversé), recharge 3,2 s ; talent « Carreaux barbelés » (+40 %, recharge −20 %) |
| Défense | Maçonnerie : PV + réparation | **Dojo des samouraïs** (5 niv.) : 2 à 6 samouraïs postés devant la muraille, qui **bloquent** les monstres et les frappent (32 dégâts +4 %/min, 260 PV +8 %/min, réapparition 5 s) ; talent « Voie du sabre » (+50 %) |

- **Équilibrage par plateau** (IA forte, 3 parties chacun) : classique ~29 min (25-35), Rizière ~34, Balistes ~34,
  Fauconnerie ~26, Dojo ~26, tout alternatif ~24. Avant réglage : Fauconnerie ~19, Dojo ~22, Balistes ~24.
- Prestige des alternatives : Balistes (base 3500, +15 %), Dojo (2800, +15 %), Fauconnerie (3000, +12 %).
### Deuxième vague de cartes
| Famille | Carte | Effet | Talent |
|---|---|---|---|
| Économie | **Comptoir** (5 niv.) | butin des monstres +12 %/niv. ; action **troc** : 1 cristal → 150 encre (+10 %/min) | « Guilde marchande » : butin ×1,25, troc +50 % |
| Économie | **Monastère** (5 niv.) | aucune encre ; expérience +25 %/niv. (`XP_MONASTERE`) et **offrande** de 25 encre × niv. à chaque niveau gagné | « Sutras » : bonus d'XP ×1,4 |
| Soutien | **Temple** (5 niv.) | aura sur 220 px devant la muraille (`AURA_TEMPLE`) : monstres ralentis −10 %/niv. (max 60 %) et **vulnérables** (+8 %/niv. de dégâts subis), cadence des archers +10 %/niv. ; lavis doré et ondes qui montent du mur | « Gong sacré » : ralenti ×1,5, cadence +10 % |
| Soutien | **Alchimiste** (5 niv.) | chaque flèche ajoute une dose de poison (max 3 + niv.), 3,5 dégâts/s par dose (+40 %/niv., +5 %/min), 4 s ; bulles vert olive | « Contagion » : à sa mort, un monstre empoisonné contamine ses 2 voisins |
| Siège | **Poudrerie** (4 niv.) | 1 à 4 mortiers à poudre (`ACTIONS.pot`, touche C) : explosion 24 dégâts, puis **sol en feu** 4 s (10 dégâts/s, +5 %/min) ; lavis rouge, flammes, lueur la nuit | « Poudre noire » : +40 %, le sol brûle 2 s de plus |
| Siège | **Pagode** (4 niv.) | un **dragon d'encre** passe toutes les 24 / 21 / 18 / 15 s et frappe une fois chaque monstre de la rangée la plus peuplée (85 dégâts, +40 %/niv., +3 %/min) ; corps au pinceau, crinière rouge, vole au-dessus de la brume | « Dragon ancestral » : +60 %, bande plus large |
| Défense | **Fossé** (5 niv.) | pieux devant la muraille : les monstres au mur **saignent** (4 × niv. dégâts/s, +7 %/min), ralentis de 14 à 30 % sur les 75 derniers px ; muraille +100 PV/niv. | « Pieux empoisonnés » : saignée ×2, ralenti +15 % |
| Défense | **Sanctuaire** (5 niv.) | lanternes sur la muraille (lueur la nuit) : chaque niveau efface 20 % des malus de nuit (portée, et moitié moins pour l'afflux) ; à l'aube, soigne 12 %/niv. de la muraille ; +150 PV/niv. | « Veilleurs » : la nuit, cadence +25 % |

- **Équilibrage** (IA forte, 3 parties par carte, le reste du plateau classique ; classique ~36 min dans cette série) :
  Comptoir ~31 (une défaite à 8 min, une partie à 50+), Monastère ~32, Temple ~30, Alchimiste ~28, Poudrerie ~35,
  Pagode ~29 (de 24 à 40), Fossé ~30, Sanctuaire ~32. Avant réglage : Pagode ~46 et Poudrerie ~42 (trop fortes),
  Temple ~21, Alchimiste ~21, Monastère ~17 (trop faibles).
- Prestiges : Temple (+5 % cadence), Alchimiste (+15 % poison), Poudrerie et Pagode (+15 %), Fossé (+15 % saignée,
  +200 PV), Sanctuaire (+300 PV).
- Améliorations de niveau : Mortiers lourds / Treuils valent pour tous les engins de siège (catapultes, balistes,
  mortiers à poudre, dragon) ; nouvelles cartes
  **Kenjutsu** (samouraïs dégâts +20 %, 4 crans, avec le Dojo) et **Pèlerins** (+1 faucon, 3 crans, avec la Fauconnerie).

### Alliances (bonus selon les cartes choisies)
Deux cartes de familles différentes qui ont un rapport entre elles forment une **alliance** (`ALLIANCES`), active
pendant toute la partie dès que les deux sont sur le plateau (même pas encore construites). Écran de préparation :
« Alliances actives » au-dessus du bouton ; en survolant une carte, la liste de ses alliances possibles
(✓ = son partenaire est déjà choisi). Bannière rouge au début de la partie. Test dans le code : `alliance('id')`.
(Les « fils d'alliance » rouges entre cartes, essayés sur l'écran de préparation, ont été retirés : jugés moches.)

| Alliance | Cartes | Bonus |
|---|---|---|
| Fonderie | Mine + Forge | tous les dégâts +10 % |
| Rails de mine | Mine + Atelier | catapultes rechargées 15 % plus vite |
| Paysans-soldats | Rizière + Dojo | samouraïs +35 % PV, réapparition 2× plus rapide |
| Terrasses de pierre | Rizière + Maçonnerie | revenu de la rizière +25 % |
| Venin précieux | Comptoir + Alchimiste | butin des monstres empoisonnés +30 % |
| Marchands de poudre | Comptoir + Poudrerie | mortiers à poudre 40 % moins chers |
| Ordre monastique | Monastère + Temple | expérience +20 % |
| Veillée de prière | Monastère + Sanctuaire | la nuit, expérience jusqu'à +50 % |
| Boulets ardents | Forge + Atelier | les boulets enflamment les monstres touchés |
| Feu grégeois | Forge + Poudrerie | le sol brûle 2 s de plus et 30 % plus fort |
| Œil du chasseur | Fauconnerie + Balistes | recharge des balistes −25 % |
| Seigneurs du ciel | Fauconnerie + Pagode | le dragon passe 20 % plus souvent |
| Moines guerriers | Temple + Dojo | samouraïs +40 % dégâts, se soignent de 6 PV/s |
| Fumées toxiques | Alchimiste + Poudrerie | le sol embrasé empoisonne (≈ 1 dose/s) |
| Pieux enduits | Alchimiste + Fossé | les monstres au mur s'empoisonnent (≈ 1 dose/s) |
| Ligne de pieux | Dojo + Fossé | les monstres retenus par un samouraï saignent aussi |
| Dragon des lanternes | Pagode + Sanctuaire | la nuit, le dragon passe jusqu'à 2× plus souvent |
| Tours de pierre | Maçonnerie + Balistes | balistes +20 % dégâts |

Chaque carte a au moins deux partenaires ; un plateau en active de 0 à 4.

- Équilibrage avec alliances (IA forte, 3 parties) : classique (Fonderie, Rails, Boulets ardents) ~40 min (36 sans) ;
  Comptoir + Alchimiste + Poudrerie + Fossé (4 alliances) ~35 ; Monastère + Temple + Pagode + Sanctuaire ~28 ;
  Rizière + Temple + Balistes + Dojo ~24 (plateau faible sans Forge ni Maçonnerie, même avec ses 2 alliances renforcées).

## Cristaux (seconde ressource, rare)
- Gains : troll +1, chef de guerre +6, chaque horde repoussée +2
- Simulation : ~6 à 6 min, ~24 à 10 min, ~80 à 16 min (ils abondent quand les trolls arrivent)
- **Talents** (un par bâtiment, achat unique, bâtiment construit requis) — 2ᵉ ligne du panneau, bouton bleu nuit :
  - Mine « Veine profonde » (6) : revenu ×1,5
  - Forge « Pointes perce-armure » (8) : les flèches ignorent la moitié de l'armure
  - Caserne « Arcs longs » (8) : portée +30 %, cadence +15 %
  - Atelier « Pots d'encre » (8) : zone +40 %, recharge −20 %
  - Maçonnerie « Remparts bénis » (8) : +300 PV, régénération doublée +1 PV/s
- **Sorts** (médaillons sous le HUD, à recharge) :
  - Pluie d'encre (E, 3 cristaux, 40 s) : 50 dégâts × échelle des PV × forge à tous les monstres
  - Brume (B, 2 cristaux, 30 s) : monstres ralentis de 50 % pendant 8 s
  - Rempart (F, 2 cristaux, 45 s) : répare 40 % de la muraille

## Dépenses sans fin (fin de partie)
- **Prestige** (`PRESTIGE`) : une fois au niveau max, Forge / Maçonnerie / Atelier continuent de monter,
  coût × 1,6 à chaque cran (bases 3000 / 2500 / 3500) : Forge +10 % de dégâts, Maçonnerie +300 PV,
  Atelier catapultes +15 %. Carte : ★N et prix du prochain cran ; panneau : bouton « Prestige ★N ».
  Mine et Caserne restent plafonnées (plus de revenus aggraverait le surplus ; place limitée sur la muraille).
- Réparation proportionnelle : +10 % de la muraille, pour 0,3 encre par PV.
- **Reliques** (`RELIQUES`, en cristaux, coût croissant) — clic sur le compteur de cristaux ou touche K,
  le jeu se fige : Lame d'encre (tous les dégâts +5 %), Pierre de garde (dégâts subis −5 %, max 12 = −60 %),
  Sablier (recharge des sorts −5 %, max 10), Pacte des ombres (XP +10 %).
- **Raz-de-marée** (sort ultime, touche T, 25 cristaux, 120 s) : **vague dessinée** (`assets/vague.webp`, copie de
  `sources/vague-planche.webp`, 8 images en 2 rangées de 4, fond transparent autour de l'allée). Elle naît au pied de la
  muraille et remonte la vallée en 2,2 s (front à l'horizon à 60 %), puis retombe en écume ; chaque monstre est frappé
  une fois quand le front le dépasse (250 × échelle des PV × dégâts). Préparation (`preparerVague`) : allée de l'image
  repérée par la transparence, papier ramené au blanc (dessin en « multiply » : seule l'encre des vagues se voit,
  l'écume laisse voir notre chemin), tirets des bords retirés (6 %), puis chaque image est déformée ligne par ligne
  sur NOTRE chemin (`cheminCentre` ± `cheminDemi`, de l'horizon au mur) : l'allée du jeu n'est pas modifiée.
  Fondu entre deux images. L'ancienne vague dessinée par le code reste en secours.
- Cristaux plus rares : un troll n'a plus qu'1 chance sur 4 d'en lâcher (avant : 1 garanti).
- Performance : la séparation des monstres ne compare que les voisins proches en hauteur (tri par y) →
  ~1 ms de calcul par image même avec 300 monstres.

## Expérience et niveaux
- XP par monstre (`XP_MONSTRE`) : gobelin 1 · rôdeur 2 · orc 3 · porte-bouclier 4 · troll 10 · chef 40
- Seuil du niveau n → n+1 : `8 × 1,17^(n−1) + 3(n−1)` (8, 12, 17, 22, 27…) — raccourci à la demande (avant :
  `12 × 1,3^(n−1) + 4(n−1)`). IA forte : niveau 3 à 1 min, 11 à 5 min, 18 à 10 min, 28 à 20 min, 36 à 30 min.
- À chaque niveau, le jeu se fige (comme une pause) et propose **3 améliorations tirées au sort** parmi celles
  disponibles et pas encore au maximum ; clic ou touches 1/2/3 (choix ignoré les 0,35 premières secondes, pour
  éviter un clic involontaire). Plusieurs niveaux d'un coup → les choix s'enchaînent.
- Barre d'XP orangée sous la traînée « Vague N » (« Niv. N »), claire la nuit.
- Catalogue (`AMELIORATIONS`, nom · effet par cran · max) — 75 crans au total. Avec les niveaux plus rapides, chaque
  cran vaut ~⅔ de l'ancien et les maximums sont ~×1,5 : on choisit plus souvent, la puissance monte au même rythme.
  - Tir soutenu · cadence des archers +8 % · 8
  - Pointes acérées · dégâts des flèches +10 % · 8
  - Œil de faucon · portée des archers +7 % · 4
  - Volée double · 10 % de chance de tirer une 2e flèche · 5
  - Ricochet · 17 % de chance qu'une flèche rebondisse (×0,7 dégâts) sur un monstre à moins de 140 px · 3
  - Recrues · +1 archer max à la caserne · 6
  - Mortiers lourds · dégâts des catapultes +17 % · 4 (atelier construit)
  - Treuils graissés · recharge des catapultes −10 % · 4 (atelier construit)
  - Pierres de taille · muraille +150 PV · 7
  - Mortier frais · muraille +1,5 PV/s · 4
  - Herses · dégâts subis par la muraille −7 % · 4
  - Dîme du village · +1 encre/s · 5
  - Pillage · encre par monstre +20 % · 3
  - Éclats de cristal · 3 % de chance qu'un monstre lâche un cristal · 4
  - Grimoire · recharge des sorts −15 % · 3
  - Braises · brûlure des flèches de feu +35 % (dégâts et durée) · 3 (flèches de feu achetées)
- Équilibrage : niveaux raccourcis seuls → l'IA forte tenait jusqu'à la limite de 50 min ; avec les crans ajustés
  ci-dessus : 27, 34, 35, 40 min (~34 min, comme avant), niveau 33 à 42 en fin de partie.

## Ennemis (arrivée progressive)
Gobelin (0:00) · Orc (1:15) · Rôdeur rapide (2:30) · Porte-bouclier, résiste aux flèches (3:40)
· Troll (6:40) · Chef de guerre, un boss toutes les 6 min

## Difficulté
- Menace/s = (0,45 + 0,11 × minutes^1,25) × 1,03^(minutes au-delà de 12) (gobelin = 1, troll = 12…)
- PV ennemis × (1 + 0,07·m + 0,012·m²) × **1,07^(minutes au-delà de 12)** (`DIFFICULTE`) : ×2 à 22 min, ×4 à 32, ×8 à 42.
  Le début de partie (avant 12 min) ne change pas.
- **Élites** (`ELITES`) dès 15 min, chance = 2 % par minute au-delà de 15 (max 40 %), liseré coloré :
  blindé (bleu, +50 % d'armure contre les flèches) · enragé (rouge, vitesse ×1,6) · colosse (violet, PV ×3, ×1,35 de taille).
  Butin et XP ×2 (colosse ×3).
- Chefs de guerre : +50 % de PV à chaque nouvelle apparition ; deux à la fois après 30 min.
- **Repère d'équilibrage (IA « forte »)** : remplit troupes et catapultes, maximise les bâtiments, achète talents,
  flèches de feu, prestiges et reliques, lance les sorts à propos, choisit ses améliorations par priorité
  (dégâts d'abord). Durées : 29, 32, 32, 36, 36, 43 min → **~35 min** (cible 30-40 min pour un bon joueur).
  L'encre ne s'accumule plus (< 1 300 en fin de partie) ; 160-350 cristaux gagnés, tous dépensés.
- Historique avec l'ancienne IA naïve (repère 15-22 min) :
- Hordes toutes les 2 min dès 1:40 (15 s à ×2,5, puis 7 s de répit) ; « Vague N » = numéro de horde
- Équilibrage testé par simulation (IA naïve, 5-6 parties par réglage). Repère : 15-22 min.
  - Dérive constatée après la perspective : ~29 min. Cause trouvée : la zone d'impact des catapultes restait de
    60 px à l'écran alors que les monstres lointains sont dessinés 2 à 5× plus petits et plus serrés → un tir en
    touchait beaucoup trop (sans catapultes : ~7 min ; avec : ~29 min).
  - Correction : la zone suit la perspective (`zoneCata() × perspective(y)`), la visée prédit la position avec la
    vitesse apparente (`vitesseEcran`). Zone de base portée à 85 px (au pied du mur) pour compenser.
  - Résultat (nuits dures comprises) : moyenne ~18,5 min (de 9 à 23 min), presque toutes les défaites la nuit.
    Zone 90 → ~20 min ; zone 60 → ~7 min.

## Fichiers
- `src/main.js` : tout le jeu ; constantes d'équilibrage en haut, puis outils de dessin, décor, sprites,
  logique, interface, rendu
- `jouer.cmd` : **double-cliquer pour jouer** — lance le serveur de l'atelier (fenêtre réduite « Atelier - serveur »)
  et ouvre http://localhost:8080/muraille/ dans le navigateur. Sans serveur, ouvrir `index.html` marche aussi.
- `.claude/launch.json` : aperçu de l'app Claude (`../../serveur.js muraille --attendre`)
- Serveur de l'atelier (`serveur.js` à la racine) : réutilise un serveur déjà lancé au lieu de planter sur le port
  8080 ; `/` redirige vers le jeu demandé (ou liste les jeux) ; `/muraille` → `/muraille/` (sinon le code du jeu
  ne se chargeait pas) ; aucune mise en cache (toujours la dernière version des fichiers)

## À faire
- [x] Style encre + adaptation à la maquette
- [x] Seconde ressource : cristaux → talents + sorts
- [ ] Équilibrer les sorts en jouant (la pluie est peut-être trop forte contre les petits monstres)
- [x] Soldats au corps à corps devant la muraille (Dojo des samouraïs)
- [x] Plateau personnalisable : Rizière, Fauconnerie, Tour à balistes, Dojo
- [x] Les 8 autres cartes : Comptoir, Monastère, Temple, Alchimiste, Poudrerie, Pagode, Fossé, Sanctuaire
- [ ] Sons (pinceau, flèches, « splash » d'encre)
- [ ] Ennemis volants / qui escaladent
- [ ] Indication visuelle de la portée des archers
