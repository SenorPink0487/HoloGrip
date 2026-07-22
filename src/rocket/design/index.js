/**
 * Public design-domain API.
 */

export {
  DESIGN_VERSION,
  MATERIAL_PRESETS,
  NOSE_PRESETS,
  STAGE_PRESETS,
  ENGINE_PRESETS,
  WING_PRESETS,
  DECOR_PRESETS,
  SIDE_BOOSTER_PRESETS,
} from './partsLibrary.js';

export {
  PART_DEFS,
  PART_CATEGORIES,
  getPartDef,
  listPartDefs,
  tankDefFromStagePreset,
  noseDefFromPreset,
  engineDefFromPreset,
} from './partDefs.js';

export {
  createDefaultStarshipDesign,
  createDefaultStarshipCraft,
  createEmptyCraft,
  cloneDesign,
  normalizeDesign,
  swapStages,
  setStageCount,
  isDefaultStarshipVisual,
  toStageDesign,
  asCraft,
  setStageEngineCount,
  setStageTankParams,
  setSideBoosterCount,
  compileFlightProjection,
  asStageDesign,
} from './designModel.js';

export {
  attachPart,
  detachPart,
  canAttach,
  setPartParams,
  setCraftName,
  listValidAttachTargets,
  getAssemblyTreeView,
  getPart,
  listChildren,
  migrateV1StagesToCraft,
  isCraftDocument,
} from './craftGraph.js';

export { calculateRocketPerformance } from './performance.js';
export {
  serializeDesign,
  deserializeDesign,
  validateTextureFile,
  createEmptyDesignFallback,
} from './serialize.js';
export { saveDesignLocal, loadDesignLocal, clearDesignLocal } from './storage.js';
export { resolveBootDesign } from './bootstrap.js';
export {
  createDesignStudio,
  createPartSelectionController,
  computeRocketFrameDistance,
  resolveSelectionTargets,
  applyOutlineHighlight,
  clearOutlineHighlight,
  createHighlightStore,
  prefersReducedMotion,
  DEFAULT_ROCKET_VIEWPORT_FILL,
  ENTER_REVEAL_MS,
} from './designStudio.js';
export {
  createRocketFromDesign,
  disposeObject3D,
  sideBoosterAngles,
  computeEnginePositions,
} from './generator.js';
export { createDesignHistory } from './history.js';
export {
  processTextureUpload,
  applyUvToTexture,
  fitMaxEdge,
  cropRectFromNormalized,
  MAX_TEXTURE_EDGE,
} from './texturePipeline.js';
export { createDesignModeController } from './designMode.js';
export {
  computeSymmetryAngles,
  resolveSnapFromRay,
  isSnapCommitable,
  buildSnapCandidates,
  nodeWorldPosition,
  getHostCylinder,
} from './attachSnap.js';
export {
  PART_MATERIAL_LANG,
  createPartMaterial,
  createPartMaterialKit,
  createGhostMaterials,
  createSnapNodeMaterials,
} from './partMaterials.js';
export {
  RESOURCE_DEFS,
  summarizeCraftResources,
  buildFuelGraph,
  partResourceAmount,
  strutIntegrity,
} from './resources.js';
export {
  addConnection,
  removeConnection,
  listConnections,
  setPartCrossfeed,
} from './connections.js';
export {
  buildDefaultStaging,
  ensureStaging,
  rebuildStaging,
  moveStageGroup,
  ACTION_GROUP_KEYS,
  toggleActionGroup,
  partActionGroups,
  iconGlyph,
} from './staging.js';
export {
  CRAFT_TEMPLATES,
  buildTemplateCraft,
  DEFAULT_TEMPLATE_ID,
  getTemplateMeta,
} from './templates.js';
export { evaluateFlightCheck, flightCheckStripHtml } from './flightCheck.js';
export { alignStackParams } from './craftGraph.js';
export {
  estimateMassBalance,
  createBalanceGizmoGroup,
} from './massBalance.js';
