/**
 * Immersive mission audio — real NASA public-domain recordings + spatial processing.
 *
 * Sources: NASA Historical Sounds / Media Usage Guidelines
 * https://www.nasa.gov/historical-sounds/
 *
 * Local files served from /sounds/*.mp3
 */

const SOUND_MANIFEST = {
  // Real launch / engine field recordings
  sts131: '/sounds/sts131_launch.mp3',
  atlas: '/sounds/atlas_v_launch.mp3',
  sls: '/sounds/sls_testfire.mp3',
  sts26: '/sounds/sts26_liftoff.mp3',
  sts41d: '/sounds/sts41d_liftoff.mp3',
  // Mission control / crew voice (immersive radio)
  countdown: '/sounds/sts135_countdown.mp3',
  apollo11: '/sounds/apollo11_liftoff.mp3',
  throttleUp: '/sounds/throttle_up.mp3',
  rogerRoll: '/sounds/roger_roll.mp3',
  meco: '/sounds/meco.mp3',
  orbitNice: '/sounds/orbit_nice.mp3',
  commentary: '/sounds/sts135_commentary.mp3',
  // Radio beeps
  quindar1: '/sounds/quindar1.mp3',
  quindar2: '/sounds/quindar2.mp3',
  // Deep space ambience (sonifications / plasma)
  saturn: '/sounds/saturn_radio.mp3',
  chorus: '/sounds/chorus.mp3',
};

export function createSoundEngine() {
  /** @type {AudioContext | null} */
  let ctx = null;
  /** @type {GainNode | null} */
  let master = null;
  /** @type {GainNode | null} */
  let sfxBus = null;
  /** @type {GainNode | null} */
  let voiceBus = null;
  /** @type {GainNode | null} */
  let ambBus = null;
  /** @type {BiquadFilterNode | null} */
  let distanceLP = null;
  /** @type {ConvolverNode | null} */
  let reverb = null;
  /** @type {GainNode | null} */
  let reverbGain = null;
  /** @type {StereoPannerNode | null} */
  let panner = null;

  /** @type {Record<string, AudioBuffer>} */
  const buffers = {};
  let loadPromise = null;
  let loaded = false;
  let loadFailed = false;

  let enabled = true;
  let volume = 0.75;
  let started = false;
  let mutedVoice = false;

  // Continuous loops
  let engineLoop = null; // { sources, gains }
  let rumbleLoop = null;
  let spaceLoop = null;
  let padLoop = null;
  let windSynth = null;
  /**
   * Scout ion-drive bank (fully procedural — deliberately NOT chemical rocket samples).
   * @type {null | {
   *   noise: AudioBufferSourceNode,
   *   nBp: BiquadFilterNode,
   *   nHp: BiquadFilterNode,
   *   nG: GainNode,
   *   toneA: OscillatorNode,
   *   toneB: OscillatorNode,
   *   toneG: GainNode,
   *   sub: OscillatorNode,
   *   subG: GainNode,
   *   shimmer: OscillatorNode,
   *   shimmerG: GainNode,
   *   lfo: OscillatorNode,
   *   lfoG: GainNode,
   * }}
   */
  let pilotDrive = null;
  let pilotActive = false;
  let lastPilotMode = 'cruise';

  let lastPhase = 'idle';
  let lastCountdownSec = -1;
  let oneShotNodes = new Set();

  // ---- context / graph ----------------------------------------------------

  function ensureCtx() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) {
      console.warn('[audio] Web Audio unsupported');
      return null;
    }
    ctx = new AC();

    master = ctx.createGain();
    master.gain.value = enabled ? volume : 0;

    // Buses
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 1;
    voiceBus = ctx.createGain();
    voiceBus.gain.value = 0.95;
    ambBus = ctx.createGain();
    ambBus.gain.value = 0.55;

    // Distance low-pass (altitude muffles highs when far / in atmo perception)
    distanceLP = ctx.createBiquadFilter();
    distanceLP.type = 'lowpass';
    distanceLP.frequency.value = 16000;
    distanceLP.Q.value = 0.5;

    panner = ctx.createStereoPanner();
    panner.pan.value = 0;

    // Reverb (synthetic impulse — hangar / open pad feel)
    reverb = ctx.createConvolver();
    reverb.buffer = makeImpulseResponse(ctx, 2.8, 2.2);
    reverbGain = ctx.createGain();
    reverbGain.gain.value = 0.28;

    // Graph: buses -> distanceLP -> panner -> master
    //                          \-> reverb -> reverbGain -> master
    sfxBus.connect(distanceLP);
    ambBus.connect(distanceLP);
    // Voice slightly drier, radio-filtered separately per one-shot
    voiceBus.connect(master);

    distanceLP.connect(panner);
    panner.connect(master);
    distanceLP.connect(reverb);
    reverb.connect(reverbGain);
    reverbGain.connect(master);

    master.connect(ctx.destination);
    return ctx;
  }

  function makeImpulseResponse(context, duration, decay) {
    const rate = context.sampleRate;
    const len = Math.floor(rate * duration);
    const impulse = context.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const data = impulse.getChannelData(c);
      for (let i = 0; i < len; i++) {
        // Early reflections + exponential tail
        const t = i / len;
        const env = Math.pow(1 - t, decay);
        data[i] = (Math.random() * 2 - 1) * env * (c === 0 ? 1 : 0.92);
        if (i < rate * 0.05) data[i] *= 0.3 + Math.random() * 0.7;
      }
    }
    return impulse;
  }

  async function loadAll() {
    if (loaded) return true;
    if (loadPromise) return loadPromise;
    ensureCtx();
    loadPromise = (async () => {
      const entries = Object.entries(SOUND_MANIFEST);
      await Promise.all(
        entries.map(async ([key, url]) => {
          try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`${res.status} ${url}`);
            const arr = await res.arrayBuffer();
            buffers[key] = await ctx.decodeAudioData(arr.slice(0));
          } catch (e) {
            console.warn('[audio] failed to load', key, e);
          }
        })
      );
      loaded = Object.keys(buffers).length > 0;
      loadFailed = !loaded;
      if (loaded) console.info(`[audio] loaded ${Object.keys(buffers).length} NASA samples`);
      return loaded;
    })();
    return loadPromise;
  }

  async function resume() {
    const c = ensureCtx();
    if (!c) return false;
    if (c.state === 'suspended') {
      try {
        await c.resume();
      } catch (e) {
        console.warn('[audio] resume failed', e);
      }
    }
    started = true;
    await loadAll();
    if (enabled && loaded) startPadAmbience();
    return c.state === 'running';
  }

  function setEnabled(v) {
    enabled = v;
    if (!master || !ctx) return;
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.linearRampToValueAtTime(enabled ? volume : 0, t + 0.1);
    if (!enabled) stopAllContinuous(true);
    else if (started && loaded && !pilotActive) startPadAmbience();
  }

  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (master && enabled && ctx) {
      master.gain.setTargetAtTime(volume, ctx.currentTime, 0.05);
    }
  }

  function now() {
    return ctx ? ctx.currentTime : 0;
  }

  // ---- playback primitives ------------------------------------------------

  /**
   * Play a buffer one-shot.
   * @returns {{ stop: Function } | null}
   */
  function playBuffer(key, {
    bus = 'sfx',
    gain = 1,
    rate = 1,
    loop = false,
    offset = 0,
    duration = undefined,
    when = 0,
    fadeIn = 0.02,
    fadeOut = 0,
    radio = false,
    pan = 0,
  } = {}) {
    if (!enabled || !ctx || !buffers[key]) return null;
    const buf = buffers[key];
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = loop;
    src.playbackRate.value = rate;

    const g = ctx.createGain();
    const t0 = now() + when;
    const peak = Math.max(0.0001, gain);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + Math.max(0.005, fadeIn));

    let node = src;
    // Optional radio / headset EQ for voice
    if (radio) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1600;
      bp.Q.value = 0.7;
      const hs = ctx.createBiquadFilter();
      hs.type = 'highshelf';
      hs.frequency.value = 2500;
      hs.gain.value = 4;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 3800;
      src.connect(bp);
      bp.connect(hs);
      hs.connect(lp);
      node = lp;
    }

    const panNode = ctx.createStereoPanner();
    panNode.pan.value = pan;

    node.connect(g);
    g.connect(panNode);

    const target =
      bus === 'voice' ? voiceBus : bus === 'amb' ? ambBus : sfxBus;
    panNode.connect(target);

    try {
      if (duration != null) src.start(t0, offset, duration);
      else src.start(t0, offset);
    } catch (e) {
      return null;
    }

    const handle = {
      src,
      g,
      stop(fade = 0.2) {
        try {
          const t = now();
          g.gain.cancelScheduledValues(t);
          g.gain.setTargetAtTime(0.0001, t, fade / 3);
          src.stop(t + fade + 0.05);
        } catch (_) {
          /* ignore */
        }
        oneShotNodes.delete(handle);
      },
    };
    oneShotNodes.add(handle);

    if (!loop) {
      const end = t0 + (duration ?? buf.duration / rate) + 0.05;
      const timer = setTimeout(() => {
        oneShotNodes.delete(handle);
      }, (end - now()) * 1000 + 100);
      handle._timer = timer;
    }

    if (fadeOut > 0 && !loop) {
      const endAt = t0 + (duration ?? buf.duration / rate);
      g.gain.setValueAtTime(peak, Math.max(t0, endAt - fadeOut));
      g.gain.exponentialRampToValueAtTime(0.0001, endAt);
    }

    return handle;
  }

  function startLoop(key, {
    bus = 'sfx',
    gain = 0.5,
    rate = 1,
    fadeIn = 0.8,
  } = {}) {
    if (!buffers[key] || !ctx) return null;
    const src = ctx.createBufferSource();
    src.buffer = buffers[key];
    src.loop = true;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    src.connect(g);
    const target = bus === 'amb' ? ambBus : sfxBus;
    g.connect(target);
    src.start();
    g.gain.linearRampToValueAtTime(gain, now() + fadeIn);
    return { src, g, key };
  }

  function stopLoop(loop, fade = 0.5) {
    if (!loop || !ctx) return;
    try {
      const t = now();
      loop.g.gain.cancelScheduledValues(t);
      loop.g.gain.linearRampToValueAtTime(0.0001, t + fade);
      loop.src.stop(t + fade + 0.08);
    } catch (_) {
      /* ignore */
    }
  }

  function setLoopGain(loop, gain, timeConst = 0.12) {
    if (!loop || !ctx) return;
    loop.g.gain.setTargetAtTime(Math.max(0.0001, gain), now(), timeConst);
  }

  // ---- continuous environments --------------------------------------------

  function startPadAmbience() {
    if (padLoop || !loaded) return;
    // Soft distant industrial / quiet pad using space chorus very low
    if (buffers.chorus) {
      padLoop = startLoop('chorus', { bus: 'amb', gain: 0.04, rate: 0.55, fadeIn: 2 });
    }
    ensureWindSynth();
  }

  function stopPadAmbience() {
    stopLoop(padLoop, 0.8);
    padLoop = null;
  }

  function ensureWindSynth() {
    if (windSynth || !ctx) return;
    // Broadband wind for ascent (procedural layer under real samples)
    const bufferSize = ctx.sampleRate * 2;
    const noiseBuf = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 0.35;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    src.connect(bp);
    bp.connect(g);
    g.connect(sfxBus);
    src.start();
    windSynth = { src, bp, g };
  }

  function setWind(level) {
    if (!windSynth) ensureWindSynth();
    if (!windSynth || !ctx) return;
    const t = Math.max(0, Math.min(1, level));
    windSynth.g.gain.setTargetAtTime(t * 0.14, now(), 0.2);
    windSynth.bp.frequency.setTargetAtTime(500 + t * 2200, now(), 0.25);
  }

  function ensureEngineLoops() {
    if (engineLoop || !loaded) return;
    // Dual layer: SLS test-fire + Atlas/STS field rumble for thick real engine bed
    const a = buffers.sls ? startLoop('sls', { gain: 0.0001, rate: 0.92, fadeIn: 0.01 }) : null;
    const b = buffers.sts131
      ? startLoop('sts131', { gain: 0.0001, rate: 0.85, fadeIn: 0.01 })
      : buffers.atlas
        ? startLoop('atlas', { gain: 0.0001, rate: 0.9, fadeIn: 0.01 })
        : null;
    engineLoop = { layers: [a, b].filter(Boolean) };
  }

  function setEngineThrust(level, { distant = false } = {}) {
    if (!enabled || !loaded) return;
    const t = Math.max(0, Math.min(1, level));
    if (t < 0.02) {
      if (engineLoop) {
        engineLoop.layers.forEach((l) => setLoopGain(l, 0.0001, 0.2));
      }
      return;
    }
    ensureEngineLoops();
    if (!engineLoop) return;
    const dist = distant ? 0.45 : 1;
    // Layer mix
    const [main, bed] = engineLoop.layers;
    if (main) setLoopGain(main, t * 0.72 * dist, 0.1);
    if (bed) setLoopGain(bed, t * 0.48 * dist, 0.12);
    // Slight rate up with thrust (pitch rises under load)
    engineLoop.layers.forEach((l, i) => {
      if (l?.src) {
        const base = i === 0 ? 0.9 : 0.82;
        l.src.playbackRate.setTargetAtTime(base + t * 0.12, now(), 0.15);
      }
    });
  }

  function ensureSpaceAmbience() {
    if (spaceLoop || !loaded) return;
    // Cassini Saturn radio + EMFISIS chorus — eerie real space sounds
    const a = buffers.saturn
      ? startLoop('saturn', { bus: 'amb', gain: 0.0001, rate: 0.8, fadeIn: 0.01 })
      : null;
    const b = buffers.chorus
      ? startLoop('chorus', { bus: 'amb', gain: 0.0001, rate: 0.7, fadeIn: 0.01 })
      : null;
    spaceLoop = { layers: [a, b].filter(Boolean) };
  }

  function setSpaceAmbience(level) {
    if (!enabled || !loaded) return;
    const t = Math.max(0, Math.min(1, level));
    if (t < 0.02) {
      if (spaceLoop) spaceLoop.layers.forEach((l) => setLoopGain(l, 0.0001, 0.5));
      return;
    }
    ensureSpaceAmbience();
    if (!spaceLoop) return;
    const [a, b] = spaceLoop.layers;
    if (a) setLoopGain(a, t * 0.35, 0.4);
    if (b) setLoopGain(b, t * 0.22, 0.5);
  }

  function applySpatial({ altitude = 0, pan = 0, inSpace = false } = {}) {
    if (!ctx || !distanceLP) return;
    // Near pad: full bandwidth, strong reverb; high alt: darker, less slap reverb, more space
    const a = Math.max(0, altitude);
    const near = 1 - Math.min(1, a / 2500);
    const far = Math.min(1, a / 4000);
    distanceLP.frequency.setTargetAtTime(1800 + near * 14000, now(), 0.25);
    if (reverbGain) {
      reverbGain.gain.setTargetAtTime(0.12 + near * 0.28 + (inSpace ? 0.15 : 0), now(), 0.3);
    }
    if (panner) {
      panner.pan.setTargetAtTime(Math.max(-0.85, Math.min(0.85, pan)), now(), 0.2);
    }
    // Voice bus quieter when very distant
    if (voiceBus) {
      voiceBus.gain.setTargetAtTime(inSpace ? 0.55 : 0.95, now(), 0.3);
    }
  }

  function stopPilotDrive(fade = 0.35) {
    if (!pilotDrive || !ctx) return;
    try {
      const t = now();
      const nodes = [pilotDrive.nG, pilotDrive.toneG, pilotDrive.subG, pilotDrive.shimmerG];
      for (const g of nodes) {
        g.gain.cancelScheduledValues(t);
        g.gain.linearRampToValueAtTime(0.0001, t + fade);
      }
      pilotDrive.noise.stop(t + fade + 0.08);
      pilotDrive.toneA.stop(t + fade + 0.08);
      pilotDrive.toneB.stop(t + fade + 0.08);
      pilotDrive.sub.stop(t + fade + 0.08);
      pilotDrive.shimmer.stop(t + fade + 0.08);
      pilotDrive.lfo.stop(t + fade + 0.08);
    } catch (_) {
      /* ignore */
    }
    pilotDrive = null;
  }

  /**
   * Sci-fi ion / plasma drive for the scout — no chemical rocket samples.
   * Rocket launch keeps SLS/STS rumble; pilot is electric + airy + space radio.
   */
  function ensurePilotDrive() {
    if (pilotDrive || !ctx) return;

    // Airy plasma noise (high-passed — not low rocket roar)
    const bufferSize = ctx.sampleRate * 2;
    const noiseBuf = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    noise.loop = true;
    const nHp = ctx.createBiquadFilter();
    nHp.type = 'highpass';
    nHp.frequency.value = 900;
    const nBp = ctx.createBiquadFilter();
    nBp.type = 'bandpass';
    nBp.frequency.value = 2400;
    nBp.Q.value = 0.55;
    const nG = ctx.createGain();
    nG.gain.value = 0.0001;
    noise.connect(nHp);
    nHp.connect(nBp);
    nBp.connect(nG);
    nG.connect(sfxBus);
    noise.start();

    // Twin detuned electric tones (ion engine character)
    const toneA = ctx.createOscillator();
    toneA.type = 'sine';
    toneA.frequency.value = 110;
    const toneB = ctx.createOscillator();
    toneB.type = 'triangle';
    toneB.frequency.value = 112.5;
    const toneLp = ctx.createBiquadFilter();
    toneLp.type = 'lowpass';
    toneLp.frequency.value = 800;
    const toneG = ctx.createGain();
    toneG.gain.value = 0.0001;
    toneA.connect(toneLp);
    toneB.connect(toneLp);
    toneLp.connect(toneG);
    toneG.connect(sfxBus);
    toneA.start();
    toneB.start();

    // Soft sub (boost only — still not chemical)
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = 42;
    const subG = ctx.createGain();
    subG.gain.value = 0.0001;
    sub.connect(subG);
    subG.connect(sfxBus);
    sub.start();

    // High shimmer / crystal edge for hyper-warp
    const shimmer = ctx.createOscillator();
    shimmer.type = 'sine';
    shimmer.frequency.value = 880;
    const shimmerG = ctx.createGain();
    shimmerG.gain.value = 0.0001;
    shimmer.connect(shimmerG);
    shimmerG.connect(sfxBus);
    shimmer.start();

    // Slow amplitude LFO on tone bus (living engine)
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 2.5;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0;
    lfo.connect(lfoG);
    lfoG.connect(toneG.gain);
    lfo.start();

    pilotDrive = {
      noise,
      nBp,
      nHp,
      nG,
      toneA,
      toneB,
      toneG,
      toneLp,
      sub,
      subG,
      shimmer,
      shimmerG,
      lfo,
      lfoG,
    };
  }

  function setPilotDrive(level, { modeBlend = 0, speedFrac = 0, mode = 'cruise', thrust = 0 } = {}) {
    if (!enabled || !ctx) return;
    const t = Math.max(0, Math.min(1.25, level));
    if (t < 0.015) {
      if (pilotDrive) {
        pilotDrive.nG.gain.setTargetAtTime(0.0001, now(), 0.12);
        pilotDrive.toneG.gain.setTargetAtTime(0.0001, now(), 0.12);
        pilotDrive.subG.gain.setTargetAtTime(0.0001, now(), 0.12);
        pilotDrive.shimmerG.gain.setTargetAtTime(0.0001, now(), 0.12);
      }
      return;
    }
    ensurePilotDrive();
    if (!pilotDrive) return;

    const hyper = mode === 'hyper' || mode === 'warp' ? 1 : 0;
    const warp = mode === 'warp' ? 1 : 0;
    const boost = mode === 'boost' ? 1 : 0;

    // Plasma hiss — bright, not rumbling
    const hiss =
      t * (0.045 + thrust * 0.05 + modeBlend * 0.1 + speedFrac * 0.06 + warp * 0.05);
    pilotDrive.nG.gain.setTargetAtTime(Math.max(0.0001, hiss), now(), 0.1);
    pilotDrive.nHp.frequency.setTargetAtTime(700 + modeBlend * 900 + warp * 400, now(), 0.15);
    pilotDrive.nBp.frequency.setTargetAtTime(
      1600 + modeBlend * 2200 + speedFrac * 1200 + warp * 800,
      now(),
      0.15
    );

    // Electric drive tones
    const baseHz = 95 + modeBlend * 140 + speedFrac * 50 + warp * 80;
    pilotDrive.toneA.frequency.setTargetAtTime(baseHz, now(), 0.12);
    pilotDrive.toneB.frequency.setTargetAtTime(baseHz * 1.02 + 1.5, now(), 0.12);
    pilotDrive.toneLp.frequency.setTargetAtTime(600 + modeBlend * 1800 + warp * 1200, now(), 0.15);
    const toneLvl =
      t * (0.035 + thrust * 0.04 + modeBlend * 0.055 + hyper * 0.02);
    pilotDrive.toneG.gain.setTargetAtTime(Math.max(0.0001, toneLvl), now(), 0.1);
    // LFO depth: subtle pulse under thrust
    pilotDrive.lfoG.gain.setTargetAtTime(toneLvl * 0.35, now(), 0.2);
    pilotDrive.lfo.frequency.setTargetAtTime(1.8 + modeBlend * 4 + warp * 3, now(), 0.2);

    // Sub: mild boost/hyper only
    const subLvl = t * (boost * 0.04 + modeBlend * 0.025 + warp * 0.02) * (0.4 + thrust);
    pilotDrive.sub.frequency.setTargetAtTime(36 + modeBlend * 20, now(), 0.15);
    pilotDrive.subG.gain.setTargetAtTime(Math.max(0.0001, subLvl), now(), 0.12);

    // Crystal shimmer for hyper/warp
    const shimHz = 720 + modeBlend * 900 + speedFrac * 400 + warp * 500;
    pilotDrive.shimmer.frequency.setTargetAtTime(shimHz, now(), 0.12);
    const shimLvl = t * (modeBlend * 0.035 + warp * 0.03 + hyper * 0.012);
    pilotDrive.shimmerG.gain.setTargetAtTime(Math.max(0.0001, shimLvl), now(), 0.12);
  }

  /** Soft UI / mode blip — not a rocket ignition. */
  function playPilotBlip({ high = false, gain = 0.08 } = {}) {
    if (!enabled || !ctx) return;
    const t0 = now();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    const f0 = high ? 880 : 520;
    const f1 = high ? 1320 : 780;
    osc.frequency.setValueAtTime(f0, t0);
    osc.frequency.exponentialRampToValueAtTime(f1, t0 + 0.09);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + 0.16);
  }

  function stopAllContinuous(hard = false) {
    stopLoop(engineLoop?.layers?.[0], hard ? 0.15 : 0.6);
    stopLoop(engineLoop?.layers?.[1], hard ? 0.15 : 0.6);
    engineLoop = null;
    if (spaceLoop) {
      spaceLoop.layers.forEach((l) => stopLoop(l, 0.5));
      spaceLoop = null;
    }
    stopPadAmbience();
    stopPilotDrive(hard ? 0.12 : 0.4);
    pilotActive = false;
    lastPilotMode = 'cruise';
    if (windSynth) {
      try {
        windSynth.g.gain.setTargetAtTime(0.0001, now(), 0.1);
        windSynth.src.stop(now() + 0.4);
      } catch (_) {
        /* ignore */
      }
      windSynth = null;
    }
    oneShotNodes.forEach((h) => h.stop(0.15));
    oneShotNodes.clear();
  }

  /**
   * Pilot / free-flight audio — ion drive + space amb (NOT rocket rumble).
   * @param {{
   *   active?: boolean,
   *   thrust?: number,
   *   mode?: string,
   *   modeBlend?: number,
   *   speed?: number,
   *   maxSpeed?: number,
   * }} info
   */
  function syncPilot(info = {}) {
    if (!enabled || !started) return;
    if (!loaded) {
      loadAll();
      return;
    }

    if (!info.active) {
      if (pilotActive) exitPilot();
      return;
    }

    if (!pilotActive) {
      pilotActive = true;
      lastPilotMode = 'cruise';
      stopPadAmbience();
      // Kill chemical rocket loops completely while flying the scout
      if (engineLoop) {
        engineLoop.layers.forEach((l) => setLoopGain(l, 0.0001, 0.08));
      }
      setWind(0);
      playPilotBlip({ high: false, gain: 0.07 });
      // Space radio bed only — no launch voice callouts
      playBuffer('saturn', {
        bus: 'amb',
        gain: 0.18,
        rate: 0.95,
        fadeIn: 0.15,
        duration: 2.2,
        fadeOut: 0.5,
      });
    }

    const thrust = Math.max(0, Math.min(1.5, info.thrust ?? 0));
    const mode = info.mode || 'cruise';
    const blend = Math.max(0, Math.min(1, info.modeBlend ?? 0));
    const maxSp = Math.max(1, info.maxSpeed || 900);
    const speedFrac = Math.min(1, (info.speed || 0) / maxSp);

    // Brighter vacuum path — less pad reverb mud (keeps rocket/pad sound distinct)
    applySpatial({ altitude: 8000, pan: 0, inSpace: true });
    if (reverbGain) {
      reverbGain.gain.setTargetAtTime(0.08 + blend * 0.12, now(), 0.25);
    }
    setWind(0);

    // Ensure rocket engine bed stays muted during pilot
    setEngineThrust(0);

    // Deep-space amb (Cassini / chorus) — rocket launch does not use this as drive
    const amb =
      0.32 +
      blend * 0.45 +
      (mode === 'warp' ? 0.2 : mode === 'hyper' ? 0.1 : 0) +
      thrust * 0.08;
    setSpaceAmbience(Math.min(1, amb));
    // Pitch space layers slightly with mode for sci-fi motion
    if (spaceLoop?.layers) {
      spaceLoop.layers.forEach((l, i) => {
        if (!l?.src) return;
        const base = i === 0 ? 0.75 : 0.65;
        l.src.playbackRate.setTargetAtTime(
          base + blend * 0.35 + speedFrac * 0.12 + (mode === 'warp' ? 0.15 : 0),
          now(),
          0.2
        );
      });
    }

    // Ion drive level
    let drive =
      Math.max(thrust * 0.75, blend * 0.55) *
      (mode === 'cruise' ? 0.85 : mode === 'boost' ? 1 : 1.1);
    if (thrust < 0.04 && blend < 0.04) drive = Math.min(drive, 0.08);
    setPilotDrive(drive, { modeBlend: blend, speedFrac, mode, thrust });

    // Mode transition — sci-fi cues only (no SLS/Atlas/STS/MECO rocket samples)
    if (mode !== lastPilotMode) {
      if (mode === 'boost') {
        playPilotBlip({ high: true, gain: 0.09 });
        playBuffer('chorus', {
          bus: 'amb',
          gain: 0.22,
          rate: 1.15,
          fadeIn: 0.02,
          duration: 1.4,
          fadeOut: 0.4,
        });
      } else if (mode === 'hyper') {
        playPilotBlip({ high: true, gain: 0.1 });
        playQuindar();
        playBuffer('saturn', {
          bus: 'amb',
          gain: 0.3,
          rate: 1.2,
          fadeIn: 0.02,
          duration: 2.0,
          fadeOut: 0.5,
        });
        playBuffer('chorus', {
          bus: 'amb',
          gain: 0.25,
          rate: 1.25,
          fadeIn: 0.05,
          duration: 2.2,
          fadeOut: 0.55,
        });
      } else if (mode === 'warp') {
        playPilotBlip({ high: true, gain: 0.11 });
        playQuindar();
        playBuffer('chorus', {
          bus: 'amb',
          gain: 0.4,
          rate: 1.35,
          fadeIn: 0.02,
          duration: 2.5,
          fadeOut: 0.6,
        });
        playBuffer('saturn', {
          bus: 'amb',
          gain: 0.28,
          rate: 1.4,
          fadeIn: 0.04,
          duration: 2.4,
          fadeOut: 0.55,
        });
      } else if (
        mode === 'cruise' &&
        (lastPilotMode === 'hyper' || lastPilotMode === 'warp' || lastPilotMode === 'boost')
      ) {
        playPilotBlip({ high: false, gain: 0.06 });
      }
      lastPilotMode = mode;
    }
  }

  function enterPilot() {
    if (!enabled) return;
    resume().then(() => {
      if (!enabled) return;
      stopPadAmbience();
      // Mute chemical rocket bed immediately
      if (engineLoop) {
        engineLoop.layers.forEach((l) => setLoopGain(l, 0.0001, 0.08));
      }
      setEngineThrust(0);
      setWind(0);
      setSpaceAmbience(0.25);
      pilotActive = false; // syncPilot will arm enter cues next frame
      lastPilotMode = 'cruise';
    });
  }

  function exitPilot() {
    pilotActive = false;
    lastPilotMode = 'cruise';
    setEngineThrust(0);
    setSpaceAmbience(0);
    stopPilotDrive(0.4);
    // Restore rocket loop base rates if loops still exist
    if (engineLoop?.layers) {
      engineLoop.layers.forEach((l, i) => {
        if (l?.src) {
          l.src.playbackRate.setTargetAtTime(i === 0 ? 0.9 : 0.82, now(), 0.2);
        }
      });
    }
    if (spaceLoop?.layers) {
      spaceLoop.layers.forEach((l, i) => {
        if (l?.src) {
          l.src.playbackRate.setTargetAtTime(i === 0 ? 0.8 : 0.7, now(), 0.25);
        }
      });
    }
    if (enabled && loaded && started) startPadAmbience();
  }

  // ---- mission events -----------------------------------------------------

  function playQuindar() {
    const k = Math.random() > 0.5 ? 'quindar1' : 'quindar2';
    // Only first ~0.2s of the file is the actual beep
    playBuffer(k, { bus: 'voice', gain: 0.35, radio: true, duration: 0.22, fadeIn: 0.005 });
  }

  function onPhaseEnter(phase) {
    if (phase === 'countdown') {
      stopPadAmbience();
      playQuindar();
      // Real countdown / launch callouts
      playBuffer('countdown', {
        bus: 'voice',
        gain: 0.75,
        radio: true,
        fadeIn: 0.05,
      });
      // Underlay: quiet SLS crackle building
      setEngineThrust(0.05);
    } else if (phase === 'ignition') {
      playQuindar();
      // Real ignition / launch field recording
      playBuffer('sls', { bus: 'sfx', gain: 0.85, fadeIn: 0.05, rate: 1 });
      playBuffer('sts131', {
        bus: 'sfx',
        gain: 0.55,
        fadeIn: 0.1,
        rate: 0.95,
        when: 0.15,
      });
      setEngineThrust(0.55);
    } else if (phase === 'liftoff') {
      playQuindar();
      playBuffer('apollo11', {
        bus: 'voice',
        gain: 0.7,
        radio: true,
        fadeIn: 0.02,
      });
      playBuffer('sts26', { bus: 'sfx', gain: 0.65, fadeIn: 0.05, when: 0.3 });
      playBuffer('atlas', { bus: 'sfx', gain: 0.5, fadeIn: 0.1, when: 0.5, rate: 0.92 });
      setEngineThrust(1);
    } else if (phase === 'ascent') {
      playBuffer('rogerRoll', {
        bus: 'voice',
        gain: 0.65,
        radio: true,
        when: 0.8,
      });
      playBuffer('throttleUp', {
        bus: 'voice',
        gain: 0.7,
        radio: true,
        when: 3.5,
      });
      setEngineThrust(0.95);
    } else if (phase === 'hotstage') {
      playQuindar();
      playBuffer('sts41d', { bus: 'sfx', gain: 0.55, fadeIn: 0.05, rate: 1.05 });
    } else if (phase === 'separate') {
      playQuindar();
      // Separation: abrupt sample hits + MECO call
      playBuffer('meco', { bus: 'voice', gain: 0.75, radio: true });
      playBuffer('sts41d', {
        bus: 'sfx',
        gain: 0.7,
        rate: 1.15,
        fadeIn: 0.01,
        duration: 2.5,
      });
      playBuffer('sls', {
        bus: 'sfx',
        gain: 0.4,
        rate: 1.2,
        when: 0.1,
        duration: 1.8,
      });
    } else if (phase === 'shipAscent') {
      playBuffer('commentary', {
        bus: 'voice',
        gain: 0.45,
        radio: true,
        when: 1.0,
      });
      setEngineThrust(0.75, { distant: true });
    } else if (phase === 'leaveEarth') {
      playQuindar();
      setSpaceAmbience(0.35);
    } else if (phase === 'deepSpace') {
      playBuffer('orbitNice', {
        bus: 'voice',
        gain: 0.55,
        radio: true,
      });
      setSpaceAmbience(0.85);
      setEngineThrust(0.12, { distant: true });
      setWind(0);
    } else if (phase === 'done') {
      playQuindar();
      playBuffer('orbitNice', {
        bus: 'voice',
        gain: 0.4,
        radio: true,
        when: 0.3,
      });
      setEngineThrust(0.08, { distant: true });
      setSpaceAmbience(0.9);
    }
  }

  /**
   * Frame sync from mission state.
   */
  function syncMission(info) {
    if (!enabled || !started) return;
    if (!loaded) {
      loadAll();
      return;
    }

    const phase = info.phase || 'idle';
    const phaseTime = info.phaseTime || 0;
    const alt = info.altitude || 0;
    const boosterT = info.boosterThrust ?? 0;
    const shipT = info.shipThrust ?? 0;
    const thrust = Math.max(boosterT, shipT * 0.85);
    const inSpace = !!info.inSpace || alt > 2500;

    // Stereo: slight pan from lateral motion if provided
    const pan = Math.tanh((info.panX || 0) / 80) * 0.35;
    applySpatial({ altitude: alt, pan, inSpace });

    if (phase !== lastPhase) {
      onPhaseEnter(phase);
      lastPhase = phase;
      lastCountdownSec = -1;
    }

    if (phase === 'countdown') {
      // Extra ticking feel with quindar near T-0
      const left = Math.max(0, Math.ceil(4 - phaseTime));
      if (left !== lastCountdownSec && left <= 3) {
        lastCountdownSec = left;
        if (left <= 2) playQuindar();
      }
      setEngineThrust(phaseTime > 2.5 ? 0.12 + (phaseTime - 2.5) * 0.15 : 0.04);
      setWind(0.08);
      setSpaceAmbience(0);
    } else if (phase === 'ignition') {
      setEngineThrust(0.4 + phaseTime * 0.28);
      setWind(0.2 + phaseTime * 0.15);
      setSpaceAmbience(0);
    } else if (phase === 'liftoff' || phase === 'ascent' || phase === 'hotstage') {
      setEngineThrust(thrust || 0.95, { distant: alt > 350 });
      setWind(Math.min(0.9, 0.35 + alt / 1800));
      setSpaceAmbience(0);
    } else if (phase === 'separate') {
      setEngineThrust(Math.max(shipT, 0.45), { distant: true });
      setWind(0.4);
    } else if (phase === 'shipAscent' || phase === 'leaveEarth') {
      setEngineThrust(shipT || 0.7, { distant: alt > 600 });
      const atmo = 1 - Math.min(1, alt / 3200);
      setWind(0.55 * atmo);
      setSpaceAmbience((1 - atmo) * 0.7);
    } else if (phase === 'deepSpace' || phase === 'done') {
      setEngineThrust(shipT > 0.05 ? shipT * 0.35 : 0.08, { distant: true });
      setWind(0);
      setSpaceAmbience(0.9);
    } else if (phase === 'idle') {
      setEngineThrust(0);
      setWind(0.03);
      setSpaceAmbience(0);
      if (!padLoop) startPadAmbience();
    }
  }

  function onLaunchStart() {
    lastPhase = 'idle';
    lastCountdownSec = -1;
    stopPadAmbience();
    playQuindar();
    // Brief commentary bed
    playBuffer('commentary', {
      bus: 'voice',
      gain: 0.35,
      radio: true,
      duration: 2.5,
      fadeOut: 0.4,
    });
  }

  function onAbort() {
    playQuindar();
    stopAllContinuous(true);
    lastPhase = 'idle';
    if (enabled && loaded) startPadAmbience();
  }

  function playUIClick() {
    if (!enabled) return;
    if (!ctx) {
      resume();
      return;
    }
    // Soft mechanical click (not quindar — that stays mission-only)
    const t0 = now();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(420, t0);
    osc.frequency.exponentialRampToValueAtTime(180, t0 + 0.06);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.06, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.07);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + 0.08);
  }

  return {
    resume,
    loadAll,
    setEnabled,
    setVolume,
    isEnabled: () => enabled,
    getVolume: () => volume,
    isLoaded: () => loaded,
    playUIClick,
    syncMission,
    syncPilot,
    enterPilot,
    exitPilot,
    onLaunchStart,
    onAbort,
    stopAll: () => stopAllContinuous(true),
  };
}
