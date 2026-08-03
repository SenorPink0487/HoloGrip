import { escapeHtml, formatFormulaHtml, formatFormulaPlain } from './chemFormat.js'
import { toChinese } from './chemAliases.js'

/** macOS 系统级暗色主题 Accent 配色 */
export const COMP_COLORS = [
  '#0a84ff', // macOS Blue
  '#30d158', // macOS Green
  '#ff9f0a', // macOS Orange
  '#bf5af2', // macOS Purple
  '#ff375f', // macOS Pink / Red
  '#64d2ff', // macOS Cyan
  '#ffd60a', // macOS Yellow
  '#5e5ce6', // macOS Indigo
  '#ac8e68', // macOS Brown
  '#98989d', // macOS Gray
]

/**
 * 用 SVG 环形图（可点击扇区）渲染成分百分比
 * @param {HTMLElement} mount
 * @param {{
 *   components: Array<{ id: string, name_zh: string, name_en: string, percent: number, role?: string, formula?: string }>,
 *   activeIndex: number,
 *   productZh: string,
 *   productEn: string,
 *   note: string,
 *   onSelect: (index: number) => void
 * }} opts
 */
export function renderComposition(mount, opts) {
  const { productZh, productEn, note, onSelect, reaction } = opts
  if (!mount) return

  const components = Array.isArray(opts.components) ? opts.components : []
  if (!components.length) {
    mount.innerHTML = `
      <div class="comp-empty">
        <span class="panel-kicker">成分构成</span>
        <h2 class="panel-title">成分圆环</h2>
        <p>暂无成分数据</p>
      </div>`
    return
  }

  const activeIndex = Math.min(
    Math.max(0, Number(opts.activeIndex) || 0),
    components.length - 1,
  )

  const total = components.reduce((s, c) => s + (c.percent || 0), 0) || 100
  const size = 220
  const cx = size / 2
  const cy = size / 2
  const rOuter = 92
  const rInner = 58
  const gapDeg = components.length > 1 ? 2.2 : 0

  let cursor = -90 // 从顶部开始
  const slices = components.map((comp, i) => {
    const rawSweep = (comp.percent / total) * 360
    const sweep = Math.max(rawSweep - gapDeg, 0.8)
    const start = cursor + gapDeg / 2
    const end = start + sweep
    cursor += rawSweep
    return {
      ...comp,
      index: i,
      color: COMP_COLORS[i % COMP_COLORS.length],
      start,
      end,
      path: donutSlice(cx, cy, rOuter, rInner, start, end),
    }
  })

  const active = components[activeIndex] || components[0]
  const activeColor = COMP_COLORS[activeIndex % COMP_COLORS.length]
  const activePct = formatPct(active?.percent)

  mount.innerHTML = `
    <div class="comp-panel-head">
      <span class="panel-kicker">${reaction ? '反应产物' : '成分构成'}</span>
      <h2 class="panel-title">${escapeHtml(toChinese(productZh) || '成分构成')}</h2>
      ${reaction?.equation ? `<p class="reaction-equation">${escapeHtml(reaction.equation)}${reaction.condition ? ` · ${escapeHtml(reaction.condition)}` : ''}</p>` : ''}
      ${productEn && toChinese(productEn) !== toChinese(productZh) && productEn.toLowerCase() !== (productZh || '').toLowerCase() ? `<p class="comp-en">${escapeHtml(productEn)}</p>` : ''}
    </div>

    <div class="comp-ring-wrap">
      <svg class="comp-ring" viewBox="0 0 ${size} ${size}" role="img" aria-label="成分百分比环形图">
        <defs>
          <filter id="slice-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.2" result="b"/>
            <feMerge>
              <feMergeNode in="b"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        <circle class="comp-ring-track" cx="${cx}" cy="${cy}" r="${(rOuter + rInner) / 2}"
          fill="none" stroke="rgba(244,241,234,0.06)" stroke-width="${rOuter - rInner}" />
        ${slices
          .map(
            (s) => `
          <path
            class="comp-slice${s.index === activeIndex ? ' is-active' : ''}"
            data-index="${s.index}"
            d="${s.path}"
            fill="${s.color}"
            style="--slice-color:${s.color}"
            tabindex="0"
            role="button"
            aria-label="${escapeAttr(s.name_zh || s.name_en)} ${formatPct(s.percent)}%"
          ></path>`,
          )
          .join('')}
      </svg>

      <div class="comp-ring-center">
        <span class="comp-center-pct" style="color:${activeColor}">${activePct}<small>%</small></span>
        <span class="comp-center-name">${escapeHtml(toChinese(active?.name_zh || active?.name_en || '—'))}</span>
        ${
          active?.formula
            ? `<span class="comp-center-formula chem-formula" title="${escapeAttr(formatFormulaPlain(active.formula))}">${formatFormulaHtml(active.formula)}</span>`
            : ''
        }
        <span class="comp-center-hint">点击圆环切换</span>
      </div>
    </div>

    <ul class="comp-legend">
      ${slices
        .map((s) => {
          const formulaHtml = s.formula
            ? `<span class="chem-formula">${formatFormulaHtml(s.formula)}</span>`
            : ''
          const role = s.role ? escapeHtml(toChinese(s.role)) : ''
          const fallback = !s.formula && !s.role && s.name_en && toChinese(s.name_en) !== toChinese(s.name_zh) ? escapeHtml(s.name_en) : ''
          const metaParts = [formulaHtml, role, fallback].filter(Boolean)
          const meta = metaParts.join('<span class="hud-sep"> · </span>')
          const ariaFormula = s.formula ? ` ${formatFormulaPlain(s.formula)}` : ''
          return `
        <li>
          <button type="button" class="comp-item${s.index === activeIndex ? ' is-active' : ''}" data-index="${s.index}"
            aria-label="${escapeAttr(toChinese(s.name_zh || s.name_en || '') + ariaFormula + ' ' + formatPct(s.percent) + '%')}">
            <span class="comp-dot" style="background:${s.color};box-shadow:0 0 10px ${s.color}66"></span>
            <span class="comp-item-main">
              <span class="comp-item-name">${escapeHtml(toChinese(s.name_zh || s.name_en))}</span>
              <span class="comp-item-meta">${meta || '—'}</span>
            </span>
            <span class="comp-item-pct">${formatPct(s.percent)}%</span>
            <span class="comp-item-mini" aria-hidden="true">
              <svg viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(244,241,234,0.08)" stroke-width="3"/>
                <circle cx="18" cy="18" r="14" fill="none" stroke="${s.color}" stroke-width="3"
                  stroke-linecap="round"
                  stroke-dasharray="${pctToDash(s.percent, total)} 88"
                  transform="rotate(-90 18 18)"/>
              </svg>
            </span>
          </button>
        </li>`
        })
        .join('')}
    </ul>

    <p class="comp-note">${escapeHtml(note || '百分比为典型估算原型')}</p>
  `

  const pick = (idx) => {
    const i = Number(idx)
    if (!Number.isFinite(i) || i < 0 || i >= components.length) return
    onSelect(i)
  }

  mount.querySelectorAll('.comp-slice').forEach((node) => {
    node.addEventListener('click', () => pick(node.getAttribute('data-index')))
    node.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        pick(node.getAttribute('data-index'))
      }
    })
  })

  mount.querySelectorAll('.comp-item').forEach((node) => {
    node.addEventListener('click', () => pick(node.getAttribute('data-index')))
  })
}

/**
 * @param {number} cx
 * @param {number} cy
 * @param {number} rOut
 * @param {number} rIn
 * @param {number} startDeg
 * @param {number} endDeg
 */
function donutSlice(cx, cy, rOut, rIn, startDeg, endDeg) {
  const large = endDeg - startDeg > 180 ? 1 : 0
  const p = (r, deg) => {
    const rad = (deg * Math.PI) / 180
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]
  }
  const [x1, y1] = p(rOut, startDeg)
  const [x2, y2] = p(rOut, endDeg)
  const [x3, y3] = p(rIn, endDeg)
  const [x4, y4] = p(rIn, startDeg)

  // 全圆时 SVG arc 需特殊处理
  if (endDeg - startDeg >= 359.5) {
    const [xm, ym] = p(rOut, startDeg + 180)
    const [xn, yn] = p(rIn, startDeg + 180)
    return [
      `M ${x1} ${y1}`,
      `A ${rOut} ${rOut} 0 1 1 ${xm} ${ym}`,
      `A ${rOut} ${rOut} 0 1 1 ${x1} ${y1}`,
      `L ${x4} ${y4}`,
      `A ${rIn} ${rIn} 0 1 0 ${xn} ${yn}`,
      `A ${rIn} ${rIn} 0 1 0 ${x4} ${y4}`,
      'Z',
    ].join(' ')
  }

  return [
    `M ${x1} ${y1}`,
    `A ${rOut} ${rOut} 0 ${large} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${rIn} ${rIn} 0 ${large} 0 ${x4} ${y4}`,
    'Z',
  ].join(' ')
}

function pctToDash(percent, total) {
  const p = (percent / total) * 100
  const c = 2 * Math.PI * 14
  return ((p / 100) * c).toFixed(2)
}

function formatPct(n) {
  if (n == null) return '—'
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  return v >= 10 ? v.toFixed(v % 1 === 0 ? 0 : 1) : v.toFixed(v < 1 ? 2 : 1)
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, '&#39;')
}
