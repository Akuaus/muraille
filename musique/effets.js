'use strict';
// =====================================================================
//  MURAILLE — bruitages (aperçu, pas encore intégrés au jeu)
//  Synthétisés avec Web Audio, aucun fichier son. Chaque appel varie un peu (hauteur, durée, volume)
//  pour que 20 archers qui tirent ensemble ne sonnent pas comme une mitraillette.
//
//    Effets.fleche(ctx, sortie, t)        corde d'arc qui claque + sifflement de la flèche
//    Effets.flecheFeu(ctx, sortie, t)     claquement + souffle de feu qui gronde et crépite
//    Effets.murLame(ctx, sortie, t)       petit monstre : lame qui tinte sur la pierre
//    Effets.murMassue(ctx, sortie, t)     gros monstre : impact sourd + éboulis de pierres
// =====================================================================
(function (global) {
  const alea = (a, b) => a + Math.random() * (b - a);
  const bruits = new WeakMap(); // un tampon de bruit blanc par contexte audio
  function bruit(ctx) {
    if (!bruits.has(ctx)) {
      const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      bruits.set(ctx, b);
    }
    return bruits.get(ctx);
  }
  function sourceBruit(ctx, t, duree) {
    const s = ctx.createBufferSource(); s.buffer = bruit(ctx); s.start(t, Math.random() * 1.5); s.stop(t + duree + 0.05); return s;
  }
  // enveloppe percussive : montée très courte puis extinction exponentielle
  function env(g, t, pic, attaque, chute) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(pic, t + attaque);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attaque + chute);
  }
  function chaine(ctx, sortie, ...noeuds) { for (let i = 0; i < noeuds.length - 1; i++) noeuds[i].connect(noeuds[i + 1]); noeuds[noeuds.length - 1].connect(sortie); }

  // ---------- corde d'arc : « tchoung » grave et bref
  function corde(ctx, sortie, t, vol) {
    const f0 = alea(150, 185);
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = 'triangle'; o.frequency.setValueAtTime(f0 * 1.6, t); o.frequency.exponentialRampToValueAtTime(f0, t + 0.04);
    f.type = 'lowpass'; f.frequency.value = 1400;
    env(g, t, 0.5 * vol, 0.002, alea(0.12, 0.16));
    chaine(ctx, sortie, o, f, g); o.start(t); o.stop(t + 0.25);
    // petit claquement de la corde
    const n = sourceBruit(ctx, t, 0.03), fn = ctx.createBiquadFilter(), gn = ctx.createGain();
    fn.type = 'bandpass'; fn.frequency.value = 1800; fn.Q.value = 1.2; env(gn, t, 0.35 * vol, 0.001, 0.025);
    chaine(ctx, sortie, n, fn, gn);
  }
  // ---------- sifflement : bruit filtré qui glisse de l'aigu vers le médium
  function sifflement(ctx, sortie, t, vol, duree) {
    const n = sourceBruit(ctx, t, duree), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'bandpass'; f.Q.value = 6;
    f.frequency.setValueAtTime(alea(4200, 5200), t); f.frequency.exponentialRampToValueAtTime(alea(1400, 1900), t + duree);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22 * vol, t + duree * 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
    chaine(ctx, sortie, n, f, g);
  }

  function fleche(ctx, sortie, t = ctx.currentTime, vol = 1) {
    vol *= alea(0.85, 1.05);
    corde(ctx, sortie, t, vol);
    sifflement(ctx, sortie, t + 0.015, vol, alea(0.22, 0.3));
  }

  function flecheFeu(ctx, sortie, t = ctx.currentTime, vol = 1) {
    vol *= alea(0.85, 1.05);
    corde(ctx, sortie, t, vol * 0.9);
    sifflement(ctx, sortie, t + 0.015, vol * 0.6, 0.28);
    // souffle du feu : bruit grave qui gronde (le volume ondule comme une flamme)
    const d = alea(0.45, 0.6);
    const n = sourceBruit(ctx, t, d), f = ctx.createBiquadFilter(), g = ctx.createGain(), mod = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    f.type = 'lowpass'; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(350, t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5 * vol, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    lfo.frequency.value = alea(14, 22); lg.gain.value = 0.35; mod.gain.value = 0.65;
    lfo.connect(lg); lg.connect(mod.gain);
    chaine(ctx, sortie, n, f, mod, g); lfo.start(t); lfo.stop(t + d + 0.05);
    // crépitements : petits craquements secs et aléatoires
    for (let i = 0, k = Math.floor(alea(5, 9)); i < k; i++) {
      const tc = t + alea(0.02, d * 0.8), c = sourceBruit(ctx, tc, 0.012), fc = ctx.createBiquadFilter(), gc = ctx.createGain();
      fc.type = 'highpass'; fc.frequency.value = alea(2500, 5000); env(gc, tc, alea(0.15, 0.35) * vol, 0.0008, alea(0.006, 0.014));
      chaine(ctx, sortie, c, fc, gc);
    }
  }

  // ---------- impact sur la pierre (commun aux deux attaques)
  function pierre(ctx, sortie, t, vol, grave) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(grave ? 110 : 190, t); o.frequency.exponentialRampToValueAtTime(grave ? 38 : 80, t + (grave ? 0.18 : 0.08));
    env(g, t, (grave ? 0.5 : 0.45) * vol, 0.003, grave ? 0.35 : 0.14);
    chaine(ctx, sortie, o, g); o.start(t); o.stop(t + 0.5);
    const n = sourceBruit(ctx, t, 0.15), f = ctx.createBiquadFilter(), gn = ctx.createGain();
    f.type = 'bandpass'; f.frequency.value = grave ? 600 : 1300; f.Q.value = 0.9;
    env(gn, t, (grave ? 0.32 : 0.4) * vol, 0.002, grave ? 0.13 : 0.07);
    chaine(ctx, sortie, n, f, gn);
  }

  function murLame(ctx, sortie, t = ctx.currentTime, vol = 1) {
    vol *= alea(0.85, 1.05);
    pierre(ctx, sortie, t, vol * 0.8, false);
    // tintement métallique : partiels inharmoniques qui s'éteignent vite
    const base = alea(380, 460); // nettement moins aigu (était 1350-1650, puis 680-820)
    for (const [k, v] of [[1, 0.24], [2.3, 0.09], [3.4, 0.04]]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = base * k;
      env(g, t, v * vol, 0.001, alea(0.12, 0.2) / Math.sqrt(k));
      chaine(ctx, sortie, o, g); o.start(t); o.stop(t + 0.3);
    }
    // frottement de la lame qui racle la pierre
    const n = sourceBruit(ctx, t + 0.01, 0.09), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 1.2; env(g, t + 0.01, 0.12 * vol, 0.004, 0.08); // raclement sourd
    chaine(ctx, sortie, n, f, g);
  }

  function murMassue(ctx, sortie, t = ctx.currentTime, vol = 1) {
    vol *= alea(0.85, 1.05);
    pierre(ctx, sortie, t, vol, true);
    // éboulis : quelques petits cailloux qui retombent
    for (let i = 0, k = Math.floor(alea(5, 9)); i < k; i++) {
      const tc = t + alea(0.05, 0.4), n = sourceBruit(ctx, tc, 0.03), f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = 'bandpass'; f.frequency.value = alea(1800, 4200); f.Q.value = 2.5;
      env(g, tc, alea(0.08, 0.2) * vol, 0.001, alea(0.015, 0.035));
      chaine(ctx, sortie, n, f, g);
    }
    // poussière qui retombe : souffle très doux
    const n = sourceBruit(ctx, t + 0.03, 0.6), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'lowpass'; f.frequency.value = 1800;
    g.gain.setValueAtTime(0.0001, t + 0.03); g.gain.exponentialRampToValueAtTime(0.08 * vol, t + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    chaine(ctx, sortie, n, f, g);
  }

  global.Effets = { fleche, flecheFeu, murLame, murMassue };
})(window);
