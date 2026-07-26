import './styles.css'
import { lookupMolecule, loadComponentStructure } from './pubchem.js'
import { parsePart } from './blend.js'
import { MoleculeViewer } from './viewer.js'
import { renderComposition } from './composition.js'
import { escapeHtml, formatFormulaHtml, formatFormulaPlain } from './chemFormat.js'
import { toChinese } from './chemAliases.js'
import {
  initSpecularLighting,
  initSearchDockMotion,
  animateStaggerIn,
  animateFieldEntry,
  animateFieldExit,
  animatePlusPulse,
  setRevealLoading,
} from './appleMotion.js'

const $ = (sel) => document.querySelector(sel)

const el = {
  queryA: $('#query-a'),
  queryB: $('#query-b'),
  search: $('#btn-search'),
  searchRow: $('#search-row'),
  slotB: $('#slot-b'),
  btnBlendAdd: $('#btn-blend-add'),
  reactionCondition: $('#reaction-condition'),
  searchLabelText: $('#search-label-text'),
  searchHint: $('#search-hint'),
  styles: $('#styles'),
  autoRotate: $('#auto-rotate'),
  showLabels: $('#show-labels'),
  reset: $('#btn-reset'),
  overlay: $('#overlay'),
  overlayTitle: $('#overlay-title'),
  overlayDesc: $('#overlay-desc'),
  overlayKicker: $('#overlay-kicker'),
  overlayClose: $('#btn-overlay-close'),
  overlayConfirm: $('#btn-overlay-confirm'),
  molInfo: $('#mol-info'),
  infoList: $('#info-list'),
  hudName: $('#hud-name'),
  hudFormula: $('#hud-formula'),
  hudKicker: $('#hud-kicker'),
  viewport: $('#viewport'),
  compositionRoot: $('#composition-root'),
}

let blendMode = false

const viewer = new MoleculeViewer(el.viewport)

/** @type {{ product: any, activeIndex: number, cache: Map<number, any>, switching: boolean } | null} */
let session = null
let loading = false

function setStatus(_mode, _text) {
  // 顶部状态栏已移除；保留接口供查询流程调用
}

function setOverlay({ hidden = false, loading: isLoading = false, error = false, title, desc, kicker }) {
  el.overlay.classList.toggle('hidden', hidden)
  el.overlay.classList.toggle('loading', isLoading)
  el.overlay.classList.toggle('error', error)
  if (title != null) el.overlayTitle.textContent = title
  if (desc != null) el.overlayDesc.innerHTML = desc
  if (kicker != null && el.overlayKicker) el.overlayKicker.textContent = kicker
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, '&#39;')
}

function applyMolecule(mol, product, comp) {
  viewer.loadSdf(mol.sdf)
  viewer.setSpin(el.autoRotate.checked)

  if (comp && mol.formula && !comp.formula) {
    comp.formula = mol.formula
  }

  const formula = mol.formula || comp?.formula || ''
  const formulaHtml = formula ? formatFormulaHtml(formula) : '—'
  const formulaPlain = formula ? formatFormulaPlain(formula) : '—'

  el.molInfo.hidden = false
  const compNameZh = toChinese(comp?.name_zh || mol.title)
  const iupacZh = toChinese(mol.iupac)
  const roleZh = toChinese(comp?.role)

  const rows = [
    ['成分', compNameZh || '—', 'text'],
    ['占比', comp?.percent != null ? `${comp.percent}%` : '—', 'text'],
    ['角色', roleZh || '—', 'text'],
    ['分子式', formula || '—', 'formula'],
    ['分子量', mol.weight ? `${mol.weight} g/mol` : '—', 'text'],
    ['IUPAC', iupacZh || '—', 'text'],
    ['SMILES', mol.smiles || '—', 'text'],
    ['CID', String(mol.cid || '—'), 'text'],
  ]
  if (product?.blend?.ratio) rows.splice(2, 0, ['混合比', product.blend.ratio, 'text'])
  if (product?.reason) rows.push(['说明', product.reason, 'text'])

  el.infoList.innerHTML = rows
    .map(([k, v, kind]) => {
      const title = kind === 'formula' ? formulaPlain : String(v)
      const body =
        kind === 'formula'
          ? `<span class="chem-formula">${formulaHtml}</span>`
          : escapeHtml(v)
      return `<div><dt>${k}</dt><dd title="${escapeAttr(title)}">${body}</dd></div>`
    })
    .join('')

  try {
    animateStaggerIn(el.infoList.querySelectorAll('div'))
  } catch (err) {
    console.warn('[applyMolecule.stagger]', err)
  }

  const productLabel = toChinese(product?.product_zh) || product?.product_en || ''
  const compLabel = compNameZh || '分子'
  const isMix = product?.kind === 'mixture' || product?.kind === 'blend' || product?.kind === 'reaction'

  el.hudName.textContent = isMix && productLabel && productLabel !== compLabel
    ? `${productLabel} · ${compLabel}`
    : compLabel

  // 化学式单独、醒目展示；其余信息用 · 分隔
  const meta = []
  if (product?.blend?.ratio) meta.push(escapeHtml(`比 ${product.blend.ratio}`))
  if (comp?.percent != null) meta.push(escapeHtml(`${comp.percent}%`))
  if (mol.weight) meta.push(escapeHtml(`${mol.weight} g/mol`))

  const formulaBlock = formula
    ? `<span class="chem-formula chem-formula--hud" title="${escapeAttr(formulaPlain)}">${formulaHtml}</span>`
    : ''
  const metaBlock = meta.length
    ? `<span class="hud-meta">${meta.join('<span class="hud-sep"> · </span>')}</span>`
    : ''

  el.hudFormula.innerHTML =
    [formulaBlock, metaBlock].filter(Boolean).join('<span class="hud-sep"> · </span>') || '—'

  if (el.hudKicker) {
    el.hudKicker.textContent =
      product?.kind === 'reaction' ? '化学反应 · 产物' : product?.kind === 'blend' ? '加法混合' : product?.kind === 'mixture' ? '混合物' : '单质/化合物'
  }

  document.body.classList.add('is-loaded')
}

/** 读取多框输入，组装混合查询 */
function readQueryParts() {
  const container = $('#search-operands')
  const inputs = container ? Array.from(container.querySelectorAll('.chem-input')) : []
  const rawValues = inputs.map((inp) => inp.value.trim()).filter(Boolean)

  if (inputs.length >= 2 && rawValues.length >= 2) {
    const parts = rawValues.map(parsePart)
    const display = parts.map((p) => p.name).join(' + ')
    return { display, parts, solo: null }
  }

  const solo = rawValues.join(' + ') || ''
  return { display: solo, parts: null, solo }
}

/** 动态添加输入框 */
function addOperandField(initialValue = '') {
  const container = $('#search-operands')
  const addBtn = $('#btn-blend-add')
  if (!container || !addBtn) return

  try {
    animatePlusPulse(addBtn)
  } catch (err) {
    console.error(err)
  }

  const fields = container.querySelectorAll('.search-field')
  const count = fields.length
  const tagChar = String.fromCharCode(65 + count)

  const fieldDiv = document.createElement('div')
  fieldDiv.className = 'search-field'
  fieldDiv.setAttribute('data-slot', tagChar.toLowerCase())

  fieldDiv.innerHTML = `
    <span class="search-tag">${tagChar}</span>
    <input
      class="chem-input"
      type="text"
      autocomplete="off"
      spellcheck="false"
      value="${escapeAttr(initialValue)}"
    />
  `

  container.appendChild(fieldDiv)
  updateOperandIndices()

  try {
    animateFieldEntry(fieldDiv)
  } catch (err) {
    console.error(err)
  }

  const inputEl = fieldDiv.querySelector('.chem-input')
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      search()
    }
  })

  requestAnimationFrame(() => {
    container.scrollTo({ left: container.scrollWidth, behavior: 'smooth' })
  })

  if (!initialValue) {
    inputEl.focus()
  }
  return inputEl
}

/** 删除某一输入框（保证一定会从 DOM 移除） */
function removeOperandField(field) {
  if (!field || !field.isConnected || field.dataset.exiting === '1') return
  field.dataset.exiting = '1'

  const finalize = () => {
    if (field.isConnected) field.remove()
    updateOperandIndices()
  }

  try {
    animateFieldExit(field, finalize)
  } catch (err) {
    console.error(err)
    finalize()
  }
}

/** 重新计算并编排各输入框编号 (A, B, C...) 及 UI 内置删除按钮 */
function updateOperandIndices() {
  const container = $('#search-operands')
  if (!container) return
  // 跳过正在退场的框，避免编号/按钮抖动
  const fields = Array.from(container.querySelectorAll('.search-field')).filter(
    (f) => f.dataset.exiting !== '1',
  )
  const isBlend = fields.length >= 2

  if (el.searchRow) {
    el.searchRow.dataset.mode = isBlend ? 'blend' : 'single'
  }

  fields.forEach((field, i) => {
    const tagChar = String.fromCharCode(65 + i)
    field.setAttribute('data-slot', tagChar.toLowerCase())
    const tagEl = field.querySelector('.search-tag')
    if (tagEl) tagEl.textContent = tagChar

    let removeBtn = field.querySelector('.btn-field-remove')
    if (isBlend && !removeBtn) {
      removeBtn = document.createElement('button')
      removeBtn.type = 'button'
      removeBtn.className = 'btn-field-remove'
      removeBtn.title = '删除此项'
      removeBtn.setAttribute('aria-label', '删除此项')
      removeBtn.innerHTML = `<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>`
      removeBtn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        removeOperandField(field)
      })
      field.appendChild(removeBtn)
    } else if (!isBlend && removeBtn) {
      // 回到单框：直接去掉 ×，不必走整框退场动画
      removeBtn.remove()
    }
  })

  if (el.searchLabelText) {
    el.searchLabelText.textContent = isBlend
      ? `反应物：${fields.length} 种物质待识别`
      : '输入反应物、化学式或 SMILES'
  }

  if (el.searchHint) {
    el.searchHint.innerHTML = isBlend
      ? '输入两种反应物 · 点 <strong>+</strong> 增加物质 · 点击输入框上的 <strong>×</strong> 删除'
      : '输入物质、化学式或 SMILES · 点 <strong>+</strong> 添加反应物'
  }
}

function fitChemInput() {}
function fitChemInputs() {}

function paintComposition() {
  if (!session || !el.compositionRoot) return
  const { product, activeIndex } = session
  el.compositionRoot.classList.remove('composition-empty')
  renderComposition(el.compositionRoot, {
    components: product.components,
    activeIndex,
    productZh: product.product_zh,
    productEn: product.product_en,
    note: product.note,
    reaction: product.reaction,
    onSelect: (index) => selectComponent(index),
  })
}

async function selectComponent(index) {
  if (!session || session.switching) return
  if (index === session.activeIndex && session.cache.has(index)) {
    // 仅刷新 UI 高亮
    session.activeIndex = index
    paintComposition()
    return
  }

  const comp = session.product.components[index]
  if (!comp) return

  session.switching = true
  session.activeIndex = index
  paintComposition()
  setStatus('loading', '切换成分…')

  try {
    let mol = session.cache.get(index)
    if (!mol) {
      setOverlay({
        hidden: false,
        loading: true,
        error: false,
        kicker: '成分',
        title: `加载 ${comp.name_zh || comp.name_en}…`,
        desc: `占比 <code>${comp.percent}%</code>`,
      })
      mol = await loadComponentStructure(comp)
      session.cache.set(index, mol)
    }

    applyMolecule(mol, session.product, comp)
    paintComposition()
    setOverlay({ hidden: true, loading: false })
    setStatus('ready', '成分已切换')
  } catch (err) {
    console.error(err)
    setOverlay({
      hidden: false,
      loading: false,
      error: true,
      kicker: '失败',
      title: '该成分暂无结构',
      desc: escapeHtml(err.message || '未知错误'),
    })
    setStatus('error', '切换失败')
  } finally {
    session.switching = false
  }
}

async function search() {
  if (loading) return
  const { display, parts, solo } = readQueryParts()
  const q = display.trim()
  if (!q) return

  loading = true
  el.search.disabled = true
  setRevealLoading(true)
  setStatus('loading', parts ? '反应识别中…' : '解析中…')

  setOverlay({
    hidden: false,
    loading: true,
    error: false,
    kicker: parts ? '化学反应' : '解析中',
    title: parts ? '正在识别反应物与产物…' : '正在拆解成分与结构…',
    desc: `输入：<code>${escapeHtml(q)}</code>`,
  })

  try {
    const result = await lookupMolecule(solo || q, {
      parts: parts || undefined,
      condition: el.reactionCondition?.value || '',
      onStatus: (msg) => {
        setStatus('loading', '工作中')
        setOverlay({
          hidden: false,
          loading: true,
          error: false,
          kicker: parts ? '化学反应' : '观象台',
          title: msg,
          desc: `输入：<code>${escapeHtml(q)}</code>`,
        })
      },
    })

    const components = Array.isArray(result?.components) ? result.components : []
    if (!result?.molecule?.sdf) {
      throw new Error('已解析到成分，但未能加载 3D 结构数据')
    }
    if (!components.length) {
      throw new Error('解析结果缺少成分列表')
    }

    const activeIndex = Math.min(
      Math.max(0, result.activeIndex ?? 0),
      components.length - 1,
    )

    session = {
      product: { ...result, components },
      activeIndex,
      cache: new Map([[activeIndex, result.molecule]]),
      switching: false,
    }

    applyMolecule(result.molecule, session.product, components[activeIndex])
    paintComposition()
    setOverlay({ hidden: true, loading: false })
    setStatus(
      'ready',
      result.kind === 'reaction'
        ? `反应完成 · ${components.length} 种产物`
        : result.kind === 'blend'
        ? `混合 · ${components.length} 种成分`
        : result.kind === 'mixture'
          ? `${components.length} 种成分`
          : '结构已显现',
    )
  } catch (err) {
    console.error(err)
    session = null
    el.molInfo.hidden = true
    if (el.compositionRoot) {
      el.compositionRoot.classList.add('composition-empty')
      el.compositionRoot.innerHTML = `
        <div class="comp-empty">
          <span class="panel-kicker">成分构成</span>
          <h2 class="panel-title">成分圆环</h2>
          <p>查询后在此显示<strong>圆形占比</strong>，点击扇区切换 3D 模型。</p>
        </div>`
    }
    setOverlay({
      hidden: false,
      loading: false,
      error: true,
      kicker: '失败',
      title: err?.code === 'NO_REACTION' ? '未发生化学反应' : '未能显现结构',
      desc: escapeHtml(err.message || '未知错误'),
    })
    el.hudName.textContent = '未找到'
    el.hudFormula.textContent = '请换一种描述或化学式再试'
    if (el.hudKicker) el.hudKicker.textContent = '错误'
    setStatus('error', '查询失败')
  } finally {
    loading = false
    el.search.disabled = false
    setRevealLoading(false)
  }
}

/* ---------- Events ---------- */
el.search.addEventListener('click', () => search())

el.queryA?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault()
    search()
  }
})

el.btnBlendAdd?.addEventListener('click', () => {
  addOperandField()
})

if (el.styles) {
  el.styles.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-style]')
    if (!btn) return
    el.styles.querySelectorAll('.style-card').forEach((b) => b.classList.remove('active'))
    btn.classList.add('active')
    viewer.setStyle(btn.dataset.style)
  })
}

el.autoRotate.addEventListener('change', () => {
  viewer.setSpin(el.autoRotate.checked)
})

el.showLabels.addEventListener('change', () => {
  viewer.setLabels(el.showLabels.checked)
})

el.reset.addEventListener('click', () => viewer.resetView())

el.overlayClose?.addEventListener('click', () => {
  setOverlay({ hidden: true, loading: false })
})

el.overlayConfirm?.addEventListener('click', () => {
  setOverlay({ hidden: true, loading: false })
})

el.overlay?.addEventListener('click', (e) => {
  if (e.target === el.overlay && !el.overlay.classList.contains('loading')) {
    setOverlay({ hidden: true, loading: false })
  }
})

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || e.key === 'Esc') {
    if (!el.overlay.classList.contains('hidden') && !el.overlay.classList.contains('loading')) {
      setOverlay({ hidden: true, loading: false })
    }
  }
  if (e.key === 'r' || e.key === 'R') {
    if (e.target.matches('input, textarea')) return
    viewer.resetView()
  }
})

window.addEventListener('resize', () => {
  viewer.resize()
  // 窗口尺寸变化后重适配分子（仅尺寸，不改朝向动画）
  if (session) viewer.fit({ animate: false })
})

// 启动：空白态，单输入框，不自动加载
updateOperandIndices()
setOverlay({ hidden: true, loading: false, error: false })
setStatus('ready', '等待输入')
fitChemInputs()

// 初始化 Apple 风格极简动效与触感 + 搜索岛编排
initSpecularLighting()
initSearchDockMotion()
