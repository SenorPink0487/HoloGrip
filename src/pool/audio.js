/**
 * Sample-only pool audio — natural, restrained billiard impacts.
 * No procedural synthesis. Volume scales gently with collision speed.
 */
export class PoolAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = false;
    this._lastBallHit = 0;
    this._lastCushion = 0;
    this.buffers = {
      ball: null,
      cushion: null,
      pocket: null,
      cue: null,
    };
    this.banks = {
      ball: [],
      cushion: [],
      pocket: [],
      cue: [],
    };
  }

  async init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      this.enabled = true;
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    // Keep headroom; samples already peak-normalized
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.enabled = true;

    // Event-specific field recordings. Keep banks small so an unrelated drop/break
    // recording can never be selected for an ordinary collision.
    await Promise.all([
      this._loadInto('ball', [
        '/pool/sounds/curated/ball-clack-cc0.mp3',
      ]),
      this._loadInto('cushion', [
        '/pool/sounds/curated/rail-bounce-cc-by.mp3',
      ]),
      this._loadInto('pocket', [
        '/pool/sounds/real/detail/Pool-ball-landing-into-the-pocket-close.mp3',
        '/pool/sounds/real/detail/Pool-ball-landing-into-the-pocket-close-2.mp3',
      ]),
      this._loadInto('cue', [
        '/pool/sounds/real/detail/Billiards-pool-shot.mp3',
        '/pool/sounds/real/detail/Billiards-pool-shot-2.mp3',
        '/pool/sounds/real/clips/cue-01.wav',
        '/pool/sounds/real/cue-shot.mp3',
        '/pool/sounds/real/detail/sf-strike.mp3',
      ]),
    ]);

    for (const k of Object.keys(this.banks)) {
      if (this.banks[k].length) this.buffers[k] = this.banks[k][0];
    }
  }

  async _loadInto(bank, urls) {
    for (const url of urls) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const arr = await res.arrayBuffer();
        const buf = await this.ctx.decodeAudioData(arr.slice(0));
        if (buf.duration > 0.01) this.banks[bank].push(buf);
      } catch {
        // skip failed sample
      }
    }
  }

  _pick(bank) {
    const list = this.banks[bank];
    if (list?.length) return list[Math.floor(Math.random() * list.length)];
    return this.buffers[bank] || null;
  }

  /**
   * Soft dynamic curve: quiet touches stay quiet, hard hits don't explode.
   */
  _dyn(intensity) {
    const i = Math.max(0, Math.min(1, intensity));
    return i * i; // square → natural soft falloff
  }

  _playBuffer(
    buffer,
    { gain = 0.5, rate = 1, filterFreq = null, duration = null } = {},
  ) {
    if (!buffer || !this.ctx) return false;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    let node = src;
    // Single mild lowpass only (keep natural character)
    if (filterFreq) {
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = filterFreq;
      lp.Q.value = 0.7;
      src.connect(lp);
      node = lp;
    }
    const g = this.ctx.createGain();
    const now = this.ctx.currentTime;
    // Soft attack to avoid click/pop exaggeration
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(gain, now + 0.004);
    node.connect(g);
    g.connect(this.master);

    if (duration != null && duration > 0) {
      const fade = Math.min(0.06, duration * 0.35);
      g.gain.setValueAtTime(gain, now + Math.max(0.004, duration - fade));
      g.gain.linearRampToValueAtTime(0.0001, now + duration);
      src.start(0, 0, duration + 0.01);
    } else {
      src.start();
    }
    return true;
  }

  playBallHit(intensity = 0.5) {
    if (!this.enabled || !this.ctx) return;
    const t = performance.now();
    // Debounce so multi-ball cascades don't roar
    if (t - this._lastBallHit < 40) return;
    this._lastBallHit = t;

    const d = this._dyn(intensity);
    if (d < 0.02) return; // ignore feather touches
    const buf = this._pick('ball');
    if (!buf) return;

    // Near-natural pitch; slightly lower for soft contacts
    const rate = 0.97 + d * 0.055 + (Math.random() - 0.5) * 0.018;
    // Short dry clack — real pool balls don't ring long
    const clip = Math.min(buf.duration, 0.07 + d * 0.06);
    this._playBuffer(buf, {
      gain: 0.22 + d * 0.45,
      rate,
      filterFreq: 3100 + d * 1700,
      duration: clip,
    });
  }

  playCushion(intensity = 0.4) {
    if (!this.enabled || !this.ctx) return;
    const t = performance.now();
    if (t - this._lastCushion < 45) return;
    this._lastCushion = t;

    const d = this._dyn(intensity);
    if (d < 0.02) return;
    const buf = this._pick('cushion');
    if (!buf) return;

    this._playBuffer(buf, {
      gain: 0.12 + d * 0.28,
      rate: 0.96 + d * 0.065,
      filterFreq: 1900 + d * 900,
      duration: Math.min(buf.duration, 0.1 + d * 0.08),
    });
  }

  playPocket() {
    if (!this.enabled || !this.ctx) return;
    const buf = this._pick('pocket');
    if (!buf) return;
    this._playBuffer(buf, {
      gain: 0.4,
      rate: 0.92 + Math.random() * 0.08,
      filterFreq: 1600,
      duration: Math.min(buf.duration, 0.35),
    });
  }

  playCueStrike(intensity = 0.5) {
    if (!this.enabled || !this.ctx) return;
    const d = this._dyn(Math.max(0.1, Math.min(1, intensity)));
    const buf = this._pick('cue') || this._pick('ball');
    if (!buf) return;

    this._playBuffer(buf, {
      gain: 0.2 + d * 0.35,
      rate: 0.95 + d * 0.08,
      filterFreq: 2400 + d * 600,
      duration: Math.min(buf.duration, 0.09 + d * 0.06),
    });
  }
}
