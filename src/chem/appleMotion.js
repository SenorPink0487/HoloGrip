import { animate } from 'motion'

/**
 * HoloChem · 搜索岛动效
 * Motion 12 正确弹簧写法：{ type: 'spring', stiffness, damping, mass }
 * 切勿 easing: spring({...}) —— spring() 作 generator 时缺 keyframes 会抛
 * Cannot read properties of undefined (reading '0')
 */

/** 柔出（时长动画） */
const EASE_OUT = [0.22, 1, 0.36, 1]

/** 轻触回弹 */
const SPRING_PRESS = { type: 'spring', stiffness: 520, damping: 32, mass: 0.7 }
/** 悬浮 */
const SPRING_HOVER = { type: 'spring', stiffness: 260, damping: 22, mass: 0.9 }
/** 布局展开 */
const SPRING_LAYOUT = { type: 'spring', stiffness: 200, damping: 26, mass: 1 }
/** 列表入场 */
const SPRING_ENTER = { type: 'spring', stiffness: 160, damping: 22, mass: 1 }
/** 微件弹入 */
const SPRING_POP = { type: 'spring', stiffness: 320, damping: 20, mass: 0.75 }

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * @param {Element} el
 * @param {Record<string, any>} keyframes
 * @param {Record<string, any>} [options]
 */
function motionTo(el, keyframes, options = {}) {
  if (!el) return Promise.resolve()
  try {
    const controls = animate(el, keyframes, options)
    if (controls && typeof controls.then === 'function') return controls
    if (controls?.finished && typeof controls.finished.then === 'function') {
      return controls.finished
    }
    return Promise.resolve(controls)
  } catch (err) {
    console.warn('[motion]', err)
    return Promise.resolve()
  }
}

/* =========================================================
   通用：按压 / 悬浮
   ========================================================= */

/**
 * @param {HTMLElement} element
 * @param {{ pressScale?: number }} [opts]
 */
export function bindApplePress(element, opts = {}) {
  if (!element || element.dataset.applePressBound) return
  element.dataset.applePressBound = 'true'
  const pressScale = opts.pressScale ?? 0.97

  const onDown = () => {
    motionTo(element, { scale: pressScale }, {
      duration: 0.14,
      ease: EASE_OUT,
    })
  }

  const onUp = () => {
    motionTo(element, { scale: 1 }, SPRING_PRESS)
  }

  element.addEventListener('pointerdown', onDown)
  element.addEventListener('pointerup', onUp)
  element.addEventListener('pointercancel', onUp)
  element.addEventListener('pointerleave', onUp)
}

/**
 * @param {HTMLElement} element
 */
export function bindAppleHover(element) {
  if (!element || element.dataset.appleHoverBound) return
  element.dataset.appleHoverBound = 'true'

  element.addEventListener('mouseenter', () => {
    motionTo(element, { y: -1.5, scale: 1.015 }, SPRING_HOVER)
  })

  element.addEventListener('mouseleave', () => {
    motionTo(element, { y: 0, scale: 1 }, SPRING_HOVER)
  })
}

/* =========================================================
   多框增减
   ========================================================= */

/**
 * @param {HTMLElement} element
 */
export function animateFieldEntry(element) {
  if (!element) return
  if (prefersReducedMotion()) {
    element.style.opacity = '1'
    return
  }

  const operands = element.closest('.search-operands')
  if (operands) operands.classList.add('is-animating')

  const isBlend = !!element.closest('[data-mode="blend"]')
  const targetW = isBlend ? 160 : (element.offsetWidth || 160)

  element.style.transformOrigin = 'left center'
  element.style.overflow = 'hidden'
  element.style.willChange = 'width, opacity, transform'
  element.style.transition = 'none'
  element.style.width = '0px'
  element.style.opacity = '0'
  element.style.transform = 'scale(0.92)'

  void element.offsetWidth

  element.style.transition = 'width 480ms cubic-bezier(0.16, 1, 0.3, 1), opacity 400ms ease-out, transform 480ms cubic-bezier(0.16, 1, 0.3, 1)'
  element.style.width = `${targetW}px`
  element.style.opacity = '1'
  element.style.transform = 'scale(1)'

  setTimeout(() => {
    element.style.transition = ''
    element.style.overflow = ''
    element.style.willChange = ''
    element.style.width = ''
    element.style.opacity = ''
    element.style.transform = ''
    if (operands) operands.classList.remove('is-animating')
  }, 480)
}

/**
 * @param {HTMLElement} element
 * @param {Function} [onComplete]
 */
export function animateFieldExit(element, onComplete) {
  let operands = element?.closest('.search-operands')
  if (operands) operands.classList.add('is-animating')

  let settled = false
  const finish = () => {
    if (settled) return
    settled = true
    if (operands) operands.classList.remove('is-animating')
    onComplete?.()
  }

  if (!element) {
    finish()
    return
  }

  if (prefersReducedMotion()) {
    finish()
    return
  }

  const startW = element.offsetWidth || 160
  element.style.transformOrigin = 'left center'
  element.style.overflow = 'hidden'
  element.style.pointerEvents = 'none'
  element.style.willChange = 'width, opacity, transform'
  element.style.transition = 'none'
  element.style.width = `${startW}px`
  element.style.opacity = '1'
  element.style.transform = 'scale(1)'

  void element.offsetWidth

  element.style.transition = 'width 420ms cubic-bezier(0.16, 1, 0.3, 1), opacity 350ms ease-in, transform 420ms cubic-bezier(0.16, 1, 0.3, 1)'
  element.style.width = '0px'
  element.style.opacity = '0'
  element.style.transform = 'scale(0.88)'

  setTimeout(finish, 420)
}

/**
 * @param {HTMLElement} btn
 */
export function animatePlusPulse(btn) {
  if (!btn || prefersReducedMotion()) return
  const icon = btn.querySelector('.btn-plus-icon') || btn
  motionTo(icon, { rotate: 90 }, SPRING_POP)
  spawnRipple(btn, 'rgba(245, 194, 107, 0.35)')
}

/* =========================================================
   搜索岛
   ========================================================= */

export function initSpecularLighting() {
  let raf = 0
  let latest = null

  const apply = () => {
    raf = 0
    if (!latest) return
    const e = latest
    const glassElements = document.querySelectorAll(
      '.glass, .search-shell, .style-card, .btn-reveal, .hud-card',
    )
    glassElements.forEach((el) => {
      const rect = el.getBoundingClientRect()
      const pad = 80
      if (
        e.clientX >= rect.left - pad &&
        e.clientX <= rect.right + pad &&
        e.clientY >= rect.top - pad &&
        e.clientY <= rect.bottom + pad
      ) {
        const x = ((e.clientX - rect.left) / rect.width) * 100
        const y = ((e.clientY - rect.top) / rect.height) * 100
        el.style.setProperty('--spot-x', `${x.toFixed(1)}%`)
        el.style.setProperty('--spot-y', `${y.toFixed(1)}%`)
        el.style.setProperty('--spot-opacity', '1')
      } else {
        el.style.setProperty('--spot-opacity', '0')
      }
    })
  }

  window.addEventListener(
    'pointermove',
    (e) => {
      latest = e
      if (!raf) raf = requestAnimationFrame(apply)
    },
    { passive: true },
  )

  const interactiveSelector = '.btn-ghost, .comp-item, .switch'
  document.querySelectorAll(interactiveSelector).forEach((el) =>
    bindApplePress(el),
  )

  const observer = new MutationObserver(() => {
    document
      .querySelectorAll(interactiveSelector)
      .forEach((el) => bindApplePress(el))
  })
  observer.observe(document.body, { childList: true, subtree: true })
}

/**
 * @param {HTMLElement[] | NodeListOf<HTMLElement>} elements
 */
export function animateStaggerIn(elements) {
  if (!elements || !elements.length) return
  if (prefersReducedMotion()) return

  try {
    elements.forEach((el, index) => {
      motionTo(
        el,
        {
          opacity: [0, 1],
          y: [8, 0],
        },
        {
          delay: index * 0.04,
          ...SPRING_ENTER,
        },
      )
    })
  } catch (err) {
    console.warn('[animateStaggerIn]', err)
  }
}

/**
 * 初始化搜索岛动效
 */
export function initSearchDockMotion() {
  const dock = document.querySelector('.search-dock')
  const shell = document.querySelector('.search-shell')
  const labelDot = document.querySelector('.label-dot')
  const row = document.querySelector('.search-row')
  const plus = document.querySelector('.btn-plus')
  const reveal = document.querySelector('.btn-reveal')
  const hint = document.querySelector('.search-hint')

  if (!dock || !shell) return

  dock.style.opacity = ''
  dock
    .querySelectorAll(
      '.search-label, .search-field, .btn-plus, .btn-reveal, .search-hint, .btn-arrow',
    )
    .forEach((el) => {
      el.style.opacity = ''
      el.style.transform = ''
    })

  dock.classList.add('motion-ready')

  bindShellFocus(shell, dock)
  if (plus) bindMagneticPlus(plus)
  if (reveal) bindRevealCatalyst(reveal)
  if (labelDot) bindLabelDotPulse(labelDot)
  bindFieldFocusGlow(document.querySelector('#search-operands'))
  observeModeHint(row, hint)
}

function bindShellFocus(shell, dock) {
  const onFocusIn = () => {
    shell.classList.add('is-focused')
    dock.classList.add('is-focused')
  }

  const onFocusOut = (e) => {
    if (shell.contains(e.relatedTarget)) return
    shell.classList.remove('is-focused')
    dock.classList.remove('is-focused')
  }

  shell.addEventListener('focusin', onFocusIn)
  shell.addEventListener('focusout', onFocusOut)
}

function bindMagneticPlus(btn) {
  if (btn.dataset.magneticBound) return
  btn.dataset.magneticBound = 'true'

  const icon = btn.querySelector('.btn-plus-icon')
  let hovering = false
  let pressed = false
  let raf = 0

  let tx = 0
  let ty = 0
  let ts = 1
  let rx = 0
  let ry = 0
  let cx = 0
  let cy = 0
  let cs = 1
  let crx = 0
  let cry = 0

  const syncTargets = () => {
    if (pressed) {
      ts = 0.96
    } else if (hovering) {
      ts = 1.04
      if (ty > -0.5) ty = -2
    } else {
      ts = 1
      tx = 0
      ty = 0
      rx = 0
      ry = 0
    }
  }

  const tick = () => {
    const k = pressed ? 0.28 : 0.14
    cx += (tx - cx) * k
    cy += (ty - cy) * k
    cs += (ts - cs) * k
    crx += (rx - crx) * k
    cry += (ry - cry) * k

    btn.style.transform =
      `translate3d(${cx.toFixed(2)}px, ${cy.toFixed(2)}px, 0) ` +
      `rotateX(${crx.toFixed(2)}deg) rotateY(${cry.toFixed(2)}deg) ` +
      `scale(${cs.toFixed(3)})`

    const still =
      Math.abs(tx - cx) < 0.04 &&
      Math.abs(ty - cy) < 0.04 &&
      Math.abs(ts - cs) < 0.004 &&
      Math.abs(rx - crx) < 0.04 &&
      Math.abs(ry - cry) < 0.04

    if (!still || hovering || pressed) {
      raf = requestAnimationFrame(tick)
    } else {
      raf = 0
      btn.style.transform = ''
    }
  }

  const ensureTick = () => {
    if (!raf) raf = requestAnimationFrame(tick)
  }

  btn.addEventListener('pointerenter', () => {
    hovering = true
    btn.classList.add('is-hot')
    syncTargets()
    if (icon && !prefersReducedMotion()) {
      motionTo(icon, { rotate: 90 }, SPRING_HOVER)
    }
    ensureTick()
  })

  btn.addEventListener('pointerleave', () => {
    hovering = false
    pressed = false
    btn.classList.remove('is-hot')
    syncTargets()
    if (icon && !prefersReducedMotion()) {
      motionTo(icon, { rotate: 0 }, SPRING_HOVER)
    }
    ensureTick()
  })

  btn.addEventListener('pointerdown', () => {
    pressed = true
    syncTargets()
    ensureTick()
  })

  btn.addEventListener('pointerup', () => {
    pressed = false
    syncTargets()
    ensureTick()
  })

  btn.addEventListener('pointercancel', () => {
    pressed = false
    syncTargets()
    ensureTick()
  })

  btn.addEventListener(
    'pointermove',
    (e) => {
      if (!hovering || prefersReducedMotion()) return
      const rect = btn.getBoundingClientRect()
      const px = (e.clientX - rect.left) / rect.width - 0.5
      const py = (e.clientY - rect.top) / rect.height - 0.5
      tx = px * 2.5
      ty = -2 + py * 1.5
      ry = px * 6
      rx = -py * 5
      syncTargets()
      ensureTick()
    },
    { passive: true },
  )
}

function bindRevealCatalyst(btn) {
  if (btn.dataset.revealBound) return
  btn.dataset.revealBound = 'true'

  const arrow = btn.querySelector('.btn-arrow')
  const text = btn.querySelector('.btn-text')
  let hovering = false
  let pressed = false

  if (!btn.querySelector('.btn-shimmer')) {
    const shimmer = document.createElement('span')
    shimmer.className = 'btn-shimmer'
    shimmer.setAttribute('aria-hidden', 'true')
    btn.appendChild(shimmer)
  }

  const settleBtn = () => {
    if (prefersReducedMotion()) return
    if (pressed) {
      motionTo(btn, { y: hovering ? -1 : 0, scale: 0.97 }, {
        duration: 0.12,
        ease: EASE_OUT,
      })
    } else if (hovering) {
      motionTo(btn, { y: -1.5, scale: 1.02 }, SPRING_HOVER)
    } else {
      motionTo(btn, { y: 0, scale: 1 }, SPRING_HOVER)
    }
  }

  btn.addEventListener('pointerenter', () => {
    hovering = true
    btn.classList.add('is-hot')
    settleBtn()
    if (prefersReducedMotion()) return
    if (arrow) motionTo(arrow, { x: 3 }, SPRING_HOVER)
    if (text) motionTo(text, { x: -0.5 }, { duration: 0.35, ease: EASE_OUT })
  })

  btn.addEventListener('pointerleave', () => {
    hovering = false
    pressed = false
    btn.classList.remove('is-hot')
    settleBtn()
    if (prefersReducedMotion()) return
    if (arrow) motionTo(arrow, { x: 0 }, SPRING_HOVER)
    if (text) motionTo(text, { x: 0 }, { duration: 0.4, ease: EASE_OUT })
  })

  btn.addEventListener('pointerdown', () => {
    pressed = true
    settleBtn()
  })

  btn.addEventListener('pointerup', () => {
    pressed = false
    settleBtn()
  })

  btn.addEventListener('pointercancel', () => {
    pressed = false
    settleBtn()
  })

  btn.addEventListener('click', () => {
    if (prefersReducedMotion()) return
    spawnRipple(btn, 'rgba(255, 255, 255, 0.4)')
    if (arrow) {
      motionTo(arrow, { x: [3, 6, 3] }, {
        duration: 0.5,
        ease: EASE_OUT,
      })
    }
  })
}

function bindLabelDotPulse(dot) {
  if (dot.dataset.pulseBound) return
  dot.dataset.pulseBound = 'true'
  const shell = document.querySelector('.search-shell')
  if (!shell) return

  shell.addEventListener('focusin', () => dot.classList.add('is-active'))
  shell.addEventListener('focusout', (e) => {
    if (!shell.contains(e.relatedTarget)) dot.classList.remove('is-active')
  })
}

function bindFieldFocusGlow(container) {
  if (!container) return

  container.addEventListener('focusin', (e) => {
    const field = e.target.closest?.('.search-field')
    if (!field) return
    field.classList.add('is-lit')
    if (!prefersReducedMotion()) {
      motionTo(field, { scale: [1, 1.018, 1.01], y: -2 }, { type: 'spring', stiffness: 380, damping: 22, mass: 0.7 })
    }
  })

  container.addEventListener('focusout', (e) => {
    const field = e.target.closest?.('.search-field')
    if (!field) return
    if (!prefersReducedMotion()) {
      motionTo(field, { scale: 1, y: 0 }, { type: 'spring', stiffness: 300, damping: 24, mass: 0.8 })
    }
    requestAnimationFrame(() => {
      if (!field.contains(document.activeElement)) {
        field.classList.remove('is-lit')
      }
    })
  })
}

function observeModeHint(row, hint) {
  if (!row || !hint) return

  const mo = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.attributeName === 'data-mode') morphHint(hint)
    }
  })
  mo.observe(row, { attributes: true, attributeFilter: ['data-mode'] })
}

function morphHint(hint) {
  if (prefersReducedMotion()) return
  motionTo(hint, { opacity: [0.25, 1] }, { duration: 0.4, ease: EASE_OUT })
}

/**
 * @param {HTMLElement} host
 * @param {string} color
 */
function spawnRipple(host, color) {
  if (!host || prefersReducedMotion()) return
  const rect = host.getBoundingClientRect()
  const ripple = document.createElement('span')
  ripple.className = 'motion-ripple'
  ripple.style.setProperty('--ripple-color', color)
  const size = Math.max(rect.width, rect.height) * 1.5
  ripple.style.width = `${size}px`
  ripple.style.height = `${size}px`
  ripple.style.left = '50%'
  ripple.style.top = '50%'
  host.appendChild(ripple)

  motionTo(
    ripple,
    {
      scale: [0.2, 1],
      opacity: [0.4, 0],
    },
    { duration: 0.65, ease: EASE_OUT },
  ).then(() => ripple.remove())
}

/** @type {import('motion').AnimationPlaybackControls | null} */
let revealArrowAnim = null

/**
 * @param {boolean} loading
 */
export function setRevealLoading(loading) {
  const btn = document.querySelector('.btn-reveal')
  if (!btn) return
  btn.classList.toggle('is-loading', !!loading)

  const arrow = btn.querySelector('.btn-arrow')
  if (revealArrowAnim) {
    try {
      revealArrowAnim.stop()
    } catch {
      /* ignore */
    }
    revealArrowAnim = null
  }

  if (!arrow || prefersReducedMotion()) return

  if (loading) {
    try {
      revealArrowAnim = animate(
        arrow,
        { x: [0, 5, 0] },
        { duration: 1.1, ease: 'ease-in-out', repeat: Infinity },
      )
    } catch (err) {
      console.warn('[setRevealLoading]', err)
    }
  } else {
    motionTo(arrow, { x: 0 }, { duration: 0.3, ease: EASE_OUT })
  }
}
