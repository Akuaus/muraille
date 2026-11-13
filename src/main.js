'use strict';
// =====================================================================
//  MURAILLE — défense de muraille + gestion de village
//  Direction artistique : lavis d'encre (sumi-e), accents rouges
// =====================================================================

const canvas = document.getElementById('jeu');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;   // 720 × 960 (plus haut sur un téléphone allongé : voir index.html)
// Téléphone allongé : le jeu fait 720 de large et jusqu'à 1 600 de haut. D = hauteur en plus : la vallée s'allonge
// d'autant (la muraille, le socle et les cartes restent en bas de l'écran, l'horizon et le compteur en haut).
// Les menus et fenêtres gardent leur mise en page 720 × 960, centrés verticalement (décalage DC).
const D = H - 960, DC = Math.round(D / 2);
let decalCourant = 0; // décalage vertical en cours (0, ou DC pendant le dessin d'un menu centré)
// dessine fn dans le cadre 720 × 960 centré verticalement ; la souris est décalée d'autant pendant ce dessin
function centrer(fn) {
  if (!DC) return fn();
  const brute = souris; souris = { x: brute.x, y: brute.y - DC };
  ctx.save(); ctx.translate(0, DC); decalCourant = DC;
  try { return fn(); } finally { ctx.restore(); decalCourant = 0; souris = brute; }
}
// Écran tactile (téléphone, tablette) : textes « Touchez », plein écran au premier toucher
const TACTILE = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
const CLIQUEZ = TACTILE ? 'Touchez' : 'Cliquez';
// Netteté : le jeu garde ses coordonnées 720 × 960, mais la toile suit la densité de l'écran
// (sur un téléphone, 720 px de jeu s'affichent sur ~1 100 pixels réels : sans cela, le texte serait flou)
function ajusterResolution() {
  const b = canvas.getBoundingClientRect(); if (!b.width) return;
  const k = Math.min(2.5, Math.max(1, b.width * (window.devicePixelRatio || 1) / W));
  const lw = Math.round(W * k), lh = Math.round(H * k);
  if (canvas.width === lw && canvas.height === lh) return;
  canvas.width = lw; canvas.height = lh;
  ctx.setTransform(lw / W, 0, 0, lh / H, 0, 0);
  ctx.imageSmoothingQuality = 'high';
}
ajusterResolution();
addEventListener('resize', ajusterResolution);
document.addEventListener('fullscreenchange', ajusterResolution);

const MUR_Y = 708 + D;      // haut de la muraille (au centre ; elle s'incurve vers les bords)
const MUR_FACE = 80;        // hauteur de la face du mur
const SOCLE_Y = 800 + D;    // début du socle d'encre (interface)
const CHAMP_H = 760 + D;    // hauteur du calque des taches
const CRI_DUREE = 1.4;       // rugissement du chef en arrivant à la muraille (s)
const REACTION_DUREE = 0.25; // pose « touché » d'une planche, au plus une fois toutes les ~1,2 s
const ARRET_MUR = 22;       // les monstres s'arrêtent juste devant les créneaux (pour rester visibles)

const ENCRE = '#1b1719';
const ENCRE_DOUCE = '#2e2a2b';
const PAPIER = '#f3e4cf';
const PARCHEMIN = '#efdfc4';
const ROUGE = '#c0232b';
const ROUGE_FONCE = '#8e1a20';
// Calligraphie : « Pinceau » (Permanent Marker) pour titres, boutons et chiffres ; « Plume » (Caveat Brush) pour les
// textes manuscrits. Polices embarquées (assets/polices/), chargées par index.html avant le jeu.
const SERIF = '"Plume", Georgia, "Times New Roman", serif';
const SANS = '"Pinceau", "Segoe UI", "Trebuchet MS", Arial, sans-serif';
// Police d'un texte : le pinceau est déjà épais (pas de faux gras) ; la plume n'a pas d'italique (pas de faux penché)
// et paraît plus petite à taille égale (agrandie de 18 %).
function fonte(style, taille, police) {
  if (police.includes('Pinceau')) { style = style.replace('bold', '').trim(); taille *= 0.94; }
  else if (police.includes('Plume')) { style = style.replace('italic', '').trim(); taille *= 1.18; }
  return `${style} ${taille.toFixed(1)}px ${police}`;
}

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const murHaut = x => MUR_Y + 14 * Math.pow((x - W / 2) / (W / 2), 2);

// ---------------------------------------------------------------------
//  Inclinaison de la caméra (profondeur de la vallée)
//  0 = vue plongeante · 1 = penchée · 2 = très penchée, presque à hauteur d'homme (choisie par défaut)
//  Pour comparer sans toucher au code : index.html?inclinaison=1
// ---------------------------------------------------------------------
const INCLINAISONS = [
  { horizon: 0,   apparition: 34,  demiHorizon: 70, echelleMin: 0.5 },
  { horizon: 120, apparition: 134, demiHorizon: 36, echelleMin: 0.32 },
  { horizon: 210, apparition: 222, demiHorizon: 16, echelleMin: 0.2 },
];
const INCLINAISON_DEFAUT = 2;
const INCLINAISON = (() => {
  const n = parseInt(new URLSearchParams(location.search).get('inclinaison'), 10);
  return INCLINAISONS[Number.isInteger(n) && INCLINAISONS[n] ? n : INCLINAISON_DEFAUT];
})();
// ---------------------------------------------------------------------
//  Cycle jour / nuit (purement visuel) : jour → crépuscule → nuit → aube, en boucle.
//  Durées en secondes de jeu ; un cycle complet = 240 s = 2 hordes. index.html?moment=nuit force la nuit.
// ---------------------------------------------------------------------
const CYCLE = { jour: 100, crepuscule: 30, nuit: 80, aube: 30 };
const CYCLE_TOTAL = CYCLE.jour + CYCLE.crepuscule + CYCLE.nuit + CYCLE.aube;
// Nuits dures : effets proportionnels à l'obscurité (0 le jour → plein effet en pleine nuit)
const OR_AUBE = '#a8641c';
const NUIT_EFFETS = { menace: 0.7, portee: -0.25, butin: 0.15, cristauxAube: 3 };
const NUIT_FORCEE = new URLSearchParams(location.search).get('moment') === 'nuit';
const CIEL_NUIT = '#262a3f';
const lisser = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
// 0 = plein jour, 1 = pleine nuit
function niveauNuit(t) {
  if (NUIT_FORCEE) return 1;
  let c = t % CYCLE_TOTAL;
  if (c < CYCLE.jour) return 0;
  c -= CYCLE.jour; if (c < CYCLE.crepuscule) return lisser(c / CYCLE.crepuscule);
  c -= CYCLE.crepuscule; if (c < CYCLE.nuit) return 1;
  c -= CYCLE.nuit; return 1 - lisser(c / CYCLE.aube);
}
// teinte multipliée sur la vallée : papier → orangé doux du crépuscule (à mi-chemin) → bleu de lune.
// Renvoie un dégradé vertical : pendant les transitions, la lumière chaude se concentre vers le ciel
// et s'estompe en descendant vers la muraille ; en pleine nuit, la teinte est uniforme.
const melangeRGB = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
const rgb = c => 'rgb(' + c.join(',') + ')';
function teinteVallee(n) {
  const blanc = [255, 255, 255], crepuscule = [240, 190, 150], lune = [111, 119, 159];
  const haut = n < 0.5 ? melangeRGB(blanc, crepuscule, n * 2) : melangeRGB(crepuscule, lune, (n - 0.5) * 2);
  const bas = melangeRGB(haut, blanc, 0.55 * Math.sin(Math.PI * n));
  const g = ctx.createLinearGradient(0, Y_CIEL, 0, SOCLE_Y);
  g.addColorStop(0, rgb(haut)); g.addColorStop(1, rgb(bas));
  return g;
}
const Y_CIEL = INCLINAISON.horizon;      // ligne d'horizon (au-dessus : le ciel)
const Y_HORIZON = INCLINAISON.apparition; // là où le chemin se perd dans la brume (les monstres y apparaissent)
// profondeur : 0 à l'horizon → 1 au pied du mur
const profondeur = y => clamp((y - Y_CIEL) / (MUR_Y - Y_CIEL), 0, 1);

// Le chemin : étroit au loin, il s'élargit jusqu'à la muraille ; ses méandres s'atténuent avec la distance
const cheminCentre = y => W / 2 + (18 * Math.sin(y / 95) + 10 * Math.sin(y / 37 + 1)) * (0.3 + 0.7 * profondeur(y));
const cheminDemi = y => {
  const f = profondeur(y);
  return INCLINAISON.demiHorizon + (340 - INCLINAISON.demiHorizon) * Math.pow(f, 0.9) + 8 * Math.sin(y / 53) * (0.3 + 0.7 * f);
};
// Échelle des monstres selon la distance (échelle mini à l'horizon → 1 au pied du mur)
const perspective = yPieds => INCLINAISON.echelleMin + (1 - INCLINAISON.echelleMin) * Math.pow(profondeur(yPieds), 0.9);
// Vitesse à l'écran proportionnelle à l'échelle (lents au loin). La compensation est calculée pour que le
// trajet complet dure toujours autant qu'en vue plate (~695 px à vitesse constante), quelle que soit l'inclinaison.
const COMPENSATION_PROFONDEUR = (() => {
  let s = 0; for (let y = Y_HORIZON; y < MUR_Y - 22; y += 1) s += 1 / perspective(y);
  return s / 695;
})();

// ---------------------------------------------------------------------
//  Équilibrage
// ---------------------------------------------------------------------
const REVENU_MINE = [0, 1, 2.5, 5, 9, 15];          // encre/s par niveau de mine
const CAP_TROUPES = [0, 3, 5, 8, 12, 16, 20];       // archers max par niveau de caserne
const CAP_CATAS = [0, 1, 2, 3, 4];                  // catapultes max par niveau d'atelier
const POSTES_CATAS = [150, W - 150, 255, W - 255];

const ARCHER = { degats: 9, recharge: 1.0, portee: Math.round(430 * (MUR_Y - Y_CIEL) / (708 - Y_CIEL)) };
const CRITIQUE = { chance: 0.08, mult: 2 }; // flèches : coup critique (dégâts doublés, chiffre rouge)
// amélioration de niveau « Main sûre » : +4 % de chance et +0,25 au multiplicateur par niveau (max 5 : 28 %, ×3,25)
const chanceCritique = () => CRITIQUE.chance + 0.04 * nv('critique'), multCritique = () => CRITIQUE.mult + 0.25 * nv('critique');
// zone = rayon d'impact au pied du mur ; il rétrécit au loin avec la perspective (×0,2 à l'horizon)
const CATAPULTE = { degats: 45, recharge: 4.5, zone: 85, vol: 1.2 };

const TYPES = {
  gobelin:  { nom: 'Gobelin',        pv: 20,   vit: 46, dps: 4,  or: 2,   r: 9,  cout: 1,  deb: 0,   poids: 10, armure: 0,    ech: 1.15 },
  orc:      { nom: 'Orc',            pv: 65,   vit: 30, dps: 10, or: 5,   r: 13, cout: 3,  deb: 75,  poids: 5,  armure: 0,    ech: 1.05 },
  rodeur:   { nom: 'Rôdeur',         pv: 28,   vit: 88, dps: 5,  or: 4,   r: 8,  cout: 2,  deb: 150, poids: 4,  armure: 0,    ech: 1.2 },
  bouclier: { nom: 'Porte-bouclier', pv: 90,   vit: 25, dps: 8,  or: 7,   r: 14, cout: 5,  deb: 220, poids: 3,  armure: 0.65, ech: 1.05 },
  troll:    { nom: 'Troll',          pv: 380,  vit: 15, dps: 25, or: 22,  r: 23, cout: 12, deb: 400, poids: 2,  armure: 0,    ech: 1.0 },
  chef:     { nom: 'Chef de guerre', pv: 1100, vit: 13, dps: 40, or: 120, r: 30, cout: 0,  deb: Infinity, poids: 0, armure: 0.2, ech: 1.0 },
};

// Menace (≈ « gobelins par seconde ») : croît doucement puis de plus en plus vite.
// Au-delà de DIFFICULTE.debut minutes, la menace et les PV deviennent exponentiels (le début de partie ne change pas).
const DIFFICULTE = { debut: 12, pvParMinute: 1.07, menaceParMinute: 1.03 };
const minutesExpo = t => Math.max(0, t / 60 - DIFFICULTE.debut);
function tauxMenace(t) { const m = t / 60; return (0.45 + 0.11 * Math.pow(m, 1.25)) * Math.pow(DIFFICULTE.menaceParMinute, minutesExpo(t)); }
// Les ennemis deviennent plus robustes avec le temps.
// (terme en m² passé de 0,004 à 0,012 avec les niveaux d'XP, qui renforcent le joueur au fil de la partie)
function echellePV(t) { const m = t / 60; return (1 + 0.07 * m + 0.012 * m * m) * Math.pow(DIFFICULTE.pvParMinute, minutesExpo(t)); }
// Hordes : toutes les 2 min (dès 1 min 40), 15 s de rush puis 7 s de répit.
const HORDE_DEBUT = 100, HORDE_CYCLE = 120, HORDE_DUREE = 15, REPIT_DUREE = 7;
function etatHorde(t) {
  if (t < HORDE_DEBUT) return { mult: 1, horde: false, dans: HORDE_DEBUT - t };
  const c = (t - HORDE_DEBUT) % HORDE_CYCLE;
  if (c < HORDE_DUREE) return { mult: 2.5, horde: true, dans: 0 };
  if (c < HORDE_DUREE + REPIT_DUREE) return { mult: 0.25, horde: false, dans: HORDE_CYCLE - c };
  return { mult: 1, horde: false, dans: HORDE_CYCLE - c };
}
const vague = t => t < HORDE_DEBUT ? 1 : Math.floor((t - HORDE_DEBUT) / HORDE_CYCLE) + 2;

// ---------------------------------------------------------------------
//  Bâtiments du village & actions
// ---------------------------------------------------------------------
// Plateau personnalisable : la Caserne est fixe, les 4 autres emplacements se choisissent avant la partie
// (écran « Préparer la muraille ») parmi les cartes de leur famille. Les nouvelles cartes se débloquent avec le record.
const REVENU_RIZIERE = [0, 0.8, 1.6, 2.6, 3.8, 5];   // encre/s de base, ×(1 + 10 % par minute de jeu)
const SAMOURAIS = [0, 2, 3, 4, 5, 6];              // samouraïs par niveau de dojo
const FAUCONS = [0, 1, 2, 2, 3, 4];                // faucons par niveau de fauconnerie
const facteurRiziere = () => 1 + 0.1 * (G ? G.t : 0) / 60;
const XP_MONASTERE = [0, 0.25, 0.5, 0.75, 1, 1.25];   // expérience en plus par niveau de monastère
const OFFRANDE = 25;                                  // encre offerte à chaque niveau gagné, par niveau de monastère
const PERIODE_DRAGON = [0, 24, 21, 18, 15];          // secondes entre deux passages du dragon
const valeurTroc = () => Math.round(150 * (1 + 0.1 * (G ? G.t : 0) / 60) * (G && G.talents.comptoir ? 1.5 : 1));
const TOUS_BATIMENTS = [
  { id: 'mine', famille: 'economie', nom: 'Mine', max: 5, resume: "Revenu d'encre fixe et fiable.",
    cout: l => [60, 140, 300, 600, 1100][l],
    info: l => `Pierre d'encre : ${REVENU_MINE[l]}/s` + (l < 5 ? `  →  ${REVENU_MINE[l + 1]}/s` : '') },
  { id: 'forge', famille: 'soutien', nom: 'Forge', max: 5, resume: 'Dégâts +20 % par niveau, flèches de feu.',
    cout: l => Math.round(90 * Math.pow(1.9, l)),
    info: l => `Dégâts +${l * 20} %` + (l < 5 ? `  →  +${(l + 1) * 20} %` : '') },
  { id: 'caserne', famille: 'caserne', nom: 'Caserne', max: 6, resume: 'Les archers de la muraille.',
    cout: l => [0, 80, 180, 380, 750, 1400][l],
    info: l => `Archers max : ${CAP_TROUPES[l]}` + (l < 6 ? `  →  ${CAP_TROUPES[l + 1]}` : '') },
  { id: 'atelier', famille: 'siege', nom: 'Atelier', max: 4, resume: 'Catapultes : dégâts de zone sur les groupes.',
    cout: l => [200, 400, 800, 1500][l],
    info: l => l === 0 ? 'Débloque les catapultes (dégâts de zone)'
      : `Catapultes max : ${CAP_CATAS[l]}` + (l < 4 ? `  →  ${CAP_CATAS[l + 1]}` : '') },
  { id: 'macon', famille: 'defense', nom: 'Maçonnerie', max: 5, resume: 'PV et réparation de la muraille.',
    cout: l => Math.round(100 * Math.pow(2, l)),
    info: l => `Muraille +${l * 250} PV, ${l * 1.5} PV/s` + (l < 5 ? `  →  +${(l + 1) * 250} PV, ${(l + 1) * 1.5} PV/s` : '') },
  // --- nouvelles cartes
  { id: 'riziere', famille: 'economie', nom: 'Rizière', max: 5, resume: 'Revenu faible au départ, +10 % par minute de jeu.',
    cout: l => [60, 140, 300, 600, 1100][l],
    info: l => `Riz : ${(REVENU_RIZIERE[l] * facteurRiziere()).toFixed(1)}/s (×${facteurRiziere().toFixed(1)} avec le temps)` + (l < 5 ? `  →  ${(REVENU_RIZIERE[l + 1] * facteurRiziere()).toFixed(1)}/s` : '') },
  { id: 'fauconnerie', famille: 'soutien', nom: 'Fauconnerie', max: 5, resume: 'Des faucons marquent leurs proies.',
    cout: l => Math.round(90 * Math.pow(1.9, l)),
    info: l => `Faucons : ${FAUCONS[l]}, marque +${l ? 15 + 7 * l : 0} %` + (l < 5 ? `  →  ${FAUCONS[l + 1]}, +${22 + 7 * l} %` : '') },
  { id: 'balistes', famille: 'siege', nom: 'Balistes', max: 4, resume: 'Carreaux qui transpercent toute une file de monstres.',
    cout: l => [200, 400, 800, 1500][l],
    info: l => l === 0 ? 'Débloque les balistes (carreaux perforants)'
      : `Balistes max : ${CAP_CATAS[l]}` + (l < 4 ? `  →  ${CAP_CATAS[l + 1]}` : '') },
  { id: 'dojo', famille: 'defense', nom: 'Dojo', max: 5, resume: 'Des samouraïs retiennent les monstres.',
    cout: l => Math.round(110 * Math.pow(2, l)),
    info: l => `Samouraïs : ${SAMOURAIS[l]}` + (l < 5 ? `  →  ${SAMOURAIS[l + 1]} (et plus robustes)` : '') },
  { id: 'monastere', famille: 'economie', nom: 'Monastère', max: 5, resume: "XP +25 % par niveau, offrandes d'encre.",
    cout: l => [60, 140, 300, 600, 1100][l],
    info: l => `XP +${l * 25} %, offrande ${l * OFFRANDE} encre/niveau` + (l < 5 ? `  →  +${(l + 1) * 25} %, ${(l + 1) * OFFRANDE}` : '') },
  { id: 'comptoir', famille: 'economie', nom: 'Comptoir', max: 5, resume: 'Butin +12 % par niveau, troc de cristaux.',
    cout: l => [60, 140, 300, 600, 1100][l],
    info: l => `Butin des monstres +${l * 12} %` + (l < 5 ? `  →  +${(l + 1) * 12} %` : '') },
  { id: 'temple', famille: 'soutien', nom: 'Temple', max: 5, resume: 'Aura qui ralentit ; archers plus vifs.',
    cout: l => Math.round(90 * Math.pow(1.9, l)),
    info: l => `Aura : ralenti −${l * 10} %, dégâts subis +${l * 8} % ; cadence +${l * 10} %` + (l < 5 ? `  →  niv. ${l + 1}${l === 4 ? ' : archers impériaux (flèches +50 %)' : ''}` : ' · archers impériaux (flèches +50 %)') },
  { id: 'alchimiste', famille: 'soutien', nom: 'Alchimiste', max: 5, resume: 'Flèches au poison cumulable.',
    cout: l => Math.round(90 * Math.pow(1.9, l)),
    info: l => `Poison : ${l ? 3 + l : 0} doses max, ×${(1 + 0.4 * Math.max(0, l - 1)).toFixed(1)}` + (l < 5 ? `  →  ${4 + l} doses, ×${(1 + 0.4 * l).toFixed(1)}` : '') },
  { id: 'poudrerie', famille: 'siege', nom: 'Poudrerie', max: 4, resume: 'Pots de poudre : explosion, puis le sol brûle.',
    cout: l => [200, 400, 800, 1500][l],
    info: l => l === 0 ? 'Débloque les mortiers à poudre'
      : `Mortiers max : ${CAP_CATAS[l]}` + (l < 4 ? `  →  ${CAP_CATAS[l + 1]}` : '') },
  { id: 'pagode', famille: 'siege', nom: 'Pagode', max: 4, resume: "Un dragon d'encre balaie une rangée de la vallée.",
    cout: l => [250, 500, 950, 1700][l],
    info: l => l === 0 ? 'Éveille le dragon (un passage toutes les 24 s)'
      : `Dragon toutes les ${PERIODE_DRAGON[l]} s, dégâts ×${(1 + 0.4 * (l - 1)).toFixed(1)}` + (l < 4 ? `  →  ${PERIODE_DRAGON[l + 1]} s, ×${(1 + 0.4 * l).toFixed(1)}` : '') },
  { id: 'fosse', famille: 'defense', nom: 'Fossé', max: 5, resume: 'Au pied du mur, les monstres saignent.',
    cout: l => Math.round(100 * Math.pow(2, l)),
    info: l => `Saignée ×${l}, ralenti −${l ? 10 + 4 * l : 0} %, muraille +${l * 100} PV` + (l < 5 ? `  →  ×${l + 1}` : '') },
  { id: 'sanctuaire', famille: 'defense', nom: 'Sanctuaire', max: 5, resume: "Lanternes : la nuit perd ses malus, soin à l'aube.",
    cout: l => Math.round(100 * Math.pow(2, l)),
    info: l => `Malus de nuit −${l * 20} %, soin à l'aube ${l * 12} %` + (l < 5 ? `  →  −${(l + 1) * 20} %, ${(l + 1) * 12} %` : '') },
];
const FAMILLES = [
  { id: 'economie', nom: 'Économie', cartes: ['mine', 'riziere', 'comptoir', 'monastere'] },
  { id: 'soutien', nom: 'Soutien', cartes: ['forge', 'fauconnerie', 'temple', 'alchimiste'] },
  { id: 'siege', nom: 'Siège', cartes: ['atelier', 'balistes', 'poudrerie', 'pagode'] },
  { id: 'defense', nom: 'Défense', cartes: ['macon', 'dojo', 'fosse', 'sanctuaire'] },
];
// déblocage selon le record (en secondes)
const DEBLOCAGE = { riziere: 0, comptoir: 2 * 60, fosse: 4 * 60, balistes: 5 * 60, poudrerie: 7 * 60, monastere: 8 * 60,
  fauconnerie: 10 * 60, temple: 12 * 60, dojo: 15 * 60, sanctuaire: 18 * 60, alchimiste: 20 * 60, pagode: 22 * 60 };
// Alliances : deux cartes du plateau qui vont bien ensemble donnent un bonus (actif dès que les deux sont choisies)
const ALLIANCES = [
  { id: 'fonderie',  nom: 'Fonderie',            cartes: ['mine', 'forge'],             desc: 'tous les dégâts +10 %' },
  { id: 'rails',     nom: 'Rails de mine',       cartes: ['mine', 'atelier'],           desc: 'catapultes rechargées 15 % plus vite' },
  { id: 'paysans',   nom: 'Paysans-soldats',     cartes: ['riziere', 'dojo'],           desc: 'samouraïs +35 % PV, reviennent 2× plus vite' },
  { id: 'terrasses', nom: 'Terrasses de pierre', cartes: ['riziere', 'macon'],          desc: 'revenu de la rizière +25 %' },
  { id: 'venin',     nom: 'Venin précieux',      cartes: ['comptoir', 'alchimiste'],    desc: 'butin des monstres empoisonnés +30 %' },
  { id: 'poudriers', nom: 'Marchands de poudre', cartes: ['comptoir', 'poudrerie'],     desc: 'mortiers à poudre 40 % moins chers' },
  { id: 'ordre',     nom: 'Ordre monastique',    cartes: ['monastere', 'temple'],       desc: 'expérience +20 %' },
  { id: 'veillee',   nom: 'Veillée de prière',   cartes: ['monastere', 'sanctuaire'],   desc: 'la nuit, expérience +50 %' },
  { id: 'ardents',   nom: 'Boulets ardents',     cartes: ['forge', 'atelier'],          desc: 'les boulets enflamment les monstres touchés' },
  { id: 'gregeois',  nom: 'Feu grégeois',        cartes: ['forge', 'poudrerie'],        desc: 'le sol brûle 2 s de plus et 30 % plus fort' },
  { id: 'chasseur',  nom: 'Œil du chasseur',     cartes: ['fauconnerie', 'balistes'],   desc: 'les faucons guident les balistes : recharge −25 %' },
  { id: 'ciel',      nom: 'Seigneurs du ciel',   cartes: ['fauconnerie', 'pagode'],     desc: 'le dragon passe 20 % plus souvent' },
  { id: 'moines',    nom: 'Moines guerriers',    cartes: ['temple', 'dojo'],            desc: 'samouraïs +40 % dégâts, se soignent 6 PV/s' },
  { id: 'fumees',    nom: 'Fumées toxiques',     cartes: ['alchimiste', 'poudrerie'],   desc: 'le sol embrasé empoisonne aussi' },
  { id: 'enduits',   nom: 'Pieux enduits',       cartes: ['alchimiste', 'fosse'],       desc: 'les monstres au mur sont empoisonnés' },
  { id: 'ligne',     nom: 'Ligne de pieux',      cartes: ['dojo', 'fosse'],             desc: 'les monstres retenus par un samouraï saignent' },
  { id: 'lanternes', nom: 'Dragon des lanternes', cartes: ['pagode', 'sanctuaire'],     desc: 'la nuit, le dragon passe 2× plus souvent' },
  { id: 'tours',     nom: 'Tours de pierre',     cartes: ['macon', 'balistes'],         desc: 'balistes +20 % dégâts' },
];
const alliancesDe = ids => ALLIANCES.filter(a => a.cartes.every(c => ids.includes(c)));
const alliance = id => !!(G && G.alliances && G.alliances.has(id));
// =====================================================================
//  PIÈCES : chaque partie en rapporte (2 par minute tenue + 1 tous les 50 monstres abattus) ; on les dépense à l'écran
//  « Préparer la muraille » pour débloquer les cartes (prix = ancien ordre de déblocage par record). Les cartes déjà
//  acquises avec l'ancien système (record) le restent. Mémorisé : 'muraille-pieces', 'muraille-cartes'.
// =====================================================================
const PRIX_CARTE = { comptoir: 10, fosse: 15, balistes: 18, poudrerie: 25, monastere: 28, fauconnerie: 35, temple: 40,
  dojo: 50, sanctuaire: 60, alchimiste: 65, pagode: 70 };
const piecesDePartie = (t, kills) => Math.round(t / 30) + Math.floor(kills / 50);
let pieces = 0, cartesDebloquees = null;
try { pieces = +localStorage.getItem('muraille-pieces') || 0; cartesDebloquees = JSON.parse(localStorage.getItem('muraille-cartes') || 'null'); } catch (e) { /* ignoré */ }
if (!Array.isArray(cartesDebloquees)) { // première fois : les cartes déjà débloquées par le record restent acquises
  let rec = 0; try { rec = +localStorage.getItem('muraille-record') || 0; } catch (e) { /* ignoré */ }
  cartesDebloquees = Object.keys(DEBLOCAGE).filter(id => DEBLOCAGE[id] > 0 && DEBLOCAGE[id] <= rec);
  sauverPieces();
}
cartesDebloquees = new Set(cartesDebloquees);
function sauverPieces() { try { localStorage.setItem('muraille-pieces', String(pieces)); localStorage.setItem('muraille-cartes', JSON.stringify([...cartesDebloquees])); } catch (e) { /* ignoré */ } }
const prixCarte = id => PRIX_CARTE[id] || 0;
const debloque = id => !prixCarte(id) || cartesDebloquees.has(id);
function acheterCarte(id) {
  if (debloque(id) || pieces < prixCarte(id)) return false;
  pieces -= prixCarte(id); cartesDebloquees.add(id); sauverPieces(); return true;
}
// pièce de monnaie ancienne (ronde, trou carré), dessinée à l'encre dorée
function iconePiece(c, x, y, r) {
  c.save();
  c.fillStyle = '#c9962e'; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
  c.strokeStyle = '#7a5410'; c.lineWidth = Math.max(1, r * 0.16); c.stroke();
  c.beginPath(); c.arc(x, y, r * 0.68, 0, 7); c.lineWidth = Math.max(0.8, r * 0.08); c.stroke();
  c.fillStyle = '#f3e4cf'; const q = r * 0.3; c.fillRect(x - q, y - q, 2 * q, 2 * q);
  c.restore();
}
const batimentDe = id => TOUS_BATIMENTS.find(b => b.id === id);
let PLATEAU = { economie: 'mine', soutien: 'forge', siege: 'atelier', defense: 'macon' };
try { const p = JSON.parse(localStorage.getItem('muraille-plateau')); if (p) for (const fa of FAMILLES) if (fa.cartes.includes(p[fa.id])) PLATEAU[fa.id] = p[fa.id]; } catch (e) { /* plateau par défaut */ }
// ordre des cartes à l'écran : économie, soutien, caserne, siège, défense
let BATIMENTS = [];
function composerPlateau(imposees = false) { // imposées (défi du jour) : même les cartes verrouillées
  if (!imposees) for (const fa of FAMILLES) if (!debloque(PLATEAU[fa.id])) PLATEAU[fa.id] = fa.cartes[0];
  BATIMENTS = [batimentDe(PLATEAU.economie), batimentDe(PLATEAU.soutien), batimentDe('caserne'), batimentDe(PLATEAU.siege), batimentDe(PLATEAU.defense)];
}

const ACTIONS = {
  archer: {
    cout: () => 20 + 6 * G.archers.length,
    dispo: () => G.archers.length < capArchers(),
    libelle: () => `Archer ${G.archers.length}/${capArchers()}`,
    court: () => 'Caserne pleine',
    faire: () => ajouterArcher() },
  catapulte: {
    cout: () => 120 + 60 * G.catas.length,
    dispo: () => G.bat.atelier > 0 && G.catas.length < CAP_CATAS[G.bat.atelier],
    libelle: () => `Catapulte ${G.catas.length}/${CAP_CATAS[G.bat.atelier]}`,
    court: () => G.bat.atelier === 0 ? "Bâtir d'abord" : 'Atelier plein',
    faire: () => ajouterCatapulte() },
  baliste: {
    cout: () => 140 + 60 * G.balistes.length,
    dispo: () => G.bat.balistes > 0 && G.balistes.length < CAP_CATAS[G.bat.balistes],
    libelle: () => `Baliste ${G.balistes.length}/${CAP_CATAS[G.bat.balistes]}`,
    court: () => G.bat.balistes === 0 ? "Bâtir d'abord" : 'Tour pleine',
    faire: () => ajouterBaliste() },
  pot: {
    cout: () => Math.round((130 + 60 * G.mortiers.length) * (alliance('poudriers') ? 0.6 : 1)),
    dispo: () => G.bat.poudrerie > 0 && G.mortiers.length < CAP_CATAS[G.bat.poudrerie],
    libelle: () => `Mortier ${G.mortiers.length}/${CAP_CATAS[G.bat.poudrerie]}`,
    court: () => G.bat.poudrerie === 0 ? "Bâtir d'abord" : 'Poudrerie pleine',
    faire: () => ajouterMortier() },
  troc: {
    cout: () => 0,
    dispo: () => G.bat.comptoir > 0 && G.cristaux >= 1,
    libelle: () => `1 cristal → ${valeurTroc()}`,
    court: () => G.bat.comptoir === 0 ? "Bâtir d'abord" : 'Aucun cristal',
    faire: () => { G.cristaux -= 1; G.or += valeurTroc(); } },
  reparer: { // chaque réparation coûte 1 encre de plus que la précédente (compteur remis à zéro à chaque partie)
    cout: () => Math.ceil(G.mur.max * 0.1 * 0.3) + (G.reparations || 0),
    dispo: () => G.mur.pv < G.mur.max && !defiModif('sansRep'),
    libelle: () => 'Réparer +10 %',
    court: () => 'Mur intact',
    faire: () => { G.mur.pv = Math.min(G.mur.max, G.mur.pv + G.mur.max * 0.1); G.reparations = (G.reparations || 0) + 1; } },
  feu: {
    cout: () => FEU.cout,
    dispo: () => !G.feu && G.bat.forge >= 1,
    libelle: () => 'Flèches de feu',
    court: () => G.feu ? 'Flèches de feu ✓' : 'Forge niv. 1',
    faire: () => { G.feu = true; banniere('Flèches enflammées !', '#a8461c'); } },
};
const ACTION_DE = { caserne: 'archer', atelier: 'catapulte', macon: 'reparer', forge: 'feu', balistes: 'baliste', poudrerie: 'pot', comptoir: 'troc' };
// Flèches enflammées (achat unique à la Forge) : la cible brûle quelques secondes ; la brûlure ignore l'armure
// et profite des niveaux de Forge. La nuit, flèches et monstres en feu éclairent l'obscurité.
const FEU = { cout: 300, dps: 2.5, duree: 3 };

// ---------------------------------------------------------------------
//  Cristaux : seconde ressource, rare
//  Gagnés : troll +1, chef de guerre +6, chaque horde repoussée +2.
//  Dépensés : un talent unique par bâtiment, et trois sorts à recharge.
// ---------------------------------------------------------------------
const GAIN_CRISTAUX = { chef: 6 };
const CHANCE_CRISTAL = { troll: 0.25 }; // un troll n'a plus qu'une chance sur 4 de lâcher un cristal
const CRISTAUX_HORDE = 2;

const TALENTS = {
  mine:    { nom: 'Veine profonde',       desc: 'Revenu de la mine ×1,5',                       cout: 6 },
  forge:   { nom: 'Pointes perce-armure', desc: "Les flèches ignorent la moitié de l'armure",     cout: 8 },
  caserne: { nom: 'Arcs longs',           desc: 'Archers : portée +30 %, cadence +15 %',         cout: 8 },
  atelier: { nom: "Pots d'encre",         desc: 'Catapultes : zone +40 %, recharge −20 %',       cout: 8 },
  macon:   { nom: 'Remparts bénis',       desc: 'Muraille +300 PV, régénération doublée (+1 PV/s)', cout: 8 },
  riziere: { nom: 'Irrigation',           desc: 'Revenu de la rizière ×1,5',                     cout: 6 },
  fauconnerie: { nom: "Serres d'acier",   desc: 'Faucons : dégâts +50 %, vol plus rapide',       cout: 8 },
  balistes: { nom: 'Carreaux barbelés',   desc: 'Balistes : dégâts +40 %, recharge −20 %',       cout: 8 },
  dojo:    { nom: 'Voie du sabre',        desc: 'Samouraïs : PV et dégâts +50 %',                cout: 8 },
  monastere: { nom: 'Sutras',             desc: 'Expérience du monastère ×1,4',                   cout: 6 },
  comptoir: { nom: 'Guilde marchande',    desc: 'Butin ×1,25, troc +50 %',                        cout: 6 },
  temple:  { nom: 'Gong sacré',           desc: 'Ralentissement ×1,5, cadence des archers +10 %', cout: 8 },
  alchimiste: { nom: 'Contagion',         desc: 'Un monstre empoisonné qui meurt contamine ses voisins', cout: 8 },
  poudrerie: { nom: 'Poudre noire',       desc: 'Explosions +40 %, le sol brûle 2 s de plus',     cout: 8 },
  pagode:  { nom: 'Dragon ancestral',     desc: 'Dégâts du dragon +60 %, bande plus large',        cout: 8 },
  fosse:   { nom: 'Pieux empoisonnés',    desc: 'Saignée ×2, ralentissement +15 %',               cout: 8 },
  sanctuaire: { nom: 'Veilleurs',         desc: 'La nuit, cadence des archers +25 %',             cout: 8 },
};

const SORTS = [
  { id: 'pluie',   nom: "Pluie d'encre", desc: 'frappe tous les monstres présents',      cout: 3, recharge: 40, touche: 'E' },
  { id: 'brume',   nom: 'Brume',         desc: 'ralentit tous les monstres de moitié (8 s)', cout: 2, recharge: 30, touche: 'B' },
  { id: 'rempart', nom: 'Rempart',       desc: 'répare 40 % de la muraille',             cout: 2, recharge: 45, touche: 'F' },
  { id: 'raz',     nom: 'Raz-de-marée',  desc: "une vague d'encre déferle sur toute la vallée", cout: 25, recharge: 120, touche: 'T' },
];
const PLUIE_DEGATS = 50, BRUME_DUREE = 8, RAZ_DEGATS = 250;
// ---------------------------------------------------------------------
//  Raz-de-marée dessiné (assets/vague.webp) : 8 images (2 rangées de 4) d'une vague qui monte de la muraille vers
//  l'horizon puis retombe en écume. On ne garde que l'encre des vagues : le papier de l'image devient neutre (blanc,
//  dessiné en « multiply »), les tirets des bords sont retirés, et chaque image est déformée ligne par ligne pour épouser
//  NOTRE chemin (largeur et méandres) : l'allée du jeu n'est pas modifiée, l'écume claire laisse voir le chemin.
// ---------------------------------------------------------------------
const VAGUE = { src: 'assets/vague.webp', colonnes: 4, rangees: 2, duree: 2.2, montee: 0.6, marge: 0.06 };
let imagesVague = null;
{ const img = new Image(); img.onload = () => { try { imagesVague = preparerVague(img); } catch (e) { imagesVague = null; } }; img.src = VAGUE.src; }
function preparerVague(img) {
  const iw = img.width, ih = img.height, c = creerCanvas(iw, ih), k = c.getContext('2d');
  k.drawImage(img, 0, 0);
  const id = k.getImageData(0, 0, iw, ih), d = id.data;
  const lum = p => (d[p * 4] + d[p * 4 + 1] + d[p * 4 + 2]) / 3;
  const cw = iw / VAGUE.colonnes, ch = ih / VAGUE.rangees, yHaut = Y_CIEL, yBas = MUR_Y + 4;
  const images = [];
  for (let r = 0; r < VAGUE.rangees; r++) for (let q = 0; q < VAGUE.colonnes; q++) {
    const x0 = Math.round(q * cw), x1 = Math.round((q + 1) * cw), y0 = Math.round(r * ch), y1 = Math.round((r + 1) * ch);
    // bords de l'allée dessinée, ligne par ligne (l'image est transparente autour de l'allée)
    const bords = [];
    let haut = -1, bas = -1;
    for (let y = y0; y < y1; y++) {
      let g = -1, dr = -1;
      for (let x = x0; x < x1; x++) if (d[(y * iw + x) * 4 + 3] > 200 && lum(y * iw + x) < 250) { if (g < 0) g = x; dr = x; }
      if (g >= 0 && dr - g > 6) { bords[y] = [g, dr]; if (haut < 0) haut = y; bas = y; }
    }
    // couleur du papier de l'allée (milieu, en haut de l'image, là où il n'y a pas de vague)
    let pr = 0, pg = 0, pb = 0, n = 0;
    for (let y = haut + 20; y < haut + 60; y++) { const [g, dr] = bords[y] || [0, 0]; for (let x = g + (dr - g) * 0.4; x < g + (dr - g) * 0.6; x++) { const p = (y * iw + Math.round(x)) * 4; pr += d[p]; pg += d[p + 1]; pb += d[p + 2]; n++; } }
    pr /= n || 1; pg /= n || 1; pb /= n || 1;
    // image « encre seule » : papier → blanc ; hors de l'allée et sur ses tirets → blanc
    const enc = creerCanvas(x1 - x0, y1 - y0), ek = enc.getContext('2d'), eid = ek.createImageData(x1 - x0, y1 - y0), ed = eid.data;
    for (let y = y0; y < y1; y++) {
      const b = bords[y], m = b ? Math.max(5, (b[1] - b[0]) * VAGUE.marge) : 0;
      for (let x = x0; x < x1; x++) {
        const o = ((y - y0) * (x1 - x0) + (x - x0)) * 4, p = (y * iw + x) * 4;
        let v = [255, 255, 255];
        if (b && x > b[0] + m && x < b[1] - m) {
          v = [d[p] / pr, d[p + 1] / pg, d[p + 2] / pb].map(t => { const u = clamp(t, 0, 1.2); return u > 0.86 ? 255 : Math.round(255 * Math.pow(u / 0.86, 1.1)); });
        }
        ed[o] = v[0]; ed[o + 1] = v[1]; ed[o + 2] = v[2]; ed[o + 3] = 255;
      }
    }
    ek.putImageData(eid, 0, 0);
    // déformation vers notre chemin : chaque ligne de l'écran prend la ligne correspondante de l'image
    const out = creerCanvas(W, yBas - yHaut), ok = out.getContext('2d');
    ok.fillStyle = '#fff'; ok.fillRect(0, 0, W, out.height);
    for (let y = yHaut; y < yBas; y += 2) {
      const v = (y - yHaut) / (yBas - yHaut), ys = Math.round(haut + v * (bas - haut)), b = bords[ys];
      if (!b) continue;
      const cx = cheminCentre(y), dm = cheminDemi(y);
      ok.drawImage(enc, b[0] - x0, ys - y0, b[1] - b[0], 1, cx - dm, y - yHaut, 2 * dm, 2);
    }
    images.push(out);
  }
  return { images, yHaut };
}

// ---------------------------------------------------------------------
//  Expérience et niveaux : chaque monstre abattu rapporte de l'XP ; à chaque niveau, le jeu se fige et propose
//  3 améliorations tirées au sort (certaines se cumulent jusqu'à « max »).
// ---------------------------------------------------------------------
const XP_MONSTRE = { gobelin: 1, rodeur: 2, orc: 3, bouclier: 4, troll: 10, chef: 40 };
// XP pour passer du niveau n au n+1 : 8, 12, 17, 22, 27… (raccourcie : ~1,5× plus de niveaux, niv. ~36 vers 30 min)
const xpPourNiveau = n => Math.round(8 * Math.pow(1.17, n - 1) + 3 * (n - 1));
const AMELIORATIONS = [
  { id: 'cadence',  nom: 'Tir soutenu',       desc: 'Cadence des archers +8 %', max: 8, icone: 'arc' },
  { id: 'pointes',  nom: 'Pointes acérées',   desc: 'Dégâts des flèches +10 %', max: 8, icone: 'arc' },
  { id: 'faucon',   nom: 'Œil de faucon',     desc: 'Portée des archers +7 %', max: 4, icone: 'oeil' },
  { id: 'volee',    nom: 'Volée double',      desc: '10 % de chance de tirer une seconde flèche', max: 5, icone: 'arc' },
  { id: 'critique', nom: 'Main sûre',         desc: 'Flèches : coups critiques +4 % de chance et +25 % plus forts', max: 5, icone: 'oeil' },
  { id: 'ricochet', nom: 'Ricochet',          desc: '17 % de chance qu\'une flèche rebondisse sur un monstre voisin', max: 3, icone: 'arc' },
  { id: 'recrues',  nom: 'Recrues',           desc: '+1 archer maximum à la caserne', max: 6, icone: 'arc' },
  { id: 'mortiers', nom: 'Mortiers lourds',   desc: 'Dégâts des engins de siège +17 %', max: 4, icone: 'cata', dispo: () => G.bat.atelier > 0 || G.bat.balistes > 0 || G.bat.poudrerie > 0 || G.bat.pagode > 0 },
  { id: 'treuils',  nom: 'Treuils graissés',  desc: 'Recharge des engins de siège −10 %', max: 4, icone: 'cata', dispo: () => G.bat.atelier > 0 || G.bat.balistes > 0 || G.bat.poudrerie > 0 || G.bat.pagode > 0 },
  { id: 'kenjutsu', nom: 'Kenjutsu',         desc: 'Samouraïs : dégâts +20 %', max: 4, icone: 'sabre', dispo: () => G.bat.dojo > 0 },
  { id: 'pelerins', nom: 'Faucons pèlerins', desc: '+1 faucon', max: 3, icone: 'faucon', dispo: () => G.bat.fauconnerie > 0 },
  { id: 'pierres',  nom: 'Pierres de taille', desc: 'Muraille +150 PV (et réparée d\'autant)', max: 7, icone: 'mur', appliquer: () => { G.mur.max += 150; G.mur.pv += 150; } },
  { id: 'mortier',  nom: 'Mortier frais',     desc: 'La muraille se répare de 1,5 PV/s', max: 4, icone: 'mur' },
  { id: 'herses',   nom: 'Herses',            desc: 'Dégâts subis par la muraille −7 %', max: 4, icone: 'mur' },
  { id: 'dime',     nom: 'Dîme du village',   desc: '+1 goutte d\'encre par seconde', max: 5, icone: 'encre' },
  { id: 'pillage',  nom: 'Pillage',           desc: 'Encre récoltée par monstre +20 %', max: 3, icone: 'encre' },
  { id: 'eclats',   nom: 'Éclats de cristal', desc: '3 % de chance qu\'un monstre lâche un cristal', max: 4, icone: 'cristal' },
  { id: 'grimoire', nom: 'Grimoire',          desc: 'Recharge des sorts −15 %', max: 3, icone: 'sort' },
  { id: 'braises',  nom: 'Braises',           desc: 'Brûlure des flèches de feu +35 % (dégâts et durée)', max: 3, icone: 'feu', dispo: () => G.feu },
];
const nv = id => (G && G.amelio && G.amelio[id]) || 0; // nombre de fois qu'une amélioration a été choisie
const capArchers = () => CAP_TROUPES[G.bat.caserne] + nv('recrues') + herit('veterans');

function gagnerXP(n) {
  G.xp += n * (1 + XP_MONASTERE[G.bat.monastere] * (G.talents.monastere ? 1.4 : 1)) * (1 + 0.1 * herit('memoire'))
    * (alliance('ordre') ? 1.2 : 1) * (alliance('veillee') ? 1 + 0.5 * niveauNuit(G.t) : 1);
  while (G.xp >= xpPourNiveau(G.niveau)) { G.xp -= xpPourNiveau(G.niveau); G.niveau++; G.niveauxEnAttente++; G.or += OFFRANDE * G.bat.monastere; }
  if (!G.choixNiveau && G.niveauxEnAttente > 0) ouvrirChoixNiveau();
}
function ouvrirChoixNiveau() {
  const possibles = AMELIORATIONS.filter(a => nv(a.id) < a.max && (!a.dispo || a.dispo()));
  const tirage = [];
  while (tirage.length < 3 && possibles.length) tirage.push(possibles.splice(Math.floor(Math.random() * possibles.length), 1)[0]);
  G.choixNiveau = { cartes: tirage, niveau: G.niveau - G.niveauxEnAttente + 1, ouvert: performance.now() };
  if (!tirage.length) { G.or += 100; fermerChoixNiveau(); } // tout est au maximum : un peu d'encre à la place
}
function choisirAmelioration(a) {
  G.amelio[a.id] = nv(a.id) + 1;
  if (a.appliquer) a.appliquer();
  fermerChoixNiveau();
}
function fermerChoixNiveau() {
  G.niveauxEnAttente = Math.max(0, G.niveauxEnAttente - 1);
  G.choixNiveau = null;
  if (G.niveauxEnAttente > 0) ouvrirChoixNiveau();
}

// Prestige : une fois au maximum, Forge, Maçonnerie et Atelier continuent de monter, à coût exponentiel
const PRESTIGE = {
  forge:   { base: 3000, info: n => `Prestige ★${n} : dégâts +${n * 10} %  →  +${(n + 1) * 10} %` },
  macon:   { base: 2500, info: n => `Prestige ★${n} : muraille +${n * 300} PV  →  +${(n + 1) * 300} PV`,
             appliquer: () => { G.mur.max += 300; G.mur.pv += 300; } },
  atelier: { base: 3500, info: n => `Prestige ★${n} : catapultes +${n * 15} %  →  +${(n + 1) * 15} %` },
  balistes: { base: 3500, info: n => `Prestige ★${n} : balistes +${n * 15} %  →  +${(n + 1) * 15} %` },
  dojo:    { base: 2800, info: n => `Prestige ★${n} : samouraïs +${n * 15} %  →  +${(n + 1) * 15} %` },
  fauconnerie: { base: 3000, info: n => `Prestige ★${n} : faucons +${n * 12} %  →  +${(n + 1) * 12} %` },
  temple:  { base: 3000, info: n => `Prestige ★${n} : cadence +${n * 5} %  →  +${(n + 1) * 5} %` },
  alchimiste: { base: 3000, info: n => `Prestige ★${n} : poison +${n * 15} %  →  +${(n + 1) * 15} %` },
  poudrerie: { base: 3500, info: n => `Prestige ★${n} : mortiers +${n * 15} %  →  +${(n + 1) * 15} %` },
  pagode:  { base: 3500, info: n => `Prestige ★${n} : dragon +${n * 15} %  →  +${(n + 1) * 15} %` },
  fosse:   { base: 2500, info: n => `Prestige ★${n} : saignée +${n * 15} %, +${n * 200} PV  →  +${(n + 1) * 15} %`,
             appliquer: () => { G.mur.max += 200; G.mur.pv += 200; } },
  sanctuaire: { base: 2500, info: n => `Prestige ★${n} : muraille +${n * 300} PV  →  +${(n + 1) * 300} PV`,
             appliquer: () => { G.mur.max += 300; G.mur.pv += 300; } },
};
const PRESTIGE_FACTEUR = 1.6;
const prestige = id => (G.prestige && G.prestige[id]) || 0;
const prestigeCout = id => Math.round(PRESTIGE[id].base * Math.pow(PRESTIGE_FACTEUR, prestige(id)));
function acheterPrestige(id) {
  const c = prestigeCout(id);
  if (G.or < c) return false;
  G.or -= c; G.prestige[id] = prestige(id) + 1;
  if (PRESTIGE[id].appliquer) PRESTIGE[id].appliquer();
  return true;
}

// Reliques : améliorations permanentes en cristaux, sans limite (coût croissant)
const RELIQUES = [
  { id: 'lame',    nom: "Lame d'encre",     desc: 'Tous les dégâts +5 %',          base: 10, pas: 5 },
  { id: 'garde',   nom: 'Pierre de garde',  desc: 'Dégâts subis par la muraille −5 % (jusqu\'à −60 %)', base: 10, pas: 5, max: 12 },
  { id: 'sablier', nom: 'Sablier',          desc: 'Recharge des sorts −5 % (jusqu\'à −50 %)', base: 8, pas: 4, max: 10 },
  { id: 'pacte',   nom: 'Pacte des ombres', desc: 'Expérience gagnée +10 %',       base: 12, pas: 6 },
];
const relique = id => (G && G.reliques && G.reliques[id]) || 0;
const coutRelique = r => r.base + r.pas * relique(r.id);
function acheterRelique(r) {
  if ((r.max && relique(r.id) >= r.max) || G.cristaux < coutRelique(r)) return false;
  G.cristaux -= coutRelique(r); G.reliques[r.id] = relique(r.id) + 1; return true;
}

// =====================================================================
//  HÉRITAGE : progression d'une partie à l'autre. Chaque partie rapporte des sceaux (1 par minute tenue, +5 pour
//  un nouveau record) ; entre deux parties, on les dépense dans des bonus permanents, appliqués dès le départ.
//  Mémorisé dans le navigateur (localStorage 'muraille-sceaux' et 'muraille-heritage').
// =====================================================================
const HERITAGE = [
  { id: 'tresor',     nom: 'Trésor de guerre',     effet: n => `encre de départ +${n * 80}`,      max: 5, base: 3 },
  { id: 'fondations', nom: 'Fondations profondes', effet: n => `muraille +${n * 100} PV`,        max: 5, base: 3 },
  { id: 'mortier',    nom: 'Mortier sacré',        effet: n => `muraille +${n} PV/s`,             max: 4, base: 3 },
  { id: 'lames',      nom: 'Lames ancestrales',    effet: n => `tous les dégâts +${n * 5} %`,     max: 6, base: 5 },
  { id: 'veterans',   nom: 'Archers vétérans',     effet: n => `+${n} archer${n > 1 ? 's' : ''} au départ`, max: 3, base: 4 },
  { id: 'memoire',    nom: 'Mémoire des anciens',  effet: n => `expérience +${n * 10} %`,       max: 5, base: 4 },
  { id: 'cristal',    nom: 'Veine de cristal',     effet: n => `+${n * 3} cristaux au départ`,   max: 4, base: 4 },
];
const coutHeritage = (h, n) => Math.round(h.base * Math.pow(1.7, n));
let heritage = {}, sceaux = 0;
try { heritage = JSON.parse(localStorage.getItem('muraille-heritage')) || {}; sceaux = +localStorage.getItem('muraille-sceaux') || 0; } catch (e) { /* ignoré */ }
const herit = id => (typeof G !== 'undefined' && G && G.defi && G.defi.modif.id === 'sansHeritage') ? 0 : heritage[id] || 0;
function sauverHeritage() { try { localStorage.setItem('muraille-heritage', JSON.stringify(heritage)); localStorage.setItem('muraille-sceaux', String(sceaux)); } catch (e) { /* ignoré */ } }
function acheterHeritage(h) {
  const n = herit(h.id); if (n >= h.max || sceaux < coutHeritage(h, n)) return false;
  sceaux -= coutHeritage(h, n); heritage[h.id] = n + 1; sauverHeritage(); return true;
}
const multDegats = () => (1 + 0.2 * G.bat.forge + 0.1 * prestige('forge')) * (1 + 0.05 * relique('lame')) * (alliance('fonderie') ? 1.1 : 1) * (1 + 0.05 * herit('lames'));
const revenuMine = () => REVENU_MINE[G.bat.mine] * (G.talents.mine ? 1.5 : 1)
  + REVENU_RIZIERE[G.bat.riziere] * facteurRiziere() * (G.talents.riziere ? 1.5 : 1) * (alliance('terrasses') ? 1.25 : 1);
const regenMur = () => G.bat.macon * 1.5 * (G.talents.macon ? 2 : 1) + (G.talents.macon ? 1 : 0) + 1.5 * nv('mortier') + herit('mortier');
// Portée des archers exprimée en part du trajet (et non en pixels), pour que le temps pendant lequel un monstre
// est à portée ne dépende pas de l'inclinaison. 0,55 du trajet ≈ les 430 px d'origine en vue plongeante.
const PORTEE_PART_TRAJET = 0.55;
const TRAJET_RESTANT = (() => { // TRAJET_RESTANT[y] = « durée » (∫ dy / échelle) entre y et le pied du mur
  const fin = Math.round(MUR_Y - 22), t = new Float32Array(fin + 1);
  for (let y = fin - 1; y >= 0; y--) t[y] = t[y + 1] + (y >= Y_HORIZON ? 1 / perspective(y) : 0);
  return t;
})();
function porteeEcran(part) {
  const cible = TRAJET_RESTANT[0] * Math.min(0.98, part);
  let y = TRAJET_RESTANT.length - 1;
  while (y > 0 && TRAJET_RESTANT[y] < cible) y--;
  return MUR_Y - y;
}
const PORTEE_NORMALE = porteeEcran(PORTEE_PART_TRAJET), PORTEE_ARCS_LONGS = porteeEcran(PORTEE_PART_TRAJET * 1.3);
const porteeArcher = () => G.talents.caserne ? PORTEE_ARCS_LONGS : PORTEE_NORMALE;
const rechargeArcher = () => ARCHER.recharge / (G.talents.caserne ? 1.15 : 1) / (1 + 0.08 * nv('cadence'))
  / (1 + 0.1 * G.bat.temple + (G.talents.temple ? 0.1 : 0) + 0.05 * prestige('temple'))
  / (G.talents.sanctuaire ? 1 + 0.25 * niveauNuit(G.t) : 1);
// Sanctuaire : chaque niveau efface 20 % des malus de la nuit (portée, et moitié moins pour l'afflux de monstres)
const attenuationNuit = () => Math.min(1, 0.2 * G.bat.sanctuaire);
// Temple (aura près du mur) et Fossé (pieux au pied du mur) ralentissent les monstres
const AURA_TEMPLE = 220; // portée de l'aura du temple devant la muraille (px)
const dansAura = e => G.bat.temple > 0 && MUR_Y - pieds(e) < AURA_TEMPLE;
function ralentissement(e) {
  let v = 1;
  const d = MUR_Y - pieds(e);
  if (G.bat.temple && d < AURA_TEMPLE) v *= 1 - Math.min(0.6, 0.1 * G.bat.temple * (G.talents.temple ? 1.5 : 1));
  if (G.bat.fosse && d < 75) v *= 1 - (0.1 + 0.04 * G.bat.fosse + (G.talents.fosse ? 0.15 : 0));
  return v;
}
const saigneeFosse = () => 4 * G.bat.fosse * (1 + 0.07 * G.t / 60) * multDegats() * (G.talents.fosse ? 2 : 1) * (1 + 0.15 * prestige('fosse'));
const dosesPoison = () => G.bat.alchimiste ? 3 + G.bat.alchimiste : 0;
const dpsPoison = () => 3.5 * (1 + 0.4 * Math.max(0, G.bat.alchimiste - 1)) * (1 + 0.05 * G.t / 60) * multDegats() * (1 + 0.15 * prestige('alchimiste'));
// ajoute une dose de poison (alliances Fumées toxiques / Pieux enduits : marchent aussi sans flèches)
function empoisonner(e) { e.poison = Math.min(Math.max(dosesPoison(), 3), (e.poison || 0) + 1); e.poisonT = 4; }
function contagion(e) {
  const voisins = G.ennemis.filter(o => !o.mort && o !== e && Math.hypot(o.x - e.x, o.y - e.y) < 90)
    .sort((a, b) => Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(b.x - e.x, b.y - e.y)).slice(0, 2);
  for (const o of voisins) { o.poison = Math.max(o.poison || 0, e.poison); o.poisonT = 4; }
}
const zoneCata = () => CATAPULTE.zone * (G.talents.atelier ? 1.4 : 1);
const rechargeCata = () => CATAPULTE.recharge * (G.talents.atelier ? 0.8 : 1) * (1 - 0.1 * nv('treuils')) * (alliance('rails') ? 0.85 : 1);

// =====================================================================
//  OUTILS DE DESSIN « ENCRE »
// =====================================================================
function creerCanvas(w, h) { const c = document.createElement('canvas'); c.width = Math.ceil(w); c.height = Math.ceil(h); return c; }

function polyLisse(c, pts) {
  const n = pts.length;
  c.beginPath();
  c.moveTo((pts[n - 1][0] + pts[0][0]) / 2, (pts[n - 1][1] + pts[0][1]) / 2);
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    c.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
  }
  c.closePath();
}

// Contour « goutte » ondulant (t anime l'ondulation)
function cheminBlob(c, x, y, rx, ry, seed, t, amp, n = 14) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2;
    const k = 1 + amp * (Math.sin(seed + i * 2.7 + t * 3) * 0.6 + Math.sin(seed * 1.7 + i * 5.1 - t * 2) * 0.4);
    pts.push([x + Math.cos(a) * rx * k, y + Math.sin(a) * ry * k]);
  }
  polyLisse(c, pts);
}

// Coup de pinceau : largeur variable, attaque appuyée, fin effilée,
// option « pinceau sec » (stries claires le long du trait).
function pinceau(c, pts, largeur, couleur = ENCRE, sec = 0, fond = PAPIER) {
  const n = pts.length; if (n < 2) return;
  const g = [], d = [], nx = [], ny = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], p = pts[i];
    let dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const u = i / (n - 1);
    const profil = 0.15 + 0.85 * Math.pow(Math.sin(Math.PI * (0.06 + u * 0.88)), 0.45) * (1 - 0.3 * u);
    const w = largeur * profil * rand(0.88, 1.12) / 2;
    nx.push(-dy); ny.push(dx);
    g.push([p[0] - dy * w, p[1] + dx * w]); d.push([p[0] + dy * w, p[1] - dx * w]);
  }
  c.fillStyle = couleur;
  c.beginPath(); c.moveTo(g[0][0], g[0][1]);
  for (let i = 1; i < n; i++) c.quadraticCurveTo(g[i - 1][0], g[i - 1][1], (g[i - 1][0] + g[i][0]) / 2, (g[i - 1][1] + g[i][1]) / 2);
  c.lineTo(g[n - 1][0], g[n - 1][1]); c.lineTo(d[n - 1][0], d[n - 1][1]);
  for (let i = n - 2; i >= 0; i--) c.quadraticCurveTo(d[i + 1][0], d[i + 1][1], (d[i + 1][0] + d[i][0]) / 2, (d[i + 1][1] + d[i][1]) / 2);
  c.lineTo(d[0][0], d[0][1]); c.closePath(); c.fill();
  if (sec > 0) {
    c.save(); c.strokeStyle = fond; c.lineCap = 'round';
    const stries = 2 + Math.round(largeur / 4);
    for (let s = 0; s < stries; s++) {
      const off = rand(-0.38, 0.38) * largeur, debut = Math.floor(rand(0.25, 0.75) * (n - 1));
      c.globalAlpha = sec * rand(0.4, 1); c.lineWidth = rand(0.5, 1.4);
      c.beginPath();
      for (let i = debut; i < n; i++) {
        const x = pts[i][0] + nx[i] * off, y = pts[i][1] + ny[i] * off;
        i === debut ? c.moveTo(x, y) : c.lineTo(x, y);
      }
      c.stroke();
    }
    c.restore();
  }
}
function trajet(x1, y1, x2, y2, jit) {
  const n = Math.max(3, Math.round(Math.hypot(x2 - x1, y2 - y1) / 22) + 2), pts = [];
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1), j = i && i < n - 1 ? jit : 0;
    pts.push([x1 + (x2 - x1) * u + rand(-j, j), y1 + (y2 - y1) * u + rand(-j, j)]);
  }
  return pts;
}
function coup(c, x1, y1, x2, y2, largeur, couleur = ENCRE, sec = 0, fond = PAPIER) {
  pinceau(c, trajet(x1, y1, x2, y2, largeur * 0.3 + 0.5), largeur, couleur, sec, fond);
}
// Courbe de Bézier quadratique échantillonnée → points pour le pinceau
function courbe(x1, y1, cx, cy, x2, y2, n = 10) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
    pts.push([a * x1 + b * cx + c * x2, a * y1 + b * cy + c * y2]);
  }
  return pts;
}
function cadrePinceau(c, x, y, w, h, ep, couleur = ENCRE) {
  const o = () => rand(-4, 3);
  coup(c, x + o(), y + rand(-1, 1), x + w - o(), y + rand(-1, 1), ep, couleur, 0.5);
  coup(c, x + w + rand(-1, 1), y + o(), x + w + rand(-1, 1), y + h - o(), ep * 0.85, couleur, 0.5);
  coup(c, x + w - o(), y + h + rand(-1, 1), x + o(), y + h + rand(-1, 1), ep, couleur, 0.5);
  coup(c, x + rand(-1, 1), y + h - o(), x + rand(-1, 1), y + o(), ep * 0.85, couleur, 0.5);
}
// Grappe de cristaux (trois éclats)
function cristalIcone(c, x, y, s, couleur, contour = null) {
  const eclat = (cx, by, w, h, pente) => {
    c.beginPath();
    c.moveTo(cx - w / 2, by); c.lineTo(cx - w / 2 + pente, by - h * 0.72); c.lineTo(cx + pente * 0.5, by - h);
    c.lineTo(cx + w / 2 + pente, by - h * 0.72); c.lineTo(cx + w / 2, by); c.closePath();
  };
  const parts = [[x - s * 0.45, y + s * 0.8, s * 0.55, s * 1.2, -s * 0.25], [x + s * 0.45, y + s * 0.8, s * 0.55, s * 1.15, s * 0.22], [x, y + s * 0.8, s * 0.7, s * 1.75, 0]];
  for (const p of parts) {
    eclat(...p); c.fillStyle = couleur; c.fill();
    if (contour) { c.strokeStyle = contour; c.lineWidth = Math.max(1, s * 0.12); c.stroke(); }
    c.strokeStyle = contour || 'rgba(0,0,0,0.25)'; c.lineWidth = Math.max(0.7, s * 0.08);
    c.beginPath(); c.moveTo(p[0] + p[4] * 0.5, p[1] - p[3]); c.lineTo(p[0], p[1]); c.stroke();
  }
}
function goutteIcone(c, x, y, s, couleur) {
  c.fillStyle = couleur;
  c.beginPath(); c.moveTo(x, y - s);
  c.bezierCurveTo(x + s * 0.2, y - s * 0.45, x + s * 0.72, y - s * 0.05, x + s * 0.72, y + s * 0.32);
  c.arc(x, y + s * 0.32, s * 0.72, 0, Math.PI);
  c.bezierCurveTo(x - s * 0.72, y - s * 0.05, x - s * 0.2, y - s * 0.45, x, y - s);
  c.fill();
}

// =====================================================================
//  DÉCOR PRÉ-DESSINÉ : papier, chemin, montagnes, bambous, pruniers
// =====================================================================
// masque = true : la montagne est opaque (fond couleur papier) et cache ce qui est derrière (soleil, chaînes lointaines)
function montagne(k, x, base, w, h, masque = false) {
  const pts = [[x - w / 2, base]];
  const pic = x + rand(-0.08, 0.08) * w, pic2 = x + w * rand(0.18, 0.3);
  pts.push([x - w * 0.3, base - h * rand(0.35, 0.45)], [x - w * 0.16, base - h * 0.62], [pic - w * 0.06, base - h * 0.88], [pic, base - h]);
  pts.push([pic + w * 0.08, base - h * 0.78], [pic2 - w * 0.06, base - h * 0.62], [pic2, base - h * 0.7], [x + w * 0.38, base - h * 0.3], [x + w / 2, base]);
  if (masque) {
    if (masqueMontagnes) { masqueMontagnes.beginPath(); masqueMontagnes.moveTo(pts[0][0], pts[0][1]); for (const p of pts) masqueMontagnes.lineTo(p[0], p[1]); masqueMontagnes.closePath(); masqueMontagnes.fill(); }
    k.save(); k.globalAlpha = 1; k.fillStyle = PAPIER;
    k.beginPath(); k.moveTo(pts[0][0], pts[0][1]); for (const p of pts) k.lineTo(p[0], p[1]); k.closePath(); k.fill();
    k.restore();
  }
  const g = k.createLinearGradient(0, base - h, 0, base);
  g.addColorStop(0, 'rgba(60,54,52,0.7)'); g.addColorStop(0.6, 'rgba(60,54,52,0.28)'); g.addColorStop(1, 'rgba(60,54,52,0)');
  k.fillStyle = g;
  k.beginPath(); k.moveTo(pts[0][0], pts[0][1]); for (const p of pts) k.lineTo(p[0], p[1]); k.closePath(); k.fill();
  // arêtes au pinceau
  k.globalAlpha = 0.85;
  pinceau(k, [pts[4], pts[3], pts[2], pts[1]], 3.2, ENCRE_DOUCE, 0.6);
  pinceau(k, [pts[4], pts[5], [pts[5][0] + w * 0.04, pts[5][1] + h * 0.25]], 2, ENCRE_DOUCE, 0.5);
  pinceau(k, [pts[7], pts[8], pts[9]], 2, ENCRE_DOUCE, 0.5);
  // stries de pinceau sec sur le flanc
  k.globalAlpha = 0.35;
  for (let i = 0; i < 7; i++) {
    const sx = rand(pic - w * 0.1, pic + w * 0.25), sy = base - h * rand(0.25, 0.75);
    coup(k, sx, sy, sx + rand(-10, -4), sy + rand(8, 18), 1.4, ENCRE_DOUCE);
  }
  k.globalAlpha = 1;
}

function bambou(k, x, base, h, tiges) {
  for (let s = 0; s < tiges; s++) {
    const x0 = x + s * rand(8, 14) - tiges * 5, hh = h * rand(0.7, 1), pente = rand(-0.12, 0.12);
    let y = base;
    const seg = rand(24, 34);
    while (y > base - hh) {
      const y2 = Math.max(base - hh, y - seg), xa = x0 + (base - y) * pente, xb = x0 + (base - y2) * pente;
      k.globalAlpha = 0.85;
      pinceau(k, [[xa, y - 1], [(xa + xb) / 2, (y + y2) / 2], [xb, y2 + 1]], 4.2, ENCRE_DOUCE, 0.5);
      // nœud et feuilles
      k.globalAlpha = 0.9; coup(k, xb - 3, y2, xb + 3, y2, 1.6, ENCRE);
      if (y2 < base - hh * 0.35 && Math.random() < 0.6) {
        const nb = 2 + Math.floor(Math.random() * 3);
        for (let f = 0; f < nb; f++) {
          const a = (Math.random() < 0.5 ? -1 : 1) * rand(0.4, 1.3) - Math.PI / 2 + Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1) * 0.2;
          const L = rand(16, 28);
          k.globalAlpha = rand(0.6, 0.95);
          pinceau(k, courbe(xb, y2, xb + Math.cos(a) * L * 0.5, y2 + Math.sin(a) * L * 0.4, xb + Math.cos(a) * L, y2 + Math.sin(a) * L * 0.6 + 6, 6), 5, ENCRE_DOUCE);
        }
      }
      y = y2;
    }
  }
  k.globalAlpha = 1;
}

function fleur(k, x, y, r) {
  k.fillStyle = ROUGE;
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2 + rand(0, 0.3);
    k.beginPath(); k.arc(x + Math.cos(a) * r * 0.65, y + Math.sin(a) * r * 0.65, r * 0.55, 0, 7); k.fill();
  }
  k.fillStyle = ROUGE_FONCE; k.beginPath(); k.arc(x, y, r * 0.3, 0, 7); k.fill();
}
function prunier(k, x0, y0, dir, L) {
  // branche principale noueuse
  const pts = [];
  let x = x0, y = y0, a = dir;
  for (let i = 0; i < 9; i++) { pts.push([x, y]); a += rand(-0.35, 0.35); x += Math.cos(a) * L / 8; y += Math.sin(a) * L / 8; }
  pinceau(k, pts, 11, ENCRE, 0.7);
  const fleurs = [];
  for (let b = 0; b < 4; b++) {
    const p = pts[2 + b * 2] || pts[pts.length - 1], ab = dir + rand(-1.2, 1.2), lb = rand(40, 75);
    const sp = courbe(p[0], p[1], p[0] + Math.cos(ab) * lb * 0.5 + rand(-10, 10), p[1] + Math.sin(ab) * lb * 0.5 + rand(-10, 10), p[0] + Math.cos(ab) * lb, p[1] + Math.sin(ab) * lb, 6);
    pinceau(k, sp, 4.5, ENCRE, 0.5);
    for (const q of sp.slice(2)) if (Math.random() < 0.8) fleurs.push([q[0] + rand(-7, 7), q[1] + rand(-7, 7)]);
  }
  for (const q of pts.slice(3)) if (Math.random() < 0.7) fleurs.push([q[0] + rand(-9, 9), q[1] + rand(-9, 9)]);
  for (const f of fleurs) {
    if (Math.random() < 0.3) { k.fillStyle = ROUGE; k.beginPath(); k.arc(f[0], f[1], rand(1.2, 2), 0, 7); k.fill(); }
    else fleur(k, f[0], f[1], rand(3, 4.6));
  }
}

function herbe(k, x, y, taille = 1) {
  const n = 4 + Math.floor(Math.random() * 4);
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + rand(-0.7, 0.7), L = rand(10, 26) * taille;
    k.globalAlpha = rand(0.55, 0.9);
    pinceau(k, courbe(x + rand(-4, 4), y, x + Math.cos(a) * L * 0.4, y - L * 0.6, x + Math.cos(a) * L, y + Math.sin(a) * L, 6), 2.6 * taille, ENCRE_DOUCE);
  }
  k.globalAlpha = 1;
}
function cailloux(k, x, y) {
  for (let i = 0; i < 3; i++) {
    const r = rand(2, 5);
    k.globalAlpha = 0.5; k.fillStyle = '#8f8682';
    cheminBlob(k, x + i * rand(5, 9), y - r * 0.4, r * 1.3, r, Math.random() * 9, 0, 0.15, 8); k.fill();
    k.globalAlpha = 0.6; k.strokeStyle = ENCRE_DOUCE; k.lineWidth = 0.8; k.stroke();
  }
  k.globalAlpha = 1;
}

// Branche de prunier qui déborde sur le ciel : dessinée par-dessus le ciel de nuit
const premierPlan = creerCanvas(W, H);
// Silhouettes opaques du décor (montagnes de l'horizon + sol) : le ciel de nuit et les astres passent derrière
const masque = creerCanvas(W, H);
let masqueMontagnes = masque.getContext('2d');
const fond = creerCanvas(W, H);
(function () {
  const p = fond.getContext('2d');
  p.fillStyle = PAPIER; p.fillRect(0, 0, W, H);
  for (let i = 0; i < 24; i++) {
    const x = Math.random() * W, y = Math.random() * H, r = rand(40, 170), a = rand(0.02, 0.05);
    const g = p.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(170,120,70,${a})`); g.addColorStop(1, 'rgba(170,120,70,0)');
    p.fillStyle = g; p.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  for (let i = 0; i < 16000; i++) {
    p.fillStyle = Math.random() < 0.55 ? `rgba(110,80,50,${Math.random() * 0.06})` : `rgba(255,252,240,${Math.random() * 0.1})`;
    p.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 1.6, 1 + Math.random() * 1.6);
  }
  p.lineWidth = 0.6;
  for (let i = 0; i < 500; i++) {
    const x = Math.random() * W, y = Math.random() * H, a = Math.random() * 6.28, l = rand(6, 26);
    p.strokeStyle = `rgba(110,80,50,${rand(0.04, 0.09)})`;
    p.beginPath(); p.moveTo(x, y);
    p.quadraticCurveTo(x + Math.cos(a + 0.6) * l * 0.5, y + Math.sin(a + 0.6) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); p.stroke();
  }

  // Caméra penchée : un ciel au-dessus de l'horizon (lavis, nuages au pinceau sec, soleil rouge d'estampe)
  if (Y_CIEL > 0) {
    const gc = p.createLinearGradient(0, 0, 0, Y_CIEL + 10);
    gc.addColorStop(0, 'rgba(150,130,115,0.22)'); gc.addColorStop(1, 'rgba(150,130,115,0)');
    p.fillStyle = gc; p.fillRect(0, 0, W, Y_CIEL + 10);
    const rs = Y_CIEL > 150 ? 30 : 22, ys = Y_CIEL * 0.6;
    p.globalAlpha = 0.85; p.fillStyle = ROUGE; cheminBlob(p, 312, ys, rs, rs, 7, 0, 0.03, 20); p.fill();
    p.globalAlpha = 0.25;
    for (let i = 0; i < 5; i++) { const y = rand(Y_CIEL * 0.25, Y_CIEL * 0.85), x = rand(-40, W - 120); coup(p, x, y, x + rand(140, 260), y + rand(-4, 4), rand(6, 12), '#8f857f', 0.8); }
    p.globalAlpha = 1;
  }
  // Fond de la vallée : deux chaînes de montagnes lointaines, très pâles (perspective atmosphérique)
  const chaines = Y_CIEL > 0
    ? [[0.24, Y_CIEL + 10, 70, 120], [0.42, Y_CIEL + 26, 40, 75]]
    : [[0.22, 70, 40, 70], [0.38, 92, 30, 52]];
  for (const [alpha, base, hMin, hMax] of chaines) {
    p.globalAlpha = alpha;
    for (let x = -60; x < W + 60; x += rand(90, 150)) montagne(p, x, base + rand(-6, 6), rand(150, 230), rand(hMin, hMax), Y_CIEL > 0);
  }
  p.globalAlpha = 1;
  // Bords du chemin : doubles traits d'encre, interrompus, avec une ombre lavée côté extérieur
  for (const cote of [-1, 1]) {
    const bord = [];
    for (let y = Y_CIEL > 0 ? Y_CIEL + 8 : -20; y <= MUR_Y + 10; y += 6) bord.push([cheminCentre(y) + cote * (cheminDemi(y) + 12), y]);
    // lavis extérieur
    p.globalAlpha = 0.06;
    for (let i = 0; i + 6 < bord.length; i += 5) pinceau(p, bord.slice(i, i + 7).map(q => [q[0] + cote * 10, q[1]]), 22, ENCRE_DOUCE);
    // trait principal discontinu
    p.globalAlpha = 0.9;
    for (let i = 0; i < bord.length - 2;) {
      const n = 3 + Math.floor(Math.random() * 6);
      pinceau(p, bord.slice(i, i + n).map(q => [q[0] + rand(-1, 1), q[1]]), rand(3.5, 6.5), ENCRE, 0.6);
      i += n + (Math.random() < 0.5 ? 1 : 0);
    }
    // trait secondaire plus fin
    p.globalAlpha = 0.55;
    for (let i = 0; i < bord.length - 2;) {
      const n = 2 + Math.floor(Math.random() * 4);
      pinceau(p, bord.slice(i, i + n).map(q => [q[0] + cote * 8, q[1]]), rand(1.5, 2.8), ENCRE);
      i += n + 1 + Math.floor(Math.random() * 2);
    }
    p.globalAlpha = 1;
  }

  // Décor hors du chemin
  const bordG = y => cheminCentre(y) - cheminDemi(y) - 12, bordD = y => cheminCentre(y) + cheminDemi(y) + 12;
  montagne(p, 75, 375, 120, 62);
  montagne(p, W - 92, 205, 150, 72, Y_CIEL > 0);
  montagne(p, W - 58, 585, 80, 40);
  montagne(p, 48, 590, 70, 36);
  bambou(p, 38, 560, 130, 3);
  bambou(p, W - 40, 420, 150, 3);
  prunier(premierPlan.getContext('2d'), -10, 230, -0.35, 230); // devant le ciel (jour comme nuit)
  prunier(p, W + 10, 640, Math.PI + 0.3, 170);
  for (let i = 0; i < 18; i++) {
    const y = rand(Y_CIEL + 60, MUR_Y - 40), gauche = Math.random() < 0.5;
    const x = gauche ? rand(8, Math.max(10, bordG(y) - 18)) : rand(Math.min(W - 10, bordD(y) + 18), W - 8);
    if (Math.random() < 0.6) herbe(p, x, y, rand(0.8, 1.2)); else cailloux(p, x, y);
  }
  // quelques herbes au bord intérieur du chemin
  for (let i = 0; i < 8; i++) {
    const y = rand(Y_CIEL + 80, MUR_Y - 60), cote = Math.random() < 0.5 ? -1 : 1;
    herbe(p, cheminCentre(y) + cote * (cheminDemi(y) - 14), y, 0.7);
  }

  const g = p.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.8);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(110,70,30,0.22)');
  p.fillStyle = g; p.fillRect(0, 0, W, H);
})();

// =====================================================================
//  SILHOUETTES DES MONSTRES (4 images de marche par type)
// =====================================================================
function creerSilhouette(type, r, ph) {
  const u = r * TYPES[type].ech;
  const S = Math.ceil(u * 5) + 10, c = creerCanvas(S, S), k = c.getContext('2d');
  k.translate(S / 2, S / 2); k.scale(u, u);
  k.fillStyle = ENCRE; k.strokeStyle = ENCRE; k.lineCap = 'round'; k.lineJoin = 'round';
  const s = [0, 1, 0, -1][ph], lev = v => Math.max(0, v) * 0.12, b = -Math.abs(s) * 0.04;
  const L = (x1, y1, x2, y2, w) => { k.lineWidth = w; k.beginPath(); k.moveTo(x1, y1); k.lineTo(x2, y2); k.stroke(); };
  const Q = (x1, y1, cx, cy, x2, y2, w) => { k.lineWidth = w; k.beginPath(); k.moveTo(x1, y1); k.quadraticCurveTo(cx, cy, x2, y2); k.stroke(); };
  const E = (x, y, rx, ry) => { k.beginPath(); k.ellipse(x, y, rx, ry, 0, 0, 7); k.fill(); };
  const P = (...p) => { k.beginPath(); k.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) k.lineTo(p[i], p[i + 1]); k.closePath(); k.fill(); };
  const jambes = (ecart, haut, w) => {
    L(-ecart * 0.7, haut, -ecart + s * 0.14, 1.1 - lev(s), w);
    L(ecart * 0.7, haut, ecart - s * 0.14, 1.1 - lev(-s), w);
  };

  if (type === 'gobelin') {
    jambes(0.3, 0.35, 0.26);
    E(0, 0.12 + b, 0.48, 0.5);
    E(0, -0.55 + b, 0.4, 0.36);
    P(-0.3, -0.62 + b, -1.05, -0.95 + b, -0.22, -0.4 + b);
    P(0.3, -0.62 + b, 1.05, -0.95 + b, 0.22, -0.4 + b);
    L(-0.4, 0 + b, -0.64, 0.45 + s * 0.05, 0.2);
    L(0.4, 0 + b, 0.68, 0.3 - s * 0.05, 0.2);
    L(0.68, 0.3, 0.98, -0.2, 0.11);
    L(0.55, 0.26, 0.8, 0.4, 0.08);
  } else if (type === 'rodeur') {
    jambes(0.32, 0.45, 0.2);
    P(-0.3, -0.3 + b, 0.3, -0.3 + b, 0.55, 0.75, -0.55, 0.75);
    E(0, -0.45 + b, 0.3, 0.3);
    P(-0.3, -0.35 + b, 0, -1.1 + b, 0.3, -0.35 + b);
    for (const sg of [-1, 1]) {
      L(sg * 0.35, -0.1 + b, sg * 0.62, 0.3, 0.16);
      Q(sg * 0.62, 0.3, sg * 0.95, 0.1, sg * 1.0, -0.35, 0.1);
    }
    k.fillStyle = ROUGE; E(-0.12, -0.42 + b, 0.07, 0.05); E(0.12, -0.42 + b, 0.07, 0.05);
  } else if (type === 'orc' || type === 'bouclier') {
    jambes(0.32, 0.4, 0.3);
    P(-0.7, -0.35 + b, 0.7, -0.35 + b, 0.45, 0.45 + b, -0.45, 0.45 + b);
    E(0, 0.42 + b, 0.45, 0.22);
    E(0, -0.6 + b, 0.3, 0.28);
    if (type === 'orc') {
      Q(-0.2, -0.75 + b, -0.6, -0.85 + b, -0.48, -1.2 + b, 0.14);
      Q(0.2, -0.75 + b, 0.6, -0.85 + b, 0.48, -1.2 + b, 0.14);
      L(-0.62, -0.25 + b, -0.86, 0.35, 0.28); E(-0.86, 0.42, 0.15, 0.15);
      L(0.62, -0.25 + b, 0.9, 0.15, 0.28);
      L(0.9, 0.5, 0.96, -0.78, 0.09);
      P(0.96, -0.72, 1.32, -0.9, 1.45, -0.52, 1.34, -0.18, 0.96, -0.36);
    } else {
      E(0, -0.68 + b, 0.34, 0.26); L(-0.4, -0.6 + b, 0.4, -0.6 + b, 0.1);
      L(0.62, -0.25 + b, 0.85, 0.2, 0.28);
      L(0.84, 0.65, 0.9, -1.2, 0.07); P(0.9, -1.45, 0.98, -1.15, 0.82, -1.15);
      // bouclier rond au premier plan
      k.fillStyle = '#d9c7a3'; k.beginPath(); k.arc(-0.1, 0.2, 0.62, 0, 7); k.fill();
      k.strokeStyle = ENCRE; k.lineWidth = 0.1; k.stroke();
      k.strokeStyle = ROUGE; k.lineWidth = 0.09; k.beginPath();
      for (let a = 0; a < 9; a += 0.25) { const rr = 0.04 + a * 0.042; const px = -0.1 + Math.cos(a) * rr, py = 0.2 + Math.sin(a) * rr; a ? k.lineTo(px, py) : k.moveTo(px, py); }
      k.stroke(); k.fillStyle = ENCRE; k.strokeStyle = ENCRE;
    }
  } else if (type === 'troll') {
    L(-0.25, 0.5, -0.36 + s * 0.1, 1.1 - lev(s), 0.36);
    L(0.25, 0.5, 0.36 - s * 0.1, 1.1 - lev(-s), 0.36);
    E(0, 0.08 + b, 0.8, 0.68);
    E(0, -0.55 + b, 0.28, 0.25);
    const bal = s * 0.08;
    L(-0.66, -0.2 + b, -1.0, 0.72 + bal, 0.3); E(-1.0, 0.82 + bal, 0.18, 0.16);
    L(0.66, -0.2 + b, 0.98, 0.55 - bal, 0.3);
    Q(0.98, 0.6 - bal, 1.28, 0.05, 1.15, -0.72, 0.17); E(1.15, -0.72, 0.2, 0.3);
    k.strokeStyle = PAPIER; L(-0.1, -0.47 + b, -0.12, -0.6 + b, 0.05); L(0.1, -0.47 + b, 0.12, -0.6 + b, 0.05); k.strokeStyle = ENCRE;
  } else if (type === 'chef') {
    L(-0.28, 0.45, -0.36 + s * 0.1, 1.1 - lev(s), 0.3);
    L(0.28, 0.45, 0.36 - s * 0.1, 1.1 - lev(-s), 0.3);
    P(-0.5, 0.38 + b, 0.5, 0.38 + b, 0.62, 0.78, -0.62, 0.78);
    P(-0.75, -0.42 + b, 0.75, -0.42 + b, 0.5, 0.5 + b, -0.5, 0.5 + b);
    E(-0.72, -0.4 + b, 0.3, 0.22); E(0.72, -0.4 + b, 0.3, 0.22);
    P(-0.9, -0.5 + b, -0.82, -0.85 + b, -0.7, -0.55 + b); P(0.9, -0.5 + b, 0.82, -0.85 + b, 0.7, -0.55 + b);
    E(0, -0.68 + b, 0.3, 0.28);
    Q(-0.24, -0.8 + b, -0.82, -0.95 + b, -0.76, -1.38 + b, 0.16);
    Q(0.24, -0.8 + b, 0.82, -0.95 + b, 0.76, -1.38 + b, 0.16);
    L(-0.8, -0.3 + b, -0.95, 0.42, 0.3); E(-0.95, 0.5, 0.16, 0.16);
    L(0.8, -0.3 + b, 1.06, -0.05, 0.3);
    L(1.06, 0.1, 1.1, -0.92, 0.09);
    E(1.1, -1.02, 0.22, 0.22);
    for (let a = 0; a < 6; a++) { const an = a / 6 * Math.PI * 2; L(1.1 + Math.cos(an) * 0.18, -1.02 + Math.sin(an) * 0.18, 1.1 + Math.cos(an) * 0.34, -1.02 + Math.sin(an) * 0.34, 0.07); }
  }
  // volume : lumière douce venant de la gauche
  k.setTransform(1, 0, 0, 1, 0, 0);
  k.globalCompositeOperation = 'source-atop';
  const g = k.createLinearGradient(0, 0, S, 0);
  g.addColorStop(0, 'rgba(255,240,220,0.22)'); g.addColorStop(0.5, 'rgba(255,240,220,0)');
  k.fillStyle = g; k.fillRect(0, 0, S, S);
  k.globalCompositeOperation = 'source-over';
  return { c, a: S / 2, u };
}
const SPRITES = {};
for (const t in TYPES) SPRITES[t] = [0, 1, 2, 3].map(ph => creerSilhouette(t, TYPES[t].r, ph));

// Planches dessinées des monstres (assets/<type>.png, 8 colonnes × 4 lignes, fond transparent)
//  ligne 0 : marche · ligne 1 : attaque · ligne 2 : coup encaissé (images 0-3) · ligne 3 : mort (effondrement)
//  pieds[ligne] = position des pieds dans la case ; hauteur = taille du corps dans la case (px)
// Un type sans planche (ou dont l'image manque) garde sa silhouette dessinée par le code.
const PLANCHES_MONSTRES = {
  gobelin: { src: 'assets/gobelin.png', cw: 120, ch: 80, echelle: 0.66, hauteur: 37, pieds: [[62, 63], [60, 62], [62, 65], [60, 68]] },
  orc: { src: 'assets/orc.png', cw: 120, ch: 80, echelle: 0.74, hauteur: 51, pieds: [[63, 64], [62, 71], [63, 71], [62, 70]],
    // [colonne, ligne, x, y, l, h] : débordements d'une case voisine à effacer (hache levée, coup de lame)
    nettoyer: [[2, 0, 0, 72, 120, 8], [3, 0, 0, 72, 120, 8], [5, 2, 0, 0, 120, 10]] },
  rodeur: { src: 'assets/rodeur.png', cw: 120, ch: 80, echelle: 0.55, hauteur: 55, pieds: [[70, 67], [70, 67], [70, 67], [70, 70]],
    nettoyer: [[5, 1, 0, 0, 20, 80], [6, 1, 0, 0, 22, 80]] },
  bouclier: { src: 'assets/bouclier.png', cw: 120, ch: 80, echelle: 0.7, hauteur: 55, pieds: [[66, 65], [66, 70], [66, 69], [66, 71]],
    nettoyer: [[5, 1, 0, 0, 22, 80], [6, 1, 0, 0, 24, 80]] },
  troll: { src: 'assets/troll.png', cw: 160, ch: 107, echelle: 0.7, hauteur: 86, pieds: [[96, 95], [96, 100], [94, 96], [86, 94]],
    nettoyer: [[4, 1, 0, 0, 22, 107], [5, 1, 0, 0, 22, 107], [6, 1, 0, 0, 26, 107], [4, 2, 0, 0, 20, 107]] },
  // Chef de guerre : 5 lignes (la 4e est un rugissement, joué quand il atteint la muraille).
  // Lignes de hauteurs irrégulières dans l'original → découpées par bandes et alignées par les pieds.
  // Les colonnes de l'original dérivent de ~3,5 px par image : `centres` donne le centre du corps de chaque image.
  chef: { src: 'assets/chef.png', cw: 160, ch: 91, echelle: 0.92, hauteur: 82,
    lignes: { marche: 0, attaque: 1, touche: 2, cri: 3, mort: 4 },
    pieds: [[0, 89], [0, 90], [0, 89], [0, 90], [0, 85]],
    centres: [[97, 92, 91, 88, 83, 77, 73, 72], [95, 88, 93, 93, 91, 79, 78, 77], [91, 87, 85, 82, 79, 74, 72, 71],
      [93, 88, 84, 82, 78, 75, 71, 72], [94, 89, 85, 82, 80, 78, 74, 70]],
    nettoyer: [[6, 1, 0, 0, 18, 91], [6, 2, 0, 0, 18, 91], [4, 2, 0, 0, 160, 12], [5, 2, 0, 0, 160, 12], [6, 2, 0, 0, 160, 12]] },
};
const LIGNES_DEFAUT = { marche: 0, attaque: 1, touche: 2, mort: 3 };
for (const type in PLANCHES_MONSTRES) {
  const pl = PLANCHES_MONSTRES[type], img = new Image();
  img.onload = () => {
    const c = creerCanvas(img.width, img.height), k = c.getContext('2d');
    k.drawImage(img, 0, 0);
    for (const [col, ligne, x, y, w, h] of pl.nettoyer || []) k.clearRect(col * pl.cw + x, ligne * pl.ch + y, w, h);
    pl.img = c;
  };
  img.src = pl.src;
}
function imageMonstre(e, ligne, col) {
  const pl = PLANCHES_MONSTRES[e.k];
  let [fx, fy] = pl.pieds[ligne]; const s = pl.echelle;
  if (pl.centres) fx = pl.centres[ligne][col];
  ctx.drawImage(pl.img, col * pl.cw, ligne * pl.ch, pl.cw, pl.ch, e.x - fx * s, pieds(e) - fy * s, pl.cw * s, pl.ch * s);
}

// =====================================================================
//  ARCHERS, CATAPULTE, MURAILLE, SOCLE
// =====================================================================
function creerArcher(variante, tir) {
  const c = creerCanvas(36, 44), k = c.getContext('2d');
  k.fillStyle = ENCRE; k.strokeStyle = ENCRE; k.lineCap = 'round'; k.lineJoin = 'round';
  const L = (x1, y1, x2, y2, w) => { k.lineWidth = w; k.beginPath(); k.moveTo(x1, y1); k.lineTo(x2, y2); k.stroke(); };
  L(16, 42, 17, 30, 3.2); L(22, 42, 21, 30, 3.2);
  k.beginPath(); k.moveTo(13, 19); k.lineTo(25, 19); k.lineTo(23, 31); k.lineTo(15, 31); k.closePath(); k.fill();
  k.beginPath(); k.ellipse(19, 14, 4.2, 4.4, 0, 0, 7); k.fill();
  if (variante === 0) { k.beginPath(); k.arc(19, 9, 2, 0, 7); k.fill(); }
  if (variante === 1) { k.beginPath(); k.moveTo(11, 13); k.lineTo(27, 13); k.lineTo(19, 6); k.closePath(); k.fill(); }
  if (variante === 2) { k.beginPath(); k.moveTo(14.5, 15); k.quadraticCurveTo(19, 4, 23.5, 15); k.fill(); }
  // arc tenu à gauche, corde tirée
  L(14, 21, 6, 19, 2.4);
  k.lineWidth = 2.2; k.beginPath(); k.arc(13, 19, 11, Math.PI - 1.15, Math.PI + 1.15); k.stroke();
  const tire = tir ? 7 : 0;
  k.lineWidth = 0.7; k.beginPath(); k.moveTo(8.4, 9); k.lineTo(14 + tire, 19); k.lineTo(8.4, 29); k.stroke();
  L(24, 21, 15 + tire, 19, 2.4);
  if (!tir) L(2, 19, 16, 19, 1);
  return c;
}
const spritesArcher = [0, 1, 2].map(v => [creerArcher(v, false), creerArcher(v, true)]);

// Planche d'archers dessinée (assets/archer.png, 8 × 4 images de 112 px, fond transparent)
//  ligne 0 : visée vers la droite, de 45° (0) à la verticale (7)
//  ligne 1 : tir vers la droite (bander 0-2, lâcher 3, retour 4-7)
//  ligne 2 : visée vers la gauche, de la verticale (0) à 45° (7)
//  ligne 3 : tir vers la gauche (lâcher en 0 ; ordre de lecture ci-dessous)
// Tant qu'elle n'est pas chargée (ou si elle manque), les archers procéduraux prennent le relais.
const PLANCHE = { cell: 112, echelle: 0.6, pieds: [[56, 106], [56, 103], [59, 101], [59, 101]] };
const ORDRE_TIR_GAUCHE = [7, 1, 2, 0, 3, 4, 5, 6];
// ---------------------------------------------------------------------
//  Archers impériaux : quand le Temple est choisi et au niveau maximum, les archers changent d'apparence (casque à
//  plumet rouge, tunique blanche) et leurs flèches font +50 % de dégâts. Deux planches du joueur, 8 × 3 images sur fond
//  magenta : assets/archer-imperial-droite.webp (tourné vers la droite) et -gauche.webp (vers la gauche).
//  Ligne 0 : on lève l'arc (visée) · ligne 1 : tir (la flèche part sur une image) · ligne 2 : on rabaisse (attente).
//  Même orientation que l'archer de base : planche « droite » quand la cible est à droite, « gauche » sinon.
// ---------------------------------------------------------------------
const IMPERIAL = { colonnes: 8, rangees: 3, hauteur: 40, bonus: 1.5, ips: 6,
  src: { d: 'assets/archer-imperial-droite.webp', g: 'assets/archer-imperial-gauche.webp' } };
const planchesImperiales = {};
for (const cote of ['d', 'g']) { const img = new Image(); img.onload = () => { try { planchesImperiales[cote] = preparerImperial(img); } catch (e) { /* archer de base */ } }; img.src = IMPERIAL.src[cote]; }
function preparerImperial(img) {
  const w = img.width, h = img.height, c = creerCanvas(w, h), k = c.getContext('2d');
  k.drawImage(img, 0, 0);
  const id = k.getImageData(0, 0, w, h), d = id.data;
  // fond magenta → transparent ; les bords à demi transparents deviennent de l'encre (le contour du dessin)
  for (let p = 0; p < d.length; p += 4) {
    const m = Math.min(d[p], d[p + 2]) - d[p + 1], a = clamp((150 - m) / 90, 0, 1);
    if (a < 1) { d[p] = 27; d[p + 1] = 23; d[p + 2] = 25; }
    d[p + 3] = Math.round(255 * a * a);
  }
  k.putImageData(id, 0, 0);
  const cw = w / IMPERIAL.colonnes, ch = h / IMPERIAL.rangees, cases = [];
  for (let r = 0; r < IMPERIAL.rangees; r++) for (let q = 0; q < IMPERIAL.colonnes; q++) {
    // dans chaque case : hauteur du dessin, et position des pieds (bas du dessin, milieu des pixels du bas)
    const x0 = Math.round(q * cw), y0 = Math.round(r * ch), x1 = Math.round((q + 1) * cw), y1 = Math.round((r + 1) * ch);
    let haut = -1, bas = -1;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x += 2) if (d[(y * w + x) * 4 + 3] > 128) { if (haut < 0) haut = y; bas = y; break; }
    let sx = 0, n = 0, gauche = x1, droite = x0;
    for (let y = Math.max(y0, bas - 10); y <= bas; y++) for (let x = x0; x < x1; x++) if (d[(y * w + x) * 4 + 3] > 128) { sx += x; n++; }
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (d[(y * w + x) * 4 + 3] > 128) { gauche = Math.min(gauche, x); droite = Math.max(droite, x); }
    cases.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, pieds: [n ? sx / n : (x0 + x1) / 2, bas < 0 ? y1 : bas], taille: bas - haut, large: droite - gauche });
  }
  // image du tir où la flèche est partie (la plus large de la ligne 1) : elle doit tomber au moment du lâcher
  const tir = cases.slice(8, 16), lacher = tir.indexOf(tir.reduce((a, b) => (b.large > a.large ? b : a)));
  const taille = cases.slice(0, 8).reduce((m, c) => m + c.taille, 0) / 8;
  return { c, cases, lacher, echelle: IMPERIAL.hauteur / taille };
}
const archersImperiaux = () => !!(G && G.bat.temple >= batimentDe('temple').max);
function dessinerArcherImperial(a, i, p) {
  const P = planchesImperiales[a.dir < 0 ? 'g' : 'd'];
  let n;
  if (a.anim >= 0) { // tir : 8 images, la flèche part à l'image du lâcher (comme pour l'archer de base)
    const f = Math.min(7, Math.floor(a.anim / TIR_DUREE * 8)), dec = P.lacher - Math.round(TIR_LACHER * 8);
    n = 8 + clamp(f + dec, 0, 7);
  } else if (a.attente || !G.ennemis.length) { // repos : on rabaisse puis relève l'arc doucement (aller-retour)
    const t = Math.floor(G.t * IMPERIAL.ips + i * 2.7) % 14; n = 16 + (t < 8 ? t : 14 - t);
  } else n = 7; // visée : l'arc levé
  const C = P.cases[n], s = P.echelle, ox = p.x - (C.pieds[0] - C.x) * s, oy = p.y + 2 - (C.pieds[1] - C.y) * s;
  const dessin = () => ctx.drawImage(P.c, C.x, C.y, C.w, C.h, ox, oy, C.w * s, C.h * s);
  if (n >= 16) { dessin(); return; } // au repos : l'arc baissé, rien à orienter
  // Même orientation que l'archer de base (tourné vers sa cible, à droite ou à gauche). Ses planches tirent à
  // l'horizontale : le haut du corps (buste, bras, arc) se penche vers la cible, d'autant plus qu'elle est haute
  // (a.vise, comme l'archer de base) ; les jambes restent plantées sur la muraille.
  // (penché vers l'arrière d'un tiers de l'angle de visée : au-delà, la pose se tord)
  const angle = (35 + a.vise / 7 * 55) * 0.36 * Math.PI / 180, taille = p.y + 2 - C.taille * 0.45 * s;
  ctx.save(); ctx.beginPath(); ctx.rect(ox - 40, taille, C.w * s + 80, H); ctx.clip(); dessin(); ctx.restore();
  ctx.save();
  ctx.translate(p.x, taille); ctx.rotate(a.dir < 0 ? angle : -angle); ctx.translate(-p.x, -taille);
  ctx.beginPath(); ctx.rect(ox - 60, oy - 60, C.w * s + 120, taille - oy + 62); ctx.clip(); // un peu sous la taille : pas de jour
  dessin(); ctx.restore();
}
const TIR_DUREE = 0.45, TIR_LACHER = 3 / 8;
let plancheArcher = null;
(function () {
  const img = new Image();
  img.onload = () => {
    const c = creerCanvas(img.width, img.height), k = c.getContext('2d');
    k.drawImage(img, 0, 0);
    k.clearRect(4 * PLANCHE.cell, PLANCHE.cell, 16, PLANCHE.cell); // pointe de flèche qui déborde de l'image voisine
    plancheArcher = c;
  };
  img.src = 'assets/archer.png';
})();
// Attente (aucun ennemi à portée) : assets/archer-attente.png, 8 images sur la ligne du milieu (cases 120 × 107)
// échelle calée sur la hauteur du corps : ~72 px dans cette planche contre ~59 px dans celle du tir (× 0,6)
const ATTENTE = { cw: 120, ch: 107, ligne: 1, echelle: 0.5, pieds: [60, 85], ips: 6 };
let plancheAttente = null;

// ---------------------------------------------------------------------
//  Corbeaux : animation de décor (aucun effet sur le jeu). Un corbeau seul ou un petit vol passe de temps en temps.
//  Transparents sur les bords de l'écran, ils foncent progressivement en survolant le chemin (plus petits au loin).
//  assets/corbeau-gauche.png et corbeau-droite.png : 8 battements d'ailes, cases 120 × 147, centre (60, 73)
// ---------------------------------------------------------------------
const CORBEAU = { cw: 120, ch: 147, ips: 10, attente: [14, 32], hauteur: [70, 430] };
const planchesCorbeau = { g: null, d: null };
for (const [cle, fichier] of [['g', 'assets/corbeau-gauche.png'], ['d', 'assets/corbeau-droite.png']]) {
  const img = new Image(); img.onload = () => { planchesCorbeau[cle] = img; }; img.src = fichier;
}
function envolCorbeaux() {
  const dir = Math.random() < 0.5 ? 1 : -1, n = Math.random() < 0.55 ? 1 : 2 + Math.floor(Math.random() * 2);
  const y0 = rand(CORBEAU.hauteur[0], CORBEAU.hauteur[1]);
  for (let i = 0; i < n; i++) {
    const y = y0 + (i ? rand(-30, 30) : 0), loin = 1 - (y - CORBEAU.hauteur[0]) / (CORBEAU.hauteur[1] - CORBEAU.hauteur[0]);
    const ech = 0.17 + 0.2 * (1 - loin) + rand(-0.02, 0.02);
    G.corbeaux.push({ dir, ech, y, x: dir > 0 ? -70 - i * rand(35, 60) : W + 70 + i * rand(35, 60),
      vx: dir * (55 + 90 * ech) * rand(0.9, 1.1), phase: Math.random() * 8, alpha: 0.8 + 0.15 * (1 - loin) });
  }
}
function majCorbeaux(dt) {
  G.prochainCorbeau -= dt;
  if (G.prochainCorbeau <= 0) { envolCorbeaux(); G.prochainCorbeau = rand(...CORBEAU.attente); }
  for (const c of G.corbeaux) { c.x += c.vx * dt; c.phase += dt * CORBEAU.ips; }
  G.corbeaux = G.corbeaux.filter(c => c.x > -200 && c.x < W + 200);
}
function dessinerCorbeaux() {
  for (const c of G.corbeaux) {
    const img = planchesCorbeau[c.dir > 0 ? 'd' : 'g'];
    if (!img) continue;
    const col = Math.floor(c.phase) % 8, w = CORBEAU.cw * c.ech, h = CORBEAU.ch * c.ech;
    const y = c.y + Math.sin(c.phase * 0.35) * 5; // léger roulis
    // opacité selon la distance au chemin : pleine au-dessus, nulle vers les bords, avec une transition douce
    const demi = Math.max(150, (y > Y_CIEL ? cheminDemi(y) : 0) + 40);
    const d = Math.abs(c.x - cheminCentre(Math.max(y, Y_CIEL))) / demi;
    const f = clamp((1.6 - d) / 1.0, 0, 1), lisse = f * f * (3 - 2 * f);
    if (lisse <= 0) continue;
    ctx.globalAlpha = c.alpha * lisse;
    ctx.drawImage(img, col * CORBEAU.cw, 0, CORBEAU.cw, CORBEAU.ch, c.x - w / 2, y - h / 2, w, h);
  }
  ctx.globalAlpha = 1;
}
(function () {
  const img = new Image();
  img.onload = () => { plancheAttente = img; };
  img.src = 'assets/archer-attente.png';
})();

const spriteCatapulte = (function () {
  const c = creerCanvas(60, 36), k = c.getContext('2d');
  k.fillStyle = '#7a6448'; k.fillRect(10, 16, 40, 9);
  cadrePinceau(k, 10, 16, 40, 9, 2.4);
  k.fillStyle = ENCRE;
  for (const x of [16, 44]) { k.beginPath(); k.arc(x, 27, 5.5, 0, 7); k.fill(); k.fillStyle = '#7a6448'; k.beginPath(); k.arc(x, 27, 1.8, 0, 7); k.fill(); k.fillStyle = ENCRE; }
  coup(k, 18, 16, 26, 3, 3); coup(k, 26, 3, 34, 16, 3);
  return c;
})();

const OY_MUR = 600 + D;
const murTex = creerCanvas(W, SOCLE_Y + 40 - OY_MUR);
(function () {
  const c = murTex.getContext('2d'), Y = y => y - OY_MUR;
  // face du mur
  c.save();
  c.beginPath();
  for (let x = 0; x <= W; x += 6) c.lineTo(x, Y(murHaut(x)));
  for (let x = W; x >= 0; x -= 6) c.lineTo(x, Y(murHaut(x) + MUR_FACE));
  c.closePath(); c.clip();
  c.fillStyle = '#cbbfae'; c.fillRect(0, 0, W, murTex.height);
  const g = c.createLinearGradient(0, Y(MUR_Y), 0, Y(MUR_Y + MUR_FACE + 14));
  g.addColorStop(0, 'rgba(60,50,45,0.05)'); g.addColorStop(1, 'rgba(40,32,30,0.45)');
  c.fillStyle = g; c.fillRect(0, 0, W, murTex.height);
  // pierres
  const hb = 13;
  for (let row = 0; row < 7; row++) {
    let x = -rand(0, 24);
    while (x < W) {
      const w = rand(24, 42), xm = x + w / 2, y0 = Y(murHaut(xm)) + 4 + row * hb;
      const x1 = x + rand(1, 2), x2 = x + w - rand(1, 2), y1 = y0 + rand(1, 2), y2 = y0 + hb - rand(1, 2), cc = 2.5;
      polyLisse(c, [[x1 + cc, y1], [x2 - cc, y1], [x2, y1], [x2, y1 + cc], [x2, y2 - cc], [x2, y2], [x2 - cc, y2], [x1 + cc, y2], [x1, y2], [x1, y2 - cc], [x1, y1 + cc], [x1, y1]]);
      c.fillStyle = `rgba(70,58,50,${rand(0.02, 0.16)})`; c.fill();
      c.strokeStyle = ENCRE; c.globalAlpha = rand(0.3, 0.6); c.lineWidth = rand(0.7, 1.5); c.stroke();
      c.globalAlpha = 1;
      x += w;
    }
  }
  // grain de pinceau sec dans le bas
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * W, y = Y(MUR_Y + MUR_FACE * rand(0.45, 1.2));
    c.fillStyle = `rgba(27,23,25,${rand(0.05, 0.3)})`; c.fillRect(x, y, rand(0.6, 1.8), rand(0.6, 1.8));
  }
  c.restore();
  // chemin de ronde
  c.beginPath();
  for (let x = 0; x <= W; x += 6) c.lineTo(x, Y(murHaut(x) - 7));
  for (let x = W; x >= 0; x -= 6) c.lineTo(x, Y(murHaut(x)));
  c.closePath(); c.fillStyle = '#ddd2c0'; c.fill();
  const ligne = (dy, ep) => { const pts = []; for (let x = -6; x <= W + 6; x += 24) pts.push([x, Y(murHaut(x) + dy) + rand(-0.6, 0.6)]); pinceau(c, pts, ep, ENCRE, 0.5, '#ddd2c0'); };
  ligne(0, 3.4); ligne(-7, 1.8); ligne(MUR_FACE, 3);
  // créneaux (merlons), sauf au niveau du pavillon
  for (let x = 10; x < W - 20; x += 36) {
    if (x > W / 2 - 90 && x < W / 2 + 70) continue;
    const yb = Y(murHaut(x + 12) - 7), hM = 16;
    c.fillStyle = '#d6cab8'; c.fillRect(x, yb - hM, 24, hM);
    c.fillStyle = 'rgba(50,40,35,0.18)'; c.fillRect(x + 15, yb - hM, 9, hM);
    cadrePinceau(c, x, yb - hM, 24, hM, 1.8);
    c.fillStyle = ENCRE; c.beginPath(); c.moveTo(x + 12, yb - hM + 5); c.lineTo(x + 14.5, yb - hM + 8); c.lineTo(x + 12, yb - hM + 11); c.lineTo(x + 9.5, yb - hM + 8); c.fill();
  }
  // (le pavillon de la porte est dessiné à part : voir PAVILLON)
  // bannières rouges
  for (const bx of [185, W - 185]) {
    const top = Y(murHaut(bx)) - 2, h = 70, w = 28;
    coup(c, bx - w / 2 - 5, top, bx + w / 2 + 5, top, 3.5);
    c.fillStyle = ROUGE;
    c.beginPath(); c.moveTo(bx - w / 2, top + 2); c.lineTo(bx + w / 2, top + 2); c.lineTo(bx + w / 2, top + h); c.lineTo(bx, top + h - 11); c.lineTo(bx - w / 2, top + h); c.closePath(); c.fill();
    c.strokeStyle = ROUGE_FONCE; c.lineWidth = 1.2; c.stroke();
    c.fillStyle = PAPIER; c.beginPath(); c.arc(bx, top + 24, 9, 0, 7); c.fill();
    c.strokeStyle = ROUGE; c.lineWidth = 2; c.beginPath();
    for (let a = 0; a < 10; a += 0.25) { const rr = 0.6 + a * 0.75, px = bx + Math.cos(a) * rr, py = top + 24 + Math.sin(a) * rr; a ? c.lineTo(px, py) : c.moveTo(px, py); }
    c.stroke();
    c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(bx + 4, top + 2, w / 2 - 4, h - 6);
  }
})();

// Socle d'encre noire sous la muraille (zone des cartes)
const OY_SOCLE = SOCLE_Y - 30;
const socle = creerCanvas(W, H - OY_SOCLE);
(function () {
  const c = socle.getContext('2d');
  // masse d'encre : bord supérieur en arc (plus haut sur les côtés), légèrement ondulé
  const bord = x => 46 - 26 * Math.pow((x - W / 2) / (W / 2), 2) + 3 * Math.sin(x / 37);
  c.fillStyle = ENCRE;
  c.beginPath(); c.moveTo(0, socle.height);
  for (let x = 0; x <= W; x += 8) c.lineTo(x, bord(x) + rand(-1.5, 1.5));
  c.lineTo(W, socle.height); c.closePath(); c.fill();
  // le bord est repassé au pinceau sec : stries de papier dans l'encre
  for (let x = -40; x < W; x += rand(70, 130)) {
    const x2 = x + rand(120, 220), pts = [];
    for (let k = 0; k <= 8; k++) { const xx = x + (x2 - x) * k / 8; pts.push([xx, bord(xx) + 6 + rand(-1, 1)]); }
    pinceau(c, pts, rand(14, 24), ENCRE, 0.9, PAPIER);
  }
  // grands mouvements de pinceau à l'intérieur, à peine visibles
  c.globalAlpha = 0.6;
  pinceau(c, courbe(-30, socle.height - 20, 60, 70, 200, 62, 14), 34, '#262123', 0.8, '#3c3537');
  pinceau(c, courbe(W + 30, socle.height - 20, W - 60, 70, W - 200, 62, 14), 34, '#262123', 0.8, '#3c3537');
  c.globalAlpha = 1;
  for (let i = 0; i < 50; i++) {
    c.globalAlpha = rand(0.5, 1); c.fillStyle = ENCRE;
    cheminBlob(c, rand(0, W), rand(8, 30), rand(0.8, 3), rand(0.8, 2.5), Math.random() * 9, 0, 0.2, 8); c.fill();
  }
  c.globalAlpha = 1;
})();

// Bandeaux de pinceau (HUD, PV de la muraille, annonces)
function creerTrainee(w, h, couleur = ENCRE, sec = 0.6) {
  const c = creerCanvas(w, h), k = c.getContext('2d');
  for (let i = 0; i < 3; i++) {
    const y = h / 2 + (i - 1) * h * 0.12;
    pinceau(k, trajet(6 + rand(0, 8), y + rand(-2, 2), w - 6 - rand(0, 14), y + rand(-2, 2), 2), h * 0.62, couleur, sec, '#5a5254');
  }
  return c;
}
const swashVague = creerTrainee(250, 62);
const swashRessources = creerTrainee(290, 62);
const swashPV = creerTrainee(260, 66);
function creerBarre(couleur, w) {
  const c = creerCanvas(w, 14), k = c.getContext('2d');
  pinceau(k, trajet(2, 7, w - 2, 7, 0.6), 9, couleur, 0.5, '#5a5254');
  return c;
}
const barrePV = creerBarre(ROUGE, 178), barrePVfond = creerBarre('#4a3f40', 178);

function creerBandeau(couleur) {
  const c = creerCanvas(600, 96), k = c.getContext('2d'), pts = [];
  for (let i = 0; i < 11; i++) pts.push([25 + i * 55, 48 + Math.sin(i * 0.8) * 5 + rand(-2, 2)]);
  k.globalAlpha = 0.94;
  pinceau(k, pts, 66, couleur, 0.9, PAPIER);
  return c;
}

// Sceau rouge « MAX »
const sceau = (function () {
  const c = creerCanvas(46, 22), k = c.getContext('2d');
  k.fillStyle = ROUGE;
  polyLisse(k, [[3, 2], [43, 1], [44, 21], [2, 20]]); k.fill();
  k.fillStyle = PAPIER; k.font = fonte('bold', 12, SANS); k.textAlign = 'center'; k.textBaseline = 'middle';
  k.fillText('MAX', 23, 12);
  k.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 50; i++) { k.globalAlpha = rand(0.2, 0.8); k.fillRect(Math.random() * 46, Math.random() * 22, rand(0.5, 2), rand(0.5, 2)); }
  return c;
})();

// =====================================================================
//  CARTES DU VILLAGE
// =====================================================================
const CARTE_W = 118, CARTE_H = 112, CARTE_Y = 836 + D;
const rectCarte = i => ({ x: (W - (5 * CARTE_W + 4 * 12)) / 2 + i * (CARTE_W + 12), y: CARTE_Y, w: CARTE_W, h: CARTE_H });

function iconeBatiment(k, id, x, y) {
  k.save(); k.translate(x, y);
  k.fillStyle = ENCRE; k.strokeStyle = ENCRE; k.lineCap = 'round'; k.lineJoin = 'round';
  const L = (x1, y1, x2, y2, w) => { k.lineWidth = w; k.beginPath(); k.moveTo(x1, y1); k.lineTo(x2, y2); k.stroke(); };
  if (id === 'mine') {
    // wagonnet de minerai
    for (const [px, py, r] of [[-12, -10, 7], [0, -14, 8], [12, -9, 7], [-4, -6, 6], [8, -5, 6]]) {
      k.fillStyle = ENCRE; cheminBlob(k, px, py, r, r * 0.8, px + py, 0, 0.25, 7); k.fill();
      k.strokeStyle = PARCHEMIN; k.lineWidth = 1; k.stroke();
    }
    k.fillStyle = ENCRE;
    k.beginPath(); k.moveTo(-24, -4); k.lineTo(24, -4); k.lineTo(18, 14); k.lineTo(-18, 14); k.closePath(); k.fill();
    k.strokeStyle = PARCHEMIN; k.lineWidth = 1.2; L(-20, 2, 20, 2, 1.2);
    k.fillStyle = ENCRE; for (const wx of [-11, 11]) { k.beginPath(); k.arc(wx, 17, 4.5, 0, 7); k.fill(); }
    k.strokeStyle = ENCRE; L(-28, 22, 28, 22, 2);
    for (let i = -24; i <= 24; i += 8) L(i, 20, i - 2, 24, 1.5);
  } else if (id === 'forge') {
    k.beginPath(); k.moveTo(-24, 0); k.lineTo(14, 0); k.quadraticCurveTo(22, 0, 26, -6); k.lineTo(14, 8); k.lineTo(8, 8); k.lineTo(10, 16); k.lineTo(16, 21);
    k.lineTo(-16, 21); k.lineTo(-10, 16); k.lineTo(-8, 8); k.lineTo(-16, 8); k.closePath(); k.fill();
    k.save(); k.translate(8, -12); k.rotate(-0.6);
    L(0, 0, 0, 22, 3.5); k.fillRect(-9, -6, 18, 10); k.restore();
    k.strokeStyle = ENCRE;
    for (const [a, l] of [[-2.2, 9], [-2.6, 7], [-1.9, 6]]) L(-6 + Math.cos(a) * 6, -4 + Math.sin(a) * 6, -6 + Math.cos(a) * (6 + l), -4 + Math.sin(a) * (6 + l), 1.6);
  } else if (id === 'caserne') {
    k.beginPath(); k.moveTo(-26, 18); k.quadraticCurveTo(-12, 4, 0, -16); k.quadraticCurveTo(12, 4, 26, 18); k.closePath(); k.fill();
    L(0, -16, 0, -28, 2); k.fillStyle = ROUGE; k.beginPath(); k.moveTo(0, -28); k.lineTo(12, -25); k.lineTo(0, -21); k.fill();
    k.strokeStyle = PARCHEMIN; L(-8, 0, 8, 14, 2); L(8, 0, -8, 14, 2); L(-10, 3, -5, -2, 1.5); L(10, 3, 5, -2, 1.5);
    k.fillStyle = PARCHEMIN; k.beginPath(); k.moveTo(-4, 18); k.lineTo(0, 10); k.lineTo(4, 18); k.fill();
  } else if (id === 'atelier') {
    k.fillRect(-26, 4, 52, 5); L(-21, 9, -23, 22, 3); L(21, 9, 23, 22, 3); L(-22, 16, 22, 16, 1.5);
    // engrenage
    k.save(); k.translate(-10, -10);
    for (let i = 0; i < 8; i++) { k.rotate(Math.PI / 4); k.fillRect(-2.2, -11, 4.4, 5); }
    k.beginPath(); k.arc(0, 0, 8, 0, 7); k.fill(); k.fillStyle = PARCHEMIN; k.beginPath(); k.arc(0, 0, 3, 0, 7); k.fill();
    k.restore(); k.fillStyle = ENCRE;
    // rouleau de plans
    k.save(); k.translate(12, -6); k.rotate(-0.35);
    k.fillRect(-8, -5, 16, 10); k.beginPath(); k.ellipse(8, 0, 3, 5, 0, 0, 7); k.fill();
    k.fillStyle = PARCHEMIN; k.beginPath(); k.ellipse(8, 0, 1.5, 3, 0, 0, 7); k.fill();
    k.restore();
    k.fillStyle = ENCRE; k.fillRect(-4, -2, 3, 6);
  } else if (id === 'macon') {
    for (let r = 0; r < 3; r++) for (let i = 0; i < 3; i++) {
      const dx = r % 2 ? -8 : 0, bx = -26 + i * 16 + dx, by = -2 + r * 8;
      if (bx < -28) continue;
      k.fillStyle = ENCRE; k.fillRect(bx, by, 15, 7);
    }
    k.save(); k.translate(14, -14); k.rotate(0.7);
    L(0, -14, 0, -2, 3);
    k.beginPath(); k.moveTo(-8, 0); k.lineTo(8, 0); k.lineTo(0, 14); k.closePath(); k.fill();
    k.restore();
  } else if (id === 'riziere') {
    // terrasses en escalier et pousses de riz
    k.lineWidth = 2.5;
    for (let r = 0; r < 3; r++) { k.beginPath(); k.moveTo(-28, 16 - r * 9); k.quadraticCurveTo(0, 12 - r * 9 - 5, 28, 16 - r * 9); k.stroke(); }
    k.lineWidth = 1.6;
    for (let i = 0; i < 6; i++) { const x = -20 + i * 8, y = 6 - (i % 3) * 9; L(x, y, x - 3, y - 9, 1.6); L(x, y, x + 3, y - 9, 1.6); L(x, y, x, y - 11, 1.6); }
    k.fillStyle = ROUGE; k.beginPath(); k.arc(18, -20, 5, 0, 7); k.fill();
  } else if (id === 'fauconnerie') {
    // faucon aux ailes déployées sur un perchoir
    k.beginPath(); k.moveTo(0, -4);
    k.quadraticCurveTo(-14, -20, -28, -14); k.quadraticCurveTo(-16, -10, -10, 0);
    k.quadraticCurveTo(-4, 4, 0, 10); k.quadraticCurveTo(4, 4, 10, 0);
    k.quadraticCurveTo(16, -10, 28, -14); k.quadraticCurveTo(14, -20, 0, -4); k.fill();
    k.beginPath(); k.arc(0, -8, 4, 0, 7); k.fill();
    k.fillStyle = ROUGE; k.beginPath(); k.moveTo(3, -8); k.lineTo(8, -6); k.lineTo(3, -5); k.fill();
    L(-16, 18, 16, 18, 3);
  } else if (id === 'balistes') {
    // baliste vue de face : arc tendu, carreau, affût
    k.lineWidth = 3.5; k.beginPath(); k.arc(0, 6, 24, Math.PI * 1.15, Math.PI * 1.85); k.stroke();
    L(-21, -6, 0, 6, 1.2); L(21, -6, 0, 6, 1.2);
    L(0, 14, 0, -24, 3.5); k.beginPath(); k.moveTo(0, -30); k.lineTo(-5, -21); k.lineTo(5, -21); k.closePath(); k.fill();
    L(-12, 22, 0, 12, 3); L(12, 22, 0, 12, 3);
  } else if (id === 'dojo') {
    // toit de dojo et sabre
    k.beginPath(); k.moveTo(-28, -6); k.quadraticCurveTo(-14, -10, 0, -20); k.quadraticCurveTo(14, -10, 28, -6); k.lineTo(22, -2); k.lineTo(-22, -2); k.closePath(); k.fill();
    k.fillRect(-18, -2, 36, 4); L(-15, 2, -15, 20, 3); L(15, 2, 15, 20, 3);
    k.strokeStyle = PARCHEMIN; L(-10, 16, 12, 2, 2.4); k.strokeStyle = ENCRE;
    k.fillStyle = ROUGE; k.fillRect(-12, 13, 5, 5);
  } else if (id === 'monastere') {
    // toit à deux étages et cloche de bronze
    for (const [y, w] of [[-18, 18], [-4, 26]]) { k.beginPath(); k.moveTo(-w, y + 2); k.quadraticCurveTo(-w * 0.5, y - 2, 0, y - 9); k.quadraticCurveTo(w * 0.5, y - 2, w, y + 2); k.lineTo(w - 5, y + 5); k.lineTo(-w + 5, y + 5); k.closePath(); k.fill(); }
    k.fillRect(-12, -14, 24, 10); L(0, -27, 0, -32, 2);
    k.fillRect(-18, 1, 36, 3); L(-15, 4, -15, 22, 3); L(15, 4, 15, 22, 3);
    k.fillStyle = ROUGE; k.beginPath(); k.moveTo(-6, 18); k.quadraticCurveTo(-6, 7, 0, 7); k.quadraticCurveTo(6, 7, 6, 18); k.closePath(); k.fill();
  } else if (id === 'comptoir') {
    // balance de marchand
    L(0, -24, 0, 18, 3); L(-12, 20, 12, 20, 3.5); L(-24, -16, 24, -16, 2.5);
    for (const sx of [-1, 1]) {
      L(sx * 22, -16, sx * 15, 0, 1.2); L(sx * 22, -16, sx * 29, 0, 1.2);
      k.beginPath(); k.moveTo(sx * 13, 0); k.quadraticCurveTo(sx * 22, 9, sx * 31, 0); k.closePath(); k.fill();
    }
    k.fillStyle = ROUGE; k.beginPath(); k.arc(-22, -3, 4, 0, 7); k.fill();
    k.fillStyle = '#2c4268'; k.beginPath(); k.moveTo(22, -9); k.lineTo(26, -3); k.lineTo(22, 2); k.lineTo(18, -3); k.closePath(); k.fill();
  } else if (id === 'temple') {
    // gong suspendu dans son portique
    L(-24, -22, 24, -22, 4); L(-20, -22, -20, 22, 3); L(20, -22, 20, 22, 3); L(-26, -26, 26, -26, 2);
    L(-6, -22, -6, -14, 1.2); L(6, -22, 6, -14, 1.2);
    k.beginPath(); k.arc(0, 0, 13, 0, 7); k.fill();
    k.strokeStyle = PARCHEMIN; k.lineWidth = 1.2; k.beginPath(); k.arc(0, 0, 8, 0, 7); k.stroke();
    k.fillStyle = ROUGE; k.beginPath(); k.arc(0, 0, 3.5, 0, 7); k.fill();
  } else if (id === 'alchimiste') {
    // fiole ronde au poison vert et bulles
    k.lineWidth = 3; k.beginPath(); k.moveTo(-5, -22); k.lineTo(-5, -10); k.arc(0, 6, 17, -Math.PI / 2 - 0.3, Math.PI * 1.5 + 0.3); k.lineTo(5, -22); k.stroke();
    L(-8, -23, 8, -23, 3.5);
    k.fillStyle = '#4f6b2a'; k.beginPath(); k.arc(0, 6, 14.5, 0.15, Math.PI - 0.15); k.closePath(); k.fill();
    k.fillStyle = ENCRE; for (const [bx, by, br] of [[-5, -2, 2.5], [3, -9, 2], [6, -1, 1.6]]) { k.beginPath(); k.arc(bx, by, br, 0, 7); k.fill(); }
  } else if (id === 'poudrerie') {
    // pot de poudre et mèche allumée
    k.beginPath(); k.arc(0, 6, 17, 0, 7); k.fill(); k.fillRect(-7, -14, 14, 8);
    k.strokeStyle = PARCHEMIN; k.lineWidth = 1.5; k.beginPath(); k.arc(0, 6, 12, Math.PI * 1.1, Math.PI * 1.45); k.stroke();
    k.strokeStyle = ENCRE; k.lineWidth = 2; k.beginPath(); k.moveTo(0, -14); k.quadraticCurveTo(6, -22, 13, -21); k.stroke();
    k.fillStyle = ROUGE; for (const [a, l] of [[0, 8], [1.2, 7], [2.4, 6], [3.6, 7], [4.8, 6]]) { k.beginPath(); k.moveTo(15, -22); k.lineTo(15 + Math.cos(a) * l, -22 + Math.sin(a) * l); k.lineWidth = 2; k.strokeStyle = ROUGE; k.stroke(); }
  } else if (id === 'pagode') {
    // pagode à trois toits, flèche rouge
    for (const [y, w] of [[-14, 14], [-2, 20], [10, 26]]) { k.beginPath(); k.moveTo(-w, y + 2); k.quadraticCurveTo(-w * 0.4, y - 1, 0, y - 7); k.quadraticCurveTo(w * 0.4, y - 1, w, y + 2); k.lineTo(w - 4, y + 4); k.lineTo(-w + 4, y + 4); k.closePath(); k.fill(); }
    k.fillRect(-9, -11, 18, 9); k.fillRect(-13, 1, 26, 9); k.fillRect(-17, 13, 34, 9);
    k.strokeStyle = ROUGE; L(0, -21, 0, -31, 2.5);
  } else if (id === 'fosse') {
    // rangée de pieux au bord d'un fossé
    k.beginPath(); k.moveTo(-28, 14); k.quadraticCurveTo(0, 26, 28, 14); k.lineTo(28, 20); k.quadraticCurveTo(0, 30, -28, 20); k.closePath(); k.fill();
    for (let i = 0; i < 5; i++) { const x = -20 + i * 10; k.beginPath(); k.moveTo(x - 3, 14); k.lineTo(x + 7, -18 + (i % 2) * 6); k.lineTo(x + 3, 14); k.closePath(); k.fill(); }
    k.fillStyle = ROUGE; k.beginPath(); k.arc(-13, -12, 2.5, 0, 7); k.fill();
  } else if (id === 'sanctuaire') {
    // lanterne de papier suspendue
    L(-18, -26, 18, -26, 3); L(0, -26, 0, -18, 2);
    k.fillRect(-9, -19, 18, 4); k.fillRect(-9, 17, 18, 4);
    k.fillStyle = ROUGE; k.beginPath(); k.ellipse(0, 0, 15, 17, 0, 0, 7); k.fill();
    k.strokeStyle = ENCRE; k.lineWidth = 1.2; for (const y of [-8, 0, 8]) { k.beginPath(); k.moveTo(-14 + Math.abs(y) * 0.4, y); k.lineTo(14 - Math.abs(y) * 0.4, y); k.stroke(); }
    L(0, 21, 0, 28, 2);
  }
  k.restore();
}

function creerCarte(b) {
  const m = 6, c = creerCanvas(CARTE_W + 2 * m, CARTE_H + 2 * m), k = c.getContext('2d');
  const w = CARTE_W, h = CARTE_H, cc = 10;
  k.translate(m, m);
  k.beginPath();
  k.moveTo(cc, 0); k.lineTo(w - cc, 0); k.lineTo(w, cc); k.lineTo(w, h - cc); k.lineTo(w - cc, h); k.lineTo(cc, h); k.lineTo(0, h - cc); k.lineTo(0, cc); k.closePath();
  k.fillStyle = PARCHEMIN; k.fill();
  k.save(); k.clip();
  const g = k.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(120,80,40,0.3)');
  k.fillStyle = g; k.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) { k.fillStyle = `rgba(110,80,50,${Math.random() * 0.08})`; k.fillRect(Math.random() * w, Math.random() * h, 1.2, 1.2); }
  k.restore();
  k.strokeStyle = ENCRE; k.lineWidth = 3; k.stroke();
  k.globalAlpha = 0.5; k.lineWidth = 1;
  k.beginPath(); k.moveTo(cc + 3, 5); k.lineTo(w - cc - 3, 5); k.lineTo(w - 5, cc + 3); k.lineTo(w - 5, h - cc - 3); k.lineTo(w - cc - 3, h - 5); k.lineTo(cc + 3, h - 5); k.lineTo(5, h - cc - 3); k.lineTo(5, cc + 3); k.closePath(); k.stroke();
  k.globalAlpha = 1;
  k.fillStyle = ENCRE; k.font = fonte('bold', 17, SANS); k.textAlign = 'center'; k.textBaseline = 'middle';
  { let t = 17; while (t > 11 && k.measureText(b.nom).width > w - 10) k.font = fonte('bold', --t, SANS); } // nom trop long : plus petit
  k.fillText(b.nom, w / 2, 79);
  return c;
}
const imagesCartes = Object.fromEntries(TOUS_BATIMENTS.map(b => [b.id, creerCarte(b)]));
// Icônes à part, pour pouvoir les griser quand l'amélioration n'est pas abordable
const ICONE_W = 80, ICONE_H = 72, ICONE_Y = 44;
const iconesCartes = Object.fromEntries(TOUS_BATIMENTS.map(b => {
  const c = creerCanvas(ICONE_W, ICONE_H), k = c.getContext('2d');
  iconeBatiment(k, b.id, ICONE_W / 2, ICONE_H / 2 + 2);
  return [b.id, c];
}));
const cadreChoix = (function () {
  const c = creerCanvas(CARTE_W + 24, CARTE_H + 24), k = c.getContext('2d');
  cadrePinceau(k, 10, 10, CARTE_W + 4, CARTE_H + 4, 4.5, ROUGE);
  return c;
})();

// Cadres de parchemin (panneau) et boutons d'encre, mis en cache
const cache = {};
function parchemin(w, h) {
  const id = `p${w}x${h}`; if (cache[id]) return cache[id];
  const m = 10, c = creerCanvas(w + 2 * m, h + 2 * m), k = c.getContext('2d');
  k.fillStyle = 'rgba(0,0,0,0.3)'; k.fillRect(m + 4, m + 6, w, h);
  k.fillStyle = PARCHEMIN; k.beginPath(); k.rect(m, m, w, h); k.fill();
  const g = k.createRadialGradient(m + w / 2, m + h / 2, 10, m + w / 2, m + h / 2, w * 0.6);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(120,80,40,0.25)'); k.fillStyle = g; k.fill();
  cadrePinceau(k, m, m, w, h, 3);
  return (cache[id] = c);
}
function boutonRouge(w, h) {
  const id = `r${w}x${h}rouge`; if (cache[id]) return cache[id];
  const c = creerCanvas(w + 12, h + 8), k = c.getContext('2d');
  for (let i = 0; i < 3; i++) pinceau(k, trajet(6 + rand(0, 3), 4 + h * (0.3 + 0.2 * i), w + 6 - rand(0, 3), 4 + h * (0.3 + 0.2 * i), 1), h * 0.5, ROUGE, 0.5, PARCHEMIN);
  return (cache[id] = c);
}
function boutonEncre(w, h, actif) {
  const id = `b${w}x${h}${actif}`; if (cache[id]) return cache[id];
  const c = creerCanvas(w + 12, h + 8), k = c.getContext('2d');
  const coul = actif ? ENCRE : '#9b918a';
  for (let i = 0; i < 3; i++) pinceau(k, trajet(6 + rand(0, 3), 4 + h * (0.3 + 0.2 * i), w + 6 - rand(0, 3), 4 + h * (0.3 + 0.2 * i), 1), h * 0.5, coul, 0.5, PARCHEMIN);
  return (cache[id] = c);
}
// Bouton de talent : encre bleu nuit (couleur des cristaux)
function boutonCristal(w, h, actif) {
  const id = `c${w}x${h}${actif}`; if (cache[id]) return cache[id];
  const c = creerCanvas(w + 12, h + 8), k = c.getContext('2d');
  const coul = actif ? '#2c4268' : '#9a9cab';
  for (let i = 0; i < 3; i++) pinceau(k, trajet(6 + rand(0, 3), 4 + h * (0.3 + 0.2 * i), w + 6 - rand(0, 3), 4 + h * (0.3 + 0.2 * i), 1), h * 0.5, coul, 0.5, PARCHEMIN);
  return (cache[id] = c);
}
// ---------------------------------------------------------------------
//  Couches de nuit (cycle jour/nuit) : ciel d'encre et astres, découpés par le masque des montagnes
// ---------------------------------------------------------------------
masqueMontagnes.fillRect(0, Y_CIEL + 20, W, H); // le sol, sous l'horizon
masqueMontagnes = null;
function decouperParMasque(c) {
  const k = c.getContext('2d');
  k.globalCompositeOperation = 'destination-out'; k.drawImage(masque, 0, 0); k.globalCompositeOperation = 'source-over';
  return c;
}
const cielNuit = (() => {
  const c = creerCanvas(W, H), k = c.getContext('2d'), hC = Math.max(Y_CIEL, 60) + 40;
  const g = k.createLinearGradient(0, 0, 0, hC);
  g.addColorStop(0, '#1d2033'); g.addColorStop(0.75, CIEL_NUIT); g.addColorStop(1, '#4a4e64');
  k.fillStyle = g; k.fillRect(0, 0, W, hC);
  k.globalAlpha = 0.3;
  for (let i = 0; i < 5; i++) { const y = rand(Y_CIEL * 0.25, Y_CIEL * 0.85), x = rand(-40, W - 120); coup(k, x, y, x + rand(140, 260), y + rand(-4, 4), rand(6, 12), '#6b7090', 0.8, CIEL_NUIT); }
  return decouperParMasque(c);
})();
// étoiles et lune : posées APRÈS la teinte bleue, pour rester lumineuses
const LUNE = { x: 470, y: Y_CIEL * 0.5, r: Y_CIEL > 150 ? 24 : 18 };
const astresNuit = (() => {
  const c = creerCanvas(W, H), k = c.getContext('2d');
  for (let i = 0; i < 140; i++) {
    k.globalAlpha = rand(0.25, 0.9); k.fillStyle = Math.random() < 0.15 ? '#f6d9a8' : '#eef0f8';
    const r = Math.random() < 0.1 ? 1.4 : rand(0.4, 0.9); k.beginPath(); k.arc(rand(0, W), rand(0, Y_CIEL), r, 0, 7); k.fill();
  }
  const { x, y, r } = LUNE;
  const halo = k.createRadialGradient(x, y, r, x, y, r * 4);
  halo.addColorStop(0, 'rgba(230,226,205,0.35)'); halo.addColorStop(1, 'rgba(230,226,205,0)');
  k.globalAlpha = 1; k.fillStyle = halo; k.fillRect(x - r * 4, y - r * 4, r * 8, r * 8);
  k.fillStyle = '#f1ebd6'; cheminBlob(k, x, y, r, r, 3, 0, 0.02, 20); k.fill();
  k.globalAlpha = 0.12; k.fillStyle = '#5a5a6a';
  for (const [dx, dy, rr] of [[-7, -5, 6], [6, 4, 4], [-2, 9, 3], [9, -8, 3]]) { k.beginPath(); k.arc(x + dx, y + dy, rr, 0, 7); k.fill(); }
  return decouperParMasque(c);
})();

// Brume d'horizon : le bout du chemin se perd dans un voile de papier ; les monstres en émergent
const brumeHorizon = (function () {
  const hB = Y_CIEL > 0 ? 300 : 260, c = creerCanvas(W, hB), k = c.getContext('2d');
  const g = k.createLinearGradient(0, 0, 0, hB);
  if (Y_CIEL > 0) { // le haut du canevas est placé 60 px au-dessus de l'horizon
    g.addColorStop(0, 'rgba(243,228,207,0)'); g.addColorStop(0.2, 'rgba(243,228,207,0.7)');
    g.addColorStop(0.3, 'rgba(243,228,207,0.88)'); g.addColorStop(0.6, 'rgba(243,228,207,0.35)'); g.addColorStop(1, 'rgba(243,228,207,0)');
  } else {
    g.addColorStop(0, 'rgba(243,228,207,0.97)'); g.addColorStop(0.18, 'rgba(243,228,207,0.85)');
    g.addColorStop(0.45, 'rgba(243,228,207,0.4)'); g.addColorStop(1, 'rgba(243,228,207,0)');
  }
  k.fillStyle = g; k.fillRect(0, 0, W, hB);
  // bancs de brume en lavis clair
  for (let i = 0; i < 14; i++) {
    const y = Y_CIEL > 0 ? rand(50, hB * 0.55) : rand(20, hB * 0.6), x = rand(-120, W);
    k.globalAlpha = rand(0.25, 0.55) * (1 - y / hB);
    coup(k, x, y, x + rand(180, 360), y + rand(-6, 6), rand(16, 34), PAPIER);
  }
  return c;
})();
// Médaillon d'encre des sorts
const medaillon = (function () {
  const c = creerCanvas(60, 60), k = c.getContext('2d');
  k.fillStyle = ENCRE; cheminBlob(k, 30, 30, 24, 24, 4, 0, 0.06, 18); k.fill();
  k.strokeStyle = ENCRE; k.lineWidth = 2; k.globalAlpha = 0.6;
  k.beginPath(); k.arc(30, 30, 27, 0.4, Math.PI * 1.7); k.stroke();
  return c;
})();
// Voile de brume (traînées horizontales de lavis gris-bleu)
const brumeTex = (function () {
  const c = creerCanvas(W + 200, CHAMP_H), k = c.getContext('2d');
  for (let i = 0; i < 26; i++) {
    const y = rand(40, CHAMP_H - 40), x = rand(-100, W);
    k.globalAlpha = rand(0.08, 0.2);
    coup(k, x, y, x + rand(200, 420), y + rand(-12, 12), rand(30, 70), '#9aa6b8', 0.6, 'rgba(0,0,0,0)');
  }
  return c;
})();
function cadreRouge(w, h) {
  const id = `r${w}x${h}`; if (cache[id]) return cache[id];
  const c = creerCanvas(w + 24, h + 24), k = c.getContext('2d');
  cadrePinceau(k, 12, 12, w, h, 3.5, ROUGE);
  return (cache[id] = c);
}

// =====================================================================
//  TACHES D'ENCRE PERSISTANTES
// =====================================================================
const taches = creerCanvas(W, CHAMP_H);
const tctx = taches.getContext('2d');
let minuteurEstompe = 0;

function tampon(x, y, rx, ry, seed, alpha, couleur = ENCRE, ang = 0, amp = 0.22) {
  tctx.save(); tctx.translate(x, y); tctx.rotate(ang);
  tctx.globalAlpha = alpha; tctx.fillStyle = couleur;
  cheminBlob(tctx, 0, 0, rx, ry, seed, 0, amp); tctx.fill();
  tctx.restore();
}
function dessinerFlaque(c, f, k, t) {
  c.save(); c.translate(f.x, f.y);
  c.fillStyle = ENCRE; c.strokeStyle = ENCRE;
  for (const v of f.coulures) {
    c.globalAlpha = 0.45;
    cheminBlob(c, v.x * k, v.y * k, v.rx * k, v.ry * k, v.s, t, 0.25, 8); c.fill();
  }
  c.globalAlpha = 0.5;
  cheminBlob(c, 0, 0, f.rx * k, f.ry * k, f.seed, t, 0.3, 20); c.fill();
  c.globalAlpha = 0.85; c.lineWidth = 1.2 + f.rx / 18; c.stroke();
  c.globalAlpha = 0.35;
  cheminBlob(c, f.rx * 0.1, -f.ry * 0.1, f.rx * 0.5 * k, f.ry * 0.45 * k, f.seed + 2, t, 0.3, 10); c.fill();
  c.restore();
}

// =====================================================================
//  ÉTAT DE LA PARTIE
// =====================================================================
let G;
let record = 0;
try { record = +localStorage.getItem('muraille-record') || 0; } catch (e) { /* stockage indisponible */ }
composerPlateau(); // après la lecture du record (les cartes se débloquent avec lui)
let ecran = 'titre'; // 'titre' | 'jeu' | 'fin'
let souris = { x: -1, y: -1 };

function nouvellePartie() {
  tutoActif = null;
  G = {
    t: 0, or: 60, kills: 0, orGagne: 0,
    mur: { pv: 600, max: 600 },
    bat: Object.fromEntries(TOUS_BATIMENTS.map(b => [b.id, b.id === 'caserne' ? 1 : 0])),
    ennemis: [], fleches: [], rochers: [], flaques: [], gouttes: [], textes: [], ondes: [],
    archers: [], catas: [], balistes: [], carreaux: [], samourais: [], faucons: [], mortiers: [], brasiers: [],
    dragon: null, dragonCd: 8,
    budget: 0, prochain: 'gobelin', prochainBoss: 360,
    hordeAvant: false, banniere: null, nuitAvant: 0, nuitTraversee: false,
    prestige: {}, reliques: {}, chefsVenus: 0, raz: null, reliquesOuvert: false,
    xp: 0, niveau: 1, niveauxEnAttente: 0, choixNiveau: null, amelio: {},
    pause: false, pauseAuto: false, confirmerRecommencer: 0, vitesse: 1, choix: null,
    cristaux: 0, cristauxGagnes: 0, talents: {}, feu: false,
    recharges: { pluie: 0, brume: 0, rempart: 0, raz: 0 },
    brume: 0, pluie: [], pluieImpact: -1, rempartFlash: 0,
  };
  G.corbeaux = []; G.prochainCorbeau = rand(5, 10);
  G.alliances = new Set(alliancesDe(BATIMENTS.map(b => b.id)).map(a => a.id));
  ajouterArcher(); ajouterArcher();
  G.defi = defiDemande; defiDemande = null; // défi du jour (ou partie normale)
  // héritage : bonus permanents de départ
  for (let k = 0; k < herit('veterans'); k++) ajouterArcher();
  G.or += 80 * herit('tresor'); G.mur.max += 100 * herit('fondations'); G.mur.pv = G.mur.max; G.cristaux += 3 * herit('cristal');
  if (defiModif('murFragile')) { G.mur.max = Math.round(G.mur.max * 0.6); G.mur.pv = G.mur.max; }
  tctx.clearRect(0, 0, W, CHAMP_H);
}

function ajouterArcher() { G.archers.push({ cd: rand(0, 1), tir: 0, dir: Math.random() < 0.5 ? 1 : -1, vise: 2, anim: -1, cible: null, tire: false }); }
// ---------------------------------------------------------------------
//  Balistes, samouraïs, faucons (cartes alternatives du plateau)
// ---------------------------------------------------------------------
const BALISTE = { degats: 90, recharge: 3.2, vitesse: 950, perte: 0.85 };   // perte : dégâts ×0,85 à chaque monstre transpercé
const SAMOURAI = { degats: 32, pv: 260, recharge: 0.7, allonge: 40, reapparition: 5, y: MUR_Y - 62, garde: 70 };
const SAMOURAI_COUP = 0.5; // durée de l'animation de frappe (8 images)
// Planches dessinées : assets/samourai-dos.png (8 images 250 × 460 : garde puis frappe verticale, vu de dos),
// samourai-gauche.png / samourai-droite.png (3 rangées de 8 images 250 × 222 : attente, marche, frappe de côté).
const PLANCHES_SAMOURAI = { ips: 12,
  dos: { img: null, src: 'assets/samourai-dos.png', cw: 250, ch: 460, pieds: [130, 428], echelle: 0.18 },
  g:   { img: null, src: 'assets/samourai-gauche.png', cw: 250, ch: 222.67, pieds: [[144, 212], [139, 201], [140, 201]], echelle: 0.3 },
  d:   { img: null, src: 'assets/samourai-droite.png', cw: 250, ch: 222.67, pieds: [[141, 211], [140, 204], [126, 203]], echelle: 0.3 } };
for (const k of ['dos', 'g', 'd']) { const P = PLANCHES_SAMOURAI[k], img = new Image(); img.onload = () => { P.img = img; }; img.src = P.src; }
const POSTES_SAMOURAIS = [-90, 90, 0, -190, 190, -270].map(dx => W / 2 + dx);
const FAUCON = { degats: 50, vitesse: 380, repos: 1.4, marque: 5 };   // marque : durée (s) pendant laquelle la proie subit plus de dégâts
const bonusMarque = () => 0.15 + 0.07 * G.bat.fauconnerie;   // +22 % à +50 % de dégâts sur les proies marquées
const minutesJeu = () => G.t / 60;
function ajouterBaliste() { const x = POSTES_CATAS[G.balistes.length]; G.balistes.push({ x, y: murHaut(x) - 2, cd: rand(1, 2), angle: -Math.PI / 2, recul: 0, anim: -1, tir: false }); }
// Baliste dessinée (assets/baliste.png) : 8 images de 250 × 420, dans la cour comme les catapultes.
// Image 0 = armée, 1-3 = on tend la corde, 4 = départ du carreau (éclats), 5-7 = détente puis réarmement.
// les images ne sont pas centrées pareil dans leur case : x des pieds mesuré image par image
const PLANCHE_BALISTE = { cw: 250, ch: 420, piedsX: [128, 114, 100, 102, 119, 124, 127, 129], piedsY: 377, echelle: 0.28, ips: 14, lacher: 4, bout: [119, 145] };
let plancheBaliste = null;
{ const img = new Image(); img.onload = () => { plancheBaliste = img; }; img.src = 'assets/baliste.png'; }
function departCarreau(i) {
  const b = baseCatapulte(i), P = PLANCHE_BALISTE;
  return { x: b.x + (P.bout[0] - P.piedsX[P.lacher]) * P.echelle, y: b.y + (P.bout[1] - P.piedsY) * P.echelle };
}
function dessinerBalisteSprite(b, i) {
  const P = PLANCHE_BALISTE, base = baseCatapulte(i), e = P.echelle;
  const col = b.anim >= 0 ? Math.min(7, Math.floor(b.anim * P.ips)) : 0;
  ctx.drawImage(plancheBaliste, col * P.cw, 0, P.cw, P.ch, base.x - P.piedsX[col] * e, base.y - P.piedsY * e, P.cw * e, P.ch * e);
}
const degatsBaliste = () => BALISTE.degats * multDegats() * (1 + 0.17 * nv('mortiers')) * (1 + 0.15 * prestige('balistes')) * (G.talents.balistes ? 1.4 : 1) * (alliance('tours') ? 1.2 : 1);
const rechargeBaliste = () => BALISTE.recharge * (G.talents.balistes ? 0.8 : 1) * (1 - 0.1 * nv('treuils')) * (alliance('chasseur') ? 0.75 : 1);
const bonusSamourai = () => (G.talents.dojo ? 1.5 : 1) * (1 + 0.15 * prestige('dojo'));
const degatsSamourai = () => SAMOURAI.degats * multDegats() * (1 + 0.2 * nv('kenjutsu')) * bonusSamourai() * (1 + 0.04 * minutesJeu()) * (alliance('moines') ? 1.4 : 1);
const pvSamourai = () => SAMOURAI.pv * bonusSamourai() * (1 + 0.15 * Math.max(0, G.bat.dojo - 1)) * (1 + 0.08 * minutesJeu()) * (alliance('paysans') ? 1.35 : 1);
const degatsFaucon = () => FAUCON.degats * multDegats() * (1 + 0.35 * Math.max(0, G.bat.fauconnerie - 1)) * (1 + 0.05 * minutesJeu()) * (G.talents.fauconnerie ? 1.5 : 1) * (1 + 0.12 * prestige('fauconnerie'));
const nbFaucons = () => G.bat.fauconnerie ? FAUCONS[G.bat.fauconnerie] + nv('pelerins') : 0;
// un samouraï vivant juste devant ce monstre ? (il le retient)
function samouraiDevant(e) {
  for (const s of G.samourais) {
    if (s.mort) continue;
    const ecart = s.y - pieds(e), p = perspective(s.y);
    if (ecart >= -4 && ecart < 16 && Math.abs(e.x - s.x) < (e.r + 18) * p) return s;
  }
  return null;
}
function tomberSamourai(s) {
  s.mort = true; s.reapp = SAMOURAI.reapparition * (alliance('paysans') ? 0.5 : 1);
  eclabousser(s.x, s.y - 18, 8, 160, 1.6);
}
const POUDRE = { degats: 24, recharge: 5.5, zone: 70, duree: 4, dps: 10 };
function ajouterMortier() { const x = POSTES_CATAS[G.mortiers.length]; G.mortiers.push({ x, y: murHaut(x) - 2, cd: rand(1, 2), recul: 0, anim: -1 }); }
const DRAGON = { degats: 85, vitesse: 760, bande: 42 };
const degatsDragon = () => DRAGON.degats * (1 + 0.4 * Math.max(0, G.bat.pagode - 1)) * multDegats() * (1 + 0.17 * nv('mortiers'))
  * (1 + 0.15 * prestige('pagode')) * (G.talents.pagode ? 1.6 : 1) * (1 + 0.03 * G.t / 60);
function majPoudreEtDragon(dt, vivants) {
  const md = multDegats();
  // mortiers à poudre : visent le groupe le plus dense, comme les catapultes
  for (const m of G.mortiers) {
    m.cd -= dt; m.recul = Math.max(0, m.recul - dt * 3);
    if (m.anim >= 0) { m.anim += dt; if (m.anim * MORTIER_SPRITE.ipsTir >= 13) m.anim = -1; }
    if (m.cd > 0) continue;
    let cible = null, meilleur = -1;
    const echant = vivants.length > 50 ? vivants.filter(() => Math.random() < 50 / vivants.length) : vivants;
    for (const e of echant) {
      if (e.mort || pieds(e) < Y_HORIZON + 30) continue;
      let n = 0; const zone = POUDRE.zone * perspective(pieds(e));
      for (const o of vivants) if (Math.hypot(o.x - e.x, o.y - e.y) < zone) n += o.r;
      n += e.y * 0.02;
      if (n > meilleur) { meilleur = n; cible = e; }
    }
    if (!cible) { m.cd = 0.3; continue; }
    m.cd = POUDRE.recharge * (1 - 0.1 * nv('treuils')) * rand(0.9, 1.1); m.recul = 1; m.anim = 0;
    const ty = cible.auMur ? cible.y : Math.min(cible.y + vitesseEcran(cible) * CATAPULTE.vol, murHaut(cible.x) - cible.taille * 1.1 - ARRET_MUR);
    const bonus = (1 + 0.17 * nv('mortiers')) * (1 + 0.15 * prestige('poudrerie')) * (G.talents.poudrerie ? 1.4 : 1);
    G.rochers.push({ x0: m.x, y0: m.y - 20, x1: cible.x, y1: ty, t: 0, degats: POUDRE.degats * md * bonus,
      poudre: { duree: POUDRE.duree + (G.talents.poudrerie ? 2 : 0) + (alliance('gregeois') ? 2 : 0),
        dps: POUDRE.dps * md * bonus * (1 + 0.05 * G.t / 60) * (alliance('gregeois') ? 1.3 : 1) } });
  }
  // sol embrasé : brûle les monstres qui le traversent
  for (const b of G.brasiers) {
    b.t -= dt;
    for (const e of vivants) {
      if (e.mort || Math.hypot(e.x - b.x, (e.y - b.y) * 1.6) > b.zone) continue;
      compterDegats('Poudrerie', b.dps * dt, e); e.pv -= b.dps * dt; e.flambe = 0.3;
      if (alliance('fumees') && Math.random() < dt) empoisonner(e);
      if (e.pv <= 0) tuer(e);
    }
  }
  G.brasiers = G.brasiers.filter(b => b.t > 0);
  // dragon d'encre : passe régulièrement et balaie la rangée la plus peuplée
  if (G.bat.pagode > 0 && !G.dragon) {
    G.dragonCd -= dt;
    if (G.dragonCd <= 0) {
      const candidats = vivants.filter(e => !e.mort && pieds(e) > Y_HORIZON + 40);
      if (!candidats.length) G.dragonCd = 1;
      else {
        let meilleurY = 0, meilleur = -1;
        for (const c of candidats) {
          const y = pieds(c), bande = DRAGON.bande * perspective(y) * (G.talents.pagode ? 1.4 : 1);
          let n = 0; for (const o of candidats) if (Math.abs(pieds(o) - y) < bande) n += o.r;
          if (n > meilleur) { meilleur = n; meilleurY = y; }
        }
        const dir = Math.random() < 0.5 ? 1 : -1;
        G.dragon = { y: meilleurY, x: dir > 0 ? -260 : W + 260, dir, touches: new Set(), trace: [], degats: degatsDragon() };
        G.dragonCd = PERIODE_DRAGON[G.bat.pagode] * (1 - 0.1 * nv('treuils')) * (alliance('ciel') ? 0.8 : 1)
          * (alliance('lanternes') ? 1 - 0.5 * niveauNuit(G.t) : 1);
        Bruitages.jouer('murMassue', W / 2, 0.6);
      }
    }
  }
  if (G.dragon) {
    const d = G.dragon, p = perspective(d.y), bande = DRAGON.bande * p * (G.talents.pagode ? 1.4 : 1);
    d.x += d.dir * DRAGON.vitesse * dt;
    const pv = Math.max(0.8, p);
    d.trace.unshift({ x: d.x, y: d.y - 26 * pv + Math.sin(d.x * 0.025) * 20 * pv });
    if (d.trace.length > 36) d.trace.pop();
    for (const e of vivants) {
      if (e.mort || d.touches.has(e) || Math.abs(pieds(e) - d.y) > bande || Math.abs(e.x - d.x) > 30) continue;
      d.touches.add(e); blesser(e, d.degats, 'sort', 'Dragon');
      if (Math.random() < 0.4) eclabousser(e.x, e.y, 3, 110, 1);
    }
    if ((d.dir > 0 && d.x > W + 420) || (d.dir < 0 && d.x < -420)) G.dragon = null;
  }
}
function majUnitesPlateau(dt, vivants) {
  majPoudreEtDragon(dt, vivants);
  // --- balistes : visent le monstre le plus robuste ; le carreau traverse la file
  G.balistes.forEach((b, ib) => {
    b.cd -= dt; b.recul = Math.max(0, b.recul - dt * 3);
    let cible = null, meilleur = -1;
    for (const e of vivants) {
      if (e.mort || pieds(e) < Y_HORIZON + 30) continue;
      const v = e.pv * (e.elite === 'colosse' ? 1.5 : 1); if (v > meilleur) { meilleur = v; cible = e; }
    }
    const o = plancheBaliste ? departCarreau(ib) : { x: b.x, y: b.y - 20 };
    if (cible) b.angle = Math.atan2(centreY(cible) - o.y, cible.x - o.x);
    const lancer = () => {
      G.carreaux.push({ x: o.x, y: o.y, vx: Math.cos(b.angle) * BALISTE.vitesse, vy: Math.sin(b.angle) * BALISTE.vitesse, degats: degatsBaliste(), touches: new Set() });
      Bruitages.jouer('fleche', o.x, 0.9);
    };
    // animation : le carreau part à l'image du lâcher, vers la cible du moment
    if (b.anim >= 0) {
      b.anim += dt;
      if (b.tir && b.anim * PLANCHE_BALISTE.ips >= PLANCHE_BALISTE.lacher) { b.tir = false; if (cible) lancer(); }
      if (b.anim * PLANCHE_BALISTE.ips >= 8) b.anim = -1;
    }
    if (!cible || b.cd > 0 || b.anim >= 0) return;
    b.cd = rechargeBaliste() * rand(0.92, 1.08); b.recul = 1;
    if (plancheBaliste) { b.anim = 0; b.tir = true; } else lancer();
  });
  for (const c of G.carreaux) {
    c.x += c.vx * dt; c.y += c.vy * dt;
    for (const e of vivants) {
      if (e.mort || c.touches.has(e)) continue;
      if (Math.hypot(e.x - c.x, centreY(e) - c.y) < e.r * perspective(pieds(e)) + 8) { c.touches.add(e); blesser(e, c.degats, 'roc', 'Balistes'); c.degats *= BALISTE.perte; }
    }
    if (c.y < Y_HORIZON - 20 || c.x < -20 || c.x > W + 20 || (c.vy > 0 && c.y > MUR_Y) || c.y > H) c.fini = true;
  }
  G.carreaux = G.carreaux.filter(c => !c.fini);

  // --- samouraïs : se postent devant la muraille, interceptent, frappent ; reviennent après leur chute
  const nbS = SAMOURAIS[G.bat.dojo];
  while (G.samourais.length < nbS) { const i = G.samourais.length; G.samourais.push({ poste: POSTES_SAMOURAIS[i], x: POSTES_SAMOURAIS[i], y: SAMOURAI.y, pv: pvSamourai(), max: pvSamourai(), cd: rand(0, 0.5), coup: 0, mort: false, reapp: 0, dir: 1 }); }
  for (const s of G.samourais) {
    if (s.mort) { s.reapp -= dt; if (s.reapp <= 0) { s.mort = false; s.max = s.pv = pvSamourai(); s.x = s.poste; } continue; }
    s.cd -= dt; s.coup = Math.max(0, s.coup - dt);
    if (alliance('moines')) s.pv = Math.min(s.max, s.pv + 6 * dt);
    // interception : se décaler vers le monstre qui arrive dans sa zone
    let menace = null, dmin = Infinity;
    for (const e of vivants) {
      if (e.mort) continue;
      const dy = s.y - pieds(e); if (dy < -6 || dy > 120 || Math.abs(e.x - s.poste) > SAMOURAI.garde + 30) continue;
      if (dy < dmin) { dmin = dy; menace = e; }
    }
    const viseX = menace ? clamp(menace.x, s.poste - SAMOURAI.garde, s.poste + SAMOURAI.garde) : s.poste;
    const pas = clamp(viseX - s.x, -90 * dt, 90 * dt); s.x += pas; if (Math.abs(pas) > 0.01) s.dir = Math.sign(pas);
    s.bouge = Math.abs(pas) > 0.05 * dt * 60; if (s.bouge) s.marche = (s.marche || 0) + dt * PLANCHES_SAMOURAI.ips;
    if (s.cd <= 0) {
      let cible = null, dc = SAMOURAI.allonge * perspective(s.y);
      for (const e of vivants) { if (e.mort) continue; const d = Math.hypot(e.x - s.x, pieds(e) - s.y); if (d < dc) { dc = d; cible = e; } }
      if (cible) {
        s.cd = SAMOURAI.recharge * rand(0.9, 1.1); s.coup = SAMOURAI_COUP; s.dir = Math.sign(cible.x - s.x) || s.dir;
        s.cote = Math.abs(cible.x - s.x) > Math.abs(pieds(cible) - s.y) * 1.2; // frappe de côté, sinon de face (vu de dos)
        blesser(cible, degatsSamourai(), 'sabre');
      }
    }
  }

  // --- faucons : perchés sur le pavillon, piquent sur les monstres rapides en priorité
  const nbF = nbFaucons();
  while (G.faucons.length < nbF) { const i = G.faucons.length, px = W / 2 - 50 + (i % 5) * 25, py = MUR_Y - 100 - Math.floor(i / 5) * 8; G.faucons.push({ x: px, y: py, px, py, etat: 'perche', cd: rand(0.3, 1.2), cible: null, vx: 1, ph: Math.random() * 8 }); }
  const prises = new Set(G.faucons.filter(fa => fa.etat === 'chasse' && fa.cible).map(fa => fa.cible));
  const proie = () => {
    let best = null, bv = -Infinity;
    for (const e of vivants) {
      if (e.mort || prises.has(e) || pieds(e) < Y_HORIZON + 20) continue;
      const v = pieds(e) + (e.k === 'rodeur' || e.elite === 'enrage' ? 1000 : 0); if (v > bv) { bv = v; best = e; }
    }
    if (best) prises.add(best); return best;
  };
  const vitesseF = FAUCON.vitesse * (G.talents.fauconnerie ? 1.25 : 1);
  for (const fa of G.faucons) {
    fa.ph += dt * (fa.etat === 'perche' ? 2 : 12);
    if (fa.etat === 'perche') { fa.cd -= dt; if (fa.cd <= 0) { fa.cible = proie(); if (fa.cible) fa.etat = 'chasse'; else fa.cd = 0.4; } continue; }
    if (fa.etat === 'chasse' && (!fa.cible || fa.cible.mort)) { fa.cible = proie(); if (!fa.cible) fa.etat = 'retour'; }
    const tx = fa.etat === 'chasse' ? fa.cible.x : fa.px, ty = fa.etat === 'chasse' ? centreY(fa.cible) : fa.py;
    const dx = tx - fa.x, dy = ty - fa.y, d = Math.hypot(dx, dy) || 1;
    fa.vx = dx; fa.x += dx / d * Math.min(d, vitesseF * dt); fa.y += dy / d * Math.min(d, vitesseF * dt);
    if (fa.etat === 'chasse' && d < 12) { fa.cible.marque = G.t + FAUCON.marque; blesser(fa.cible, degatsFaucon(), 'roc', 'Faucons'); fa.cible = null; fa.etat = 'retour'; }
    else if (fa.etat === 'retour' && d < 6) { fa.etat = 'perche'; fa.cd = FAUCON.repos * rand(0.85, 1.15); fa.x = fa.px; fa.y = fa.py; }
  }
}

function ajouterCatapulte() { const x = POSTES_CATAS[G.catas.length]; G.catas.push({ x, y: murHaut(x) - 2, cd: rand(1, 2), bras: 0, anim: -1, tir: null }); }

// 20 postes sur le chemin de ronde, de part et d'autre du pavillon
const POSTES_ARCHERS = [];
for (const cote of [-1, 1]) for (let i = 0; i < 10; i++) POSTES_ARCHERS.push(W / 2 + cote * (100 + i * (W / 2 - 100 - 24) / 9));
POSTES_ARCHERS.sort((a, b) => a - b);
function posteArcher(i) {
  const n = G.archers.length, x = POSTES_ARCHERS[Math.min(19, Math.floor((i + 0.5) * 20 / n))];
  return { x, y: murHaut(x) - 8 };
}

function banniere(txt, couleur = ENCRE) { G.banniere = { txt, t: 0, couleur, bandeau: creerBandeau(couleur) }; }

function eclabousser(x, y, n, force, taille, dirY = 0) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = rand(0.3, 1) * force;
    G.gouttes.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v + dirY, v0: v, r: rand(0.5, 1) * taille, t: 0, vie: rand(0.2, 0.45) });
  }
}

// ---------------------------------------------------------------------
//  Ennemis
// ---------------------------------------------------------------------
function choisirType(t) {
  const liste = []; let total = 0;
  for (const k in TYPES) {
    const ty = TYPES[k];
    if (ty.poids && t >= ty.deb) {
      const w = ty.poids * Math.min(1, (t - ty.deb) / 60 + 0.2);
      liste.push([k, w]); total += w;
    }
  }
  let r = Math.random() * total;
  for (const [k, w] of liste) if ((r -= w) <= 0) return k;
  return 'gobelin';
}

// Élites : à partir de 15 min, une part croissante des monstres reçoit un trait (liseré coloré)
const ELITES = {
  blinde:  { nom: 'blindé',  couleur: '#6f9fd8', armure: 0.5 },          // résiste aux flèches
  enrage:  { nom: 'enragé',  couleur: '#e0402a', vitesse: 1.6 },         // rapide
  colosse: { nom: 'colosse', couleur: '#9a4fd0', pv: 3, taille: 1.35 },  // énorme
};
const chanceElite = t => clamp((t / 60 - 15) * 0.02, 0, 0.4);
function apparaitre(k) {
  const ty = TYPES[k], spr = SPRITES[k][0];
  let s = echellePV(G.t);
  if (k === 'chef') { G.chefsVenus = (G.chefsVenus || 0) + 1; s *= 1 + 0.5 * (G.chefsVenus - 1); }
  const e = {
    k, ty, u: rand(-0.8, 0.8), y: Y_HORIZON - spr.u * 1.1, x: 0,
    pv: ty.pv * s, max: ty.pv * s, r: ty.r, taille: spr.u,
    seed: Math.random() * 100, phase: Math.random() * 6.28, pas: Math.random() * 4,
    flash: 0, mort: false, fonte: 0, auMur: false, trace: rand(0, 0.5),
  };
  if (k !== 'chef' && Math.random() < chanceElite(G.t)) {
    const cle = ['blinde', 'enrage', 'colosse'][Math.floor(Math.random() * 3)], el = ELITES[cle];
    e.elite = cle;
    if (el.pv) { e.pv *= el.pv; e.max *= el.pv; e.r *= 1.3; }
  }
  e.x = cheminCentre(e.y) + e.u * (cheminDemi(e.y) - e.r);
  G.ennemis.push(e);
}
const pieds = e => e.y + e.taille * 1.1;
// centre apparent du corps, une fois l'échelle de profondeur appliquée
const centreY = e => pieds(e) - e.taille * 1.1 * perspective(pieds(e));
// vitesse apparente (px/s à l'écran) : lente au loin, rapide près du mur, ralentie par la brume
const vitesseEcran = e => (defiModif('rapides') ? 1.25 : 1) * e.ty.vit * (e.elite === 'enrage' ? ELITES.enrage.vitesse : 1) * perspective(pieds(e)) * COMPENSATION_PROFONDEUR * (G.brume > 0 ? 0.5 : 1) * ralentissement(e);

// Statistiques de partie : dégâts réellement infligés par source (G.stats), vie de la muraille toutes les 5 s (G.histoMur)
const NOM_SOURCE = { fleche: 'Archers', roc: 'Catapultes', sabre: 'Samouraïs', sort: 'Sorts' };
function compterDegats(stat, v, e) { if (!G.stats) G.stats = {}; const r = Math.max(0, Math.min(v, e.pv)); G.stats[stat] = (G.stats[stat] || 0) + r; }
function blesser(e, degats, source, stat) {
  if (e.mort) return;
  if (source === 'fleche') degats *= 1 - Math.min(0.9, e.ty.armure + (e.elite === 'blinde' ? ELITES.blinde.armure : 0)) * (G.talents.forge ? 0.5 : 1);
  if (e.marque > G.t) degats *= 1 + bonusMarque();
  if (dansAura(e)) degats *= 1 + 0.08 * G.bat.temple; // les monstres dans l'aura du temple sont vulnérables
  compterDegats(stat || NOM_SOURCE[source] || source, degats, e);
  e.pv -= degats; e.flash = 0.12;
  if (!(e.reactionCd > 0)) { e.reaction = REACTION_DUREE; e.reactionCd = rand(1, 1.5); }
  if (source === 'fleche' && Math.random() < 0.6) eclabousser(e.x, e.y, 2, 60, 1.2, -50);
  if (e.pv <= 0) tuer(e);
}

// Encre gagnée : un seul « +N » toutes les 0,9 s, au milieu des monstres tombés (au lieu d'un par monstre,
// qui recouvraient les cristaux)
function majTextesEncre(dt) {
  const ae = G.encreFlottante; if (!ae) return;
  ae.minuteur = (ae.minuteur || 0) + dt;
  if (ae.minuteur < 0.9 || !ae.n) return;
  G.textes.push({ x: ae.x / ae.n, y: ae.y / ae.n, txt: '+' + nombre(ae.somme), t: 0, encre: true });
  G.encreFlottante = { somme: 0, x: 0, y: 0, n: 0, minuteur: 0 };
}
// secousse de l'écran (décroît toute seule ; appliquée au canvas dans la boucle)
function secouer(force) { /* tremblements retirés à la demande du joueur (13/11/2026) */ }
function tuer(e) {
  e.mort = true; e.fonte = 0;
  compterSucces('kills'); if (e.k === 'troll') compterSucces('trolls'); if (e.k === 'chef') compterSucces('chefs');
  // la mort éclabousse d'encre, plus fort pour les gros
  const gros = e.k === 'troll' || e.k === 'chef';
  eclabousser(e.x, e.y - e.taille * 0.4, gros ? 14 : 4, gros ? 170 : 90, gros ? 2 : 1.2, -60);
  if (e.k === 'chef') secouer(6); else if (e.k === 'troll') secouer(2.5);
  G.kills++;
  const bonusElite = e.elite ? (e.elite === 'colosse' ? 3 : 2) : 1;
  const gain = Math.round((defiModif('encreRare') ? 0.7 : 1) * bonusElite * e.ty.or * (1 + 0.03 * G.t / 60) * (1 + NUIT_EFFETS.butin * niveauNuit(G.t)) * (1 + 0.2 * nv('pillage')) * (1 + 0.12 * G.bat.comptoir) * (G.talents.comptoir ? 1.25 : 1) * (e.poison > 0 && alliance('venin') ? 1.3 : 1));
  if (e.poison > 0 && G.talents.alchimiste) contagion(e);
  G.or += gain; G.orGagne += gain;
  // l'encre gagnée n'est plus affichée à chaque monstre : elle est regroupée (voir majTextesEncre)
  const ae = G.encreFlottante || (G.encreFlottante = { somme: 0, x: 0, y: 0, n: 0 });
  ae.somme += gain; ae.x += e.x; ae.y += e.y - e.taille; ae.n++;
  const cr = GAIN_CRISTAUX[e.k] || (Math.random() < (CHANCE_CRISTAL[e.k] || 0) ? 1 : 0);
  if (cr) { gagnerCristaux(cr); G.textes.push({ x: e.x, y: e.y - e.taille - 18, txt: '+' + cr, t: -0.15, cristal: true }); }
  else if (Math.random() < 0.03 * nv('eclats')) { gagnerCristaux(1); G.textes.push({ x: e.x, y: e.y - e.taille - 18, txt: '+1', t: -0.15, cristal: true }); }
  gagnerXP((XP_MONSTRE[e.k] || 1) * bonusElite * (1 + 0.1 * relique('pacte')));
  eclabousser(e.x, e.y, 6 + Math.round(e.r / 2), 170 * (0.7 + e.r / 30), 1.6 + e.r / 7);
  eclabousser(e.x, e.y, 8 + Math.round(e.r / 2), 320 * (0.7 + e.r / 30), 0.9);
  if (e.k === 'chef') banniere('Le chef de guerre est tombé !', ENCRE);
}

// ---------------------------------------------------------------------
//  Mise à jour
// ---------------------------------------------------------------------
function mettreAJour(dt) {
  if (!G.histoMur) G.histoMur = [];
  if (G.t >= G.histoMur.length * 5) G.histoMur.push(clamp(G.mur.pv / G.mur.max, 0, 1));
  if (G.effondrement) { majEffondrement(dt); return; } // la partie est finie : seul le pavillon tombe
  G.t += dt;

  G.or += (revenuMine() + nv('dime')) * dt;
  G.mur.pv = Math.min(G.mur.max, G.mur.pv + regenMur() * dt);

  // Sorts : recharges et effets en cours
  for (const id in G.recharges) G.recharges[id] = Math.max(0, G.recharges[id] - dt);
  G.brume = Math.max(0, G.brume - dt);
  G.rempartFlash = Math.max(0, G.rempartFlash - dt);
  if (G.pluieImpact >= 0) {
    G.pluieImpact -= dt;
    if (G.pluieImpact < 0) {
      const d = PLUIE_DEGATS * echellePV(G.t) * multDegats();
      for (const e of G.ennemis) if (!e.mort) blesser(e, d, 'sort');
    }
  }
  if (G.raz && G.raz.monte) { // vague dessinée : elle naît au pied de la muraille et remonte la vallée
    const z = G.raz; z.t += dt;
    z.y = MUR_Y - (MUR_Y - Y_HORIZON + 30) * clamp(z.t / (VAGUE.duree * VAGUE.montee), 0, 1);
    for (const e of G.ennemis) {
      if (e.mort || z.touches.has(e) || pieds(e) < z.y) continue;
      z.touches.add(e); blesser(e, RAZ_DEGATS * echellePV(G.t) * multDegats(), 'sort');
    }
    if (z.t >= VAGUE.duree) G.raz = null;
  } else if (G.raz) {
    G.raz.y += 520 * dt;
    for (const e of G.ennemis) {
      if (e.mort || G.raz.touches.has(e) || pieds(e) > G.raz.y) continue;
      G.raz.touches.add(e); blesser(e, RAZ_DEGATS * echellePV(G.t) * multDegats(), 'sort');
    }
    if (Math.random() < 0.5) tampon(rand(0, W), Math.min(G.raz.y, MUR_Y - 30) - rand(0, 40), rand(4, 10), rand(3, 7), Math.random() * 9, 0.35);
    if (G.raz.y > MUR_Y + 20) G.raz = null;
  }
  for (const g of G.pluie) {
    g.y += g.v * dt;
    if (g.y >= g.yCible) {
      tampon(g.x, g.yCible, g.r * 1.3, g.r, Math.random() * 9, 0.6);
      if (Math.random() < 0.3) eclabousser(g.x, g.yCible, 3, 90, 0.9);
      g.fini = true;
    }
  }
  G.pluie = G.pluie.filter(g => !g.fini);

  // Apparitions
  const h = etatHorde(G.t);
  if (h.horde && !G.hordeAvant) banniere(`Vague ${vague(G.t)} — la horde !`, ROUGE);
  if (!h.horde && G.hordeAvant) {
    gagnerCristaux(CRISTAUX_HORDE);
    G.textes.push({ x: W - 190, y: 172, txt: `+${CRISTAUX_HORDE} horde repoussée`, t: -0.5, cristal: true, lent: true });
  }
  G.hordeAvant = h.horde;
  const n = niveauNuit(G.t);
  if (n > 0.05 && G.nuitAvant <= 0.05 && n > G.nuitAvant) banniere('La nuit tombe… les monstres s\'enhardissent', '#2c3150');
  if (n >= 0.99) G.nuitTraversee = true;
  if (n === 0 && G.nuitAvant > 0 && G.nuitTraversee) {
    G.nuitTraversee = false;
    gagnerCristaux(NUIT_EFFETS.cristauxAube);
    banniere(`L'aube se lève : +${NUIT_EFFETS.cristauxAube} cristaux`, OR_AUBE);
    if (G.bat.sanctuaire) { G.mur.pv = Math.min(G.mur.max, G.mur.pv + G.mur.max * 0.12 * G.bat.sanctuaire); G.rempartFlash = 1; }
  }
  G.nuitAvant = n;
  G.budget += tauxMenace(G.t) * h.mult * (1 + NUIT_EFFETS.menace * n * (1 - attenuationNuit() / 2)) * dt;
  while (G.budget >= TYPES[G.prochain].cout) {
    G.budget -= TYPES[G.prochain].cout;
    apparaitre(G.prochain);
    G.prochain = choisirType(G.t);
  }
  if (G.t >= G.prochainBoss) {
    apparaitre('chef'); if (G.t >= 30 * 60) apparaitre('chef');
    G.prochainBoss += 360;
    banniere('Un chef de guerre approche…', ROUGE);
  }

  // Déplacement le long du chemin
  const md = multDegats();
  const vivants = G.ennemis.filter(e => !e.mort);
  for (const e of vivants) {
    e.flash = Math.max(0, e.flash - dt);
    e.reaction = Math.max(0, (e.reaction || 0) - dt); e.reactionCd = Math.max(0, (e.reactionCd || 0) - dt);
    e.cri = Math.max(0, (e.cri || 0) - dt);
    if (e.brule > 0) { // brûlure : dégâts continus, sans armure
      e.brule -= dt; { const v = FEU.dps * (1 + 0.35 * nv('braises')) * md * dt; compterDegats('Feu', v, e); e.pv -= v; }
      if (e.pv <= 0) { tuer(e); continue; }
    }
    if (e.poison > 0) { // poison de l'alchimiste : dégâts continus par dose, sans armure
      e.poisonT -= dt; { const v = e.poison * dpsPoison() * dt; compterDegats('Poison', v, e); e.pv -= v; }
      if (e.poisonT <= 0) e.poison = 0;
      if (e.pv <= 0) { tuer(e); continue; }
    }
    if (pieds(e) < murHaut(e.x) - ARRET_MUR) {
      const garde = G.samourais.length ? samouraiDevant(e) : null;
      if (garde) { // retenu par un samouraï : il se bat au lieu d'avancer
        e.combat = true; e.auMur = false; e.pas += dt * 3;
        garde.pv -= e.ty.dps * dt;
        if (alliance('ligne') && G.bat.fosse) { compterDegats('Fossé', saigneeFosse() * dt, e); e.pv -= saigneeFosse() * dt; if (e.pv <= 0) { tuer(e); continue; } }
        if (garde.pv <= 0) tomberSamourai(garde);
        continue;
      }
      e.combat = false;
      e.y += vitesseEcran(e) * dt;
      e.u = clamp(e.u + Math.sin(G.t * 1.5 + e.phase) * 0.05 * dt, -0.92, 0.92);
      e.x = cheminCentre(e.y) + e.u * (cheminDemi(e.y) - e.r);
      e.pas += dt * e.ty.vit / (e.taille * 0.9);
      e.auMur = false;
      e.trace -= dt;
      if (e.trace <= 0) {
        e.trace = rand(0.3, 0.7);
        tampon(e.x + rand(-e.r, e.r) * 0.4, pieds(e) - 2, 0.6 + e.r * rand(0.05, 0.1), 0.5 + e.r * rand(0.04, 0.08), Math.random() * 9, 0.25);
      }
    } else {
      e.auMur = true;
      e.sonMur = (e.sonMur || 0) - dt;
      if (e.sonMur <= 0) {
        const lourd = e.k === 'troll' || e.k === 'chef';
        e.sonMur = lourd ? rand(1.3, 1.8) : rand(0.9, 1.4);
        Bruitages.jouer(lourd ? 'murMassue' : 'murLame', e.x, lourd ? 0.9 : 0.7);
      }
      if (!e.criFait) { e.criFait = true; const pl = PLANCHES_MONSTRES[e.k]; if (pl && pl.lignes && pl.lignes.cri !== undefined) e.cri = CRI_DUREE; }
      e.pas += dt * 3;
      if (G.bat.fosse) { compterDegats('Fossé', saigneeFosse() * dt, e); e.pv -= saigneeFosse() * dt; if (e.pv <= 0) { tuer(e); continue; } }
      if (alliance('enduits') && G.bat.fosse && Math.random() < dt) empoisonner(e);
      G.mur.pv -= e.ty.dps * (1 - 0.07 * nv('herses')) * (1 - 0.05 * relique('garde')) * dt;
      if (e.k === 'troll' || e.k === 'chef') { // les gros cognent : l'écran tremble à chaque coup
        e.coupCd = (e.coupCd || 0) - dt;
        if (e.coupCd <= 0) { e.coupCd = e.k === 'chef' ? 1.1 : 1.5; secouer(e.k === 'chef' ? 5 : 3); }
      }
    }
  }
  // Séparation légère. Les monstres sont triés par hauteur : chacun ne se compare qu'à ses voisins proches
  // en y (au plus ~70 px d'écart), ce qui reste rapide même avec des centaines de monstres.
  const tries = vivants.slice().sort((a, b) => a.y - b.y);
  const rayonApp = tries.map(e => e.r * perspective(pieds(e)));
  for (let i = 0; i < tries.length; i++) {
    const a = tries[i];
    for (let j = i + 1; j < tries.length; j++) {
      const b = tries[j];
      if (b.y - a.y > 70) break;
      const dx = b.x - a.x, dy = b.y - a.y, min = (rayonApp[i] + rayonApp[j]) * 0.95;
      const d2 = dx * dx + dy * dy;
      if (d2 < min * min && d2 > 0.01) {
        const d = Math.sqrt(d2), p = (min - d) / d * 0.5;
        a.x -= dx * p; b.x += dx * p;
        if (!a.auMur) a.y -= dy * p * 0.5;
        if (!b.auMur) b.y += dy * p * 0.5;
      }
    }
  }
  for (const e of vivants) {
    const c = cheminCentre(e.y), dm = cheminDemi(e.y) - e.r;
    e.u = clamp((e.x - c) / dm, -0.95, 0.95);
    e.x = c + e.u * dm;
  }
  // Fonte des morts → flaques
  for (const e of G.ennemis) {
    if (!e.mort) continue;
    e.fonte += dt;
    if (e.fonte >= 0.55) {
      const coulures = [];
      for (let k = 0, n = 2 + Math.floor(Math.random() * 3); k < n; k++) {
        const a = Math.random() * Math.PI * 2, dist = e.r * rand(1.2, 1.9);
        coulures.push({ x: Math.cos(a) * dist, y: Math.sin(a) * dist * 0.55, rx: e.r * rand(0.2, 0.45), ry: e.r * rand(0.15, 0.3), s: Math.random() * 9 });
      }
      const pf = perspective(pieds(e));
      for (const c of coulures) { c.x *= pf; c.y *= pf; c.rx *= pf; c.ry *= pf; }
      G.flaques.push({ x: e.x, y: pieds(e) - e.r * 0.2 * pf, rx: e.r * 1.6 * pf, ry: e.r * 0.8 * pf, seed: e.seed, t: 0, coulures });
      e.retirer = true;
    }
  }
  G.ennemis = G.ennemis.filter(e => !e.retirer);

  // Archers
  const portee = porteeArcher() * (1 + NUIT_EFFETS.portee * niveauNuit(G.t) * (1 - attenuationNuit())) * (1 + 0.07 * nv('faucon'));
  const chercherCible = p => {
    let cible = null, meilleur = -Infinity;
    for (const e of vivants) {
      if (e.mort || MUR_Y - e.y > portee) continue;
      const score = e.y - Math.abs(e.x - p.x) * 0.35;
      if (score > meilleur) { meilleur = score; cible = e; }
    }
    return cible;
  };
  const tirer = (p, cible, seconde = false) => {
    let crit = false;
    const dx = cible.x - p.x, dy = centreY(cible) - p.y, d = Math.hypot(dx, dy) || 1, ec = seconde ? 7 : 0;
    G.fleches.push({ x: p.x + Math.sign(dx) * 10 + ec, y: p.y - 30 - ec, vx: dx / d * 700, vy: dy / d * 700, cible,
      degats: ARCHER.degats * md * (1 + 0.1 * nv('pointes')) * (archersImperiaux() ? IMPERIAL.bonus : 1) * (Math.random() < chanceCritique() ? (crit = true, multCritique()) : 1), vie: 1.2, feu: G.feu, crit });
    if (!seconde) Bruitages.jouer(G.feu ? 'flecheFeu' : 'fleche', p.x, 0.5);
  };
  G.archers.forEach((a, i) => {
    a.cd -= dt; a.tir = Math.max(0, a.tir - dt);
    const p = posteArcher(i);
    // tir en cours : la flèche part au moment où la corde est lâchée
    if (a.anim >= 0) {
      a.anim += dt;
      if (!a.tire && a.anim >= TIR_DUREE * TIR_LACHER) {
        a.tire = true; a.tir = 0.2;
        const c = a.cible && !a.cible.mort ? a.cible : chercherCible(p);
        if (c) tirer(p, c);
        if (c && Math.random() < 0.1 * nv('volee')) tirer(p, c, true); // volée double
      }
      if (a.anim >= TIR_DUREE) a.anim = -1;
      return;
    }
    const cible = chercherCible(p);
    a.attente = !cible;
    if (!cible) { if (a.cd <= 0) a.cd = 0.15; return; }
    // l'archer se tourne vers sa cible et ajuste l'inclinaison de son arc
    a.dir = cible.x >= p.x ? 1 : -1;
    const ang = Math.atan2(p.y - cible.y, Math.abs(cible.x - p.x)) * 180 / Math.PI;
    a.vise = clamp(Math.round((ang - 35) / 55 * 7), 0, 7);
    if (a.cd > 0) return;
    a.cd = rechargeArcher() * rand(0.9, 1.1);
    a.anim = 0; a.tire = false; a.cible = cible;
  });

  for (const f of G.fleches) {
    f.vie -= dt;
    if (f.cible && !f.cible.mort) {
      const dx = f.cible.x - f.x, dy = centreY(f.cible) - f.y, d = Math.hypot(dx, dy) || 1;
      f.vx = dx / d * 700; f.vy = dy / d * 700;
      if (d < f.cible.r + 4) {
        if (f.feu) f.cible.brule = FEU.duree * (1 + 0.35 * nv('braises'));
        if (G.bat.alchimiste) { f.cible.poison = Math.min(dosesPoison(), (f.cible.poison || 0) + 1); f.cible.poisonT = 4; }
        if (f.crit && !f.cible.mort) G.textes.push({ x: f.cible.x + 4, y: f.cible.y - f.cible.taille - 8, txt: Math.round(f.degats) + ' !', t: 0, critique: true });
        blesser(f.cible, f.degats, 'fleche'); f.vie = 0;
        // ricochet : la flèche rebondit vers le monstre le plus proche (une seule fois)
        if (!f.ricochet && Math.random() < 0.17 * nv('ricochet')) {
          let proche = null, dmin = 140;
          for (const o of G.ennemis) { if (o.mort || o === f.cible) continue; const dd = Math.hypot(o.x - f.x, o.y - f.y); if (dd < dmin) { dmin = dd; proche = o; } }
          if (proche) {
            const rx = proche.x - f.x, ry = centreY(proche) - f.y, rd = Math.hypot(rx, ry) || 1;
            G.fleches.push({ x: f.x, y: f.y, vx: rx / rd * 700, vy: ry / rd * 700, cible: proche, degats: f.degats * 0.7, vie: 0.6, feu: f.feu, ricochet: true });
          }
        }
      }
    }
    f.x += f.vx * dt; f.y += f.vy * dt;
    if (f.y < -20) f.vie = 0;
  }
  G.fleches = G.fleches.filter(f => f.vie > 0);

  // Catapultes
  G.catas.forEach((c, ic) => {
    c.cd -= dt; c.bras = Math.max(0, c.bras - dt * 1.5);
    if (c.anim >= 0) {
      c.anim += dt;
      if (c.tir && c.anim * PLANCHE_CATA.ips >= PLANCHE_CATA.lacher) {
        const d = plancheCata ? departBoulet(ic) : { x: c.x, y: c.y - 24 };
        G.rochers.push({ x0: d.x, y0: d.y, ...c.tir, t: 0 }); c.tir = null; c.bras = 1;
      }
      if (c.anim * PLANCHE_CATA.ips >= 8) c.anim = -1;
    }
    if (c.cd > 0) return;
    let cible = null, meilleur = -1;
    const echant = vivants.length > 50 ? vivants.filter(() => Math.random() < 50 / vivants.length) : vivants;
    for (const e of echant) {
      if (e.mort) continue;
      let n = 0;
      const zone = zoneCata() * perspective(pieds(e)); // la zone d'impact rétrécit au loin, comme les monstres
      for (const o of vivants) if (Math.hypot(o.x - e.x, o.y - e.y) < zone) n += o.r;
      n += e.y * 0.02;
      if (n > meilleur) { meilleur = n; cible = e; }
    }
    if (!cible) { c.cd = 0.3; return; }
    c.cd = rechargeCata() * rand(0.9, 1.1);
    // la visée tient compte du temps de lever du bras avant le lâcher
    const avance = CATAPULTE.vol + PLANCHE_CATA.lacher / PLANCHE_CATA.ips;
    const ty = cible.auMur ? cible.y : Math.min(cible.y + vitesseEcran(cible) * avance, murHaut(cible.x) - cible.taille * 1.1 - ARRET_MUR);
    c.anim = 0; c.tir = { x1: cible.x, y1: ty, degats: CATAPULTE.degats * md * (1 + 0.17 * nv('mortiers')) * (1 + 0.15 * prestige('atelier')) };
  });
  for (const r of G.rochers) {
    r.t += dt / CATAPULTE.vol;
    if (r.t >= 1 && !r.fini) {
      r.fini = true;
      const pz = perspective(r.y1 + 12), zone = zoneCata() * pz;
      for (const e of vivants) if (Math.hypot(e.x - r.x1, e.y - r.y1) < zone + e.r * 0.5 * pz) {
        blesser(e, r.degats, 'roc', r.poudre ? 'Poudrerie' : 'Catapultes');
        if (!r.poudre && alliance('ardents') && !e.mort) e.brule = Math.max(e.brule || 0, FEU.duree);
      }
      G.ondes.push({ x: r.x1, y: r.y1, t: 0, zone });
      if (r.poudre) G.brasiers.push({ x: r.x1, y: r.y1, zone, t: r.poudre.duree, duree: r.poudre.duree, dps: r.poudre.dps, seed: Math.random() * 9 });
      tampon(r.x1, r.y1, 24 * pz, 15 * pz, Math.random() * 50, 0.12, '#5a4630', 0, 0.35);
      eclabousser(r.x1, r.y1, 10, 220, 1.1);
    }
  }
  G.rochers = G.rochers.filter(r => !r.fini);
  majUnitesPlateau(dt, vivants);

  // Effets
  for (const g of G.gouttes) {
    g.t += dt; const fr = Math.exp(-7 * dt);
    g.vx *= fr; g.vy *= fr; g.x += g.vx * dt; g.y += g.vy * dt;
    if (g.t >= g.vie) {
      if (g.y < murHaut(g.x) - 8) {
        const etire = 1 + g.v0 / 140;
        tampon(g.x, g.y, g.r * etire, g.r * 0.75, g.x, 0.8, ENCRE, Math.atan2(g.vy, g.vx), 0.15);
        if (Math.random() < 0.35) tampon(g.x + g.vx * 0.06, g.y + g.vy * 0.06, g.r * 0.35, g.r * 0.35, 1, 0.8);
      }
      g.retirer = true;
    }
  }
  G.gouttes = G.gouttes.filter(g => !g.retirer);
  for (const f of G.flaques) {
    f.t += dt;
    if (f.t >= 0.9) { dessinerFlaque(tctx, f, 1, 0); f.retirer = true; }
  }
  G.flaques = G.flaques.filter(f => !f.retirer);
  majTextesEncre(dt);
  for (const tx of G.textes) tx.t += dt * (tx.lent ? 0.4 : 1);
  G.textes = G.textes.filter(tx => tx.t < 1);
  for (const o of G.ondes) o.t += dt;
  G.ondes = G.ondes.filter(o => o.t < 0.4);
  if (G.banniere) { G.banniere.t += dt; if (G.banniere.t > 2.5) G.banniere = null; }

  majCorbeaux(dt);

  // L'encre sèche et pâlit lentement
  minuteurEstompe += dt;
  if (minuteurEstompe > 0.5) {
    minuteurEstompe = 0;
    tctx.globalCompositeOperation = 'destination-out';
    tctx.fillStyle = 'rgba(0,0,0,0.025)'; tctx.fillRect(0, 0, W, CHAMP_H);
    tctx.globalCompositeOperation = 'source-over';
  }

  if (G.mur.pv <= 0) {
    G.mur.pv = 0; G.effondrement = { t: 0, nuages: [] }; G.choix = null; Musique.arreter(2); // l'écran de fin vient après la chute du pavillon
    Bruitages.jouer('murMassue', W / 2, 1);
    if (G.defi) finDefi();
    if (!G.defi && G.t > record) { record = G.t; G.nouveauRecord = true; try { localStorage.setItem('muraille-record', String(record)); } catch (e) { /* ignoré */ } }
    G.sceauxGagnes = Math.floor(G.t / 60) + (G.nouveauRecord ? 5 : 0); sceaux += G.sceauxGagnes; sauverHeritage();
    G.piecesGagnees = piecesDePartie(G.t, G.kills); pieces += G.piecesGagnees; sauverPieces();
    profil.meilleur = Math.max(profil.meilleur || 0, G.t); sauverProfil(); verifierSucces(); sauverSucces();
    setTimeout(() => sauverEnLigne(true), 1500); // après l'inscription du score
    G.avatarsNouveaux = AVATARS.filter(a => avatarDebloque(a) && G.avatarsAvant && !G.avatarsAvant.has(a.id)).map(a => a.nom);
    // le score est inscrit tout seul au classement, sous le pseudo du profil (parties d'au moins 10 s)
    if (profil.pseudo && G.t >= 10) {
      G.inscription = 'en cours';
      const partie = G;
      inscrireScore(profil.pseudo).then(ok => { partie.inscription = ok ? 'en ligne' : 'local'; }, () => { partie.inscription = 'local'; });
    }
  }
}

// =====================================================================
//  INTERFACE : zones cliquables
// =====================================================================
const dedans = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
const ENGRENAGE = { x: W - 34, y: 34, r: 25 };
// Vitesse de jeu : bouton rond sous l'engrenage, touche V, ou menu pause
const VITESSES = [1, 2, 3];
const BTN_VIT = { x: W - 30, y: 96, r: 19 };
function vitesseSuivante() { G.vitesse = VITESSES[(VITESSES.indexOf(G.vitesse) + 1) % VITESSES.length]; }
const libVitesse = () => '×' + String(G.vitesse).replace('.', ',');
const BTN_REPRENDRE = { x: W / 2 - 110, y: 400, w: 220, h: 46 };
const BTN_VITESSE = { x: W / 2 - 110, y: 458, w: 220, h: 46 };
const BTN_RECOMMENCER = { x: W / 2 - 110, y: 516, w: 220, h: 46 };
const BTN_MUSIQUE = { x: W / 2 - 110, y: 574, w: 220, h: 46 };
const BTN_VOL_MOINS = { x: BTN_MUSIQUE.x, y: BTN_MUSIQUE.y, w: 46, h: 46 };
const BTN_VOL_PLUS = { x: BTN_MUSIQUE.x + BTN_MUSIQUE.w - 46, y: BTN_MUSIQUE.y, w: 46, h: 46 };
const BTN_VOL_LIBELLE = { x: BTN_MUSIQUE.x + 52, y: BTN_MUSIQUE.y, w: BTN_MUSIQUE.w - 104, h: 46 };
const BTN_SFX_MOINS = { x: BTN_MUSIQUE.x, y: BTN_MUSIQUE.y + 58, w: 46, h: 46 };
const BTN_SFX_PLUS = { x: BTN_MUSIQUE.x + BTN_MUSIQUE.w - 46, y: BTN_MUSIQUE.y + 58, w: 46, h: 46 };
const BTN_SFX_LIBELLE = { x: BTN_MUSIQUE.x + 52, y: BTN_MUSIQUE.y + 58, w: BTN_MUSIQUE.w - 104, h: 46 };
// médaillon « ? » du menu pause : ouvre la fiche des commandes
// ---------------------------------------------------------------------
//  Menu Options (accueil et pause) : Audio (musique, bruitages) et Commandes (la fiche), avec un bouton Retour.
//  sousMenu : null (menu principal) | 'options' | 'audio' | 'commandes' (la fiche, par-dessus les options)
// ---------------------------------------------------------------------
let sousMenu = null;
const BTN_MENU = i => ({ x: W / 2 - 110, y: 400 + i * 58, w: 220, h: 46 });
// les réglages du son (musique, bruitages) se placent sur deux lignes à partir de y
function placerReglagesSon(y) {
  BTN_MUSIQUE.y = BTN_VOL_MOINS.y = BTN_VOL_PLUS.y = BTN_VOL_LIBELLE.y = y;
  BTN_SFX_MOINS.y = BTN_SFX_PLUS.y = BTN_SFX_LIBELLE.y = y + 58;
}
function boutonMenu(r, lib, couleur = 'encre') {
  const survol = dedans(souris, r);
  ctx.drawImage(couleur === 'rouge' ? boutonRouge(r.w, r.h) : boutonEncre(r.w, r.h, true), r.x - 6, r.y - 4 - (survol ? 1 : 0));
  texte(lib, r.x + r.w / 2, r.y + r.h / 2 - (survol ? 1 : 0), couleur === 'rouge' ? 21 : 18, PAPIER, 'center', 'bold');
}
const titreSousMenu = () => sousMenu === 'audio' ? 'Audio' : sousMenu ? 'Options' : null;
// dessine le sous-menu ouvert (renvoie false au menu principal)
function dessinerSousMenu() {
  if (!sousMenu) return false;
  if (sousMenu === 'audio') {
    placerReglagesSon(BTN_MENU(0).y); dessinerReglageMusique(); dessinerReglageBruitages();
    boutonMenu(BTN_MENU(2), 'Retour');
  } else {
    boutonMenu(BTN_MENU(0), 'Audio'); boutonMenu(BTN_MENU(1), 'Commandes');
    boutonMenu(BTN_MENU(2), !tutoFini && tutoVus.size === 0 ? 'Tutoriel activé ✓' : 'Revoir le tutoriel'); boutonMenu(BTN_MENU(3), 'Retour');
    if (sousMenu === 'commandes') dessinerAide();
  }
  return true;
}
// clic dans un sous-menu (renvoie false au menu principal)
function clicSousMenu(p) {
  if (!sousMenu) return false;
  if (sousMenu === 'commandes') { sousMenu = 'options'; return true; }
  if (sousMenu === 'options') {
    if (dedans(p, BTN_MENU(0))) sousMenu = 'audio';
    else if (dedans(p, BTN_MENU(1))) sousMenu = 'commandes';
    else if (dedans(p, BTN_MENU(2))) revoirTuto();
    else if (dedans(p, BTN_MENU(3))) sousMenu = null;
    return true;
  }
  placerReglagesSon(BTN_MENU(0).y);
  if (dedans(p, BTN_VOL_MOINS)) Musique.changerVolume(-0.1);
  else if (dedans(p, BTN_VOL_PLUS)) Musique.changerVolume(0.1);
  else if (dedans(p, BTN_VOL_LIBELLE)) Musique.basculer();
  else if (dedans(p, BTN_SFX_MOINS)) { Bruitages.initialiser(); Bruitages.changerVolume(-0.1); Bruitages.jouer('fleche'); }
  else if (dedans(p, BTN_SFX_PLUS)) { Bruitages.initialiser(); Bruitages.changerVolume(0.1); Bruitages.jouer('fleche'); }
  else if (dedans(p, BTN_SFX_LIBELLE)) Bruitages.basculer();
  else if (dedans(p, BTN_MENU(2))) sousMenu = 'options';
  return true;
}
// Échap : remonte d'un niveau (renvoie false s'il n'y avait pas de sous-menu)
function retourSousMenu() {
  if (!sousMenu) return false;
  sousMenu = sousMenu === 'options' ? null : 'options';
  return true;
}
const RECT_AIDE = { x: 50, y: 150, w: W - 100, h: 680 };
// médaillons ampoule (proposer une idée) et insecte (signaler un bug) : dans le menu pause et en fin de partie
const BTN_IDEE = { x: W / 2 - 100, y: 735, r: 28 }, BTN_BUG = { x: W / 2 + 100, y: 735, r: 28 };
const BTN_IDEE_FIN = { x: W / 2 - 110, y: 665, r: 28 }, BTN_BUG_FIN = { x: W / 2 + 110, y: 665, r: 28 };
// médaillon trophée : classement des joueurs (écran titre et fin de partie)
const BTN_CLASSEMENT_FIN = { x: W / 2, y: 665, r: 28 }, BTN_CLASSEMENT_TITRE = { x: W - 54, y: 58, r: 28 };
const surMedaillon = (p, b) => Math.hypot(p.x - b.x, p.y - b.y) < b.r + 6;

// ---------------------------------------------------------------------
//  Musique de combat (musique/combat.js, synthétisée) : démarre avec la partie, se met en pause avec le jeu,
//  s'éteint en fondu à la défaite. Touche M ou bouton du menu pause pour couper ; le choix est mémorisé.
// ---------------------------------------------------------------------
const MUSIQUE_VOLUME = 0.5; // volume par défaut (le joueur le règle : menu pause, touches + et −)
const Musique = {
  ctx: null, gain: null, partition: null, minuterie: null, prochain: 0, mesure: 0, pas: 0,
  coupee: (() => { try { return localStorage.getItem('muraille-musique') === 'coupee'; } catch (e) { return false; } })(),
  volume: (() => { try { const v = parseFloat(localStorage.getItem('muraille-musique-volume')); return Number.isFinite(v) ? clamp(v, 0, 1) : MUSIQUE_VOLUME; } catch (e) { return MUSIQUE_VOLUME; } })(),
  changement: 0, // instant du dernier réglage (pour afficher le niveau un court moment)
  enSourdine: false,
  // volume effectif : coupé → 0 ; dans le menu pause, la musique continue en sourdine (on entend les réglages)
  niveau() { return this.coupee ? 0 : this.volume * (this.enSourdine ? 0.55 : 1); },
  appliquer() { if (this.gain) this.gain.gain.setTargetAtTime(this.niveau(), this.ctx.currentTime, 0.08); },
  memoriser() {
    try { localStorage.setItem('muraille-musique', this.coupee ? 'coupee' : 'active'); localStorage.setItem('muraille-musique-volume', String(this.volume)); } catch (e) { /* ignoré */ }
  },
  changerVolume(delta) {
    this.volume = clamp(Math.round((this.volume + delta) * 10) / 10, 0, 1);
    this.coupee = this.volume === 0;
    this.changement = performance.now(); this.memoriser(); this.appliquer();
  },
  demarrer() {
    if (!window.MusiqueCombat) return; // fichier absent : le jeu reste muet
    this.arreter(0);
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    this.gain = this.ctx.createGain(); this.gain.gain.value = this.niveau(); this.gain.connect(this.ctx.destination);
    this.partition = MusiqueCombat.creer(this.ctx, this.gain);
    this.mesure = 0; this.pas = 0; this.prochain = this.ctx.currentTime + 0.1;
    this.minuterie = setInterval(() => this.tic(), 25);
  },
  tic() {
    const c = this.ctx; if (!c) return;
    // pause automatique (fenêtre quittée) : le son se fige ; menu pause : il continue en sourdine
    const enPause = ecran === 'jeu' && G && G.pause, absent = enPause && G.pauseAuto;
    if (absent && c.state === 'running') c.suspend();
    if (!absent && c.state === 'suspended' && ecran === 'jeu') c.resume();
    if (enPause !== this.enSourdine) { this.enSourdine = enPause; this.appliquer(); }
    if (c.state !== 'running') return;
    if (this.prochain < c.currentTime) this.prochain = c.currentTime + 0.05; // rattrapage après une longue absence
    while (this.prochain < c.currentTime + 0.15) {
      this.partition.programmerPas(this.mesure, this.pas, this.prochain);
      this.prochain += MusiqueCombat.DUREE_PAS;
      if (++this.pas === MusiqueCombat.PAS_PAR_MESURE) { this.pas = 0; if (++this.mesure === MusiqueCombat.MESURES) this.mesure = MusiqueCombat.BOUCLE_DEBUT; }
    }
  },
  arreter(fondu = 0) {
    const c = this.ctx, g = this.gain, m = this.minuterie;
    this.ctx = null; this.gain = null; this.minuterie = null;
    if (!c) return;
    if (fondu > 0 && c.state === 'running') {
      g.gain.setTargetAtTime(0, c.currentTime, fondu / 4);
      setTimeout(() => { clearInterval(m); c.close(); }, fondu * 1000);
    } else { clearInterval(m); c.close(); }
  },
  basculer() { // couper / remettre, en gardant le volume choisi
    this.coupee = !this.coupee;
    if (!this.coupee && this.volume === 0) this.volume = MUSIQUE_VOLUME;
    this.changement = performance.now(); this.memoriser(); this.appliquer();
  },
};
// ---------------------------------------------------------------------
//  Bruitages (musique/effets.js, synthétisés) : tirs de flèches (placés en stéréo selon l'archer), flèches de feu,
//  coups des monstres sur la muraille. Volume séparé de la musique (menu pause), mémorisé.
//  Un même son ne peut pas se répéter plus vite que « intervalle » secondes : 26 archers en ×3 restent écoutables.
// ---------------------------------------------------------------------
const BRUITAGES_VOLUME = 0.6;
const INTERVALLES_SONS = { fleche: 0.1, flecheFeu: 0.12, murLame: 0.12, murMassue: 0.25 }; // au plus ~10 tirs entendus par seconde
const Bruitages = {
  ctx: null, gain: null, derniers: {},
  coupes: (() => { try { return localStorage.getItem('muraille-bruitages') === 'coupes'; } catch (e) { return false; } })(),
  volume: (() => { try { const v = parseFloat(localStorage.getItem('muraille-bruitages-volume')); return Number.isFinite(v) ? clamp(v, 0, 1) : BRUITAGES_VOLUME; } catch (e) { return BRUITAGES_VOLUME; } })(),
  initialiser() { // au premier clic de partie (le navigateur exige un geste avant de jouer du son)
    if (!window.Effets) return;
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
      const comp = this.ctx.createDynamicsCompressor(); comp.threshold.value = -12; comp.ratio.value = 3; comp.connect(this.ctx.destination);
      this.gain = this.ctx.createGain(); this.gain.gain.value = this.niveau(); this.gain.connect(comp);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  },
  niveau() { return this.coupes ? 0 : this.volume; },
  appliquer() { if (this.gain) this.gain.gain.setTargetAtTime(this.niveau(), this.ctx.currentTime, 0.05); },
  memoriser() {
    try { localStorage.setItem('muraille-bruitages', this.coupes ? 'coupes' : 'actifs'); localStorage.setItem('muraille-bruitages-volume', String(this.volume)); } catch (e) { /* ignoré */ }
  },
  changerVolume(delta) {
    this.volume = clamp(Math.round((this.volume + delta) * 10) / 10, 0, 1);
    this.coupes = this.volume === 0; this.memoriser(); this.appliquer();
  },
  basculer() { this.coupes = !this.coupes; if (!this.coupes && this.volume === 0) this.volume = BRUITAGES_VOLUME; this.memoriser(); this.appliquer(); },
  jouer(nom, x = W / 2, vol = 1) {
    const c = this.ctx;
    if (!c || this.coupes || c.state !== 'running' || !window.Effets) return;
    const maintenant = c.currentTime;
    if (maintenant - (this.derniers[nom] || -1) < (INTERVALLES_SONS[nom] || 0.05)) return;
    this.derniers[nom] = maintenant;
    let sortie = this.gain;
    if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = clamp(x / W * 2 - 1, -1, 1) * 0.6; p.connect(this.gain); sortie = p; }
    Effets[nom](c, sortie, maintenant + 0.005, vol);
  },
};

function lancerPartie() {
  nouvellePartie(); ecran = 'jeu'; Musique.demarrer(); Bruitages.initialiser();
  profil.parties++; sauverProfil(); G.avatarsAvant = new Set(AVATARS.filter(avatarDebloque).map(a => a.id));
  const al = ALLIANCES.filter(a => G.alliances.has(a.id));
  if (al.length === 1) banniere(`Alliance : ${al[0].nom}`, ROUGE);
  else if (al.length > 1) banniere(`${al.length} alliances actives`, ROUGE);
}
// Pause : bouton rond en haut à droite, Espace / P / Échap, et automatique quand la fenêtre perd le focus.
function basculerPause(etat = !G.pause) {
  sousMenu = null;
  if (ecran !== 'jeu' || G.effondrement) return;
  G.pause = etat; G.pauseAuto = false; G.confirmerRecommencer = 0;
}
function pauseAutomatique() {
  if (ecran === 'jeu' && G && !G.pause) { G.pause = true; G.pauseAuto = true; G.confirmerRecommencer = 0; }
}
addEventListener('blur', pauseAutomatique);
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseAutomatique(); });
function dessinerBoutonPause() {
  if (decalCourant) { const d = decalCourant, sv = souris; ctx.save(); ctx.translate(0, -d); decalCourant = 0; souris = { x: sv.x, y: sv.y + d };
    try { dessinerBoutonPause(); } finally { ctx.restore(); decalCourant = d; souris = sv; } return; }
  const b = ENGRENAGE, survol = Math.hypot(souris.x - b.x, souris.y - b.y) < b.r;
  ctx.fillStyle = G.pause ? ROUGE : ENCRE;
  ctx.beginPath(); ctx.arc(b.x, b.y - (survol ? 1 : 0), b.r, 0, 7); ctx.fill();
  ctx.fillStyle = PAPIER;
  if (G.pause) { // ▶ reprendre
    ctx.beginPath(); ctx.moveTo(b.x - 6, b.y - 10); ctx.lineTo(b.x + 10, b.y); ctx.lineTo(b.x - 6, b.y + 10); ctx.closePath(); ctx.fill();
  } else {       // ❚❚ pause
    ctx.fillRect(b.x - 8, b.y - 10, 5.5, 20); ctx.fillRect(b.x + 2.5, b.y - 10, 5.5, 20);
  }
  if (survol && !G.pause) texte('Pause (Espace)', W - 18, 150, 12, ENCRE, 'right', 'italic bold', SERIF);
}

// au doigt (téléphone, tablette) : panneau plus large, boutons plus hauts, texte plus grand
const PB = TACTILE ? { w: 452, h: 202, bouton: 46, l1: 82, l2: 140, police: 17 } : { w: 372, h: 166, bouton: 34, l1: 76, l2: 120, police: 14 };
const PANNEAU_W = PB.w, PANNEAU_H = PB.h;
function panneauRect(i) {
  const c = rectCarte(i);
  return { x: clamp(c.x + c.w / 2 - PANNEAU_W / 2, 10, W - 10 - PANNEAU_W), y: CARTE_Y - PANNEAU_H - 14, w: PANNEAU_W, h: PANNEAU_H };
}
function boutonsPanneau(i) {
  const b = BATIMENTS[i], l = G.bat[b.id], pr = panneauRect(i), act = ACTION_DE[b.id] && ACTIONS[ACTION_DE[b.id]];
  const max = l >= b.max, cout = max ? 0 : b.cout(l);
  const w = act ? Math.round((PANNEAU_W - 40) * 0.47) : PANNEAU_W - 28;
  const pres = max && PRESTIGE[b.id];
  const res = [pres ? {
    r: { x: pr.x + 14, y: pr.y + PB.l1, w, h: PB.bouton },
    libelle: `Prestige ★${prestige(b.id) + 1}`, cout: prestigeCout(b.id), ok: G.or >= prestigeCout(b.id),
    faire: () => acheterPrestige(b.id),
  } : {
    r: { x: pr.x + 14, y: pr.y + PB.l1, w, h: PB.bouton },
    libelle: max ? 'Niveau max' : (l === 0 ? 'Bâtir' : 'Améliorer'),
    cout: max ? null : cout, ok: !max && G.or >= cout,
    faire: () => ameliorer(i),
  }];
  if (act) {
    const dispo = act.dispo();
    res.push({
      r: { x: pr.x + 14 + w + 12, y: pr.y + PB.l1, w: PANNEAU_W - 40 - w, h: PB.bouton },
      libelle: dispo ? act.libelle() : act.court(),
      cout: dispo ? act.cout() : null, ok: dispo && G.or >= act.cout(),
      faire: () => agir(act),
    });
  }
  // talent (cristaux), sur une seconde ligne
  const ta = TALENTS[b.id], acquis = G.talents[b.id];
  res.push({
    r: { x: pr.x + 14, y: pr.y + PB.l2, w: PANNEAU_W - 28, h: PB.bouton },
    libelle: acquis ? `✦ ${ta.nom} — acquis` : (l === 0 ? `✦ ${ta.nom} — bâtir d'abord` : `✦ ${ta.nom}`),
    cout: acquis || l === 0 ? null : ta.cout, cristal: true, talent: true,
    ok: talentPossible(b.id),
    faire: () => acheterTalent(b.id),
  });
  return res;
}
function ameliorer(i) {
  const b = BATIMENTS[i], l = G.bat[b.id];
  if (l >= b.max || G.or < b.cout(l)) return false;
  G.or -= b.cout(l); G.bat[b.id]++;
  if (b.id === 'macon') { G.mur.max += 250; G.mur.pv += 250; }
  if (b.id === 'atelier' && l === 0) banniere('Atelier de siège construit');
  if (b.id === 'balistes' && l === 0) banniere('Tour à balistes construite');
  if (b.id === 'dojo' && l === 0) banniere('Les samouraïs rejoignent la muraille');
  if (b.id === 'fauconnerie' && l === 0) banniere('Les faucons prennent leur envol');
  if (b.id === 'poudrerie' && l === 0) banniere('La poudrerie est prête');
  if (b.id === 'pagode' && l === 0) banniere("Le dragon d'encre s'éveille", ROUGE);
  if (b.id === 'temple' && l === 0) banniere('Le gong du temple résonne');
  if (b.id === 'temple' && G.bat.temple >= b.max) banniere('Archers impériaux : flèches +50 %', ROUGE);
  if (b.id === 'alchimiste' && l === 0) banniere('Flèches empoisonnées');
  if (b.id === 'fosse') { G.mur.max += 100; G.mur.pv += 100; }
  if (b.id === 'sanctuaire') { G.mur.max += 150; G.mur.pv += 150; if (l === 0) banniere('Les lanternes sont allumées'); }
  return true;
}
function agir(a) {
  if (!a.dispo() || G.or < a.cout()) return false;
  G.or -= a.cout(); a.faire(); return true;
}
function gagnerCristaux(n) { G.cristaux += n; G.cristauxGagnes += n; }

function talentPossible(id) { return !G.talents[id] && G.bat[id] > 0 && G.cristaux >= TALENTS[id].cout; }
function acheterTalent(id) {
  if (!talentPossible(id)) return false;
  G.cristaux -= TALENTS[id].cout; G.talents[id] = true;
  if (id === 'macon') { G.mur.max += 300; G.mur.pv += 300; }
  banniere(TALENTS[id].nom);
  return true;
}

function sortPret(s) { return (G.recharges[s.id] || 0) <= 0 && G.cristaux >= s.cout; }
function lancerSort(s) {
  if (!sortPret(s)) return false;
  compterSucces('sorts'); if (s.id === 'raz') compterSucces('raz');
  G.cristaux -= s.cout; G.recharges[s.id] = s.recharge * (1 - 0.15 * nv('grimoire')) * (1 - 0.05 * relique('sablier'));
  if (s.id === 'pluie') {
    G.pluieImpact = 0.7;
    for (let i = 0; i < 160; i++) {
      const yCible = rand(60, MUR_Y - 30);
      G.pluie.push({ x: rand(0, W), y: yCible - rand(500, 900), yCible, v: rand(900, 1300), r: rand(1.5, 3.5) });
    }
    for (const e of G.ennemis) if (!e.mort) G.pluie.push({ x: e.x + rand(-4, 4), y: e.y - rand(600, 800), yCible: e.y, v: 1000, r: 3 });
  } else if (s.id === 'brume') {
    G.brume = BRUME_DUREE;
  } else if (s.id === 'raz') {
    G.raz = imagesVague ? { t: 0, y: MUR_Y, monte: true, touches: new Set() } : { y: Y_HORIZON - 60, touches: new Set() }; secouer(4);
  } else if (s.id === 'rempart') {
    const soin = Math.round(G.mur.max * 0.4);
    G.mur.pv = Math.min(G.mur.max, G.mur.pv + soin); G.rempartFlash = 0.8;
    G.textes.push({ x: W / 2 - 20, y: MUR_Y + 10, txt: `+${soin} PV`, t: 0, lent: true });
  }
  return true;
}

// Boutons ronds des sorts, sous la traînée des ressources
const rectSort = i => ({ x: W - 266 + i * 58, y: 96, r: 23 });

let refusAnim = null;
function refus(r) { refusAnim = { r, t: 0 }; }

function clic(p) {
  // écrans dessinés dans le cadre centré : le clic est ramené dans ce cadre (le bouton pause du jeu reste en haut)
  if (DC && (ecran === 'titre' || ecran === 'accueil' || ecran === 'preparation' || ecran === 'fin')) p = { x: p.x, y: p.y - DC };
  if (ecran === 'fin' && heritageOuvert) { clicHeritage(p); return; }
  if (ecran === 'fin' && surMedaillon(p, BTN_IDEE_FIN)) { ouvrirRetour('idee'); return; }
  if (ecran === 'fin' && surMedaillon(p, BTN_CLASSEMENT_FIN)) { ouvrirClassement(true); return; }
  if (ecran === 'titre' && surMedaillon(p, BTN_CLASSEMENT_TITRE)) { ouvrirClassement(false); return; }
  if (ecran === 'fin' && surMedaillon(p, BTN_BUG_FIN)) { ouvrirRetour('bug'); return; }
  if (ecran === 'accueil') { clicAccueil(p); return; }
  if (ecran === 'titre') { ecran = 'accueil'; sousMenu = null; return; }
  if (ecran === 'fin') { ecran = 'preparation'; return; }
  if (ecran === 'preparation') { clicPreparation(p); return; }
  if (G && G.effondrement) return; // le pavillon s'effondre : plus aucune action
  if (Math.hypot(p.x - ENGRENAGE.x, p.y - ENGRENAGE.y) < ENGRENAGE.r) { basculerPause(); return; }
  if (tutoActif && !G.pause) { clicTuto(p); return; }
  if (DC && (G.pause || G.choixNiveau || G.reliquesOuvert)) p = { x: p.x, y: p.y - DC }; // fenêtres centrées
  if (G.reliquesOuvert && !G.pause) {
    let surCarte = false;
    RELIQUES.forEach((r, i) => { const rr = rectRelique(i); if (dedans(p, rr)) { surCarte = true; if (!acheterRelique(r)) refus(rr); } });
    if (!surCarte) G.reliquesOuvert = false; // clic ailleurs (ou sur « Fermer ») : on referme
    return;
  }
  if (G.choixNiveau && !G.pause) {
    const cartes = G.choixNiveau.cartes;
    if (performance.now() - G.choixNiveau.ouvert < 350) return; // évite un choix involontaire au moment où l'écran s'ouvre
    cartes.forEach((a, i) => { if (dedans(p, rectCarteNiveau(i, cartes.length))) choisirAmelioration(a); });
    return;
  }
  if (G.pause) {
    if (clicSousMenu(p)) return;
    if (surMedaillon(p, BTN_IDEE)) { ouvrirRetour('idee'); return; }
    if (surMedaillon(p, BTN_BUG)) { ouvrirRetour('bug'); return; }
    if (dedans(p, BTN_REPRENDRE)) basculerPause(false);
    else if (dedans(p, BTN_VITESSE)) vitesseSuivante();
    else if (dedans(p, BTN_MENU(3))) sousMenu = 'options';
    else if (dedans(p, BTN_RECOMMENCER)) {
      // deux clics : le premier demande confirmation (3 s)
      if (performance.now() < G.confirmerRecommencer) { lancerPartie(); }
      else G.confirmerRecommencer = performance.now() + 3000;
    }
    return;
  }
  if (Math.hypot(p.x - BTN_VIT.x, p.y - BTN_VIT.y) < BTN_VIT.r + 2) { vitesseSuivante(); return; }
  if (dedans(p, ZONE_CRISTAUX)) { G.reliquesOuvert = true; G.choix = null; return; }
  for (let i = 0; i < SORTS.length; i++) {
    const s = rectSort(i);
    if (Math.hypot(p.x - s.x, p.y - s.y) < s.r + 3) { if (!lancerSort(SORTS[i])) refus({ x: s.x - s.r, y: s.y - s.r, w: s.r * 2, h: s.r * 2 }); return; }
  }
  if (G.choix !== null && dedans(p, panneauRect(G.choix))) {
    for (const b of boutonsPanneau(G.choix)) if (dedans(p, b.r) && !b.faire()) refus(b.r);
    return;
  }
  if (dedans(p, ZONE_PV)) { if (!agir(ACTIONS.reparer)) refus(ZONE_PV); return; }
  for (let i = 0; i < BATIMENTS.length; i++) {
    if (dedans(p, rectCarte(i))) { G.choix = G.choix === i ? null : i; return; }
  }
  G.choix = null;
}

function coordsSouris(ev) {
  const b = canvas.getBoundingClientRect();
  return { x: (ev.clientX - b.left) * W / b.width, y: (ev.clientY - b.top) * H / b.height };
}
canvas.addEventListener('pointermove', ev => { souris = coordsSouris(ev); });
canvas.addEventListener('pointerleave', ev => { if (ev.pointerType === 'mouse') souris = { x: -1, y: -1 }; });
// Au doigt, en jeu, sur une carte de bâtiment : un toucher bref ouvre le panneau (au relâchement) ; un appui long
// (0,45 s) montre la fiche de la carte, qui disparaît quand on relâche (sans ouvrir le panneau).
let appuiCarte = null; // { i, t, minuteur }
const carteSous = p => { if (ecran !== 'jeu' || !G || G.pause || G.choixNiveau || G.reliquesOuvert || tutoActif || G.effondrement) return -1; return BATIMENTS.findIndex((b, i) => dedans(p, rectCarte(i))); };
canvas.addEventListener('pointerdown', ev => {
  if (ev.pointerType === 'mouse' && ev.button !== 0) return;
  ev.preventDefault();
  souris = coordsSouris(ev); // au doigt, la carte touchée reste « survolée » (son aide reste affichée)
  const i = ev.pointerType !== 'mouse' ? carteSous(souris) : -1;
  if (i >= 0) { appuiCarte = { i, p: souris, minuteur: setTimeout(() => { if (appuiCarte) { G.infoCarte = appuiCarte.i; appuiCarte.long = true; } }, 450) }; return; }
  clic(souris);
});
addEventListener('pointerup', () => {
  if (!appuiCarte) return;
  clearTimeout(appuiCarte.minuteur);
  if (!appuiCarte.long) clic(appuiCarte.p);
  if (G) G.infoCarte = null;
  appuiCarte = null;
});
addEventListener('pointercancel', () => { if (appuiCarte) { clearTimeout(appuiCarte.minuteur); appuiCarte = null; if (G) G.infoCarte = null; } });
canvas.addEventListener('contextmenu', ev => ev.preventDefault()); // pas de menu sur appui long
// Sur mobile, seul le relâchement du doigt compte comme geste : c'est là qu'on réveille le son et qu'on passe en plein écran
function apresGeste(ev) {
  for (const m of [Musique, Bruitages]) {
    if (m.ctx && m.ctx.state === 'suspended' && !(ecran === 'jeu' && G && G.pause && G.pauseAuto)) m.ctx.resume();
  }
  if (ev.pointerType === 'mouse' || !TACTILE || ecran === 'titre') return;
  const el = document.documentElement;
  if (!document.fullscreenElement && el.requestFullscreen) {
    el.requestFullscreen({ navigationUI: 'hide' }).then(() => { try { screen.orientation.lock('portrait').catch(() => {}); } catch (e) { /* ignoré */ } }).catch(() => {});
  }
}
addEventListener('pointerup', apresGeste);
addEventListener('keydown', ev => {
  if (retourOuvert || classementOuvert || profilOuvert || defiOuvert) return; // on écrit (retour, pseudo) : les touches ne pilotent plus le jeu
  if (ecran === 'titre') { if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); ecran = 'accueil'; } return; }
  if (ecran === 'accueil') {
    if (heritageOuvert) { if (ev.key === 'Escape' || ev.key === 'Enter' || ev.key === ' ') fermerHeritage(); return; }
    if (ev.key === 'Escape') { if (!retourSousMenu()) ecran = 'titre'; return; }
    if (sousMenu === 'commandes' && (ev.key === ' ' || ev.key === 'Enter')) { sousMenu = 'options'; return; }
    if (!sousMenu && (ev.key === ' ' || ev.key === 'Enter')) { ev.preventDefault(); allerPreparer(); }
    else if (ev.key.toLowerCase() === 'h' || ev.key === '?') sousMenu = 'commandes';
    return;
  }
  if (ecran === 'fin' && heritageOuvert) { // Entrée = Rejouer, Échap / → = Suivant
    if (ev.key === 'Enter') rejouerDepuisHeritage(); else if (ev.key === 'Escape' || ev.key === 'ArrowRight') fermerHeritage();
    return;
  }
  if (ecran === 'fin') { if (ev.key === ' ' || ev.key === 'Enter') ecran = 'preparation'; return; }
  if (ecran === 'preparation') {
    if (selectionFamille !== null) { if (ev.key === 'Escape') selectionFamille = null; return; }
    if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); partirAuCombat(); }
    if (ev.key === 'Escape') ecran = 'accueil';
    return;
  }
  if (ecran !== 'jeu' || G.effondrement) return;
  const k = ev.key.toLowerCase();
  if (tutoActif && !G.pause) { if ((k === 'enter' || k === ' ' || k === 'escape') && performance.now() - tutoActif.t0 > 400) fermerTuto(false); ev.preventDefault(); return; }
  if (G.choixNiveau && !G.pause && k >= '1' && k <= '3') {
    const a = G.choixNiveau.cartes[+k - 1];
    if (a && performance.now() - G.choixNiveau.ouvert > 350) choisirAmelioration(a);
    return;
  }
  if (G.reliquesOuvert && !G.pause && (k === 'k' || k === 'escape')) { G.reliquesOuvert = false; return; }
  if (k === 'k' && !G.pause && !G.choixNiveau) { G.reliquesOuvert = true; G.choix = null; return; }
  if (k === ' ' || k === 'p') { basculerPause(); ev.preventDefault(); }
  if (k === 'escape') { if (G.pause && retourSousMenu()) { /* remonte d'un menu */ } else if (G.choix !== null && !G.pause) G.choix = null; else basculerPause(); }
  if ((k === 'h' || k === '?') && G.pause) sousMenu = sousMenu === 'commandes' ? 'options' : 'commandes';
  if (k === 'v') vitesseSuivante();
  if (k === 'm') Musique.basculer();
  if (k === '+' || k === '=' || ev.code === 'NumpadAdd') Musique.changerVolume(0.1);
  if (k === '-' || k === '_' || ev.code === 'NumpadSubtract') Musique.changerVolume(-0.1);
  if (G.pause) return;
  if (k >= '1' && k <= '5') { const i = +k - 1; G.choix = G.choix === i ? null : i; }
  if (k === 'a') agir(ACTIONS.archer);
  if (k === 'c') { const a = ACTIONS[ACTION_DE[BATIMENTS[3].id]]; if (a) agir(a); }
  if (k === 'r') agir(ACTIONS.reparer);
  for (const s of SORTS) if (k === s.touche.toLowerCase()) lancerSort(s);
});

// =====================================================================
//  DESSIN
// =====================================================================
// Petit écran (téléphone) : les petits textes sont un peu agrandis pour rester lisibles
let LOUPE = 1;
function majLoupe() { const b = canvas.getBoundingClientRect(); LOUPE = b.width && b.width < 520 ? 1.18 : 1; }
majLoupe(); addEventListener('resize', majLoupe);
function texte(txt, x, y, taille, couleur = ENCRE, align = 'left', style = '', police = SANS, maxW = 0) {
  if (LOUPE > 1 && taille < 15) taille = Math.min(15, taille * LOUPE);
  ctx.font = fonte(style, taille, police);
  if (maxW) while (taille > 9 && ctx.measureText(txt).width > maxW) { taille--; ctx.font = fonte(style, taille, police); }
  ctx.fillStyle = couleur; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.fillText(txt, x, y);
}
const formatTemps = t => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const nombre = n => Math.floor(n).toLocaleString('fr-FR');

function dessinerEnnemi(e) {
  const spr = SPRITES[e.k][Math.floor(e.pas) % 4];
  const u = spr.u, piedY = pieds(e);
  let x = e.x, y = e.y;
  if (e.auMur && !e.mort) y += Math.sin(G.t * 12 + e.phase) * 2;
  ctx.save();
  const ech = perspective(piedY) * (e.elite === 'colosse' ? ELITES.colosse.taille : 1);
  ctx.translate(x, piedY); ctx.scale(ech, ech); ctx.translate(-x, -piedY);
  // ombre au sol (lavis)
  ctx.fillStyle = 'rgba(40,30,28,0.16)';
  ctx.beginPath(); ctx.ellipse(x, piedY, u * 0.75, u * 0.2, 0, 0, 7); ctx.fill();

  const pl = PLANCHES_MONSTRES[e.k];
  if (pl && pl.img) {
    const L = pl.lignes || LIGNES_DEFAUT;
    if (e.mort) {
      // la planche montre l'effondrement ; on ajoute la mare d'encre qui s'étale dessous
      const f = e.fonte / 0.55;
      ctx.fillStyle = ENCRE; ctx.globalAlpha = 0.25 + 0.45 * f;
      cheminBlob(ctx, x, piedY - u * 0.1, u * (0.5 + 1.1 * f), u * (0.15 + 0.35 * f), e.seed, G.t * 2, 0.25); ctx.fill();
      ctx.globalAlpha = 1;
      imageMonstre(e, L.mort, Math.min(7, Math.floor(f * 8)));
    } else {
      if (e.elite) { ctx.shadowColor = ELITES[e.elite].couleur; ctx.shadowBlur = 7; }
      if (e.cri > 0 && L.cri !== undefined) imageMonstre(e, L.cri, Math.min(7, Math.floor((1 - e.cri / CRI_DUREE) * 8)));
      else if (e.reaction > 0) imageMonstre(e, L.touche, 1 + Math.min(2, Math.floor((1 - e.reaction / REACTION_DUREE) * 3)));
      else if (e.auMur || e.combat) imageMonstre(e, L.attaque, Math.floor(e.pas * 2.5) % 8);
      else imageMonstre(e, L.marche, Math.floor(e.pas * 1.6) % 8);
      ctx.shadowBlur = 0;
      if (e.brule > 0) flamme(x + Math.sin(e.seed) * 3, piedY - pl.hauteur * pl.echelle * 0.45, G.t + e.seed, 0.45 + 0.15 * Math.min(1, e.brule));
      if (e.poison > 0) bullesPoison(x, piedY - pl.hauteur * pl.echelle * 0.7, e);
      dessinerBarreVie(e, x, piedY - pl.hauteur * pl.echelle - 6, u);
    }
    ctx.restore(); return;
  }

  if (e.mort) {
    // Liquéfaction : la silhouette s'affaisse dans une mare d'encre et coule
    const f = e.fonte / 0.55, s = f * f * (3 - 2 * f);
    ctx.fillStyle = ENCRE;
    ctx.globalAlpha = 0.3 + 0.5 * s;
    cheminBlob(ctx, x, piedY - u * 0.1, u * (0.6 + 1.1 * s), u * (0.2 + 0.4 * s), e.seed, G.t * 2, 0.25); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.save(); ctx.translate(x, piedY); ctx.scale(1 + 0.5 * s, Math.max(0.05, 1 - 0.9 * s));
    ctx.drawImage(spr.c, -spr.a, -spr.a - u * 1.1);
    ctx.restore();
    ctx.strokeStyle = ENCRE; ctx.lineCap = 'round';
    const haut = piedY - u * 2.2 * (1 - 0.9 * s);
    for (let k = 0; k < 4; k++) {
      const hh = Math.sin(e.seed * 3.1 + k * 1.7) * 0.5 + 0.5, dx = (k - 1.5) * u * 0.45 * (1 + 0.5 * s);
      const y0 = haut + (piedY - haut) * (0.3 + 0.2 * hh), l = (0.3 + 0.7 * hh) * u * 1.2 * s;
      ctx.lineWidth = Math.max(1.2, u / 7);
      ctx.beginPath(); ctx.moveTo(x + dx, y0); ctx.lineTo(x + dx, y0 + l); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + dx, y0 + l, Math.max(1.3, u / 8), 0, 7); ctx.fill();
    }
    ctx.restore(); return;
  }

  if (e.flash > 0) ctx.globalAlpha = 0.5;
  ctx.drawImage(spr.c, x - spr.a, y - spr.a);
  ctx.globalAlpha = 1;
  if (e.k === 'chef') {
    ctx.fillStyle = '#ff4a3a'; ctx.shadowColor = '#ff2a1a'; ctx.shadowBlur = 10;
    for (const sg of [-1, 1]) { ctx.beginPath(); ctx.ellipse(x + sg * u * 0.12, y - u * 0.7, u * 0.06, u * 0.04, 0, 0, 7); ctx.fill(); }
    ctx.shadowBlur = 0;
  }
  dessinerBarreVie(e, x, y - u * (e.k === 'chef' || e.k === 'orc' ? 1.5 : 1.25) - 4, u);
  ctx.restore();
}
// barre de vie rouge au-dessus de la tête
function dessinerBarreVie(e, x, by, u) {
  const w = Math.max(16, u * 1.5), f = e.pv / e.max;
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(27,23,25,0.3)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x - w / 2, by); ctx.lineTo(x + w / 2, by); ctx.stroke();
  ctx.strokeStyle = ROUGE;
  ctx.beginPath(); ctx.moveTo(x - w / 2, by); ctx.lineTo(x - w / 2 + w * f, by); ctx.stroke();
}

// ---------------------------------------------------------------------
//  Catapulte dessinée (assets/catapulte.png) : 8 images de 250 × 360, roues en bas (pieds vers (125, 345)).
//  Image 0 = chargée, 1-3 = le bras se lève, 4 = lâcher (le boulet part), 5-7 = rechargement.
//  PLACE_CATAPULTES : 'cour' = au pied de la muraille côté village (elles tirent par-dessus le mur) ;
//  'parapet' = sur la muraille, la base cachée par le mur, seuls le bras et le fanion dépassent.
// ---------------------------------------------------------------------
const PLANCHE_CATA = { cw: 250, ch: 360, pieds: [136, 345], echelle: 0.3, ips: 14, lacher: 4, bras: [140, 105] };
let PLACE_CATAPULTES = 'cour';
const POSTES_CATAS_COUR = [72, W - 72, 132, W - 132];
let plancheCata = null;
{ const img = new Image(); img.onload = () => { plancheCata = img; }; img.src = 'assets/catapulte.png'; }
// position des roues de la catapulte n° i
function baseCatapulte(i) {
  if (PLACE_CATAPULTES === 'cour') { const x = POSTES_CATAS_COUR[i]; return { x, y: murHaut(x) + MUR_FACE + 4 }; }
  const x = POSTES_CATAS[i]; return { x, y: murHaut(x) + 22 };
}
// point de départ du boulet (bout du bras au moment du lâcher)
function departBoulet(i) {
  const b = baseCatapulte(i), P = PLANCHE_CATA;
  return { x: b.x + (P.bras[0] - P.pieds[0]) * P.echelle, y: b.y + (P.bras[1] - P.pieds[1]) * P.echelle };
}
function dessinerCatapulteSprite(c, i) {
  const P = PLANCHE_CATA, b = baseCatapulte(i), s = P.echelle;
  const col = c.anim >= 0 ? Math.min(7, Math.floor(c.anim * P.ips)) : 0;
  ctx.drawImage(plancheCata, col * P.cw, 0, P.cw, P.ch, b.x - P.pieds[0] * s, b.y - P.pieds[1] * s, P.cw * s, P.ch * s);
}
function dessinerCatapulte(c) {
  ctx.drawImage(spriteCatapulte, c.x - 30, c.y - 30);
  ctx.save(); ctx.translate(c.x - 10, c.y - 14);
  ctx.rotate(-0.3 - (1 - c.bras) * 1.0);
  ctx.strokeStyle = ENCRE; ctx.fillStyle = ENCRE; ctx.lineCap = 'round';
  ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(16, -2, 32, 0); ctx.stroke();
  cheminBlob(ctx, 32, -2, 5.5, 4.2, 2, 0, 0.15); ctx.fill();
  ctx.restore();
}

function bullesPoison(x, y, e) {
  ctx.fillStyle = 'rgba(79,107,42,0.85)';
  for (let k = 0; k < Math.min(4, 1 + e.poison); k++) {
    const ph = (G.t * 0.9 + k * 0.37 + e.seed) % 1;
    ctx.globalAlpha = 1 - ph; ctx.beginPath(); ctx.arc(x + Math.sin(k * 2.1 + e.seed) * 9, y - ph * 18, 1.8 + k % 2, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
function flamme(x, y, t, taille = 1) {
  const f = (a, b, c) => Math.sin(t * a + b) * c;
  const couches = [['rgba(192,35,43,0.9)', 1], ['rgba(232,110,40,0.95)', 0.7], ['rgba(255,214,110,0.95)', 0.38]];
  for (const [coul, k] of couches) {
    const h = (22 + f(9, x, 4)) * k * taille, w = 8 * k * taille;
    ctx.fillStyle = coul;
    ctx.beginPath(); ctx.moveTo(x - w, y);
    ctx.quadraticCurveTo(x - w * 1.1, y - h * 0.5, x + f(7, x, 3) * k, y - h);
    ctx.quadraticCurveTo(x + w * 1.1, y - h * 0.5, x + w, y);
    ctx.closePath(); ctx.fill();
  }
}
function brasero(x, y, t) {
  ctx.strokeStyle = ENCRE; ctx.lineCap = 'round'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(x - 9, y); ctx.lineTo(x, y - 22); ctx.lineTo(x + 9, y); ctx.moveTo(x, y); ctx.lineTo(x, y - 22); ctx.stroke();
  ctx.fillStyle = ENCRE; ctx.beginPath(); ctx.moveTo(x - 13, y - 30); ctx.lineTo(x + 13, y - 30); ctx.lineTo(x + 8, y - 21); ctx.lineTo(x - 8, y - 21); ctx.closePath(); ctx.fill();
  flamme(x, y - 29, t);
}
function drapeau(x, y, t) {
  ctx.strokeStyle = ENCRE; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 54); ctx.stroke();
  ctx.fillStyle = ROUGE; ctx.beginPath(); ctx.moveTo(x, y - 54);
  const sens = x < W / 2 ? 1 : -1;
  for (let i = 0; i <= 6; i++) ctx.lineTo(x + sens * i * 5, y - 54 + i * 0.9 + Math.sin(t * 5 + i * 0.9) * 2.2 * i / 6);
  for (let i = 6; i >= 0; i--) ctx.lineTo(x + sens * i * 5 * 0.9, y - 38 - i * 0.9 + Math.sin(t * 5 + i * 0.9) * 2.2 * i / 6);
  ctx.closePath(); ctx.fill();
}

function engrenage(x, y, r, coul) {
  ctx.save(); ctx.translate(x, y); ctx.fillStyle = coul;
  for (let i = 0; i < 8; i++) { ctx.rotate(Math.PI / 4); ctx.fillRect(-r * 0.22, -r * 1.25, r * 0.44, r * 0.5); }
  ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
  ctx.fillStyle = ENCRE; ctx.beginPath(); ctx.arc(0, 0, r * 0.42, 0, 7); ctx.fill();
  ctx.restore();
}
function epeesCroisees(x, y, coul) {
  ctx.save(); ctx.translate(x, y); ctx.strokeStyle = coul; ctx.lineCap = 'round';
  for (const s of [-1, 1]) {
    ctx.save(); ctx.rotate(s * 0.78);
    ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(0, 9); ctx.stroke();
    ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(-6, 9); ctx.lineTo(6, 9); ctx.stroke();
    ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(0, 15); ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}
function sablier(x, y, coul) {
  ctx.fillStyle = coul; ctx.strokeStyle = coul; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x - 7, y - 10); ctx.lineTo(x + 7, y - 10); ctx.lineTo(x, y); ctx.lineTo(x + 7, y + 10); ctx.lineTo(x - 7, y + 10); ctx.lineTo(x, y); ctx.closePath(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - 4, y + 9); ctx.lineTo(x + 4, y + 9); ctx.lineTo(x, y + 3); ctx.fill();
}
function coeur(x, y, s, coul) {
  ctx.fillStyle = coul; ctx.beginPath();
  ctx.moveTo(x, y + s * 0.9);
  ctx.bezierCurveTo(x - s * 1.4, y - s * 0.1, x - s * 0.7, y - s * 1.1, x, y - s * 0.4);
  ctx.bezierCurveTo(x + s * 0.7, y - s * 1.1, x + s * 1.4, y - s * 0.1, x, y + s * 0.9);
  ctx.fill();
}

// ---------------------------------------------------------------------
//  Muraille qui se dégrade selon ses PV : 5 états prérendus à partir de la même muraille (murTex), dans le même
//  style d'encre. Chaque état reprend les dégâts du précédent et en ajoute (tirage fixe, toujours les mêmes) :
//   1 (< 80 % PV) pierres éclatées · 2 (< 60 %) trous, petites brèches, gravats
//   3 (< 40 %) brèches, suie, bannière déchirée · 4 (< 20 %) brèches béantes tout le long du mur
//  Tout reste au milieu de la face : le haut du mur, où se tiennent les archers, n'est jamais abîmé.
//  Les fissures (continues) s'ajoutent par-dessus comme avant.
// ---------------------------------------------------------------------
// ---------------------------------------------------------------------
//  Muraille renforcée : son apparence suit ses améliorations (niveaux de Maçonnerie, « Pierres de taille »,
//  prestige). Ajouts cumulatifs dessinés sur murTex, puis les dégâts par-dessus (ils percent aussi les renforts) :
//   1 bandeau de pierres de taille · 2 contreforts · 3 bandes de fer cloutées · 4 créneaux laqués de rouge
//   5 blasons dorés sur les contreforts et liseré d'or
// ---------------------------------------------------------------------
const niveauMur = () => Math.min(5, (G.bat.macon || 0) + Math.floor(nv('pierres') / 2) + prestige('macon'));
const CONTREFORTS = [44, 118, W - 118, W - 44];
function murTexNiveau(n) {
  if (n <= 0) return murTex;
  const c = creerCanvas(murTex.width, murTex.height), k = c.getContext('2d'), Y = y => y - OY_MUR;
  k.drawImage(murTex, 0, 0);
  const libre = x => Math.abs(x - W / 2) > 118 && Math.abs(x - 185) > 24 && Math.abs(x - (W - 185)) > 24; // hors pavillon et bannières
  if (n >= 1) { // bandeau de grosses pierres claires au milieu de la face
    for (let x = 0; x < W; x += 34) {
      if (!libre(x + 17)) continue;
      const y = Y(murHaut(x + 17) + 40);
      k.fillStyle = '#d9cdb9'; k.fillRect(x + 1, y, 32, 11);
      k.strokeStyle = ENCRE; k.globalAlpha = 0.7; k.lineWidth = 1.4; k.strokeRect(x + 1, y, 32, 11); k.globalAlpha = 1;
    }
  }
  if (n >= 2) { // contreforts : piliers de pierre plus sombres, du sommet au pied
    for (const x of CONTREFORTS) {
      const y0 = Y(murHaut(x) + 2), y1 = Y(murHaut(x) + MUR_FACE + 4);
      k.fillStyle = '#b8aa96'; k.beginPath(); k.moveTo(x - 10, y0); k.lineTo(x + 10, y0); k.lineTo(x + 14, y1); k.lineTo(x - 14, y1); k.closePath(); k.fill();
      k.fillStyle = 'rgba(40,32,30,0.22)'; k.beginPath(); k.moveTo(x + 4, y0); k.lineTo(x + 10, y0); k.lineTo(x + 14, y1); k.lineTo(x + 6, y1); k.closePath(); k.fill();
      k.strokeStyle = ENCRE; k.lineWidth = 2; k.beginPath(); k.moveTo(x - 10, y0); k.lineTo(x - 14, y1); k.moveTo(x + 10, y0); k.lineTo(x + 14, y1); k.stroke();
      k.lineWidth = 1; k.globalAlpha = 0.5; for (let y = y0 + 12; y < y1; y += 13) { k.beginPath(); k.moveTo(x - 12, y); k.lineTo(x + 12, y); k.stroke(); } k.globalAlpha = 1;
    }
  }
  if (n >= 3) { // bande de fer cloutée sous le chemin de ronde
    k.fillStyle = '#3b3533'; k.strokeStyle = ENCRE; k.lineWidth = 1;
    for (let x = 0; x < W; x += 6) { if (!libre(x)) continue; k.fillRect(x, Y(murHaut(x) + 4), 6, 9); }
    k.strokeStyle = 'rgba(200,190,180,0.5)'; for (let x = 0; x < W; x += 6) { if (!libre(x)) continue; k.beginPath(); k.moveTo(x, Y(murHaut(x) + 5)); k.lineTo(x + 6, Y(murHaut(x + 6) + 5)); k.stroke(); } // reflet du métal
    k.fillStyle = '#8f8a84';
    for (let x = 8; x < W; x += 20) { if (!libre(x)) continue; k.beginPath(); k.arc(x, Y(murHaut(x) + 8.5), 2.2, 0, 7); k.fill(); }
  }
  if (n >= 4) { // créneaux laqués de rouge
    for (let x = 10; x < W - 20; x += 36) {
      if (x > W / 2 - 90 && x < W / 2 + 70) continue;
      const yb = Y(murHaut(x + 12) - 7), hM = 16;
      k.fillStyle = ROUGE; k.fillRect(x - 1, yb - hM - 3, 26, 5);
      k.strokeStyle = ROUGE_FONCE; k.lineWidth = 1; k.strokeRect(x - 1, yb - hM - 3, 26, 5);
    }
  }
  if (n >= 5) { // blasons dorés sur les contreforts, liseré d'or sur le chemin de ronde
    for (const x of CONTREFORTS) {
      const y = Y(murHaut(x) + 30);
      k.fillStyle = '#c9a227'; k.beginPath(); k.arc(x, y, 8, 0, 7); k.fill();
      k.strokeStyle = ENCRE; k.lineWidth = 1.4; k.stroke();
      k.fillStyle = ROUGE; k.beginPath(); k.arc(x, y, 3.5, 0, 7); k.fill();
    }
    k.strokeStyle = '#c9a227'; k.lineWidth = 2; k.beginPath();
    for (let x = 0; x <= W; x += 6) { const y = Y(murHaut(x) - 1); if (x === 0) k.moveTo(x, y); else k.lineTo(x, y); }
    k.stroke();
  }
  return c;
}
// états de dégâts (0 à 4) pour chaque niveau d'apparence, préparés au premier besoin
const ETATS_MUR_NIVEAU = [];
const etatsMurNiveau = n => ETATS_MUR_NIVEAU[n] || (ETATS_MUR_NIVEAU[n] = creerEtatsMur(murTexNiveau(n)));
function creerEtatsMur(base) {
  const etats = [base];
  let graine = 20240611;
  const r = (a = 0, b = 1) => { graine = (graine * 16807) % 2147483647; return a + (b - a) * (graine - 1) / 2147483646; };
  const Y = y => y - OY_MUR;
  const effacer = (c, pts) => { c.save(); c.globalCompositeOperation = 'destination-out'; c.fillStyle = '#000'; c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); c.fill(); c.restore(); };
  const pierre = (c, x, y, t) => {
    c.save(); c.translate(x, y); c.rotate(r(0, 3));
    c.beginPath(); c.moveTo(-t, -t * 0.4); c.lineTo(-t * 0.2, -t * 0.8); c.lineTo(t, -t * 0.3); c.lineTo(t * 0.7, t * 0.6); c.lineTo(-t * 0.6, t * 0.7); c.closePath();
    c.fillStyle = r() < 0.5 ? '#cbbfae' : '#b9ab97'; c.fill(); c.strokeStyle = ENCRE; c.lineWidth = 1.3; c.stroke();
    c.restore();
  };
  const trou = (c, x, y, t) => { // pierre éclatée : creux sombre au bord irrégulier
    c.save();
    cheminBlob(c, x, y, t, t * 0.65, r(0, 50), 0, 0.35, 9);
    c.fillStyle = 'rgba(48,38,33,0.78)'; c.fill(); c.strokeStyle = ENCRE; c.lineWidth = 1.4; c.stroke();
    cheminBlob(c, x - t * 0.15, y - t * 0.1, t * 0.5, t * 0.3, r(0, 50), 0, 0.3, 7); c.fillStyle = 'rgba(20,16,15,0.55)'; c.fill();
    c.restore();
  };
  const gravats = (c, x, n) => { for (let k = 0; k < n; k++) pierre(c, x + r(-26, 26), Y(MUR_Y + MUR_FACE) - r(16, 30), r(3, 7)); };
  const suie = (c, x, y, rr) => {
    const g = c.createRadialGradient(x, y, 2, x, y, rr);
    g.addColorStop(0, 'rgba(30,24,22,0.32)'); g.addColorStop(1, 'rgba(30,24,22,0)');
    c.fillStyle = g; c.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  };
  const yFace = (x, u) => Y(murHaut(x) + 10 + (MUR_FACE - 26) * u);
  // Les dégâts restent au milieu de la face : le haut du mur (chemin de ronde, créneaux, archers) reste intact.
  // Zones libres : hors du centre (pavillon et barre de vie) et hors des bannières.
  const libreFace = x => Math.abs(x - W / 2) > 140 && Math.abs(x - 185) > 26 && Math.abs(x - (W - 185)) > 26 && x > 22 && x < W - 22;
  const xFace = () => { let x, k = 0; do { x = r(22, W - 22); } while (!libreFace(x) && ++k < 80); return x; };
  const yMilieu = x => yFace(x, r(0.25, 0.8));
  // brèche : la face est crevée au milieu ; on voit l'intérieur sombre du mur, des moellons au bord et au fond
  const breche = (c, x, larg, haut) => {
    const yc = Y(murHaut(x)) + 22 + haut / 2, n = 11, pts = [];
    for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 2, ray = r(0.75, 1.15);
      pts.push([x + Math.cos(a) * larg / 2 * ray, yc + Math.sin(a) * haut / 2 * ray * (Math.sin(a) > 0 ? 1.15 : 0.9)]);
    }
    c.save();
    c.beginPath(); pts.forEach(([px, py], k) => k ? c.lineTo(px, py) : c.moveTo(px, py)); c.closePath();
    const g = c.createLinearGradient(0, yc - haut / 2, 0, yc + haut / 2);
    g.addColorStop(0, 'rgba(22,17,16,0.95)'); g.addColorStop(1, 'rgba(58,46,40,0.92)');
    c.fillStyle = g; c.fill();
    c.lineJoin = 'round'; c.strokeStyle = ENCRE; c.lineWidth = 2.2; c.stroke();
    c.strokeStyle = 'rgba(243,228,207,0.35)'; c.lineWidth = 1; c.translate(0, 2.5); c.stroke(); // arête éclairée sous le bord
    c.restore();
    for (let k = 0; k < larg / 9; k++) pierre(c, x + r(-larg / 2.4, larg / 2.4), yc + haut / 2 * r(0.35, 0.8), r(2.5, 5)); // moellons au fond
    for (let k = 0; k < 3; k++) { const a = r(0, Math.PI * 2); pierre(c, x + Math.cos(a) * larg / 2, yc + Math.sin(a) * haut / 2, r(2.5, 4)); } // bord ébréché
  };
  const plan = [
    // 1 (< 80 % PV) : quelques pierres éclatées
    c => { for (let k = 0; k < 6; k++) { const x = xFace(); trou(c, x, yMilieu(x), r(4, 6)); } },
    // 2 (< 60 %) : trous plus nombreux, premiers gravats
    c => { for (let k = 0; k < 7; k++) { const x = xFace(); trou(c, x, yMilieu(x), r(6, 9)); }
           for (let k = 0; k < 2; k++) { const x = xFace(); breche(c, x, r(14, 20), r(10, 14)); gravats(c, x, 2); } },
    // 3 (< 40 %) : premières brèches, suie, bannière de gauche déchirée
    c => { for (let k = 0; k < 5; k++) { const x = xFace(); trou(c, x, yMilieu(x), r(8, 11)); }
           for (let k = 0; k < 3; k++) { const x = xFace(); breche(c, x, r(26, 36), r(18, 24)); gravats(c, x, 4); suie(c, x, yFace(x, 0.45), 32); }
           const bx = 185, top = Y(murHaut(bx)) - 2, pts = [[bx - 18, top + 40], [bx - 4, top + 34], [bx + 6, top + 46], [bx + 18, top + 38], [bx + 18, top + 76], [bx - 18, top + 76]];
           effacer(c, pts); c.save(); c.beginPath(); c.moveTo(bx - 14, top + 41); c.lineTo(bx - 4, top + 35); c.lineTo(bx + 6, top + 47); c.lineTo(bx + 14, top + 41);
           c.strokeStyle = ROUGE_FONCE; c.lineWidth = 1.5; c.stroke(); c.restore();
           c.save(); c.globalCompositeOperation = 'destination-over'; c.fillStyle = '#c6b9a6'; c.fillRect(bx - 18, top + 34, 36, 44); c.restore(); },
    // 4 (< 20 %) : brèches béantes tout le long de la muraille
    c => { for (const x of [62, 128, 248, W - 248, W - 128, W - 62]) { breche(c, x + r(-8, 8), r(40, 52), r(30, 38)); gravats(c, x, 6); suie(c, x, yFace(x, 0.5), 40); } },
  ];
  for (const etape of plan) {
    const c = creerCanvas(murTex.width, murTex.height), k = c.getContext('2d');
    k.drawImage(etats[etats.length - 1], 0, 0); etape(k); etats.push(c);
  }
  return etats;
}
// état de la muraille selon ses PV : 0 intacte … 4 brèches béantes
const etatMur = () => { const f = G.mur.pv / G.mur.max; return f > 0.8 ? 0 : f > 0.6 ? 1 : f > 0.4 ? 2 : f > 0.2 ? 3 : 4; };

// ---------------------------------------------------------------------
//  Drapeaux animés aux deux bouts de la muraille (assets/drapeau.webp, fond crème) : 3 rangées de 9 images
//  (27 images qui flottent). Le fond relié aux bords devient transparent (le socle de pierre, enfermé dans son
//  contour, reste opaque). La pierre ne bouge pas : on la prend une seule fois (1re image) et chaque image
//  n'apporte que la hampe et le tissu, recalés sur le pied de la hampe.
// ---------------------------------------------------------------------
const DRAPEAU = { src: 'assets/drapeau.webp', colonnes: 9, rangees: 3, echelle: 0.33, ips: 12, pierre: 24 };
let imagesDrapeau = null;
{ const img = new Image(); img.onload = () => { try { imagesDrapeau = preparerDrapeaux(img); } catch (e) { imagesDrapeau = null; } }; img.src = DRAPEAU.src; }
function preparerDrapeaux(img) {
  const iw = img.width, ih = img.height, c = creerCanvas(iw, ih), k = c.getContext('2d');
  k.drawImage(img, 0, 0);
  const id = k.getImageData(0, 0, iw, ih), d = id.data;
  const lum = p => (d[p * 4] + d[p * 4 + 1] + d[p * 4 + 2]) / 3;
  // fond = pixels clairs reliés aux bords
  const fond = new Uint8Array(iw * ih), pile = [];
  for (let x = 0; x < iw; x++) pile.push(x, (ih - 1) * iw + x);
  for (let y = 0; y < ih; y++) pile.push(y * iw, y * iw + iw - 1);
  while (pile.length) {
    const p = pile.pop(); if (fond[p] || lum(p) < 215) continue; fond[p] = 1;
    const x = p % iw, y = (p - x) / iw;
    if (x > 0) pile.push(p - 1); if (x < iw - 1) pile.push(p + 1); if (y > 0) pile.push(p - iw); if (y < ih - 1) pile.push(p + iw);
  }
  for (let p = 0; p < iw * ih; p++) {
    if (fond[p]) { d[p * 4 + 3] = 0; continue; }
    // bord adouci : un pixel clair touchant le fond devient semi-transparent
    const x = p % iw;
    const voisinFond = (x > 0 && fond[p - 1]) || (x < iw - 1 && fond[p + 1]) || (p >= iw && fond[p - iw]) || (p < iw * (ih - 1) && fond[p + iw]);
    if (voisinFond) d[p * 4 + 3] = Math.round(255 * clamp((245 - lum(p)) / 150, 0, 1));
  }
  k.putImageData(id, 0, 0);
  const op = (x, y) => d[(y * iw + x) * 4 + 3] > 120;
  const cw = iw / DRAPEAU.colonnes, ch = ih / DRAPEAU.rangees, P = DRAPEAU.pierre;
  const cases = [], vu = new Uint8Array(iw * ih); let gen = 0; // marquage du remplissage, une génération par image
  for (let r = 0; r < DRAPEAU.rangees; r++) for (let q = 0; q < DRAPEAU.colonnes; q++) {
    const x0 = Math.round(q * cw), x1 = Math.round((q + 1) * cw), y0 = Math.round(r * ch), y1 = Math.round((r + 1) * ch);
    let haut = y1, bas = y0, gauche = x1, droite = x0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (op(x, y)) { haut = Math.min(haut, y); bas = Math.max(bas, y); gauche = Math.min(gauche, x); droite = Math.max(droite, x); }
    // pied de la hampe : milieu des pixels opaques juste au-dessus de la pierre
    let sx = 0, n = 0; const yh = bas - P - 4;
    for (let x = gauche; x <= droite; x++) if (op(x, yh)) { sx += x; n++; }
    // on ne garde que ce qui est relié à la hampe (la pointe d'un drapeau voisin peut déborder dans la case)
    const hx = Math.round(n ? sx / n : gauche + 20), masque = [];
    const file = [yh * iw + hx]; gen++;
    let mx0 = iw, mx1 = 0, my0 = ih, my1 = 0;
    while (file.length) {
      const p = file.pop(); if (vu[p] === gen) continue; vu[p] = gen;
      const x = p % iw, y = (p - x) / iw; if (!op(x, y)) continue;
      masque.push(p); mx0 = Math.min(mx0, x); mx1 = Math.max(mx1, x); my0 = Math.min(my0, y); my1 = Math.max(my1, y);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < iw && yy < ih) file.push(yy * iw + xx);
      }
    }
    // image isolée : seulement les pixels du drapeau (et leur bord adouci)
    const w = mx1 - mx0 + 3, h = my1 - my0 + 3, seul = creerCanvas(w, h), sk = seul.getContext('2d'), sid = sk.createImageData(w, h);
    for (const p of masque) {
      const x = p % iw, y = (p - x) / iw;
      for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) { // un pixel de marge pour garder l'anticrénelage
        const xx = x + dx, yy = y + dy, q = ((yy - my0 + 1) * w + (xx - mx0 + 1)) * 4, src = (yy * iw + xx) * 4;
        if (sid.data[q + 3] === 0) { sid.data[q] = d[src]; sid.data[q + 1] = d[src + 1]; sid.data[q + 2] = d[src + 2]; sid.data[q + 3] = d[src + 3]; }
      }
    }
    sk.putImageData(sid, 0, 0);
    cases.push({ seul, x0: mx0 - 1, x1: mx1 + 1, haut: my0 - 1, bas: my1, hampe: hx });
  }
  // la pierre : prise une fois, sur la 1re image
  const c0 = cases[0];
  const pierre = { img: creerCanvas(c0.x1 - c0.x0 + 1, P + 1), dx: c0.x0 - c0.hampe, dy: -P };
  pierre.img.getContext('2d').drawImage(c0.seul, 0, c0.bas - P - c0.haut, c0.x1 - c0.x0 + 1, P + 1, 0, 0, c0.x1 - c0.x0 + 1, P + 1);
  // chaque image : hampe et tissu seulement (au-dessus de la pierre), recalés sur le pied de la hampe
  const images = cases.map(cs => {
    const w = cs.x1 - cs.x0 + 1, h = cs.bas - P + 2 - cs.haut;
    const im = creerCanvas(w, h); im.getContext('2d').drawImage(cs.seul, 0, 0, w, h, 0, 0, w, h);
    return { img: im, dx: cs.x0 - cs.hampe, dy: cs.haut - (cs.bas - P + 2) - P + 2 };
  });
  return { pierre, images };
}
// drapeau posé sur (x, y) = dessous de la pierre ; miroir = flotte vers la gauche
function drapeauAnime(x, y, t, miroir, phase) {
  const D = imagesDrapeau, im = D.images[Math.floor(t * DRAPEAU.ips + phase) % D.images.length], s = DRAPEAU.echelle;
  ctx.save(); ctx.translate(x, y); ctx.scale(miroir ? -s : s, s);
  ctx.drawImage(im.img, im.dx, im.dy);
  ctx.drawImage(D.pierre.img, D.pierre.dx, D.pierre.dy);
  ctx.restore();
}
// les deux drapeaux du haut de la muraille (celui de droite flotte vers l'intérieur pour rester à l'écran)
function drapeauxMuraille(t) {
  if (imagesDrapeau && imagesDrapeau.images.length) { drapeauAnime(30, murHaut(30) - 6, t, false, 0); drapeauAnime(W - 30, murHaut(W - 30) - 6, t, true, 11); }
  else { drapeau(30, murHaut(30) - 6, t); drapeau(W - 30, murHaut(W - 30) - 6, t); }
}
// ---------------------------------------------------------------------
//  Pavillon de la porte (le « château » au centre de la muraille) : dessiné à part, il se fissure avec les PV
//  (5 états cumulatifs) et s'effondre quand la muraille tombe à 0 PV.
// ---------------------------------------------------------------------
const PAVILLON = { w: 240, h: 118, cx: 120, base: 114 }; // toile locale ; base = pied du pavillon (MUR_Y − 7 à l'écran)
function dessinerPavillonBase(c) {
  const cx = PAVILLON.cx, base = PAVILLON.base;
  c.fillStyle = '#d3c7b4'; c.fillRect(cx - 72, base - 18, 144, 18); cadrePinceau(c, cx - 72, base - 18, 144, 18, 2);
  c.fillStyle = 'rgba(40,32,30,0.65)'; c.fillRect(cx - 62, base - 52, 124, 34);
  c.strokeStyle = 'rgba(243,228,207,0.35)'; c.lineWidth = 1;
  for (let x = cx - 58; x < cx + 60; x += 8) { c.beginPath(); c.moveTo(x, base - 48); c.lineTo(x, base - 22); c.stroke(); }
  for (const px of [-60, -28, 28, 60]) coup(c, cx + px, base - 56, cx + px, base - 18, 6);
  c.fillStyle = ENCRE; c.fillRect(cx - 70, base - 60, 140, 7);
  c.beginPath(); c.moveTo(cx - 104, base - 76);
  c.quadraticCurveTo(cx - 76, base - 60, cx - 40, base - 60); c.lineTo(cx + 40, base - 60);
  c.quadraticCurveTo(cx + 76, base - 60, cx + 104, base - 76);
  c.lineTo(cx + 82, base - 72); c.quadraticCurveTo(cx + 66, base - 82, cx + 54, base - 92);
  c.lineTo(cx - 54, base - 92); c.quadraticCurveTo(cx - 66, base - 82, cx - 82, base - 72); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(243,228,207,0.28)'; c.lineWidth = 1.2;
  for (let x = -48; x <= 48; x += 8) { c.beginPath(); c.moveTo(cx + x, base - 90); c.lineTo(cx + x * 1.45, base - 63); c.stroke(); }
  c.fillStyle = ENCRE; c.fillRect(cx - 60, base - 98, 120, 7);
  pinceau(c, courbe(cx - 60, base - 95, cx - 70, base - 95, cx - 72, base - 106, 5), 4);
  pinceau(c, courbe(cx + 60, base - 95, cx + 70, base - 95, cx + 72, base - 106, 5), 4);
  c.fillStyle = ROUGE; c.beginPath(); c.arc(cx, base - 76, 6, 0, 7); c.fill();
}
const ETATS_PAVILLON = (function () {
  const P = PAVILLON, cx = P.cx, base = P.base;
  let graine = 7771;
  const r = (a = 0, b = 1) => { graine = (graine * 16807) % 2147483647; return a + (b - a) * (graine - 1) / 2147483646; };
  const fissure = (c, x, y, ang, long, clair) => { // fissure ramifiée, de plus en plus fine
    const pts = [[x, y]]; let a = ang;
    for (let k = 0; k < 6; k++) { a += r(-0.5, 0.5); x += Math.cos(a) * long / 6; y += Math.sin(a) * long / 6; pts.push([x, y]); }
    c.save(); c.lineCap = 'round'; c.strokeStyle = clair ? 'rgba(243,228,207,0.75)' : ENCRE;
    for (let k = 1; k < pts.length; k++) { c.lineWidth = 2.4 * (1 - k / pts.length) + 0.5; c.beginPath(); c.moveTo(...pts[k - 1]); c.lineTo(...pts[k]); c.stroke(); }
    c.restore();
    if (long > 14 && r() < 0.6) { const m = pts[3]; fissure(c, m[0], m[1], ang + r(-1.2, 1.2), long * 0.45, clair); }
  };
  const effacer = (c, pts) => { c.save(); c.globalCompositeOperation = 'destination-out'; c.fillStyle = '#000'; c.beginPath(); pts.forEach(([x, y], k) => k ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); c.fill(); c.restore(); };
  const bordCasse = (c, pts) => { c.save(); c.strokeStyle = ENCRE; c.lineWidth = 2; c.lineJoin = 'round'; c.beginPath(); pts.forEach(([x, y], k) => k ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke(); c.restore(); };
  const suie = (c, x, y, rr) => { const g = c.createRadialGradient(x, y, 2, x, y, rr); g.addColorStop(0, 'rgba(30,24,22,0.35)'); g.addColorStop(1, 'rgba(30,24,22,0)'); c.fillStyle = g; c.fillRect(x - rr, y - rr, rr * 2, rr * 2); };
  const etapes = [
    // 1 (< 80 % PV) : le socle se fend, une tuile du bord du toit saute
    c => { fissure(c, cx - 30, base - 17, 1.6, 16, false); effacer(c, [[cx - 104, base - 77], [cx - 92, base - 74], [cx - 99, base - 70]]); },
    // 2 (< 60 %) : fissures dans la salle et le socle, faîte ébréché
    c => { fissure(c, cx - 20, base - 50, 1.4, 30, true); fissure(c, cx + 44, base - 17, 1.7, 18, false); fissure(c, cx + 10, base - 17, 1.3, 14, false);
           for (const x of [cx - 30, cx + 22]) effacer(c, [[x - 4, base - 99], [x + 4, base - 99], [x + 1, base - 93], [x - 2, base - 94]]); },
    // 3 (< 40 %) : la corne gauche du toit casse, longues lézardes, suie
    c => { const pts = [[cx - 112, base - 84], [cx - 78, base - 82], [cx - 82, base - 72], [cx - 90, base - 66], [cx - 112, base - 62]];
           effacer(c, pts); bordCasse(c, pts.slice(1, 4));
           fissure(c, cx + 30, base - 52, 1.8, 34, true); fissure(c, cx - 60, base - 18, 1.5, 18, false); fissure(c, cx - 48, base - 90, 0.6, 26, true);
           suie(c, cx - 70, base - 70, 26); suie(c, cx + 20, base - 40, 22); },
    // 4 (< 20 %) : un pan du toit à droite s'arrache, le sceau rouge se fend, le socle s'effrite
    c => { const pts = [[cx + 30, base - 104], [cx + 58, base - 100], [cx + 70, base - 86], [cx + 104, base - 82], [cx + 112, base - 60], [cx + 84, base - 64], [cx + 62, base - 74], [cx + 40, base - 86]];
           effacer(c, pts); bordCasse(c, pts.slice(5).concat([pts[0]]));
           effacer(c, [[cx + 56, base + 2], [cx + 74, base + 2], [cx + 74, base - 14], [cx + 64, base - 10], [cx + 58, base - 4]]);
           c.save(); c.strokeStyle = ENCRE; c.lineWidth = 1.8; c.beginPath(); c.moveTo(cx - 5, base - 82); c.lineTo(cx + 1, base - 76); c.lineTo(cx - 2, base - 70); c.stroke(); c.restore();
           fissure(c, cx - 10, base - 60, 1.6, 40, true); fissure(c, cx + 34, base - 98, 2.2, 22, true); suie(c, cx + 60, base - 70, 30); },
  ];
  const etats = [];
  const t0 = creerCanvas(P.w, P.h); dessinerPavillonBase(t0.getContext('2d')); etats.push(t0);
  for (const e of etapes) { const t = creerCanvas(P.w, P.h), k = t.getContext('2d'); k.drawImage(etats[etats.length - 1], 0, 0); e(k); etats.push(t); }
  return etats;
})();
// tas de décombres laissé par l'effondrement
const RUINES_PAVILLON = (function () {
  const c = creerCanvas(PAVILLON.w, 60), k = c.getContext('2d');
  let graine = 4242; const r = (a = 0, b = 1) => { graine = (graine * 16807) % 2147483647; return a + (b - a) * (graine - 1) / 2147483646; };
  for (let n = 0; n < 46; n++) {
    const u = r(-1, 1), x = PAVILLON.cx + u * 96, h = (1 - u * u) * 34, y = 58 - r(0, h), t = r(4, 10);
    k.save(); k.translate(x, y); k.rotate(r(0, 3));
    k.beginPath(); k.moveTo(-t, -t * 0.4); k.lineTo(-t * 0.2, -t * 0.8); k.lineTo(t, -t * 0.3); k.lineTo(t * 0.7, t * 0.6); k.lineTo(-t * 0.6, t * 0.7); k.closePath();
    k.fillStyle = r() < 0.35 ? '#2a2220' : r() < 0.5 ? '#cbbfae' : '#b9ab97'; k.fill(); k.strokeStyle = ENCRE; k.lineWidth = 1.2; k.stroke();
    k.restore();
  }
  // une poutre et un morceau de toit qui dépassent
  k.save(); k.translate(PAVILLON.cx - 30, 30); k.rotate(-0.5); k.fillStyle = ENCRE; k.fillRect(-26, -3, 52, 6); k.restore();
  k.save(); k.translate(PAVILLON.cx + 34, 34); k.rotate(0.35); k.fillStyle = ENCRE; k.beginPath(); k.moveTo(-24, 6); k.lineTo(20, -8); k.lineTo(26, 2); k.lineTo(-18, 12); k.fill(); k.restore();
  k.fillStyle = ROUGE; k.beginPath(); k.arc(PAVILLON.cx + 6, 40, 4, 0, 7); k.fill();
  return c;
})();
const EFFONDREMENT = { duree: 1.5, fin: 2.4 }; // chute du pavillon, puis écran de fin
// ---------------------------------------------------------------------
//  Pavillon dessiné (assets/pavillon.webp, fond crème) : 6 images en 2 rangées de 3.
//  0 intact · 1 fissuré · 2 lézardé · 3 très abîmé (gravats, poussière) · 4 le toit s'effondre · 5 décombres.
//  États de PV : 0→0, 1→1, 2→2, 3→3, 4→3 ; à 0 PV : 3 → 4 → 5 pendant la chute.
//  Le fond (couleur des coins) devient transparent par remplissage depuis les bords ; chaque image est recalée
//  sur le milieu du bas de son socle.
// ---------------------------------------------------------------------
const PAVILLON_SPRITE = { src: 'assets/pavillon.webp', colonnes: 3, rangees: 2, echelle: 0.42, etats: [0, 1, 2, 3, 3] };
let imagesPavillon = null;
{ const img = new Image(); img.onload = () => { try { imagesPavillon = preparerPavillon(img); } catch (e) { imagesPavillon = null; } }; img.src = PAVILLON_SPRITE.src; }
function preparerPavillon(img) {
  const iw = img.width, ih = img.height, c = creerCanvas(iw, ih), k = c.getContext('2d');
  k.drawImage(img, 0, 0);
  const id = k.getImageData(0, 0, iw, ih), d = id.data;
  // couleur du fond : moyenne des quatre coins
  const fondC = [0, 1, 2].map(ch => [0, iw - 1, (ih - 1) * iw, ih * iw - 1].reduce((t, p) => t + d[p * 4 + ch], 0) / 4);
  const ecart = p => Math.max(Math.abs(d[p * 4] - fondC[0]), Math.abs(d[p * 4 + 1] - fondC[1]), Math.abs(d[p * 4 + 2] - fondC[2]));
  const fond = new Uint8Array(iw * ih), pile = [];
  for (let x = 0; x < iw; x++) pile.push(x, (ih - 1) * iw + x);
  for (let y = 0; y < ih; y++) pile.push(y * iw, y * iw + iw - 1);
  while (pile.length) {
    const p = pile.pop(); if (fond[p] || ecart(p) > 16) continue; fond[p] = 1;
    const x = p % iw, y = (p - x) / iw;
    if (x > 0) pile.push(p - 1); if (x < iw - 1) pile.push(p + 1); if (y > 0) pile.push(p - iw); if (y < ih - 1) pile.push(p + iw);
  }
  for (let p = 0; p < iw * ih; p++) {
    if (fond[p]) { d[p * 4 + 3] = 0; continue; }
    const x = p % iw;
    const bord = (x > 0 && fond[p - 1]) || (x < iw - 1 && fond[p + 1]) || (p >= iw && fond[p - iw]) || (p < iw * (ih - 1) && fond[p + iw]);
    if (bord) d[p * 4 + 3] = Math.round(255 * clamp((ecart(p) - 10) / 50, 0.15, 1)); // bord adouci (poussière comprise)
  }
  k.putImageData(id, 0, 0);
  const op = p => d[p * 4 + 3] > 60;
  const cw = iw / PAVILLON_SPRITE.colonnes, ch = ih / PAVILLON_SPRITE.rangees, images = [];
  for (let r = 0; r < PAVILLON_SPRITE.rangees; r++) for (let q = 0; q < PAVILLON_SPRITE.colonnes; q++) {
    const x0 = Math.round(q * cw), x1 = Math.round((q + 1) * cw), y0 = Math.round(r * ch), y1 = Math.round((r + 1) * ch);
    let haut = y1, bas = y0, g = x1, dr = x0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (op(y * iw + x)) { haut = Math.min(haut, y); bas = Math.max(bas, y); g = Math.min(g, x); dr = Math.max(dr, x); }
    // ligne de sol : la ligne la plus basse bien remplie (le trait sous le socle), et son milieu
    let sol = bas, sx = 0, n = 0;
    for (let y = bas; y > bas - 30; y--) { let m = 0; for (let x = g; x <= dr; x++) if (op(y * iw + x)) m++; if (m > (dr - g) * 0.3) { sol = y; break; } }
    for (let x = g; x <= dr; x++) if (op(sol * iw + x)) { sx += x; n++; }
    const w = dr - g + 1, h = bas - haut + 1, im = creerCanvas(w, h);
    im.getContext('2d').drawImage(c, g, haut, w, h, 0, 0, w, h);
    images.push({ img: im, ax: (n ? sx / n : (g + dr) / 2) - g, ay: sol - haut });
  }
  return images;
}
function imagePavillon(i, x, y, alpha = 1) {
  const im = imagesPavillon[i], e = PAVILLON_SPRITE.echelle;
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.drawImage(im.img, x - im.ax * e, y - im.ay * e, im.img.width * e, im.img.height * e);
  ctx.restore();
}
function dessinerPavillon(etat = 0) {
  const P = PAVILLON, x0 = W / 2 - P.cx, y0 = MUR_Y - 7 - P.base;
  const ef = G && (ecran === 'jeu' || ecran === 'fin') ? G.effondrement : null;
  if (imagesPavillon && imagesPavillon.length >= 6) {
    const x = W / 2, y = MUR_Y - 5;
    if (!ef) { imagePavillon(PAVILLON_SPRITE.etats[etat], x, y); return; }
    // effondrement : très abîmé → le toit s'écroule → décombres, avec de courts fondus entre les images
    const t = ef.t, fondu = 0.18;
    const etapes = [[3, 0], [4, 0.35], [5, 1.05]];
    let k = 0; while (k + 1 < etapes.length && t >= etapes[k + 1][1]) k++;
    const [img, debut] = etapes[k], u = clamp((t - debut) / fondu, 0, 1);
    if (k > 0 && u < 1) imagePavillon(etapes[k - 1][0], x, y, 1 - u);
    imagePavillon(img, x, y, k > 0 ? u : 1);
    for (const n of ef.nuages) { // poussière légère : le dessin a déjà la sienne
      const a = clamp(1 - n.t / n.vie, 0, 1) * 0.16; if (a <= 0) continue;
      ctx.fillStyle = `rgba(140,128,116,${a})`; ctx.beginPath(); ctx.arc(n.x, n.y, n.r * (0.6 + n.t / n.vie), 0, 7); ctx.fill();
    }
    return;
  }
  if (!ef) { ctx.drawImage(ETATS_PAVILLON[etat], x0, y0); return; }
  const u = clamp(ef.t / EFFONDREMENT.duree, 0, 1), chute = u * u;
  // le pavillon s'enfonce derrière le chemin de ronde en basculant
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, W, MUR_Y - 5); ctx.clip();
  ctx.translate(W / 2, MUR_Y - 7); ctx.rotate(0.12 * chute); ctx.translate(-W / 2, -(MUR_Y - 7));
  ctx.globalAlpha = 1 - 0.3 * chute;
  ctx.drawImage(ETATS_PAVILLON[ETATS_PAVILLON.length - 1], x0, y0 + chute * (P.base + 6));
  ctx.restore();
  // les décombres montent à mesure qu'il tombe
  const h = RUINES_PAVILLON.height * clamp(u * 1.3, 0, 1);
  if (h > 1) ctx.drawImage(RUINES_PAVILLON, 0, RUINES_PAVILLON.height - h, RUINES_PAVILLON.width, h, x0, MUR_Y - 7 - h + 4, RUINES_PAVILLON.width, h);
  // nuage de poussière d'encre
  for (const n of ef.nuages) {
    const a = clamp(1 - n.t / n.vie, 0, 1) * 0.45;
    if (a <= 0) continue;
    ctx.fillStyle = `rgba(90,78,68,${a})`;
    ctx.beginPath(); ctx.arc(n.x, n.y, n.r * (0.6 + n.t / n.vie), 0, 7); ctx.fill();
  }
}
function majEffondrement(dt) {
  const ef = G.effondrement; ef.t += dt;
  for (const n of ef.nuages) { n.t += dt; n.x += n.vx * dt; n.y += n.vy * dt; }
  ef.nuages = ef.nuages.filter(n => n.t < n.vie);
  if (ef.t < (imagesPavillon ? 1.0 : EFFONDREMENT.duree + 0.3) && Math.random() < (imagesPavillon ? 0.35 : 0.8)) {
    for (let k = 0; k < (imagesPavillon ? 1 : 2); k++) ef.nuages.push({ x: W / 2 + rand(-100, 100), y: MUR_Y - rand(0, 40), r: rand(14, 30), vx: rand(-60, 60), vy: rand(-50, -10), t: 0, vie: rand(1, 1.8) });
  }
  // la toile tremble pendant la chute
  const sec = ef.t < EFFONDREMENT.duree ? 4 * (1 - ef.t / EFFONDREMENT.duree) : 0;
  canvas.style.transform = sec > 0.2 ? `translate(${rand(-sec, sec).toFixed(1)}px, ${rand(-sec, sec).toFixed(1)}px)` : '';
  if (ef.t >= EFFONDREMENT.fin) { canvas.style.transform = ''; ecran = 'fin'; ouvrirHeritage(true); }
}
function dessinerMuraille(t) {
  // sur le parapet : dessinées avant le mur, qui en cache la base
  if (plancheCata && PLACE_CATAPULTES === 'parapet') G.catas.forEach(dessinerCatapulteSprite);
  const nm = niveauMur();
  if (G.niveauMurVu !== undefined && nm > G.niveauMurVu) G.rempartFlash = 0.8; // éclair de renfort quand la muraille change
  G.niveauMurVu = nm;
  ctx.drawImage(etatsMurNiveau(nm)[etatMur()], 0, OY_MUR);
  dessinerPavillon(etatMur());
  // fissures
  const nbF = Math.floor((1 - G.mur.pv / G.mur.max) * fissures.length);
  ctx.strokeStyle = ENCRE; ctx.lineCap = 'round';
  for (let i = 0; i < nbF; i++) {
    const p = fissures[i];
    for (let k = 1; k < p.length; k++) {
      ctx.lineWidth = 2.6 * (1 - k / p.length) + 0.4;
      ctx.beginPath(); ctx.moveTo(p[k - 1][0], p[k - 1][1]); ctx.lineTo(p[k][0], p[k][1]); ctx.stroke();
    }
  }
  drapeauxMuraille(t);
  dessinerBannieresDojo(t);
  // les monstres au contact du mur passent devant le pavillon et les créneaux, pour rester lisibles
  G.ennemis.filter(e => e.auMur).sort((a, b) => a.y - b.y).forEach(dessinerEnnemi);
  // samouraïs et monstres qu'ils retiennent : au premier plan aussi (sinon le pavillon les cache)
  G.ennemis.filter(e => e.combat && !e.auMur).sort((a, b) => a.y - b.y).forEach(dessinerEnnemi);
  dessinerSamourais();
  if (!plancheCata) G.catas.forEach(dessinerCatapulte);
  else if (PLACE_CATAPULTES === 'cour') G.catas.forEach(dessinerCatapulteSprite);
  if (plancheBaliste) G.balistes.forEach(dessinerBalisteSprite); else G.balistes.forEach(dessinerBaliste);
  G.mortiers.forEach(dessinerMortier);
  dessinerLanternes(t);
  G.archers.forEach((a, i) => dessinerArcher(a, i));
  dessinerFaucons();
  dessinerCarreaux(); // les carreaux partent de la cour : ils passent devant le mur
}
function dessinerBaliste(b) {
  ctx.save(); ctx.translate(b.x, b.y);
  ctx.strokeStyle = ENCRE; ctx.fillStyle = ENCRE; ctx.lineCap = 'round';
  ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(0, -16); ctx.lineTo(12, 0); ctx.stroke();
  ctx.translate(0, -18); ctx.rotate(b.angle + Math.PI / 2);
  const r = b.recul * 4;
  ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, 8 + r); ctx.lineTo(0, -22 + r); ctx.stroke();
  ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 4 + r, 20, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
  ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-17, -6 + r); ctx.lineTo(0, b.cd > 0.6 ? 6 + r : 2 + r); ctx.lineTo(17, -6 + r); ctx.stroke();
  if (b.cd < rechargeBaliste() * 0.7) { ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(0, 4 + r); ctx.lineTo(0, -26 + r); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, -31 + r); ctx.lineTo(-4, -24 + r); ctx.lineTo(4, -24 + r); ctx.fill(); }
  ctx.restore();
}
// ---------------------------------------------------------------------
//  Mortier dessiné (assets/mortier.webp, planche du joueur, 8 × 3 images sur fond magenta) : ligne 0 = repos (le
//  drapeau flotte), ligne 1 = le fût se lève (images 0-2, juste avant le tir) puis l'éclair et la flamme (3-7, dès le
//  tir), ligne 2 = la fumée se dissipe. Le magenta est retiré au chargement ; la fumée et les flammes, à demi
//  transparentes, retrouvent leur couleur (on « démélange » le magenta). Repli : le mortier dessiné par le code.
// ---------------------------------------------------------------------
const MORTIER_SPRITE = { src: 'assets/mortier.webp', colonnes: 8, rangees: 3, hauteur: 52, ipsRepos: 7, ipsTir: 16, avant: 0.22 };
let plancheMortier = null;
{ const img = new Image(); img.onload = () => { try { plancheMortier = preparerMortier(img); } catch (e) { plancheMortier = null; } }; img.src = MORTIER_SPRITE.src; }
function preparerMortier(img) {
  const w = img.width, h = img.height, c = creerCanvas(w, h), k = c.getContext('2d');
  k.drawImage(img, 0, 0);
  const id = k.getImageData(0, 0, w, h), d = id.data, K = [255, 0, 255];
  for (let p = 0; p < d.length; p += 4) {
    const m = Math.min(d[p], d[p + 2]) - d[p + 1], a = clamp((170 - m) / 120, 0, 1);
    if (a <= 0.02) { d[p + 3] = 0; continue; }
    if (a < 1) for (let i = 0; i < 3; i++) d[p + i] = clamp(Math.round((d[p + i] - (1 - a) * K[i]) / a), 0, 255); // démélange
    { const r = d[p], g = d[p + 1], b = d[p + 2]; if (r - g > 22 && b - g > 22 && !(r > 170 && g > 80)) { const gr = Math.round((r + g + b) / 3 * 0.8); d[p] = d[p + 1] = d[p + 2] = gr; } } // fumée violacée → grise
    if (a < 0.92) { // fumée : gris neutre (le démélange laisse des reflets violets ou verts) ; les flammes gardent leur chaleur
      const r = d[p], g = d[p + 1], b = d[p + 2], gris = (r + g + b) / 3, flamme = r > 170 && g > 80 && b < g;
      if (!flamme) { d[p] = d[p + 1] = d[p + 2] = Math.round(gris * 0.85); }
    }
    d[p + 3] = Math.round(255 * a);
  }
  k.putImageData(id, 0, 0);
  const cw = w / MORTIER_SPRITE.colonnes, ch = h / MORTIER_SPRITE.rangees, cases = [];
  for (let r = 0; r < MORTIER_SPRITE.rangees; r++) for (let q = 0; q < MORTIER_SPRITE.colonnes; q++) {
    const x0 = Math.round(q * cw), y0 = Math.round(r * ch), x1 = Math.round((q + 1) * cw), y1 = Math.round((r + 1) * ch);
    let bas = -1, haut = -1;
    for (let y = y1 - 1; y >= y0 && bas < 0; y--) for (let x = x0; x < x1; x += 2) if (d[(y * w + x) * 4 + 3] > 200) { bas = y; break; }
    for (let y = y0; y < y1 && haut < 0; y++) for (let x = x0; x < x1; x += 2) if (d[(y * w + x) * 4 + 3] > 200) { haut = y; break; }
    let sx = 0, n = 0;
    for (let y = Math.max(y0, bas - 12); y <= bas; y++) for (let x = x0; x < x1; x++) if (d[(y * w + x) * 4 + 3] > 200) { sx += x; n++; }
    cases.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, pieds: [n ? sx / n : (x0 + x1) / 2, bas < 0 ? y1 : bas], taille: bas - haut });
  }
  const taille = cases.slice(0, 8).reduce((t, c) => t + c.taille, 0) / 8; // hauteur au repos (drapeau compris)
  return { c, cases, echelle: MORTIER_SPRITE.hauteur / taille };
}
function dessinerMortierSprite(m, i) {
  const P = plancheMortier, S = MORTIER_SPRITE;
  let n;
  if (m.anim >= 0) { // après le tir : éclair et flamme (ligne 1, 3-7) puis fumée (ligne 2)
    const f = Math.floor(m.anim * S.ipsTir);
    n = f < 5 ? 8 + 3 + f : f - 5 < 8 ? 16 + (f - 5) : 0;
  } else if (m.cd < S.avant) n = 8 + Math.min(2, Math.floor((1 - m.cd / S.avant) * 3)); // le fût se lève
  else n = Math.floor(G.t * S.ipsRepos + i * 3) % 8; // repos : le drapeau flotte
  const C = P.cases[n], e = P.echelle;
  ctx.drawImage(P.c, C.x, C.y, C.w, C.h, m.x - (C.pieds[0] - C.x) * e, m.y + 2 - (C.pieds[1] - C.y) * e, C.w * e, C.h * e);
}
// ---------------------------------------------------------------------
//  Boulet des mortiers (assets/boulet-dragon.webp, planche du joueur : 8 images de 250 px, fond transparent) : une
//  tête de dragon de feu suivie d'une traînée de fumée. Pour rester discret : petit (30 px de long au pied de la
//  muraille, plus petit au loin), légèrement transparent et adouci (moins saturé), sans l'explosion de départ (le
//  mortier a déjà sa flamme). La tête pointe dans le sens du vol (montée puis descente) ; vers la gauche, l'image est
//  retournée. Images 3 → 5 au départ, puis 5 ↔ 7 en vol. Repli : le boulet d'encre dessiné par le code.
// ---------------------------------------------------------------------
const BOULET = { src: 'assets/boulet-dragon.webp', images: 8, longueur: 30, opacite: 0.9, saturation: 0.75 };
let planchesBoulet = null;
{ const img = new Image(); img.onload = () => { try { planchesBoulet = preparerBoulet(img); } catch (e) { planchesBoulet = null; } }; img.src = BOULET.src; }
function preparerBoulet(img) {
  const n = BOULET.images, cw = Math.floor(img.width / n), h = img.height, images = [];
  for (let i = 0; i < n; i++) {
    const c = creerCanvas(cw, h), k = c.getContext('2d');
    k.drawImage(img, i * cw, 0, cw, h, 0, 0, cw, h);
    const id = k.getImageData(0, 0, cw, h), d = id.data;
    let x0 = cw, x1 = 0, y0 = h, y1 = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < cw; x++) {
      const p = (y * cw + x) * 4; if (d[p + 3] < 40) continue;
      // adoucir : un peu moins saturé, pour se fondre dans l'encre du décor
      const g = (d[p] + d[p + 1] + d[p + 2]) / 3, s = BOULET.saturation;
      d[p] = g + (d[p] - g) * s; d[p + 1] = g + (d[p + 1] - g) * s; d[p + 2] = g + (d[p + 2] - g) * s;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    k.putImageData(id, 0, 0);
    // la tête : le coin haut-droit du dessin ; la traînée part vers le bas-gauche (angle mesuré de la queue à la tête)
    const tete = [x1 - (x1 - x0) * 0.16, y0 + (y1 - y0) * 0.17], queue = [x0 + (x1 - x0) * 0.1, y1 - (y1 - y0) * 0.08];
    images.push({ c, tete, angle: Math.atan2(tete[1] - queue[1], tete[0] - queue[0]), longueur: Math.hypot(tete[0] - queue[0], tete[1] - queue[1]) });
  }
  return images;
}
function dessinerBouletDragon(r, x, y) {
  const P = planchesBoulet, ti = r.t;
  const k = ti < 0.15 ? 3 + Math.floor(ti / 0.15 * 3) : 5 + [0, 1, 2, 1][Math.floor(G.t * 10) % 4];
  const im = P[Math.min(P.length - 1, k)];
  // direction du vol : dérivée de la trajectoire (ligne droite au sol + arc de 120 px)
  const vx = r.x1 - r.x0, vy = (r.y1 - r.y0) - 120 * Math.PI * Math.cos(Math.PI * ti), gauche = vx < 0;
  const angle = Math.atan2(vy, Math.abs(vx)) - im.angle;
  const e = BOULET.longueur / im.longueur * perspective(y + 60);
  ctx.save(); ctx.globalAlpha = BOULET.opacite;
  ctx.translate(x, y); ctx.scale(gauche ? -1 : 1, 1); ctx.rotate(angle); ctx.scale(e, e);
  ctx.drawImage(im.c, -im.tete[0], -im.tete[1]);
  ctx.restore();
}
// mortier à poudre (repli) : fût trapu cerclé, mèche rouge quand il est prêt
function dessinerMortier(m, i) {
  if (plancheMortier) { dessinerMortierSprite(m, i); return; }
  ctx.save(); ctx.translate(m.x, m.y + m.recul * 2);
  ctx.fillStyle = ENCRE; ctx.strokeStyle = ENCRE; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.ellipse(0, -2, 15, 5, 0, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-11, -2); ctx.lineTo(-8, -24); ctx.lineTo(8, -24); ctx.lineTo(11, -2); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = PARCHEMIN; ctx.lineWidth = 1.4;
  for (const y of [-9, -17]) { ctx.beginPath(); ctx.moveTo(-10 + (y + 2) / 8, y); ctx.lineTo(10 - (y + 2) / 8, y); ctx.stroke(); }
  ctx.fillStyle = '#3a2e26'; ctx.beginPath(); ctx.ellipse(0, -24, 8, 3, 0, 0, 7); ctx.fill();
  if (m.cd < 1) { ctx.fillStyle = ROUGE; ctx.beginPath(); ctx.arc(10, -22, 2.2 + Math.sin(G.t * 20) * 0.6, 0, 7); ctx.fill(); }
  if (m.recul > 0.6) { ctx.fillStyle = 'rgba(60,50,45,0.35)'; ctx.beginPath(); ctx.arc(0, -32 - (1 - m.recul) * 30, 8 + (1 - m.recul) * 20, 0, 7); ctx.fill(); }
  ctx.restore();
}
// sanctuaire : lanternes de papier sur la muraille, qui s'allument la nuit
const POSTES_LANTERNES = [205, W - 205, 310, W - 310, 100, W - 100];
function dessinerLanternes(t) {
  const n = G.bat.sanctuaire ? Math.min(6, 1 + G.bat.sanctuaire) : 0, nuit = niveauNuit(G.t);
  for (let i = 0; i < n; i++) {
    const x = POSTES_LANTERNES[i], y = murHaut(x) - 34, sw = Math.sin(t * 1.6 + i) * 0.08;
    ctx.save(); ctx.translate(x, y); ctx.rotate(sw);
    ctx.strokeStyle = ENCRE; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(0, -6); ctx.stroke();
    ctx.fillStyle = nuit > 0.2 ? `rgb(${200 + 40 * nuit},${70 + 70 * nuit},50)` : ROUGE;
    ctx.beginPath(); ctx.ellipse(0, 4, 8, 11, 0, 0, 7); ctx.fill();
    ctx.fillStyle = ENCRE; ctx.fillRect(-6, -8, 12, 3); ctx.fillRect(-6, 13, 12, 3);
    ctx.strokeStyle = 'rgba(27,23,25,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-7, 4); ctx.lineTo(7, 4); ctx.stroke();
    ctx.restore();
  }
}
// sol embrasé par la poudre : lavis rouge-orangé et petites flammes
function dessinerBrasiers(t) {
  for (const b of G.brasiers) {
    const a = Math.min(1, b.t / 0.6, (b.duree - b.t) * 4 + 0.2), p = perspective(b.y);
    ctx.save(); ctx.globalAlpha = 0.45 * a; ctx.fillStyle = '#7a2a18';
    cheminBlob(ctx, b.x, b.y + 8 * p, b.zone, b.zone * 0.42, b.seed, t, 0.2); ctx.fill();
    ctx.globalAlpha = a;
    for (let k = 0; k < 5; k++) {
      const ang = b.seed + k * 1.3, rr = b.zone * 0.6 * ((k * 37 % 10) / 10);
      flamme(b.x + Math.cos(ang) * rr, b.y + 8 * p + Math.sin(ang) * rr * 0.4, t + k + b.seed, 0.45 * p);
    }
    ctx.restore();
  }
}
// Dojo : bannières noires frappées de « 武 » (l'art martial) accrochées à la face de la muraille, de part et d'autre
// du pavillon ; une au niveau 1, deux dès le niveau 3, pompons dorés au niveau maximum. Elles ondulent un peu.
function dessinerBannieresDojo(t) {
  const l = G.bat.dojo; if (!l) return;
  const postes = l >= 3 ? [W / 2 - 266, W / 2 + 266] : [W / 2 - 266]; // aux deux bouts de la face, hors de la plaque de vie
  for (const [k, x] of postes.entries()) {
    const y = murHaut(x) + 10, w = 26, h = 46 + Math.min(l, 5) * 2, o = Math.sin(t * 1.6 + k * 2) * 1.6;
    ctx.save();
    ctx.fillStyle = 'rgba(27,23,25,0.25)'; ctx.fillRect(x - w / 2 + 3, y + 3, w, h); // ombre sur la pierre
    ctx.fillStyle = '#1f1b1d';
    ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.lineTo(x + w / 2, y);
    ctx.lineTo(x + w / 2 + o, y + h); ctx.lineTo(x + o, y + h - 7); ctx.lineTo(x - w / 2 + o, y + h); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#7a5a2a'; ctx.fillRect(x - w / 2 - 4, y - 3, w + 8, 4); // hampe
    ctx.restore();
    texte('武', x + o * 0.5, y + h * 0.42, 17, PAPIER, 'center', 'bold', SERIF);
    if (l >= batimentDe('dojo').max) { ctx.fillStyle = '#c9962e'; for (const dx of [-w / 2 + 2, w / 2 - 2]) { ctx.beginPath(); ctx.arc(x + dx + o, y + h + 3, 3, 0, 7); ctx.fill(); } }
  }
}
// pieux du fossé, plantés en travers du chemin devant la muraille
function dessinerPieux() {
  if (!G.bat.fosse) return;
  const y0 = MUR_Y - ARRET_MUR - 4, demi = cheminDemi(y0), c = cheminCentre(y0), n = 6 + G.bat.fosse * 3;
  // la tranchée : une bande d'eau d'encre qui barre le chemin, plus large à chaque niveau, avec des rides
  { const t = performance.now() / 1000, yf = murHaut(c) - ARRET_MUR - 30, hf = 7 + G.bat.fosse * 2.2, poison = G.talents.fosse;
    ctx.save();
    const g = ctx.createLinearGradient(0, yf - hf, 0, yf + hf);
    const teinte = poison ? '58,78,40' : '27,30,38';
    g.addColorStop(0, `rgba(${teinte},0)`); g.addColorStop(0.35, `rgba(${teinte},0.42)`); g.addColorStop(0.7, `rgba(${teinte},0.34)`); g.addColorStop(1, `rgba(${teinte},0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(c, yf, demi * 1.04, hf, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = poison ? 'rgba(190,220,150,0.5)' : 'rgba(225,230,240,0.45)'; ctx.lineWidth = 1.3; ctx.lineCap = 'round';
    for (let k = 0; k < 4 + G.bat.fosse; k++) { // rides qui glissent doucement
      const u = ((k * 0.37 + t * 0.06) % 1) * 2 - 1, x = c + u * demi * 0.85, y = yf + Math.sin(k * 2.1) * hf * 0.35, l = 10 + (k % 3) * 5;
      ctx.beginPath(); ctx.moveTo(x - l / 2, y); ctx.quadraticCurveTo(x, y - 2, x + l / 2, y); ctx.stroke();
    }
    ctx.restore(); }
  ctx.strokeStyle = ENCRE; ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const x = c - demi + (i + 0.5) * (2 * demi / n), y = murHaut(x) - ARRET_MUR - 18, h = 14 + (i * 7 % 5) * 2, pen = (i % 2 ? 1 : -1) * 0.3;
    ctx.lineWidth = 3.2; ctx.beginPath(); ctx.moveTo(x, y + 4); ctx.lineTo(x + pen * h, y - h); ctx.stroke();
    if (G.talents.fosse) { ctx.strokeStyle = '#4f6b2a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + pen * h * 0.7, y - h * 0.7); ctx.lineTo(x + pen * h, y - h); ctx.stroke(); ctx.strokeStyle = ENCRE; }
  }
}
// aura du temple : vagues de lavis doré qui montent du pied de la muraille
function dessinerAuraTemple(t) {
  if (!G.bat.temple) return;
  ctx.save();
  const g = ctx.createLinearGradient(0, MUR_Y - AURA_TEMPLE, 0, MUR_Y);
  g.addColorStop(0, 'rgba(200,160,80,0)'); g.addColorStop(1, `rgba(200,160,80,${0.12 + 0.035 * G.bat.temple})`);
  ctx.fillStyle = g; ctx.fillRect(0, MUR_Y - AURA_TEMPLE, W, AURA_TEMPLE);
  ctx.strokeStyle = 'rgba(160,115,40,0.55)'; ctx.lineWidth = 2;
  for (let k = 0; k < 2; k++) {
    const ph = (t * 0.35 + k * 0.5) % 1, y = MUR_Y - 20 - ph * (AURA_TEMPLE - 20);
    ctx.globalAlpha = 1 - ph; ctx.beginPath(); ctx.moveTo(cheminCentre(y) - cheminDemi(y), y); ctx.quadraticCurveTo(W / 2, y - 14, cheminCentre(y) + cheminDemi(y), y); ctx.stroke();
  }
  ctx.restore();
}
// dragon d'encre : corps ondulant en coups de pinceau, crinière rouge
// ---------------------------------------------------------------------
//  Dragon dessiné (assets/dragon.webp, fond magenta) : 8 battements d'ailes, tourné vers la droite.
//  Le magenta est retiré selon la « magentitude » (min(R,B) − V) et sa couleur est ôtée des bords.
//  Chaque image est recalée sur le bout de son museau (le point qui frappe la rangée).
// ---------------------------------------------------------------------
const DRAGON_SPRITE = { src: 'assets/dragon.webp', ips: 11, echelle: 0.9, ligneCorps: 330 };
let imagesDragon = null;
{ const img = new Image(); img.onload = () => { try { imagesDragon = preparerDragon(img); } catch (e) { imagesDragon = null; } }; img.src = DRAGON_SPRITE.src; }
function preparerDragon(img) {
  const iw = img.width, ih = img.height, c = creerCanvas(iw, ih), k = c.getContext('2d');
  k.drawImage(img, 0, 0);
  const id = k.getImageData(0, 0, iw, ih), d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const m = Math.min(d[i], d[i + 2]) - d[i + 1];             // magentitude : 255 sur le fond, ~0 sur le dragon
    const a = 1 - clamp((m - 60) / 130, 0, 1);
    if (a <= 0) { d[i + 3] = 0; continue; }
    if (a < 1) { // on retire la part de magenta mélangée au bord
      d[i] = clamp((d[i] - (1 - a) * 255) / a, 0, 255); d[i + 2] = clamp((d[i + 2] - (1 - a) * 255) / a, 0, 255);
    }
    // liseré violet résiduel : on retire l'excès de rouge+bleu (le contour redevient gris d'encre)
    const m2 = Math.min(d[i], d[i + 2]) - d[i + 1];
    if (m2 > 0) { d[i] -= m2; d[i + 2] -= m2; }
    d[i + 3] = Math.round(a * 255);
  }
  k.putImageData(id, 0, 0);
  const visible = x => { for (let y = 0; y < ih; y++) if (d[(y * iw + x) * 4 + 3] > 120) return true; return false; };
  const cadres = []; let deb = -1;
  for (let x = 0; x <= iw; x++) {
    const v = x < iw && visible(x);
    if (v && deb < 0) deb = x;
    if (!v && deb >= 0) { if (x - deb > 60) cadres.push([deb, x - 1]); deb = -1; }
  }
  return cadres.slice(0, 8).map(([L, R]) => {
    let haut = ih, bas = 0;
    for (let y = 0; y < ih; y++) for (let x = L; x <= R; x++) if (d[(y * iw + x) * 4 + 3] > 120) { haut = Math.min(haut, y); bas = Math.max(bas, y); }
    const w = R - L + 1, h = bas - haut + 1, im = creerCanvas(w, h);
    im.getContext('2d').drawImage(c, L, haut, w, h, 0, 0, w, h);
    // point d'ancrage : le bout du museau (bord droit) à hauteur du corps
    return { img: im, ax: w, ay: DRAGON_SPRITE.ligneCorps - haut };
  });
}
function dessinerDragon() {
  const d = G.dragon; if (!d || d.trace.length < 2) return;
  if (imagesDragon && imagesDragon.length) {
    const p = Math.max(0.8, perspective(d.y)), tr = d.trace, h = tr[0];
    // sillage d'encre léger derrière lui
    ctx.save(); ctx.lineCap = 'round';
    for (let k = tr.length - 1; k > 6; k--) {
      ctx.globalAlpha = 0.12 * (1 - k / tr.length); ctx.strokeStyle = ENCRE; ctx.lineWidth = 10 * p;
      ctx.beginPath(); ctx.moveTo(tr[k].x, tr[k].y); ctx.lineTo(tr[k - 1].x, tr[k - 1].y); ctx.stroke();
    }
    ctx.restore();
    const im = imagesDragon[Math.floor(G.t * DRAGON_SPRITE.ips + d.dir) % imagesDragon.length], e = DRAGON_SPRITE.echelle * p;
    ctx.save(); ctx.translate(h.x, h.y); ctx.scale(d.dir * e, e);
    ctx.drawImage(im.img, -im.ax, -im.ay);
    ctx.restore();
    return;
  }
  const p = Math.max(0.8, perspective(d.y)) * 1.15, tr = d.trace;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let k = tr.length - 1; k > 0; k--) {
    const w = (4 + 18 * Math.sin(Math.PI * (1 - k / tr.length) * 0.9 + 0.25)) * p;
    ctx.strokeStyle = ENCRE; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(tr[k].x, tr[k].y); ctx.lineTo(tr[k - 1].x, tr[k - 1].y); ctx.stroke();
    if (k % 4 === 0) { ctx.strokeStyle = ROUGE; ctx.lineWidth = 2.5 * p; ctx.beginPath(); ctx.moveTo(tr[k].x, tr[k].y - w * 0.45); ctx.lineTo(tr[k].x - d.dir * 8 * p, tr[k].y - w * 0.45 - 9 * p); ctx.stroke(); }
  }
  const h = tr[0];
  ctx.translate(h.x, h.y); ctx.scale(d.dir * p, p);
  ctx.fillStyle = ENCRE; ctx.beginPath(); ctx.moveTo(-6, -12); ctx.quadraticCurveTo(22, -14, 30, 0); ctx.quadraticCurveTo(18, 10, -6, 12); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = ENCRE; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(14, -10); ctx.quadraticCurveTo(4, -26, -12, -22); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(26, 2); ctx.quadraticCurveTo(40, 10, 34, 22); ctx.stroke();
  ctx.fillStyle = ROUGE; ctx.beginPath(); ctx.arc(14, -4, 3, 0, 7); ctx.fill();
  ctx.restore();
}
function dessinerCarreaux() {
  ctx.strokeStyle = ENCRE; ctx.fillStyle = ENCRE; ctx.lineCap = 'round';
  for (const c of G.carreaux) {
    const v = Math.hypot(c.vx, c.vy) || 1, ux = c.vx / v, uy = c.vy / v;
    ctx.globalAlpha = 0.25; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(c.x - ux * 22, c.y - uy * 22); ctx.lineTo(c.x - ux * 48, c.y - uy * 48); ctx.stroke(); ctx.globalAlpha = 1;
    ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x - ux * 24, c.y - uy * 24); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(c.x + ux * 6, c.y + uy * 6); ctx.lineTo(c.x - uy * 4, c.y + ux * 4); ctx.lineTo(c.x + uy * 4, c.y - ux * 4); ctx.fill();
  }
}
// samouraï à l'encre, vu de dos face à la vallée : hakama, ceinture rouge, chignon, katana
function dessinerSamouraiSprite(s, p) {
  const PS = PLANCHES_SAMOURAI;
  let P, col, ligne = 0;
  if (s.coup > 0) { // frappe : 8 images sur la durée du coup
    col = Math.min(7, Math.floor((1 - s.coup / SAMOURAI_COUP) * 8));
    if (s.cote) { P = s.dir > 0 ? PS.d : PS.g; ligne = 2; } else P = PS.dos;
  } else if (s.bouge) { P = s.dir > 0 ? PS.d : PS.g; ligne = 1; col = Math.floor(s.marche || 0) % 8; }
  else { P = PS.dos; col = 0; } // en garde, face à la vallée
  const pd = Array.isArray(P.pieds[0]) ? P.pieds[ligne] : P.pieds, e = P.echelle * p;
  ctx.drawImage(P.img, col * P.cw, ligne * P.ch, P.cw, P.ch, s.x - pd[0] * e, s.y - pd[1] * e, P.cw * e, P.ch * e);
}
function dessinerSamourais() {
  const planches = PLANCHES_SAMOURAI.dos.img && PLANCHES_SAMOURAI.g.img && PLANCHES_SAMOURAI.d.img;
  for (const s of G.samourais) {
    if (s.mort) continue;
    const p = perspective(s.y);
    if (planches) {
      ctx.fillStyle = 'rgba(40,30,28,0.18)'; ctx.beginPath(); ctx.ellipse(s.x, s.y, 15 * p, 4 * p, 0, 0, 7); ctx.fill();
      dessinerSamouraiSprite(s, p);
    } else {
    ctx.save(); ctx.translate(s.x, s.y); ctx.scale(p * s.dir, p);
    ctx.fillStyle = 'rgba(40,30,28,0.18)'; ctx.beginPath(); ctx.ellipse(0, 0, 14, 4, 0, 0, 7); ctx.fill();
    ctx.fillStyle = ENCRE; ctx.strokeStyle = ENCRE; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-11, 0); ctx.lineTo(-7, -16); ctx.lineTo(7, -16); ctx.lineTo(11, 0); ctx.closePath(); ctx.fill(); // hakama
    ctx.beginPath(); ctx.moveTo(-9, -16); ctx.lineTo(-11, -30); ctx.lineTo(11, -30); ctx.lineTo(9, -16); ctx.closePath(); ctx.fill(); // torse
    ctx.fillStyle = ROUGE; ctx.fillRect(-9, -19, 18, 4); // obi
    ctx.fillStyle = ENCRE; ctx.beginPath(); ctx.arc(0, -35, 5.5, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(0, -41.5, 2.5, 0, 7); ctx.fill();
    // katana : levé au repos, balayage pendant le coup
    const a = s.coup > 0 ? -1.4 + (1 - s.coup / SAMOURAI_COUP) * 2.6 : -0.35;
    ctx.save(); ctx.translate(9, -26); ctx.rotate(a);
    ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -5); ctx.stroke();
    ctx.strokeStyle = PAPIER; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -5); ctx.quadraticCurveTo(2, -16, 1, -26); ctx.stroke();
    ctx.strokeStyle = ENCRE; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.restore();
    if (s.coup > 0) { ctx.strokeStyle = 'rgba(243,228,207,0.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(8, -24, 22, -2.2, -0.2); ctx.stroke(); }
    ctx.restore();
    }
    if (s.pv < s.max) {
      const w = 26 * p; ctx.lineCap = 'round'; ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(27,23,25,0.3)'; ctx.beginPath(); ctx.moveTo(s.x - w / 2, s.y - 62 * p); ctx.lineTo(s.x + w / 2, s.y - 62 * p); ctx.stroke();
      ctx.strokeStyle = '#3f7d3a'; ctx.beginPath(); ctx.moveTo(s.x - w / 2, s.y - 62 * p); ctx.lineTo(s.x - w / 2 + w * clamp(s.pv / s.max, 0, 1), s.y - 62 * p); ctx.stroke();
    }
  }
}
// faucons : silhouettes d'oiseau (planche du corbeau), perchés sur le pavillon ou en piqué
function dessinerFaucons() {
  for (const fa of G.faucons) {
    const img = planchesCorbeau[fa.vx >= 0 ? 'd' : 'g']; if (!img) continue;
    const ech = fa.etat === 'perche' ? 0.2 : 0.26, col = fa.etat === 'perche' ? 3 : Math.floor(fa.ph) % 8;
    const w = CORBEAU.cw * ech, h = CORBEAU.ch * ech;
    ctx.drawImage(img, col * CORBEAU.cw, 0, CORBEAU.cw, CORBEAU.ch, fa.x - w / 2, fa.y - h / 2, w, h);
  }
}
function dessinerArcher(a, i) {
  const p = posteArcher(i);
  if (archersImperiaux() && planchesImperiales.d && planchesImperiales.g) { dessinerArcherImperial(a, i, p); return; }
  if (!plancheArcher) { ctx.drawImage(spritesArcher[i % 3][a.tir > 0 ? 1 : 0], p.x - 18, p.y - 42); return; }
  if (a.anim < 0 && (a.attente || !G.ennemis.length) && plancheAttente) {
    // au repos : boucle d'attente, décalée d'un archer à l'autre ; tournée vers le dernier côté visé
    const A = ATTENTE, col = Math.floor(G.t * A.ips + i * 2.7) % 8, s = A.echelle;
    ctx.save(); ctx.translate(p.x, p.y + 2); ctx.scale(a.dir < 0 ? -s : s, s);
    ctx.drawImage(plancheAttente, col * A.cw, A.ligne * A.ch, A.cw, A.ch, -A.pieds[0], -A.pieds[1], A.cw, A.ch);
    ctx.restore();
    return;
  }
  let ligne, col;
  if (a.anim >= 0) {
    const f = Math.min(7, Math.floor(a.anim / TIR_DUREE * 8));
    ligne = a.dir > 0 ? 1 : 3; col = a.dir > 0 ? f : ORDRE_TIR_GAUCHE[f];
  } else {
    ligne = a.dir > 0 ? 0 : 2; col = a.dir > 0 ? a.vise : 7 - a.vise;
  }
  const C = PLANCHE.cell, s = PLANCHE.echelle, [px, py] = PLANCHE.pieds[ligne];
  ctx.drawImage(plancheArcher, col * C, ligne * C, C, C, p.x - px * s, p.y + 2 - py * s, C * s, C * s);
}
const fissures = [];
for (let i = 0; i < 34; i++) {
  let x = rand(10, W - 10), y = murHaut(x) + rand(6, 50);
  const pts = [[x, y]];
  for (let k = 0; k < 5; k++) { x += rand(-9, 9); y += rand(-6, 9); pts.push([x, clamp(y, murHaut(x) + 2, murHaut(x) + MUR_FACE - 2)]); }
  fissures.push(pts);
}

const ZONE_PV = { x: W / 2 - 130, y: MUR_Y + 46 - 33, w: 260, h: 66 };
function dessinerPV() {
  const cx = W / 2, y = MUR_Y + 46;
  ctx.drawImage(swashPV, cx - 130, y - 33);
  coeur(cx - 62, y - 9, 8, PAPIER);
  texte(`${Math.ceil(G.mur.pv)} / ${G.mur.max}`, cx + 10, y - 9, 19, PAPIER, 'center', 'bold');
  const f = clamp(G.mur.pv / G.mur.max, 0, 1);
  ctx.drawImage(barrePVfond, cx - 89, y + 5);
  if (f > 0.01) ctx.drawImage(barrePV, 0, 0, 178 * f, 14, cx - 89, y + 5, 178 * f, 14);
  if (dedans(souris, ZONE_PV) && !G.pause) {
    const c = ACTIONS.reparer.cout();
    texte(G.mur.pv < G.mur.max ? `${TACTILE ? 'Toucher' : 'Cliquer'} : réparer +10 % (${nombre(c)} encre)` : 'Muraille intacte', cx, y + 34, 13, G.or >= c ? '#f0d69a' : '#ff8a7a', 'center', 'italic bold', SERIF);
  }
}

function dessinerCartes() {
  BATIMENTS.forEach((b, i) => {
    const r = rectCarte(i), l = G.bat[b.id], max = l >= b.max, pres = max && PRESTIGE[b.id];
    const cout = max ? (pres ? prestigeCout(b.id) : 0) : b.cout(l);
    const choisi = G.choix === i, survol = dedans(souris, r) && !G.pause;
    const dy = choisi ? -6 : survol ? -3 : 0;
    ctx.drawImage(imagesCartes[b.id], r.x - 6, r.y - 6 + dy);
    // icône noire si l'amélioration est abordable (ou le bâtiment au maximum), grise sinon :
    // l'encre posée à 35 % sur le parchemin donne un gris
    ctx.globalAlpha = (max && !pres) || G.or >= cout ? 1 : 0.35;
    ctx.drawImage(iconesCartes[b.id], r.x + r.w / 2 - ICONE_W / 2, r.y + ICONE_Y - ICONE_H / 2 - 2 + dy);
    ctx.globalAlpha = 1;
    if (choisi) ctx.drawImage(cadreChoix, r.x - 12, r.y - 12 + dy);
    // niveaux
    for (let k = 0; k < b.max; k++) {
      const px = r.x + r.w / 2 + (k - (b.max - 1) / 2) * 10, py = r.y + 12 + dy;
      ctx.fillStyle = ENCRE; ctx.strokeStyle = ENCRE; ctx.lineWidth = 1;
      if (k < l) { ctx.beginPath(); ctx.arc(px, py, 3.2, 0, 7); ctx.fill(); }
      else { ctx.globalAlpha = 0.45; ctx.beginPath(); ctx.arc(px, py, 2.8, 0, 7); ctx.stroke(); ctx.globalAlpha = 1; }
    }
    // Caserne : la pastille reste tant qu'il y a des archers à recruter (même sans assez d'encre)
    const archersARecruter = b.id === 'caserne' && ACTIONS.archer.dispo();
    const pastille = () => { ctx.fillStyle = ROUGE; ctx.beginPath(); ctx.arc(r.x + r.w - 8, r.y + 8 + dy, 5, 0, 7); ctx.fill(); };
    if (max && !pres) { ctx.drawImage(sceau, r.x + r.w / 2 - 23, r.y + 88 + dy); if (archersARecruter) pastille(); }
    else {
      const ok = G.or >= cout, txt = nombre(cout);
      ctx.font = fonte('bold', 14, SANS); const tw = ctx.measureText(txt).width;
      goutteIcone(ctx, r.x + r.w / 2 - tw / 2 - 6, r.y + 97 + dy, 6, ok ? ENCRE : ROUGE);
      texte(txt, r.x + r.w / 2 - tw / 2 + 4, r.y + 98 + dy, 14, ok ? ENCRE : ROUGE, 'left', 'bold');
      if (pres && prestige(b.id)) texte(`★${prestige(b.id)}`, r.x + 10, r.y + 13 + dy, 12, '#a8641c', 'left', 'bold');
      // pastille si l'amélioration ou l'action associée est possible
      const act = ACTION_DE[b.id] && ACTIONS[ACTION_DE[b.id]];
      if (ok || (act && act.dispo() && G.or >= act.cout()) || talentPossible(b.id) || archersARecruter) pastille();
    }
  });
}

let survolCarte = { i: -1, t: 0 };
const fichesFondues = {}; // papier de la fiche, par taille (préparé une fois)
function dessinerFicheCarte() {
  let i = G.infoCarte;
  if ((i === null || i === undefined) && !TACTILE && G.choix === null && !G.pause) {
    const sous = carteSous(souris);
    if (sous !== survolCarte.i) survolCarte = { i: sous, t: performance.now() };
    if (sous >= 0 && performance.now() - survolCarte.t > 600) i = sous;
  }
  if (i === null || i === undefined || i < 0) return;
  const b = BATIMENTS[i], l = G.bat[b.id], c = rectCarte(i), w = TACTILE ? 470 : 400, ta = TALENTS[b.id];
  const lignes = [
    ...lignesDe(b.resume, w - 40, `italic 15px ${SERIF}`).map(t => ({ t, s: 'italic', c: '#3a3230' })),
    ...lignesDe(l >= b.max && PRESTIGE[b.id] ? PRESTIGE[b.id].info(prestige(b.id)) : b.info(l), w - 40, `14px ${SERIF}`).map(t => ({ t, s: '', c: ENCRE })),
    ...(ta ? lignesDe(`✦ Talent ${ta.nom} (${ta.cout} cristaux) : ${ta.desc}`, w - 40, `14px ${SERIF}`).map(t => ({ t, s: '', c: '#34507a' })) : []),
  ].slice(0, 7);
  const h = 52 + lignes.length * 19, x = clamp(c.x + c.w / 2 - w / 2, 10, W - 10 - w), y = c.y - h - 16, m = 22;
  const cle = (w + 2 * m) + 'x' + (h + 2 * m), fiche = fichesFondues[cle] || (fichesFondues[cle] = papierFondu(w + 2 * m, h + 2 * m, 30));
  ctx.drawImage(fiche, x - m, y - m);
  texte(`${b.nom}  ·  niveau ${l} / ${b.max}`, x + 20, y + 24, 18, ENCRE, 'left', 'bold');
  lignes.forEach((li, k) => texte(li.t, x + 20, y + 50 + k * 19, li.s === 'italic' ? 15 : 14, li.c, 'left', li.s, SERIF));
}
function dessinerPanneau() {
  dessinerFicheCarte();
  if (G.choix === null) return;
  const i = G.choix, b = BATIMENTS[i], l = G.bat[b.id], pr = panneauRect(i);
  ctx.drawImage(parchemin(pr.w, pr.h), pr.x - 10, pr.y - 10);
  texte(`${b.nom}  ·  niveau ${l} / ${b.max}`, pr.x + 16, pr.y + 18, TACTILE ? 19 : 17, ENCRE, 'left', 'bold');
  const boutons = boutonsPanneau(i);
  const surTalent = boutons.some(bt => bt.talent && dedans(souris, bt.r));
  const info = surTalent ? `✦ ${TALENTS[b.id].desc}` : (l >= b.max && PRESTIGE[b.id] ? PRESTIGE[b.id].info(prestige(b.id)) : b.info(l));
  lignesDe(info, pr.w - 32, `italic ${TACTILE ? 15 : 14}px ${SERIF}`).slice(0, 2).forEach((li, k) =>
    texte(li, pr.x + 16, pr.y + 40 + k * (TACTILE ? 19 : 17), TACTILE ? 15 : 14, surTalent ? '#34507a' : ENCRE, 'left', 'italic', SERIF, pr.w - 30));
  for (const bt of boutons) {
    const r = bt.r, survol = dedans(souris, r);
    const img = bt.talent ? boutonCristal(r.w, r.h, bt.ok) : boutonEncre(r.w, r.h, bt.ok);
    ctx.drawImage(img, r.x - 6, r.y - 4 + (survol && bt.ok ? -1 : 0));
    const coul = bt.ok ? PAPIER : '#f3ece2';
    const pf = PB.police;
    if (bt.cout === null) texte(bt.libelle, r.x + r.w / 2, r.y + r.h / 2, pf, coul, 'center', 'bold', SANS, r.w - 12);
    else {
      texte(bt.libelle, r.x + 10, r.y + r.h / 2, pf, coul, 'left', 'bold', SANS, r.w - 74);
      if (bt.cristal) cristalIcone(ctx, r.x + r.w - 56, r.y + r.h / 2 - 1, 6, coul);
      else goutteIcone(ctx, r.x + r.w - 56, r.y + r.h / 2 - 1, 6, coul);
      texte(String(bt.cout), r.x + r.w - 46, r.y + r.h / 2, pf, coul, 'left', 'bold');
    }
  }
}

function dessinerHUD() {
  ctx.drawImage(swashVague, 4, 4);
  epeesCroisees(42, 35, PAPIER);
  texte(`Vague ${vague(G.t)}`, 70, 35, 22, PAPIER, 'left', 'bold');
  ctx.font = fonte('bold', 22, SANS);
  const xs = 78 + ctx.measureText(`Vague ${vague(G.t)}`).width;
  sablier(xs + 8, 35, '#cdbca3');
  texte(formatTemps(G.t), xs + 20, 36, 15, '#cdbca3', 'left', 'bold');
  // moment du cycle : soleil rouge le jour, croissant de lune la nuit (fondu entre les deux)
  ctx.font = fonte('bold', 15, SANS);
  const xm = Math.min(232, xs + 30 + ctx.measureText(formatTemps(G.t)).width), nuitHud = niveauNuit(G.t);
  if (nuitHud < 1) { ctx.globalAlpha = 1 - nuitHud; ctx.fillStyle = ROUGE; ctx.beginPath(); ctx.arc(xm, 35, 6.5, 0, 7); ctx.fill(); }
  if (nuitHud > 0) {
    ctx.globalAlpha = nuitHud; ctx.fillStyle = '#efe7cf';
    ctx.beginPath(); ctx.arc(xm, 35, 7, 0, 7); ctx.fill();
    ctx.fillStyle = ENCRE; ctx.beginPath(); ctx.arc(xm + 3.5, 32.5, 6, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.drawImage(swashRessources, W - 64 - 290, 4);
  const x0 = W - 64 - 290;
  goutteIcone(ctx, x0 + 40, 36, 10, PAPIER);
  texte(nombre(G.or), x0 + 58, 35, 21, PAPIER, 'left', 'bold');
  const rev = revenuMine() + nv('dime');
  if (rev) { ctx.font = fonte('bold', 21, SANS); texte(`+${rev >= 10 ? Math.round(rev) : (Math.round(rev * 10) / 10).toLocaleString('fr-FR')}/s`, x0 + 62 + ctx.measureText(nombre(G.or)).width, 37, 12, '#d9c9b0', 'left', 'italic'); }
  cristalIcone(ctx, x0 + 200, 34, 9, '#dfe4ee', '#9fb0cc');
  texte(String(G.cristaux), x0 + 216, 35, 21, PAPIER, 'left', 'bold');
  if (dedans(souris, ZONE_CRISTAUX)) texte('Reliques (K)', W - 18, 150, 12, ENCRE, 'right', 'italic bold', SERIF);
  dessinerSorts();
  dessinerBoutonPause();
  const h = etatHorde(G.t);
  const nh = niveauNuit(G.t), sombre = nh > 0.6; // la nuit, le texte posé sur le ciel passe en clair
  dessinerBarreXP();
  if (G.defi) texte(`Défi : ${G.defi.modif.nom}`, 22, 122, 12, ROUGE, 'left', 'italic bold', SERIF);
  texte(h.horde ? 'La horde déferle !' : `Horde dans ${Math.ceil(h.dans)} s`, 22, 86, 13,
    h.horde ? (sombre ? '#ff7a66' : ROUGE) : (sombre ? '#dfe2f2' : ENCRE), 'left', 'italic bold', SERIF);
  if (nh > 0.05) {
    ctx.globalAlpha = Math.min(1, nh * 1.5);
    texte(`Nuit : monstres +${Math.round(NUIT_EFFETS.menace * nh * 100)} % · portée ${Math.round(NUIT_EFFETS.portee * nh * 100)} % · butin +${Math.round(NUIT_EFFETS.butin * nh * 100)} %`,
      22, 104, 12, nh > 0.6 ? '#dfe2f2' : '#2c3150', 'left', 'italic bold', SERIF);
    ctx.globalAlpha = 1;
  }
  dessinerBoutonVitesse();
  dessinerNiveauMusique();
}

function iconeSort(id, x, y, coul) {
  ctx.save(); ctx.translate(x, y); ctx.fillStyle = coul; ctx.strokeStyle = coul; ctx.lineCap = 'round';
  if (id === 'pluie') {
    for (const [dx, dy, s] of [[-7, -4, 5], [6, -7, 4.5], [0, 6, 5.5]]) goutteIcone(ctx, dx, dy, s, coul);
  } else if (id === 'brume') {
    ctx.lineWidth = 2.6;
    for (const [dy, w] of [[-7, 9], [0, 12], [7, 8]]) { ctx.beginPath(); ctx.moveTo(-w, dy); ctx.quadraticCurveTo(-w / 3, dy - 4, 0, dy); ctx.quadraticCurveTo(w / 3, dy + 4, w, dy); ctx.stroke(); }
  } else if (id === 'raz') {
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-13, 8); ctx.quadraticCurveTo(-8, -12, 6, -10); ctx.quadraticCurveTo(13, -9, 10, -2); ctx.quadraticCurveTo(4, -5, 3, 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-14, 11); ctx.lineTo(14, 11); ctx.stroke();
  } else if (id === 'rempart') {
    ctx.fillRect(-12, -2, 24, 12);
    for (const dx of [-12, -3, 6]) ctx.fillRect(dx, -9, 6, 8);
    ctx.fillStyle = ENCRE; ctx.fillRect(-1.5, 2, 3, 8);
  }
  ctx.restore();
}
function dessinerBoutonVitesse() {
  const b = BTN_VIT, actif = G.vitesse !== 1, survol = Math.hypot(souris.x - b.x, souris.y - b.y) < b.r + 2;
  ctx.fillStyle = actif ? ROUGE : ENCRE;
  ctx.beginPath(); ctx.arc(b.x, b.y - (survol ? 1 : 0), b.r, 0, 7); ctx.fill();
  // un triangle par cran de vitesse : ×1 ▶, ×2 ▶▶, ×3 ▶▶▶
  ctx.fillStyle = PAPIER;
  const plein = Math.floor(G.vitesse), demi = G.vitesse % 1 !== 0, lt = 6.5, ht = 4.5, y0 = b.y - 7;
  const largeur = plein * lt + (demi ? lt / 2 : 0);
  let x0 = b.x - largeur / 2;
  for (let i = 0; i < plein; i++, x0 += lt) {
    ctx.beginPath(); ctx.moveTo(x0, y0 - ht); ctx.lineTo(x0 + lt, y0); ctx.lineTo(x0, y0 + ht); ctx.fill();
  }
  if (demi) { // moitié gauche d'un triangle
    ctx.beginPath(); ctx.moveTo(x0, y0 - ht); ctx.lineTo(x0 + lt / 2, y0 - ht / 2); ctx.lineTo(x0 + lt / 2, y0 + ht / 2); ctx.lineTo(x0, y0 + ht); ctx.fill();
  }
  texte(libVitesse(), b.x, b.y + 6, 12, PAPIER, 'center', 'bold');
  if (survol) texte('Vitesse de jeu (V)', W - 18, 150, 12, ENCRE, 'right', 'italic bold', SERIF);
}
function dessinerSorts() {
  let aide = null;
  SORTS.forEach((s, i) => {
    const r = rectSort(i), pret = sortPret(s), rc = G.recharges[s.id];
    const survol = Math.hypot(souris.x - r.x, souris.y - r.y) < r.r + 3;
    ctx.save();
    ctx.globalAlpha = pret ? 1 : 0.55;
    ctx.drawImage(medaillon, r.x - 30, r.y - 30 + (survol && pret ? -2 : 0));
    iconeSort(s.id, r.x, r.y - 2, PAPIER);
    ctx.globalAlpha = 1;
    if (rc > 0) { // recharge : secteur de papier qui se résorbe
      ctx.fillStyle = 'rgba(243,228,207,0.6)';
      ctx.beginPath(); ctx.moveTo(r.x, r.y); ctx.arc(r.x, r.y, r.r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * rc / s.recharge); ctx.closePath(); ctx.fill();
      texte(String(Math.ceil(rc)), r.x, r.y, 15, ENCRE, 'center', 'bold');
    }
    // coût
    cristalIcone(ctx, r.x - 7, r.y + r.r + 7, 5, G.cristaux >= s.cout ? '#2c4268' : ROUGE);
    texte(String(s.cout), r.x + 1, r.y + r.r + 8, 13, G.cristaux >= s.cout ? ENCRE : ROUGE, 'left', 'bold');
    ctx.restore();
    if (survol) aide = `${s.nom} (${s.touche}) : ${s.desc}`;
  });
  if (aide) texte(aide, W - 18, 150, 13, ENCRE, 'right', 'italic bold', SERIF);
}

function dessinerJeu() {
  const t = G.t;
  const nuit = niveauNuit(t);
  ctx.drawImage(fond, 0, 0);
  if (nuit > 0.001 && Y_CIEL > 0) { ctx.globalAlpha = nuit; ctx.drawImage(cielNuit, 0, 0); ctx.globalAlpha = 1; }
  ctx.drawImage(premierPlan, 0, 0);
  ctx.drawImage(taches, 0, 0);
  for (const f of G.flaques) dessinerFlaque(ctx, f, 0.55 + 0.45 * Math.min(1, f.t / 0.6), t);
  for (const r of G.rochers) {
    const x = r.x0 + (r.x1 - r.x0) * r.t, y = r.y0 + (r.y1 - r.y0) * r.t;
    ctx.fillStyle = 'rgba(27,23,25,0.18)'; ctx.beginPath(); ctx.ellipse(x, y, 7, 3, 0, 0, 7); ctx.fill();
  }
  dessinerAuraTemple(t);
  dessinerBrasiers(t);
  dessinerPieux();
  G.ennemis.filter(e => !e.auMur && !e.combat).sort((a, b) => a.y - b.y).forEach(dessinerEnnemi);
  // la brume passe devant les monstres lointains et dérive doucement
  ctx.drawImage(brumeHorizon, Math.sin(t * 0.15) * 30 - 30, Y_CIEL > 0 ? Y_CIEL - 60 : 0, W + 60, brumeHorizon.height);
  dessinerDragon(); // le dragon vole au-dessus de la brume

  ctx.fillStyle = ENCRE;
  for (const g of G.gouttes) {
    const v = Math.hypot(g.vx, g.vy);
    ctx.beginPath(); ctx.ellipse(g.x, g.y, g.r * (1 + v / 120), g.r * 0.8, Math.atan2(g.vy, g.vx), 0, 7); ctx.fill();
  }
  ctx.lineCap = 'round';
  for (const o of G.ondes) {
    const p = o.t / 0.4;
    ctx.strokeStyle = ENCRE; ctx.globalAlpha = 0.8 * (1 - p); ctx.lineWidth = 6 * (1 - p) + 0.5;
    ctx.beginPath(); ctx.arc(o.x, o.y, o.zone * (0.3 + p * 0.7), 0.3, Math.PI * 2 - 0.2); ctx.stroke(); ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = ENCRE; ctx.fillStyle = ENCRE;
  for (const f of G.fleches) {
    const v = Math.hypot(f.vx, f.vy) || 1, ux = f.vx / v, uy = f.vy / v;
    if (f.feu) {
      const tr = ctx.createLinearGradient(f.x, f.y, f.x - ux * 30, f.y - uy * 30);
      tr.addColorStop(0, 'rgba(255,190,90,0.95)'); tr.addColorStop(0.35, 'rgba(230,90,30,0.7)'); tr.addColorStop(1, 'rgba(160,40,20,0)');
      ctx.strokeStyle = tr; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x - ux * 30, f.y - uy * 30); ctx.stroke();
      ctx.strokeStyle = ENCRE;
    }
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x - ux * 14, f.y - uy * 14); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(f.x + ux * 3, f.y + uy * 3); ctx.lineTo(f.x - uy * 2.4, f.y + ux * 2.4); ctx.lineTo(f.x + uy * 2.4, f.y - ux * 2.4); ctx.fill();
  }

  dessinerMuraille(t);
  // cycle jour/nuit : la vallée et la muraille prennent la teinte du moment (crépuscule orangé, bleu de lune)
  if (nuit > 0.001) {
    ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = teinteVallee(nuit);
    ctx.fillRect(0, 0, W, SOCLE_Y + 40); ctx.restore();
    if (Y_CIEL > 0) { ctx.globalAlpha = lisser((nuit - 0.35) / 0.65); ctx.drawImage(astresNuit, 0, 0); ctx.globalAlpha = 1; }
    lueursDeFeu(nuit);
  }
  dessinerCorbeaux();
  dessinerPV();

  for (const r of G.rochers) {
    const x = r.x0 + (r.x1 - r.x0) * r.t, y = r.y0 + (r.y1 - r.y0) * r.t, h = Math.sin(Math.PI * r.t) * 120;
    if (r.poudre && planchesBoulet) { dessinerBouletDragon(r, x, y - h); continue; }
    ctx.fillStyle = r.poudre ? ENCRE : '#4a3a2c'; ctx.strokeStyle = ENCRE; ctx.lineWidth = 1.6;
    cheminBlob(ctx, x, y - h, 6 + h / 40, 5 + h / 45, r.x0 + r.x1, t * 2, 0.15, 8); ctx.fill(); ctx.stroke();
    if (r.poudre) { ctx.fillStyle = Math.sin(t * 40) > 0 ? '#ffd66e' : ROUGE; ctx.beginPath(); ctx.arc(x + 5, y - h - 7, 2.2, 0, 7); ctx.fill(); }
  }
  // raz-de-marée dessiné : les images de vague, posées en « multiply » sur le chemin
  if (G.raz && G.raz.monte && imagesVague) {
    const n = imagesVague.images.length, u = G.raz.t / VAGUE.duree * n, i = Math.min(n - 1, Math.floor(u)), f = u - i;
    ctx.save(); ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(imagesVague.images[i], 0, imagesVague.yHaut);
    if (i + 1 < n && f > 0.6) { ctx.globalAlpha = (f - 0.6) / 0.4; ctx.drawImage(imagesVague.images[i + 1], 0, imagesVague.yHaut); } // fondu vers l'image suivante
    ctx.restore();
  }
  // raz-de-marée (secours) : un grand front d'encre qui descend la vallée
  else if (G.raz) {
    const y = G.raz.y, g = ctx.createLinearGradient(0, y - 90, 0, y + 10);
    g.addColorStop(0, 'rgba(27,23,25,0)'); g.addColorStop(0.75, 'rgba(27,23,25,0.55)'); g.addColorStop(1, 'rgba(27,23,25,0.9)');
    ctx.fillStyle = g; ctx.fillRect(0, y - 90, W, 100);
    // crête ondulante d'encre, surmontée de rouleaux d'écume (à la manière des vagues d'estampe)
    const crete = x => y - 4 - 11 * Math.sin(x * 0.045 + G.t * 5) - 5 * Math.sin(x * 0.13 - G.t * 8);
    ctx.fillStyle = ENCRE; ctx.beginPath(); ctx.moveTo(0, y + 22);
    for (let x = 0; x <= W; x += 6) ctx.lineTo(x, crete(x));
    ctx.lineTo(W, y + 22); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = PAPIER; ctx.lineCap = 'round';
    for (let x = 20; x < W; x += 46) {
      const yc = crete(x), r = 5 + 3 * Math.sin(x + G.t * 4);
      ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(x, yc + r + 1, r, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
      ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x + 8, yc + r + 6, r * 0.6, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    }
  }
  // pluie d'encre : gouttes qui tombent du ciel
  ctx.fillStyle = ENCRE;
  for (const g of G.pluie) {
    if (g.y < -20) continue;
    ctx.beginPath(); ctx.ellipse(g.x, g.y, g.r * 0.7, g.r * 3, 0, 0, 7); ctx.fill();
  }
  // brume : voile de lavis gris-bleu qui dérive
  if (G.brume > 0) {
    ctx.globalAlpha = Math.min(1, G.brume / 1.2, (BRUME_DUREE - G.brume) * 3 + 0.1);
    ctx.drawImage(brumeTex, -100 + Math.sin(t * 0.4) * 60, 0);
    ctx.drawImage(brumeTex, -40 - Math.sin(t * 0.3) * 50, 18);
    ctx.globalAlpha = 1;
  }
  // rempart : la muraille s'illumine
  if (G.rempartFlash > 0) {
    ctx.globalAlpha = G.rempartFlash / 0.8 * 0.5; ctx.fillStyle = '#fff6dc';
    ctx.fillRect(0, MUR_Y - 30, W, MUR_FACE + 40); ctx.globalAlpha = 1;
  }
  for (const passe of [0, 1]) for (const tx of G.textes) { // 1re passe : encre ; 2e passe : cristaux et PV, au-dessus
    if (tx.t < 0 || (passe === 0) !== !!tx.encre) continue;
    const a = clamp(1 - tx.t, 0, 1), y = tx.y - tx.t * 30;
    if (tx.encre) {
      ctx.globalAlpha = a * 0.75;
      goutteIcone(ctx, tx.x - 10, y, 4.5, ENCRE);
      texte(tx.txt, tx.x - 3, y + 1, 13, ENCRE, 'left', 'bold');
    } else {
      ctx.globalAlpha = a * 0.85;
      const halo = ctx.createRadialGradient(tx.x + 6, y, 2, tx.x + 6, y, 26);
      halo.addColorStop(0, 'rgba(243,232,210,0.9)'); halo.addColorStop(1, 'rgba(243,232,210,0)');
      ctx.fillStyle = halo; ctx.fillRect(tx.x - 22, y - 26, 56, 52);
      ctx.globalAlpha = a;
      if (tx.cristal) cristalIcone(ctx, tx.x - 11, y, 7.5, '#2c4268');
      else if (!tx.critique) coeur(tx.x - 11, y, 7, ROUGE);
      texte(tx.txt, tx.x - 1, y + 1, 17, tx.cristal ? '#2c4268' : ROUGE, 'left', 'bold');
    }
    ctx.globalAlpha = 1;
  }

  ctx.drawImage(socle, 0, OY_SOCLE);
  brasero(262, SOCLE_Y + 2, t); brasero(W - 262, SOCLE_Y + 2, t);
  if (nuit > 0.05) halosBraseros(t, nuit);
  dessinerCartes();
  if (refusAnim) {
    refusAnim.t += 1 / 60;
    const r = refusAnim.r;
    ctx.save(); ctx.globalAlpha = Math.max(0, 1 - refusAnim.t / 0.45);
    ctx.drawImage(cadreRouge(r.w, r.h), r.x - 12, r.y - 12);
    ctx.restore();
    if (refusAnim.t > 0.45) refusAnim = null;
  }
  dessinerPanneau();
  dessinerHUD();

  if (G.banniere) {
    const b = G.banniere, a = clamp(Math.min(b.t * 4, (2.5 - b.t) * 2), 0, 1);
    ctx.globalAlpha = a;
    ctx.drawImage(b.bandeau, W / 2 - 300, 330 - 48);
    texte(b.txt, W / 2, 331, 30, PAPIER, 'center', 'bold');
    ctx.globalAlpha = 1;
  }
}

// Nuit : flèches enflammées et monstres en feu éclairent l'obscurité (lueur proportionnelle à la nuit)
function lueur(x, y, r, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(255,180,90,${a})`); g.addColorStop(0.35, `rgba(240,110,40,${a * 0.45})`); g.addColorStop(1, 'rgba(240,110,40,0)');
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
}
function lueursDeFeu(nuit) {
  if (nuit < 0.05) return;
  ctx.save(); ctx.globalCompositeOperation = 'screen';
  for (const f of G.fleches) if (f.feu) {
    const v = Math.hypot(f.vx, f.vy) || 1;
    lueur(f.x - f.vx / v * 8, f.y - f.vy / v * 8, 26, 0.8 * nuit);
  }
  for (const b of G.brasiers) lueur(b.x, b.y, b.zone * 1.6, 0.6 * nuit * Math.min(1, b.t));
  if (G.bat.sanctuaire) for (let i = 0; i < Math.min(6, 1 + G.bat.sanctuaire); i++) { const x = POSTES_LANTERNES[i]; lueur(x, murHaut(x) - 30, 70, 0.75 * nuit); }
  for (const e of G.ennemis) if (e.brule > 0 && !e.mort) {
    const pl = PLANCHES_MONSTRES[e.k], h = pl ? pl.hauteur * pl.echelle : e.taille * 2;
    const p = perspective(pieds(e)), y = pieds(e) - h * 0.45 * p;
    lueur(e.x, y, (30 + h * 0.6) * p, 0.7 * nuit * Math.min(1, e.brule) * (0.85 + 0.15 * Math.sin(G.t * 11 + e.seed)));
  }
  ctx.restore();
}
// Nuit : les braseros projettent un halo chaud sur la muraille (intensité selon la nuit)
function halosBraseros(t, nuit) {
  ctx.save(); ctx.globalCompositeOperation = 'screen';
  for (const x of [262, W - 262]) {
    const r = 150 + Math.sin(t * 7 + x) * 6, y = SOCLE_Y - 30;
    const g = ctx.createRadialGradient(x, y, 8, x, y, r);
    g.addColorStop(0, `rgba(255,160,70,${0.55 * nuit})`); g.addColorStop(0.4, `rgba(230,110,40,${0.22 * nuit})`); g.addColorStop(1, 'rgba(230,110,40,0)');
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.restore();
}
function voile() { ctx.fillStyle = 'rgba(243,228,207,0.84)'; ctx.fillRect(0, -DC, W, H + 2 * DC); }

// Barre d'expérience, juste sous la traînée « Vague N » (claire la nuit, quand elle est posée sur le ciel)
function dessinerBarreXP() {
  const sombre = niveauNuit(G.t) > 0.6, x = 72, y = 64, w = 150, f = clamp(G.xp / xpPourNiveau(G.niveau), 0, 1);
  texte(`Niv. ${G.niveau}`, 22, y + 2, 14, sombre ? '#f0d69a' : '#7a4a14', 'left', 'bold');
  ctx.lineCap = 'round';
  ctx.strokeStyle = sombre ? 'rgba(240,214,154,0.25)' : 'rgba(27,23,25,0.18)'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(x, y + 2); ctx.lineTo(x + w, y + 2); ctx.stroke();
  if (f > 0.01) {
    ctx.strokeStyle = sombre ? '#f0c060' : '#c47f1e'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(x, y + 2); ctx.lineTo(x + w * f, y + 2); ctx.stroke();
  }
}

const rectCarteNiveau = (i, n) => { const w = 196, g = 18, x0 = W / 2 - (n * w + (n - 1) * g) / 2; return { x: x0 + i * (w + g), y: 360, w, h: 250 }; };
function iconeAmelio(type, x, y) {
  ctx.save();
  if (type === 'arc' || type === 'oeil') {
    ctx.strokeStyle = ENCRE; ctx.fillStyle = ENCRE; ctx.lineCap = 'round';
    ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(x - 6, y, 22, -1.2, 1.2); ctx.stroke();
    ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x + 2, y - 20); ctx.lineTo(x - 14, y); ctx.lineTo(x + 2, y + 20); ctx.stroke();
    ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(x - 16, y); ctx.lineTo(x + 26, y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 32, y); ctx.lineTo(x + 22, y - 5); ctx.lineTo(x + 22, y + 5); ctx.fill();
    if (type === 'oeil') { ctx.fillStyle = ROUGE; ctx.beginPath(); ctx.arc(x + 34, y - 14, 5, 0, 7); ctx.fill(); }
  } else if (type === 'cata') {
    ctx.fillStyle = '#4a3a2c'; ctx.strokeStyle = ENCRE; ctx.lineWidth = 2;
    cheminBlob(ctx, x, y, 18, 15, 4, 0, 0.15, 10); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 2.5; for (const [dx, dy] of [[-28, -14], [-30, 2], [-26, 16]]) { ctx.beginPath(); ctx.moveTo(x + dx, y + dy); ctx.lineTo(x + dx + 8, y + dy * 0.8); ctx.stroke(); }
  } else if (type === 'mur') {
    ctx.fillStyle = ENCRE;
    for (let r = 0; r < 3; r++) for (let i = 0; i < 3; i++) { const bx = x - 30 + i * 21 + (r % 2 ? -10 : 0); if (bx >= x - 32) ctx.fillRect(bx, y - 16 + r * 12, 19, 10); }
    coeur(x + 24, y - 20, 9, ROUGE);
  } else if (type === 'encre') {
    goutteIcone(ctx, x, y + 2, 22, ENCRE);
  } else if (type === 'cristal') {
    cristalIcone(ctx, x, y - 6, 18, '#2c4268', ENCRE);
  } else if (type === 'sort') {
    ctx.drawImage(medaillon, x - 30, y - 30); iconeSort('pluie', x, y - 2, PAPIER);
  } else if (type === 'sabre') {
    ctx.translate(x, y); ctx.strokeStyle = ENCRE; ctx.lineCap = 'round';
    ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-22, 20); ctx.lineTo(-12, 10); ctx.stroke();
    ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-17, 6); ctx.lineTo(-6, 17); ctx.stroke();
    ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-12, 10); ctx.quadraticCurveTo(10, -6, 24, -24); ctx.stroke();
    ctx.fillStyle = ROUGE; ctx.fillRect(-26, 16, 6, 6);
  } else if (type === 'faucon') {
    const img = planchesCorbeau.d; if (img) ctx.drawImage(img, 4 * CORBEAU.cw, 0, CORBEAU.cw, CORBEAU.ch, x - 34, y - 42, 68, 84);
  } else if (type === 'feu') {
    flamme(x, y + 22, G.t * 3, 1.9);
  }
  ctx.restore();
}
// coupe un texte en lignes d'au plus « maxW » pixels
function lignesDe(txt, maxW, police) {
  if (LOUPE > 1) police = police.replace(/(d+(?:.d+)?)px/, (m, t) => (+t < 15 ? Math.min(15, +t * LOUPE) : +t) + 'px');
  { const m = police.match(/^(.*?)(\d+(?:\.\d+)?)px (.*)$/); if (m) police = fonte(m[1].trim(), +m[2], m[3]); }
  ctx.font = police; const mots = txt.split(' '), lignes = []; let l = '';
  for (const m of mots) { const essai = l ? l + ' ' + m : m; if (ctx.measureText(essai).width > maxW && l) { lignes.push(l); l = m; } else l = essai; }
  if (l) lignes.push(l); return lignes;
}
// =====================================================================
//  TUTORIEL : les conseils du maître d'armes, pendant les premières parties. Chaque conseil apparaît une seule fois,
//  au moment où il devient utile (son déclencheur) : le jeu se fige, la zone concernée est éclairée (le reste voilé),
//  une bulle de papier explique. « Compris » (ou Entrée / Espace / Échap) continue ; « Passer le tutoriel » coupe tout.
//  Mémorisé dans le navigateur : localStorage 'muraille-tuto' (liste des conseils vus, ou 'fini'). Options → Tutoriel.
// =====================================================================
const ZONE_ENCRE = { x: W - 354, y: 12, w: 176, h: 46 };
const ZONE_XP = { x: 14, y: 50, w: 216, h: 30 };
const ZONE_HORDE = { x: 14, y: 75, w: 230, h: 22 };
const zoneSorts = () => { const a = rectSort(0), b = rectSort(SORTS.length - 1); return { x: a.x - a.r - 4, y: a.y - a.r - 4, w: b.x - a.x + 2 * a.r + 8, h: 2 * a.r + 8 }; };
const zoneCartes = () => { const a = rectCarte(0), b = rectCarte(BATIMENTS.length - 1); return { x: a.x - 4, y: a.y - 4, w: b.x + b.w - a.x + 8, h: a.h + 8 }; };
const coutMinCarte = () => Math.min(...BATIMENTS.map(b => G.bat[b.id] < b.max ? b.cout(G.bat[b.id]) : Infinity));
const TUTO = [
  { id: 'encre', titre: "L'encre", quand: () => G.t > 1.5, zones: () => [ZONE_ENCRE],
    texte: () => "Vos archers tirent tout seuls. Chaque monstre abattu se liquéfie en encre : c'est votre monnaie, pour bâtir, recruter et réparer." },
  { id: 'cartes', titre: 'Les bâtiments', quand: () => G.t > 6 && G.or >= coutMinCarte(), zones: () => [zoneCartes()],
    texte: () => `Vous avez assez d'encre pour bâtir ! ${CLIQUEZ} une carte pour ouvrir son panneau. Chaque bâtiment se renforce niveau après niveau.` },
  { id: 'panneau', titre: 'Améliorer', quand: () => G.choix !== null, zones: () => [panneauRect(G.choix)],
    texte: () => "« Améliorer » fait monter le bâtiment d'un niveau, contre de l'encre. L'autre bouton lance son action : recruter un archer, tirer à la catapulte… Les prix montent à chaque niveau." },
  { id: 'muraille', titre: 'La muraille', quand: () => G.mur.pv < G.mur.max * 0.8, zones: () => [ZONE_PV],
    texte: () => `Les monstres frappent la muraille. ${CLIQUEZ} sa barre de vie pour la réparer contre de l'encre. Si elle tombe, la partie est perdue.` },
  { id: 'niveau', titre: "L'expérience", quand: () => G.niveau > 1 || G.xp >= xpPourNiveau(G.niveau) * 0.5, zones: () => [ZONE_XP],
    texte: () => "Les monstres donnent aussi de l'expérience (la barre dorée). À chaque niveau gagné, le jeu s'arrête : choisissez une amélioration parmi les cartes proposées." },
  { id: 'cristaux', titre: 'Les cristaux', quand: () => G.cristaux > 0, zones: () => [ZONE_CRISTAUX, zoneSorts()],
    texte: () => `Des cristaux ! Plus rares que l'encre, ils tombent des chefs, des hordes repoussées, et arrivent à l'aube. Ils lancent les sorts (les médaillons ronds) et achètent des reliques (${CLIQUEZ.toLowerCase()} les cristaux).` },
  { id: 'talents', titre: 'Les talents', quand: () => BATIMENTS.some(b => talentPossible(b.id)), zones: () => [zoneCartes()],
    texte: () => "Avec des cristaux, un bâtiment construit peut aussi apprendre un talent : ouvrez son panneau, c'est le bouton ✦ du bas. Un talent change sa façon de combattre." },
  { id: 'horde', titre: 'Les hordes', quand: () => { const h = etatHorde(G.t); return G.t > 8 && !h.horde && h.dans < 8; }, zones: () => [ZONE_HORDE],
    texte: () => "Une horde approche : beaucoup de monstres d'un coup. Préparez-vous (réparez, recrutez) ; la repousser rapporte des cristaux, puis vient un court répit." },
  { id: 'nuit', titre: 'La nuit', quand: () => niveauNuit(G.t) > 0.3, zones: () => [],
    texte: () => "La nuit tombe : plus de monstres et vos archers voient moins loin, mais le butin est meilleur. Tenez jusqu'à l'aube : elle offre des cristaux." },
];
let tutoVus = new Set(), tutoFini = false, tutoActif = null;
try { const v = JSON.parse(localStorage.getItem('muraille-tuto') || 'null'); if (v === 'fini') tutoFini = true; else if (Array.isArray(v)) tutoVus = new Set(v); } catch (e) { /* ignoré */ }
function sauverTuto() { try { localStorage.setItem('muraille-tuto', JSON.stringify(tutoFini ? 'fini' : [...tutoVus])); } catch (e) { /* ignoré */ } }
function majTuto() {
  if (tutoFini || tutoActif || ecran !== 'jeu' || !G || G.pause || G.choixNiveau || G.reliquesOuvert || G.effondrement) return;
  for (const e of TUTO) if (!tutoVus.has(e.id) && e.quand()) { tutoActif = { etape: e, t0: performance.now() }; return; }
}
function fermerTuto(tout) {
  if (!tutoActif) return;
  tutoVus.add(tutoActif.etape.id);
  if (tout || TUTO.every(e => tutoVus.has(e.id))) tutoFini = true;
  tutoActif = null; sauverTuto();
}
function revoirTuto() { tutoFini = false; tutoVus = new Set(); tutoActif = null; sauverTuto(); }
let fondTuto = null;
function dessinerTuto() {
  const T = tutoActif, e = T.etape, zones = e.zones().filter(Boolean), a = clamp((performance.now() - T.t0) / 250, 0, 1);
  // voile percé : la (les) zone(s) concernée(s) restent éclairées
  ctx.save(); ctx.globalAlpha = a;
  ctx.beginPath(); ctx.rect(0, 0, W, H);
  for (const r of zones) ctx.rect(r.x - 6, r.y - 6, r.w + 12, r.h + 12);
  ctx.fillStyle = 'rgba(27,23,25,0.55)'; ctx.fill('evenodd');
  const pouls = 0.6 + 0.4 * Math.sin(performance.now() / 260);
  ctx.strokeStyle = ROUGE; ctx.lineWidth = 3; ctx.globalAlpha = a * pouls;
  for (const r of zones) ctx.strokeRect(r.x - 6, r.y - 6, r.w + 12, r.h + 12);
  ctx.restore();
  // bulle : sous la zone si elle est en haut de l'écran, au-dessus sinon
  const tt = TACTILE ? 21 : 17, pl = tt + 8, bw = TACTILE ? 580 : 460; // plus grand sur téléphone
  const lignes = lignesDe(e.texte(), bw - 64, `${tt}px ${SERIF}`), bh = 70 + lignes.length * pl + 76;
  // placement par rapport à l'ensemble des zones éclairées (la bulle ne doit en cacher aucune)
  const z = zones.length ? zones.reduce((u, r) => { const x = Math.min(u.x, r.x), y = Math.min(u.y, r.y); return { x, y, w: Math.max(u.x + u.w, r.x + r.w) - x, h: Math.max(u.y + u.h, r.y + r.h) - y }; }) : null;
  const cy = z ? z.y + z.h / 2 : H / 2;
  let by = !z ? (H - bh) / 2 : cy < H / 2 ? z.y + z.h + 34 : z.y - bh - 34;
  by = clamp(by, 16, H - bh - 16);
  const bx = (W - bw) / 2, m = 30;
  if (!fondTuto || fondTuto.h !== bh || fondTuto.w !== bw) fondTuto = { h: bh, w: bw, c: papierFondu(bw + 2 * m, bh + 2 * m, 48) };
  // trait de pinceau de la bulle vers la zone
  if (z) {
    const x1 = clamp(z.x + z.w / 2, bx + 40, bx + bw - 40), y1 = cy < H / 2 ? by : by + bh, x2 = z.x + z.w / 2, y2 = cy < H / 2 ? z.y + z.h + 8 : z.y - 8;
    ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = ROUGE; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    const ang = Math.atan2(y2 - y1, x2 - x1);
    ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - 14 * Math.cos(ang - 0.45), y2 - 14 * Math.sin(ang - 0.45));
    ctx.moveTo(x2, y2); ctx.lineTo(x2 - 14 * Math.cos(ang + 0.45), y2 - 14 * Math.sin(ang + 0.45)); ctx.stroke();
    ctx.restore();
  }
  ctx.save(); ctx.globalAlpha = a; ctx.drawImage(fondTuto.c, bx - m, by - m); ctx.restore();
  const n = TUTO.indexOf(e) + 1;
  texte(`Conseil ${n} / ${TUTO.length}`, bx + bw - 26, by + 26, 12, '#7a6a55', 'right', 'italic', SERIF);
  texte(e.titre, bx + 30, by + 34, 25, ENCRE, 'left', 'bold');
  ctx.fillStyle = ROUGE; ctx.fillRect(bx + 30, by + 52, 70, 3);
  lignes.forEach((l, i) => texte(l, bx + 32, by + 80 + i * pl, tt, ENCRE, 'left', '', SERIF));
  const bc = { x: bx + bw - 30 - 160, y: by + bh - 62, w: 160, h: 46 }, bp = { x: bx + 24, y: by + bh - 56, w: 190, h: 34 };
  const survol = dedans(souris, bc);
  ctx.drawImage(boutonRouge(bc.w, bc.h), bc.x - 6, bc.y - 4 - (survol ? 1 : 0));
  texte('Compris', bc.x + bc.w / 2, bc.y + bc.h / 2 - (survol ? 1 : 0), 19, PAPIER, 'center', 'bold');
  texte('Passer le tutoriel', bp.x + 8, bp.y + bp.h / 2, 14, dedans(souris, bp) ? ROUGE : '#7a6a55', 'left', 'italic', SERIF);
  T.boutons = { compris: bc, passer: bp };
}
function clicTuto(p) {
  const T = tutoActif; if (performance.now() - T.t0 < 400) return; // évite de fermer par un clic déjà en cours
  if (T.boutons && dedans(p, T.boutons.passer)) { fermerTuto(true); return; }
  fermerTuto(false); // « Compris », ou un clic n'importe où
}
let bandeauNiveau = null;
function dessinerChoixNiveau() {
  const c = G.choixNiveau;
  voile();
  if (!bandeauNiveau) bandeauNiveau = creerBandeau('#a8641c');
  ctx.drawImage(bandeauNiveau, W / 2 - 300, 250 - 48);
  texte(`Niveau ${c.niveau} !`, W / 2, 251, 34, PAPIER, 'center', 'bold');
  texte(TACTILE ? 'Choisissez une amélioration (touchez une carte)' : 'Choisissez une amélioration (clic ou touches 1, 2, 3)', W / 2, 318, 16, ENCRE, 'center', 'italic', SERIF);
  c.cartes.forEach((a, i) => {
    const r = rectCarteNiveau(i, c.cartes.length), survol = dedans(souris, r), dy = survol ? -4 : 0;
    ctx.drawImage(parchemin(r.w, r.h), r.x - 10, r.y - 10 + dy);
    if (survol) ctx.drawImage(cadreRouge(r.w, r.h), r.x - 12, r.y - 12 + dy);
    texte(String(i + 1), r.x + 16, r.y + 18 + dy, 14, '#9b8a70', 'left', 'bold');
    iconeAmelio(a.icone, r.x + r.w / 2, r.y + 62 + dy);
    texte(a.nom, r.x + r.w / 2, r.y + 118 + dy, 17, ENCRE, 'center', 'bold', SANS, r.w - 20);
    const police = `italic 14px ${SERIF}`;
    lignesDe(a.desc, r.w - 30, police).forEach((l, k) => texte(l, r.x + r.w / 2, r.y + 148 + k * 19 + dy, 14, ENCRE, 'center', 'italic', SERIF));
    // pastilles : combien de fois déjà choisie / maximum
    for (let k = 0; k < a.max; k++) {
      const px = r.x + r.w / 2 + (k - (a.max - 1) / 2) * 13, py = r.y + r.h - 22 + dy;
      ctx.beginPath(); ctx.arc(px, py, 4, 0, 7);
      if (k < nv(a.id)) { ctx.fillStyle = ENCRE; ctx.fill(); } else if (k === nv(a.id)) { ctx.fillStyle = '#e8a64a'; ctx.fill(); } else { ctx.strokeStyle = ENCRE; ctx.lineWidth = 1; ctx.globalAlpha = 0.4; ctx.stroke(); ctx.globalAlpha = 1; }
    }
  });
}

// ---------------------------------------------------------------------
//  Écran des reliques (cristaux) : clic sur le compteur de cristaux ou touche K ; le jeu est figé
// ---------------------------------------------------------------------
const ZONE_CRISTAUX = { x: W - 354 + 184, y: 12, w: 80, h: 46 };
const rectRelique = i => { const w = 150, g = 14, x0 = W / 2 - (RELIQUES.length * w + (RELIQUES.length - 1) * g) / 2; return { x: x0 + i * (w + g), y: 360, w, h: 230 }; };
let bandeauReliques = null;
function dessinerReliques() {
  voile();
  if (!bandeauReliques) bandeauReliques = creerBandeau('#2c4268');
  ctx.drawImage(bandeauReliques, W / 2 - 300, 250 - 48);
  texte('Reliques', W / 2, 251, 34, PAPIER, 'center', 'bold');
  cristalIcone(ctx, W / 2 - 40, 312, 9, '#2c4268', ENCRE);
  texte(`${G.cristaux} cristaux · effets permanents pour toute la partie`, W / 2 - 26, 314, 16, ENCRE, 'left', 'italic', SERIF);
  RELIQUES.forEach((r, i) => {
    const rr = rectRelique(i), n = relique(r.id), plein = r.max && n >= r.max, cout = coutRelique(r), ok = !plein && G.cristaux >= cout;
    const survol = dedans(souris, rr), dy = survol && ok ? -4 : 0;
    ctx.drawImage(parchemin(rr.w, rr.h), rr.x - 10, rr.y - 10 + dy);
    if (survol && ok) ctx.drawImage(cadreRouge(rr.w, rr.h), rr.x - 12, rr.y - 12 + dy);
    cristalIcone(ctx, rr.x + rr.w / 2, rr.y + 40 + dy, 15, ok ? '#2c4268' : '#9a9cab', ENCRE);
    texte(r.nom, rr.x + rr.w / 2, rr.y + 86 + dy, 15, ENCRE, 'center', 'bold', SANS, rr.w - 16);
    lignesDe(r.desc, rr.w - 22, `italic 13px ${SERIF}`).forEach((l, k) => texte(l, rr.x + rr.w / 2, rr.y + 112 + k * 17 + dy, 13, ENCRE, 'center', 'italic', SERIF));
    texte(n ? `Rang ${n}${r.max ? ' / ' + r.max : ''}` : 'Pas encore acquise', rr.x + rr.w / 2, rr.y + 168 + dy, 12, '#7a6a55', 'center', 'bold');
    const b = { x: rr.x + 14, y: rr.y + 184 + dy, w: rr.w - 28, h: 30 };
    ctx.drawImage(boutonCristal(b.w, b.h, ok), b.x - 6, b.y - 4);
    if (plein) texte('Maximum', b.x + b.w / 2, b.y + b.h / 2, 14, PAPIER, 'center', 'bold');
    else { cristalIcone(ctx, b.x + b.w / 2 - 16, b.y + b.h / 2 - 1, 5.5, PAPIER); texte(String(cout), b.x + b.w / 2 - 6, b.y + b.h / 2, 15, PAPIER, 'left', 'bold'); }
  });
  texte('Cliquer ailleurs, K ou Échap pour revenir au jeu', W / 2, 640, 14, ENCRE, 'center', 'italic', SERIF);
  if (refusAnim) {
    refusAnim.t += 1 / 60; const r = refusAnim.r;
    ctx.save(); ctx.globalAlpha = Math.max(0, 1 - refusAnim.t / 0.45); ctx.drawImage(cadreRouge(r.w, r.h), r.x - 12, r.y - 12); ctx.restore();
    if (refusAnim.t > 0.45) refusAnim = null;
  }
}

// Ligne de réglage de la musique (menu pause) : [−]  Musique 50 %  [+], jauge en dessous
function dessinerReglageMusique() {
  const b = BTN_MUSIQUE, lib = BTN_VOL_LIBELLE;
  for (const [r, signe] of [[BTN_VOL_MOINS, '−'], [BTN_VOL_PLUS, '+']]) {
    const survol = dedans(souris, r);
    ctx.drawImage(boutonEncre(r.w, r.h, true), r.x - 6, r.y - 4 - (survol ? 1 : 0));
    texte(signe, r.x + r.w / 2, r.y + r.h / 2 - 1, 26, PAPIER, 'center', 'bold');
  }
  const survol = dedans(souris, lib);
  ctx.drawImage(Musique.coupee ? boutonEncre(lib.w, lib.h, false) : boutonEncre(lib.w, lib.h, true), lib.x - 6, lib.y - 4 - (survol ? 1 : 0));
  texte(Musique.coupee ? 'Musique coupée' : `Musique ${Math.round(Musique.volume * 100)} %`, lib.x + lib.w / 2, lib.y + 19, 16, PAPIER, 'center', 'bold');
  // jauge : 10 crans
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = !Musique.coupee && i < Math.round(Musique.volume * 10) ? '#e8c27a' : 'rgba(243,228,207,0.3)';
    ctx.fillRect(lib.x + 14 + i * ((lib.w - 28) / 10), lib.y + 33, (lib.w - 28) / 10 - 2, 4);
  }
}
// Même ligne pour les bruitages (un petit tir de flèche fait entendre le nouveau volume)
function dessinerReglageBruitages() {
  const lib = BTN_SFX_LIBELLE;
  for (const [r, signe] of [[BTN_SFX_MOINS, '−'], [BTN_SFX_PLUS, '+']]) {
    const survol = dedans(souris, r);
    ctx.drawImage(boutonEncre(r.w, r.h, true), r.x - 6, r.y - 4 - (survol ? 1 : 0));
    texte(signe, r.x + r.w / 2, r.y + r.h / 2 - 1, 26, PAPIER, 'center', 'bold');
  }
  const survol = dedans(souris, lib);
  ctx.drawImage(boutonEncre(lib.w, lib.h, !Bruitages.coupes), lib.x - 6, lib.y - 4 - (survol ? 1 : 0));
  texte(Bruitages.coupes ? 'Bruitages coupés' : `Bruitages ${Math.round(Bruitages.volume * 100)} %`, lib.x + lib.w / 2, lib.y + 19, 16, PAPIER, 'center', 'bold');
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = !Bruitages.coupes && i < Math.round(Bruitages.volume * 10) ? '#e8c27a' : 'rgba(243,228,207,0.3)';
    ctx.fillRect(lib.x + 14 + i * ((lib.w - 28) / 10), lib.y + 33, (lib.w - 28) / 10 - 2, 4);
  }
}
// Après un réglage au clavier, le niveau s'affiche un court instant sous le bouton de vitesse
function dessinerNiveauMusique() {
  const age = performance.now() - Musique.changement;
  if (age > 1400) return;
  ctx.globalAlpha = Math.min(1, (1400 - age) / 300);
  texte(Musique.coupee ? 'Musique coupée (M)' : `Musique ${Math.round(Musique.volume * 100)} %`, W - 18, 168, 14, niveauNuit(G.t) > 0.6 ? '#f0d69a' : ENCRE, 'right', 'italic bold', SERIF);
  ctx.globalAlpha = 1;
}

// Fond des sous-menus (Options, Audio) à l'accueil et en pause : papier fondu façon lavis, comme l'Héritage et le classement
const FOND_SOUS_MENU = { x: W / 2 - 205, y: 312, w: 410, h: 340, m: 34 };
let fondSousMenu = null;
function dessinerFondSousMenu() {
  const F = FOND_SOUS_MENU;
  if (!fondSousMenu) fondSousMenu = papierFondu(F.w + 2 * F.m, F.h + 2 * F.m, 52);
  ctx.drawImage(fondSousMenu, F.x - F.m, F.y - F.m);
}
function dessinerPause() {
  voile();
  if (sousMenu && sousMenu !== 'commandes') dessinerFondSousMenu();
  ctx.drawImage(creerBandeauCache(), W / 2 - 300, 300 - 48);
  texte('Pause', W / 2, 301, 34, PAPIER, 'center', 'bold');
  if (titreSousMenu()) { texte(titreSousMenu(), W / 2, 366, 24, ENCRE, 'center', 'bold'); dessinerSousMenu(); dessinerBoutonPause(); return; }
  texte(`Vague ${vague(G.t)} · ${formatTemps(G.t)} · ${G.kills} monstres abattus`, W / 2, 362, 16, ENCRE, 'center', 'italic', SERIF);
  if (G.pauseAuto) texte('Le jeu s\'est mis en pause pendant votre absence.', W / 2, 384, 14, ROUGE, 'center', 'italic', SERIF);
  const confirmer = performance.now() < G.confirmerRecommencer;
  for (const [r, lib, coul] of [[BTN_REPRENDRE, 'Reprendre', ENCRE], [BTN_VITESSE, `Vitesse : ${libVitesse()}`, ENCRE],
    [BTN_RECOMMENCER, confirmer ? 'Confirmer ?' : 'Recommencer', confirmer ? ROUGE : ENCRE]]) {
    const survol = dedans(souris, r);
    ctx.drawImage(coul === ROUGE ? boutonRouge(r.w, r.h) : boutonEncre(r.w, r.h, true), r.x - 6, r.y - 4 - (survol ? 1 : 0));
    texte(lib, r.x + r.w / 2, r.y + r.h / 2, 18, PAPIER, 'center', 'bold');
  }
  boutonMenu(BTN_MENU(3), 'Options');
  dessinerBoutonPause();
  medaillonRetour(BTN_IDEE, 'idee', 'Idée'); medaillonRetour(BTN_BUG, 'bug', 'Bug');
}
// Fiche des commandes : une ligne par action, la touche (ou le geste au doigt) en face
// ampoule (idée) et insecte (bug), tracés à l'encre claire sur le médaillon
function iconeAmpoule(x, y, coul) {
  ctx.save(); ctx.translate(x, y); ctx.strokeStyle = coul; ctx.fillStyle = coul; ctx.lineCap = 'round'; ctx.lineWidth = 2.6;
  ctx.beginPath(); ctx.arc(0, -4, 10, Math.PI * 0.8, Math.PI * 2.2); ctx.lineTo(4.5, 9); ctx.lineTo(-4.5, 9); ctx.closePath(); ctx.stroke();
  ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-4.5, 12.5); ctx.lineTo(4.5, 12.5); ctx.moveTo(-3, 16); ctx.lineTo(3, 16); ctx.stroke();
  ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-3, 2); ctx.lineTo(-1.5, -4); ctx.lineTo(0, 1); ctx.lineTo(1.5, -4); ctx.lineTo(3, 2); ctx.stroke(); // filament
  for (const a of [-2.4, -1.57, -0.74]) { ctx.beginPath(); ctx.moveTo(Math.cos(a) * 14, -4 + Math.sin(a) * 14); ctx.lineTo(Math.cos(a) * 18, -4 + Math.sin(a) * 18); ctx.stroke(); }
  ctx.restore();
}
function iconeInsecte(x, y, coul) {
  ctx.save(); ctx.translate(x, y); ctx.strokeStyle = coul; ctx.fillStyle = coul; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.ellipse(0, 3, 7.5, 10, 0, 0, 7); ctx.fill();                 // corps
  ctx.beginPath(); ctx.arc(0, -9, 4.5, 0, 7); ctx.fill();                            // tête
  ctx.strokeStyle = '#1b1719'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(0, 12); ctx.stroke(); // séparation des élytres
  ctx.strokeStyle = coul; ctx.lineWidth = 1.8;
  for (const dy of [-2, 3, 8]) for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sx * 7, dy); ctx.lineTo(sx * 13, dy - 3 + (dy > 3 ? 5 : 0)); ctx.stroke(); } // pattes
  ctx.beginPath(); ctx.moveTo(-2, -12); ctx.lineTo(-6, -17); ctx.moveTo(2, -12); ctx.lineTo(6, -17); ctx.stroke(); // antennes
  ctx.restore();
}
function iconeTrophee(x, y, coul) {
  ctx.save(); ctx.translate(x, y); ctx.fillStyle = coul; ctx.strokeStyle = coul; ctx.lineCap = 'round'; ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.moveTo(-10, -13); ctx.lineTo(10, -13); ctx.quadraticCurveTo(10, 3, 0, 4); ctx.quadraticCurveTo(-10, 3, -10, -13); ctx.fill(); // coupe
  ctx.beginPath(); ctx.arc(-11, -7, 5, Math.PI * 0.5, Math.PI * 1.5); ctx.stroke(); ctx.beginPath(); ctx.arc(11, -7, 5, -Math.PI * 0.5, Math.PI * 0.5); ctx.stroke(); // anses
  ctx.fillRect(-2, 3, 4, 7); ctx.fillRect(-8, 10, 16, 4);                                                     // pied et socle
  ctx.fillStyle = '#c0232b'; ctx.beginPath(); ctx.arc(0, -6, 3, 0, 7); ctx.fill();                          // sceau rouge
  ctx.restore();
}
function medaillonRetour(b, type, libelle) {
  const survol = surMedaillon(souris, b), dy = survol ? -2 : 0;
  ctx.drawImage(medaillon, b.x - 30, b.y - 30 + dy);
  if (type === 'bug') iconeInsecte(b.x, b.y + dy, PAPIER); else if (type === 'classement') iconeTrophee(b.x, b.y + dy, '#f0d69a'); else iconeAmpoule(b.x, b.y - 1 + dy, '#f0d69a');
  texte(libelle, b.x, b.y + 44, 15, ENCRE, 'center', 'italic bold', SERIF);
}

// ---------------------------------------------------------------------
//  Retours du joueur : une petite fenêtre (HTML, pour taper au clavier ou au doigt) envoie l'idée ou le bug
//  au serveur de l'atelier, qui l'ajoute à jeux/muraille/RETOURS.md. Sans serveur (fichier ouvert directement),
//  le retour est gardé dans ce navigateur (localStorage 'muraille-retours').
// ---------------------------------------------------------------------
let retourOuvert = false, fenetreRetour = null;

// =====================================================================
//  CLASSEMENT DES JOUEURS
//  En ligne : une base Supabase (classement/supabase.sql). Il suffit de renseigner ci-dessous l'adresse du projet
//  et sa clé publique « anon » (faite pour être dans le jeu : la base n'autorise que lire et ajouter des scores).
//  Tant que ce n'est pas branché, ou sans Internet, le classement est celui de cet appareil (localStorage).
// =====================================================================
const CLASSEMENT = {
  url: 'https://bcaacbblwqxgibudzbhj.supabase.co',     // projet Supabase « Muraille project »
  cle: 'sb_publishable_bYHzJIgbpx78ihLbMkzWow_ppHci7P0', // clé publique « publishable » (lecture + ajout de scores seulement)
};
const classementEnLigne = () => !!(CLASSEMENT.url && CLASSEMENT.cle);
let classementOuvert = false, fenetreClassement = null;
const lireLocal = (cle, def) => { try { return JSON.parse(localStorage.getItem(cle)) ?? def; } catch (e) { return def; } };
const ecrireLocal = (cle, v) => { try { localStorage.setItem(cle, JSON.stringify(v)); } catch (e) { /* ignoré */ } };
function nettoyerPseudo(p) { return String(p || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16); }
// scores de cet appareil : le meilleur de chaque pseudo
function classementLocal() {
  const meilleurs = {};
  for (const sc of lireLocal('muraille-scores', [])) {
    const k = sc.pseudo.toLowerCase();
    if (!meilleurs[k] || sc.duree > meilleurs[k].duree) meilleurs[k] = sc;
  }
  return Object.values(meilleurs).sort((a, b) => b.duree - a.duree).slice(0, 20);
}
async function appelSupabase(chemin, options = {}) {
  const r = await fetch(`${CLASSEMENT.url.replace(/\/$/, '')}/rest/v1/${chemin}`, {
    ...options, headers: { apikey: CLASSEMENT.cle, Authorization: `Bearer ${CLASSEMENT.cle}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  if (!r.ok) throw new Error('Supabase ' + r.status);
  const texteRep = await r.text(); // l'ajout d'un score répond « créé » sans contenu
  return texteRep ? JSON.parse(texteRep) : null;
}
async function lireClassement() {
  if (!classementEnLigne()) return { liste: classementLocal(), enLigne: false };
  try {
    let liste;
    try { liste = await appelSupabase('classement?select=pseudo,duree,vague,plateau,avatar&order=duree.desc&limit=20'); }
    catch (e) { liste = await appelSupabase('classement?select=pseudo,duree,vague,plateau&order=duree.desc&limit=20'); } // base sans colonne avatar
    return { liste, enLigne: true };
  } catch (e) { return { liste: classementLocal(), enLigne: false, erreur: true }; }
}
async function inscrireScore(pseudo) {
  const sc = { pseudo, duree: Math.max(1, Math.floor(G.t)), vague: vague(G.t), plateau: BATIMENTS.map(b => b.nom).join(', '), avatar: profil.avatar || '' };
  if (G.defi) sc.defi = G.defi.date;
  const l = lireLocal('muraille-scores', []); l.push({ ...sc, date: new Date().toISOString() }); ecrireLocal('muraille-scores', l.slice(-200));
  ecrireLocal('muraille-pseudo', pseudo);
  G.scoreInscrit = true;
  if (!classementEnLigne()) return false;
  const envoyer = corps => appelSupabase('scores', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(corps) });
  try { await envoyer(sc); return true; }
  catch (e) { // base sans colonne avatar : on réessaie sans (jamais pour un défi : il irait dans le classement général)
    if (sc.defi) return false;
    try { const { avatar, ...sansAvatar } = sc; await envoyer(sansAvatar); return true; } catch (e2) { return false; }
  }
}
// fenêtre : inscription du pseudo (en fin de partie) + tableau des meilleurs
function ouvrirClassement(depuisFin) {
  if (!fenetreClassement) {
    const f = document.createElement('div');
    // même papier que le menu d'accueil et l'Héritage : teinte du décor, bords estompés façon lavis (pas de cadre)
    f.style.cssText = 'position:fixed;inset:0;background:rgba(27,23,25,.38);display:flex;justify-content:center;align-items:flex-start;padding-top:4vh;z-index:10';
    f.innerHTML = `<div data-c="carte" style="position:relative;width:min(98vw,540px);min-height:min(62vh,520px);background:center/100% 100% no-repeat;padding:34px 40px 46px;box-sizing:border-box;color:#1b1719;font-family:Plume,Georgia,serif"><div style="max-height:calc(88vh - 76px);overflow:auto;scrollbar-width:thin">
      <button data-c="fermer" aria-label="Fermer" style="position:absolute;top:26px;right:34px;width:38px;height:38px;border:0;background:transparent;font:26px Pinceau,sans-serif;color:#1b1719;cursor:pointer;line-height:1" onmouseenter="this.style.color='#c0232b'" onmouseleave="this.style.color='#1b1719'">✕</button>
      <div style="font:clamp(24px,6vw,34px) Pinceau,sans-serif;text-align:center;margin:2px 40px 0">Classement</div>
      <div style="height:4px;width:46%;margin:4px auto 10px;background:#c0232b;border-radius:3px"></div>
      <div data-c="inscription" style="text-align:center;margin-bottom:10px">
        <div data-c="votre" style="font-size:clamp(17px,4vw,21px);margin-bottom:6px"></div>
        <input data-c="pseudo" maxlength="16" placeholder="Votre nom de guerrier" style="font:clamp(17px,4vw,21px) Plume,Georgia,serif;padding:6px 10px;border:3px solid #1b1719;border-radius:8px;background:#fbf4e8;color:#1b1719;width:min(60%,230px)">
        <button data-c="inscrire" style="font:clamp(15px,3.6vw,19px) Pinceau,sans-serif;padding:8px 14px;margin-left:6px;border:2px solid #1b1719;background:#c0232b;color:#f3e4cf;cursor:pointer">Inscrire</button>
      </div>
      <div data-c="etat" style="text-align:center;font-size:clamp(14px,3.4vw,18px);color:#5a4632;min-height:20px;margin-bottom:6px"></div>
      <div data-c="liste"></div>
    </div></div>`;
    const el = n => f.querySelector(`[data-c="${n}"]`);
    // le papier est généré à la taille réelle de la carte (sinon le fondu serait étiré ou écrasé)
    let tailleFond = '';
    new ResizeObserver(() => {
      const c = el('carte'), w = Math.round(c.offsetWidth), h = Math.round(c.offsetHeight), cle = `${w >> 3}x${h >> 3}`;
      if (!w || !h || cle === tailleFond) return;
      tailleFond = cle; c.style.backgroundImage = `url(${papierFondu(w, h, 56).toDataURL()})`;
    }).observe(el('carte'));
    f.addEventListener('pointerdown', ev => { if (ev.target === f) fermerClassement(); });
    el('fermer').onclick = fermerClassement;
    el('inscrire').onclick = async () => {
      const p = nettoyerPseudo(el('pseudo').value);
      if (!p) { el('etat').textContent = 'Choisissez un nom (16 lettres au plus).'; return; }
      el('inscrire').disabled = true; el('etat').textContent = 'Inscription…';
      const enLigne = await inscrireScore(p);
      el('inscription').style.display = 'none';
      el('etat').textContent = enLigne ? 'Score inscrit au classement !' : (classementEnLigne() ? 'Pas de connexion : score gardé sur cet appareil.' : 'Score inscrit (classement de cet appareil).');
      remplirClassement(p);
    };
    el('pseudo').addEventListener('keydown', ev => { if (ev.key === 'Enter') el('inscrire').click(); if (ev.key === 'Escape') fermerClassement(); });
    f.el = el; fenetreClassement = f;
  }
  const f = fenetreClassement, peutInscrire = depuisFin && G && !G.scoreInscrit && G.t >= 1;
  f.el('inscription').style.display = peutInscrire ? '' : 'none';
  f.el('votre').textContent = peutInscrire ? `Vous avez tenu ${formatTemps(G.t)} (vague ${vague(G.t)}).` : '';
  f.el('pseudo').value = lireLocal('muraille-pseudo', '');
  f.el('inscrire').disabled = false; f.el('etat').textContent = '';
  document.body.appendChild(f); classementOuvert = true;
  remplirClassement(lireLocal('muraille-pseudo', ''));
  if (peutInscrire) setTimeout(() => f.el('pseudo').focus(), 50);
}
// portrait d'avatar pour le classement (image en cache par avatar ; avatar inconnu ou absent → Archer)
const portraitsClassement = {};
function imageAvatarClassement(id) {
  const a = AVATARS.find(x => x.id === id) || AVATARS[0];
  return portraitsClassement[a.id] || (portraitsClassement[a.id] = portraitAvatar(a, 84, false).toDataURL());
}
async function remplirClassement(moi) {
  const f = fenetreClassement, zone = f.el('liste');
  zone.innerHTML = '<div style="text-align:center;font-size:18px;color:#5a4632">Chargement…</div>';
  const { liste, enLigne, erreur } = await lireClassement();
  const echapper = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const medaille = i => i === 0 ? '#c9a227' : i === 1 ? '#9fa4a8' : i === 2 ? '#b0703c' : null;
  const lignes = liste.map((sc, i) => {
    const mien = moi && sc.pseudo.toLowerCase() === moi.toLowerCase(), m = medaille(i);
    return `<div style="display:flex;align-items:center;gap:10px;padding:5px 8px;border-bottom:1px solid rgba(27,23,25,.15);${mien ? 'background:rgba(192,35,43,.12);' : ''}">
      <div style="width:34px;height:34px;flex:none;border-radius:50%;display:flex;align-items:center;justify-content:center;font:18px Pinceau,sans-serif;${m ? `background:${m};color:#1b1719` : 'color:#5a4632'}">${i + 1}</div>
      <img src="${imageAvatarClassement(sc.avatar)}" alt="" style="width:42px;height:42px;flex:none">
      <div style="flex:1;min-width:0">
        <div style="font-size:clamp(17px,4.2vw,22px);${mien ? 'color:#c0232b;' : ''}white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${echapper(sc.pseudo)}</div>
        <div style="font-size:clamp(12px,3vw,15px);color:#6a5a48;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">vague ${sc.vague}${sc.plateau ? ' · ' + echapper(sc.plateau) : ''}</div>
      </div>
      <div style="font:clamp(17px,4.2vw,22px) Pinceau,sans-serif">${formatTemps(sc.duree)}</div>
    </div>`;
  }).join('');
  const pied = enLigne ? 'Classement mondial · meilleur score de chaque joueur'
    : erreur ? 'Classement en ligne injoignable : scores de cet appareil.'
    : 'Classement de cet appareil (le classement mondial n\'est pas encore branché).';
  zone.innerHTML = (lignes || '<div style="text-align:center;font-size:19px;padding:14px">Personne encore… Soyez le premier !</div>')
    + `<div style="text-align:center;font-size:14px;color:#7a6a55;margin-top:10px">${pied}</div>`;
}
function fermerClassement() { if (fenetreClassement && fenetreClassement.parentNode) fenetreClassement.remove(); classementOuvert = false; }
function contexteRetour() {
  const infos = [`écran : ${ecran}`];
  if (G && (ecran === 'jeu' || ecran === 'fin')) infos.push(`partie à ${formatTemps(G.t)}, vague ${vague(G.t)}, niv. ${G.niveau}`, `muraille ${Math.ceil(G.mur.pv)}/${G.mur.max}`);
  infos.push(`plateau : ${BATIMENTS.map(b => b.nom).join(', ')}`, `record ${formatTemps(record)}`,
    `${TACTILE ? 'tactile' : 'souris'} ${innerWidth}×${innerHeight}`);
  return infos.join(' · ');
}
// Fenêtres « idée » et « bug » : les images peintes par le joueur (1536 × 1024, même mise en page).
// Zones en % de l'image : [gauche, haut, largeur, hauteur] ; fondSaisie = papier du cadre de saisie (cache l'exemple peint).
const ZONES_FENETRE = { fermer: [90.4, 6, 5.6, 8], texte: [7.9, 44.4, 84.8, 23.8], annuler: [21, 75, 27, 11.5], envoyer: [50.6, 74, 30.4, 12.5], etat: 69.2 };
const FENETRES = {
  idee: { ...ZONES_FENETRE, src: 'assets/fenetre-idee.webp', fondSaisie: '#f9e6ca', exemple: 'Ex. : une carte qui…' },
  bug:  { ...ZONES_FENETRE, src: 'assets/fenetre-bug.webp',  fondSaisie: '#fce8c6', exemple: 'Décris le bug ici…' },
};
// Les images peintes sont adaptées au style des autres menus (préparées une fois au chargement) : le cadre noir au pinceau
// du bord est effacé (encre grise ou noire près du bord remplacée par le papier, sauf le ✕), le papier est recoloré vers
// la teinte du décor, et les bords s'estompent façon lavis. Faute de mieux (image pas encore prête), l'image d'origine.
const CADRE_FENETRE = 84, FONDU_FENETRE = 64; // en pixels de l'image (1536 de large)
function preparerFenetreFondue(img, Z) {
  const w = img.width, h = img.height, c = creerCanvas(w, h), k = c.getContext('2d');
  k.drawImage(img, 0, 0);
  const id = k.getImageData(0, 0, w, h), d = id.data;
  // couleur moyenne du papier (pixels clairs et peu saturés)
  let pr = 0, pg = 0, pb = 0, n = 0;
  for (let p = 0; p < d.length; p += 4 * 7) { const mx = Math.max(d[p], d[p + 1], d[p + 2]), mn = Math.min(d[p], d[p + 1], d[p + 2]); if (mx > 205 && mx - mn < 70) { pr += d[p]; pg += d[p + 1]; pb += d[p + 2]; n++; } }
  const papier = [pr / n, pg / n, pb / n], ratio = PAPIER_DECOR.map((v, i) => v / papier[i]);
  const fx = Z.fermer, x0 = fx[0] / 100 * w - 12, y0 = fx[1] / 100 * h - 12, x1 = (fx[0] + fx[2]) / 100 * w + 12, y1 = (fx[1] + fx[3]) / 100 * h + 12;
  const fd = FONDU_FENETRE;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = (y * w + x) * 4, dist = Math.min(x, y, w - 1 - x, h - 1 - y);
    // cadre : l'encre peu saturée proche du bord devient du papier (fondu vers l'intérieur)
    if (dist < CADRE_FENETRE && !(x > x0 && x < x1 && y > y0 && y < y1)) {
      const mx = Math.max(d[p], d[p + 1], d[p + 2]), mn = Math.min(d[p], d[p + 1], d[p + 2]);
      if (mx - mn < 45) { const a = clamp((CADRE_FENETRE - dist) / 26, 0, 1) * clamp((215 - mx) / 60, 0, 1); for (let i = 0; i < 3; i++) d[p + i] += (papier[i] - d[p + i]) * a; }
    }
    const lum = (d[p] + d[p + 1] + d[p + 2]) / 3, t = clamp((lum - 80) / 140, 0, 1);
    for (let i = 0; i < 3; i++) d[p + i] = Math.min(255, d[p + i] * (1 + (ratio[i] - 1) * t));
    if (dist < fd) {
      const bruit = 0.5 + 0.28 * Math.sin(x * 0.031 + y * 0.021) + 0.22 * Math.sin(x * 0.008 - y * 0.048 + 1.7);
      const u = clamp((dist - fd * 0.4 * bruit) / (fd * 0.75), 0, 1);
      d[p + 3] = Math.round(d[p + 3] * u * u * (3 - 2 * u));
    }
  }
  k.putImageData(id, 0, 0);
  const fond = Z.fondSaisie.match(/[0-9a-f]{2}/gi).map((v, i) => Math.min(255, Math.round(parseInt(v, 16) * ratio[i])));
  return { url: c.toDataURL(), fondSaisie: `rgb(${fond.join(',')})` };
}
for (const k in FENETRES) { const img = new Image(); img.onload = () => { try { FENETRES[k].fondue = preparerFenetreFondue(img, FENETRES[k]); } catch (e) { /* image d'origine */ } }; img.src = FENETRES[k].src; }
function ouvrirRetour(type) {
  if (!fenetreRetour) {
    const f = document.createElement('div');
    f.style.cssText = 'position:fixed;inset:0;background:rgba(27,23,25,.38);display:flex;justify-content:center;align-items:flex-start;padding-top:7vh;z-index:10';
    const brosse = (couleur, w, h) => { const c = creerTrainee(w, h, couleur, 0.6); return c.toDataURL(); };
    f.innerHTML = `<div data-r="panneau" style="position:relative;width:min(94vw,640px);aspect-ratio:3/2;background-size:100% 100%;color:#1b1719;font-family:Plume,Georgia,serif">
      <button data-r="fermer" aria-label="Fermer" style="position:absolute;top:5%;right:5%;width:7%;aspect-ratio:1;border:3px solid #1b1719;background:transparent;font:clamp(14px,3.4vw,26px) Pinceau,sans-serif;color:#1b1719;cursor:pointer;padding:0;line-height:1">✕</button>
      <div data-r="titre" style="position:absolute;top:9%;left:12%;right:12%;text-align:center;font:clamp(20px,5.4vw,38px) Pinceau,sans-serif;letter-spacing:.5px"></div>
      <div data-r="aide" style="position:absolute;top:28%;left:10%;right:10%;text-align:center;font-size:clamp(14px,3.5vw,23px);line-height:1.15"></div>
      <textarea data-r="texte" maxlength="4000" style="position:absolute;top:44%;left:7%;width:86%;height:24%;box-sizing:border-box;font:clamp(16px,3.6vw,23px) Plume,Georgia,serif;padding:8px 12px;border:3px solid #1b1719;border-radius:10px;background:rgba(251,244,232,.65);color:#1b1719;resize:none;outline:none"></textarea>
      <div data-r="etat" style="position:absolute;top:68.5%;left:8%;right:8%;text-align:center;font-size:clamp(13px,3vw,19px);color:#8e1a20"></div>
      <button data-r="annuler" style="position:absolute;top:75%;left:21%;width:26%;height:11%;border:3px solid #1b1719;border-radius:14px;background:#efe3cc;font:clamp(13px,3.4vw,24px) Pinceau,sans-serif;color:#1b1719;cursor:pointer">Annuler</button>
      <button data-r="envoyer" style="position:absolute;top:73.5%;left:51%;width:30%;height:14%;border:none;background:url(${brosse(ROUGE, 300, 90)}) center/100% 100% no-repeat;font:clamp(14px,3.6vw,26px) Pinceau,sans-serif;color:#f3e4cf;cursor:pointer">Envoyer</button>
    </div>`;
    const el = n => f.querySelector(`[data-r="${n}"]`);
    f.addEventListener('pointerdown', ev => { if (ev.target === f) fermerRetour(); });
    el('annuler').onclick = fermerRetour; el('fermer').onclick = fermerRetour;
    el('envoyer').onclick = () => envoyerRetour(f.dataset.type, el('texte').value);
    el('texte').addEventListener('keydown', ev => { if (ev.key === 'Escape') fermerRetour(); if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) el('envoyer').click(); });
    f.el = el; fenetreRetour = f;
  }
  const f = fenetreRetour, bug = type === 'bug';
  f.dataset.type = type;
  // L'image peinte par le joueur sert de fenêtre (idée ou bug) : titre, texte, cadre de saisie et boutons y sont déjà
  // dessinés ; on pose dessus la zone de saisie et des boutons invisibles aux bons endroits.
  const image = true, Z = FENETRES[bug ? 'bug' : 'idee'];
  f.el('panneau').style.backgroundImage = `url(${Z.fondue ? Z.fondue.url : Z.src})`;
  f.el('titre').style.display = f.el('aide').style.display = image ? 'none' : '';
  const placer = (el, r) => Object.assign(el.style, { left: r[0] + '%', top: r[1] + '%', width: r[2] + '%', height: r[3] + '%' });
  for (const n of ['fermer', 'annuler', 'envoyer']) {
    const b = f.el(n);
    if (!b.dataset.style) b.dataset.style = b.style.cssText; // style d'origine (fenêtre du bug)
    if (image) { b.style.cssText = 'position:absolute;background:transparent;border:none;cursor:pointer;color:transparent;font-size:1px'; placer(b, Z[n]); }
    else b.style.cssText = b.dataset.style;
  }
  const zt = f.el('texte');
  if (!zt.dataset.style) zt.dataset.style = zt.style.cssText;
  zt.style.cssText = zt.dataset.style;
  if (image) { placer(zt, Z.texte); Object.assign(zt.style, { border: 'none', borderRadius: '6px', background: Z.fondue ? Z.fondue.fondSaisie : Z.fondSaisie }); }
  const et = f.el('etat');
  if (!et.dataset.style) et.dataset.style = et.style.cssText;
  et.style.cssText = et.dataset.style; if (image) et.style.top = Z.etat + '%';
  f.el('titre').textContent = bug ? 'Signaler un bug' : 'Proposer une idée';
  f.el('aide').textContent = bug ? 'Que s\'est-il passé ? Qu\'attendiez-vous ? Le moment de la partie est joint tout seul.'
                                 : 'Une amélioration, une carte, un ennemi, un réglage… Toutes les idées sont bonnes à prendre.';
  f.el('texte').value = ''; f.el('texte').placeholder = Z.exemple;
  f.el('etat').textContent = ''; f.el('envoyer').disabled = false;
  document.body.appendChild(f); retourOuvert = true;
  setTimeout(() => f.el('texte').focus(), 50);
}
// retours gardés dans le navigateur faute de serveur : renvoyés dès que le serveur répond
// Un retour part à deux endroits à la fois : la table Supabase « retours » (en ligne, lisible seulement depuis le
// tableau de bord ; script : classement/retours.sql) et le serveur de l'atelier (RETOURS.md, quand on joue en local).
// Il est considéré comme envoyé si l'un des deux l'a reçu.
async function expedierRetour(r) {
  const versSupabase = classementEnLigne()
    ? appelSupabase('retours', { method: 'POST', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ type: r.type, texte: r.texte.slice(0, 4000), contexte: { infos: String(r.contexte || '').slice(0, 1500), date: r.date || new Date().toISOString() } }) })
        .then(() => true, () => false)
    : Promise.resolve(false);
  const versAtelier = location.protocol.startsWith('http')
    ? fetch('/__retour/muraille', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(r) }).then(x => x.ok, () => false)
    : Promise.resolve(false);
  const [a, b] = await Promise.all([versSupabase, versAtelier]);
  return a || b;
}
async function renvoyerRetoursEnAttente() {
  let l; try { l = JSON.parse(localStorage.getItem('muraille-retours') || '[]'); } catch (e) { return; }
  if (!l.length) return;
  const restants = [];
  for (const r of l) {
    if (!(await expedierRetour({ ...r, contexte: (r.contexte || '') + ' · envoyé en différé (écrit le ' + (r.date || '?') + ')' }))) restants.push(r);
  }
  try { if (restants.length) localStorage.setItem('muraille-retours', JSON.stringify(restants)); else localStorage.removeItem('muraille-retours'); } catch (e) { /* ignoré */ }
}
setTimeout(renvoyerRetoursEnAttente, 3000);
function fermerRetour() { if (fenetreRetour && fenetreRetour.parentNode) fenetreRetour.remove(); retourOuvert = false; }
async function envoyerRetour(type, texte) {
  const f = fenetreRetour; texte = texte.trim();
  if (!texte) { f.el('etat').textContent = 'Écrivez quelques mots avant d\'envoyer.'; return; }
  f.el('envoyer').disabled = true; f.el('etat').style.color = '#5a4632'; f.el('etat').textContent = 'Envoi…';
  const retour = { type, texte, contexte: contexteRetour() };
  const ok = await expedierRetour(retour);
  if (ok) f.el('etat').textContent = type === 'bug' ? 'Merci ! Le bug est noté.' : 'Merci ! Votre idée est notée.';
  else {
    try { const l = JSON.parse(localStorage.getItem('muraille-retours') || '[]'); l.push({ ...retour, date: new Date().toISOString() }); localStorage.setItem('muraille-retours', JSON.stringify(l)); } catch (e) { /* ignoré */ }
    f.el('etat').textContent = 'Pas de connexion : votre message est gardé et repartira plus tard.';
  }
  f.el('etat').style.color = ok ? '#2f6b2a' : '#8e1a20';
  setTimeout(fermerRetour, ok ? 1300 : 2600);
}
function lignesAide() {
  if (TACTILE) return [
    ['Bâtiment', 'touchez sa carte'],
    ['Améliorer, recruter, catapulte…', 'boutons du panneau'],
    ['Réparer la muraille', 'touchez la barre de vie'],
    ['Sorts', 'touchez les médaillons'],
    ['Reliques', 'touchez les cristaux'],
    ['Vitesse ×1 / ×2 / ×3', 'bouton ▶ sous la pause'],
    ['Pause', 'bouton en haut à droite'],
  ];
  return [
    ['Bâtiment', 'clic sur sa carte  ·  1 à 5'],
    ['Fermer le panneau', 'Échap'],
    ['Recruter un archer', 'A'],
    ['Engin de siège', 'C'],
    ['Réparer la muraille', 'R  ·  clic sur la barre de vie'],
    ['Sorts', 'E pluie · B brume · F rempart · T raz'],
    ['Reliques', 'K  ·  clic sur les cristaux'],
    ['Vitesse ×1 / ×2 / ×3', 'V'],
    ['Pause', 'Espace  ·  P  ·  Échap'],
    ['Musique', 'M  ·  + / − pour le volume'],
  ];
}
let fondAide = null;
function dessinerAide() {
  // hauteur ajustée au contenu, cadre centré
  const nL = lignesAide().length, hA = 104 + nL * (TACTILE ? 46 : 40) + 150;
  const R = { x: RECT_AIDE.x, y: Math.round((H - hA) / 2) - 20, w: RECT_AIDE.w, h: hA };
  // papier fondu façon lavis (comme le menu, l'Héritage et le classement), préparé une fois par taille
  ctx.fillStyle = 'rgba(27,23,25,0.25)'; ctx.fillRect(0, -DC, W, H + 2 * DC);
  const m = 34, cle = R.w + 'x' + R.h;
  if (!fondAide || fondAide.cle !== cle) fondAide = { cle, c: papierFondu(R.w + 2 * m, R.h + 2 * m, 54) };
  ctx.drawImage(fondAide.c, R.x - m, R.y - m);
  texte('Commandes', W / 2, R.y + 42, 28, ENCRE, 'center', 'bold');
  ctx.fillStyle = ROUGE; ctx.fillRect(W / 2 - 40, R.y + 64, 80, 3);
  const lignes = lignesAide(), pas = TACTILE ? 46 : 40;
  lignes.forEach(([action, touche], k) => {
    const y = R.y + 104 + k * pas;
    if (k % 2 === 0) { // bande de lavis aux extrémités estompées
      const gb = ctx.createLinearGradient(R.x, 0, R.x + R.w, 0); gb.addColorStop(0, 'rgba(110,80,50,0)'); gb.addColorStop(0.12, 'rgba(110,80,50,0.07)'); gb.addColorStop(0.88, 'rgba(110,80,50,0.07)'); gb.addColorStop(1, 'rgba(110,80,50,0)');
      ctx.fillStyle = gb; ctx.fillRect(R.x, y - pas / 2 + 2, R.w, pas - 4);
    }
    texte(action, R.x + 30, y, 17, ENCRE, 'left', 'bold');
    texte(touche, R.x + R.w - 30, y, 16, '#5a4632', 'right', 'italic', SERIF, R.w / 2 - 20);
  });
  // bon à savoir
  const yb = R.y + 104 + lignes.length * pas + 14;
  texte('Bon à savoir', W / 2, yb, 18, ROUGE, 'center', 'bold');
  [`La nuit : +${NUIT_EFFETS.menace * 100} % de monstres, portée ${NUIT_EFFETS.portee * 100} %, butin +${NUIT_EFFETS.butin * 100} %`,
   `Cristaux : +6 par chef, +2 par horde, +${NUIT_EFFETS.cristauxAube} à l'aube ; ils paient les sorts et les talents`]
    .forEach((l, k) => texte(l, W / 2, yb + 30 + k * 24, 14, ENCRE, 'center', 'italic', SERIF, R.w - 40));
  texte(TACTILE ? 'Touchez pour fermer' : 'Cliquez pour fermer', W / 2, R.y + R.h - 26, 14, '#7a6a55', 'center', 'italic', SERIF);
}

let bandeauPause = null;
function creerBandeauCache() { return bandeauPause || (bandeauPause = creerBandeau(ENCRE)); }

const decorTitre = (function () {
  const c = creerCanvas(W, 340), k = c.getContext('2d');
  const pts = []; for (let i = 0; i < 9; i++) pts.push([180 + i * 45, 278 + Math.sin(i * 0.9) * 3 + rand(-1.5, 1.5)]);
  pinceau(k, pts, 10, ENCRE, 0.7);
  k.fillStyle = ENCRE;
  for (let i = 0; i < 40; i++) {
    const a = rand(-0.5, 3.6), d = rand(10, 90), r = rand(0.8, 4) * (1 - d / 120);
    k.globalAlpha = rand(0.6, 1);
    cheminBlob(k, 560 + Math.cos(a) * d, 150 + Math.sin(a) * d * 0.7, r * 1.4, r, Math.random() * 9, 0, 0.2, 8); k.fill();
  }
  k.globalAlpha = 1; cheminBlob(k, 560, 150, 16, 12, 3, 0, 0.3, 16); k.fill();
  return c;
})();

// fond des écrans titre / accueil (la vallée, la muraille, le socle) : sur toute la hauteur de l'écran
function fondTitre(t) {
  ctx.drawImage(fond, 0, 0);
  ctx.drawImage(premierPlan, 0, 0);
  ctx.drawImage(murTex, 0, OY_MUR); dessinerPavillon(0);
  drapeauxMuraille(t);
  ctx.drawImage(socle, 0, OY_SOCLE);
  brasero(262, SOCLE_Y + 2, t); brasero(W - 262, SOCLE_Y + 2, t);
}
// partie « titre » du décor (halo, montagnes et soleil du titre, nom du jeu) : dans le cadre centré
function dessinerDecorTitre(t) {
  const halo = ctx.createRadialGradient(W / 2, 380, 60, W / 2, 380, 330);
  halo.addColorStop(0, 'rgba(243,228,207,0.85)'); halo.addColorStop(0.7, 'rgba(243,228,207,0.6)'); halo.addColorStop(1, 'rgba(243,228,207,0)');
  ctx.fillStyle = halo; ctx.fillRect(0, 40, W, 680);
  ctx.drawImage(decorTitre, 0, -20);
  texte('Muraille', W / 2, 220, 76, ENCRE, 'center', 'bold italic', SERIF);
}
// ---------------------------------------------------------------------
//  Menu d'accueil (après « Cliquez pour commencer ») : Jouer, Classement, Commandes, réglages du son,
//  idée / bug. Même disposition que le menu pause.
// ---------------------------------------------------------------------
const BTN_IDEE_ACC = { x: W / 2 - 80, y: 670, r: 28 }, BTN_BUG_ACC = { x: W / 2 + 80, y: 670, r: 28 };
const PANNEAU_ACCUEIL = { x: W / 2 - 190, y: 380, w: 380, h: 358 };
let heritageOuvert = false;
const PANNEAU_HERITAGE = { x: 34, y: 130, w: W - 68, h: 690 };
const rectAchatHeritage = i => ({ x: PANNEAU_HERITAGE.x + PANNEAU_HERITAGE.w - 150, y: PANNEAU_HERITAGE.y + 132 + i * 78, w: 124, h: 50 });
const BTN_FERMER_HERITAGE = { x: PANNEAU_HERITAGE.x + PANNEAU_HERITAGE.w - 50, y: PANNEAU_HERITAGE.y + 12, w: 38, h: 38 };
// Fin de partie : l'Héritage s'ouvre d'abord (dépenser les sceaux gagnés), avec « Rejouer » (relance aussitôt, même
// plateau) et « Suivant → » (le bilan de la partie : temps, record, classement…). Le panneau est alors plus haut.
let heritageFin = false;
const HAUTEUR_HERITAGE = { menu: 690, fin: 770 };
function ouvrirHeritage(fin) { heritageFin = !!fin; PANNEAU_HERITAGE.h = fin ? HAUTEUR_HERITAGE.fin : HAUTEUR_HERITAGE.menu; heritageOuvert = true; }
function fermerHeritage() { heritageOuvert = false; heritageFin = false; PANNEAU_HERITAGE.h = HAUTEUR_HERITAGE.menu; }
const BTN_REJOUER_HERITAGE = () => ({ x: W / 2 - 215, y: PANNEAU_HERITAGE.y + PANNEAU_HERITAGE.h - 72, w: 200, h: 50 });
const BTN_SUIVANT_HERITAGE = () => ({ x: W / 2 + 15, y: PANNEAU_HERITAGE.y + PANNEAU_HERITAGE.h - 72, w: 200, h: 50 });
function rejouerDepuisHeritage() { fermerHeritage(); composerPlateau(); lancerPartie(); }
// Papier aux bords fondus façon lavis (même style que la carte du menu d'accueil) : teinte du décor, grain, léger
// vieillissement vers les bords, contour estompé irrégulier. Préparé une fois par taille.
function papierFondu(w, h, f) {
  const c = creerCanvas(w, h), k = c.getContext('2d');
  k.fillStyle = 'rgb(241,226,205)'; k.fillRect(0, 0, w, h);
  const g = k.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.7);
  g.addColorStop(0, 'rgba(120,85,45,0)'); g.addColorStop(1, 'rgba(120,85,45,0.16)'); k.fillStyle = g; k.fillRect(0, 0, w, h);
  for (let i = 0; i < w * h / 70; i++) { k.fillStyle = 'rgba(110,80,50,' + Math.random() * 0.07 + ')'; k.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); }
  const id = k.getImageData(0, 0, w, h), d = id.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dist = Math.min(x, y, w - 1 - x, h - 1 - y); if (dist >= f) continue;
    const bruit = 0.5 + 0.28 * Math.sin(x * 0.043 + y * 0.029) + 0.22 * Math.sin(x * 0.011 - y * 0.067 + 1.7);
    const u = clamp((dist - f * 0.45 * bruit) / (f * 0.75), 0, 1);
    d[(y * w + x) * 4 + 3] = Math.round(255 * u * u * (3 - 2 * u));
  }
  k.putImageData(id, 0, 0);
  return c;
}
let fondHeritage = null;
const MARGE_FONDU_HERITAGE = 34;
function dessinerHeritage() {
  const P = PANNEAU_HERITAGE, m = MARGE_FONDU_HERITAGE;
  ctx.fillStyle = 'rgba(27,23,25,0.22)'; ctx.fillRect(0, -DC, W, H + 2 * DC);
  if (!fondHeritage || fondHeritage.h !== P.h) fondHeritage = { h: P.h, c: papierFondu(P.w + 2 * m, P.h + 2 * m, 56) };
  ctx.drawImage(fondHeritage.c, P.x - m, P.y - m);
  texte('Héritage', W / 2, P.y + 38, 32, ENCRE, 'center', 'bold');
  ctx.fillStyle = ROUGE; ctx.fillRect(W / 2 - 55, P.y + 60, 110, 3);
  const bf = BTN_FERMER_HERITAGE, survolX = dedansLarge(souris, bf);
  texte('✕', bf.x + bf.w / 2, bf.y + bf.h / 2 + 1, survolX ? 30 : 26, survolX ? ROUGE : ENCRE, 'center', 'bold');
  texte(heritageFin && G && G.sceauxGagnes ? `+${G.sceauxGagnes} sceaux gagnés · ${sceaux} à dépenser` : `Sceaux : ${sceaux}`, W / 2, P.y + 88, 22, ROUGE, 'center', 'bold');
  if (heritageFin && G && G.piecesGagnees) {
    const lib = `+${G.piecesGagnees} pièces aussi : de quoi débloquer des cartes dans « Préparer la muraille »`;
    ctx.font = fonte('italic', 13, SERIF); const lw = Math.min(ctx.measureText(lib).width, P.w - 70);
    iconePiece(ctx, W / 2 - lw / 2 - 12, P.y + 112, 8);
    texte(lib, W / 2 + 6, P.y + 112, 13, '#7a5410', 'center', 'italic bold', SERIF, P.w - 70);
  } else texte('1 sceau par minute tenue, +5 pour un nouveau record. Ces bonus durent pour toujours.', W / 2, P.y + 112, 13, '#5a4632', 'center', 'italic', SERIF, P.w - 40);
  HERITAGE.forEach((h, i) => {
    const n = herit(h.id), max = n >= h.max, cout = coutHeritage(h, n), ok = !max && sceaux >= cout, r = rectAchatHeritage(i), y = r.y + r.h / 2;
    if (i % 2 === 0) { // bande de lavis aux extrémités estompées
      const gb = ctx.createLinearGradient(P.x, 0, P.x + P.w, 0); gb.addColorStop(0, 'rgba(110,80,50,0)'); gb.addColorStop(0.12, 'rgba(110,80,50,0.07)'); gb.addColorStop(0.88, 'rgba(110,80,50,0.07)'); gb.addColorStop(1, 'rgba(110,80,50,0)');
      ctx.fillStyle = gb; ctx.fillRect(P.x, r.y - 12, P.w, 74);
    }
    texte(h.nom, P.x + 28, y - 12, 19, ENCRE, 'left', 'bold');
    // crans
    for (let k = 0; k < h.max; k++) { ctx.fillStyle = k < n ? ROUGE : 'rgba(27,23,25,0.18)'; ctx.beginPath(); ctx.arc(P.x + 34 + k * 14, y + 14, 4.5, 0, 7); ctx.fill(); }
    texte(n ? h.effet(n) : '—', P.x + 34 + h.max * 14 + 8, y + 14, 13, '#3a3230', 'left', 'italic', SERIF, 210);
    if (!max) texte(`→ ${h.effet(n + 1)}`, P.x + 300, y - 12, 13, '#2c4268', 'left', 'italic', SERIF, 170);
    // bouton d'achat
    const survol = ok && dedans(souris, r);
    if (max) texte('Maximum', r.x + r.w / 2, y, 16, '#7a6a55', 'center', 'bold');
    else {
      ctx.drawImage(ok ? boutonRouge(r.w, r.h) : boutonEncre(r.w, r.h, false), r.x - 6, r.y - 4 - (survol ? 1 : 0));
      texte(`${cout} sceau${cout > 1 ? 'x' : ''}`, r.x + r.w / 2, y - (survol ? 1 : 0), 16, ok ? PAPIER : 'rgba(243,228,207,0.6)', 'center', 'bold');
    }
  });
  if (heritageFin) {
    for (const [r, lib, rouge] of [[BTN_REJOUER_HERITAGE(), 'Rejouer', true], [BTN_SUIVANT_HERITAGE(), 'Suivant  →', false]]) {
      const survol = dedans(souris, r);
      ctx.drawImage(rouge ? boutonRouge(r.w, r.h) : boutonEncre(r.w, r.h, true), r.x - 6, r.y - 4 - (survol ? 1 : 0));
      texte(lib, r.x + r.w / 2, r.y + r.h / 2 - (survol ? 1 : 0), 20, PAPIER, 'center', 'bold');
    }
  }
  if (refusAnim) {
    refusAnim.t += 1 / 60; const r = refusAnim.r;
    ctx.save(); ctx.globalAlpha = Math.max(0, 1 - refusAnim.t / 0.45); ctx.drawImage(cadreRouge(r.w, r.h), r.x - 12, r.y - 12); ctx.restore();
    if (refusAnim.t > 0.45) refusAnim = null;
  }
}
function clicHeritage(p) {
  if (heritageFin) {
    if (dedans(p, BTN_REJOUER_HERITAGE())) { rejouerDepuisHeritage(); return; }
    if (dedans(p, BTN_SUIVANT_HERITAGE()) || dedansLarge(p, BTN_FERMER_HERITAGE)) { fermerHeritage(); return; }
    if (!dedans(p, PANNEAU_HERITAGE)) return; // en fin de partie, un clic à côté ne ferme pas (on choisit Rejouer ou Suivant)
  } else if (dedansLarge(p, BTN_FERMER_HERITAGE) || !dedans(p, PANNEAU_HERITAGE)) { fermerHeritage(); return; }
  HERITAGE.forEach((h, i) => { const r = rectAchatHeritage(i); if (dedans(p, r) && !acheterHeritage(h) && herit(h.id) < h.max) refus(r); });
}
let carteAccueil = null; // papier encadré au pinceau, sous le menu (préparé une fois)
// ---------------------------------------------------------------------
//  Menu d'accueil dessiné (assets/menu-accueil.webp, 1024×1536) : posé en carte réduite sur le décor du titre (le jeu
//  reste visible autour). On garde le haut de la page (cadre, boutons, médaillons) et on referme avec la bordure du bas
//  de l'image (sans les montagnes). Les boutons sont ceux de l'image ; au survol, le coup de pinceau grossit un peu.
// ---------------------------------------------------------------------
const MENU_IMG = { src: 'assets/menu-accueil.webp', w: 1024, h: 1536, coupe: 1165, bordure: 1488, k: 0.345, y: 362,
  boutons: [[95, 175, 945, 365], [145, 405, 895, 545], [145, 585, 895, 725], [145, 765, 895, 905]], // Jouer, Héritage, Classement, Options
  idee: [367, 1052, 70], bug: [664, 1052, 70] };
let imageMenu = null;
{ const img = new Image(); img.onload = () => { imageMenu = img; }; img.src = MENU_IMG.src; }
const decalageMenu = () => (W - MENU_IMG.w * MENU_IMG.k) / 2;
const versEcranMenu = ([x0, y0, x1, y1]) => { const k = MENU_IMG.k; return { x: decalageMenu() + x0 * k, y: MENU_IMG.y + y0 * k, w: (x1 - x0) * k, h: (y1 - y0) * k }; };
const rectMenuImg = i => imageMenu ? versEcranMenu(MENU_IMG.boutons[i]) : BTN_MENU(i);
const medaillonMenuImg = (m, defaut) => { if (!imageMenu) return defaut; const k = MENU_IMG.k; return { x: decalageMenu() + m[0] * k, y: MENU_IMG.y + m[1] * k, r: m[2] * k }; };
// Carte du menu préparée une fois : découpe (haut de page + bordure du bas, drapeau masqué), papier recoloré vers la
// teinte du décor du jeu, et bords fondus (dégradé irrégulier) pour ne pas former de rectangle.
const PAPIER_IMAGE_MENU = [238, 212, 178], PAPIER_DECOR = [241, 226, 205], FONDU_MENU = 46; // fondu en pixels d'écran
let carteMenu = null;
function preparerCarteMenu() {
  const I = MENU_IMG, e = 2 * I.k, bas = 150; // marge de papier vierge sous les médaillons ; résolution ×2 de l'affichage (écrans fins)
  const w = Math.round(I.w * e), h = Math.round((I.coupe + bas) * e), c = creerCanvas(w, h), k = c.getContext('2d');
  k.drawImage(imageMenu, 0, 0, I.w, I.coupe, 0, 0, w, I.coupe * e);
  k.drawImage(imageMenu, 52, 560, 100, 205, 52 * e, 962 * e, 100 * e, 205 * e); // le haut du drapeau, recouvert de papier vierge
  // marge sous les médaillons : papier uni de la couleur exacte du bas de l'image (pixels clairs des dernières lignes),
  // avec du grain, raccordé par un dégradé (sinon la jonction dessine un trait droit)
  const yc = Math.round(I.coupe * e), bande = k.getImageData(0, yc - Math.round(14 * e), w, Math.round(10 * e)).data;
  let pr = 0, pg = 0, pb = 0, np = 0;
  for (let i = 0; i < bande.length; i += 4) if (bande[i] + bande[i + 1] + bande[i + 2] > 3 * 190) { pr += bande[i]; pg += bande[i + 1]; pb += bande[i + 2]; np++; }
  const coulBas = `${pr / np | 0},${pg / np | 0},${pb / np | 0}`;
  k.fillStyle = `rgb(${coulBas})`; k.fillRect(0, yc, w, h - yc);
  for (let i = 0; i < w * (h - yc) / 60; i++) { k.fillStyle = `rgba(110,80,50,${Math.random() * 0.06})`; k.fillRect(Math.random() * w, yc + Math.random() * (h - yc), 1.5, 1.5); }
  const raccord = k.createLinearGradient(0, yc - 16 * e, 0, yc + 2);
  raccord.addColorStop(0, `rgba(${coulBas},0)`); raccord.addColorStop(1, `rgba(${coulBas},1)`);
  k.fillStyle = raccord; k.fillRect(0, yc - 16 * e, w, 16 * e + 2);
  const id = k.getImageData(0, 0, w, h), d = id.data, f = FONDU_MENU * 2;
  const ratio = PAPIER_DECOR.map((v, i) => v / PAPIER_IMAGE_MENU[i]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = (y * w + x) * 4, lum = (d[p] + d[p + 1] + d[p + 2]) / 3, t = clamp((lum - 80) / 140, 0, 1);
    for (let i = 0; i < 3; i++) d[p + i] = Math.min(255, d[p + i] * (1 + (ratio[i] - 1) * t));
    // bord fondu, un peu irrégulier (lavis)
    const dist = Math.min(x, y, w - 1 - x, h - 1 - y);
    if (dist < f) {
      const bruit = 0.5 + 0.28 * Math.sin(x * 0.043 + y * 0.029) + 0.22 * Math.sin(x * 0.011 - y * 0.067 + 1.7);
      const u = clamp((dist - f * 0.45 * bruit) / (f * 0.75), 0, 1);
      d[p + 3] = Math.round(d[p + 3] * u * u * (3 - 2 * u));
    }
  }
  k.putImageData(id, 0, 0);
  return { canvas: c, e };
}
function dessinerMenuImage() {
  const I = MENU_IMG, k = I.k, ox = decalageMenu();
  if (!carteMenu) carteMenu = preparerCarteMenu();
  const C = carteMenu.canvas, e = carteMenu.e;
  ctx.drawImage(C, ox, I.y, C.width / e * k, C.height / e * k);
  // survol : le bouton grossit un peu
  I.boutons.forEach(b => {
    const r = versEcranMenu(b); if (!dedans(souris, r)) return;
    const g = 1.06, cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    ctx.drawImage(C, b[0] * e, b[1] * e, (b[2] - b[0]) * e, (b[3] - b[1]) * e, cx - r.w * g / 2, cy - r.h * g / 2, r.w * g, r.h * g);
  });
  // sceaux en réserve : un petit sceau rouge au bout du bouton Héritage
  if (sceaux) {
    const r = versEcranMenu(I.boutons[1]), x = r.x + r.w - 6, y = r.y + 4;
    ctx.save(); ctx.fillStyle = ROUGE; ctx.beginPath(); ctx.arc(x, y, 12, 0, 7); ctx.fill(); ctx.restore();
    texte(String(sceaux), x, y + 1, sceaux > 99 ? 10 : 12, PAPIER, 'center', 'bold');
  }
}
// =====================================================================
//  PROFIL : pseudo + avatar, choisis avant la première partie (fenêtre « Votre profil », aussi depuis le badge en haut
//  à gauche de l'accueil). Les avatars sont des portraits tirés des dessins du jeu ; certains se débloquent avec le
//  temps de jeu total, la meilleure partie, le nombre de parties ou de jours où l'on a joué.
//  Mémorisé : 'muraille-profil' { pseudo, avatar, tempsTotal (s), parties, jours, dernierJour } ; le pseudo sert
//  aussi au classement ('muraille-pseudo').
// =====================================================================
const AVATARS = [
  { id: 'archer',    nom: 'Archer',          src: 'assets/archer-attente.png' },
  { id: 'gobelin',   nom: 'Gobelin',         src: 'assets/gobelin.png' },
  { id: 'corbeau',   nom: 'Corbeau',         src: 'assets/corbeau-droite.png', jours: 2 },
  { id: 'orc',       nom: 'Orc',             src: 'assets/orc.png',            meilleur: 5 * 60 },
  { id: 'rodeur',    nom: 'Rôdeur',          src: 'assets/rodeur.png',         total: 30 * 60 },
  { id: 'samourai',  nom: 'Samouraï',        src: 'assets/samourai-droite.png', parties: 5 },
  { id: 'bouclier',  nom: 'Porte-bouclier',  src: 'assets/bouclier.png',       meilleur: 10 * 60 },
  { id: 'faucon',    nom: 'Faucon',          icone: 'fauconnerie',             total: 60 * 60 },
  { id: 'troll',     nom: 'Troll',           src: 'assets/troll.png',          meilleur: 15 * 60 },
  { id: 'temple',    nom: 'Temple',          icone: 'temple',                  jours: 7 },
  { id: 'chef',      nom: 'Chef de guerre',  src: 'assets/chef.png',           meilleur: 20 * 60 },
  { id: 'baliste',   nom: 'Baliste',         src: 'assets/baliste.png',        parties: 25 },
  { id: 'dragon',    nom: 'Dragon',          dragon: true,                     meilleur: 30 * 60 },
  { id: 'pagode',    nom: 'Pagode',          icone: 'pagode',                  total: 5 * 3600 },
];
const jourDuJour = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
let profil = Object.assign({ pseudo: '', avatar: 'archer', tempsTotal: 0, parties: 0, jours: 0, dernierJour: '' }, lireLocal('muraille-profil', {}));
if (!profil.pseudo) profil.pseudo = nettoyerPseudo(lireLocal('muraille-pseudo', ''));
if (profil.dernierJour !== jourDuJour()) { profil.dernierJour = jourDuJour(); profil.jours++; }
function sauverProfil() { const { pseudo, avatar, tempsTotal, parties, jours, dernierJour, meilleur } = profil; ecrireLocal('muraille-profil', { pseudo, avatar, tempsTotal: Math.round(tempsTotal), parties, jours, dernierJour, meilleur: Math.round(meilleur || 0) }); }
sauverProfil();
const meilleurePartie = () => Math.max(record || 0, profil.meilleur || 0);
// condition de déblocage d'un avatar : [fait, objectif, libellé]
function conditionAvatar(a) {
  if (a.jours) return [profil.jours, a.jours, `jouer ${a.jours} jours différents`];
  if (a.meilleur) return [meilleurePartie(), a.meilleur, `tenir ${formatTemps(a.meilleur)} en une partie`];
  if (a.total) return [profil.tempsTotal, a.total, `${a.total >= 3600 ? a.total / 3600 + ' h' : a.total / 60 + ' min'} de jeu au total`];
  if (a.parties) return [profil.parties, a.parties, `jouer ${a.parties} parties`];
  return null;
}
const avatarDebloque = a => { const c = conditionAvatar(a); return !c || c[0] >= c[1]; };
const avatarDe = id => AVATARS.find(a => a.id === id) || AVATARS[0];
const dureeLisible = s => s >= 3600 ? `${Math.floor(s / 3600)} h ${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}` : `${Math.floor(s / 60)} min`;

// --- portraits : la première image de chaque planche, détourée automatiquement (premier dessin en haut à gauche)
const imagesAvatars = {};
for (const a of AVATARS) if (a.src) { const img = new Image(); img.onload = () => { try { imagesAvatars[a.id] = premierDessin(img); } catch (e) { /* ignoré */ } }; img.src = a.src; }
function premierDessin(img) {
  const w = img.width, h = img.height, c = creerCanvas(w, h), k = c.getContext('2d');
  k.drawImage(img, 0, 0);
  const d = k.getImageData(0, 0, w, h).data, plein = (x, y) => d[(y * w + x) * 4 + 3] > 60;
  const ligneVide = (y, xa, xb) => { for (let x = xa; x <= xb; x += 2) if (plein(x, y)) return false; return true; };
  const colVide = (x, ya, yb) => { for (let y = ya; y <= yb; y += 2) if (plein(x, y)) return false; return true; };
  // première bande de lignes non vide (assez haute), puis premier bloc de colonnes (assez large) dans cette bande
  let y0 = 0, y1 = h - 1;
  for (let y = 0, debut = -1; y < h; y++) {
    const vide = ligneVide(y, 0, w - 1);
    if (!vide && debut < 0) debut = y;
    if ((vide || y === h - 1) && debut >= 0) { if (y - debut > 20) { y0 = debut; y1 = y; break; } debut = -1; }
  }
  let x0 = 0, x1 = w - 1;
  for (let x = 0, debut = -1; x < w; x++) {
    const vide = colVide(x, y0, y1);
    if (!vide && debut < 0) debut = x;
    if ((vide || x === w - 1) && debut >= 0) { if (x - debut > 12) { x0 = debut; x1 = x; break; } debut = -1; }
  }
  if (x1 - x0 > (y1 - y0) * 1.8) x1 = x0 + Math.round((y1 - y0) * 1.2); // dessins collés : on garde le premier
  // resserrer en hauteur sur ce dessin
  while (y0 < y1 && ligneVide(y0, x0, x1)) y0++;
  while (y1 > y0 && ligneVide(y1, x0, x1)) y1--;
  const out = creerCanvas(x1 - x0 + 1, y1 - y0 + 1);
  out.getContext('2d').drawImage(c, x0, y0, x1 - x0 + 1, y1 - y0 + 1, 0, 0, x1 - x0 + 1, y1 - y0 + 1);
  return out;
}
function dessinAvatar(a) {
  if (a.dragon) { const d = imagesDragon && imagesDragon[0]; return d && (d.img || d); }
  if (a.icone) return maquettePrep && maquettePrep.icones[a.icone];
  return imagesAvatars[a.id];
}
// portrait rond : lavis du papier, le dessin au centre, anneau d'encre (gris si verrouillé)
function portraitAvatar(a, taille, verrou) {
  const c = creerCanvas(taille, taille), k = c.getContext('2d'), r = taille / 2;
  k.drawImage(fondLavisCercle(46), 0, 0, taille, taille);
  const im = dessinAvatar(a);
  if (im) {
    const e = Math.min(taille * 0.74 / im.width, taille * 0.74 / im.height);
    k.save(); k.beginPath(); k.arc(r, r, r - 2, 0, 7); k.clip();
    if (verrou) k.globalAlpha = 0.28;
    k.drawImage(im, r - im.width * e / 2, r - im.height * e / 2 + taille * 0.02, im.width * e, im.height * e);
    k.restore();
  } else { k.fillStyle = ENCRE; k.font = fonte('bold', taille * 0.4, SANS); k.textAlign = 'center'; k.textBaseline = 'middle'; k.fillText(a.nom[0], r, r); }
  k.lineWidth = Math.max(2, taille * 0.05); k.strokeStyle = verrou ? '#9d9285' : ENCRE; k.beginPath(); k.arc(r, r, r - k.lineWidth / 2, 0, 7); k.stroke();
  if (verrou) { k.save(); k.translate(r, r + 4); k.scale(taille / 110, taille / 110); const sv = ctx; k.strokeStyle = ENCRE; k.fillStyle = ENCRE; k.lineWidth = 3;
    k.beginPath(); k.arc(0, -8, 8, Math.PI, 0); k.stroke(); k.fillRect(-12, -8, 24, 18); k.fillStyle = PARCHEMIN; k.beginPath(); k.arc(0, 0, 3, 0, 7); k.fill(); k.restore(); }
  return c;
}

// --- badge en haut à gauche de l'accueil
const BADGE_PROFIL = { x: 12, y: 12, w: 220, h: 64 };
function dessinerBadgeProfil() {
  const B = BADGE_PROFIL, survol = dedans(souris, B), a = avatarDe(profil.avatar);
  ctx.save(); ctx.fillStyle = survol ? 'rgba(241,232,216,0.95)' : 'rgba(241,232,216,0.78)';
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(B.x, B.y, B.w, B.h, 32) : ctx.rect(B.x, B.y, B.w, B.h); ctx.fill();
  if (survol) { ctx.strokeStyle = ROUGE; ctx.lineWidth = 2; ctx.stroke(); }
  ctx.restore();
  ctx.drawImage(portraitAvatar(a, 56, false), B.x + 4, B.y + 4);
  texte(profil.pseudo || 'Créer mon profil', B.x + 70, B.y + 26, 18, profil.pseudo ? ENCRE : ROUGE, 'left', 'bold', SANS, B.w - 80);
  texte(profil.pseudo ? 'Profil et avatars' : 'pseudo et avatar', B.x + 70, B.y + 46, 12, '#7a6a55', 'left', 'italic', SERIF);
}

// --- fenêtre « Votre profil » (HTML, comme le classement : le clavier du téléphone s'ouvre pour le pseudo)
let profilOuvert = false, fenetreProfil = null, apresProfil = null;
function ouvrirProfil(puisJouer) {
  apresProfil = puisJouer ? () => { ecran = 'preparation'; } : null;
  const f = document.createElement('div');
  f.style.cssText = 'position:fixed;inset:0;background:rgba(27,23,25,.38);display:flex;justify-content:center;align-items:flex-start;padding-top:3vh;z-index:10';
  f.innerHTML = `<div data-p="carte" style="position:relative;width:min(98vw,560px);background:center/100% 100% no-repeat;padding:30px 36px 40px;box-sizing:border-box;color:#1b1719;font-family:Plume,Georgia,serif">
    <div style="max-height:calc(90vh - 70px);overflow:auto;scrollbar-width:none">
    <button data-p="fermer" aria-label="Fermer" style="position:absolute;top:22px;right:30px;width:38px;height:38px;border:0;background:transparent;font:26px Pinceau,sans-serif;color:#1b1719;cursor:pointer;line-height:1">✕</button>
    <div style="font:clamp(24px,6vw,34px) Pinceau,sans-serif;text-align:center;margin:0 40px">Votre profil</div>
    <div style="height:4px;width:40%;margin:4px auto 12px;background:#c0232b;border-radius:3px"></div>
    <div style="display:flex;align-items:center;gap:14px;justify-content:center;flex-wrap:wrap">
      <img data-p="choisi" style="width:84px;height:84px">
      <div><div style="font-size:clamp(15px,3.6vw,18px);color:#5a4632">Votre nom de guerrier</div>
      <input data-p="pseudo" maxlength="16" placeholder="Pseudo" style="font:clamp(18px,4.4vw,23px) Plume,Georgia,serif;padding:6px 10px;border:3px solid #1b1719;border-radius:8px;background:#fbf4e8;color:#1b1719;width:min(60vw,230px)"></div>
    </div>
    <div data-p="stats" style="text-align:center;font-size:clamp(13px,3.2vw,16px);color:#5a4632;margin:10px 0 6px"></div>
    <div style="margin:8px auto 4px;padding:8px 10px;max-width:420px;border-top:1px solid rgba(27,23,25,.18);border-bottom:1px solid rgba(27,23,25,.18);text-align:center">
      <div style="font:clamp(15px,3.6vw,18px) Pinceau,sans-serif">Sauvegarde en ligne</div>
      <div data-p="code" style="font-size:clamp(14px,3.4vw,17px);color:#3a3230;margin:3px 0"></div>
      <div style="font-size:clamp(12px,3vw,14px);color:#6a5a48">Sur un autre appareil, entrez votre code pour retrouver votre progression :</div>
      <input data-p="saisieCode" maxlength="14" placeholder="XXXX-XXXX-XXXX" style="font:clamp(15px,3.6vw,18px) Plume,Georgia,serif;padding:4px 8px;border:2px solid #1b1719;border-radius:6px;background:#fbf4e8;color:#1b1719;width:min(48vw,170px);text-transform:uppercase;margin-top:4px">
      <button data-p="recuperer" style="font:clamp(13px,3.2vw,16px) Pinceau,sans-serif;padding:6px 10px;margin-left:4px;border:2px solid #1b1719;background:#efe3cc;color:#1b1719;cursor:pointer">Récupérer</button>
      <div data-p="etatCode" style="font-size:clamp(12px,3vw,14px);color:#8e1a20;min-height:16px;margin-top:3px"></div>
    </div>
    <div style="font:clamp(17px,4vw,21px) Pinceau,sans-serif;text-align:center;margin:8px 0 6px">Avatars</div>
    <div data-p="grille" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:8px 4px"></div>
    <div data-p="titreSucces" style="font:clamp(17px,4vw,21px) Pinceau,sans-serif;text-align:center;margin:14px 0 6px"></div>
    <div data-p="succes" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px"></div>
    <div data-p="etat" style="text-align:center;color:#8e1a20;min-height:20px;margin-top:8px;font-size:clamp(14px,3.4vw,17px)"></div>
    <div style="text-align:center;margin-top:6px"><button data-p="valider" style="font:clamp(17px,4vw,22px) Pinceau,sans-serif;padding:10px 26px;border:0;background:#c0232b;color:#f3e4cf;cursor:pointer;border-radius:4px"></button></div>
    </div></div>`;
  const el = n => f.querySelector(`[data-p="${n}"]`);
  const carte = el('carte');
  new ResizeObserver(() => { const w = Math.round(carte.offsetWidth), h = Math.round(carte.offsetHeight); if (w && h && carte.dataset.taille !== `${w}x${h}`) { carte.dataset.taille = `${w}x${h}`; carte.style.backgroundImage = `url(${papierFondu(w, h, 56).toDataURL()})`; } }).observe(carte);
  let choix = avatarDebloque(avatarDe(profil.avatar)) ? profil.avatar : 'archer';
  const remplir = () => {
    el('choisi').src = portraitAvatar(avatarDe(choix), 168, false).toDataURL();
    el('grille').innerHTML = '';
    for (const a of AVATARS) {
      const ok = avatarDebloque(a), cond = conditionAvatar(a), d = document.createElement('button');
      d.style.cssText = `border:0;background:transparent;cursor:${ok ? 'pointer' : 'default'};padding:4px 2px;font-family:Plume,Georgia,serif;color:#1b1719;border-radius:10px;${a.id === choix ? 'outline:3px solid #c0232b;' : ''}`;
      const im = document.createElement('img'); im.src = portraitAvatar(a, 128, !ok).toDataURL(); im.style.cssText = 'width:64px;height:64px;display:block;margin:0 auto';
      const n = document.createElement('div'); n.textContent = a.nom; n.style.cssText = `font:bold 13px Pinceau,sans-serif;margin-top:2px;color:${ok ? '#1b1719' : '#9d9285'}`;
      d.append(im, n);
      if (!ok) {
        const c = document.createElement('div');
        const prog = cond[1] >= 60 && !a.jours && !a.parties ? `${dureeLisible(Math.min(cond[0], cond[1]))} / ${dureeLisible(cond[1])}` : `${Math.min(cond[0], cond[1])} / ${cond[1]}`;
        c.textContent = `${cond[2]} (${a.meilleur ? formatTemps(Math.min(cond[0], cond[1])) + ' / ' + formatTemps(cond[1]) : prog})`;
        c.style.cssText = 'font-size:11px;line-height:1.15;color:#8a7a68;margin-top:1px';
        d.append(c);
      } else d.onclick = () => { choix = a.id; remplir(); };
      el('grille').append(d);
    }
  };
  el('titreSucces').textContent = `Succès (${succes.obtenus.length} / ${SUCCES.length})`;
  for (const sx of SUCCES) {
    const ok = succesObtenu(sx.id); let p = [0, 1]; try { p = sx.prog(); } catch (e) { /* ignoré */ }
    const d = document.createElement('div');
    d.style.cssText = `padding:5px 7px;border-radius:8px;font-family:Plume,Georgia,serif;${ok ? 'background:rgba(201,150,46,.18);' : 'background:rgba(27,23,25,.05);'}`;
    const fait = sx.partie && !ok ? '' : ` (${sx.temps ? formatTemps(Math.min(p[0], p[1])) + ' / ' + formatTemps(p[1]) : Math.min(p[0], p[1]) + ' / ' + p[1]})`;
    d.innerHTML = `<div style="font:bold 14px Pinceau,sans-serif;color:${ok ? '#7a5410' : '#1b1719'}">${ok ? '✓ ' : ''}${sx.nom}</div>
      <div style="font-size:12.5px;color:#5a4632;line-height:1.15">${sx.desc}${ok ? '' : fait}</div>
      <div style="font-size:12px;color:#7a5410;margin-top:1px">+${sx.prix} pièces</div>`;
    el('succes').append(d);
  }
  el('stats').textContent = `Temps de jeu : ${dureeLisible(profil.tempsTotal)}  ·  Meilleure partie : ${formatTemps(meilleurePartie())}  ·  Parties : ${profil.parties}  ·  Jours : ${profil.jours}`;
  el('pseudo').value = profil.pseudo;
  el('valider').textContent = puisJouer ? 'Valider et jouer' : 'Valider';
  const valider = () => {
    const p = nettoyerPseudo(el('pseudo').value);
    if (!p) { el('etat').textContent = 'Choisissez un pseudo (16 lettres au plus).'; el('pseudo').focus(); return; }
    profil.pseudo = p; profil.avatar = choix; sauverProfil(); ecrireLocal('muraille-pseudo', p); sauverEnLigne(true);
    const suite = apresProfil; fermerProfil(); if (suite) suite();
  };
  el('valider').onclick = valider;
  el('code').textContent = codeSauvegarde ? `Votre code : ${codeLisible(codeSauvegarde)}${etatSauvegarde === 'ok' ? '  ✓ sauvegardé' : ''}` : 'Votre code sera créé dès que vous aurez un pseudo.';
  el('recuperer').onclick = async () => {
    el('etatCode').textContent = 'Recherche…';
    const msg = await recupererSauvegarde(el('saisieCode').value);
    el('etatCode').textContent = msg;
  };
  el('fermer').onclick = () => fermerProfil();
  el('pseudo').addEventListener('keydown', ev => { if (ev.key === 'Enter') valider(); if (ev.key === 'Escape') fermerProfil(); });
  f.addEventListener('pointerdown', ev => { if (ev.target === f) fermerProfil(); });
  remplir();
  document.body.appendChild(f); fenetreProfil = f; profilOuvert = true;
  if (!profil.pseudo) setTimeout(() => el('pseudo').focus(), 50);
}
function fermerProfil() { if (fenetreProfil && fenetreProfil.parentNode) fenetreProfil.remove(); fenetreProfil = null; profilOuvert = false; apresProfil = null; }
// « Jouer » : sans pseudo, on passe d'abord par le profil
function allerPreparer() { if (!profil.pseudo) ouvrirProfil(true); else ecran = 'preparation'; }
// =====================================================================
//  SAUVEGARDE EN LIGNE : la progression (record, pièces, cartes, héritage, profil, succès…) est copiée dans Supabase
//  sous un code secret de 12 caractères (localStorage 'muraille-code'), toutes les 20 s si elle a changé et à chaque
//  fin de partie. Au lancement, si la copie en ligne est plus récente (jouée sur un autre appareil), on la reprend.
//  Sur un nouvel appareil : fenêtre du profil → entrer son code → « Récupérer ». Script : classement/sauvegardes.sql.
//  Les réglages du son restent propres à chaque appareil.
// =====================================================================
const CLES_SAUVEGARDE = ['muraille-record', 'muraille-sceaux', 'muraille-heritage', 'muraille-pieces', 'muraille-cartes',
  'muraille-plateau', 'muraille-tuto', 'muraille-profil', 'muraille-pseudo', 'muraille-succes', 'muraille-defis'];
const ALPHABET_CODE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const lireBrut = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const ecrireBrut = (k, v) => { try { if (v === null || v === undefined) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* ignoré */ } };
let codeSauvegarde = (lireBrut('muraille-code') || '').toUpperCase();
let dernierEnvoi = '', etatSauvegarde = ''; // '' | 'ok' | 'hors ligne'
function nouveauCode() {
  const t = new Uint32Array(12); (crypto.getRandomValues ? crypto.getRandomValues(t) : t.forEach((_, i) => { t[i] = Math.random() * 1e9; }));
  return [...t].map(v => ALPHABET_CODE[v % ALPHABET_CODE.length]).join('');
}
const codeLisible = c => c ? c.match(/.{1,4}/g).join('-') : '';
function collecterSauvegarde() { const d = {}; for (const k of CLES_SAUVEGARDE) { const v = lireBrut(k); if (v !== null) d[k] = v; } return d; }
async function sauverEnLigne(force) {
  if (!classementEnLigne() || !profil.pseudo) return;
  if (!codeSauvegarde) { codeSauvegarde = nouveauCode(); ecrireBrut('muraille-code', codeSauvegarde); }
  const donnees = collecterSauvegarde(), texteD = JSON.stringify(donnees);
  if (!force && texteD === dernierEnvoi) return;
  try {
    const maj = await appelSupabase('rpc/sauver_profil', { method: 'POST', body: JSON.stringify({ p_cle: codeSauvegarde, p_pseudo: profil.pseudo, p_donnees: donnees }) });
    dernierEnvoi = texteD; ecrireBrut('muraille-synchro', String(Date.parse(maj) || Date.now())); etatSauvegarde = 'ok';
  } catch (e) { etatSauvegarde = 'hors ligne'; }
}
async function chargerEnLigne(code) {
  const r = await appelSupabase('rpc/charger_profil', { method: 'POST', body: JSON.stringify({ p_cle: code }) });
  return Array.isArray(r) && r.length ? { donnees: r[0].donnees, maj: Date.parse(r[0].maj) } : null;
}
function appliquerSauvegarde(donnees, maj) {
  for (const k of CLES_SAUVEGARDE) ecrireBrut(k, k in donnees ? donnees[k] : null);
  ecrireBrut('muraille-synchro', String(maj));
  location.reload();
}
// au lancement : reprendre la copie en ligne si elle est plus récente que la dernière synchronisation de cet appareil
(async () => {
  if (!codeSauvegarde || !classementEnLigne() || !location.protocol.startsWith('http')) return;
  try {
    const s = await chargerEnLigne(codeSauvegarde);
    if (s && s.maj > (+lireBrut('muraille-synchro') || 0) + 1000 && JSON.stringify(s.donnees) !== JSON.stringify(collecterSauvegarde())) appliquerSauvegarde(s.donnees, s.maj);
    else dernierEnvoi = s ? JSON.stringify(s.donnees) : '';
  } catch (e) { /* hors ligne : on garde la progression de cet appareil */ }
})();
setInterval(() => sauverEnLigne(false), 20000);
addEventListener('visibilitychange', () => { if (document.hidden) sauverEnLigne(false); });
// récupérer une progression avec un code (nouvel appareil)
async function recupererSauvegarde(saisie) {
  const code = String(saisie || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 12) return 'Le code fait 12 caractères (par exemple ABCD-EFGH-JKLM).';
  let s; try { s = await chargerEnLigne(code); } catch (e) { return 'Pas de connexion : réessayez plus tard.'; }
  if (!s) return 'Aucune sauvegarde avec ce code.';
  codeSauvegarde = code; ecrireBrut('muraille-code', code);
  appliquerSauvegarde(s.donnees, s.maj);
  return '';
}
// =====================================================================
//  SUCCÈS : objectifs récompensés en pièces, vérifiés chaque seconde en partie et à la fin. Annoncés par une bannière
//  (en jeu) ou sur l'écran de fin ; la liste et la progression sont dans la fenêtre du profil.
//  Mémorisé : 'muraille-succes' { obtenus: [ids], c: compteurs { kills, trolls, chefs, sorts, raz } }.
// =====================================================================
const SUCCES = [
  { id: 'sang',      nom: 'Premier sang',        desc: 'abattre un monstre',                   prix: 5,  prog: () => [C_SUCCES().kills, 1] },
  { id: 'chasseur',  nom: 'Chasseur',            desc: 'abattre 1 000 monstres (au total)',    prix: 15, prog: () => [C_SUCCES().kills, 1000] },
  { id: 'extermin',  nom: 'Exterminateur',       desc: 'abattre 10 000 monstres (au total)',   prix: 40, prog: () => [C_SUCCES().kills, 10000] },
  { id: 'trolls',    nom: 'Tueur de trolls',     desc: 'abattre 50 trolls',                    prix: 20, prog: () => [C_SUCCES().trolls, 50] },
  { id: 'regicide',  nom: 'Régicide',            desc: 'abattre un chef de guerre',            prix: 15, prog: () => [C_SUCCES().chefs, 1] },
  { id: 'tenir10',   nom: 'Sentinelle',          desc: 'tenir 10 minutes',                     prix: 10, prog: () => [meilleurePartie(), 600], temps: true },
  { id: 'tenir20',   nom: 'Gardien',             desc: 'tenir 20 minutes',                     prix: 25, prog: () => [meilleurePartie(), 1200], temps: true },
  { id: 'tenir30',   nom: 'Muraille vivante',    desc: 'tenir 30 minutes',                     prix: 50, prog: () => [meilleurePartie(), 1800], temps: true },
  { id: 'sorts',     nom: 'Maître des sorts',    desc: 'lancer 50 sorts',                      prix: 15, prog: () => [C_SUCCES().sorts, 50] },
  { id: 'raz',       nom: 'Vague d\'encre',      desc: 'lancer un raz-de-marée',               prix: 10, prog: () => [C_SUCCES().raz, 1] },
  { id: 'batisseur', nom: 'Bâtisseur',           desc: 'monter un bâtiment au niveau maximum', prix: 10, prog: () => [G && BATIMENTS.some(b => G.bat[b.id] >= b.max) ? 1 : 0, 1], partie: true },
  { id: 'imperial',  nom: 'Garde impériale',     desc: 'obtenir les archers impériaux',        prix: 20, prog: () => [G && archersImperiaux() ? 1 : 0, 1], partie: true },
  { id: 'sansrep',   nom: 'Pierre brute',        desc: 'tenir 10 minutes sans réparer',        prix: 25, prog: () => [G && !G.reparations ? Math.floor(G.t) : 0, 600], partie: true, temps: true },
  { id: 'alliances', nom: 'Diplomate',           desc: 'jouer avec 3 alliances actives',       prix: 10, prog: () => [G && G.alliances ? G.alliances.size : 0, 3], partie: true },
  { id: 'cartes',    nom: 'Collectionneur',      desc: 'débloquer 6 cartes',                   prix: 20, prog: () => [cartesDebloquees.size, 6] },
  { id: 'defi',      nom: 'Défi relevé',         desc: 'tenir 1 minute dans un défi du jour',  prix: 15, prog: () => [defisReleves(), 1] },
  { id: 'fidele',    nom: 'Fidèle',              desc: 'jouer 7 jours différents',             prix: 20, prog: () => [profil.jours, 7] },
];
let succes = Object.assign({ obtenus: [], c: {} }, lireLocal('muraille-succes', {}));
const C_SUCCES = () => Object.assign({ kills: 0, trolls: 0, chefs: 0, sorts: 0, raz: 0 }, succes.c);
function compterSucces(cle, n = 1) { succes.c[cle] = (succes.c[cle] || 0) + n; }
function sauverSucces() { ecrireLocal('muraille-succes', succes); }
const succesObtenu = id => succes.obtenus.includes(id);
// vérifie tous les succès ; ceux qui viennent d'être obtenus rapportent leurs pièces et sont annoncés
function verifierSucces() {
  const nouveaux = [];
  for (const s of SUCCES) {
    if (succesObtenu(s.id)) continue;
    let p; try { p = s.prog(); } catch (e) { continue; }
    if (p[0] >= p[1]) { succes.obtenus.push(s.id); pieces += s.prix; nouveaux.push(s); }
  }
  if (nouveaux.length) {
    sauverSucces(); sauverPieces();
    if (ecran === 'jeu' && G && !G.effondrement) banniere(`Succès : ${nouveaux.map(s => s.nom).join(', ')} (+${nouveaux.reduce((t, s) => t + s.prix, 0)} pièces)`, ROUGE);
    if (G) G.succesNouveaux = [...(G.succesNouveaux || []), ...nouveaux];
  }
  return nouveaux;
}
// =====================================================================
//  DÉFI DU JOUR : le même pour tout le monde (tiré de la date) : 4 cartes imposées (une par famille, même verrouillées)
//  et une règle spéciale. Badge en haut à droite de l'accueil → fenêtre (plateau, règle, meilleur temps, classement du
//  jour) → « Relever le défi ». Le premier défi d'au moins 1 minute de la journée rapporte DEFI_PRIX pièces.
//  Les scores de défi vont dans un classement du jour à part (colonne `defi`, classement/defis.sql) ; ils ne comptent
//  pas pour le record. Mémorisé : 'muraille-defis' { 'AAAA-MM-JJ': meilleur temps }.
// =====================================================================
const MODIFS_DEFI = [
  { id: 'sansRep',      nom: 'Pierre brute',     desc: 'la muraille ne peut pas être réparée' },
  { id: 'encreRare',    nom: 'Encre rare',       desc: 'les monstres rapportent 30 % d\'encre en moins' },
  { id: 'murFragile',   nom: 'Muraille fragile', desc: 'la muraille a 40 % de PV en moins' },
  { id: 'rapides',      nom: 'Hordes pressées',  desc: 'les monstres avancent 25 % plus vite' },
  { id: 'sansHeritage', nom: 'Sans héritage',    desc: 'les bonus d\'Héritage ne comptent pas' },
];
const DEFI_PRIX = 10;
let defiDemande = null;
const dateDefi = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function defiDuJour(date = dateDefi()) {
  let h = 2166136261; for (const ch of date) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  const alea = () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
  const plateau = {}; for (const fa of FAMILLES) plateau[fa.id] = fa.cartes[Math.floor(alea() * fa.cartes.length)];
  return { date, plateau, modif: MODIFS_DEFI[Math.floor(alea() * MODIFS_DEFI.length)] };
}
const defiModif = id => !!(G && G.defi && G.defi.modif.id === id);
let resultatsDefis = lireLocal('muraille-defis', {});
function lancerDefi() {
  const d = defiDuJour(), sauve = { ...PLATEAU };
  defiDemande = d; Object.assign(PLATEAU, d.plateau); composerPlateau(true); Object.assign(PLATEAU, sauve); // le plateau habituel reste intact
  lancerPartie();
}
// fin d'une partie de défi : meilleur temps du jour, récompense du premier défi relevé
function finDefi() {
  const d = G.defi.date, avant = resultatsDefis[d];
  resultatsDefis[d] = Math.max(avant || 0, Math.round(G.t));
  if (avant === undefined && G.t >= 60) { pieces += DEFI_PRIX; sauverPieces(); G.defiRecompense = DEFI_PRIX; }
  ecrireLocal('muraille-defis', resultatsDefis);
}
const defisReleves = () => Object.values(resultatsDefis).filter(t => t >= 60).length;

// --- badge en haut à droite de l'accueil
const BADGE_DEFI = { x: W - 12 - 200, y: 12, w: 200, h: 64 };
function dessinerBadgeDefi() {
  const B = BADGE_DEFI, survol = dedans(souris, B), d = defiDuJour(), fait = resultatsDefis[d.date] >= 60;
  ctx.save(); ctx.fillStyle = survol ? 'rgba(241,232,216,0.95)' : 'rgba(241,232,216,0.78)';
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(B.x, B.y, B.w, B.h, 32) : ctx.rect(B.x, B.y, B.w, B.h); ctx.fill();
  if (survol) { ctx.strokeStyle = ROUGE; ctx.lineWidth = 2; ctx.stroke(); }
  ctx.fillStyle = fait ? '#2f6b2a' : ROUGE; ctx.beginPath(); ctx.arc(B.x + B.w - 32, B.y + 32, 26, 0, 7); ctx.fill();
  ctx.restore();
  texte(fait ? '✓' : String(new Date().getDate()), B.x + B.w - 32, B.y + 33, fait ? 24 : 20, PAPIER, 'center', 'bold');
  texte('Défi du jour', B.x + B.w - 66, B.y + 25, 17, ENCRE, 'right', 'bold');
  texte(d.modif.nom, B.x + B.w - 66, B.y + 45, 12, '#7a6a55', 'right', 'italic', SERIF, B.w - 80);
}
// --- fenêtre du défi (HTML, comme le classement)
let defiOuvert = false, fenetreDefi = null;
function ouvrirDefi() {
  const d = defiDuJour(), f = document.createElement('div');
  const jour = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  f.style.cssText = 'position:fixed;inset:0;background:rgba(27,23,25,.38);display:flex;justify-content:center;align-items:flex-start;padding-top:4vh;z-index:10';
  const cartes = FAMILLES.map(fa => { const id = d.plateau[fa.id], ic = iconeCartePrep(id); const c = creerCanvas(96, 96), k = c.getContext('2d');
    k.drawImage(fondLavisCercle(46), 0, 0, 96, 96); const e = Math.min(64 / ic.width, 64 / ic.height); k.drawImage(ic, 48 - ic.width * e / 2, 48 - ic.height * e / 2, ic.width * e, ic.height * e);
    k.lineWidth = 3; k.strokeStyle = ENCRE; k.beginPath(); k.arc(48, 48, 46, 0, 7); k.stroke();
    return `<div style="text-align:center;width:22%"><img src="${c.toDataURL()}" style="width:min(18vw,74px)"><div style="font:bold clamp(12px,3vw,14px) Pinceau,sans-serif">${batimentDe(id).nom}</div><div style="font-size:11px;color:#7a6a55">${fa.nom}</div></div>`; }).join('');
  const mien = resultatsDefis[d.date];
  f.innerHTML = `<div data-d="carte" style="position:relative;width:min(98vw,540px);background:center/100% 100% no-repeat;padding:30px 36px 40px;box-sizing:border-box;color:#1b1719;font-family:Plume,Georgia,serif"><div style="max-height:calc(90vh - 70px);overflow:auto;scrollbar-width:none">
    <button data-d="fermer" aria-label="Fermer" style="position:absolute;top:22px;right:30px;width:38px;height:38px;border:0;background:transparent;font:26px Pinceau,sans-serif;color:#1b1719;cursor:pointer;line-height:1">✕</button>
    <div style="font:clamp(24px,6vw,32px) Pinceau,sans-serif;text-align:center;margin:0 40px">Défi du jour</div>
    <div style="text-align:center;color:#7a6a55;font-size:clamp(14px,3.4vw,17px)">${jour}</div>
    <div style="height:4px;width:40%;margin:6px auto 12px;background:#c0232b;border-radius:3px"></div>
    <div style="text-align:center;font-size:clamp(14px,3.4vw,17px);margin-bottom:6px">Plateau imposé (même les cartes verrouillées) :</div>
    <div style="display:flex;justify-content:space-around">${cartes}</div>
    <div style="text-align:center;margin:12px 0 4px;font:clamp(17px,4vw,21px) Pinceau,sans-serif;color:#c0232b">${d.modif.nom}</div>
    <div style="text-align:center;font-size:clamp(15px,3.6vw,18px)">${d.modif.desc}</div>
    <div style="text-align:center;font-size:clamp(14px,3.4vw,16px);color:#5a4632;margin-top:8px">${mien ? `Votre meilleur temps aujourd'hui : ${formatTemps(mien)}` : `Premier défi relevé du jour (1 min au moins) : +${DEFI_PRIX} pièces`}</div>
    <div style="font:clamp(16px,3.8vw,19px) Pinceau,sans-serif;text-align:center;margin:14px 0 4px">Classement du jour</div>
    <div data-d="liste" style="font-size:clamp(14px,3.4vw,17px)">Chargement…</div>
    <div style="text-align:center;margin-top:14px"><button data-d="relever" style="font:clamp(18px,4.2vw,23px) Pinceau,sans-serif;padding:10px 28px;border:0;background:#c0232b;color:#f3e4cf;cursor:pointer;border-radius:4px">Relever le défi</button></div>
    </div></div>`;
  const el = n => f.querySelector(`[data-d="${n}"]`), carte = el('carte');
  new ResizeObserver(() => { const w = Math.round(carte.offsetWidth), h = Math.round(carte.offsetHeight); if (w && h && carte.dataset.taille !== `${w}x${h}`) { carte.dataset.taille = `${w}x${h}`; carte.style.backgroundImage = `url(${papierFondu(w, h, 56).toDataURL()})`; } }).observe(carte);
  el('fermer').onclick = fermerDefi;
  f.addEventListener('pointerdown', ev => { if (ev.target === f) fermerDefi(); });
  el('relever').onclick = () => { fermerDefi(); if (!profil.pseudo) ouvrirProfil(false); else lancerDefi(); };
  document.body.appendChild(f); fenetreDefi = f; defiOuvert = true;
  // classement du jour
  (async () => {
    const echapper = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    let liste = null;
    if (classementEnLigne()) try { liste = await appelSupabase(`classement_defis?select=pseudo,duree,vague,avatar&defi=eq.${d.date}&order=duree.desc&limit=10`); } catch (e) { liste = null; }
    if (!el('liste')) return;
    el('liste').innerHTML = !liste ? '<div style="text-align:center;color:#7a6a55">Classement du jour indisponible pour le moment.</div>'
      : !liste.length ? '<div style="text-align:center;color:#7a6a55">Personne encore aujourd\'hui… Soyez le premier !</div>'
      : liste.map((sc, i) => `<div style="display:flex;align-items:center;gap:8px;padding:3px 6px;border-bottom:1px solid rgba(27,23,25,.12);${sc.pseudo.toLowerCase() === (profil.pseudo || '').toLowerCase() ? 'background:rgba(192,35,43,.12);' : ''}">
          <div style="width:24px;text-align:center;font:16px Pinceau,sans-serif">${i + 1}</div><img src="${imageAvatarClassement(sc.avatar)}" style="width:32px;height:32px">
          <div style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${echapper(sc.pseudo)}</div><div style="font:16px Pinceau,sans-serif">${formatTemps(sc.duree)}</div></div>`).join('');
  })();
}
function fermerDefi() { if (fenetreDefi && fenetreDefi.parentNode) fenetreDefi.remove(); fenetreDefi = null; defiOuvert = false; }
function dessinerAccueil() {
  const t = performance.now() / 1000;
  if (imageMenu && !sousMenu) {
    dessinerDecorTitre(t);
    if (record) texte(`Record : ${formatTemps(record)}`, W / 2, 300, 19, ROUGE, 'center', 'bold');
    texte('Défendez la muraille contre les hordes.', W / 2, 340, 18, ENCRE, 'center', 'italic', SERIF);
    dessinerMenuImage();
    dessinerBadgeProfil();
    dessinerBadgeDefi();
    if (heritageOuvert) dessinerHeritage();
    return;
  }
  dessinerDecorTitre(t);
  if (record) texte(`Record : ${formatTemps(record)}`, W / 2, 300, 19, ROUGE, 'center', 'bold');
  if (titreSousMenu()) texte(titreSousMenu(), W / 2, 340, 26, ENCRE, 'center', 'bold');
  else texte('Défendez la muraille contre les hordes.', W / 2, 340, 18, ENCRE, 'center', 'italic', SERIF);
  if (sousMenu) { dessinerFondSousMenu(); texte(titreSousMenu(), W / 2, 340, 26, ENCRE, 'center', 'bold'); dessinerSousMenu(); return; }
  const P = PANNEAU_ACCUEIL;
  if (!carteAccueil) {
    carteAccueil = creerCanvas(P.w + 24, P.h + 24); const k = carteAccueil.getContext('2d');
    k.fillStyle = 'rgba(243,232,210,0.95)'; k.fillRect(12, 12, P.w, P.h);
    for (let i = 0; i < 700; i++) { k.fillStyle = `rgba(110,80,50,${Math.random() * 0.07})`; k.fillRect(12 + Math.random() * P.w, 12 + Math.random() * P.h, 1.4, 1.4); }
    cadrePinceau(k, 12, 12, P.w, P.h, 4);
  }
  ctx.drawImage(carteAccueil, P.x - 12, P.y - 12);
  if (dessinerSousMenu()) return;
  boutonMenu(BTN_MENU(0), 'Jouer', 'rouge'); boutonMenu(BTN_MENU(1), `Héritage${sceaux ? ' (' + sceaux + ')' : ''}`); boutonMenu(BTN_MENU(2), 'Classement'); boutonMenu(BTN_MENU(3), 'Options');
  medaillonRetour(BTN_IDEE_ACC, 'idee', 'Une idée ?'); medaillonRetour(BTN_BUG_ACC, 'bug', 'Un bug ?');
  if (heritageOuvert) dessinerHeritage();
}
function clicAccueil(p) {
  if (heritageOuvert) { clicHeritage(p); return; }
  if (clicSousMenu(p)) return;
  if (dedans(p, BADGE_PROFIL)) { ouvrirProfil(false); return; }
  if (dedans(p, BADGE_DEFI)) { ouvrirDefi(); return; }
  if (dedans(p, rectMenuImg(0))) { allerPreparer(); return; }
  if (dedans(p, rectMenuImg(1))) { ouvrirHeritage(false); return; }
  if (dedans(p, rectMenuImg(2))) { ouvrirClassement(false); return; }
  if (dedans(p, rectMenuImg(3))) { sousMenu = 'options'; return; }
  if (surMedaillon(p, medaillonMenuImg(MENU_IMG.idee, BTN_IDEE_ACC))) ouvrirRetour('idee');
  else if (surMedaillon(p, medaillonMenuImg(MENU_IMG.bug, BTN_BUG_ACC))) ouvrirRetour('bug');
}
function dessinerTitre() {
  const t = performance.now() / 1000;
  dessinerDecorTitre(t);
  const lignes = [
    'Les hordes descendent sans fin vers votre muraille.',
    'Chaque monstre abattu se liquéfie en encre :',
    'récoltez-la pour bâtir mines, forge, caserne et atelier.',
    '',
    'Tenez le plus longtemps possible.',
  ];
  lignes.forEach((l, i) => texte(l, W / 2, 330 + i * 30, 19, ENCRE, 'center', 'italic', SERIF));
  if (record) texte(`Record : ${formatTemps(record)}`, W / 2, 510, 19, ROUGE, 'center', 'bold');
  const a = 0.55 + 0.45 * Math.sin(t * 3.3);
  ctx.globalAlpha = a; texte(`${CLIQUEZ} pour commencer`, W / 2, 575, 23, ENCRE, 'center', 'bold'); ctx.globalAlpha = 1;
  medaillonRetour(BTN_CLASSEMENT_TITRE, 'classement', 'Classement');
}

// =====================================================================
//  ÉCRAN « PRÉPARER LA MURAILLE » : un bâtiment par famille (la Caserne est toujours là)
// =====================================================================
// ---------------------------------------------------------------------
//  Écran « Préparer la muraille » d'après la maquette du joueur (assets/preparation.webp, 1024 × 1536).
//  On reprend de l'image : le haut (titre, sous-titre, croix, soleil), les étiquettes des familles, l'icône de chaque
//  carte, le cadre « Alliances actives » et le bouton « Partir au combat » ; les cartes elles-mêmes (nom, effet,
//  sélection, verrou) sont dessinées par le jeu dans le même style, avec les vrais effets.
// ---------------------------------------------------------------------
const MAQUETTE_PREP = {
  src: 'assets/preparation.webp', s: 0.703,                      // échelle maquette → écran (1024 → 720)
  haut: [0, 15, 1024, 232],
  familles: [[20, 280, 200, 192], [20, 518, 200, 200], [20, 760, 200, 192], [20, 994, 200, 182]],
  colonnes: [225, 431, 627, 821], largeurs: [188, 183, 180, 178], rangees: [280, 518, 760, 994],
  icone: [40, 10, 40], hauteursIcone: [80, 82, 72, 72],          // dans chaque carte : marge g., haut, marge d. ; hauteur par rangée (sans le nom peint)
  alliances: [46, 1214, 920, 120], cercles: [[650, 1275], [760, 1275], [868, 1275]], echelleBas: 0.6,
  bouton: [196, 1356, 628, 128],
};
const PREP_COLS = [158, 303, 441, 577], PREP_Y0 = 160, PREP_RANG = 160, PREP_CARTE = 132;
const RECT_ALLIANCES_PREP = { x: W / 2 - 920 * 0.6 / 2, y: 806, w: 920 * 0.6, h: 120 * 0.6 };
const BTN_PARTIR = { x: W / 2 - 628 * 0.6 / 2 + 12, y: 884, w: 628 * 0.6 - 24, h: 128 * 0.6 - 12 };
const BTN_FERMER_PREP = { x: 662, y: 0, w: 46, h: 40 };
let maquettePrep = null;
{ const img = new Image(); img.onload = () => { try { maquettePrep = preparerMaquettePrep(img); } catch (e) { maquettePrep = null; } }; img.src = MAQUETTE_PREP.src; }
function preparerMaquettePrep(img) {
  const M = MAQUETTE_PREP;
  const morceau = ([sx, sy, sw, sh], e, plume = 10) => { // morceau de l'image, bords fondus dans le papier
    const c = creerCanvas(Math.round(sw * e), Math.round(sh * e)), k = c.getContext('2d');
    k.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
    k.globalCompositeOperation = 'destination-in';
    for (const [x0, y0, x1, y1] of [[0, 0, plume, 0], [c.width, 0, c.width - plume, 0], [0, 0, 0, plume], [0, c.height, 0, c.height - plume]]) {
      const g = k.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)');
      k.fillStyle = g; k.fillRect(0, 0, c.width, c.height);
    }
    return c;
  };
  // icônes : le papier de la carte (couleur des coins du morceau) est retiré par remplissage depuis les bords
  const icone = (sx, sy, sw, sh) => {
    const c = creerCanvas(sw, sh), k = c.getContext('2d'); k.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    const id = k.getImageData(0, 0, sw, sh), d = id.data, fond = new Uint8Array(sw * sh), pile = [];
    const ref = [0, 1, 2].map(ch => (d[ch] + d[(sw - 1) * 4 + ch] + d[(sh - 1) * sw * 4 + ch] + d[(sh * sw - 1) * 4 + ch]) / 4);
    const ecart = p => Math.max(Math.abs(d[p * 4] - ref[0]), Math.abs(d[p * 4 + 1] - ref[1]), Math.abs(d[p * 4 + 2] - ref[2]));
    const clair = p => (d[p * 4] + d[p * 4 + 1] + d[p * 4 + 2]) / 3;
    for (let x = 0; x < sw; x++) pile.push(x, (sh - 1) * sw + x);
    for (let y = 0; y < sh; y++) pile.push(y * sw, y * sw + sw - 1);
    while (pile.length) {
      const p = pile.pop(); if (fond[p] || (ecart(p) > 46 && clair(p) < 200)) continue; fond[p] = 1; // papier, ou tout ce qui est clair
      const x = p % sw, y = (p - x) / sw;
      if (x > 0) pile.push(p - 1); if (x < sw - 1) pile.push(p + 1); if (y > 0) pile.push(p - sw); if (y < sh - 1) pile.push(p + sw);
    }
    for (let p = 0; p < sw * sh; p++) if (fond[p]) d[p * 4 + 3] = 0; else if (ecart(p) < 80) d[p * 4 + 3] = Math.min(255, Math.round(255 * (ecart(p) - 46) / 34 + 40));
    k.putImageData(id, 0, 0);
    return c;
  };
  const icones = {};
  FAMILLES.forEach((fa, fi) => fa.cartes.forEach((id, j) => {
    const x = M.colonnes[j], w = M.largeurs[j], y = M.rangees[fi], [mg, mh, md0] = M.icone, h = M.hauteursIcone[fi];
    const md = j === 0 ? 52 : md0; // 1re colonne : la maquette y a dessiné une coche rouge, on l'évite
    icones[id] = icone(x + mg, y + mh, w - mg - md, h);
  }));
  return {
    haut: morceau(M.haut, M.s, 14), familles: M.familles.map(r => morceau(r, M.s, 12)), icones,
    alliances: morceau(M.alliances, M.echelleBas, 8), bouton: morceau(M.bouton, M.echelleBas, 8),
  };
}
function partirAuCombat() {
  try { localStorage.setItem('muraille-plateau', JSON.stringify(PLATEAU)); } catch (e) { /* ignoré */ }
  composerPlateau(); lancerPartie();
}
// ---------------------------------------------------------------------
//  Écran de préparation : une rangée par famille montre la carte choisie ; la toucher ouvre le menu de sélection
//  de cette famille (ses 4 cartes avec effet, talent, alliances et verrou).
// ---------------------------------------------------------------------
let selectionFamille = null; // indice de la famille dont le menu de sélection est ouvert
const rectFamille = f => ({ x: PREP_COLS[0], y: PREP_Y0 + f * PREP_RANG, w: W - 18 - PREP_COLS[0], h: PREP_CARTE });
// les 4 cartes d'une famille, chacune dans un cercle (centres = colonnes de la maquette) ; nom en dessous
const RAYON_CERCLE_PREP = 46;
const cerclePrep = (f, j) => { const M = MAQUETTE_PREP; return { x: (M.colonnes[j] + M.largeurs[j] / 2) * M.s, y: PREP_Y0 + f * PREP_RANG + 50, r: RAYON_CERCLE_PREP }; };
const dansCercle = (p, c, m = 4) => Math.hypot(p.x - c.x, p.y - c.y) < c.r + m;
const familleDe = id => id === 'caserne' ? 'toujours présente' : (FAMILLES.find(fa => fa.cartes.includes(id)) || {}).nom || '';
function iconeCartePrep(id) { return (maquettePrep && maquettePrep.icones[id]) || iconesCartes[id]; }
const PANNEAU_SELECTION = { x: 34, y: 150, w: W - 68, h: 660 };
const rectOption = j => ({ x: PANNEAU_SELECTION.x + 18 + (j % 2) * ((PANNEAU_SELECTION.w - 46) / 2 + 10), y: PANNEAU_SELECTION.y + 78 + Math.floor(j / 2) * 284, w: (PANNEAU_SELECTION.w - 46) / 2, h: 272 });
const BTN_FERMER_SELECTION = { x: PANNEAU_SELECTION.x + PANNEAU_SELECTION.w - 50, y: PANNEAU_SELECTION.y + 12, w: 38, h: 38 };
// zone de toucher agrandie autour d'un petit bouton (les croix), pour le doigt sur téléphone
const dedansLarge = (p, r, m = 14) => p.x >= r.x - m && p.x <= r.x + r.w + m && p.y >= r.y - m && p.y <= r.y + r.h + m;
function clicPreparation(p) {
  if (selectionFamille !== null) { // menu de sélection ouvert
    const fa = FAMILLES[selectionFamille];
    if (dedansLarge(p, BTN_FERMER_SELECTION) || !dedans(p, PANNEAU_SELECTION)) { selectionFamille = null; return; }
    fa.cartes.forEach((id, j) => {
      if (!dedans(p, rectOption(j))) return;
      if (debloque(id)) { PLATEAU[fa.id] = id; selectionFamille = null; } else clicCarteVerrouillee(fa, id, rectOption(j));
    });
    return;
  }
  if (dedansLarge(p, BTN_FERMER_PREP)) { ecran = 'accueil'; sousMenu = null; return; }
  if (dedans(p, BTN_PARTIR)) { partirAuCombat(); return; }
  // un cercle : le choisir ; toucher la carte déjà choisie ouvre ses détails (effet, talent, alliances)
  FAMILLES.forEach((fa, f) => fa.cartes.forEach((id, j) => {
    const c = cerclePrep(f, j);
    if (!dansCercle(p, c, 8)) return;
    if (!debloque(id)) clicCarteVerrouillee(fa, id, { x: c.x - c.r, y: c.y - c.r, w: 2 * c.r, h: 2 * c.r });
    else if (PLATEAU[fa.id] === id) selectionFamille = f;
    else PLATEAU[fa.id] = id;
  }));
}
// carte verrouillée : 1er toucher = « Débloquer ? » (prix affiché), 2e toucher (dans les 4 s) = achat et choix
let achatEnAttente = null; // { id, t }
const achatDemande = id => achatEnAttente && achatEnAttente.id === id && performance.now() - achatEnAttente.t < 4000;
function clicCarteVerrouillee(fa, id, r) {
  if (pieces < prixCarte(id)) { refus(r); achatEnAttente = null; return; }
  if (!achatDemande(id)) { achatEnAttente = { id, t: performance.now() }; return; }
  achatEnAttente = null;
  if (acheterCarte(id)) PLATEAU[fa.id] = id;
}
function cadenas(x, y) {
  ctx.strokeStyle = ENCRE; ctx.fillStyle = ENCRE; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(x, y - 8, 8, Math.PI, 0); ctx.stroke();
  ctx.fillRect(x - 12, y - 8, 24, 18);
  ctx.fillStyle = PARCHEMIN; ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill();
}
function dessinerPreparation() {
  const M = MAQUETTE_PREP, mq = maquettePrep;
  // papier
  ctx.fillStyle = '#efe5d2'; ctx.fillRect(0, -DC, W, H + 2 * DC);
  const g = ctx.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, 640); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(110,80,45,0.22)');
  ctx.fillStyle = g; ctx.fillRect(0, -DC, W, H + 2 * DC);
  if (mq) ctx.drawImage(mq.haut, 0, 0);
  else { texte('Préparer la muraille', W / 2, 70, 34, ENCRE, 'center', 'bold'); texte('Choisissez vos constructions pour cette bataille.', W / 2, 130, 17, ENCRE, 'center', 'italic', SERIF); }
  const ouvert = selectionFamille !== null;
  let bulleCarte = null;
  // survol d'un cercle : les cartes qui peuvent s'allier avec elle seront entourées de vert
  alliesSurvol = null;
  if (!ouvert) FAMILLES.forEach((fa, f) => fa.cartes.forEach((id, j) => {
    if (dansCercle(souris, cerclePrep(f, j), 8)) alliesSurvol = new Set(ALLIANCES.filter(a => a.cartes.includes(id)).map(a => a.cartes.find(x => x !== id)));
  }));
  { ctx.font = fonte('bold', 20, SANS); const lib = String(pieces), lw = ctx.measureText(lib).width;
    ctx.save(); ctx.fillStyle = 'rgba(241,232,216,0.85)'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(10, 10, lw + 52, 36, 18) : ctx.rect(10, 10, lw + 52, 36); ctx.fill(); ctx.restore();
    iconePiece(ctx, 30, 28, 11); texte(lib, 48, 29, 20, '#7a5410', 'left', 'bold'); }
  const choisiesPlateau = ['caserne', ...FAMILLES.map(fa => PLATEAU[fa.id])];
  FAMILLES.forEach((fa, fi) => {
    const r = rectFamille(fi);
    ctx.strokeStyle = 'rgba(27,23,25,0.18)'; ctx.lineWidth = 1;                         // fine ligne entre familles
    if (fi > 0) { ctx.beginPath(); ctx.moveTo(20, r.y - 14); ctx.lineTo(W - 16, r.y - 14); ctx.stroke(); }
    if (mq) { const ef = etiquetteFondue(fi); ctx.drawImage(ef, 6, r.y - 2, ef.width, Math.min(ef.height, PREP_CARTE + 6)); }
    else texte(fa.nom, 78, r.y + PREP_CARTE / 2, 18, ENCRE, 'center', 'bold');
    const survolee = dessinerCerclesPrep(fa, fi, ouvert, choisiesPlateau);
    if (survolee) bulleCarte = survolee;
  });
  // cadre « Alliances actives » : une alliance par cercle (les icônes de ses deux cartes)
  const RA = RECT_ALLIANCES_PREP, eb = M.echelleBas;
  const choisies = ['caserne', ...FAMILLES.map(fa => PLATEAU[fa.id])], actives = alliancesDe(choisies);
  if (mq) ctx.drawImage(mq.alliances, RA.x, RA.y);
  else { ctx.strokeStyle = ENCRE; ctx.strokeRect(RA.x, RA.y, RA.w, RA.h); texte('Alliances actives', RA.x + 120, RA.y + RA.h / 2, 18, ENCRE, 'center', 'bold'); }
  const cercles = M.cercles.map(([cx, cy]) => ({ x: RA.x + (cx - M.alliances[0]) * eb, y: RA.y + (cy - M.alliances[1]) * eb, r: 23 }));
  let bulle = null;
  actives.slice(0, 3).forEach((a, k) => {
    const c = cercles[k];
    ctx.save(); ctx.fillStyle = 'rgba(192,35,43,0.14)'; ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, 7); ctx.fill(); ctx.restore();
    a.cartes.forEach((id, n) => {
      const ic = mq && mq.icones[id], t = 20;
      if (ic) ctx.drawImage(ic, c.x - t - 1 + n * (t + 2), c.y - t / 2, t, t * ic.height / ic.width);
    });
    if (Math.hypot(souris.x - c.x, souris.y - c.y) < c.r + 3) bulle = `${a.nom} (${a.cartes.map(id => batimentDe(id).nom).join(' + ')}) : ${a.desc}`;
  });
  if (actives.length > 3) texte(`+${actives.length - 3}`, cercles[2].x + 36, cercles[2].y, 16, ROUGE, 'left', 'bold');
  if (!actives.length) texte('aucune', cercles[1].x, cercles[1].y, 14, '#7a6a55', 'center', 'italic', SERIF);
  // bouton « Partir au combat »
  const sp = dedans(souris, BTN_PARTIR);
  if (mq) ctx.drawImage(mq.bouton, W / 2 - mq.bouton.width / 2, BTN_PARTIR.y - 6 - (sp ? 2 : 0));
  else { ctx.drawImage(boutonRouge(BTN_PARTIR.w, BTN_PARTIR.h), BTN_PARTIR.x - 6, BTN_PARTIR.y - 4); texte('Partir au combat', W / 2, BTN_PARTIR.y + BTN_PARTIR.h / 2, 21, PAPIER, 'center', 'bold'); }
  // carte survolée : son effet et ses alliances, dans une bulle au-dessus du cadre des alliances
  if (bulle && !ouvert) dessinerBullePrep([{ t: bulle, gras: true }]);
  else if (bulleCarte && !ouvert) dessinerBullePrep(bulleCarte);
  if (ouvert) dessinerSelectionFamille(choisies);
  if (refusAnim) {
    refusAnim.t += 1 / 60; const r = refusAnim.r;
    ctx.save(); ctx.globalAlpha = Math.max(0, 1 - refusAnim.t / 0.45); ctx.drawImage(cadreRouge(r.w, r.h), r.x - 12, r.y - 12); ctx.restore();
    if (refusAnim.t > 0.45) refusAnim = null;
  }
}
// une rangée : les 4 cartes de la famille dans des cercles ; la choisie est cerclée de rouge et cochée, les cartes
// encore verrouillées sont estompées avec un cadenas. Renvoie la bulle d'information de la carte survolée.
// Étiquettes de famille de la maquette (lavis gris) : bords estompés de façon irrégulière, comme les menus,
// pour qu'on ne voie plus leur carré. Préparées une fois.
const etiquettesFondues = [];
function etiquetteFondue(fi) {
  if (etiquettesFondues[fi]) return etiquettesFondues[fi];
  const src = maquettePrep.familles[fi], w = src.width, h = src.height, c = creerCanvas(w, h), k = c.getContext('2d');
  k.drawImage(src, 0, 0);
  // fondu large en haut et en bas (lavis), plus étroit sur les côtés (le nom de la famille touche presque le bord)
  const id = k.getImageData(0, 0, w, h), d = id.data, fh = 34, fl = 14;
  const lisse = (dist, fd, b) => { const u = clamp((dist - fd * 0.35 * b) / (fd * 0.75), 0, 1); return u * u * (3 - 2 * u); };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = Math.min(x, w - 1 - x), dy = Math.min(y, h - 1 - y); if (dx >= fl && dy >= fh) continue;
    const bruit = 0.5 + 0.28 * Math.sin(x * 0.11 + y * 0.07 + fi) + 0.22 * Math.sin(x * 0.03 - y * 0.15 + 1.7);
    const p = (y * w + x) * 4; d[p + 3] = Math.round(d[p + 3] * Math.min(lisse(dx, fl, bruit), lisse(dy, fh, bruit)));
  }
  k.putImageData(id, 0, 0);
  return (etiquettesFondues[fi] = c);
}
// Fond des cercles : l'étiquette « Économie » elle-même, dont on efface l'encre (icône et nom) : chaque pixel sombre
// prend la couleur du lavis de sa ligne (médiane des pixels clairs). Il reste le coup de lavis gris, posé dans le rond.
let lavisCercle = null;
function fondLavisCercle(r) {
  if (lavisCercle && lavisCercle.r === r) return lavisCercle.c;
  const c = creerCanvas(2 * r, 2 * r), k = c.getContext('2d'), src = maquettePrep && maquettePrep.familles[0];
  k.fillStyle = '#efe5d2'; k.fillRect(0, 0, 2 * r, 2 * r);
  if (src) {
    const w = src.width, h = src.height, net = creerCanvas(w, h), nk = net.getContext('2d');
    nk.drawImage(src, 0, 0);
    const id = nk.getImageData(0, 0, w, h), d = id.data, lum = p => (d[p] + d[p + 1] + d[p + 2]) / 3;
    let ref = null;
    for (let y = 0; y < h; y++) {
      const clairs = [];
      for (let x = 0; x < w; x++) { const p = (y * w + x) * 4; if (lum(p) >= 185 && d[p + 3] > 200) clairs.push(p); }
      if (clairs.length > 8) { clairs.sort((a, b) => lum(a) - lum(b)); const m = clairs[clairs.length >> 1]; ref = [d[m], d[m + 1], d[m + 2]]; }
      if (!ref) continue;
      for (let x = 0; x < w; x++) {
        const p = (y * w + x) * 4; if (lum(p) >= 185) continue;
        const v = (Math.random() - 0.5) * 6; d[p] = ref[0] + v; d[p + 1] = ref[1] + v; d[p + 2] = ref[2] + v;
      }
    }
    nk.putImageData(id, 0, 0);
    const e = (2 * r) / Math.min(w, h) * 1.08; // couvre tout le rond
    k.drawImage(net, r - w * e / 2, r - h * e / 2, w * e, h * e);
  }
  k.globalCompositeOperation = 'destination-in'; k.beginPath(); k.arc(r, r, r, 0, 7); k.fill();
  if (src) lavisCercle = { r, c }; return c; // (pas mis en cache tant que la maquette n'est pas chargée)
}
let alliesSurvol = null; // cartes alliables avec la carte survolée (cercle vert)
const VERT_ALLIANCE = '#3f8a3a';
function dessinerCerclesPrep(fa, fi, ouvert, choisies) {
  let bulle = null;
  fa.cartes.forEach((id, j) => {
    const c = cerclePrep(fi, j), b = batimentDe(id), ok = debloque(id), choisi = PLATEAU[fa.id] === id;
    const survol = !ouvert && dansCercle(souris, c, 8), dy = survol && ok ? -2 : 0, cy = c.y + dy;
    ctx.save();
    ctx.fillStyle = 'rgba(40,30,20,0.12)'; ctx.beginPath(); ctx.arc(c.x + 2, cy + 3, c.r, 0, 7); ctx.fill();
    ctx.drawImage(fondLavisCercle(c.r), c.x - c.r, cy - c.r); ctx.beginPath(); ctx.arc(c.x, cy, c.r, 0, 7);
    ctx.lineWidth = choisi ? 4.5 : 2.5; ctx.strokeStyle = choisi ? ROUGE : survol ? '#3a3230' : '#9d9285'; ctx.stroke();
    if (!ok) ctx.globalAlpha = 0.3;
    const ic = iconeCartePrep(id), t = c.r * 1.42, e = Math.min(t / ic.width, t / ic.height);
    ctx.drawImage(ic, c.x - ic.width * e / 2, cy - ic.height * e / 2, ic.width * e, ic.height * e);
    ctx.restore();
    if (!ok) { ctx.save(); ctx.translate(c.x, cy + 4); ctx.scale(0.8, 0.8); cadenas(0, 0); ctx.restore(); }
    if (alliesSurvol && alliesSurvol.has(id)) { // alliée possible de la carte survolée
      ctx.save(); ctx.strokeStyle = VERT_ALLIANCE; ctx.lineWidth = 4; ctx.globalAlpha = 0.75 + 0.25 * Math.sin(performance.now() / 180);
      ctx.beginPath(); ctx.arc(c.x, cy, c.r + 6, 0, 7); ctx.stroke(); ctx.restore();
    }
    if (choisi) {
      const bx = c.x + c.r * 0.72, by = cy - c.r * 0.72;
      ctx.fillStyle = ROUGE; ctx.beginPath(); ctx.arc(bx, by, 11, 0, 7); ctx.fill();
      ctx.strokeStyle = PARCHEMIN; ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(bx - 5, by); ctx.lineTo(bx - 1, by + 4); ctx.lineTo(bx + 5, by - 4); ctx.stroke();
    }
    texte(b.nom, c.x, c.y + c.r + 18, 15, choisi ? ROUGE : ok ? ENCRE : '#9d9285', 'center', 'bold', SANS, 132);
    if (!ok) {
      const demande = achatDemande(id), assez = pieces >= prixCarte(id), lib = demande ? `Débloquer ? ${prixCarte(id)}` : String(prixCarte(id));
      ctx.font = fonte('bold', 13, SANS); const lw = ctx.measureText(lib).width;
      iconePiece(ctx, c.x - lw / 2 - 6, c.y + c.r + 35, 7);
      texte(lib, c.x + 6, c.y + c.r + 35, 13, demande ? ROUGE : assez ? '#7a5410' : '#a89c8c', 'center', 'bold');
      if (demande) { ctx.save(); ctx.strokeStyle = ROUGE; ctx.lineWidth = 3; ctx.setLineDash([7, 5]); ctx.beginPath(); ctx.arc(c.x, cy, c.r + 5, 0, 7); ctx.stroke(); ctx.restore(); }
    }
    if (survol) {
      const al = ALLIANCES.filter(a => a.cartes.includes(id)).map(a => { const autre = a.cartes.find(x => x !== id); return `${a.nom} avec ${batimentDe(autre).nom} (${familleDe(autre)})`; });
      bulle = [{ t: `${b.nom} : ${b.resume}`, gras: true }];
      if (!ok) bulle.push({ t: pieces >= prixCarte(id) ? `Débloquer pour ${prixCarte(id)} pièces (vous en avez ${pieces}) : ${CLIQUEZ.toLowerCase()} deux fois.` : `Coûte ${prixCarte(id)} pièces (vous en avez ${pieces}). Chaque partie en rapporte.` });
      else if (al.length) bulle.push({ t: 'Alliances : ' + al.join(' · ') });
      bulle.push({ t: choisi ? `${CLIQUEZ} à nouveau pour voir le détail.` : `${CLIQUEZ} pour la choisir.` });
    }
  });
  return bulle;
}
// (ancienne rangée large, gardée pour référence) la carte choisie de la famille, en large, et « Changer ▸ »
function dessinerRangeePrep(fa, r, survol, choisies) {
  const id = PLATEAU[fa.id], b = batimentDe(id), dy = survol ? -2 : 0, x = r.x, y = r.y + dy;
  ctx.save();
  ctx.fillStyle = 'rgba(40,30,20,0.12)'; ctx.fillRect(x + 3, y + 4, r.w, r.h);
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, r.w, r.h, 8) : ctx.rect(x, y, r.w, r.h);
  ctx.fillStyle = '#f7efdf'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = survol ? ROUGE : '#8f8476'; ctx.stroke();
  ctx.restore();
  const ic = maquettePrep && maquettePrep.icones[id];
  if (ic) { const e = 0.95; ctx.drawImage(ic, x + 14, y + r.h / 2 - ic.height * e / 2, ic.width * e, ic.height * e); }
  else ctx.drawImage(iconesCartes[id], x + 10, y + 20, ICONE_W, ICONE_H);
  const tx = x + 130;
  texte(b.nom, tx, y + 30, 24, ENCRE, 'left', 'bold', SANS, 250);
  lignesDe(b.resume, 270, `italic 14px ${SERIF}`).slice(0, 2).forEach((l, k) => texte(l, tx, y + 60 + k * 18, 14, '#3a3230', 'left', 'italic', SERIF));
  const al = ALLIANCES.filter(a => a.cartes.includes(id) && a.cartes.every(c => choisies.includes(c)));
  if (al.length) texte(`Alliance${al.length > 1 ? 's' : ''} : ${al.map(a => a.nom).join(', ')}`, tx, y + 108, 13, ROUGE, 'left', 'bold', SERIF, 300);
  // à droite : « Changer » et les autres cartes de la famille en petit
  const xd = x + r.w - 118;
  texte('Changer ▸', xd + 52, y + 32, 17, survol ? ROUGE : '#5a4f45', 'center', 'bold');
  fa.cartes.filter(c => c !== id).forEach((c, k) => {
    const i2 = maquettePrep && maquettePrep.icones[c], t = 30, cx = xd + 18 + k * 36, cy = y + 64;
    ctx.save(); ctx.globalAlpha = debloque(c) ? 0.55 : 0.2;
    if (i2) ctx.drawImage(i2, cx - t / 2, cy, t, t * i2.height / i2.width);
    ctx.restore();
  });
}
// menu de sélection d'une famille : ses 4 cartes en détail, la carte choisie cochée
let fondSelection = null;
function dessinerSelectionFamille(choisies) {
  const fa = FAMILLES[selectionFamille], P = PANNEAU_SELECTION, m = 34;
  // même papier fondu que les autres menus (pas de cadre rectangulaire)
  ctx.fillStyle = 'rgba(27,23,25,0.3)'; ctx.fillRect(0, -DC, W, H + 2 * DC);
  if (!fondSelection) fondSelection = papierFondu(P.w + 2 * m, P.h + 2 * m, 56);
  ctx.drawImage(fondSelection, P.x - m, P.y - m);
  texte(fa.nom, W / 2, P.y + 36, 30, ENCRE, 'center', 'bold');
  ctx.fillStyle = ROUGE; ctx.fillRect(W / 2 - 50, P.y + 56, 100, 3);
  const bf = BTN_FERMER_SELECTION, survolX = dedansLarge(souris, bf);
  texte('✕', bf.x + bf.w / 2, bf.y + bf.h / 2 + 1, survolX ? 30 : 26, survolX ? ROUGE : ENCRE, 'center', 'bold');
  const autresChoisies = choisies.filter(c => c !== PLATEAU[fa.id]);
  fa.cartes.forEach((id, j) => {
    const r = rectOption(j), b = batimentDe(id), ok = debloque(id), choisi = PLATEAU[fa.id] === id, survol = ok && dedans(souris, r);
    const y = r.y + (survol ? -2 : 0);
    ctx.save();
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(r.x, y, r.w, r.h, 8) : ctx.rect(r.x, y, r.w, r.h);
    ctx.fillStyle = '#f9f2e4'; ctx.fill(); ctx.lineWidth = choisi ? 4 : 2; ctx.strokeStyle = choisi ? ROUGE : (survol ? '#3a3230' : '#9d9285'); ctx.stroke();
    ctx.restore();
    const ic = maquettePrep && maquettePrep.icones[id];
    if (ic) { const e = 0.85; ctx.drawImage(ic, r.x + r.w / 2 - ic.width * e / 2, y + 10, ic.width * e, ic.height * e); }
    else ctx.drawImage(iconesCartes[id], r.x + r.w / 2 - ICONE_W / 2, y + 10);
    const cx = r.x + r.w / 2;
    texte(b.nom, cx, y + 96, 22, ENCRE, 'center', 'bold', SANS, r.w - 20);
    let yy = y + 122;
    lignesDe(b.resume, r.w - 24, `italic 13px ${SERIF}`).slice(0, 2).forEach(l => { texte(l, cx, yy, 13, '#3a3230', 'center', 'italic', SERIF); yy += 16; });
    if (TALENTS[id]) { texte(`Talent : ${TALENTS[id].nom}`, cx, yy + 6, 12.5, '#2c4268', 'center', 'bold', SERIF, r.w - 20); yy += 22; }
    // alliances : le nom, puis l'icône de l'autre carte et sa famille (pour savoir où aller la chercher)
    for (const a of ALLIANCES.filter(a => a.cartes.includes(id)).slice(0, 3)) {
      const autre = a.cartes.find(c => c !== id), active = autresChoisies.includes(autre), coul = active ? ROUGE : '#6a5a48';
      texte(`${active ? '✓ ' : ''}${a.nom}`, cx, yy + 6, 12.5, coul, 'center', 'bold', SERIF, r.w - 16);
      const lib = `avec ${batimentDe(autre).nom} · ${familleDe(autre)}`, ia = iconeCartePrep(autre), t = 20;
      ctx.font = fonte('italic', 12, SERIF); const lw = Math.min(ctx.measureText(lib).width, r.w - 50), x0 = cx - (lw + t + 6) / 2;
      ctx.save(); if (!debloque(autre)) ctx.globalAlpha = 0.4; const e = Math.min(t / ia.width, t / ia.height);
      ctx.drawImage(ia, x0 + (t - ia.width * e) / 2, yy + 22 - ia.height * e / 2, ia.width * e, ia.height * e); ctx.restore();
      texte(lib, x0 + t + 6, yy + 22, 12, coul, 'left', 'italic', SERIF, r.w - 50);
      yy += 31;
    }
    if (!ok) {
      ctx.fillStyle = 'rgba(236,227,207,0.78)'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(r.x, y, r.w, r.h, 8) : ctx.rect(r.x, y, r.w, r.h); ctx.fill();
      cadenas(cx, y + 110);
      const demande = achatDemande(id), lib = demande ? `Débloquer ? ${prixCarte(id)} pièces` : `${prixCarte(id)} pièces pour débloquer`;
      ctx.font = fonte('bold', 15, SANS); const lw = ctx.measureText(lib).width;
      iconePiece(ctx, cx - lw / 2 - 8, y + 150, 9);
      texte(lib, cx + 8, y + 150, 15, demande || pieces >= prixCarte(id) ? ROUGE : '#8a7a68', 'center', 'bold');
    }
    if (choisi) {
      ctx.fillStyle = ROUGE; ctx.beginPath(); ctx.arc(r.x + r.w - 14, y + 14, 14, 0, 7); ctx.fill();
      ctx.strokeStyle = PARCHEMIN; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(r.x + r.w - 21, y + 14); ctx.lineTo(r.x + r.w - 15, y + 20); ctx.lineTo(r.x + r.w - 7, y + 8); ctx.stroke();
    }
  });
  texte(`${CLIQUEZ} une carte pour la choisir`, W / 2, P.y + P.h - 20, 14, '#7a6a55', 'center', 'italic', SERIF);
}
// bulle d'information posée sur le cadre des alliances (lignes de texte à la plume)
function dessinerBullePrep(entrees) {
  // chaque entrée est coupée en lignes (au plus 6 lignes en tout)
  const lignes = [];
  for (const l of entrees) for (const t of lignesDe(l.t, W - 60, `${l.gras ? 'bold' : 'italic'} 12.5px ${SERIF}`)) lignes.push({ t, gras: l.gras });
  lignes.length = Math.min(lignes.length, 6);
  const RA = RECT_ALLIANCES_PREP, n = lignes.length, h = 14 + n * 16, y = RA.y + RA.h - h - 2;
  ctx.save();
  ctx.fillStyle = 'rgba(247,239,223,0.97)'; ctx.strokeStyle = ENCRE; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(16, y, W - 32, h, 8) : ctx.rect(16, y, W - 32, h); ctx.fill(); ctx.stroke();
  ctx.restore();
  lignes.forEach((l, k) => texte(l.t, W / 2, y + 14 + k * 16, 12.5, l.gras ? ENCRE : '#6a5a48', 'center', l.gras ? 'bold' : 'italic', SERIF, W - 48));
}

let bandeauFin = null;
function dessinerFin() { dessinerJeu(); centrer(dessinerBilanFin); }
function dessinerBilanFin() {
  voile();
  if (!bandeauFin) bandeauFin = creerBandeau(ROUGE);
  ctx.drawImage(bandeauFin, W / 2 - 300, 320 - 48);
  texte('La muraille est tombée', W / 2, 321, 34, PAPIER, 'center', 'bold');
  texte(`Vous avez tenu ${formatTemps(G.t)}  ·  vague ${vague(G.t)}`, W / 2, 400, 24, ENCRE, 'center', '', SERIF);
  texte(`${G.kills} monstres abattus · ${nombre(G.orGagne)} gouttes d'encre · ${G.cristauxGagnes} cristaux`, W / 2, 440, 18, ENCRE, 'center', 'italic', SERIF, W - 40);
  texte(G.defi ? `Défi du jour (${G.defi.modif.nom})${G.defiRecompense ? ` : relevé ! +${G.defiRecompense} pièces` : ''}` : G.nouveauRecord ? 'Nouveau record !' : `Record : ${formatTemps(record)}`, W / 2, 490, 21, ROUGE, 'center', 'bold', SANS, W - 40);
  if (G.sceauxGagnes || G.piecesGagnees) texte(`+${G.sceauxGagnes || 0} sceaux d'héritage  ·  +${G.piecesGagnees || 0} pièces (${pieces} pour débloquer des cartes)`, W / 2, 528, 16, '#2c4268', 'center', 'bold', SERIF, W - 40);
  if (G.succesNouveaux && G.succesNouveaux.length) texte(`Succès : ${G.succesNouveaux.map(x => x.nom).join(', ')} (+${G.succesNouveaux.reduce((t, x) => t + x.prix, 0)} pièces)`, W / 2, 462, 15, '#7a5410', 'center', 'bold', SERIF, W - 40);
  if (G.avatarsNouveaux && G.avatarsNouveaux.length) texte(`Nouvel avatar débloqué : ${G.avatarsNouveaux.join(', ')} !`, W / 2, 552, 16, ROUGE, 'center', 'bold', SERIF, W - 40);
  texte(`${CLIQUEZ} pour préparer une nouvelle défense`, W / 2, 582, 21, ENCRE, 'center', 'bold');
  medaillonRetour(BTN_IDEE_FIN, 'idee', 'Une idée ?'); medaillonRetour(BTN_BUG_FIN, 'bug', 'Un bug ?');
  medaillonRetour(BTN_CLASSEMENT_FIN, 'classement', G.scoreInscrit ? 'Classement' : 'Inscrire mon score');
  if (G.inscription) texte({ 'en cours': 'Inscription au classement…', 'en ligne': `Score inscrit au classement mondial (${profil.pseudo}) ✓`,
    local: 'Score gardé sur cet appareil (classement en ligne injoignable)' }[G.inscription], W / 2, 614, 14, G.inscription === 'en ligne' ? '#2f6b2a' : '#7a6a55', 'center', 'italic bold', SERIF, W - 40);
  dessinerStatsFin();
  if (heritageOuvert) dessinerHeritage();
}
// « Ce qui a tenu la muraille » : les 5 sources de dégâts les plus fortes (barres), et la vie de la muraille au fil
// de la partie (courbe rouge, une valeur toutes les 5 s)
const CARTE_STATS = { x: 22, y: 724, w: W - 44, h: 222 };
let fondStats = null;
function dessinerStatsFin() {
  const st = Object.entries(G.stats || {}).filter(([, v]) => v > 0.5).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (!st.length && !(G.histoMur && G.histoMur.length > 1)) return;
  const R = CARTE_STATS, m = 24;
  if (!fondStats) fondStats = papierFondu(R.w + 2 * m, R.h + 2 * m, 40);
  ctx.drawImage(fondStats, R.x - m, R.y - m);
  texte('Ce qui a tenu la muraille', R.x + 26, R.y + 24, 18, ENCRE, 'left', 'bold');
  const total = st.reduce((t, [, v]) => t + v, 0) || 1, bx = R.x + 26, bw = 210;
  st.forEach(([nom, v], i) => {
    const y = R.y + 56 + i * 31, part = v / total;
    texte(nom, bx, y, 14, ENCRE, 'left', 'bold', SANS, 110);
    ctx.fillStyle = 'rgba(27,23,25,0.12)'; ctx.fillRect(bx + 114, y - 6, bw, 12);
    ctx.fillStyle = i === 0 ? ROUGE : '#3a3230'; ctx.fillRect(bx + 114, y - 6, Math.max(2, bw * part), 12);
    texte(`${Math.round(part * 100)} %`, bx + 114 + bw + 8, y, 13, '#5a4632', 'left', 'bold');
  });
  // courbe de la muraille
  const h = G.histoMur || [], cx = R.x + R.w - 250, cw = 222, cy = R.y + 52, ch = 120;
  texte('Muraille', cx, R.y + 24, 15, ENCRE, 'left', 'bold');
  ctx.save();
  ctx.strokeStyle = 'rgba(27,23,25,0.25)'; ctx.lineWidth = 1; ctx.strokeRect(cx, cy, cw, ch);
  ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(cx, cy + ch / 2); ctx.lineTo(cx + cw, cy + ch / 2); ctx.stroke(); ctx.setLineDash([]);
  if (h.length > 1) {
    ctx.strokeStyle = ROUGE; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.beginPath();
    h.forEach((v, i) => { const x = cx + i / (h.length - 1) * cw, y = cy + ch - v * ch; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
  }
  ctx.restore();
  texte('00:00', cx, cy + ch + 13, 11, '#7a6a55', 'left', 'italic', SERIF);
  texte(formatTemps(G.t), cx + cw, cy + ch + 13, 11, '#7a6a55', 'right', 'italic', SERIF);
  texte('100 %', cx - 4, cy + 4, 10, '#7a6a55', 'right', 'italic', SERIF);
}

// =====================================================================
//  BOUCLE
// =====================================================================
let dernier = performance.now();
function boucle(maintenant) {
  const dt = Math.min(0.05, (maintenant - dernier) / 1000);
  dernier = maintenant;
  if (ecran === 'titre') { fondTitre(performance.now() / 1000); centrer(dessinerTitre); }
  else if (ecran === 'accueil') { fondTitre(performance.now() / 1000); centrer(dessinerAccueil); }
  else if (ecran === 'preparation') { if (DC) { ctx.fillStyle = '#efe5d2'; ctx.fillRect(0, 0, W, H); } centrer(dessinerPreparation); }
  else if (ecran === 'fin') dessinerFin();
  else {
    // accéléré : on découpe le pas de temps pour garder une simulation stable (pas ≤ 1/60 s environ)
    majTuto();
    if (!G.effondrement) { // secousse (le pavillon qui s'effondre gère la sienne)
      G.secousse = Math.max(0, (G.secousse || 0) - dt * 14); const sc = G.secousse;
      canvas.style.transform = sc > 0.3 && !G.pause ? `translate(${rand(-sc, sc).toFixed(1)}px, ${rand(-sc, sc).toFixed(1)}px)` : '';
    }
    if (!G.pause && !G.choixNiveau && !G.reliquesOuvert && !tutoActif) {
      if (!G.effondrement) { profil.tempsTotal += dt; profil.aSauver = (profil.aSauver || 0) + dt; if (profil.aSauver > 10) { profil.aSauver = 0; sauverProfil(); sauverSucces(); } }
      G.verifSucces = (G.verifSucces || 0) + dt; if (G.verifSucces > 1) { G.verifSucces = 0; verifierSucces(); }
      const n = Math.ceil(G.vitesse);
      for (let i = 0; i < n && ecran === 'jeu' && !G.choixNiveau; i++) mettreAJour(dt * G.vitesse / n);
    }
    dessinerJeu();
    if (G.pause) centrer(dessinerPause);
    else if (tutoActif) dessinerTuto();
    else if (G.choixNiveau) centrer(dessinerChoixNiveau);
    else if (G.reliquesOuvert) centrer(dessinerReliques);
  }
  requestAnimationFrame(boucle);
}
requestAnimationFrame(boucle);
