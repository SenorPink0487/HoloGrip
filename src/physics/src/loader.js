/**
 * Elegant lab boot loader — GSAP intro + pure-CSS ambient motion.
 *
 * Full GPU prewarm still blocks the main thread in short slices. The loader
 * stays smooth by:
 *  - Driving ambient motion with CSS transforms only (compositor-friendly)
 *  - Lerping the progress bar on its own rAF toward discrete boot targets
 *  - Never relying on GSAP tickers during the heavy prewarm phase
 */
import gsap from 'gsap';

/**
 * @returns {{
 *   setProgress: (ratio: number, status?: string) => void,
 *   setStatus: (status: string) => void,
 *   setBusy: (heavy: boolean) => void,
 *   finish: () => Promise<void>,
 * }}
 */
export function createLabLoader() {
  const root = document.getElementById('loader');
  if (!root) {
    return {
      setProgress() {},
      setStatus() {},
      setBusy() {},
      finish: () => Promise.resolve(),
    };
  }

  const fill = root.querySelector('.loader-bar-fill');
  const glow = root.querySelector('.loader-bar-glow');
  const pctEl = root.querySelector('.loader-pct');
  const statusEl = root.querySelector('.loader-status');
  const content = root.querySelector('.loader-content');
  const orbHost = root.querySelector('.loader-orb');
  const brandChars = root.querySelectorAll('.loader-brand .char');
  const sub = root.querySelector('.loader-sub');
  const ring = root.querySelector('.loader-ring');
  const particles = root.querySelectorAll('.loader-particle');

  document.body.classList.add('is-loading');

  // Pure CSS spinner — no JS web component (those freeze when the main thread
  // is in a long WebGL compile, which reads as "加载卡住").
  if (orbHost && !orbHost.querySelector('.loader-css-spin')) {
    const spin = document.createElement('div');
    spin.className = 'loader-css-spin';
    spin.setAttribute('aria-hidden', 'true');
    spin.innerHTML = '<i></i><i></i><i></i>';
    orbHost.appendChild(spin);
  }

  let finishing = false;
  let lastStatusText = '';
  let lastPct = -1;
  let heavyBusy = false;

  /** Discrete target from boot (0–1). */
  let targetRatio = 0;
  /** Displayed ratio lerped toward target on rAF. */
  let displayRatio = 0;
  let lerpRaf = 0;

  const applyVisual = (ratio) => {
    const r = Math.max(0, Math.min(1, ratio));
    if (fill) fill.style.transform = `scaleX(${r})`;
    if (glow) glow.style.left = `${r * 100}%`;
    const pct = Math.round(r * 100);
    if (pctEl && pct !== lastPct) {
      lastPct = pct;
      pctEl.textContent = `${pct}`;
      root.setAttribute('aria-valuenow', String(pct));
    }
  };

  /**
   * Independent progress animation so the bar keeps crawling between discrete
   * boot ticks even when the main thread briefly returns from a compile.
   */
  const pumpLerp = () => {
    lerpRaf = 0;
    if (finishing) {
      displayRatio = 1;
      applyVisual(1);
      return;
    }
    const delta = targetRatio - displayRatio;
    // Fast catch-up on small gaps; ease on large jumps so the bar never snaps.
    const step = Math.abs(delta) < 0.01
      ? delta
      : delta * 0.22 + Math.sign(delta) * 0.004;
    displayRatio = Math.abs(delta) < 0.0015
      ? targetRatio
      : Math.min(1, Math.max(displayRatio, displayRatio + step));
    // Never let display run past the true peak target.
    if (displayRatio > targetRatio) displayRatio = targetRatio;
    applyVisual(displayRatio);
    if (displayRatio < targetRatio - 0.0005) {
      lerpRaf = requestAnimationFrame(pumpLerp);
    }
  };

  const armLerp = () => {
    if (!lerpRaf && !finishing) {
      lerpRaf = requestAnimationFrame(pumpLerp);
    }
  };

  // ── Intro sequence (once; then CSS owns ambient motion) ──
  const intro = gsap.timeline({
    defaults: { ease: 'power3.out' },
    onComplete: () => {
      // Kill intro tweens so GSAP ticker work cannot fight prewarm yields.
      gsap.killTweensOf([
        root.querySelector('.loader-aurora'),
        ring,
        orbHost,
        particles,
        brandChars,
        sub,
        root.querySelector('.loader-meter'),
        statusEl,
      ].filter(Boolean));
    },
  });
  intro
    .from(root.querySelector('.loader-aurora'), { opacity: 0, duration: 0.55 }, 0)
    .from(ring, { scale: 0.7, opacity: 0, duration: 0.45 }, 0.04)
    .from(orbHost, { scale: 0.55, opacity: 0, duration: 0.4 }, 0.08)
    .from(particles, {
      scale: 0,
      opacity: 0,
      duration: 0.35,
      stagger: 0.025,
    }, 0.1)
    .from(brandChars, {
      y: 14,
      opacity: 0,
      duration: 0.35,
      stagger: 0.02,
    }, 0.14)
    .from(sub, { y: 8, opacity: 0, duration: 0.3 }, 0.28)
    .from(root.querySelector('.loader-meter'), { y: 10, opacity: 0, duration: 0.3 }, 0.32)
    .from(statusEl, { y: 6, opacity: 0, duration: 0.25 }, 0.38);

  /**
   * Mark heavy prewarm so CSS can emphasize continuous motion.
   * @param {boolean} heavy
   */
  function setBusy(heavy) {
    heavyBusy = !!heavy;
    root.classList.toggle('loader-busy', heavyBusy);
  }

  function setStatus(status) {
    if (!statusEl || !status) return;
    // Instant swap — no GSAP so status never lags behind a blocked ticker.
    gsap.killTweensOf(statusEl);
    statusEl.style.opacity = '1';
    statusEl.style.transform = '';
    statusEl.textContent = status;
  }

  /**
   * @param {number} ratio 0–1
   * @param {string} [status]
   */
  function setProgress(ratio, status) {
    if (finishing) return;
    targetRatio = Math.max(targetRatio, Math.min(1, Number(ratio) || 0));
    // Snap display forward if we fell far behind (tab backgrounded, etc.).
    if (targetRatio - displayRatio > 0.12) {
      displayRatio = targetRatio - 0.06;
      applyVisual(displayRatio);
    }
    armLerp();
    if (status && status !== lastStatusText) {
      lastStatusText = status;
      setStatus(status);
    }
  }

  /**
   * Complete load and reveal the lab with a cinematic wipe.
   * Call only after the 3D scene has been warm-rendered.
   * @returns {Promise<void>}
   */
  function finish() {
    if (finishing) return Promise.resolve();
    finishing = true;
    setBusy(false);
    if (lerpRaf) {
      cancelAnimationFrame(lerpRaf);
      lerpRaf = 0;
    }

    const aurora = root.querySelector('.loader-aurora');
    const grid = root.querySelector('.loader-grid');

    return new Promise((resolve) => {
      targetRatio = 1;
      displayRatio = 1;
      applyVisual(1);
      setStatus('系统就绪 · 欢迎进入实验室');
      root.setAttribute('aria-valuenow', '100');
      root.classList.add('loader-revealing');
      root.style.pointerEvents = 'none';

      const tl = gsap.timeline({
        delay: 0.08,
        onComplete: () => {
          // Keep transparent shell for 2 frames so WebGL is composited before unmount
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              gsap.killTweensOf(ring);
              gsap.killTweensOf(particles);
              root.setAttribute('aria-busy', 'false');
              root.remove();
              document.body.classList.remove('is-loading');
              document.body.classList.add('lab-ready');
              resolve();
            });
          });
        },
      });

      // Lift UI chrome first — no CSS filter blur (expensive on full-screen layers)
      tl.to(content, {
        y: -20,
        opacity: 0,
        duration: 0.35,
        ease: 'power2.in',
      }, 0)
        .to([aurora, grid].filter(Boolean), {
          opacity: 0,
          duration: 0.4,
          ease: 'power2.inOut',
        }, 0)
        .to(root, {
          backgroundColor: 'rgba(234, 245, 255, 0)',
          duration: 0.4,
          ease: 'power2.inOut',
        }, 0.04)
        .to(root, {
          opacity: 0,
          duration: 0.28,
          ease: 'power2.inOut',
        }, 0.28)
        // HUD fade-in once the lab is already visible
        .add(() => {
          const hud = document.getElementById('hud');
          if (hud) {
            gsap.fromTo(
              hud,
              { opacity: 0, y: -12 },
              { opacity: 1, y: 0, duration: 0.55, ease: 'power3.out' },
            );
          }
        }, 0.32);
    });
  }

  applyVisual(0);
  armLerp();
  return { setProgress, setStatus, setBusy, finish };
}
