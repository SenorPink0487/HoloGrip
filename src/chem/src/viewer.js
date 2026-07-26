import * as ThreeDmolNS from '3dmol'

/** Vite / CJS 互操作：兼容 default 与命名空间两种形态 */
const $3Dmol = ThreeDmolNS.default ?? ThreeDmolNS

/**
 * 按元素给原子标签配色，提高对比与可辨识度
 * @param {string} elem
 */
function labelStyleForElement(elem) {
  const e = String(elem || '').toUpperCase()
  /** @type {Record<string, { fontColor: string, backgroundColor: string, borderColor: string }>} */
  const map = {
    C: { fontColor: '#f8fafc', backgroundColor: '#1e293b', borderColor: '#94a3b8' },
    N: { fontColor: '#eff6ff', backgroundColor: '#1e3a8a', borderColor: '#60a5fa' },
    O: { fontColor: '#fff1f2', backgroundColor: '#9f1239', borderColor: '#fb7185' },
    S: { fontColor: '#422006', backgroundColor: '#facc15', borderColor: '#fde047' },
    P: { fontColor: '#fff7ed', backgroundColor: '#9a3412', borderColor: '#fb923c' },
    F: { fontColor: '#ecfdf5', backgroundColor: '#065f46', borderColor: '#34d399' },
    CL: { fontColor: '#ecfdf5', backgroundColor: '#064e3b', borderColor: '#6ee7b7' },
    BR: { fontColor: '#fff1f2', backgroundColor: '#7f1d1d', borderColor: '#f87171' },
    I: { fontColor: '#faf5ff', backgroundColor: '#4c1d95', borderColor: '#c4b5fd' },
  }
  return (
    map[e] || {
      fontColor: '#ecfeff',
      backgroundColor: '#0f766e',
      borderColor: '#5eead4',
    }
  )
}

/**
 * 3Dmol 分子查看器封装
 * 注意：必须在容器有真实宽高后再 resize + zoomTo，否则会出现
 * 分子过大/过小、滚轮缩放异常、切换模型后比例错乱等问题。
 */
export class MoleculeViewer {
  /**
   * @param {HTMLElement} element
   */
  constructor(element) {
    this.element = element
    this.viewer = $3Dmol.createViewer(element, {
      backgroundColor: 0x03050a,
      antialias: true,
      cartoonQuality: 10,
    })
    this.style = 'stick'
    this.showLabels = false
    this.spinning = true
    this.hasModel = false
    /** zoomTo 后再拉远一点，避免贴满画布边缘（0.7~0.85 较自然） */
    this.fitPadding = 0.78
    this._resizeObs = null
    this._raf = 0
    this._onWheel = null

    this._bindResize()
    this._bindWheelZoom()
    // 首帧布局完成后再同步一次尺寸
    requestAnimationFrame(() => this.resize())
  }

  _bindResize() {
    if (typeof ResizeObserver === 'undefined') return
    this._resizeObs = new ResizeObserver(() => {
      cancelAnimationFrame(this._raf)
      this._raf = requestAnimationFrame(() => this.resize())
    })
    this._resizeObs.observe(this.element)
  }

  /**
   * 覆盖 3Dmol 默认滚轮方向：向上滚 = 放大，向下滚 = 缩小。
   * 在 capture 阶段拦截，避免库内 handler 再处理一次。
   */
  _bindWheelZoom() {
    this._onWheel = (ev) => {
      if (!this.hasModel) return
      // 仅处理视口内的滚轮，避免误伤侧栏
      if (!this.element.contains(ev.target)) return

      ev.preventDefault()
      ev.stopImmediatePropagation()

      // 标准 wheel：deltaY < 0 为向上滚 → 放大（factor > 1）
      let dy = ev.deltaY
      if (ev.deltaMode === 1) dy *= 16 // 按行
      if (ev.deltaMode === 2) dy *= 100 // 按页

      // 限幅，手感接近常见地图/CAD：轻滚一小步，急滚多步
      const steps = Math.max(-6, Math.min(6, -dy / 100))
      if (steps === 0) return
      const factor = Math.pow(1.12, steps)
      try {
        this.viewer.zoom(factor, 0)
      } catch (e) {
        console.warn('[viewer.wheel]', e)
      }
    }
    // capture: true 优先于 3Dmol 绑在 canvas 上的 bubble 监听
    this.element.addEventListener('wheel', this._onWheel, { capture: true, passive: false })
  }

  /**
   * 同步画布尺寸 → 适配分子到可视区域
   * @param {{ animate?: boolean }} [opts]
   */
  fit(opts = {}) {
    if (!this.hasModel) {
      this.resize()
      return
    }
    const duration = opts.animate ? 400 : 0
    this.resize()
    try {
      // 先框住整颗分子
      this.viewer.zoomTo({}, duration)
      // 再略微拉远，留出边距（小分子不会撑满、大分子也不会裁切感过强）
      if (this.fitPadding && this.fitPadding !== 1) {
        this.viewer.zoom(this.fitPadding, duration)
      }
    } catch (e) {
      console.warn('[viewer.fit]', e)
      try {
        this.viewer.zoomTo()
      } catch {
        /* ignore */
      }
    }
    this.viewer.render()
  }

  /**
   * @param {string} sdf
   */
  loadSdf(sdf) {
    // 加载前先停转，避免 zoom 过程中朝向乱晃
    const wasSpinning = this.spinning
    this.viewer.spin(false)

    this.viewer.clear()
    this.viewer.addModel(sdf, 'sdf')
    this.hasModel = true
    this.applyStyle()

    // 双 rAF：等 DOM/WebGL 尺寸稳定后再 fit（切换成分、首次加载都依赖这个）
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.fit({ animate: false })
        if (wasSpinning) this.setSpin(true)
      })
    })
  }

  applyStyle() {
    if (!this.hasModel) return

    this.viewer.setStyle({}, {})
    this.viewer.removeAllSurfaces()
    this.viewer.removeAllLabels()

    switch (this.style) {
      case 'sphere':
        this.viewer.setStyle({}, { sphere: { scale: 0.32 } })
        break
      case 'line':
        this.viewer.setStyle({}, { line: { linewidth: 2 } })
        break
      case 'surface':
        this.viewer.setStyle({}, { stick: { radius: 0.12 }, sphere: { scale: 0.22 } })
        this.viewer.addSurface(
          $3Dmol.SurfaceType.VDW,
          { opacity: 0.7, color: 'white' },
          {},
        )
        break
      case 'stick':
      default:
        this.viewer.setStyle(
          {},
          {
            stick: { radius: 0.15 },
            sphere: { scale: 0.25 },
          },
        )
        break
    }

    if (this.showLabels) {
      const model = this.viewer.getModel()
      if (model) {
        const atoms = model.selectedAtoms({})
        for (const atom of atoms) {
          if (!atom.elem || atom.elem === 'H') continue
          const style = labelStyleForElement(atom.elem)
          this.viewer.addLabel(atom.elem, {
            position: atom,
            font: 'Segoe UI, system-ui, sans-serif',
            fontSize: 20,
            bold: true,
            padding: 6,
            fontColor: style.fontColor,
            fontOpacity: 1,
            backgroundColor: style.backgroundColor,
            backgroundOpacity: 0.94,
            borderThickness: 2,
            borderColor: style.borderColor,
            borderOpacity: 1,
            alignment: 'center',
            inFront: true,
            showBackground: true,
          })
        }
      }
    }

    this.viewer.render()
  }

  /**
   * @param {'stick'|'sphere'|'line'|'surface'} style
   */
  setStyle(style) {
    this.style = style
    this.applyStyle()
    // 表面模型包围盒变化，重新适配一次
    if (style === 'surface' || style === 'sphere') {
      requestAnimationFrame(() => this.fit({ animate: true }))
    }
  }

  /**
   * @param {boolean} on
   */
  setLabels(on) {
    this.showLabels = on
    this.applyStyle()
  }

  /**
   * @param {boolean} on
   */
  setSpin(on) {
    this.spinning = on
    this.viewer.spin(on ? 'y' : false, 0.55)
  }

  resetView() {
    if (!this.hasModel) return
    this.fit({ animate: true })
  }

  resize() {
    const w = this.element.clientWidth
    const h = this.element.clientHeight
    if (w < 2 || h < 2) return
    try {
      this.viewer.resize()
      this.viewer.render()
    } catch (e) {
      console.warn('[viewer.resize]', e)
    }
  }
}
