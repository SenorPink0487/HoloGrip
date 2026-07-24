/**
 * Elegant lab boot loader — GSAP choreography + ldrs quantum spinner.
 * Keep this layer light: during GPU prewarm the main thread is busy, so
 * continuous multi-target tweens and blur filters fight the browser chrome.
 */
import gsap from 'gsap';
import { quantum } from 'ldrs';

quantum.register();

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
  /** @type {Element | null} */
  let quantumEl = null;

  document.body.classList.add('is-loading');

  // Mount quantum spinner (physics-themed)
  if (orbHost && !orbHost.querySelector('l-quantum')) {
    const el = document.createElement('l-quantum');
    el.setAttribute('size', '64');
    el.setAttribute('speed', '1.2');
    el.setAttribute('color', '#22d3ee');
    orbHost.appendChild(el);
    quantumEl = el;
  } else {
    quantumEl = orbHost?.querySelector('l-quantum') || null;
  }

  const progress = { value: 0 };
  let peak = 0;
  let finishing = false;
  let lastStatusText = '';
  let lastPct = -1;
  let heavyBusy = false;
  /** @type {gsap.core.Tween | null} */
  let ringTween = null;
  /** @type {gsap.core.Tween | null} */
  let particleTween = null;

  const applyProgress = () => {
    const v = progress.value;
    const pct = Math.round(v * 100);
    if (fill) fill.style.transform = `scaleX(${v})`;
    if (glow) glow.style.left = `${v * 100}%`;
    // Avoid layout thrash when the tween fires many sub-pixel updates.
    if (pctEl && pct !== lastPct) {
      lastPct = pct;
      pctEl.textContent = `${pct}`;
      root.setAttribute('aria-valuenow', String(pct));
    }
  };

  // ── Intro sequence ──
  const intro = gsap.timeline({ defaults: { ease: 'power3.out' } });
  intro
    .from(root.querySelector('.loader-aurora'), { opacity: 0, duration: 0.7 }, 0)
    .from(ring, { scale: 0.7, opacity: 0, duration: 0.55 }, 0.04)
    .from(orbHost, { scale: 0.55, opacity: 0, duration: 0.5 }, 0.08)
    .from(particles, {
      scale: 0,
      opacity: 0,
      duration: 0.4,
      stagger: 0.03,
    }, 0.12)
    .from(brandChars, {
      y: 16,
      opacity: 0,
      duration: 0.4,
      stagger: 0.025,
    }, 0.18)
    .from(sub, { y: 8, opacity: 0, duration: 0.35 }, 0.35)
    .from(root.querySelector('.loader-meter'), { y: 10, opacity: 0, duration: 0.35 }, 0.4)
    .from(statusEl, { y: 6, opacity: 0, duration: 0.3 }, 0.48);

  function startAmbientMotion() {
    if (ringTween) ringTween.kill();
    if (particleTween) particleTween.kill();
    // Prefer CSS for ambient motion when available; GSAP only as fallback boost.
    if (ring) {
      ringTween = gsap.to(ring, {
        rotation: 360,
        duration: 22,
        ease: 'none',
        repeat: -1,
      });
    }
    if (particles?.length) {
      particleTween = gsap.to(particles, {
        y: '+=8',
        duration: 2.8,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
        stagger: 0.25,
      });
    }
  }

  function stopAmbientMotion() {
    if (ringTween) {
      ringTween.kill();
      ringTween = null;
    }
    if (particleTween) {
      particleTween.kill();
      particleTween = null;
    }
    gsap.killTweensOf(ring);
    gsap.killTweensOf(particles);
  }

  startAmbientMotion();

  /**
   * During GPU prewarm, drop non-essential loader animation so the main thread
   * can paint progress + keep browser chrome responsive.
   * @param {boolean} heavy
   */
  function setBusy(heavy) {
    heavyBusy = !!heavy;
    root.classList.toggle('loader-busy', heavyBusy);
    if (heavyBusy) {
      stopAmbientMotion();
      if (quantumEl) quantumEl.setAttribute('speed', '0.85');
    } else if (!finishing) {
      startAmbientMotion();
      if (quantumEl) quantumEl.setAttribute('speed', '1.2');
    }
  }

  function setStatus(status) {
    if (!statusEl || !status) return;
    // Instant text swap while busy — status tweens steal frames from prewarm.
    if (heavyBusy) {
      gsap.killTweensOf(statusEl);
      statusEl.style.opacity = '1';
      statusEl.style.transform = '';
      statusEl.textContent = status;
      return;
    }
    gsap.killTweensOf(statusEl);
    gsap.to(statusEl, {
      opacity: 0,
      y: -4,
      duration: 0.12,
      ease: 'power2.in',
      onComplete: () => {
        statusEl.textContent = status;
        gsap.fromTo(
          statusEl,
          { opacity: 0, y: 6 },
          { opacity: 1, y: 0, duration: 0.22, ease: 'power2.out' },
        );
      },
    });
  }

  /**
   * @param {number} ratio 0–1
   * @param {string} [status]
   */
  function setProgress(ratio, status) {
    if (finishing) return;
    peak = Math.max(peak, Math.min(1, ratio));
    // Short tween so rapid boot ticks do not stack multi-second bar animations.
    // While busy, snap the bar — tweening + onUpdate fights prewarm chunks.
    if (heavyBusy) {
      gsap.killTweensOf(progress);
      progress.value = peak;
      applyProgress();
    } else {
      gsap.to(progress, {
        value: peak,
        duration: 0.22,
        ease: 'power2.out',
        overwrite: 'auto',
        onUpdate: applyProgress,
      });
    }
    // Status text only when the copy actually changes.
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
    stopAmbientMotion();

    const aurora = root.querySelector('.loader-aurora');
    const grid = root.querySelector('.loader-grid');

    return new Promise((resolve) => {
      // Allow progress to hit 100 even while finishing flag is set
      peak = 1;
      progress.value = 1;
      applyProgress();
      setStatus('系统就绪 · 欢迎进入实验室');
      root.setAttribute('aria-valuenow', '100');
      root.classList.add('loader-revealing');
      root.style.pointerEvents = 'none';

      const tl = gsap.timeline({
        delay: 0.1,
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

  applyProgress();
  return { setProgress, setStatus, setBusy, finish };
}
