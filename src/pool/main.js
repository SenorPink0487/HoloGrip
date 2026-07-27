import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  BALL_R,
  BALL_Y,
  TABLE_LENGTH,
  TABLE_WIDTH,
  pocketCaptureRadius,
  PHYSICS,
} from './constants.js';
import { createTable, getPocketPositions } from './table.js';
import { createBallMaterial, createBalls, resetBalls, respotCueBall } from './balls.js';
import { CueController, getAimDirection } from './cue.js';
import { clampAimDepth, getAimBodyOffset, PoolPlayer } from './player.js';
import { PoolAudio } from './audio.js';
import { createPoolHall } from './environment.js';
import { CAMERA_HOME, CAMERA_LIMITS, ROOM } from './scene-config.js';
import { PoolPhysics, segmentIntersectsCircle, segmentIntersectsSphere } from './physics.js';
import { isInsideBlock, resolveFloorMovement } from './navigation.js';
import { PhysicsProbe } from './probe/probe.js';
import { ShotPredictor, cueVelocityFromAim } from './predict/shot-predictor.js';
import { PredictView } from './predict/predict-view.js';
import { TeachLab } from './predict/teach-lab.js';
import { buildFormulaBoard, buildLandingRows } from './predict/formula-board.js';
import { createMultiplayer } from './net/multiplayer.js';
import { ballGroup, createMatchState, resolveShot } from './net/eight-ball-rules.js';
import { normalizeJoystickInput, touchActionMode } from './touch-controls.js';

// ---------- DOM ----------
const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');
const statusModeEl = document.getElementById('status-mode');
const statusDetailEl = document.getElementById('status-detail');
const powerFill = document.getElementById('power-fill');
const powerValue = document.getElementById('power-value');
const powerWrap = document.getElementById('play-power-wrap');
const powerTip = document.getElementById('power-tip');
const powerParticleCanvas = document.getElementById('power-particles');
const toastEl = document.getElementById('toast');
const helpToggle = document.getElementById('help-toggle');
const helpPanel = document.getElementById('help-panel');
const helpClose = document.getElementById('help-close');
const actionRail = document.getElementById('action-rail');
const onlineToggle = document.getElementById('online-toggle');
const onlinePanel = document.getElementById('online-panel');
const onlineClose = document.getElementById('online-close');
const onlineStatus = document.getElementById('online-status');
const onlineLobby = document.getElementById('online-lobby');
const onlineSession = document.getElementById('online-session');
const onlineCreate = document.getElementById('online-create');
const onlineJoin = document.getElementById('online-join');
const onlineCodeInput = document.getElementById('online-code-input');
const onlineRoomCode = document.getElementById('online-room-code');
const onlineCopy = document.getElementById('online-copy');
const onlineTurn = document.getElementById('online-turn');
const onlineLeave = document.getElementById('online-leave');
const onlineMatch = document.getElementById('online-match');
const onlineRematch = document.getElementById('online-rematch');
const matchHud = document.getElementById('match-hud');
const matchHudTitle = document.getElementById('match-hud-title');
const matchHudGame = document.getElementById('match-hud-game');
const matchScoreYouGroup = document.getElementById('match-score-you-group');
const matchScoreOpponentGroup = document.getElementById('match-score-opponent-group');
const matchScoreYouValue = document.getElementById('match-score-you-value');
const matchScoreOpponentValue = document.getElementById('match-score-opponent-value');
const matchEvent = document.getElementById('match-event');
const touchControls = document.getElementById('touch-controls');
const moveStick = document.getElementById('move-stick');
const moveStickKnob = document.getElementById('move-stick-knob');
const touchStance = document.getElementById('touch-stance');
const touchShoot = document.getElementById('touch-shoot');
const touchCamera = document.getElementById('touch-camera');
const touchReset = document.getElementById('touch-reset');
let matchEventTimer = 0;
let lastMatchAnnouncementVersion = 0;

/** Arc geometry (matches SVG path: M 24 104 A 96 96 0 0 1 216 104) */
const POWER_ARC = {
  cx: 120,
  cy: 104,
  r: 96,
  start: Math.PI, // left
  end: 0, // right
  viewW: 240,
  viewH: 120,
};

/** Lightweight spark particles for the power gauge */
const powerFX = {
  particles: [],
  max: 48,
  lastSpawn: 0,
  ctx: powerParticleCanvas?.getContext?.('2d') ?? null,
  dpr: Math.min(window.devicePixelRatio || 1, 2),
};

function resizePowerParticles() {
  if (!powerParticleCanvas || !powerFX.ctx) return;
  const rect = powerParticleCanvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width * powerFX.dpr));
  const h = Math.max(1, Math.round(rect.height * powerFX.dpr));
  if (powerParticleCanvas.width !== w || powerParticleCanvas.height !== h) {
    powerParticleCanvas.width = w;
    powerParticleCanvas.height = h;
  }
}

function heatColor(t) {
  // green → yellow → red (0..1)
  const p = THREE.MathUtils.clamp(t, 0, 1);
  let r;
  let g;
  let b;
  if (p < 0.45) {
    const u = p / 0.45;
    r = Math.round(46 + (240 - 46) * u);
    g = Math.round(229 + (210 - 229) * u);
    b = Math.round(154 + (74 - 154) * u);
  } else {
    const u = (p - 0.45) / 0.55;
    r = Math.round(240 + (255 - 240) * u);
    g = Math.round(210 + (91 - 210) * u);
    b = Math.round(74 + (74 - 74) * u);
  }
  return { r, g, b };
}

function arcAngle(t) {
  // SVG upper arc: left(π) → right(0), y-down coords use -sin for top
  return POWER_ARC.start + (POWER_ARC.end - POWER_ARC.start) * THREE.MathUtils.clamp(t, 0, 1);
}

function arcPoint(t) {
  const a = arcAngle(t);
  return {
    x: POWER_ARC.cx + Math.cos(a) * POWER_ARC.r,
    // upper semicircle in SVG/canvas (y grows downward)
    y: POWER_ARC.cy - Math.sin(a) * POWER_ARC.r,
  };
}

/** Unit tangent in the fill direction (increasing power), screen/y-down space */
function arcTangent(t) {
  const a = arcAngle(t);
  // d/dt of (cos a, -sin a) with a: π→0 ⇒ da/dt < 0
  // velocity ∝ (sin a, cos a) in y-down space
  const tx = Math.sin(a);
  const ty = Math.cos(a);
  const len = Math.hypot(tx, ty) || 1;
  return { x: tx / len, y: ty / len };
}

/** Outward normal (away from arc center), screen/y-down space */
function arcNormalOut(t) {
  const a = arcAngle(t);
  // from center to point: (cos a, -sin a)
  const nx = Math.cos(a);
  const ny = -Math.sin(a);
  const len = Math.hypot(nx, ny) || 1;
  return { x: nx / len, y: ny / len };
}

function spawnPowerSparks(intensity) {
  if (!powerFX.ctx || !powerParticleCanvas || intensity < 0.04) return;
  const n = intensity > 0.75 ? 3 : intensity > 0.4 ? 2 : 1;
  const canvasRect = powerParticleCanvas.getBoundingClientRect();
  let sx;
  let sy;
  if (powerTip && powerTip.style.opacity !== '0') {
    const tipRect = powerTip.getBoundingClientRect();
    sx = tipRect.left + tipRect.width / 2 - canvasRect.left;
    sy = tipRect.top + tipRect.height / 2 - canvasRect.top;
  } else {
    const tip = arcPoint(intensity);
    sx = (tip.x / POWER_ARC.viewW) * canvasRect.width;
    sy = (tip.y / POWER_ARC.viewH) * canvasRect.height;
  }

  // Spray along progress (tangent) + slightly outward — not against the fill
  const tan = arcTangent(intensity);
  const nor = arcNormalOut(intensity);

  for (let i = 0; i < n && powerFX.particles.length < powerFX.max; i++) {
    const along = 0.65 + Math.random() * 0.55; // mostly forward with the bar
    const out = 0.15 + Math.random() * 0.55;
    const side = (Math.random() - 0.5) * 0.35;
    const dirX = tan.x * along + nor.x * out - tan.y * side;
    const dirY = tan.y * along + nor.y * out + tan.x * side;
    const dlen = Math.hypot(dirX, dirY) || 1;
    const speed = 40 + Math.random() * 100 * intensity;
    const c = heatColor(intensity + (Math.random() - 0.5) * 0.15);
    powerFX.particles.push({
      x: sx + (Math.random() - 0.5) * 6,
      y: sy + (Math.random() - 0.5) * 6,
      vx: (dirX / dlen) * speed,
      vy: (dirY / dlen) * speed,
      life: 0.28 + Math.random() * 0.42,
      age: 0,
      size: 1.4 + Math.random() * 2.6 * (0.5 + intensity),
      r: c.r,
      g: c.g,
      b: c.b,
    });
  }
}

function updatePowerParticles(dt) {
  if (!powerFX.ctx || !powerParticleCanvas) return;
  resizePowerParticles();
  const ctx = powerFX.ctx;
  const dpr = powerFX.dpr;
  ctx.clearRect(0, 0, powerParticleCanvas.width, powerParticleCanvas.height);
  ctx.save();
  ctx.scale(dpr, dpr);

  const list = powerFX.particles;
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    p.age += dt;
    if (p.age >= p.life) {
      list.splice(i, 1);
      continue;
    }
    // light drag, no strong gravity pulling against the arc
    p.vx *= 1 - 1.2 * dt;
    p.vy *= 1 - 1.2 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const u = 1 - p.age / p.life;
    const alpha = u * u;
    ctx.beginPath();
    ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${alpha})`;
    ctx.shadowColor = `rgba(${p.r},${p.g},${p.b},${alpha})`;
    ctx.shadowBlur = 8;
    ctx.arc(p.x, p.y, p.size * (0.5 + u * 0.5), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function setHelpOpen(open) {
  if (!helpPanel || !helpToggle) return;
  helpPanel.classList.toggle('hidden', !open);
  helpToggle.classList.toggle('is-active', open);
  helpToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
}

helpToggle?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  setHelpOpen(helpPanel.classList.contains('hidden'));
});
helpClose?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  setHelpOpen(false);
});
// Don't let help clicks fall through to the game canvas.
helpPanel?.addEventListener('pointerdown', (e) => e.stopPropagation());
helpToggle?.addEventListener('pointerdown', (e) => e.stopPropagation());

function setOnlineOpen(open) {
  if (!onlinePanel || !onlineToggle) return;
  onlinePanel.classList.toggle('hidden', !open);
  onlineToggle.classList.toggle('is-active', open);
  onlineToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) setHelpOpen(false);
}

onlineToggle?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  setOnlineOpen(onlinePanel.classList.contains('hidden'));
});
onlineClose?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  setOnlineOpen(false);
});
onlinePanel?.addEventListener('pointerdown', (e) => e.stopPropagation());
onlineToggle?.addEventListener('pointerdown', (e) => e.stopPropagation());
onlineCodeInput?.addEventListener('pointerdown', (e) => e.stopPropagation());
onlineCodeInput?.addEventListener('keydown', (e) => e.stopPropagation());

// ---------- Renderer / Scene ----------
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
// No dynamic lighting / shadows — flat constant illumination.
renderer.shadowMap.enabled = false;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.toneMappingExposure = 1;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9d9389);
scene.fog = new THREE.Fog(0x9d9389, 12, 24);

// Single ambient: whole room always evenly lit (Standard materials need strong ambient).
scene.add(new THREE.AmbientLight(0xffffff, 4.2));

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.05, 50);
camera.position.set(...CAMERA_HOME.position);

// ---------- Controls: left-drag orbit (primary), right-drag also works ----------
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.05, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minPolarAngle = 0.12;
controls.minDistance = 1.0;
controls.maxDistance = 8.2;
controls.enablePan = true;
controls.panSpeed = 0.6;
controls.rotateSpeed = 0.85;
controls.zoomSpeed = 1.1;
controls.mouseButtons = {
  LEFT: THREE.MOUSE.ROTATE,
  MIDDLE: THREE.MOUSE.DOLLY,
  RIGHT: THREE.MOUSE.PAN,
};
controls.touches = {
  ONE: THREE.TOUCH.ROTATE,
  TWO: THREE.TOUCH.DOLLY_PAN,
};
// Do not steal events from cue charge when we disable orbit temporarily
controls.enableRotate = true;
controls.enabled = false;

// ---------- Hall + table ----------
const hall = createPoolHall(scene);

// ---------- Physics ----------
const world = new CANNON.World({
  gravity: new CANNON.Vec3(0, -PHYSICS.gravity, 0),
});
world.broadphase = new CANNON.SAPBroadphase(world);
world.allowSleep = true;
world.solver.iterations = 18;
world.defaultContactMaterial.friction = 0.1;
world.defaultContactMaterial.restitution = 0.3;

const table = createTable(scene, world);
const ballMaterial = createBallMaterial(world);
const balls = createBalls(scene, world, ballMaterial, table.clothMaterial, table.cushionMaterial);
const physics = new PoolPhysics(world, balls);
const cueBall = balls.find((b) => b.isCue);
let shotEvents = null;
function beginShotEvents() {
  shotEvents = { firstContactId: null, pocketedIds: [], cueScratch: false };
}
cueBall.body.addEventListener('collide', (event) => {
  const id = event.body?.userData?.id;
  if (shotEvents && shotEvents.firstContactId == null && Number.isInteger(id) && id !== cueBall.id) {
    shotEvents.firstContactId = id;
  }
});
const cue = new CueController(scene);
const player = new PoolPlayer(scene, { floorY: hall.floorY });
cue.setStickVisible(false); // avatar holds the cue stick
const audio = new PoolAudio();
const pockets = getPocketPositions();
const probe = new PhysicsProbe(scene, balls, { getCueBallId: () => cueBall.id });
const shotPredictor = new ShotPredictor(pockets);
const predictView = new PredictView(scene);
let lastTeachKey = '';
let teachCooldown = 0;
let teachCameraBlend = 0; // 0 = third person, 1 = top-down

const teachLab = new TeachLab(actionRail || document.getElementById('hud'), {
  onToggle: (active) => {
    if (active) {
      setHelpOpen(false);
      enterTeachMode();
    } else {
      exitTeachMode();
    }
  },
  onPower: (p) => {
    if (!teachLab.isActive()) return;
    setPowerUI(p);
    lastTeachKey = ''; // force recompute
    updateTeachPrediction(0, true);
  },
});

// ---------- Multiplayer ----------
/** Latest remote avatar sample for interpolation */
const remotePose = {
  x: 1.8,
  z: 1.15,
  yaw: Math.PI,
  visualState: 'idle',
  aimAngle: 0,
  power: 0,
  aimDepth: 0,
  pull: 0,
  hasData: false,
  receivedAt: 0,
};
const remoteAimAnchor = new THREE.Vector3();
let remoteAimAnchorReady = false;
// Guest-side physics begins from the same shot input as the host.  Network
// snapshots then reconcile that prediction instead of animating the balls.
let guestPredictionActive = false;
/** Local avatar visual state for network (walk/aim/…, not FSM only) */
let lastVisualState = 'idle';

function groupName(group) {
  return group === 'solids' ? '全色' : group === 'stripes' ? '花色' : '花色未定';
}

function groupScore(group) {
  if (!group) return '—';
  const pocketed = balls.filter((ball) => ball.pocketed && ballGroup(ball.id) === group).length;
  return `${pocketed} / 7`;
}

function renderMatchHud(info, match) {
  const visible = !!info.active && info.mode !== 'local' && !!match;
  matchHud?.classList.toggle('hidden', !visible);
  if (!visible) return;

  const mine = match.groups?.[info.seat] ?? null;
  const theirs = match.groups?.[1 - info.seat] ?? null;
  if (matchHudTitle) matchHudTitle.textContent = match.phase === 'ended' ? '本局结束' : '八球对战';
  if (matchHudGame) matchHudGame.textContent = `第 ${match.gameNumber || 1} 局`;
  if (matchScoreYouGroup) matchScoreYouGroup.textContent = groupName(mine);
  if (matchScoreOpponentGroup) matchScoreOpponentGroup.textContent = groupName(theirs);
  if (matchScoreYouValue) matchScoreYouValue.textContent = groupScore(mine);
  if (matchScoreOpponentValue) matchScoreOpponentValue.textContent = groupScore(theirs);
}

function showMatchEvent(message, tone = '') {
  if (!matchEvent || !message) return;
  matchEvent.textContent = message;
  matchEvent.className = `match-event ${tone ? `is-${tone}` : ''}`.trim();
  clearTimeout(matchEventTimer);
  matchEventTimer = window.setTimeout(() => matchEvent.classList.add('hidden'), 2600);
}

function announceShotResult(info, match) {
  const result = info.shotResult;
  const version = Number(info.version) || 0;
  if (!result || !version || version <= lastMatchAnnouncementVersion) return;
  lastMatchAnnouncementVersion = version;

  const shooterIsMe = result.shooterSeat == null || result.shooterSeat === info.seat;
  if (match?.phase === 'ended') {
    showMatchEvent(match.winnerSeat === info.seat ? '胜利！' : '本局结束', 'win');
  } else if (result.foul) {
    showMatchEvent(
      shooterIsMe ? `犯规：${match?.reason || '交换回合'}` : '对方犯规 — 你获得自由球',
      'bad',
    );
  } else if (result.pocketed?.length) {
    const labels = result.pocketed.map((id) => id === 8 ? '8号球' : `${id}号球`).join('、');
    showMatchEvent(shooterIsMe ? `进球！${labels}` : `对方进球：${labels}`, 'good');
  } else {
    showMatchEvent(match?.reason || '交换回合');
  }
}

function updateOnlineUi(info) {
  if (!info) return;
  const inSession = !!info.active && info.mode !== 'local';
  onlineLobby?.classList.toggle('hidden', inSession);
  onlineSession?.classList.toggle('hidden', !inSession);
  onlineToggle?.classList.toggle('is-active', inSession || !onlinePanel?.classList.contains('hidden'));
  if (!inSession) {
    matchHud?.classList.add('hidden');
    lastMatchAnnouncementVersion = 0;
  }

  if (inSession && onlineRoomCode) {
    onlineRoomCode.textContent = info.roomCode || '------';
  }

  if (!onlineTurn) return;
  if (!inSession) {
    onlineTurn.textContent = '等待连接…';
    onlineTurn.dataset.turn = 'wait';
    if (onlineStatus) onlineStatus.textContent = '创建房间号 1v1 轮流击球 · 无需登录';
    return;
  }

  const match = info.match;
  renderMatchHud(info, match);
  announceShotResult(info, match);
  if (onlineMatch) {
    if (match?.phase === 'ended') {
      onlineMatch.textContent = match.winnerSeat === info.seat ? `你获胜：${match.reason || '本局结束'}` : `对手获胜：${match.reason || '本局结束'}`;
    } else if (info.phase === 'reconnecting') {
      onlineMatch.textContent = '对手断线，正在等待 3 分钟内重连…';
    } else if (match?.groups?.[info.seat]) {
      const mine = match.groups[info.seat] === 'solids' ? '全色' : '花色';
      const theirs = match.groups[1 - info.seat] === 'solids' ? '全色' : '花色';
      onlineMatch.textContent = `你：${mine} · 对手：${theirs}${match.ballInHandSeat === info.seat ? ' · 你获得自由球' : ''}`;
    } else {
      onlineMatch.textContent = match?.phase === 'break' ? '开球中：首个合法进球决定花色' : (match?.reason || '等待比赛状态');
    }
  }
  onlineRematch?.classList.toggle('hidden', match?.phase !== 'ended');

  if (info.phase === 'waiting' || info.phase === 'reconnecting') {
    onlineTurn.textContent = info.mode === 'host' ? '等待对手加入…' : '已加入 · 等待开局';
    onlineTurn.dataset.turn = 'wait';
    if (onlineStatus) {
      onlineStatus.textContent =
        info.mode === 'host'
          ? `你是房主 · 房间 ${info.roomCode}`
          : `你是客机 · 房间 ${info.roomCode}`;
    }
    return;
  }

  if (info.isMyTurn) {
    onlineTurn.textContent = '你的回合 — 靠近球桌按 E 击球';
    onlineTurn.dataset.turn = 'mine';
  } else {
    onlineTurn.textContent = '对方回合 — 可自由走动观战';
    onlineTurn.dataset.turn = 'theirs';
  }
  if (onlineStatus) {
    onlineStatus.textContent = `${info.mode === 'host' ? '房主' : '客机'} · 房间 ${info.roomCode}`;
  }
}

const multiplayer = createMultiplayer({
  scene,
  floorY: hall.floorY,
  balls,
  world,
  getLocalPlayer: () => ({
    x: player.position.x,
    z: player.position.z,
    yaw: player.yaw,
    visualState: lastVisualState,
    aimAngle: cue.aimAngle,
    power,
    aimDepth: aimDepthOffset,
    pull: state === State.CHARGING ? power : 0,
  }),
  onRemotePlayer: (msg) => {
    if (typeof msg.x === 'number') remotePose.x = msg.x;
    if (typeof msg.z === 'number') remotePose.z = msg.z;
    if (typeof msg.yaw === 'number') remotePose.yaw = msg.yaw;
    if (msg.visualState) remotePose.visualState = msg.visualState;
    if (typeof msg.aimAngle === 'number') remotePose.aimAngle = msg.aimAngle;
    if (typeof msg.power === 'number') remotePose.power = msg.power;
    if (typeof msg.aimDepth === 'number') remotePose.aimDepth = msg.aimDepth;
    if (typeof msg.pull === 'number') remotePose.pull = msg.pull;
    remotePose.hasData = true;
    remotePose.receivedAt = performance.now();
  },
  onShotRequest: (msg) => {
    // Host executes guest's shot with authoritative physics
    if (!multiplayer.isHost()) return;
    if (state === State.SIMULATING || state === State.STRIKING) return;
    const aimAngle = Number(msg.aimAngle) || 0;
    const shotPower = THREE.MathUtils.clamp(Number(msg.power) || 0, 0, 1);
    if (shotPower < 0.04) return;
    executeAuthoritativeShot(aimAngle, shotPower);
  },
  onState: (msg) => {
    if (!multiplayer.isGuest()) {
      // Host only needs turn UI from room; state is local
      return;
    }
    const event = msg.event;
    if (event === 'shot' || event === 'sim') {
      guestPredictionActive = true;
      if (state !== State.SIMULATING && state !== State.STRIKING) {
        state = State.SIMULATING;
        freeRoamAfterShot = true;
        setStatus('击球中 — 同步球局中');
      }
    } else if (event === 'settled') {
      guestPredictionActive = false;
      settleFrames = 0;
      // Guest: finish like afterShotSettled but without advancing turn (host owns turn)
      guestAfterSettled();
    }
  },
  onReset: () => {
    applyLocalReset({ fromNetwork: true });
  },
  onRematch: () => {
    applyLocalReset({ fromNetwork: true });
    if (multiplayer.isHost()) multiplayer.broadcastState({ event: 'settled' });
    toast(multiplayer.isMyTurn() ? '新一局开始 — 你先开球' : '新一局开始 — 对手开球', 2400);
  },
  onUi: updateOnlineUi,
  toast: (msg, ms) => toast(msg, ms),
});

onlineCreate?.addEventListener('click', async (e) => {
  e.preventDefault();
  e.stopPropagation();
  try {
    onlineCreate.disabled = true;
    if (onlineStatus) onlineStatus.textContent = '正在创建房间…';
    await multiplayer.createRoom();
  } catch (err) {
    toast('无法连接联机服务 — 请确认后端已启动', 3200);
    if (onlineStatus) onlineStatus.textContent = '连接失败 · 请检查服务端';
    console.warn(err);
  } finally {
    onlineCreate.disabled = false;
  }
});

onlineJoin?.addEventListener('click', async (e) => {
  e.preventDefault();
  e.stopPropagation();
  const code = (onlineCodeInput?.value || '').trim();
  if (code.length < 4) {
    toast('请输入房间号', 1600);
    return;
  }
  try {
    onlineJoin.disabled = true;
    if (onlineStatus) onlineStatus.textContent = '正在加入…';
    await multiplayer.joinRoom(code);
  } catch (err) {
    toast('无法连接联机服务 — 请确认后端已启动', 3200);
    console.warn(err);
  } finally {
    onlineJoin.disabled = false;
  }
});

onlineCodeInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    onlineJoin?.click();
  }
});

onlineCopy?.addEventListener('click', async (e) => {
  e.preventDefault();
  e.stopPropagation();
  const code = multiplayer.roomCode || onlineRoomCode?.textContent || '';
  if (!code || code === '------') return;
  try {
    await navigator.clipboard.writeText(code);
    toast('房间号已复制', 1400);
  } catch {
    toast(`房间号：${code}`, 2200);
  }
});

onlineLeave?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  multiplayer.forfeit();
});

onlineRematch?.addEventListener('click', (e) => {
  e.preventDefault();
  multiplayer.readyRematch();
  onlineRematch.disabled = true;
  toast('已准备，等待对手确认', 1600);
  window.setTimeout(() => { if (onlineRematch) onlineRematch.disabled = false; }, 1200);
});

window.addEventListener('online', () => {
  if (!multiplayer.isOnline()) multiplayer.resume().catch(() => {});
});
window.setTimeout(() => multiplayer.resume().catch(() => {}), 250);

// ---------- Game state ----------
const State = {
  FREE: 'free',
  SNAPPING: 'snapping',
  AIMING: 'aiming',
  CHARGING: 'charging',
  STRIKING: 'striking',
  SIMULATING: 'simulating',
};
let state = State.FREE;
let power = 0;
let started = true; // 直接开打，无开始界面
let topView = false;
let toastTimer = 0;

// Keyboard aim / power
const keys = new Set();
const AIM_SPEED = 1.8; // rad/s
const POWER_SPEED = 0.55; // per second
const AIM_DEPTH_SPEED = 0.45;
const WALK_SPEED = 1.45;
const SNAP_SPEED = 1.8;
const PLAYER_RADIUS = 0.24;
const TABLE_BLOCK_X = TABLE_LENGTH / 2 + 0.42;
const TABLE_BLOCK_Z = TABLE_WIDTH / 2 + 0.42;
const AIM_STANCE_X = TABLE_LENGTH / 2 + 0.52;
const AIM_STANCE_Z = TABLE_WIDTH / 2 + 0.52;
let cameraYaw = 0;
let cameraPitch = 0.34;
let cameraDistance = 2.45;
let cameraDragging = false;
let lastPointerX = 0;
let lastPointerY = 0;
let snapPath = [];
let snapTargetYaw = 0;
/** After a shot, first WASD walk releases the frozen aim pose for free movement. */
let freeRoamAfterShot = false;
let aimDepthOffset = 0;
let pendingShot = null;

// ---------- iPad virtual controls ----------
const touchStick = { x: 0, y: 0, magnitude: 0, pointerId: null };
let touchShootPointerId = null;

function resetTouchStick() {
  touchStick.x = 0;
  touchStick.y = 0;
  touchStick.magnitude = 0;
  touchStick.pointerId = null;
  if (moveStickKnob) moveStickKnob.style.transform = 'translate(-50%, -50%)';
}

function updateTouchStick(event) {
  if (!moveStick) return;
  const rect = moveStick.getBoundingClientRect();
  const radius = rect.width * 0.34;
  const dx = event.clientX - (rect.left + rect.width / 2);
  const dy = event.clientY - (rect.top + rect.height / 2);
  const input = normalizeJoystickInput(dx, dy, radius);
  touchStick.x = input.x;
  touchStick.y = input.y;
  touchStick.magnitude = input.magnitude;

  const visualLength = Math.min(Math.hypot(dx, dy), radius);
  const vx = visualLength ? (dx / Math.hypot(dx, dy)) * visualLength : 0;
  const vy = visualLength ? (dy / Math.hypot(dx, dy)) * visualLength : 0;
  if (moveStickKnob) {
    moveStickKnob.style.transform = `translate(calc(-50% + ${vx}px), calc(-50% + ${vy}px))`;
  }
}

function cancelTouchCharge() {
  if (touchShootPointerId == null) return;
  touchShootPointerId = null;
  if (touchShoot) touchShoot.classList.remove('is-charging');
  if (state === State.CHARGING && chargePointerStart?.button === 'touch') {
    chargePointerStart = null;
    state = State.AIMING;
    setPowerUI(0);
    setStatus('瞄准中 — 左摇杆转向 · 按住击球蓄力');
  }
}

function releaseTouchCharge() {
  if (touchShootPointerId == null) return;
  touchShootPointerId = null;
  if (touchShoot) touchShoot.classList.remove('is-charging');
  if (state !== State.CHARGING || chargePointerStart?.button !== 'touch') return;
  const shotPower = power;
  chargePointerStart = null;
  if (shotPower < 0.05) {
    state = State.AIMING;
    setPowerUI(0);
    setStatus('瞄准中 — 左摇杆转向 · 按住击球蓄力');
  } else {
    fireCue(shotPower);
  }
}

function syncTouchControls() {
  if (!touchControls) return;
  const mode = touchActionMode(state);
  const canShoot = !multiplayer.isOnline() || multiplayer.canShoot();
  const isAim = state === State.AIMING || state === State.CHARGING;
  if (touchStance) {
    touchStance.textContent = mode === 'enter' ? '就位' : mode === 'exit' ? '退出瞄准' : '等待球停';
    touchStance.disabled = mode === 'waiting' || (!isAim && !canShoot);
  }
  if (touchShoot) {
    // Keep the pressed button enabled while charging. Disabling an active
    // iPad button can release pointer capture and fire an unintended shot.
    touchShoot.disabled = (state !== State.AIMING && state !== State.CHARGING) || !canShoot || cueBall.pocketed;
    touchShoot.textContent = state === State.CHARGING ? '松开击球' : '按住蓄力';
  }
}

function handleTouchInput(dt) {
  if (!touchStick.magnitude || state === State.CHARGING || state === State.SNAPPING) return false;

  if (state === State.FREE || state === State.SIMULATING) {
    const forward = new THREE.Vector3(Math.sin(cameraYaw), 0, Math.cos(cameraYaw));
    const right = new THREE.Vector3(-Math.cos(cameraYaw), 0, Math.sin(cameraYaw));
    const direction = forward.multiplyScalar(-touchStick.y).addScaledVector(right, touchStick.x);
    if (direction.lengthSq() > 0) {
      direction.normalize();
      movePlayerOnFloor(direction.multiplyScalar(WALK_SPEED * touchStick.magnitude * dt));
      player.setYaw(Math.atan2(direction.x, direction.z), false, dt);
      if (state === State.SIMULATING) freeRoamAfterShot = true;
      return true;
    }
  } else if (state === State.AIMING) {
    cue.aimAngle += touchStick.x * AIM_SPEED * dt;
    aimDepthOffset = clampAimDepth(aimDepthOffset - touchStick.y * AIM_DEPTH_SPEED * dt);
    placePlayerOnAim(true, dt);
  }
  return false;
}

moveStick?.addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'mouse' || touchStick.pointerId != null) return;
  event.preventDefault();
  event.stopPropagation();
  ensureAudio();
  touchStick.pointerId = event.pointerId;
  moveStick.setPointerCapture?.(event.pointerId);
  updateTouchStick(event);
});
moveStick?.addEventListener('pointermove', (event) => {
  if (event.pointerId !== touchStick.pointerId) return;
  event.preventDefault();
  updateTouchStick(event);
});
for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  moveStick?.addEventListener(eventName, (event) => {
    if (event.pointerId === touchStick.pointerId) resetTouchStick();
  });
}

touchStance?.addEventListener('click', (event) => {
  event.preventDefault();
  ensureAudio();
  if (state === State.FREE) {
    if (multiplayer.isOnline() && !multiplayer.canShoot()) toast('还没到你的回合');
    else beginSnapToTable();
  } else if (state === State.AIMING || state === State.CHARGING) {
    cancelTouchCharge();
    exitAimMode();
  }
});
touchShoot?.addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'mouse' || state !== State.AIMING || touchShoot.disabled) return;
  event.preventDefault();
  event.stopPropagation();
  ensureAudio();
  touchShootPointerId = event.pointerId;
  touchShoot.setPointerCapture?.(event.pointerId);
  state = State.CHARGING;
  chargePointerStart = { button: 'touch' };
  setPowerUI(0.08);
  setStatus('蓄力中 — 松开击球');
  touchShoot.classList.add('is-charging');
});
for (const eventName of ['pointerup', 'lostpointercapture']) {
  touchShoot?.addEventListener(eventName, (event) => {
    if (event.pointerId === touchShootPointerId) releaseTouchCharge();
  });
}
touchShoot?.addEventListener('pointercancel', cancelTouchCharge);
touchCamera?.addEventListener('click', () => { resetCamera(); toast('视角已复位'); });
touchReset?.addEventListener('click', () => {
  if (multiplayer.isOnline()) toast('联机对局请使用原有重开流程');
  else doReset();
});
window.addEventListener('blur', () => { resetTouchStick(); cancelTouchCharge(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { resetTouchStick(); cancelTouchCharge(); }
});

const pointer = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
const tablePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hitPoint = new THREE.Vector3();
let chargePointerStart = null;
let isPointerDown = false;
let orbitDragging = false;
let suppressCueClick = false;
/** Cue stick anchor after shot — frozen so stick doesn't chase the cue ball */
const cueFreezePos = new THREE.Vector3();
/** Drag dark cue-butt end to fine-tune aim angle (left button). */
let buttDragging = false;
let buttDragLastX = 0;
let buttDragLastY = 0;
const _buttRight = new THREE.Vector3();
const _buttUp = new THREE.Vector3();
const _buttFwd = new THREE.Vector3();
const _buttHorizFwd = new THREE.Vector3();

// Track orbit drag so left-click orbit doesn't fire cue
let pointerDownPos = null;
const DRAG_THRESHOLD = 6; // px

// ---------- Collisions / Audio ----------
const impactPairs = new Set();

world.addEventListener('beginContact', (e) => {
  const a = e.bodyA;
  const b = e.bodyB;
  if (!a?.userData || !b?.userData) return;

  const ta = a.userData.type;
  const tb = b.userData.type;
  const rel = new CANNON.Vec3();
  a.velocity.vsub(b.velocity, rel);
  const speed = rel.length();

  if (ta === 'ball' && tb === 'ball') {
    const key = pairKey(a.userData.id, b.userData.id);
    if (impactPairs.has(key)) return;
    impactPairs.add(key);
    setTimeout(() => impactPairs.delete(key), 55);
    // Softer mapping: need a solid hit before full volume (speed ~3–4)
    if (speed > 0.12) audio.playBallHit(Math.min(1, speed / 3.8));
    probe.onContact(a, b);
  } else if ((ta === 'ball' && tb === 'cushion') || (tb === 'ball' && ta === 'cushion')) {
    if (speed > 0.18) audio.playCushion(Math.min(1, speed / 3.5));
    probe.onContact(a, b);
  }
});

function pairKey(i, j) {
  return i < j ? `${i}-${j}` : `${j}-${i}`;
}

// ---------- UI helpers ----------
function statusModeKey(mode) {
  if (!mode) return 'free';
  if (mode.includes('瞄准') || mode.includes('就位')) return 'aim';
  if (mode.includes('蓄力')) return 'charge';
  if (mode.includes('公式') || mode.includes('推演')) return 'teach';
  if (mode.includes('出杆') || mode.includes('击球')) return 'shot';
  if (mode.includes('清台')) return 'win';
  return 'free';
}

/** Accepts "模式 — 说明" or a plain sentence. */
function setStatus(text) {
  const raw = String(text ?? '');
  const sep = ' — ';
  const i = raw.indexOf(sep);
  const mode = i >= 0 ? raw.slice(0, i).trim() : '';
  const detail = i >= 0 ? raw.slice(i + sep.length).trim() : raw;
  if (statusModeEl && statusDetailEl) {
    statusModeEl.textContent = mode || '状态';
    statusModeEl.hidden = !mode;
    statusDetailEl.textContent = detail;
    if (statusEl) statusEl.dataset.mode = statusModeKey(mode || detail);
  } else if (statusEl) {
    statusEl.textContent = raw;
  }
}

function setPowerUI(p) {
  power = THREE.MathUtils.clamp(p, 0, 1);
  const pct = Math.round(power * 100);
  if (powerValue) powerValue.textContent = `${pct}%`;

  // SVG arc fill via pathLength=100
  if (powerFill) {
    const filled = power * 100;
    powerFill.setAttribute('stroke-dasharray', `${filled} 100`);
    powerFill.style.opacity = power < 0.01 ? '0' : '1';
  }

  const heat = heatColor(power);
  if (powerWrap) {
    powerWrap.style.setProperty('--p', String(power));
    powerWrap.style.setProperty('--heat', String(power));
    powerWrap.style.setProperty('--glow-r', String(heat.r));
    powerWrap.style.setProperty('--glow-g', String(heat.g));
    powerWrap.style.setProperty('--glow-b', String(heat.b));

    let level = 'idle';
    if (power >= 0.88) level = 'peak';
    else if (power >= 0.55) level = 'hot';
    else if (power >= 0.12) level = 'charge';
    else if (power > 0.02) level = 'warm';
    powerWrap.dataset.level = level;
  }

  // Leading tip on the arc (map viewBox → gauge box %)
  if (powerTip && power > 0.02) {
    const pt = arcPoint(power);
    const left = (pt.x / POWER_ARC.viewW) * 100;
    const top = (pt.y / POWER_ARC.viewH) * 100;
    powerTip.style.left = `${left}%`;
    powerTip.style.top = `${top}%`;
    powerTip.style.opacity = '1';
    const tipScale = 0.7 + power * 0.9;
    powerTip.style.transform = `scale(${tipScale})`;
  } else if (powerTip) {
    powerTip.style.opacity = '0';
  }

  // Burst sparks while power is rising / high
  if (power > 0.08) {
    const now = performance.now();
    const interval = power > 0.8 ? 28 : power > 0.45 ? 48 : 70;
    if (now - powerFX.lastSpawn > interval) {
      powerFX.lastSpawn = now;
      spawnPowerSparks(power);
    }
  }
}

function toast(msg, ms = 1800) {
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add('hidden'), ms);
}

// ---------- Input ----------
function updatePointer(e) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
}

function canFineAimWithButt() {
  return (
    (state === State.AIMING || state === State.CHARGING)
    && !cueBall.pocketed
    && player.cueGroup?.visible
    && player.aimBlend > 0.5
  );
}

function hitCueButt() {
  if (!canFineAimWithButt()) return null;
  const targets = player.getCueButtPickTargets();
  if (!targets.length) return null;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(targets, false);
  return hits.length ? hits[0] : null;
}

/**
 * Drag the dark butt end: lateral motion swings the stick around the cue ball.
 * Only the component perpendicular to the shot line changes aimAngle (fine control).
 */
function applyButtAimDrag(dxPx, dyPx) {
  camera.updateMatrixWorld(true);
  camera.matrixWorld.extractBasis(_buttRight, _buttUp, _buttFwd);
  _buttRight.y = 0;
  if (_buttRight.lengthSq() < 1e-8) _buttRight.set(1, 0, 0);
  else _buttRight.normalize();
  _buttHorizFwd.set(_buttFwd.x, 0, _buttFwd.z);
  if (_buttHorizFwd.lengthSq() < 1e-8) _buttHorizFwd.set(0, 0, 1);
  else _buttHorizFwd.normalize();

  // World metres per screen pixel — scales with distance for stable feel.
  const dist = camera.position.distanceTo(cueBall.mesh.position);
  const mPerPx = THREE.MathUtils.clamp(dist * 0.00085, 0.00055, 0.0022);
  const moveX = _buttRight.x * dxPx * mPerPx + _buttHorizFwd.x * (-dyPx) * mPerPx;
  const moveZ = _buttRight.z * dxPx * mPerPx + _buttHorizFwd.z * (-dyPx) * mPerPx;

  const ax = Math.cos(cue.aimAngle);
  const az = Math.sin(cue.aimAngle);
  // Lever arm ≈ distance from cue ball to dark butt end along the stick.
  const L = 0.9;
  // Perp to aim on XZ (CCW): (-az, ax). Butt motion · perp → −dθ * L
  const perpDot = moveX * (-az) + moveZ * ax;
  cue.aimAngle += -perpDot / L;
  lastTeachKey = '';
}

function updateButtHoverCursor() {
  if (buttDragging) {
    canvas.style.cursor = 'grabbing';
    return;
  }
  if (canFineAimWithButt() && hitCueButt()) {
    canvas.style.cursor = 'grab';
  } else if (canvas.style.cursor === 'grab' || canvas.style.cursor === 'grabbing') {
    canvas.style.cursor = '';
  }
}

function onPointerMove(e) {
  updatePointer(e);
  if (!started) return;

  if (buttDragging) {
    const dx = e.clientX - buttDragLastX;
    const dy = e.clientY - buttDragLastY;
    buttDragLastX = e.clientX;
    buttDragLastY = e.clientY;
    if (dx !== 0 || dy !== 0) applyButtAimDrag(dx, dy);
    canvas.style.cursor = 'grabbing';
    return;
  }

  if (cameraDragging) {
    const dx = e.clientX - lastPointerX;
    const dy = e.clientY - lastPointerY;
    cameraYaw -= dx * 0.005;
    cameraPitch = THREE.MathUtils.clamp(cameraPitch + dy * 0.0035, 0.12, 0.72);
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
  } else {
    updateButtHoverCursor();
  }
  if (state === State.CHARGING && chargePointerStart?.button === 2) {
    const dx = e.clientX - chargePointerStart.x;
    const dy = e.clientY - chargePointerStart.y;
    setPowerUI(CueController.powerFromDrag(dx, dy, 140));
  }
  return;

  // Detect orbit drag (left button moved enough)
  if (isPointerDown && pointerDownPos && e.buttons & 1) {
    const dist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
    if (dist > DRAG_THRESHOLD) {
      orbitDragging = true;
      // cancel charge if we were charging via mouse
      if (state === State.CHARGING && chargePointerStart) {
        chargePointerStart = null;
        state = State.AIMING;
        setPowerUI(0);
      }
    }
  }

  // Aim with mouse only while holding Shift (does not fight orbit)
  if (state === State.AIMING && keys.has('shift') && !orbitDragging) {
    if (projectToTable(pointer, hitPoint)) {
      cue.aimToward(cueBall.mesh.position, hitPoint);
    }
  }

  // Legacy charge-by-drag when using right mouse or middle for power? 
  // Use dedicated charge: hold Space or hold F
  if (state === State.CHARGING && chargePointerStart && !orbitDragging) {
    const dx = e.clientX - chargePointerStart.x;
    const dy = e.clientY - chargePointerStart.y;
    // only if started charge with right button
    if (chargePointerStart.button === 2) {
      const p = CueController.powerFromDrag(dx, dy, 140);
      setPowerUI(p);
    }
  }
}

function onPointerDown(e) {
  if (!started) return;
  ensureAudio();
  if (e.button === 0) {
    updatePointer(e);
    // Grab dark butt end → fine aim (takes priority over camera orbit).
    if (canFineAimWithButt() && hitCueButt()) {
      buttDragging = true;
      buttDragLastX = e.clientX;
      buttDragLastY = e.clientY;
      cameraDragging = false;
      canvas.style.cursor = 'grabbing';
      e.preventDefault();
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      return;
    }
    cameraDragging = true;
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
  } else if (e.button === 2 && state === State.AIMING && !cueBall.pocketed) {
    e.preventDefault();
    chargePointerStart = { x: e.clientX, y: e.clientY, button: 2 };
    state = State.CHARGING;
    setPowerUI(0.08);
    setStatus('蓄力中 — 拖动右键调力度 · 松开击球');
  }
  return;
  isPointerDown = true;
  pointerDownPos = { x: e.clientX, y: e.clientY };
  orbitDragging = false;
  updatePointer(e);

  // Right mouse: start power charge (release to shoot)
  if (e.button === 2) {
    e.preventDefault();
    if (state === State.AIMING && !cueBall.pocketed) {
      controls.enabled = false;
      chargePointerStart = { x: e.clientX, y: e.clientY, button: 2 };
      state = State.CHARGING;
      setPowerUI(0.08);
      setStatus('蓄力中 — 拖动右键调力度，松开击球');
    }
    return;
  }

  // Left: camera orbit (OrbitControls). Optional: Shift+left click aims at point.
  if (e.button === 0 && keys.has('shift') && state === State.AIMING) {
    if (projectToTable(pointer, hitPoint)) {
      cue.aimToward(cueBall.mesh.position, hitPoint);
    }
  }
}

function onPointerUp(e) {
  if (!started) return;

  if (e.button === 0) {
    if (buttDragging) {
      buttDragging = false;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      updateButtHoverCursor();
    }
    cameraDragging = false;
  }
  if (e.button === 2 && state === State.CHARGING) {
    const shotPower = power;
    chargePointerStart = null;
    if (shotPower < 0.04) {
      state = State.AIMING;
      setPowerUI(0);
    } else {
      fireCue(shotPower);
    }
  }
  return;

  if (e.button === 2 && state === State.CHARGING) {
    controls.enabled = true;
    const shotPower = power;
    chargePointerStart = null;
    if (shotPower < 0.04) {
      state = State.AIMING;
      setPowerUI(0);
      setStatus('瞄准中 — A/D 转向 · 空格蓄力 · 左键转视角');
    } else {
      fireCue(shotPower);
    }
  }

  // Left click without drag: fine-aim toward click on table
  if (e.button === 0 && !orbitDragging && state === State.AIMING && !suppressCueClick) {
    updatePointer(e);
    if (projectToTable(pointer, hitPoint)) {
      // Only snap aim if click lands on table surface near play area
      if (
        Math.abs(hitPoint.x) < TABLE_LENGTH / 2 + 0.3 &&
        Math.abs(hitPoint.z) < TABLE_WIDTH / 2 + 0.3
      ) {
        cue.aimToward(cueBall.mesh.position, hitPoint);
      }
    }
  }

  isPointerDown = false;
  pointerDownPos = null;
  orbitDragging = false;
  suppressCueClick = false;
  controls.enabled = true;
}

function onPointerLeave() {
  cameraDragging = false;
  if (buttDragging) {
    buttDragging = false;
    canvas.style.cursor = '';
  }
  if (state === State.CHARGING && chargePointerStart?.button === 2) {
    state = State.AIMING;
    chargePointerStart = null;
    setPowerUI(0);
  }
  return;
  if (state === State.CHARGING && chargePointerStart?.button === 2) {
    state = State.AIMING;
    chargePointerStart = null;
    setPowerUI(0);
    controls.enabled = true;
    setStatus('瞄准中 — A/D 转向 · 空格蓄力 · 左键转视角');
  }
  isPointerDown = false;
  orbitDragging = false;
}

function projectToTable(ndc, out) {
  raycaster.setFromCamera(ndc, camera);
  return raycaster.ray.intersectPlane(tablePlane, out) !== null;
}

function getStanceCandidates() {
  const bx = THREE.MathUtils.clamp(cueBall.mesh.position.x, -AIM_STANCE_X + 0.28, AIM_STANCE_X - 0.28);
  const bz = THREE.MathUtils.clamp(cueBall.mesh.position.z, -AIM_STANCE_Z + 0.28, AIM_STANCE_Z - 0.28);
  return [
    new THREE.Vector3(-AIM_STANCE_X, hall.floorY, bz),
    new THREE.Vector3(AIM_STANCE_X, hall.floorY, bz),
    new THREE.Vector3(bx, hall.floorY, -AIM_STANCE_Z),
    new THREE.Vector3(bx, hall.floorY, AIM_STANCE_Z),
  ];
}

function nearestStance() {
  return getStanceCandidates().sort((a, b) => a.distanceToSquared(player.position) - b.distanceToSquared(player.position))[0];
}

/** Player stands on the table edge opposite the shot direction so stick points at the cue ball. */
function getStanceForAim(aimAngle) {
  const bx = cueBall.mesh.position.x;
  const bz = cueBall.mesh.position.z;
  // Walk from ball opposite to shot until we hit the outer stance ring.
  const ox = -Math.cos(aimAngle);
  const oz = -Math.sin(aimAngle);
  const ex = AIM_STANCE_X;
  const ez = AIM_STANCE_Z;
  let bestT = Infinity;

  if (Math.abs(ox) > 1e-8) {
    for (const edge of [-ex, ex]) {
      const t = (edge - bx) / ox;
      if (t > 1e-4) {
        const z = bz + t * oz;
        if (Math.abs(z) <= ez + 1e-4) bestT = Math.min(bestT, t);
      }
    }
  }
  if (Math.abs(oz) > 1e-8) {
    for (const edge of [-ez, ez]) {
      const t = (edge - bz) / oz;
      if (t > 1e-4) {
        const x = bx + t * ox;
        if (Math.abs(x) <= ex + 1e-4) bestT = Math.min(bestT, t);
      }
    }
  }

  if (!Number.isFinite(bestT) || bestT > 20) return nearestStance();

  const OUT = 0.02;
  let x = bx + ox * bestT;
  let z = bz + oz * bestT;
  if (Math.abs(x) >= ex - 0.001) x = Math.sign(x || ox) * (ex + OUT);
  if (Math.abs(z) >= ez - 0.001) z = Math.sign(z || oz) * (ez + OUT);

  // Compensate for the cue seam and apply W/S depth along the shot line.
  const bodyOffset = getAimBodyOffset(aimAngle, aimDepthOffset);
  x += bodyOffset.x;
  z += bodyOffset.z;

  // Prevent the stance root from entering the aim safety block after W/S adjustments (`绝不穿模`)
  if (Math.abs(x) < AIM_STANCE_X && Math.abs(z) < AIM_STANCE_Z) {
    const dxEdge = AIM_STANCE_X - Math.abs(x);
    const dzEdge = AIM_STANCE_Z - Math.abs(z);
    if (dxEdge <= dzEdge) {
      x = Math.sign(x || ox) * AIM_STANCE_X;
    } else {
      z = Math.sign(z || oz) * AIM_STANCE_Z;
    }
  }

  const roomX = ROOM.width / 2 - ROOM.wallMargin - PLAYER_RADIUS;
  const roomZ = ROOM.depth / 2 - ROOM.wallMargin - PLAYER_RADIUS;
  x = THREE.MathUtils.clamp(x, -roomX, roomX);
  z = THREE.MathUtils.clamp(z, -roomZ, roomZ);
  return new THREE.Vector3(x, hall.floorY, z);
}

function aimYawFromAngle(aimAngle) {
  return Math.atan2(Math.cos(aimAngle), Math.sin(aimAngle));
}

/** Place person + cue on the aim line, stick always toward the ball. */
function placePlayerOnAim(immediate = false, dt = 1 / 60) {
  const stance = getStanceForAim(cue.aimAngle);
  if (immediate) {
    player.setPosition(stance.x, stance.z);
    player.setYaw(aimYawFromAngle(cue.aimAngle), true);
  } else {
    player.setPosition(stance.x, stance.z);
    player.setYaw(aimYawFromAngle(cue.aimAngle), false, dt);
  }
}

function beginSnapToTable() {
  if (cueBall.pocketed || state !== State.FREE) return;
  aimDepthOffset = 0;
  // Aim through the ball from the player's current side.
  const dx = cueBall.mesh.position.x - player.position.x;
  const dz = cueBall.mesh.position.z - player.position.z;
  if (dx * dx + dz * dz > 1e-6) cue.aimAngle = Math.atan2(dz, dx);
  const target = getStanceForAim(cue.aimAngle);
  if (target.distanceTo(player.position) > 1.9) {
    toast('请先走近球桌边缘');
    return;
  }
  snapPath = findPathAroundTable(player.position, target);
  snapTargetYaw = aimYawFromAngle(cue.aimAngle);
  state = State.SNAPPING;
  // Stick is on the avatar; keep table aim guides off until fully in aim mode.
  cue.setGuidesVisible(false);
  setStatus('正在就位 — 走向击球点…');
}

function enterAimMode() {
  placePlayerOnAim(true);
  state = State.AIMING;
  cue.beginAim();
  player.beginAim();
  setPowerUI(0);
  teachLab.setAimReady(true);
  setStatus('瞄准中 — A/D 转向 · 拖杆尾微调 · 空格蓄力 · E 退出');
}

function exitAimMode() {
  if (teachLab.isActive()) teachLab.setActive(false);
  teachLab.setAimReady(false);
  state = State.FREE;
  aimDepthOffset = 0;
  pendingShot = null;
  chargePointerStart = null;
  buttDragging = false;
  canvas.style.cursor = '';
  setPowerUI(0);
  cue.setGuidesVisible(false);
  predictView.setVisible(false);
  lastTeachKey = '';
  // W/S stance adjustment can place the root just inside the table ring.
  // Recover immediately so free-roam never starts from a trapped point.
  movePlayerOnFloor(new THREE.Vector3());
  setStatus('自由移动 — WASD 行走 · 靠近球桌按 E');
}

function enterTeachMode() {
  topView = true;
  teachCameraBlend = 1;
  // Default mid power on the teach slider for meaningful preview
  const p = power > 0.05 ? power : 0.42;
  teachLab.setPower(p, { silent: true });
  setPowerUI(p);
  lastTeachKey = '';
  document.getElementById('play-power-wrap')?.classList.add('is-dimmed');
  setStatus('公式推演 — 拖动滑条预览落点 · 再点按钮关闭');

  // Ceiling sits at floorY+height (~2.7m). A camera above it only sees the
  // ceiling plane (beige) — that was the "all white" teach view.
  setTeachEnvironment(true);
  applyTeachCamera(true);
  updateTeachPrediction(0, true);
  toast('公式推演：俯视 + 力度滑条 + 落点与公式');
}

function exitTeachMode() {
  topView = false;
  teachCameraBlend = 0;
  setTeachEnvironment(false);
  camera.up.set(0, 1, 0);
  predictView.setVisible(false);
  predictView.clear();
  lastTeachKey = '';
  document.getElementById('play-power-wrap')?.classList.remove('is-dimmed');
  if (state === State.AIMING || state === State.CHARGING) {
    setStatus('瞄准中 — A/D 转向 · 拖杆尾微调 · 空格蓄力 · E 退出');
  }
}

/** Hide room shell clutter that blocks / distracts top-down table view. */
function setTeachEnvironment(on) {
  if (on) {
    scene.fog = null;
    camera.fov = 55;
    camera.near = 0.05;
    camera.far = 40;
  } else {
    scene.fog = new THREE.Fog(0x9d9389, 12, 24);
    camera.fov = 60;
    camera.near = 0.05;
    camera.far = 50;
  }
  camera.updateProjectionMatrix();

  // Tag & hide meshes above the table plane that occlude top-down (ceiling, lights, etc.)
  hall.root.traverse((obj) => {
    if (!obj.isMesh) return;
    if (obj.userData._teachHide == null) {
      // Ceiling is ~floorY+height; table cloth is ~0. Hide anything whose
      // world Y center is clearly above the play surface + rail.
      const wp = new THREE.Vector3();
      obj.getWorldPosition(wp);
      obj.userData._teachHide = wp.y > 1.15;
    }
    if (obj.userData._teachHide) obj.visible = !on;
  });
}

/**
 * Top-down over the cloth — must sit *below* the room ceiling.
 * Avoid lookAt along world-Y (gimbal lock).
 */
function applyTeachCamera(instant = false) {
  // floorY≈-0.84, ceiling≈2.71 → stay under ceiling, high enough to frame the table
  const ceilingY = hall.floorY + (hall.roomH ?? ROOM.height);
  const y = Math.min(ceilingY - 0.45, 2.25);
  const desired = new THREE.Vector3(0, y, 0);
  if (instant) camera.position.copy(desired);
  else camera.position.lerp(desired, 1 - Math.exp(-14 * (1 / 60)));

  camera.up.set(0, 1, 0);
  // Pitch −90°: camera looks along −Y onto the cloth
  camera.quaternion.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0, 'YXZ'));
  camera.updateMatrixWorld();
}

function findPathAroundTable(start, end) {
  if (!segmentCrossesTable(start, end)) return [end.clone()];
  const pad = 0.12;
  const corners = [
    new THREE.Vector3(-TABLE_BLOCK_X - pad, hall.floorY, -TABLE_BLOCK_Z - pad),
    new THREE.Vector3(TABLE_BLOCK_X + pad, hall.floorY, -TABLE_BLOCK_Z - pad),
    new THREE.Vector3(TABLE_BLOCK_X + pad, hall.floorY, TABLE_BLOCK_Z + pad),
    new THREE.Vector3(-TABLE_BLOCK_X - pad, hall.floorY, TABLE_BLOCK_Z + pad),
  ];
  const nodes = [start.clone(), ...corners, end.clone()];
  const last = nodes.length - 1;
  const dist = Array(nodes.length).fill(Infinity);
  const prev = Array(nodes.length).fill(-1);
  const used = Array(nodes.length).fill(false);
  dist[0] = 0;
  for (let step = 0; step < nodes.length; step++) {
    let u = -1;
    for (let i = 0; i < nodes.length; i++) if (!used[i] && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || !Number.isFinite(dist[u])) break;
    used[u] = true;
    for (let v = 0; v < nodes.length; v++) {
      if (u === v || segmentCrossesTable(nodes[u], nodes[v])) continue;
      const nd = dist[u] + nodes[u].distanceTo(nodes[v]);
      if (nd < dist[v]) { dist[v] = nd; prev[v] = u; }
    }
  }
  if (!Number.isFinite(dist[last])) return [end.clone()];
  const path = [];
  for (let at = last; at > 0; at = prev[at]) path.unshift(nodes[at].clone());
  return path;
}

function segmentCrossesTable(a, b) {
  const samples = Math.max(8, Math.ceil(a.distanceTo(b) / 0.08));
  for (let i = 1; i < samples; i++) {
    const t = i / samples;
    const x = THREE.MathUtils.lerp(a.x, b.x, t);
    const z = THREE.MathUtils.lerp(a.z, b.z, t);
    if (Math.abs(x) < TABLE_BLOCK_X && Math.abs(z) < TABLE_BLOCK_Z) return true;
  }
  return false;
}

function movePlayerOnFloor(delta) {
  const roomX = ROOM.width / 2 - ROOM.wallMargin - PLAYER_RADIUS;
  const roomZ = ROOM.depth / 2 - ROOM.wallMargin - PLAYER_RADIUS;
  const next = resolveFloorMovement(player.position, delta, {
    roomHalfX: roomX,
    roomHalfZ: roomZ,
    blockHalfX: TABLE_BLOCK_X,
    blockHalfZ: TABLE_BLOCK_Z,
  });
  player.setPosition(next.x, next.z);
}

/**
 * Host: apply impulse immediately (own or guest shot), skip local tip-contact.
 * Used for network guest shots and as authority start.
 */
function executeAuthoritativeShot(aimAngle, shotPower) {
  cue.aimAngle = aimAngle;
  const shotDirection = getAimDirection(aimAngle);
  const velocity = cueVelocityFromAim(shotDirection.x, shotDirection.z, shotPower);
  if (teachLab.isActive()) teachLab.setActive(false);
  teachLab.setAimReady(false);
  predictView.setVisible(false);
  lastTeachKey = '';
  pendingShot = null;
  buttDragging = false;
  canvas.style.cursor = '';
  cue.setGuidesVisible(false);
  if (multiplayer.isHost() && multiplayer.isOnline()) beginShotEvents();
  physics.strikeCenter(cueBall, velocity);
  cueFreezePos.set(cueBall.mesh.position.x, BALL_Y, cueBall.mesh.position.z);
  audio.playCueStrike(shotPower);
  freeRoamAfterShot = false;
  state = State.SIMULATING;
  setPowerUI(0);
  setStatus('击球中 — WASD 可移动 · 等待球停');
  multiplayer.onHostShotStarted({
    aimAngle,
    power: shotPower,
  });
}

function fireCue(p) {
  // Prefer teach-slider power if teaching is open
  const shotPower = teachLab.isActive() ? teachLab.getPower() : p;

  // Online: not your turn
  if (multiplayer.isOnline() && !multiplayer.canShoot()) {
    toast('还没到你的回合');
    state = State.AIMING;
    setPowerUI(0);
    return;
  }

  // Guest: send shot to host; play local stroke for feel only (no local impulse)
  if (multiplayer.isGuest() && multiplayer.isMyTurn()) {
    if (teachLab.isActive()) teachLab.setActive(false);
    teachLab.setAimReady(false);
    predictView.setVisible(false);
    lastTeachKey = '';
    cue.beginStroke();
    player.beginStroke(shotPower);
    freeRoamAfterShot = false;
    state = State.STRIKING;
    setPowerUI(0);
    keys.delete(' ');
    keys.delete('space');
    multiplayer.requestShot({
      aimAngle: cue.aimAngle,
      power: shotPower,
      aimDepth: aimDepthOffset,
    });
    // Predict immediately from the same input sent to the host. The host's
    // first shot snapshot establishes the authority point, then later packets
    // only smooth out collision/floating-point drift.
    const localDirection = cue.getShotDirection();
    const localVelocity = cueVelocityFromAim(localDirection.x, localDirection.z, shotPower);
    physics.strikeCenter(cueBall, localVelocity);
    guestPredictionActive = true;
    // After stroke anim, the UI enters the normal shot-watching state.
    pendingShot = null;
    setStatus('出杆中 — 等待同步…');
    // Transition to simulating shortly so avatar finishes stroke
    window.setTimeout(() => {
      if (multiplayer.isGuest() && state === State.STRIKING) {
        state = State.SIMULATING;
        freeRoamAfterShot = true;
        setStatus('击球中 — 同步球局中');
      }
    }, 400);
    return;
  }

  const dir = cue.getShotDirection();
  const velocity = cueVelocityFromAim(dir.x, dir.z, shotPower);
  pendingShot = {
    power: shotPower,
    velocity,
    previousTip: player.getCueTipWorldPosition(new THREE.Vector3()),
  };
  // Leave teach UI fully (button was aim-only); free-roam must not keep it visible.
  if (teachLab.isActive()) teachLab.setActive(false);
  teachLab.setAimReady(false);
  predictView.setVisible(false);
  lastTeachKey = '';
  cue.beginStroke();
  player.beginStroke(shotPower);
  freeRoamAfterShot = false;
  state = State.STRIKING;
  setPowerUI(0);
  keys.delete(' ');
  keys.delete('space');
  setStatus('出杆中 — 杆尖触球后击出');
}

/**
 * Teach mode only: simulate shot at slider power, show all landings + formulas.
 * @param {number} dt
 * @param {boolean} [force]
 */
function updateTeachPrediction(dt, force = false) {
  if (!teachLab.isActive() || cueBall.pocketed) {
    if (!teachLab.isActive() && predictView.group.visible) {
      predictView.setVisible(false);
    }
    return;
  }
  if (state !== State.AIMING && state !== State.CHARGING) {
    teachLab.setActive(false);
    return;
  }

  teachCooldown = Math.max(0, teachCooldown - dt);
  const previewPower = teachLab.getPower();
  const dir = cue.getShotDirection();
  const key = `${cue.aimAngle.toFixed(3)}_${previewPower.toFixed(3)}_${cueBall.body.position.x.toFixed(3)}_${cueBall.body.position.z.toFixed(3)}`;
  if (!force) {
    if (key === lastTeachKey) return;
    if (teachCooldown > 0 && lastTeachKey) return;
  }

  const velocity = cueVelocityFromAim(dir.x, dir.z, previewPower);
  const t0 = performance.now();
  const result = shotPredictor.predict(balls, velocity, {
    cueId: cueBall.id,
    recordPaths: true,
    maxTime: 12,
  });
  const elapsed = performance.now() - t0;
  result.cueId = cueBall.id;

  predictView.show(result, balls);
  // Hide soft/hard ladder markers in pure teach mode
  predictView.showPowerLadder({});

  const board = buildFormulaBoard(result, previewPower, balls, {
    dirX: dir.x,
    dirZ: dir.z,
  });
  const landings = buildLandingRows(result, balls);
  teachLab.render(board, landings);

  lastTeachKey = key;
  teachCooldown = elapsed > 16 ? 0.1 : 0.04;
}

function updateCueStrikeContact() {
  if (state !== State.STRIKING || !pendingShot) return;
  const currentTip = player.getCueTipWorldPosition(new THREE.Vector3());
  if (
    segmentIntersectsSphere(
      pendingShot.previousTip,
      currentTip,
      cueBall.body.position,
      BALL_R + 0.008,
    )
  ) {
    physics.strikeCenter(cueBall, pendingShot.velocity);
    cueFreezePos.set(cueBall.mesh.position.x, BALL_Y, cueBall.mesh.position.z);
    audio.playCueStrike(pendingShot.power);
    const struckPower = pendingShot.power;
    pendingShot = null;
    state = State.SIMULATING;
    setStatus('击球中 — WASD 可移动 · 等待球停');
    if (multiplayer.isHost() && multiplayer.isOnline()) {
      beginShotEvents();
      multiplayer.onHostShotStarted({
        aimAngle: cue.aimAngle,
        power: struckPower,
      });
    }
    return;
  }

  pendingShot.previousTip.copy(currentTip);
  if (player.isStrokeFinished()) {
    pendingShot = null;
    state = State.AIMING;
    cue.beginAim();
    player.beginAim();
    cue.setGuidesVisible(true);
    setStatus('未击中 — W/S 调整距离后再次蓄力');
    toast('杆尖未碰到母球');
  }
}

// Keyboard
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  keys.add(k);
  if (e.key === 'Shift') keys.add('shift');
  if (e.code === 'Space') keys.add(' ');

  if (!started) return;

  if (k === 'r') {
    doReset();
  } else if (k === 'e' && !e.repeat) {
    if (state === State.FREE) {
      if (multiplayer.isOnline() && !multiplayer.canShoot()) {
        toast('还没到你的回合');
      } else {
        beginSnapToTable();
      }
    } else if (state === State.AIMING || state === State.CHARGING) exitAimMode();
  } else if (e.code === 'Space' && state === State.AIMING && !cueBall.pocketed) {
    if (multiplayer.isOnline() && !multiplayer.canShoot()) {
      toast('还没到你的回合');
      return;
    }
    e.preventDefault();
    state = State.CHARGING;
    chargePointerStart = { button: 'space' };
    setPowerUI(0.08);
    setStatus('蓄力中 — 松开空格击球');
  } else if (k === 'h') {
    document.getElementById('hud').classList.toggle('is-hidden');
  } else if (k === 'p' && !e.repeat) {
    const on = probe.toggle();
    toast(on ? '物理探针已开启 — 速度 / 动量 / 能量' : '物理探针已关闭');
    if (on) setStatus('探针开启 — 观察动量与能量 · 再按 P 关闭');
  } else if (k === 'home') {
    cameraYaw = 0;
    cameraPitch = 0.34;
    cameraDistance = 2.45;
  }
  return;

  if (k === 'r') {
    doReset();
  } else if (k === 'c') {
    cameraMode = (cameraMode + 1) % 2;
    toast(cameraMode === 0 ? '自由视角' : '跟随母球');
  } else if (e.code === 'Space') {
    e.preventDefault();
    // hold space to charge
    if (state === State.AIMING && !cueBall.pocketed) {
      state = State.CHARGING;
      chargePointerStart = { button: 'space' };
      setPowerUI(0.1);
      setStatus('蓄力中 — 按住空格增加力度，松开击球');
    }
  } else if (k === 'v') {
    topView = !topView;
    if (topView) {
      camera.position.set(0, 3.4, 0.05);
      controls.target.set(0, 0, 0);
      toast('俯视图');
    } else {
      resetCamera();
      toast('斜视图');
    }
  } else if (k === 'home') {
    resetCamera();
    toast('视角已复位');
  } else if (k === 'h') {
    document.getElementById('hud').classList.toggle('is-hidden');
    toast('按 H 显示或隐藏界面');
  } else if (k === 'enter' || k === 'f') {
    // Instant shoot with current power (or medium if 0)
    if (state === State.AIMING && !cueBall.pocketed) {
      fireCue(power > 0.05 ? power : 0.45);
    } else if (state === State.CHARGING) {
      fireCue(Math.max(power, 0.1));
    }
  }
});

window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  keys.delete(k);
  if (e.key === 'Shift') keys.delete('shift');

  if (e.code === 'Space') {
    keys.delete(' ');
    if (state === State.CHARGING && chargePointerStart?.button === 'space') {
      const shotPower = power;
      chargePointerStart = null;
      if (shotPower < 0.05) {
        state = State.AIMING;
        setPowerUI(0);
        setStatus('瞄准中 — A/D 转向 · 空格蓄力 · 左键转视角');
      } else {
        fireCue(shotPower);
      }
    }
  }
  return;
});

canvas.addEventListener('pointermove', onPointerMove);
canvas.addEventListener('pointerdown', onPointerDown);
canvas.addEventListener('pointerup', onPointerUp);
canvas.addEventListener('pointerleave', onPointerLeave);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// Wheel: zoom camera; Shift+wheel adjusts power while aiming
canvas.addEventListener(
  'wheel',
  (e) => {
    if (!started) return;
    if (keys.has('shift') && (state === State.AIMING || state === State.CHARGING)) {
      e.preventDefault();
      e.stopPropagation();
      setPowerUI(power + (e.deltaY > 0 ? -0.05 : 0.05));
      setStatus(`力度 ${Math.round(power * 100)}% — 按 F 或 Enter 击球`);
    } else {
      e.preventDefault();
      e.stopPropagation();
      const zoomSpeed = 0.0008;
      cameraDistance = THREE.MathUtils.clamp(
        cameraDistance + e.deltaY * zoomSpeed * cameraDistance,
        0.8,
        5.5
      );
    }
  },
  { passive: false },
);

// 首次交互时启用音效（浏览器策略要求）
let audioReady = false;
async function ensureAudio() {
  if (audioReady) return;
  audioReady = true;
  try {
    await audio.init();
  } catch {
    audioReady = false;
  }
}
canvas.addEventListener('pointerdown', () => ensureAudio(), { once: false });
window.addEventListener('keydown', () => ensureAudio(), { once: false });

// ---------- Game logic ----------
function applyLocalReset(opts = {}) {
  for (const ball of balls) {
    if (!ball.body.world) world.addBody(ball.body);
  }
  resetBalls(balls);
  physics.reset();
  guestPredictionActive = false;
  aimDepthOffset = 0;
  pendingShot = null;
  if (teachLab.isActive()) teachLab.setActive(false);
  teachLab.setAimReady(false);
  predictView.setVisible(false);
  lastTeachKey = '';
  buttDragging = false;
  canvas.style.cursor = '';
  cue.setGuidesVisible(false);
  player.setPosition(-1.8, 1.15);
  state = State.FREE;
  setPowerUI(0);
  setStatus('自由移动 — 已重新摆球 · 靠近球桌按 E');
  if (!opts.fromNetwork) toast('已重新摆球');
}

function doReset() {
  if (multiplayer.isOnline() && !multiplayer.canReset()) {
    toast('仅房主可重新摆球');
    return;
  }
  applyLocalReset();
  if (multiplayer.isHost()) {
    multiplayer.broadcastReset();
    multiplayer.broadcastState({ event: 'settled' });
  }
}

/** Guest-side settle after host broadcasts event:settled */
function guestAfterSettled() {
  guestPredictionActive = false;
  if (cueBall.pocketed) {
    if (!cueBall.body.world) world.addBody(cueBall.body);
    respotCueBall(cueBall, world);
    separateCueIfNeeded();
  }
  const remaining = balls.filter((b) => !b.pocketed && !b.isCue).length;
  if (teachLab.isActive()) teachLab.setActive(false);
  teachLab.setAimReady(false);
  predictView.setVisible(false);
  lastTeachKey = '';
  canvas.style.cursor = '';
  buttDragging = false;
  cue.setGuidesVisible(false);
  freeRoamAfterShot = false;
  aimDepthOffset = 0;
  pendingShot = null;
  state = State.FREE;
  setPowerUI(0);
  setStatus(
    remaining === 0
      ? '清台完成 — 等待房主重摆或继续'
      : multiplayer.isMyTurn()
        ? `你的回合 — 剩余 ${remaining} 颗 · 靠近球桌按 E`
        : `对方回合 — 剩余 ${remaining} 颗`,
  );
}

function checkPockets() {
  for (const ball of balls) {
    if (ball.pocketed) continue;
    const p = ball.body.position;
    const previous = physics.getPreviousPosition(ball);
    for (const pocket of pockets) {
      const r = pocketCaptureRadius(pocket);
      if (segmentIntersectsCircle(previous, p, pocket, r)) {
        pocketBall(ball);
        break;
      }
    }
    if (
      !ball.pocketed &&
      (Math.abs(p.x) > TABLE_LENGTH / 2 + BALL_R * 1.2 ||
        Math.abs(p.z) > TABLE_WIDTH / 2 + BALL_R * 1.2 ||
        p.y < -0.05)
    ) {
      pocketBall(ball);
    }
  }
}

function pocketBall(ball) {
  if (ball.pocketed) return;
  ball.pocketed = true;
  ball.mesh.visible = false;
  ball.body.velocity.set(0, 0, 0);
  ball.body.angularVelocity.set(0, 0, 0);
  world.removeBody(ball.body);
  if (shotEvents) {
    shotEvents.pocketedIds.push(ball.id);
    if (ball.isCue) shotEvents.cueScratch = true;
  }
  audio.playPocket();

  if (ball.isCue) {
    toast('母球落袋 — 自动回位');
  } else {
    toast(`${ball.def.name} 号球入袋`);
  }
}

function afterShotSettled() {
  // Guest settle is driven by host state broadcast
  if (multiplayer.isGuest()) return;

  const pocketedBeforeRespot = balls.filter((b) => b.pocketed).map((b) => b.id);
  if (cueBall.pocketed) {
    if (!cueBall.body.world) world.addBody(cueBall.body);
    respotCueBall(cueBall, world);
    separateCueIfNeeded();
  }

  const remaining = balls.filter((b) => !b.pocketed && !b.isCue).length;
  if (remaining === 0) {
    toast('全部清台！按 R 再来一局', 3000);
  }

  // Restore free-roam UI: no aim stance, no formula-preview button.
  if (teachLab.isActive()) teachLab.setActive(false);
  teachLab.setAimReady(false);
  predictView.setVisible(false);
  lastTeachKey = '';
  canvas.style.cursor = '';
  buttDragging = false;

  cue.setGuidesVisible(false);
  freeRoamAfterShot = false;
  aimDepthOffset = 0;
  pendingShot = null;
  state = State.FREE;
  setPowerUI(0);

  if (multiplayer.isHost() && multiplayer.isOnline()) {
    const match = multiplayer.match || createMatchState({ breakerSeat: multiplayer.turnSeat });
    const shooterSeat = multiplayer.turnSeat;
    const result = resolveShot(match, shotEvents || { firstContactId: null, pocketedIds: [] }, pocketedBeforeRespot);
    shotEvents = null;
    const shotResult = { foul: result.foul, pocketed: result.pocketed, shooterSeat };
    multiplayer.sendShotResult({ shotResult });
    multiplayer.broadcastMatchState({ match: result.match, shotResult });
    if (result.match.phase === 'ended') {
      state = State.FREE;
      toast(result.match.winnerSeat === multiplayer.net.seat ? '你赢得本局！' : '本局结束，对手获胜', 3200);
      setStatus(result.match.reason || '本局结束');
      multiplayer.broadcastState({ event: 'settled' });
      return;
    }
    multiplayer.onHostSettled(result.match.turnSeat);
    setStatus(
      remaining === 0
        ? '清台完成 — 按 R 再来一局'
        : multiplayer.isMyTurn()
          ? `你的回合 — 剩余 ${remaining} 颗 · 靠近球桌按 E`
          : `对方回合 — 剩余 ${remaining} 颗`,
    );
    return;
  }

  setStatus(
    remaining === 0
      ? '清台完成 — 按 R 再来一局'
      : `自由移动 — 剩余 ${remaining} 颗 · 靠近球桌按 E`,
  );
}

function separateCueIfNeeded() {
  for (let iter = 0; iter < 8; iter++) {
    let moved = false;
    for (const other of balls) {
      if (other.isCue || other.pocketed) continue;
      const dx = cueBall.body.position.x - other.body.position.x;
      const dz = cueBall.body.position.z - other.body.position.z;
      const dist = Math.hypot(dx, dz);
      const min = BALL_R * 2.05;
      if (dist < min && dist > 1e-6) {
        const push = (min - dist) / dist;
        cueBall.body.position.x += dx * push;
        cueBall.body.position.z += dz * push;
        moved = true;
      } else if (dist < 1e-6) {
        cueBall.body.position.x += min;
        moved = true;
      }
    }
    const mx = TABLE_LENGTH / 2 - BALL_R * 2;
    const mz = TABLE_WIDTH / 2 - BALL_R * 2;
    cueBall.body.position.x = THREE.MathUtils.clamp(cueBall.body.position.x, -mx, mx);
    cueBall.body.position.z = THREE.MathUtils.clamp(cueBall.body.position.z, -mz, mz);
    cueBall.body.position.y = BALL_Y;
    if (!moved) break;
  }
  cueBall.mesh.position.set(
    cueBall.body.position.x,
    cueBall.body.position.y,
    cueBall.body.position.z,
  );
}

function handleFreeMove(dt) {
  // Match third-person camera: look dir is (sin yaw, 0, cos yaw).
  // Screen-right is cross(forward, up) = (-cos yaw, 0, sin yaw).
  const forward = new THREE.Vector3(Math.sin(cameraYaw), 0, Math.cos(cameraYaw));
  const right = new THREE.Vector3(-Math.cos(cameraYaw), 0, Math.sin(cameraYaw));
  const direction = new THREE.Vector3();
  if (keys.has('w') || keys.has('arrowup')) direction.add(forward);
  if (keys.has('s') || keys.has('arrowdown')) direction.sub(forward);
  if (keys.has('d') || keys.has('arrowright')) direction.add(right);
  if (keys.has('a') || keys.has('arrowleft')) direction.sub(right);
  if (direction.lengthSq() > 0) {
    direction.normalize();
    movePlayerOnFloor(direction.clone().multiplyScalar(WALK_SPEED * dt));
    player.setYaw(Math.atan2(direction.x, direction.z), false, dt);
    return true;
  }
  return false;
}

function handleKeyboard(dt) {
  if (!started) return;
  // Free roam, and also after a shot while balls are still rolling.
  if (state === State.FREE || state === State.SIMULATING) {
    if (handleFreeMove(dt) && state === State.SIMULATING) {
      freeRoamAfterShot = true;
    }
  } else if (state === State.SNAPPING) {
    if (snapPath.length === 0) enterAimMode();
    else if (player.moveTowards(snapPath[0], SNAP_SPEED, dt)) {
      snapPath.shift();
      if (snapPath.length === 0) enterAimMode();
    } else {
      // Face the ball so person + stick stay aligned while walking into stance.
      const dx = cueBall.mesh.position.x - player.position.x;
      const dz = cueBall.mesh.position.z - player.position.z;
      if (dx * dx + dz * dz > 1e-6) {
        player.setYaw(Math.atan2(dx, dz), false, dt);
      }
    }
  } else if (state === State.AIMING) {
    let aimDelta = 0;
    if (keys.has('a') || keys.has('arrowleft')) aimDelta -= AIM_SPEED * dt;
    if (keys.has('d') || keys.has('arrowright')) aimDelta += AIM_SPEED * dt;
    cue.aimAngle += aimDelta;
    let depthDelta = 0;
    if (keys.has('w') || keys.has('arrowup')) depthDelta += AIM_DEPTH_SPEED * dt;
    if (keys.has('s') || keys.has('arrowdown')) depthDelta -= AIM_DEPTH_SPEED * dt;
    aimDepthOffset = clampAimDepth(aimDepthOffset + depthDelta);
    // A/D rotates aim; W/S moves the complete stance along the shot line.
    placePlayerOnAim(true, dt);
  } else if (state === State.CHARGING) {
    placePlayerOnAim(true, dt);
    if (chargePointerStart?.button === 'space' || chargePointerStart?.button === 'touch') {
      setPowerUI(power + POWER_SPEED * 0.85 * dt);
      if (teachLab.isActive()) {
        teachLab.setPower(power, { silent: true });
        lastTeachKey = '';
      }
    }
  }
  return;
  if (keys.has('shift')) {
    moveCamera(dt);
    return;
  }
  if (state !== State.AIMING && state !== State.CHARGING) return;
  if (cueBall.pocketed) return;

  // Aim with A/D or arrows
  let aimDelta = 0;
  if (keys.has('a') || keys.has('arrowleft')) aimDelta -= AIM_SPEED * dt;
  if (keys.has('d') || keys.has('arrowright')) aimDelta += AIM_SPEED * dt;
  // fine aim
  if (keys.has('q')) aimDelta -= AIM_SPEED * 0.35 * dt;
  if (keys.has('e')) aimDelta += AIM_SPEED * 0.35 * dt;
  if (aimDelta !== 0) {
    cue.aimAngle += aimDelta;
  }

  // Power with W/S while charging or always adjust
  if (keys.has('w') || keys.has('arrowup')) {
    setPowerUI(power + POWER_SPEED * dt);
  }
  if (keys.has('s') || keys.has('arrowdown')) {
    setPowerUI(power - POWER_SPEED * dt);
  }

  // Hold space: ramp power
  if (state === State.CHARGING && chargePointerStart?.button === 'space') {
    setPowerUI(power + POWER_SPEED * 0.85 * dt);
  }
}

function resetCamera() {
  topView = false;
  cameraYaw = 0;
  cameraPitch = 0.34;
  cameraDistance = 2.45;
}

function moveCamera(dt) {
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  if (forward.lengthSq() < 0.001) forward.set(0, 0, -1);
  forward.normalize();
  const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
  const direction = new THREE.Vector3();
  if (keys.has('w') || keys.has('arrowup')) direction.add(forward);
  if (keys.has('s') || keys.has('arrowdown')) direction.sub(forward);
  if (keys.has('d') || keys.has('arrowright')) direction.add(right);
  if (keys.has('a') || keys.has('arrowleft')) direction.sub(right);
  if (!direction.lengthSq()) return;
  direction.normalize().multiplyScalar(CAMERA_LIMITS.moveSpeed * dt);
  camera.position.add(direction);
  controls.target.add(direction);
  constrainCamera();
}

function constrainCamera() {
  const xLimit = ROOM.width / 2 - ROOM.wallMargin;
  const zLimit = ROOM.depth / 2 - ROOM.wallMargin;
  const old = camera.position.clone();
  camera.position.x = THREE.MathUtils.clamp(camera.position.x, -xLimit, xLimit);
  camera.position.z = THREE.MathUtils.clamp(camera.position.z, -zLimit, zLimit);
  camera.position.y = THREE.MathUtils.clamp(camera.position.y, CAMERA_LIMITS.minY, CAMERA_LIMITS.maxY);
  controls.target.add(camera.position.clone().sub(old));
  controls.target.x = THREE.MathUtils.clamp(controls.target.x, -xLimit, xLimit);
  controls.target.z = THREE.MathUtils.clamp(controls.target.z, -zLimit, zLimit);
  controls.target.y = THREE.MathUtils.clamp(controls.target.y, hall.floorY + 0.18, CAMERA_LIMITS.maxY);
}

function updateThirdPersonCamera(dt) {
  // Teach mode: locked top-down over the table
  if (teachLab.isActive()) {
    applyTeachCamera(false);
    return;
  }
  camera.up.set(0, 1, 0);
  if (topView) {
    // Legacy top flag without teach: still use safe overhead pose
    applyTeachCamera(false);
    return;
  }
  const focus = new THREE.Vector3(player.position.x, hall.floorY + 1.02, player.position.z);
  const horizontal = Math.cos(cameraPitch) * cameraDistance;
  const desired = new THREE.Vector3(
    focus.x - Math.sin(cameraYaw) * horizontal,
    focus.y + Math.sin(cameraPitch) * cameraDistance,
    focus.z - Math.cos(cameraYaw) * horizontal,
  );
  const roomX = ROOM.width / 2 - ROOM.wallMargin;
  const roomZ = ROOM.depth / 2 - ROOM.wallMargin;
  desired.x = THREE.MathUtils.clamp(desired.x, -roomX, roomX);
  desired.z = THREE.MathUtils.clamp(desired.z, -roomZ, roomZ);
  desired.y = THREE.MathUtils.clamp(desired.y, hall.floorY + 0.35, CAMERA_LIMITS.maxY);
  camera.position.lerp(desired, 1 - Math.exp(-9 * dt));
  camera.lookAt(focus);
}

// ---------- Resize ----------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Loop ----------
const clock = new THREE.Clock();
let settleFrames = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  handleKeyboard(dt);
  handleTouchInput(dt);
  syncTouchControls();
  canvas.dataset.playerX = player.position.x.toFixed(3);
  canvas.dataset.playerZ = player.position.z.toFixed(3);
  canvas.dataset.playerState = state;
  canvas.dataset.cueScaleZ = player.cueGroup.scale.z.toFixed(3);
  canvas.dataset.insideTable = String(
    isInsideBlock(player.position, TABLE_BLOCK_X, TABLE_BLOCK_Z),
  );

  const guestOnline = multiplayer.isGuest() && multiplayer.isOnline();

  // Guests predict the same shot locally. The host remains authoritative for
  // pockets/rules and periodically reconciles the simulated positions.
  if (!guestOnline || guestPredictionActive) {
    physics.step(dt, {
      beforeWorldStep: () => probe.cacheVelocities(),
    });
    if (!guestOnline) checkPockets();

    for (const ball of balls) {
      if (ball.pocketed) continue;
      ball.mesh.position.copy(ball.body.position);
      ball.mesh.quaternion.copy(ball.body.quaternion);
    }
  } else {
    // Keep mesh in sync if body was written by snapshot
    for (const ball of balls) {
      if (ball.pocketed) continue;
      ball.mesh.position.copy(ball.body.position);
      ball.mesh.quaternion.copy(ball.body.quaternion);
    }
  }

  probe.update(dt);
  updatePowerParticles(dt);
  // Recompute when aim changes during teach (slider already forces update)
  if (teachLab.isActive()) updateTeachPrediction(dt);

  if (state === State.SIMULATING && !guestOnline) {
    if (physics.allBallsSettled()) {
      settleFrames++;
      if (settleFrames > 12) {
        settleFrames = 0;
        afterShotSettled();
      }
    } else {
      settleFrames = 0;
    }
  }

  multiplayer.tick(dt, { simulating: state === State.SIMULATING && multiplayer.isHost() });

  // Remote avatar
  const remote = multiplayer.getRemotePlayer?.();
  if (remote && remotePose.hasData) {
    const lx = THREE.MathUtils.damp(remote.position.x, remotePose.x, 14, dt);
    const lz = THREE.MathUtils.damp(remote.position.z, remotePose.z, 14, dt);
    remote.setPosition(lx, lz);
    remote.setYaw(remotePose.yaw, false, dt);
    // `simulating` lasts for the entire ball roll. Keep the peer in its
    // post-stroke watch pose, but never solve the rig against the moving ball.
    const freshPose = performance.now() - remotePose.receivedAt < 750;
    const wireState = freshPose ? remotePose.visualState : 'idle';
    const vs = wireState === 'simulating'
      ? 'watch'
      : ['walk', 'snap', 'aim', 'charge', 'stroke'].includes(wireState)
        ? wireState
        : 'idle';
    const aimingRemote = ['aim', 'charge', 'stroke', 'watch'].includes(vs);
    if (aimingRemote) {
      if (vs === 'aim' || vs === 'charge') {
        // Cache the cue-ball position while the peer is aiming. Once the shot
        // starts the ball moves, while the avatar/cue must stay at contact.
        remoteAimAnchor.copy(cueBall.mesh.position);
        remoteAimAnchorReady = true;
      } else if (!remoteAimAnchorReady) {
        const fallbackDirection = getAimDirection(remotePose.aimAngle);
        remoteAimAnchor.set(
          remote.position.x + fallbackDirection.x * 0.62,
          hall.floorY + BALL_Y,
          remote.position.z + fallbackDirection.z * 0.62,
        );
        remoteAimAnchorReady = true;
      }
    } else {
      // Do not carry a previous shot's contact point into a later session or
      // into a packet sequence where the initial aim sample was missed.
      remoteAimAnchorReady = false;
    }
    const remoteShotDirection = aimingRemote
      ? getAimDirection(remotePose.aimAngle)
      : null;
    remote.update({
      dt,
      state: vs,
      moveSpeed: vs === 'walk' ? WALK_SPEED : vs === 'snap' ? SNAP_SPEED : 0,
      pull: vs === 'charge' || vs === 'stroke' ? (remotePose.pull || remotePose.power || 0) : 0,
      ballPos: aimingRemote ? remoteAimAnchor : null,
      shotDirection: remoteShotDirection,
      aimDepth: aimingRemote ? remotePose.aimDepth || 0 : 0,
    });
  }

  const walkingKeys = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']
    .some((key) => keys.has(key));
  const isTouchWalking = touchStick.magnitude > 0 && (state === State.FREE || state === State.SIMULATING);
  // After the stroke, WASD releases the frozen aim pose so the body can walk freely.
  if (state === State.SIMULATING && (walkingKeys || isTouchWalking)) freeRoamAfterShot = true;
  const freeAfterShot = state === State.SIMULATING && freeRoamAfterShot;
  const aiming = state === State.AIMING || state === State.CHARGING || state === State.STRIKING || state === State.SNAPPING
    || (state === State.SIMULATING && !freeAfterShot);
  const showGuides = state === State.AIMING || state === State.CHARGING;
  const pull = state === State.CHARGING ? power : 0;
  const ballAnchor = state === State.SIMULATING ? cueFreezePos : cueBall.mesh.position;
  // Avatar holds the stick mesh; CueController only drives aim guides / impulse math.
  cue.group.visible = aiming;
  cue.setGuidesVisible(showGuides);
  if (aiming || showGuides) cue.update(ballAnchor, pull, dt);

  const visualState = state === State.FREE || freeAfterShot
    ? (walkingKeys || isTouchWalking ? 'walk' : 'idle')
    : state === State.SNAPPING ? 'snap'
      : state === State.AIMING ? 'aim'
        : state === State.CHARGING ? 'charge'
          : state === State.STRIKING ? 'stroke'
          : state === State.SIMULATING ? 'simulating' : 'idle';
  lastVisualState = visualState;
  player.update({
    dt,
    state: visualState,
    moveSpeed: state === State.SNAPPING
      ? SNAP_SPEED
      : (walkingKeys || isTouchWalking) && (state === State.FREE || state === State.SIMULATING) ? WALK_SPEED : 0,
    pull,
    ballPos: freeAfterShot ? null : ballAnchor,
    shotDirection: freeAfterShot ? null : cue.getShotDirection(),
    aimDepth: aimDepthOffset,
  });

  updateCueStrikeContact();

  updateThirdPersonCamera(dt);
  renderer.render(scene, camera);
}

cue.update(cueBall.mesh.position, 0);
player.update({
  ballPos: cueBall.mesh.position,
  shotDirection: cue.getShotDirection(),
  aimDepth: aimDepthOffset,
  state: 'idle',
  moveSpeed: 0,
  pull: 0,
  dt: 0.016,
});
setPowerUI(0);
setStatus('自由移动 — WASD 行走 · 靠近球桌按 E');
canvas.focus();
animate();
