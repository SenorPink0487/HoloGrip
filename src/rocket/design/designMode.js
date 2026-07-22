/**
 * VAB-style design mode: craft part-tree + attach install state machine.
 */

import {
  PART_CATEGORIES,
  listPartDefs,
  getPartDef,
  MATERIAL_PRESETS,
  defaultMaterial,
  defaultUv,
  createPartId,
} from './partDefs.js';
import {
  createDefaultStarshipCraft,
  cloneCraft,
  normalizeCraft,
  asCraft,
  attachPart,
  detachPart,
  setPartParams,
  setCraftName,
  listValidAttachTargets,
  getAssemblyTreeView,
  getPart,
  canAttach,
} from './craftGraph.js';
import {
  compileFlightProjection,
  asStageDesign,
} from './compileFlight.js';
import { calculateRocketPerformance } from './performance.js';
import { serializeDesign, deserializeDesign } from './serialize.js';
import { saveDesignLocal, loadDesignLocal } from './storage.js';
import { createDesignHistory } from './history.js';
import { processTextureUpload } from './texturePipeline.js';
import { setStageCount, setStageEngineCount } from './designModel.js';
import { addConnection, removeConnection, setPartCrossfeed, listConnections } from './connections.js';
import {
  summarizeCraftResources,
  RESOURCE_DEFS,
  partResourceAmount,
} from './resources.js';
import {
  ensureStaging,
  rebuildStaging,
  moveStageGroup,
  addEmptyStage,
  removeStageGroup,
  iconGlyph,
  ACTION_GROUP_KEYS,
  toggleActionGroup,
  partActionGroups,
  normalizeActionGroups,
} from './staging.js';
import {
  CRAFT_TEMPLATES,
  buildTemplateCraft,
  DEFAULT_TEMPLATE_ID,
  getTemplateMeta,
} from './templates.js';
import { evaluateFlightCheck } from './flightCheck.js';
import { estimateMassBalance } from './massBalance.js';

/**
 * @param {object} opts
 */
export function createDesignModeController(opts) {
  const {
    rootEl,
    onDesignChange,
    onApplyToPad,
    onExit,
    onToast = () => {},
    onSelectionChange = () => {},
    onParamFeedback = () => {},
    /** Fired after a successful place (engine / decoupler / any part) for 3D motion cue */
    onPlaceFeedback = () => {},
    onInstallPreview = () => {},
    onViewStyleChange = () => {},
    onBalanceGizmoChange = () => {},
  } = opts;

  const history = createDesignHistory(60);
  let design = buildTemplateCraft(DEFAULT_TEMPLATE_ID);
  /** @type {{ type: string, index: number, partId: string|null, primaryId?: string|null, mode?: string }} */
  let selected = { type: 'root', index: 0, partId: null, primaryId: null, mode: 'select' };
  let autosaveTimer = null;
  let active = false;
  /** @type {'templates' | 'library' | 'tree'} */
  let leftTab = 'templates';
  let activeCategory = 'tank';
  let symmetry = 1;
  /** @type {{ defId: string } | null} */
  let installPick = null;
  /** Radians — applied as radial/engine yaw offset while placing (Q/E) */
  let installRotation = 0;
  /** Palette drag tracking for drag-to-canvas install */
  let paletteDrag = null;
  let perfDetailOpen = false;
  let lastSelectionSig = '';
  /** @type {'solid'|'cutaway'|'xray'} — solid full craft like KSP VAB */
  let viewStyle = 'solid';
  let lastPreviewFlash = 0;
  /** @type {null | 'fuelLine' | 'strut'} connection tool */
  let linkTool = null;
  /** First endpoint while placing a fuel line / strut */
  let linkFromId = null;
  /** Novice mode: hide advanced tools, auto diameter + side symmetry */
  let noviceMode = true;
  /** Last applied template id (for UI highlight) */
  let lastTemplateId = DEFAULT_TEMPLATE_ID;
  /** Collapse wizard once user dismisses */
  let wizardCollapsed = false;
  /** Show CoM ball + thrust arrow in studio */
  let showBalanceGizmos = true;

  function toast(msg, kind) {
    onToast(msg, kind);
  }

  function selectionSig(sel) {
    if (!sel) return '';
    return `${sel.mode || 'select'}|${sel.type}|${sel.index ?? 0}|${sel.partId ?? ''}|${sel.primaryId ?? ''}|${installPick?.defId || ''}`;
  }

  function emitSelection() {
    const sig = selectionSig(selected);
    if (sig === lastSelectionSig) return;
    lastSelectionSig = sig;
    onSelectionChange?.(selected ? { ...selected } : null);
    onInstallPreview?.({
      defId: installPick?.defId || null,
      symmetry,
      rotation: installRotation,
      targets: installPick ? listValidAttachTargets(design, installPick.defId, { symmetry }) : [],
    });
  }

  function scheduleAutosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      saveDesignLocal(design).catch(() => {});
    }, 400);
  }

  function commit(next, { pushHistory = true, paramFeedback = false } = {}) {
    let d = normalizeCraft(next);
    d = ensureStaging(d);
    normalizeActionGroups(d);
    design = d;
    if (pushHistory) history.push(design);
    else history.replace(design);
    scheduleAutosave();
    lastPreviewFlash = Date.now();
    render();
    onDesignChange?.(cloneCraft(design));
    if (paramFeedback) {
      onParamFeedback?.(selected ? { ...selected } : null);
    }
  }

  function getDesign() {
    return cloneCraft(design);
  }

  function setDesign(d, { pushHistory = true } = {}) {
    commit(asCraft(d), { pushHistory });
  }

  function getSelected() {
    return selected ? { ...selected } : null;
  }

  /**
   * Selection summary — supports craft partId and legacy type descriptors.
   */
  function buildSelectionSummary(d, sel) {
    if (!sel || !sel.type) return { title: '未选择', meta: '在装配树中选择节点', type: null };

    if (sel.partId || sel.primaryId) {
      const craft = asCraft(d);
      const id = sel.primaryId || sel.partId;
      const part = getPart(craft, id);
      if (part) {
        const def = getPartDef(part.defId);
        return {
          title: def?.name || part.defId,
          meta: def?.category || '',
          type: mapCategoryToLegacyType(def?.category),
          partId: part.id,
          index: sel.index ?? 0,
        };
      }
    }

    if (sel.type === 'root') {
      const craft = asCraft(d);
      return {
        title: craft.name || '未命名火箭',
        meta: `${compileFlightProjection(craft).stageCount} 级构型`,
        type: 'root',
      };
    }

    const proj = compileFlightProjection(d);
    if (sel.type === 'stage') {
      const st = proj.stages[sel.index];
      return {
        title: st?.name || st?.role || `级段 ${sel.index + 1}`,
        meta: st ? `高 ${st.height} m · 径 ${st.diameter} m` : '',
        type: 'stage',
        index: sel.index,
      };
    }
    if (sel.type === 'nose') {
      const st = proj.stages[sel.index];
      return {
        title: '整流罩头锥',
        meta: st?.nose?.preset || '已安装',
        type: 'nose',
        index: sel.index,
      };
    }
    if (sel.type === 'engines') {
      const st = proj.stages[sel.index];
      const n = st?.engines?.count ?? 0;
      return {
        title: '推进动力组',
        meta: `${n} 台 · ${st?.engines?.preset || '—'}`,
        type: 'engines',
        index: sel.index,
      };
    }
    if (sel.type === 'wing') return { title: '气动翼面', meta: sel.partId || '', type: 'wing', index: sel.index };
    if (sel.type === 'decor') return { title: '涂装饰件', meta: sel.partId || '', type: 'decor', index: sel.index };
    if (sel.type === 'side') {
      return {
        title: '外挂侧助推器',
        meta: `${proj.sideBoosters?.count || 0} 枚`,
        type: 'side',
      };
    }
    return { title: '节点', meta: sel.type, type: sel.type };
  }

  function mapCategoryToLegacyType(cat) {
    if (cat === 'tank' || cat === 'decoupler') return 'stage';
    if (cat === 'nose') return 'nose';
    if (cat === 'engine') return 'engines';
    if (cat === 'aero') return 'wing';
    if (cat === 'decor') return 'decor';
    if (cat === 'side') return 'side';
    if (cat === 'utility') return 'part';
    return 'root';
  }

  function cancelLinkTool() {
    linkTool = null;
    linkFromId = null;
    document.body.classList.remove('vab-linking');
  }

  function setLinkTool(tool) {
    cancelInstall();
    if (linkTool === tool) {
      cancelLinkTool();
      toast('已退出连接工具', 'ok');
      render();
      return;
    }
    linkTool = tool;
    linkFromId = null;
    document.body.classList.add('vab-linking');
    toast(
      tool === 'fuelLine'
        ? '燃料管：依次点击两个贮箱/发动机/侧助推'
        : '支柱：依次点击两个结构件',
      'ok'
    );
    render();
  }

  /**
   * Tree / selection click while link tool active → build connection.
   */
  function tryLinkPart(partId) {
    if (!linkTool || !partId) return false;
    if (!linkFromId) {
      linkFromId = partId;
      toast('已选起点 — 再点终点', 'ok');
      render();
      return true;
    }
    if (linkFromId === partId) {
      toast('请选择另一个零件', 'err');
      return true;
    }
    const r = addConnection(design, linkTool, linkFromId, partId);
    linkFromId = null;
    if (!r.ok) {
      toast(r.reason || '连接失败', 'err');
      render();
      return true;
    }
    commit(r.craft);
    toast(linkTool === 'fuelLine' ? '已添加燃料管' : '已添加支柱', 'ok');
    // stay in tool for multi-place connections
    return true;
  }

  function buildCompactPerf(perf) {
    return {
      twr: perf.twr,
      massKg: perf.liftoffMassKg,
      thrustN: perf.totalThrustN,
      valid: !perf.warnings?.length && perf.canLiftOff,
      warnings: perf.warnings || [],
    };
  }

  function resetToDefault() {
    applyTemplate(DEFAULT_TEMPLATE_ID, { toastMsg: '已恢复为 Starship 全栈模板' });
  }

  /**
   * One-click template wall → replace craft.
   * @param {string} templateId
   * @param {{ toastMsg?: string }} [opts]
   */
  function applyTemplate(templateId, opts = {}) {
    const meta = getTemplateMeta(templateId) || getTemplateMeta(DEFAULT_TEMPLATE_ID);
    const craft = buildTemplateCraft(templateId);
    selected = { type: 'root', index: 0, partId: null, primaryId: null, mode: 'select' };
    installPick = null;
    installRotation = 0;
    lastSelectionSig = '';
    lastTemplateId = meta?.id || templateId;
    document.body.classList.remove('vab-placing');
    cancelLinkTool();
    commit(craft);
    toast(opts.toastMsg || `已加载模板 · ${meta?.name || templateId}`, 'ok');
    // Empty expert craft → jump to library so they can place root
    if (templateId === 'empty') {
      leftTab = 'library';
      activeCategory = 'tank';
    } else if (noviceMode) {
      leftTab = 'library';
    }
    render();
  }

  function tryLaunchToPad() {
    const report = evaluateFlightCheck(design);
    if (!report.canLaunch) {
      toast(`还不能发射：${report.headline}`, 'err');
      // Focus readiness panel attention
      const gate = rootEl.querySelector('#dmFlightGate');
      gate?.classList.add('flash-attention');
      setTimeout(() => gate?.classList.remove('flash-attention'), 900);
      return false;
    }
    onApplyToPad?.(cloneCraft(design));
    toast(report.level === 'yellow' ? '已上发射台（有提醒项）' : '校验通过 · 已同步至发射台', 'ok');
    return true;
  }

  function cancelInstall() {
    installPick = null;
    installRotation = 0;
    selected = { ...selected, mode: 'select' };
    lastSelectionSig = '';
    document.body.classList.remove('vab-placing');
    emitSelection();
    render();
  }

  function beginInstall(defId) {
    const def = getPartDef(defId);
    if (!def) return;
    const craft = design;
    // Empty craft: place root immediately
    if (!craft.rootId) {
      if (!def.canBeRoot) {
        toast('请先放置贮箱作为根件', 'err');
        return;
      }
      const r = attachPart(craft, { defId });
      if (!r.ok) {
        toast(r.reason || '安装失败', 'err');
        return;
      }
      selected = {
        type: mapCategoryToLegacyType(def.category),
        index: 0,
        partId: r.primaryId,
        primaryId: r.primaryId,
        mode: 'select',
      };
      installPick = null;
      installRotation = 0;
      document.body.classList.remove('vab-placing');
      commit(r.craft);
      toast(`已放置根件 · ${def.name}`, 'ok');
      return;
    }

    const targets = listValidAttachTargets(craft, defId, { symmetry });
    if (!targets.length) {
      toast('没有合法安装点', 'err');
      return;
    }

    installPick = { defId };
    installRotation = 0;
    selected = { ...selected, mode: 'install' };
    lastSelectionSig = '';
    document.body.classList.add('vab-placing');
    emitSelection();
    render();
    toast(
      `拿起：${def.name} · 零件跟随光标 · 靠近挂点变绿磁吸 · 左键放置 · 右键转视角 · Q/E 旋转 · Esc 放下`,
      'ok'
    );
  }

  /**
   * @param {string} parentId
   * @param {string} parentNode
   * @param {{ angle?: number, yFraction?: number, keepHolding?: boolean }} [placement]
   */
  function completeInstall(parentId, parentNode, placement = {}) {
    if (!installPick?.defId) return false;
    const defId = installPick.defId;
    const def = getPartDef(defId);
    const params = {};
    if (def?.category === 'engine') {
      // default cluster counts for known engines
      if (symmetry === 1) {
        params.count = def.id.includes('heavy') ? 33 : def.id.includes('raptor') ? 6 : 1;
        params.layout = def.id.includes('heavy')
          ? 'superheavy'
          : def.id.includes('raptor')
            ? 'starship'
            : 'ring';
      } else {
        params.count = 1;
        params.layout = 'ring';
      }
    }
    if (placement.yFraction != null && Number.isFinite(placement.yFraction)) {
      params.yFraction = Math.min(1, Math.max(0, placement.yFraction));
    }
    const angle =
      placement.angle != null && Number.isFinite(placement.angle)
        ? placement.angle
        : installRotation || 0;
    let useSym = ['aero', 'side', 'decor', 'engine', 'utility'].includes(def?.category)
      ? symmetry
      : 1;
    // Novice: side boosters default to bilateral / 4-fold if already ×3+
    const autoSideSym = noviceMode && def?.category === 'side';
    if (autoSideSym && useSym < 2) useSym = 2;
    const r = attachPart(design, {
      defId,
      parentId,
      parentNode,
      angle,
      symmetry: useSym,
      params,
      allowReplace: true,
      autoSideSym,
    });
    if (!r.ok) {
      toast(r.reason || '安装失败', 'err');
      return false;
    }

    // KSP: keep holding the same part type for multi-place (until Esc / no targets)
    const keepHolding = placement.keepHolding !== false;
    const nextTargets = listValidAttachTargets(r.craft, defId, { symmetry });
    const stillHold = keepHolding && nextTargets.length > 0;

    if (stillHold) {
      installPick = { defId };
      // keep installRotation for consistent multi-place
      selected = {
        type: mapCategoryToLegacyType(def?.category),
        index: 0,
        partId: r.primaryId,
        primaryId: r.primaryId,
        mode: 'install',
      };
      document.body.classList.add('vab-placing');
      commit(r.craft);
      // Motion cue for newly placed mesh (esp. engines / decouplers)
      onPlaceFeedback?.({
        type: selected.type,
        index: 0,
        partId: r.primaryId,
        primaryId: r.primaryId,
        category: def?.category,
        defId,
        multiPlace: true,
      });
      toast(`已放置 · 继续安装 ${def?.name || defId}（Esc 放下）`, 'ok');
    } else {
      installPick = null;
      installRotation = 0;
      document.body.classList.remove('vab-placing');
      selected = {
        type: mapCategoryToLegacyType(def?.category),
        index: 0,
        partId: r.primaryId,
        primaryId: r.primaryId,
        mode: 'select',
      };
      commit(r.craft);
      onPlaceFeedback?.({
        type: selected.type,
        index: 0,
        partId: r.primaryId,
        primaryId: r.primaryId,
        category: def?.category,
        defId,
        multiPlace: false,
      });
      toast(`已安装 · ${def?.name || defId}`, 'ok');
    }
    return true;
  }

  function nudgeInstallRotation(deltaRad) {
    if (!installPick) return installRotation;
    installRotation = (installRotation || 0) + (deltaRad || 0);
    // keep in [-2π, 2π] range without forcing positive
    if (installRotation > Math.PI * 2) installRotation -= Math.PI * 2;
    if (installRotation < -Math.PI * 2) installRotation += Math.PI * 2;
    lastSelectionSig = '';
    emitSelection();
    return installRotation;
  }

  function setInstallRotation(rad) {
    installRotation = rad || 0;
    lastSelectionSig = '';
    emitSelection();
    return installRotation;
  }

  function ensureShell() {
    if (rootEl.dataset.ready === 'vab4') return;
    rootEl.dataset.ready = 'vab4';
    rootEl.innerHTML = `
      <div class="design-studio-shell orbital-lab vab-shell">
        <header class="ds-topbar">
          <div class="ds-brand">
            <div class="ds-brand-mark" aria-hidden="true">
              <span class="ds-mark-core">VAB</span>
            </div>
            <div class="ds-brand-text">
              <div class="ds-brand-header-row">
                <span class="ds-brand-title">载具装配大楼</span>
                <span class="ds-sys-badge"><span class="ds-pulse-dot"></span>VAB ONLINE</span>
              </div>
              <div class="ds-brand-meta">
                <span class="ds-brand-sub" id="dmRocketName">火箭总装</span>
                <span class="ds-brand-arch">// VEHICLE ASSEMBLY · CRAFT TREE</span>
              </div>
            </div>
          </div>
          <div class="ds-top-actions">
            <div class="ds-btn-group">
              <button type="button" class="ds-btn ds-btn-tool" id="dmUndo" title="撤销"><span class="btn-i">↩</span><span class="btn-label">撤销</span></button>
              <button type="button" class="ds-btn ds-btn-tool" id="dmRedo" title="重做"><span class="btn-i">↪</span><span class="btn-label">重做</span></button>
              <button type="button" class="ds-btn ds-btn-tool" id="dmReset" title="恢复初始构型"><span class="btn-i">↺</span><span class="btn-label">重置</span></button>
            </div>
            <span class="ds-sep"></span>
            <div class="ds-btn-group">
              <button type="button" class="ds-btn ds-btn-tool" id="dmExport"><span class="btn-i">↑</span><span class="btn-label">导出</span></button>
              <button type="button" class="ds-btn ds-btn-tool" id="dmImport"><span class="btn-i">↓</span><span class="btn-label">导入</span></button>
            </div>
            <input type="file" id="dmImportFile" accept="application/json,.json" hidden />
            <span class="ds-sep"></span>
            <div class="ds-btn-group vab-view-group" title="实体=完整外观 · 透视壳=半透明全机 · 透视=更透">
              <button type="button" class="ds-btn ds-btn-tool vab-view-btn active" data-view="solid" id="dmViewSolid">实体</button>
              <button type="button" class="ds-btn ds-btn-tool vab-view-btn" data-view="cutaway" id="dmViewCut">透视壳</button>
              <button type="button" class="ds-btn ds-btn-tool vab-view-btn" data-view="xray" id="dmViewXray">X光</button>
            </div>
            <button type="button" class="ds-btn ds-btn-tool vab-com-btn active" id="dmToggleCom" title="质心球 CoM + 推力箭头">◉ CoM</button>
            <span class="ds-sep"></span>
            <label class="vab-novice-toggle" title="新手模式：隐藏燃料管/动作组，自动对齐直径">
              <input type="checkbox" id="dmNovice" ${noviceMode ? 'checked' : ''}/> 新手
            </label>
            <button type="button" class="ds-btn ds-btn-primary cyber-glow" id="dmApply" title="通过「能不能飞」检查后上发射台"><span class="btn-i">✦</span>发射上垫</button>
            <button type="button" class="ds-btn ds-btn-ghost" id="dmExit"><span class="btn-i">◀</span>返回发射场</button>
          </div>
        </header>

        <div class="ds-workspace">
          <aside class="ds-panel ds-left ds-dock" aria-label="部件与装配">
            <div class="ds-dock-header">
              <span class="dock-title"><i class="dock-icon">❖</i> 组件装配中心</span>
              <span class="dock-tag">VAB</span>
            </div>
            <div class="ds-tabs" role="tablist">
              <button type="button" class="ds-tab active" role="tab" id="dmTabTpl" data-tab="templates" aria-selected="true"><span>★</span> 模板</button>
              <button type="button" class="ds-tab" role="tab" id="dmTabLib" data-tab="library" aria-selected="false"><span>▤</span> 零件</button>
              <button type="button" class="ds-tab" role="tab" id="dmTabTree" data-tab="tree" aria-selected="false"><span>☷</span> 装配树</button>
            </div>
            <div class="vab-sym-bar" id="dmSymBar">
              <span class="vab-sym-label">对称</span>
              ${[1, 2, 3, 4, 6, 8].map((n) => `<button type="button" class="vab-sym-btn" data-sym="${n}">×${n}</button>`).join('')}
            </div>
            <div class="vab-tool-bar" id="dmLinkBar">
              <span class="vab-sym-label">连接</span>
              <button type="button" class="vab-tool-btn" data-link="fuelLine" title="燃料管 Fuel Line">⛽ 燃料管</button>
              <button type="button" class="vab-tool-btn" data-link="strut" title="支柱 Strut">⫽ 支柱</button>
              <button type="button" class="vab-tool-btn" id="dmRebuildStaging" title="按结构重建分级">▤ 自动分级</button>
            </div>
            <div class="ds-tab-panels">
              <div class="ds-tab-panel" id="dmPanelTpl" data-panel="templates" role="tabpanel">
                <div class="vab-tpl-intro">一键开始 · 比空白零件库更快上手</div>
                <div id="dmTemplateWall" class="vab-template-wall"></div>
              </div>
              <div class="ds-tab-panel" id="dmPanelLib" data-panel="library" role="tabpanel" hidden>
                <div id="dmEmptyGuide" class="vab-empty-guide" hidden></div>
                <div class="vab-lib-layout">
                  <div class="vab-cat-rail" id="dmCatRail"></div>
                  <div class="vab-lib-main">
                    <div id="dmLibrary" class="dm-library vab-part-grid"></div>
                    <div id="dmPartHover" class="vab-part-hover" hidden></div>
                  </div>
                </div>
                <div id="dmInstallHints" class="vab-install-hints"></div>
              </div>
              <div class="ds-tab-panel" id="dmPanelTree" data-panel="tree" role="tabpanel" hidden>
                <div id="dmTree" class="dm-tree"></div>
                <div class="dm-tree-actions" id="dmTreeActions" hidden>
                  <button type="button" class="ds-btn ds-btn-sm" id="dmDupPart">复制</button>
                  <button type="button" class="ds-btn ds-btn-sm" id="dmDelPart">删除</button>
                  <button type="button" class="ds-btn ds-btn-sm" id="dmCancelInstall">取消安装</button>
                </div>
              </div>
            </div>
          </aside>

          <main class="ds-viewport" aria-hidden="true">
            <div class="vab-wizard-overlay" id="dmWizard" aria-label="装配向导"></div>
            <!-- KSP staging stack: bottom = stage 0 (fires first) -->
            <div class="vab-staging-stack" id="dmStaging" aria-label="分级栈"></div>
          </main>

          <aside class="ds-panel ds-right ds-dock" aria-label="参数与性能">
            <div class="ds-dock-header">
              <span class="dock-title"><i class="dock-icon">◈</i> 零件属性</span>
              <span class="dock-tag">PART</span>
            </div>
            <div class="ds-panel-block" id="dmFlightGate" aria-label="能不能发射">
              <!-- filled by renderFlightGate -->
            </div>
            <div class="ds-panel-block ds-grow">
              <div class="dm-sel-summary" id="dmSelSummary"></div>
              <div id="dmProps" class="dm-props"></div>
            </div>
            <div class="ds-panel-block ds-perf-block">
              <div class="ds-section-head compact">
                <h2><span class="sec-icon">◎</span> 轨道性能仿真</h2>
                <span class="sec-badge">REALTIME</span>
              </div>
              <div id="dmPerf" class="dm-perf"></div>
              <div id="dmWarn" class="dm-warn"></div>
            </div>
          </aside>
        </div>

        <footer class="ds-status-track" id="dmPerfStrip" aria-live="polite"></footer>
      </div>
    `;

    rootEl.querySelector('#dmUndo').addEventListener('click', () => {
      const prev = history.undo();
      if (!prev) return;
      design = prev;
      scheduleAutosave();
      render();
      onDesignChange?.(cloneCraft(design));
    });
    rootEl.querySelector('#dmRedo').addEventListener('click', () => {
      const next = history.redo();
      if (!next) return;
      design = next;
      scheduleAutosave();
      render();
      onDesignChange?.(cloneCraft(design));
    });
    rootEl.querySelector('#dmReset').addEventListener('click', () => resetToDefault());
    rootEl.querySelector('#dmExit').addEventListener('click', () => exit());
    rootEl.querySelector('#dmApply').addEventListener('click', () => tryLaunchToPad());
    rootEl.querySelector('#dmNovice')?.addEventListener('change', (e) => {
      noviceMode = !!e.target.checked;
      if (noviceMode) cancelLinkTool();
      toast(noviceMode ? '新手模式：自动对齐直径 · 隐藏燃料管/动作组' : '专家模式：显示全部工具', 'ok');
      render();
    });
    rootEl.querySelector('#dmToggleCom')?.addEventListener('click', () => {
      showBalanceGizmos = !showBalanceGizmos;
      rootEl.querySelector('#dmToggleCom')?.classList.toggle('active', showBalanceGizmos);
      onBalanceGizmoChange?.(showBalanceGizmos);
      toast(showBalanceGizmos ? '显示质心球 + 推力箭头' : '已隐藏 CoM / 推力指示', 'ok');
      renderFlightGate();
    });
    rootEl.querySelector('#dmExport').addEventListener('click', () => {
      const json = serializeDesign(design);
      const blob = new Blob([json], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${(design.name || 'rocket').replace(/\s+/g, '_')}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast('已导出 JSON', 'ok');
    });
    rootEl.querySelector('#dmImport').addEventListener('click', () => {
      rootEl.querySelector('#dmImportFile').click();
    });
    rootEl.querySelector('#dmImportFile').addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      try {
        const text = await file.text();
        const { design: d, warnings } = deserializeDesign(text);
        commit(d);
        toast(warnings.length ? `已导入（${warnings.length} 条警告）` : '导入成功', 'ok');
      } catch (err) {
        toast(String(err.message || err), 'err');
      }
    });
    rootEl.querySelector('#dmDupPart')?.addEventListener('click', () => dupSelected());
    rootEl.querySelector('#dmDelPart')?.addEventListener('click', () => delSelected());
    rootEl.querySelector('#dmCancelInstall')?.addEventListener('click', () => cancelInstall());

    rootEl.querySelectorAll('.ds-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const t = tab.dataset.tab;
        leftTab = t === 'tree' ? 'tree' : t === 'templates' ? 'templates' : 'library';
        syncLeftTabs();
      });
    });

    rootEl.querySelector('#dmSymBar')?.addEventListener('click', (e) => {
      const btn = e.target.closest?.('[data-sym]');
      if (!btn) return;
      symmetry = parseInt(btn.dataset.sym, 10) || 1;
      render();
      if (installPick) emitSelection();
    });

    rootEl.querySelector('#dmLinkBar')?.addEventListener('click', (e) => {
      const linkBtn = e.target.closest?.('[data-link]');
      if (linkBtn) {
        setLinkTool(linkBtn.dataset.link);
        return;
      }
      if (e.target.closest?.('#dmRebuildStaging')) {
        commit(rebuildStaging(design));
        toast('已按结构重建分级', 'ok');
      }
    });

    rootEl.querySelectorAll('.vab-view-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        viewStyle = btn.dataset.view === 'solid' || btn.dataset.view === 'xray' ? btn.dataset.view : 'cutaway';
        rootEl.querySelectorAll('.vab-view-btn').forEach((b) => {
          b.classList.toggle('active', b.dataset.view === viewStyle);
        });
        onViewStyleChange?.(viewStyle);
        toast(
          viewStyle === 'cutaway'
            ? '透视壳：完整火箭 + 半透明壳体（无半边裁切）'
            : viewStyle === 'xray'
              ? 'X光：整体半透明，看内部布局'
              : '实体：完整不透明外观（KSP 默认）',
          'ok'
        );
      });
    });

    // Keyboard: Esc cancel · Q/E rotate while installing
    rootEl._onKey = (ev) => {
      if (!active) return;
      const tag = (ev.target && /** @type {HTMLElement} */ (ev.target).tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (ev.key === 'Escape' && installPick) {
        cancelInstall();
        toast('已取消安装', 'ok');
        return;
      }
      if (ev.key === 'Escape' && linkTool) {
        cancelLinkTool();
        toast('已退出连接工具', 'ok');
        render();
        return;
      }
      if (installPick && (ev.key === 'q' || ev.key === 'Q')) {
        ev.preventDefault();
        nudgeInstallRotation(-Math.PI / 12);
        renderInstallHints();
      }
      if (installPick && (ev.key === 'e' || ev.key === 'E')) {
        ev.preventDefault();
        nudgeInstallRotation(Math.PI / 12);
        renderInstallHints();
      }
      if (installPick && (ev.key === 'r' || ev.key === 'R') && !ev.ctrlKey && !ev.metaKey) {
        ev.preventDefault();
        setInstallRotation(0);
        renderInstallHints();
        toast('旋转已复位', 'ok');
      }
    };
    rootEl._onPaletteMove = (ev) => {
      if (!active || !paletteDrag) return;
      const dx = ev.clientX - paletteDrag.x;
      const dy = ev.clientY - paletteDrag.y;
      if (!paletteDrag.moved && Math.hypot(dx, dy) > 10) {
        paletteDrag.moved = true;
        if (!installPick || installPick.defId !== paletteDrag.defId) {
          beginInstall(paletteDrag.defId);
        }
      }
    };
    rootEl._onPaletteUp = () => {
      if (paletteDrag?.moved) {
        const hold = paletteDrag;
        setTimeout(() => {
          if (paletteDrag === hold) paletteDrag = null;
        }, 0);
      } else {
        paletteDrag = null;
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', rootEl._onKey);
      window.addEventListener('pointermove', rootEl._onPaletteMove);
      window.addEventListener('pointerup', rootEl._onPaletteUp);
    }
  }

  function syncLeftTabs() {
    const tabs = {
      templates: rootEl.querySelector('#dmTabTpl'),
      library: rootEl.querySelector('#dmTabLib'),
      tree: rootEl.querySelector('#dmTabTree'),
    };
    const panels = {
      templates: rootEl.querySelector('#dmPanelTpl'),
      library: rootEl.querySelector('#dmPanelLib'),
      tree: rootEl.querySelector('#dmPanelTree'),
    };
    for (const key of ['templates', 'library', 'tree']) {
      const on = leftTab === key;
      tabs[key]?.classList.toggle('active', on);
      tabs[key]?.setAttribute('aria-selected', on ? 'true' : 'false');
      if (panels[key]) panels[key].hidden = !on;
    }
    // Novice: hide advanced link bar
    const linkBar = rootEl.querySelector('#dmLinkBar');
    if (linkBar) linkBar.hidden = !!noviceMode;
    const staging = rootEl.querySelector('#dmStaging');
    if (staging) staging.classList.toggle('novice-hide', !!noviceMode);
    const nov = rootEl.querySelector('#dmNovice');
    if (nov) nov.checked = !!noviceMode;
  }

  function renderTemplateWall() {
    const el = rootEl.querySelector('#dmTemplateWall');
    if (!el) return;
    el.innerHTML = CRAFT_TEMPLATES.map((t) => {
      const active = lastTemplateId === t.id ? 'active' : '';
      const expert = t.expert ? 'expert' : '';
      return `<button type="button" class="vab-tpl-card ${active} ${expert}" data-tpl="${t.id}" style="--tpl-accent:${t.accent}">
        <span class="vab-tpl-badge">${escapeHtml(t.badge)}</span>
        <span class="vab-tpl-name">${escapeHtml(t.name)}</span>
        <span class="vab-tpl-blurb">${escapeHtml(t.blurb)}</span>
        ${t.recommended ? '<span class="vab-tpl-rec">默认推荐</span>' : ''}
      </button>`;
    }).join('');
    el.querySelectorAll('.vab-tpl-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.tpl;
        if (id === 'empty' && noviceMode) {
          // Confirm expert blank
          if (!window.confirm?.('空白载具需要自己从贮箱搭起。确定进入专家空箱？')) {
            // If confirm unavailable, still allow
            if (typeof window.confirm === 'function') return;
          }
        }
        applyTemplate(id);
      });
    });
  }

  function renderWizard() {
    const el = rootEl.querySelector('#dmWizard');
    if (!el) return;
    if (wizardCollapsed || !noviceMode) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }
    const report = evaluateFlightCheck(design);
    const steps = report.wizard || [];
    const doneN = steps.filter((s) => s.done).length;
    el.hidden = false;
    el.innerHTML = `
      <div class="vab-wizard-card">
        <div class="vab-wizard-head">
          <strong>装配向导 · ${doneN}/3</strong>
          <button type="button" class="vab-wizard-x" id="dmWizardHide" title="收起">×</button>
        </div>
        <ol class="vab-wizard-steps">
          ${steps
            .map(
              (s) => `<li class="${s.done ? 'done' : s.step === doneN + 1 ? 'current' : ''}">
                <span class="vw-num">${s.done ? '✓' : s.step}</span>
                <span class="vw-body"><b>${escapeHtml(s.label)}</b><small>${escapeHtml(s.hint)}</small></span>
              </li>`
            )
            .join('')}
        </ol>
        <div class="vab-wizard-status level-${report.level}">
          <b>${escapeHtml(report.headline)}</b>
          <span>${escapeHtml(report.summary)}</span>
        </div>
        <div class="vab-wizard-actions">
          <button type="button" class="ds-btn ds-btn-sm" id="dmWizardTpl">换模板</button>
          ${
            report.canLaunch
              ? `<button type="button" class="ds-btn ds-btn-sm ds-btn-primary" id="dmWizardLaunch">发射上垫</button>`
              : `<button type="button" class="ds-btn ds-btn-sm" id="dmWizardLib">去零件库</button>`
          }
        </div>
      </div>`;
    el.querySelector('#dmWizardHide')?.addEventListener('click', () => {
      wizardCollapsed = true;
      renderWizard();
    });
    el.querySelector('#dmWizardTpl')?.addEventListener('click', () => {
      leftTab = 'templates';
      syncLeftTabs();
    });
    el.querySelector('#dmWizardLib')?.addEventListener('click', () => {
      leftTab = 'library';
      syncLeftTabs();
    });
    el.querySelector('#dmWizardLaunch')?.addEventListener('click', () => tryLaunchToPad());
  }

  function renderFlightGate() {
    const el = rootEl.querySelector('#dmFlightGate');
    if (!el) return;
    const report = evaluateFlightCheck(design);
    const levelCls = `level-${report.level}`;
    const checksHtml = report.checks
      .map(
        (c) =>
          `<div class="vab-check-row ${c.level}" title="${escapeHtml(c.detail || '')}">
            <span class="vab-check-dot"></span>
            <span>${escapeHtml(c.label)}</span>
          </div>`
      )
      .join('');
    let balHtml = '';
    try {
      const bal = estimateMassBalance(design);
      const comPct = Math.round((bal.comFraction || 0) * 100);
      balHtml = `<div class="vab-gate-balance">
        <div class="vab-bal-row"><span class="vab-bal-dot com"></span>质心 CoM · 高度 ${bal.comYFromStackBase.toFixed(0)} m（${comPct}%）</div>
        <div class="vab-bal-row"><span class="vab-bal-dot thr ${bal.canLiftOff ? 'ok' : 'bad'}"></span>推力 ↑ · TWR ${bal.twr.toFixed(2)} ${
          bal.canLiftOff ? '可离地' : '推不动'
        }</div>
        <div class="muted vab-bal-hint">${showBalanceGizmos ? '3D：黄球=质心 · 青/红箭头=推力' : '点顶栏 ◉ CoM 显示 3D 指示'}</div>
      </div>`;
    } catch {
      balHtml = '';
    }
    el.innerHTML = `
      <div class="vab-flight-gate ${levelCls}">
        <div class="vab-gate-head">
          <span class="vab-gate-label">能不能发射</span>
          <span class="vab-gate-badge ${levelCls}">${
            report.level === 'green' ? 'GO' : report.level === 'yellow' ? '注意' : 'NO-GO'
          }</span>
        </div>
        <div class="vab-gate-headline">${escapeHtml(report.headline)}</div>
        <div class="vab-gate-summary muted">${escapeHtml(report.summary)}</div>
        ${balHtml}
        <div class="vab-gate-checks">${checksHtml}</div>
        ${
          report.tips?.length
            ? `<div class="vab-gate-tips">${report.tips.map((t) => `<div>· ${escapeHtml(t)}</div>`).join('')}</div>`
            : ''
        }
        <button type="button" class="ds-btn ${report.canLaunch ? 'ds-btn-primary' : 'ds-btn-tool'} vab-gate-launch" id="dmGateLaunch">
          ${report.canLaunch ? '✦ 通过 · 同步发射台' : '✖ 先修好红色项'}
        </button>
      </div>`;
    el.querySelector('#dmGateLaunch')?.addEventListener('click', () => tryLaunchToPad());
  }

  function svgIcon(name, size = 16) {
    const icons = {
      nose: '<path d="M12 2C8.5 6.5 7 11 7 17h10c0-6-1.5-10.5-5-15z"/>',
      stagePreset: '<rect x="6" y="3" width="12" height="18" rx="2"/>',
      engine: '<path d="M7 4h10l-1.5 6h-7L7 4z"/><path d="M9 16l-2 5M12 16v6M15 16l2 5"/>',
      wing: '<path d="M5 4v16"/><path d="M5 7l13 4v4l-13 3V7z"/>',
      decor: '<path d="M12 3l7 4v10l-7 4-7-4V7l7-4z"/>',
      side: '<path d="M4 6c0-2 1.5-3 2-3s2 1 2 3v13H4V6z"/><path d="M16 6c0-2 1.5-3 2-3s2 1 2 3v13h-4V6z"/>',
      rocket: '<path d="M12 2C9 6 8 11 8 15h8c0-4-1-9-4-13z"/>',
    };
    const p = icons[name] || icons.stagePreset;
    return `<svg class="ds-svg-i" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  }

  function renderCategoryRail() {
    const el = rootEl.querySelector('#dmCatRail');
    if (!el) return;
    el.innerHTML = PART_CATEGORIES.map((c) => {
      const thumb = c.icon
        ? `<img class="vab-cat-thumb-img" src="${c.icon}" alt="" draggable="false" />`
        : svgIcon(c.iconKey, 22);
      return `
      <button type="button" class="vab-cat-btn ${activeCategory === c.id ? 'active' : ''}" data-cat="${c.id}" title="${c.title}">
        <span class="vab-cat-thumb">${thumb}</span>
        <span class="vab-cat-name">${c.title}</span>
      </button>`;
    }).join('');
    el.querySelectorAll('.vab-cat-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeCategory = btn.dataset.cat;
        renderLibrary();
        renderCategoryRail();
      });
    });
  }

  function partStatsLine(p) {
    if (p.category === 'engine') {
      return `推力 ${((p.thrustN || 0) / 1e6).toFixed(2)} MN · Isp ${p.ispSec || '—'} s · 干重 ${Math.round(p.dryMassKg || 0)} kg`;
    }
    if (p.category === 'tank') {
      return `结构密度 ${p.structuralDensity} · 贮箱系数 ${p.tankVolumeFactor}`;
    }
    if (p.category === 'nose') {
      return `干重 ${Math.round(p.dryMassKg || 0)} kg · 形状 ${p.shape || '—'}`;
    }
    if (p.category === 'aero') {
      return `干重 ${Math.round(p.dryMassKg || 0)} kg · 展弦 ${p.span || '—'}×${p.chord || '—'}`;
    }
    if (p.category === 'side') {
      return `侧挂助推 · 可对称安装`;
    }
    if (p.category === 'decoupler') {
      return `干重 ${Math.round(p.dryMassKg || 0)} kg · 划分飞行级`;
    }
    return p.blurb || p.name;
  }

  function showPartHover(defId) {
    const card = rootEl.querySelector('#dmPartHover');
    if (!card) return;
    const p = getPartDef(defId);
    if (!p) {
      card.hidden = true;
      return;
    }
    card.hidden = false;
    const hoverIcon = p.icon
      ? `<img class="vab-hover-thumb-img" src="${p.icon}" alt="" draggable="false" />`
      : '';
    card.innerHTML = `
      <div class="vab-hover-thumb">${hoverIcon}</div>
      <div class="vab-hover-body">
        <div class="vab-hover-title">${escapeHtml(p.name)}</div>
        <div class="vab-hover-blurb">${escapeHtml(p.blurb || '')}</div>
        <div class="vab-hover-stats mono">${escapeHtml(partStatsLine(p))}</div>
        <div class="vab-hover-hint">点击拿起 → 零件跟随鼠标 → 磁吸后左键放置</div>
      </div>`;
  }

  function renderEmptyGuide() {
    const el = rootEl.querySelector('#dmEmptyGuide');
    if (!el) return;
    if (design.rootId) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }
    el.hidden = false;
    el.innerHTML = `
      <div class="vab-empty-card">
        <strong>空装配台 · 专家模式</strong>
        <p>建议先回 <b>模板</b> 选一套可飞构型。或从 <b>贮箱级段</b> 放置根件：</p>
        <ol>
          <li>贮箱作根</li>
          <li>底部挂发动机</li>
          <li>顶部挂分离环 / 鼻锥</li>
        </ol>
        <button type="button" class="ds-btn ds-btn-sm ds-btn-primary" id="dmEmptyToTpl">打开模板墙</button>
      </div>`;
    el.querySelector('#dmEmptyToTpl')?.addEventListener('click', () => {
      leftTab = 'templates';
      syncLeftTabs();
    });
  }

  function renderLibrary() {
    renderCategoryRail();
    renderEmptyGuide();
    const el = rootEl.querySelector('#dmLibrary');
    if (!el) return;
    const items = listPartDefs(activeCategory);
    el.innerHTML = items
      .map((p) => {
        const stats =
          p.category === 'engine'
            ? `${((p.thrustN || 0) / 1e6).toFixed(1)}MN`
            : p.dryMassKg
              ? `${Math.round(p.dryMassKg)}kg`
              : p.structuralDensity
                ? `ρ${p.structuralDensity}`
                : '';
        const icon = p.icon
          ? `<img class="vab-part-thumb-img" src="${p.icon}" alt="" loading="lazy" draggable="false" />`
          : '';
        return `<button type="button" class="vab-part-card" data-kind="${p.category}" data-id="${p.id}" title="${escapeHtml(p.blurb || p.name)}">
          <span class="vab-part-thumb">${icon}</span>
          <span class="vab-part-name">${escapeHtml(p.name)}</span>
          <span class="vab-part-stat mono">${stats}</span>
        </button>`;
      })
      .join('');

    el.querySelectorAll('.vab-part-card').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        // Ignore click that ends a drag-to-canvas gesture
        if (paletteDrag?.moved) {
          paletteDrag = null;
          return;
        }
        beginInstall(btn.dataset.id);
      });
      btn.addEventListener('pointerdown', (ev) => {
        if (ev.button !== 0) return;
        paletteDrag = {
          defId: btn.dataset.id,
          x: ev.clientX,
          y: ev.clientY,
          moved: false,
        };
      });
      btn.addEventListener('mouseenter', () => showPartHover(btn.dataset.id));
      btn.addEventListener('focus', () => showPartHover(btn.dataset.id));
    });

    // Sym active state
    rootEl.querySelectorAll('.vab-sym-btn').forEach((b) => {
      b.classList.toggle('active', parseInt(b.dataset.sym, 10) === symmetry);
    });

    renderInstallHints();
  }

  function renderInstallHints() {
    const el = rootEl.querySelector('#dmInstallHints');
    if (!el) return;
    if (!installPick) {
      el.innerHTML = `<p class="muted"><b>KSP 式装配</b>：点选零件 → 零件贴在光标上 → 靠近绿色挂点<strong>磁吸</strong>（变绿）→ <b>左键</b>放置（可连续）· <b>右键拖</b>转视角 · <b>Q/E</b> 旋转 · <b>Esc</b> 放下。</p>`;
      return;
    }
    const def = getPartDef(installPick.defId);
    const targets = listValidAttachTargets(design, installPick.defId, { symmetry });
    const rotDeg = Math.round(((installRotation || 0) * 180) / Math.PI);
    el.innerHTML = `
      <div class="vab-install-active">
        <strong>手持：${escapeHtml(def?.name || installPick.defId)}</strong>
        <span class="mono">对称 ×${symmetry}</span>
        <span class="mono vab-rot-readout" title="Q/E 旋转">旋转 ${rotDeg}°</span>
        <button type="button" class="ds-btn ds-btn-sm" id="dmRotLeft" title="Q">↺</button>
        <button type="button" class="ds-btn ds-btn-sm" id="dmRotRight" title="E">↻</button>
        <button type="button" class="ds-btn ds-btn-sm" id="dmCancelInstall2">放下 Esc</button>
      </div>
      <p class="muted vab-install-tip">青白=未吸附 · 变绿=已磁吸 · 左键落位 · 右键转镜头 · 滚轮缩放 · 可连续放置</p>
      <div class="vab-target-list">
        ${targets
          .slice(0, 12)
          .map((t, i) => {
            const parent = t.parentId ? getPart(design, t.parentId) : null;
            const pname = parent ? getPartDef(parent.defId)?.name : '根放置';
            return `<button type="button" class="vab-target-btn" data-pid="${t.parentId || ''}" data-node="${t.parentNode || ''}">
              ${i + 1}. ${escapeHtml(pname || '—')} · ${t.parentNode || 'root'}
            </button>`;
          })
          .join('')}
      </div>`;
    el.querySelector('#dmCancelInstall2')?.addEventListener('click', () => cancelInstall());
    el.querySelector('#dmRotLeft')?.addEventListener('click', () => {
      nudgeInstallRotation(-Math.PI / 12);
      renderInstallHints();
    });
    el.querySelector('#dmRotRight')?.addEventListener('click', () => {
      nudgeInstallRotation(Math.PI / 12);
      renderInstallHints();
    });
    el.querySelectorAll('.vab-target-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pid = btn.dataset.pid || null;
        const node = btn.dataset.node || null;
        if (!pid) {
          // root already handled
          return;
        }
        completeInstall(pid, node, { angle: installRotation, yFraction: 0.5 });
      });
    });
  }

  function renderTree() {
    const el = rootEl.querySelector('#dmTree');
    if (!el) return;
    const rows = getAssemblyTreeView(design);
    const parts = [];
    parts.push(
      `<button type="button" class="dm-tree-item root-node ${selected.type === 'root' && !selected.partId ? 'active' : ''}" data-type="root">
        <span class="tree-left">
          <span class="tree-icon">${svgIcon('rocket', 15)}</span>
          <span class="tree-title">${escapeHtml(design.name)}</span>
        </span>
        <span class="tree-meta mono">${rows.length}件</span>
      </button>`
    );
    for (const row of rows) {
      const act = selected.partId === row.id || selected.primaryId === row.id ? 'active' : '';
      const depthCls = row.depth === 0 ? '' : row.depth === 1 ? 'd1' : 'd2';
      parts.push(
        `<button type="button" class="dm-tree-item sub ${act}" data-type="part" data-part="${row.id}" data-cat="${row.category}">
          <span class="tree-left">
            <span class="tree-depth ${depthCls}"></span>
            <span class="tree-title">${escapeHtml(row.name)}</span>
          </span>
          <span class="tree-sub-tag">${row.category}</span>
        </button>`
      );
    }
    el.innerHTML = parts.join('');
    el.querySelectorAll('.dm-tree-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.type === 'root') {
          selected = { type: 'root', index: 0, partId: null, primaryId: null, mode: 'select' };
          installPick = null;
          render();
          return;
        }
        const id = btn.dataset.part;
        if (linkTool && id) {
          tryLinkPart(id);
          return;
        }
        const cat = btn.dataset.cat;
        selected = {
          type: mapCategoryToLegacyType(cat),
          index: 0,
          partId: id,
          primaryId: id,
          mode: 'select',
        };
        installPick = null;
        render();
      });
    });

    const actions = rootEl.querySelector('#dmTreeActions');
    if (actions) {
      actions.hidden = false;
      const del = actions.querySelector('#dmDelPart');
      if (del) del.disabled = !selected.partId;
    }
  }

  function field(label, inputHtml) {
    return `<label class="dm-field"><span class="dm-field-label">${label}</span>${inputHtml}</label>`;
  }

  function renderProps() {
    const el = rootEl.querySelector('#dmProps');
    const sumEl = rootEl.querySelector('#dmSelSummary');
    if (!el) return;

    const summary = buildSelectionSummary(design, selected);
    if (sumEl) {
      sumEl.innerHTML = `
        <div class="dm-sel-title">${escapeHtml(summary.title)}</div>
        <div class="dm-sel-meta mono">${escapeHtml(summary.meta || '')}</div>
      `;
    }

    if (selected.type === 'root' && !selected.partId) {
      el.innerHTML =
        field('名称', `<input type="text" data-bind="name" value="${escapeAttr(design.name)}" />`) +
        field(
          '级数（快捷）',
          `<select data-bind="stageCount">
            <option value="1" ${compileFlightProjection(design).stageCount === 1 ? 'selected' : ''}>单级</option>
            <option value="2" ${compileFlightProjection(design).stageCount === 2 ? 'selected' : ''}>两级</option>
          </select>`
        );
      bindPropInputs(el);
      return;
    }

    const part = selected.partId ? getPart(design, selected.partId) : null;
    if (!part) {
      el.innerHTML = '<p class="muted">选择装配树中的零件，或从零件库进入安装模式</p>';
      return;
    }
    const def = getPartDef(part.defId);
    let html = `<p class="muted mono">${escapeHtml(part.defId)}</p>`;
    const schema = def?.paramSchema || {};
    // Novice: hide diameter (auto-aligned on stack), layout select, yFraction fine-tune for some
    const hideKeys = noviceMode
      ? new Set(['diameter', ...(def?.category === 'engine' ? ['layout'] : [])])
      : new Set();
    for (const [key, meta] of Object.entries(schema)) {
      if (hideKeys.has(key)) continue;
      const val = part.params?.[key];
      if (meta.type === 'select') {
        html += field(
          meta.label || key,
          `<select data-bind="param.${key}">${(meta.options || [])
            .map((o) => `<option value="${o}" ${val === o ? 'selected' : ''}>${o}</option>`)
            .join('')}</select>`
        );
      } else if (meta.max <= 1 && meta.min >= 0 && (meta.step || 0) <= 0.05) {
        html += field(
          meta.label || key,
          `<input type="range" min="${meta.min}" max="${meta.max}" step="${meta.step || 0.01}" data-bind="param.${key}" value="${val ?? 0}" />`
        );
      } else {
        html += field(
          meta.label || key,
          `<input type="number" class="mono" min="${meta.min}" max="${meta.max}" step="${meta.step || 1}" data-bind="param.${key}" value="${val ?? ''}" />`
        );
      }
    }
    if (noviceMode && part.params?.diameter != null) {
      html += `<p class="muted vab-novice-hint">直径已自动对齐父级（${Number(part.params.diameter).toFixed(1)} m）· 专家模式可改</p>`;
    }
    if (part.params?.material && !noviceMode) {
      html += field(
        '材质',
        `<select data-bind="param.material.type">${Object.keys(MATERIAL_PRESETS)
          .map(
            (k) =>
              `<option value="${k}" ${part.params.material?.type === k ? 'selected' : ''}>${k}</option>`
          )
          .join('')}</select>`
      );
      html += field(
        '颜色',
        `<input type="color" data-bind="param.material.color" value="${toColorInput(part.params.material?.color)}" />`
      );
    } else if (part.params?.material && noviceMode) {
      html += field(
        '颜色',
        `<input type="color" data-bind="param.material.color" value="${toColorInput(part.params.material?.color)}" />`
      );
    }

    // Resources readout
    const resAmt = partResourceAmount(part, def);
    const resKeys = Object.keys(resAmt).filter((k) => resAmt[k] > 0.5);
    if (resKeys.length) {
      html += `<div class="vab-res-part"><div class="vab-res-title">资源储量</div>`;
      for (const k of resKeys) {
        const rd = RESOURCE_DEFS[k];
        html += `<div class="vab-res-row"><span style="color:${rd?.color || '#ccc'}">${rd?.short || k}</span><b class="mono">${Math.round(resAmt[k])}</b></div>`;
      }
      html += `</div>`;
    }

    // Crossfeed / action groups — expert only
    if (!noviceMode && ['tank', 'side', 'decoupler'].includes(def?.category)) {
      const cf = !!part.params?.crossfeed;
      html += field(
        '交叉供油 Crossfeed',
        `<label class="vab-check"><input type="checkbox" data-action="crossfeed" ${cf ? 'checked' : ''}/> 允许跨级/侧向供油</label>`
      );
    }

    if (noviceMode) {
      html += `<p class="muted vab-novice-hint">关闭顶栏「新手」可编辑动作组、燃料管与交叉供油</p>`;
      el.innerHTML = html;
      bindPropInputs(el);
      return;
    }

    // Action groups
    const ags = partActionGroups(design, part.id);
    html += `<div class="vab-ag-block"><div class="vab-res-title">动作组 Action Groups</div><div class="vab-ag-grid">`;
    for (const k of ACTION_GROUP_KEYS) {
      const on = ags.includes(k.id);
      html += `<button type="button" class="vab-ag-btn ${on ? 'active' : ''}" data-ag="${k.id}" title="${escapeHtml(k.name)}">${k.id === 'custom1' ? 'AG1' : k.id === 'custom2' ? 'AG2' : k.id === 'custom3' ? 'AG3' : k.id === 'custom4' ? 'AG4' : k.id === 'custom5' ? 'AG5' : k.id.slice(0, 3).toUpperCase()}</button>`;
    }
    html += `</div></div>`;

    // Connections involving this part
    const conns = listConnections(design).filter((c) => c.a === part.id || c.b === part.id);
    if (conns.length) {
      html += `<div class="vab-conn-list"><div class="vab-res-title">连接 (${conns.length})</div>`;
      for (const c of conns) {
        const other = c.a === part.id ? c.b : c.a;
        const od = getPartDef(getPart(design, other)?.defId);
        html += `<div class="vab-conn-row"><span>${c.type === 'fuelLine' ? '⛽' : '⫽'} ${escapeHtml(od?.name || other)}</span><button type="button" class="ds-btn ds-btn-sm" data-rm-conn="${c.id}">删</button></div>`;
      }
      html += `</div>`;
    }

    html += `<button type="button" class="dm-danger" data-action="detach">移除零件（含子件）</button>`;
    el.innerHTML = html;
    bindPropInputs(el);
    el.querySelector('[data-action="detach"]')?.addEventListener('click', () => {
      if (!selected.partId) return;
      const next = detachPart(design, selected.partId);
      selected = { type: 'root', index: 0, partId: null, primaryId: null, mode: 'select' };
      commit(next);
      toast('已移除零件', 'ok');
    });
    el.querySelector('[data-action="crossfeed"]')?.addEventListener('change', (ev) => {
      commit(setPartCrossfeed(design, selected.partId, ev.target.checked));
      toast(ev.target.checked ? '已开启交叉供油' : '已关闭交叉供油', 'ok');
    });
    el.querySelectorAll('[data-ag]').forEach((btn) => {
      btn.addEventListener('click', () => {
        commit(toggleActionGroup(design, btn.dataset.ag, selected.partId, 'toggle'));
      });
    });
    el.querySelectorAll('[data-rm-conn]').forEach((btn) => {
      btn.addEventListener('click', () => {
        commit(removeConnection(design, btn.dataset.rmConn));
        toast('已删除连接', 'ok');
      });
    });
  }

  function bindPropInputs(el) {
    el.querySelectorAll('[data-bind]').forEach((input) => {
      const apply = () => {
        const path = input.dataset.bind;
        let val =
          input.type === 'number' || input.type === 'range'
            ? parseFloat(input.value)
            : input.value;
        if (path === 'name') {
          commit(setCraftName(design, val));
          return;
        }
        if (path === 'stageCount') {
          commit(setStageCount(design, parseInt(val, 10)));
          return;
        }
        if (path.startsWith('param.') && selected.partId) {
          const key = path.slice(6);
          if (key === 'material.type') {
            commit(
              setPartParams(design, selected.partId, {
                material: {
                  ...(getPart(design, selected.partId).params.material || defaultMaterial()),
                  type: val,
                },
              }),
              { paramFeedback: true }
            );
          } else if (key === 'material.color') {
            commit(
              setPartParams(design, selected.partId, {
                material: {
                  ...(getPart(design, selected.partId).params.material || defaultMaterial()),
                  color: val,
                },
              }),
              { paramFeedback: true }
            );
          } else {
            const numKeys = ['height', 'diameter', 'fuelFill', 'count', 'size', 'yFraction', 'engineCount'];
            if (numKeys.includes(key)) val = parseFloat(val);
            if (key === 'count' || key === 'engineCount') val = parseInt(val, 10);
            commit(setPartParams(design, selected.partId, { [key]: val }), {
              pushHistory: input.type !== 'range',
              paramFeedback: true,
            });
          }
        }
      };
      input.addEventListener('change', apply);
      if (input.type === 'range' || input.type === 'number' || input.type === 'text') {
        input.addEventListener('input', () => {
          if (input.type === 'range') apply();
        });
      }
    });
  }

  function renderPerf() {
    const perf = calculateRocketPerformance(design);
    const compact = buildCompactPerf(perf);
    const el = rootEl.querySelector('#dmPerf');
    const warn = rootEl.querySelector('#dmWarn');
    const strip = rootEl.querySelector('#dmPerfStrip');
    const nameEl = rootEl.querySelector('#dmRocketName');
    if (nameEl) nameEl.textContent = design.name || '未命名火箭';

    if (el) {
      const twrClass = perf.twr < 1 ? 'bad' : 'ok';
      const validLabel = compact.valid ? '通过 FLIGHT OK' : '警告 WARNING';
      const validClass = compact.valid ? 'ok' : 'bad';
      const twrPct = Math.min(100, Math.max(5, (perf.twr / 3) * 100));
      el.innerHTML = `
        <div class="dm-perf-grid">
          <div class="perf-card ${twrClass}">
            <div class="perf-card-head"><span class="perf-k">推重比 TWR</span></div>
            <b class="perf-v mono ${twrClass}">${perf.twr.toFixed(2)}</b>
            <div class="perf-bar-wrap"><i class="perf-bar ${twrClass}" style="width:${twrPct}%"></i></div>
          </div>
          <div class="perf-card">
            <div class="perf-card-head"><span class="perf-k">起飞质量</span></div>
            <b class="perf-v mono">${fmtMass(perf.liftoffMassKg)}</b>
          </div>
          <div class="perf-card">
            <div class="perf-card-head"><span class="perf-k">推力</span></div>
            <b class="perf-v mono">${fmtThrust(perf.totalThrustN)}</b>
          </div>
          <div class="perf-card ${validClass}">
            <div class="perf-card-head"><span class="perf-k">校验</span></div>
            <b class="perf-v mono ${validClass}">${validLabel}</b>
          </div>
        </div>
        <details class="dm-perf-detail" ${perfDetailOpen ? 'open' : ''}>
          <summary>详细规格</summary>
          <ul class="dm-perf-list dm-perf-more">
            <li><span class="perf-k">总高</span><b class="perf-v mono">${perf.totalHeightM.toFixed(1)} m</b></li>
            <li><span class="perf-k">ΔV</span><b class="perf-v mono">${(perf.deltaV / 1000).toFixed(2)} km/s</b></li>
            <li><span class="perf-k">推进剂</span><b class="perf-v mono">${fmtMass(perf.fuelMassKg)}</b></li>
            <li><span class="perf-k">支柱刚度</span><b class="perf-v mono">${perf.strutIntegrity ?? 0}</b></li>
            <li><span class="perf-k">燃料管</span><b class="perf-v mono">${perf.resources?.fuelLines ?? 0}</b></li>
          </ul>
        </details>
        <div class="vab-res-summary" id="dmResSummary"></div>`;
      el.querySelector('.dm-perf-detail')?.addEventListener('toggle', (e) => {
        perfDetailOpen = e.target.open;
      });
      // Resource bars
      const resBox = el.querySelector('#dmResSummary');
      if (resBox && perf.resources?.totals) {
        const t = perf.resources.totals;
        resBox.innerHTML = `<div class="vab-res-title">载具资源</div>` +
          ['LF', 'OX', 'EC', 'MP']
            .map((k) => {
              const rd = RESOURCE_DEFS[k];
              const v = t[k] || 0;
              if (v < 0.5 && k === 'MP') return '';
              const pct = Math.min(100, (v / (k === 'EC' ? 8000 : 5e5)) * 100);
              return `<div class="vab-res-bar-row"><span style="color:${rd.color}">${rd.short}</span><div class="vab-res-bar-track"><i style="width:${Math.max(2, pct)}%;background:${rd.color}"></i></div><b class="mono">${fmtRes(v)}</b></div>`;
            })
            .join('');
      }
    }

    if (strip) {
      const gate = evaluateFlightCheck(design);
      const outOfBounds = gate.level === 'red' || perf.warnings.length > 0 || perf.twr < 1;
      strip.classList.toggle('attention', outOfBounds);
      const partN = Object.keys(design.parts || {}).length;
      const proj = compileFlightProjection(design);
      const engN = proj.stages.reduce((s, st) => s + (st.engines?.count || 0), 0);
      const flash = Date.now() - lastPreviewFlash < 1600;
      const viewLabel =
        viewStyle === 'xray' ? 'X光' : viewStyle === 'solid' ? '实体' : '透视壳';
      const gateIcon = gate.level === 'green' ? '●' : gate.level === 'yellow' ? '▲' : '✖';
      if (installPick) {
        const def = getPartDef(installPick.defId);
        strip.innerHTML = `<span class="ds-status-msg quiet">安装模式：<b>${escapeHtml(def?.name || '')}</b> · 磁吸后左键放置 · Esc 放下 · ${viewLabel}</span>`;
      } else if (gate.level === 'red') {
        strip.innerHTML = `<span class="ds-status-msg risk mono">${gateIcon} ${escapeHtml(gate.headline)} — ${escapeHtml(gate.summary)}</span>`;
      } else if (flash) {
        strip.innerHTML = `<span class="ds-status-msg quiet vab-preview-live"><b>3D 已更新</b> · ${gateIcon} ${escapeHtml(gate.headline)} · ${partN} 件 · 发动机 ×${engN}</span>`;
      } else {
        strip.innerHTML = `<span class="ds-status-msg quiet">${gateIcon} <b class="gate-${gate.level}">${escapeHtml(gate.headline)}</b> · ${partN} 件 · 发动机 ×${engN} · ${noviceMode ? '新手' : '专家'} · ${viewLabel}</span>`;
      }
    }

    if (warn) {
      warn.innerHTML = perf.warnings.length
        ? perf.warnings.map((w) => `<div class="dm-warn-item">⚠ ${escapeHtml(w)}</div>`).join('')
        : '<div class="dm-warn-ok">校验通过</div>';
    }
    const undoBtn = rootEl.querySelector('#dmUndo');
    const redoBtn = rootEl.querySelector('#dmRedo');
    if (undoBtn) undoBtn.disabled = !history.canUndo();
    if (redoBtn) redoBtn.disabled = !history.canRedo();
  }

  function renderStaging() {
    const el = rootEl.querySelector('#dmStaging');
    if (!el) return;
    const craft = ensureStaging(design);
    // Don't commit here — only display; auto staging applied on commit
    const groups = craft.staging?.groups || design.staging?.groups || [];
    // Display bottom-first: CSS column-reverse OR reverse in render
    // KSP: bottom of stack is stage 0. We'll list with stage 0 at bottom via flex-direction: column-reverse
    const auto = design.staging?.auto !== false;
    el.innerHTML = `
      <div class="vab-staging-head">
        <span>分级 STAGE</span>
        <button type="button" class="ds-btn ds-btn-sm" id="dmAddStage" title="新增空分级">+</button>
      </div>
      <div class="vab-staging-list ${auto ? 'auto' : 'manual'}">
        ${groups
          .map((g, idx) => {
            const icons = (g.icons || [])
              .map(
                (ic) =>
                  `<span class="vab-stage-icon" title="${escapeHtml(ic.label || ic.kind)}">${iconGlyph(ic.kind)}</span>`
              )
              .join('');
            return `<div class="vab-stage-group" data-stg="${g.id}">
              <div class="vab-stage-num mono">${idx}</div>
              <div class="vab-stage-icons">${icons || '<span class="muted">空</span>'}</div>
              <div class="vab-stage-ops">
                <button type="button" data-stg-move="-1" title="更早点火">▲</button>
                <button type="button" data-stg-move="1" title="更晚点火">▼</button>
                <button type="button" data-stg-del title="删除分级">×</button>
              </div>
            </div>`;
          })
          .join('')}
      </div>
      <div class="vab-staging-foot mono">${auto ? 'AUTO' : 'MANUAL'} · 0 先点火</div>`;

    el.querySelector('#dmAddStage')?.addEventListener('click', () => {
      commit(addEmptyStage(design));
    });
    el.querySelectorAll('.vab-stage-group').forEach((row) => {
      const id = row.dataset.stg;
      row.querySelector('[data-stg-move="-1"]')?.addEventListener('click', () => {
        commit(moveStageGroup(design, id, -1));
      });
      row.querySelector('[data-stg-move="1"]')?.addEventListener('click', () => {
        commit(moveStageGroup(design, id, 1));
      });
      row.querySelector('[data-stg-del]')?.addEventListener('click', () => {
        commit(removeStageGroup(design, id));
      });
    });
  }

  function renderLinkBar() {
    rootEl.querySelectorAll('.vab-tool-btn[data-link]').forEach((b) => {
      b.classList.toggle('active', b.dataset.link === linkTool);
    });
  }

  function render() {
    ensureShell();
    syncLeftTabs();
    renderTemplateWall();
    renderLibrary();
    renderTree();
    renderFlightGate();
    renderWizard();
    renderProps();
    renderPerf();
    renderStaging();
    renderLinkBar();
    emitSelection();
  }

  function dupSelected() {
    if (!selected.partId) {
      toast('请选择可复制的零件', 'err');
      return;
    }
    const part = getPart(design, selected.partId);
    if (!part?.parentId) {
      toast('根件不可复制', 'err');
      return;
    }
    const r = attachPart(design, {
      defId: part.defId,
      parentId: part.parentId,
      parentNode: part.parentNode,
      angle: (part.angle || 0) + 0.3,
      symmetry: 1,
      params: { ...part.params },
    });
    if (!r.ok) {
      toast(r.reason || '复制失败', 'err');
      return;
    }
    selected = {
      type: selected.type,
      index: 0,
      partId: r.primaryId,
      primaryId: r.primaryId,
      mode: 'select',
    };
    commit(r.craft);
  }

  function delSelected() {
    if (!selected.partId) {
      toast('无法删除', 'err');
      return;
    }
    const next = detachPart(design, selected.partId);
    selected = { type: 'root', index: 0, partId: null, primaryId: null, mode: 'select' };
    commit(next);
  }

  /**
   * Called from studio when user clicks an attach snap.
   * @param {string} parentId
   * @param {string} parentNode
   * @param {{ angle?: number, yFraction?: number }} [placement]
   */
  function tryAttachAt(parentId, parentNode, placement = {}) {
    if (!installPick?.defId) return false;
    return !!completeInstall(parentId, parentNode, {
      keepHolding: true,
      ...placement,
    });
  }

  async function enter(initialDesign) {
    ensureShell();
    active = true;
    rootEl.hidden = false;
    rootEl.classList.add('open');
    document.body.classList.add('design-mode');

    let d = null;
    try {
      const saved = await loadDesignLocal();
      if (saved) d = saved;
    } catch {
      /* ignore */
    }
    if (!d && initialDesign) d = cloneCraft(asCraft(initialDesign));
    if (!d) d = createDefaultStarshipCraft();
    design = normalizeCraft(asCraft(d));
    history.init(design);
    selected = { type: 'root', index: 0, partId: null, primaryId: null, mode: 'select' };
    installPick = null;
    installRotation = 0;
    paletteDrag = null;
    lastSelectionSig = '';
    leftTab = 'library';
    document.body.classList.remove('vab-placing');
    render();
    onDesignChange?.(cloneCraft(design));
  }

  function exit() {
    active = false;
    installPick = null;
    installRotation = 0;
    paletteDrag = null;
    rootEl.classList.remove('open');
    rootEl.hidden = true;
    document.body.classList.remove('design-mode');
    document.body.classList.remove('vab-placing');
    clearTimeout(autosaveTimer);
    saveDesignLocal(design).catch(() => {});
    lastSelectionSig = '';
    onSelectionChange?.(null);
    onInstallPreview?.({ defId: null, targets: [], symmetry: 1, rotation: 0 });
    onExit?.();
  }

  function isActive() {
    return active;
  }

  return {
    enter,
    exit,
    isActive,
    getDesign,
    setDesign,
    getSelected,
    buildSelectionSummary,
    buildCompactPerf,
    resetToDefault,
    applyTemplate,
    tryLaunchToPad,
    evaluateFlightCheck: () => evaluateFlightCheck(design),
    getNoviceMode: () => noviceMode,
    setNoviceMode: (v) => {
      noviceMode = !!v;
      render();
    },
    getShowBalanceGizmos: () => showBalanceGizmos,
    setShowBalanceGizmos: (v) => {
      showBalanceGizmos = !!v;
      onBalanceGizmoChange?.(showBalanceGizmos);
      render();
    },
    render,
    history,
    tryAttachAt,
    beginInstall,
    cancelInstall,
    nudgeInstallRotation,
    setInstallRotation,
    getInstallState: () => ({
      defId: installPick?.defId || null,
      symmetry,
      rotation: installRotation,
      targets: installPick ? listValidAttachTargets(design, installPick.defId, { symmetry }) : [],
    }),
    getViewStyle: () => viewStyle,
  };
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, '&#39;');
}

function toColorInput(c) {
  if (!c) return '#d8dde5';
  const s = String(c);
  if (s.startsWith('#') && s.length >= 7) return s.slice(0, 7);
  return '#d8dde5';
}

function fmtMass(kg) {
  if (kg >= 1e6) return `${(kg / 1e6).toFixed(2)} kt`;
  if (kg >= 1e3) return `${(kg / 1e3).toFixed(1)} t`;
  return `${Math.round(kg)} kg`;
}

function fmtThrust(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MN`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} kN`;
  return `${Math.round(n)} N`;
}

function fmtRes(v) {
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
  return `${Math.round(v)}`;
}
