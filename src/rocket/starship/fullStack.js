import * as THREE from 'three';
import { createShip } from './ship.js';
import { createSuperHeavy } from './superHeavy.js';
import { OLM_DECK_HEIGHT } from '../scene/environment.js';

/**
 * Assembles Starship + Super Heavy full stack on OLM deck.
 * Engine plane sits just above the OLM table (~OLM_DECK_HEIGHT).
 */
export function createFullStack(mats) {
  const root = new THREE.Group();
  root.name = 'FullStack';

  const booster = createSuperHeavy(mats);
  const ship = createShip(mats);

  // Engines hang slightly below deck into OLM throat; body on mount
  const engineClearance = OLM_DECK_HEIGHT + 1.5;
  booster.position.y = engineClearance;
  ship.position.y = engineClearance + booster.userData.height - 0.3;

  root.add(booster);
  root.add(ship);

  const totalHeight =
    engineClearance + booster.userData.height + ship.userData.height - 0.3;

  root.userData = {
    booster,
    ship,
    sideBoosters: [],
    stageCount: 2,
    hasInterstageSeparation: true,
    hasSideBoosterSeparation: false,
    underpowered: false,
    canLiftOff: true,
    isRocketAssembly: false,
    totalHeight,
    engineClearance,
    rest: {
      boosterY: engineClearance,
      shipY: engineClearance + booster.userData.height - 0.3,
    },
    mode: 'stack',
    setViewMode(mode) {
      root.userData.mode = mode;
      root.position.set(0, 0, 0);
      root.rotation.set(0, 0, 0);
      booster.rotation.set(0, 0, 0);
      ship.rotation.set(0, 0, 0);
      if (mode === 'stack') {
        booster.visible = true;
        ship.visible = true;
        booster.position.set(0, engineClearance, 0);
        ship.position.set(0, engineClearance + booster.userData.height - 0.3, 0);
      } else if (mode === 'ship') {
        booster.visible = false;
        ship.visible = true;
        ship.position.set(0, engineClearance, 0);
      } else if (mode === 'booster') {
        booster.visible = true;
        ship.visible = false;
        booster.position.set(0, engineClearance, 0);
      }
    },
    resetPose() {
      root.userData.setViewMode(root.userData.mode || 'stack');
    },
    setTilesVisible(v) {
      ship.userData.setTilesVisible(v);
    },
    setEngineGlow(v) {
      ship.userData.setEngineGlow(v);
      booster.userData.setEngineGlow(v);
    },
    getFocusHeight() {
      const mode = root.userData.mode;
      if (mode === 'ship') return engineClearance + ship.userData.height * 0.5;
      if (mode === 'booster') return engineClearance + booster.userData.height * 0.5;
      return engineClearance + totalHeight * 0.35;
    },
    /** Mid-stack world-ish height for camera (local, before root motion) */
    getStackMidHeight() {
      return engineClearance + booster.userData.height * 0.55;
    },
  };

  root.userData.setViewMode('stack');
  return root;
}
