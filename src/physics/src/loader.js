/**
 * Elegant lab boot loader — GSAP choreography + ldrs quantum spinner.
 */
import gsap from 'gsap';
import { quantum } from 'ldrs';

quantum.register();

/**
 * @returns {{
 *   setProgress: (ratio: number, status?: string) => void,
 *   setStatus: (status: string) => void,
 *   finish: () => Promise<void>,
 * }}
 */
export function createLabLoader() {
  const root = document.getElementById('loader');
  if (!root) {
    return {
      setProgress() {},
      setStatus() {},
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

  // Mount quantum spinner (physics-themed)
  if (orbHost && !orbHost.querySelector('l-quantum')) {
    const el = document.createElement('l-quantum');
    el.setAttribute('size', '72');
    el.setAttribute('speed', '1.45');
    el.setAttribute('color', '#22d3ee');
    orbHost.appendChild(el);
  }

  const progress = { value: 0 };
  let peak = 0;
  let finishing = false;
  let lastStatusText = '';

  const applyProgress = () => {
    const v = progress.value;
    const pct = Math.round(v * 100);
    if (fill) fill.style.transform = `scaleX(${v})`;
    if (glow) glow.style.left = `${v * 100}%`;
    if (pctEl) pctEl.textContent = `${pct}`;
  };

  // ── Intro sequence ──
  const intro = gsap.timeline({ defaults: { ease: 'power3.out' } });
  intro
    .from(root.querySelector('.loader-aurora'), { opacity: 0, duration: 1.1 }, 0)
    .from(ring, { scale: 0.55, opacity: 0, duration: 0.9 }, 0.05)
    .from(orbHost, { scale: 0.4, opacity: 0, duration: 0.85 }, 0.12)
    .from(particles, {
      scale: 0,
      opacity: 0,
      duration: 0.6,
      stagger: { each: 0.05, from: 'random' },
    }, 0.2)
    .from(brandChars, {
      y: 28,
      opacity: 0,
      rotateX: -50,
      duration: 0.55,
      stagger: 0.035,
    }, 0.28)
    .from(sub, { y: 12, opacity: 0, duration: 0.45 }, 0.55)
    .from(root.querySelector('.loader-meter'), { y: 16, opacity: 0, duration: 0.5 }, 0.62)
    .from(statusEl, { y: 10, opacity: 0, duration: 0.4 }, 0.72);

  // Soft orbital drift on ring
  gsap.to(ring, {
    rotation: 360,
    duration: 18,
    ease: 'none',
    repeat: -1,
  });
  gsap.to(particles, {
    y: '+=10',
    duration: 2.4,
    ease: 'sine.inOut',
    yoyo: true,
    repeat: -1,
    stagger: { each: 0.2, from: 'random' },
  });

  function setStatus(status) {
    if (!statusEl || !status) return;
    gsap.killTweensOf(statusEl);
    gsap.to(statusEl, {
      opacity: 0,
      y: -6,
      duration: 0.18,
      ease: 'power2.in',
      onComplete: () => {
        statusEl.textContent = status;
        gsap.fromTo(
          statusEl,
          { opacity: 0, y: 8 },
          { opacity: 1, y: 0, duration: 0.32, ease: 'power2.out' },
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
    root.setAttribute('aria-valuenow', String(Math.round(peak * 100)));
    // Short tween so rapid boot ticks do not stack multi-second bar animations.
    gsap.to(progress, {
      value: peak,
      duration: 0.28,
      ease: 'power2.out',
      overwrite: 'auto',
      onUpdate: applyProgress,
    });
    // Status text tween is expensive; only restart when the copy actually changes.
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

    const aurora = root.querySelector('.loader-aurora');
    const grid = root.querySelector('.loader-grid');

    return new Promise((resolve) => {
      // Allow progress to hit 100 even while finishing flag is set
      peak = 1;
      gsap.to(progress, {
        value: 1,
        duration: 0.35,
        ease: 'power2.out',
        onUpdate: applyProgress,
      });
      setStatus('系统就绪 · 欢迎进入实验室');
      root.setAttribute('aria-valuenow', '100');
      root.classList.add('loader-revealing');
      root.style.pointerEvents = 'none';

      const tl = gsap.timeline({
        delay: 0.15,
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

      // Lift UI chrome first — backdrop fades so the already-warm scene shows through
      tl.to(content, {
        y: -28,
        opacity: 0,
        filter: 'blur(8px)',
        duration: 0.45,
        ease: 'power2.in',
      }, 0)
        .to([aurora, grid].filter(Boolean), {
          opacity: 0,
          duration: 0.55,
          ease: 'power2.inOut',
        }, 0)
        .to(root, {
          backgroundColor: 'rgba(234, 245, 255, 0)',
          duration: 0.55,
          ease: 'power2.inOut',
        }, 0.05)
        .to(root, {
          opacity: 0,
          duration: 0.35,
          ease: 'power2.inOut',
        }, 0.35)
        // HUD fade-in once the lab is already visible
        .add(() => {
          const hud = document.getElementById('hud');
          if (hud) {
            gsap.fromTo(
              hud,
              { opacity: 0, y: -12 },
              { opacity: 1, y: 0, duration: 0.65, ease: 'power3.out' },
            );
          }
        }, 0.4);
    });
  }

  applyProgress();
  return { setProgress, setStatus, finish };
}
