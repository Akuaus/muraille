'use strict';
// =====================================================================
//  MURAILLE — musique de combat (aperçu, pas encore intégrée au jeu)
//  Entièrement synthétisée avec Web Audio : aucun fichier son.
//  Taiko, petits tambours, koto pincé (Karplus-Strong), flûte façon shakuhachi,
//  nappe de cordes, basse et cuivres ; gamme hirajoshi en ré mineur (ré mi fa la si♭).
//
//  Structure (32 mesures à 112 battements/min ≈ 69 s, puis boucle à partir de la mesure 4) :
//    0-3   Intro    gong, taiko lents, nappe sombre
//    4-11  Marche   ostinato de koto, taiko en marche, petits tambours
//    12-19 Thème    la flûte entre avec le thème, cuivres, basse
//    20-27 Assaut   tout l'orchestre, tambours en double croches, roulements
//    28-31 Pont     tension, roulement de taiko qui relance la boucle
// =====================================================================
(function (global) {
  const BPM = 112, PAS_PAR_MESURE = 16, DUREE_PAS = 60 / BPM / 4;
  const MESURES = 32, BOUCLE_DEBUT = 4;
  const SECTIONS = [
    { nom: 'Intro', debut: 0, fin: 4 }, { nom: 'Marche', debut: 4, fin: 12 }, { nom: 'Thème', debut: 12, fin: 20 },
    { nom: 'Assaut', debut: 20, fin: 28 }, { nom: 'Pont', debut: 28, fin: 32 },
  ];
  const sectionDe = m => SECTIONS.find(s => m >= s.debut && m < s.fin) || SECTIONS[0];

  // accords (notes MIDI) : i – VI – III – VII, la grille épique classique
  const ACCORDS = { Dm: [50, 53, 57], Bb: [46, 50, 53], F: [53, 57, 60], C: [48, 52, 55] };
  const GRILLE = ['Dm', 'Bb', 'F', 'C'];
  const accordDe = m => m < 4 ? 'Dm' : m >= 28 ? ['Dm', 'Bb', 'C', 'C'][m - 28] : GRILLE[(m - 4) % 4];

  // thème de flûte, 8 mesures : [pas de départ, note MIDI, durée en pas]
  const THEME = [
    [[0, 74, 6], [6, 77, 2], [8, 76, 4], [12, 74, 4]],
    [[0, 70, 8], [8, 69, 4], [12, 70, 4]],
    [[0, 72, 6], [6, 74, 2], [8, 77, 8]],
    [[0, 76, 4], [4, 74, 4], [8, 76, 8]],
    [[0, 81, 6], [6, 82, 2], [8, 81, 4], [12, 77, 4]],
    [[0, 74, 6], [6, 77, 2], [8, 74, 8]],
    [[0, 72, 4], [4, 74, 4], [8, 77, 4], [12, 81, 4]],
    [[0, 79, 8], [8, 76, 6], [14, 74, 2]],
  ];
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  function bufferBruit(ctx, duree) {
    const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duree), ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  function impulsion(ctx, duree) { // réverbération de grande salle : bruit stéréo qui décroît
    const n = Math.floor(ctx.sampleRate * duree), b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6); }
    return b;
  }
  // corde pincée (Karplus-Strong), calculée une fois par note
  function bufferCorde(ctx, midi) {
    const sr = ctx.sampleRate, n = Math.floor(sr * 1.8), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
    const periode = Math.max(2, Math.round(sr / mtof(midi)));
    for (let i = 0; i < periode; i++) d[i] = (Math.random() * 2 - 1) * (i < periode / 2 ? 1 : 0.6);
    // moyenne de deux échantillons consécutifs, une période plus tôt : la corde s'adoucit en s'éteignant
    for (let i = periode; i < n; i++) d[i] = 0.4983 * (d[i - periode] + d[Math.max(0, i - periode - 1)]);
    return b;
  }

  function creer(ctx, sortie) {
    // ---------- bus de mixage : maître → compresseur → sortie ; envoi vers la réverbération
    const maitre = ctx.createGain(); maitre.gain.value = 0.75;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.25; comp.knee.value = 8;
    maitre.connect(comp); comp.connect(sortie);
    const reverb = ctx.createConvolver(); reverb.buffer = impulsion(ctx, 2.8);
    const retour = ctx.createGain(); retour.gain.value = 0.32; reverb.connect(retour); retour.connect(maitre);
    const vers = (noeud, rev = 0, pan = 0) => {
      let n = noeud;
      if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; n.connect(p); n = p; }
      n.connect(maitre);
      if (rev) { const g = ctx.createGain(); g.gain.value = rev; n.connect(g); g.connect(reverb); }
    };
    const bruit = bufferBruit(ctx, 2), cordes = {};
    const env = (g, t, pic, attaque, chute) => {
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(pic, t + attaque);
      g.gain.exponentialRampToValueAtTime(0.0001, t + attaque + chute);
    };
    const sourceBruit = (t, duree) => { const s = ctx.createBufferSource(); s.buffer = bruit; s.start(t, Math.random()); s.stop(t + duree); return s; };

    // ---------- instruments
    function taiko(t, force) { // gros tambour : corps grave qui chute + claquement de peau
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(46, t + 0.28);
      env(g, t, 0.95 * force, 0.004, 0.95); o.connect(g); vers(g, 0.25);
      o.start(t); o.stop(t + 1.1);
      const o2 = ctx.createOscillator(), g2 = ctx.createGain();
      o2.type = 'triangle'; o2.frequency.setValueAtTime(190, t); o2.frequency.exponentialRampToValueAtTime(80, t + 0.12);
      env(g2, t, 0.35 * force, 0.002, 0.25); o2.connect(g2); vers(g2, 0.2);
      o2.start(t); o2.stop(t + 0.35);
      const n = sourceBruit(t, 0.2), f = ctx.createBiquadFilter(), gn = ctx.createGain();
      f.type = 'lowpass'; f.frequency.value = 900; env(gn, t, 0.45 * force, 0.002, 0.12);
      n.connect(f); f.connect(gn); vers(gn, 0.2);
    }
    function shime(t, force, pan = 0.25) { // petit tambour aigu et sec
      const n = sourceBruit(t, 0.12), f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = 1.4; env(g, t, 0.5 * force, 0.001, 0.07);
      n.connect(f); f.connect(g); vers(g, 0.15, pan);
      const o = ctx.createOscillator(), go = ctx.createGain();
      o.frequency.setValueAtTime(700, t); o.frequency.exponentialRampToValueAtTime(420, t + 0.05);
      env(go, t, 0.22 * force, 0.001, 0.06); o.connect(go); vers(go, 0.15, pan); o.start(t); o.stop(t + 0.1);
    }
    function gong(t, force = 1) { // partiels inharmoniques qui s'éteignent lentement
      for (const [k, v] of [[1, 0.5], [1.47, 0.3], [2.09, 0.25], [2.56, 0.18], [3.21, 0.12], [4.1, 0.08]]) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = 82 * k * (1 + (Math.random() - 0.5) * 0.004);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16 * v * force, t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 4.5 / Math.sqrt(k));
        o.connect(g); vers(g, 0.55); o.start(t); o.stop(t + 5);
      }
      const n = sourceBruit(t, 1.6), f = ctx.createBiquadFilter(), gn = ctx.createGain();
      f.type = 'bandpass'; f.frequency.value = 3200; f.Q.value = 0.8; env(gn, t, 0.12 * force, 0.01, 1.4);
      n.connect(f); f.connect(gn); vers(gn, 0.6);
    }
    function koto(t, midi, vol, pan = -0.2) { // corde pincée, petit glissé à l'attaque
      const s = ctx.createBufferSource(); s.buffer = cordes[midi] || (cordes[midi] = bufferCorde(ctx, midi));
      s.playbackRate.setValueAtTime(1.012, t); s.playbackRate.exponentialRampToValueAtTime(1, t + 0.06);
      const f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = 'lowpass'; f.frequency.value = 3400; g.gain.value = vol;
      s.connect(f); f.connect(g); vers(g, 0.3, pan); s.start(t); s.stop(t + 1.8);
    }
    function nappe(t, notes, duree, clair) { // cordes : scies désaccordées, attaque lente
      const f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = 'lowpass'; f.frequency.value = clair ? 2300 : 950; f.Q.value = 0.6;
      // volume de la nappe réduit de 60 % (elle sonnait comme un orgue trop présent) : 0,075 / 0,06 → 0,03 / 0,024
      const vol = clair ? 0.03 : 0.024;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.45);
      g.gain.setValueAtTime(vol, t + duree - 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t + duree + 0.5);
      f.connect(g); vers(g, 0.45);
      for (const m of [notes[0] - 12, ...notes, notes[0] + 12]) for (const d of [-7, 7]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = d;
        o.connect(f); o.start(t); o.stop(t + duree + 0.6);
      }
    }
    function basse(t, midi, duree) {
      const o = ctx.createOscillator(), sub = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = mtof(midi - 12); sub.type = 'sine'; sub.frequency.value = mtof(midi - 12);
      f.type = 'lowpass'; f.frequency.setValueAtTime(600, t); f.frequency.exponentialRampToValueAtTime(180, t + 0.15);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.28, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.12, t + duree * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + duree + 0.08);
      o.connect(f); sub.connect(f); f.connect(g); vers(g, 0.05);
      o.start(t); sub.start(t); o.stop(t + duree + 0.1); sub.stop(t + duree + 0.1);
    }
    function cuivre(t, notes, duree, force = 1) { // accords cuivrés, filtre qui s'ouvre
      const f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = 'lowpass'; f.Q.value = 1.2;
      f.frequency.setValueAtTime(350, t); f.frequency.exponentialRampToValueAtTime(2000 * force, t + 0.08); f.frequency.exponentialRampToValueAtTime(800, t + duree);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.13 * force, t + 0.04);
      g.gain.setValueAtTime(0.11 * force, t + duree * 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + duree + 0.25);
      f.connect(g); vers(g, 0.35);
      for (const m of [notes[0] - 12, ...notes]) for (const d of [-5, 5]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = d;
        o.connect(f); o.start(t); o.stop(t + duree + 0.3);
      }
    }
    function flute(t, midi, duree, vol) { // shakuhachi : glissé vers la note, souffle, vibrato qui arrive
      const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
      o.type = 'triangle'; o2.type = 'sine';
      for (const x of [o, o2]) { x.frequency.setValueAtTime(mtof(midi) * 0.975, t); x.frequency.exponentialRampToValueAtTime(mtof(midi), t + 0.07); }
      lfo.frequency.value = 5.4; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(mtof(midi) * 0.006, t + Math.min(0.35, duree * 0.6));
      lfo.connect(lg); lg.connect(o.frequency); lg.connect(o2.frequency);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.07);
      g.gain.setValueAtTime(vol * 0.85, t + Math.max(0.08, duree - 0.08)); g.gain.exponentialRampToValueAtTime(0.0001, t + duree + 0.18);
      o.connect(g); o2.connect(g); vers(g, 0.5, 0.15);
      const n = sourceBruit(t, duree + 0.2), fb = ctx.createBiquadFilter(), gb = ctx.createGain();
      fb.type = 'bandpass'; fb.frequency.value = mtof(midi) * 2; fb.Q.value = 2; env(gb, t, vol * 0.35, 0.03, duree + 0.1);
      n.connect(fb); fb.connect(gb); vers(gb, 0.5, 0.15);
      for (const x of [o, o2, lfo]) { x.start(t); x.stop(t + duree + 0.25); }
    }

    // ---------- partition : appelée pour chaque double croche (16 pas par mesure)
    const ARPEGE = [0, 1, 2, 1, 3, 2, 1, 2];
    function programmerPas(mesure, pas, t) {
      const nomSec = sectionDe(mesure).nom, ac = ACCORDS[accordDe(mesure)];
      const tons = [ac[0] + 12, ac[1] + 12, ac[2] + 12, ac[0] + 24];
      const D = DUREE_PAS;

      if (nomSec === 'Intro') {
        if (pas === 0) { taiko(t, 1); nappe(t, ac, D * 16, false); if (mesure === 0) gong(t, 1); }
        if (mesure >= 2 && pas === 8) taiko(t, 0.7);
        if (mesure === 3 && pas >= 8) shime(t, 0.3 + (pas - 8) * 0.08);
        if (mesure >= 2 && pas % 4 === 0) koto(t, tons[(pas / 4) % 3], 0.18);
        return;
      }
      if (nomSec === 'Marche') {
        if (mesure === 4 && pas === 0) gong(t, 0.8);
        const tk = { 0: 1, 6: 0.55, 8: 0.85, 11: 0.45, 14: 0.55 }[pas]; if (tk) taiko(t, tk);
        if (pas % 2 === 0) shime(t, pas % 8 === 4 ? 0.55 : 0.3);
        if (pas % 2 === 0) koto(t, tons[ARPEGE[pas / 2]], 0.22);
        if (pas === 0) nappe(t, ac, D * 16, false);
        if (mesure >= 8 && (pas === 0 || pas === 8)) basse(t, ac[0], D * 6);
        return;
      }
      if (nomSec === 'Thème') {
        if (mesure === 12 && pas === 0) gong(t, 0.9);
        const tk = { 0: 1, 3: 0.45, 6: 0.55, 8: 0.9, 11: 0.5, 14: 0.6 }[pas]; if (tk) taiko(t, tk);
        if (pas % 2 === 0) shime(t, pas % 8 === 4 ? 0.55 : 0.28);
        if (pas % 2 === 0) koto(t, tons[ARPEGE[pas / 2]], 0.15);
        if (pas === 0) nappe(t, ac, D * 16, true);
        if ([0, 3, 8, 11].includes(pas)) basse(t, ac[0], D * 2.5);
        if (pas === 0) cuivre(t, ac, D * 3); if (pas === 10) cuivre(t, ac, D * 2, 0.8);
        for (const [p, m, d] of THEME[mesure - 12]) if (p === pas) flute(t, m, d * D, 0.13);
        return;
      }
      if (nomSec === 'Assaut') {
        if (mesure === 20 && pas === 0) gong(t, 1);
        const fill = mesure % 4 === 3 && pas >= 8;
        const tk = fill ? 0.5 + (pas - 8) * 0.06 : { 0: 1, 3: 0.6, 6: 0.8, 8: 1, 10: 0.6, 12: 0.9, 14: 0.7 }[pas]; if (tk) taiko(t, tk);
        shime(t, pas % 4 === 0 ? 0.6 : 0.3, pas % 2 ? -0.25 : 0.25);
        koto(t, tons[ARPEGE[(pas >> 1) % 8]], 0.13);
        if (pas === 0) nappe(t, ac, D * 16, true);
        if ([0, 3, 6, 8, 11, 14].includes(pas)) basse(t, ac[0], D * 2);
        if (pas === 0) cuivre(t, ac, D * 3, 1.1); if (pas === 6) cuivre(t, ac, D * 2, 0.9); if (pas === 10) cuivre(t, ac, D * 4, 1);
        for (const [p, m, d] of THEME[mesure - 20]) if (p === pas) { flute(t, m, d * D, 0.16); koto(t, m - 12, 0.2, 0.2); }
        return;
      }
      // Pont : tension, puis roulement qui relance la boucle
      if (pas === 0) { taiko(t, 1); nappe(t, ac, D * 16, false); cuivre(t, ac, D * 14, 0.7); }
      if (pas === 8 && mesure < 31) taiko(t, 0.8);
      if (mesure >= 30) shime(t, 0.25 + (mesure - 30) * 0.2 + pas * 0.015);
      if (mesure === 31 && pas % 2 === 0) taiko(t, 0.4 + pas * 0.04);
    }

    return { programmerPas, maitre };
  }

  global.MusiqueCombat = { creer, BPM, DUREE_PAS, PAS_PAR_MESURE, MESURES, BOUCLE_DEBUT, SECTIONS, sectionDe };
})(window);
