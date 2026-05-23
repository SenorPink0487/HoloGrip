import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { cn } from '../lib/utils';
import { useARStore } from '../store';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  Plus, Trash2, Sliders, RotateCcw,
  Keyboard, Box, Grid, Play, Pause,
  ChevronLeft, ChevronRight, Hammer, ListMusic, Compass,
  Eye, EyeOff, Sigma, AlertCircle, Crosshair
} from 'lucide-react';
import { tryCompile, CompiledExpression } from '../lib/mathExpression';
import { MathKeyboard } from './MathKeyboard';

// ============================================================
// Types
// ============================================================

export type Geo3DKind = 'surface' | 'point' | 'line' | 'sphere' | 'cylinder' | 'cone' | 'plane' | 'slider';

export interface BaseGeo3D {
  id: string;
  kind: Geo3DKind;
  name: string;
  visible: boolean;
  color: string;
}

export interface Surface3D extends BaseGeo3D {
  kind: 'surface';
  source: string;
  compiled: CompiledExpression | null;
  error: string | null;
}

export interface Point3D extends BaseGeo3D {
  kind: 'point';
  xExpr: string;
  yExpr: string;
  zExpr: string;
}

export interface Line3D extends BaseGeo3D {
  kind: 'line';
  p1: string;
  p2: string;
}

export interface Sphere3D extends BaseGeo3D {
  kind: 'sphere';
  center: string;
  radiusExpr: string;
}

export interface Cylinder3D extends BaseGeo3D {
  kind: 'cylinder';
  center: string;
  radiusExpr: string;
  heightExpr: string;
}

export interface Cone3D extends BaseGeo3D {
  kind: 'cone';
  center: string;
  radiusExpr: string;
  heightExpr: string;
}

export interface Plane3D extends BaseGeo3D {
  kind: 'plane';
  // ax + by + cz = d
  aExpr: string;
  bExpr: string;
  cExpr: string;
  dExpr: string;
}

export interface Slider3D extends BaseGeo3D {
  kind: 'slider';
  value: number;
  min: number;
  max: number;
  step: number;
}

export type Geo3DObject =
  | Surface3D | Point3D | Line3D | Sphere3D
  | Cylinder3D | Cone3D | Plane3D | Slider3D;

interface Vector3Val { x: number; y: number; z: number }

// ============================================================
// Constants
// ============================================================

const COLORS = [
  '#22d3ee', // cyan
  '#f472b6', // pink
  '#a78bfa', // violet
  '#fbbf24', // amber
  '#34d399', // emerald
  '#fb923c', // orange
  '#60a5fa', // blue
  '#f87171', // red
];

const SURFACE_RANGE = 5;       // x,y in [-5, 5]
const SURFACE_SEGMENTS = 80;   // mesh resolution
const Z_CLAMP = 8;             // clamp surface z to ±8 to avoid runaway

// ============================================================
// Helpers
// ============================================================

function nextName(pool: string[], used: Set<string>): string {
  for (const c of pool) if (!used.has(c)) return c;
  let i = 1;
  while (true) {
    for (const c of pool) {
      const cand = `${c}${i}`;
      if (!used.has(cand)) return cand;
    }
    i++;
  }
}

function evaluateExpr(expr: string, scope: Record<string, number>, fallback = 0): number {
  if (!expr) return fallback;
  // Try plain number first
  const n = Number(expr);
  if (Number.isFinite(n)) return n;
  const c = tryCompile(expr);
  if (!c) return fallback;
  try {
    const v = c.evaluate(scope);
    return Number.isFinite(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Resolve a vector spec like "A" (point reference) or "1, 2, 3" (literal coords) or "a, b+1, 0" (expressions).
 */
function parseVec(spec: string, scope: Record<string, number>, points: Record<string, Vector3Val>): Vector3Val {
  const s = spec.trim();
  if (!s) return { x: 0, y: 0, z: 0 };
  // Point reference
  if (points[s]) return points[s];
  // Comma-separated
  if (s.includes(',')) {
    const parts = s.split(',').map(p => p.trim());
    return {
      x: evaluateExpr(parts[0] ?? '0', scope, 0),
      y: evaluateExpr(parts[1] ?? '0', scope, 0),
      z: evaluateExpr(parts[2] ?? '0', scope, 0),
    };
  }
  // Single expression -> treat as x only
  const v = evaluateExpr(s, scope, 0);
  return { x: v, y: 0, z: 0 };
}

/**
 * 把 ASCII 表达式美化为更接近教科书的数学符号显示。
 * 与 FunctionExplorer.prettifyExpression 保持一致:
 *  - "*"  →  "·"     (中圆点)
 *  - "/"  →  "÷"     (除号)
 *  - "-"  →  "−"     (Unicode 减号, 视觉一致)
 *  - "^2" →  "²", "^3" → "³", 字母/数字幂均能转上标
 *  - "sqrt(...)" → "√(...)"
 *  - "abs(x)"    → "|x|"
 *  - "pi"        → "π"
 */
function prettyFormula(src: string): string {
  if (!src) return '';
  let s = src;

  // sqrt(...) → √(...)
  s = s.replace(/\bsqrt\s*\(/g, '√(');
  // abs(...) → |...| (一层不嵌套)
  s = s.replace(/\babs\s*\(([^()]*)\)/g, '|$1|');
  // pi → π
  s = s.replace(/\bpi\b/g, 'π');

  // 上标转换表
  const SUPS: Record<string, string> = {
    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
    '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
    '+': '⁺', '-': '⁻', '(': '⁽', ')': '⁾',
    'a': 'ᵃ', 'b': 'ᵇ', 'c': 'ᶜ', 'd': 'ᵈ', 'e': 'ᵉ',
    'f': 'ᶠ', 'g': 'ᵍ', 'h': 'ʰ', 'i': 'ⁱ', 'j': 'ʲ',
    'k': 'ᵏ', 'l': 'ˡ', 'm': 'ᵐ', 'n': 'ⁿ', 'o': 'ᵒ',
    'p': 'ᵖ', 'r': 'ʳ', 's': 'ˢ', 't': 'ᵗ', 'u': 'ᵘ',
    'v': 'ᵛ', 'w': 'ʷ', 'x': 'ˣ', 'y': 'ʸ', 'z': 'ᶻ',
  };

  /** 把一段字符串尝试转为上标; 任何字符无法转就返回 null */
  const toSup = (str: string): string | null => {
    let out = '';
    for (const ch of str) {
      if (ch in SUPS) out += SUPS[ch];
      else if (ch === ' ') out += ' ';
      else return null;
    }
    return out;
  };

  // ^(...) 整组括号转上标 (仅当能完整转成功时使用)
  s = s.replace(/\^\(([^()]+)\)/g, (m, inner: string) => {
    const conv = toSup(inner);
    return conv !== null ? conv : m;
  });
  // ^单字符 (数字或字母或正负号)
  s = s.replace(/\^([0-9a-zA-Z+\-])/g, (m, ch: string) => SUPS[ch] ?? m);

  // * → ·
  s = s.replace(/\s*\*\s*/g, '·');
  // / → ÷ (两侧加空格)
  s = s.replace(/\s*\/\s*/g, ' ÷ ');
  // 全部 - → −  (Unicode minus, 视觉一致)
  s = s.replace(/-/g, '−');
  return s;
}

// ============================================================
// Three.js scene controller (decoupled from React render cycles)
// ============================================================

interface SceneRefs {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  /** Group containing user-added objects (so we can clear and rebuild) */
  contentGroup: THREE.Group;
  /** Group with axes/grid (toggleable) */
  axesGroup: THREE.Group;
  gridGroup: THREE.Group;
  /** RAF id, so we can cancel on unmount */
  rafId: number;
}

/** Build text sprite for axis labels (lightweight, no font loading) */
function makeTextSprite(text: string, color: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.fillRect(0, 0, 128, 128);
  ctx.font = 'bold 80px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Soft glow
  ctx.shadowColor = color;
  ctx.shadowBlur = 20;
  ctx.fillStyle = color;
  ctx.fillText(text, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.7, 0.7, 1);
  return sprite;
}

/** Build axis arrow (line + cone tip) */
function buildAxis(direction: 'x' | 'y' | 'z', length: number, color: string): THREE.Group {
  const g = new THREE.Group();
  const dir = new THREE.Vector3(
    direction === 'x' ? 1 : 0,
    direction === 'y' ? 1 : 0,
    direction === 'z' ? 1 : 0,
  );
  const lineGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    dir.clone().multiplyScalar(length),
  ]);
  const lineMat = new THREE.LineBasicMaterial({ color });
  const line = new THREE.Line(lineGeo, lineMat);
  g.add(line);

  // Tip
  const coneGeo = new THREE.ConeGeometry(0.08, 0.25, 16);
  const coneMat = new THREE.MeshBasicMaterial({ color });
  const cone = new THREE.Mesh(coneGeo, coneMat);
  cone.position.copy(dir.clone().multiplyScalar(length));
  if (direction === 'x') cone.rotation.z = -Math.PI / 2;
  else if (direction === 'z') cone.rotation.x = Math.PI / 2;
  g.add(cone);

  // Label
  const label = makeTextSprite(direction.toUpperCase(), color);
  label.position.copy(dir.clone().multiplyScalar(length + 0.5));
  g.add(label);

  return g;
}

/** Build a grid centered on origin in the XY plane (z=0) */
function buildGroundGrid(size: number, divisions: number, isDark: boolean): THREE.GridHelper {
  const main = isDark ? 0x444444 : 0xbbbbbb;
  const sub = isDark ? 0x2a2a2a : 0xdddddd;
  const grid = new THREE.GridHelper(size * 2, divisions, main, sub);
  // GridHelper is XZ plane by default; rotate so it sits in XY plane (z=0 in math coords).
  // Our convention: math (x, y, z) maps to three (x, z, y) — i.e., math-z is up.
  // GridHelper at y=0 in three coordinates IS our math-z=0 plane, so no rotation needed.
  return grid;
}

// ============================================================
// Object builders (each returns a THREE.Object3D ready to add to scene)
// Math coords (x, y, z): x right, y forward, z up.
// Three coords map: threeX = x, threeY = z, threeZ = y.
// ============================================================

function mathToThree(p: Vector3Val): THREE.Vector3 {
  return new THREE.Vector3(p.x, p.z, p.y);
}

function buildSurface(
  surf: Surface3D,
  scope: Record<string, number>
): THREE.Object3D | null {
  if (!surf.compiled) return null;
  const compiled = surf.compiled;
  const geo = new THREE.PlaneGeometry(
    SURFACE_RANGE * 2,
    SURFACE_RANGE * 2,
    SURFACE_SEGMENTS,
    SURFACE_SEGMENTS
  );
  // PlaneGeometry is in XY plane with Z out (in three coords).
  // We want the plane in math-XY plane (i.e., three's XZ plane), then displace along three-Y by f(x,y).
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const yMath = pos.getY(i); // currently in plane's own Y axis
    let z = NaN;
    try {
      z = compiled.evaluate({ ...scope, x, y: yMath });
    } catch {
      z = NaN;
    }
    if (!Number.isFinite(z)) z = 0;
    z = Math.max(-Z_CLAMP, Math.min(Z_CLAMP, z));
    // Reassign so plane lies in three's XZ plane with displacement along three-Y
    pos.setXYZ(i, x, z, yMath);
  }
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    color: surf.color,
    metalness: 0.15,
    roughness: 0.55,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.92,
    flatShading: false,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildPoint(name: string, pos: Vector3Val, color: string, isDark: boolean): THREE.Object3D {
  const g = new THREE.Group();
  // Glowing sphere
  const sphereGeo = new THREE.SphereGeometry(0.13, 24, 24);
  const sphereMat = new THREE.MeshStandardMaterial({
    color,
    emissive: new THREE.Color(color),
    emissiveIntensity: 0.6,
    metalness: 0.3,
    roughness: 0.3,
  });
  const sphere = new THREE.Mesh(sphereGeo, sphereMat);
  sphere.position.copy(mathToThree(pos));
  g.add(sphere);

  // Label sprite
  const lbl = makeTextSprite(name, isDark ? '#ffffff' : '#222222');
  lbl.position.copy(mathToThree(pos)).add(new THREE.Vector3(0.25, 0.3, 0));
  lbl.scale.set(0.55, 0.55, 1);
  g.add(lbl);
  return g;
}

function buildLine(p1: Vector3Val, p2: Vector3Val, color: string): THREE.Object3D {
  const a = mathToThree(p1);
  const b = mathToThree(p2);
  const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
  const mat = new THREE.LineBasicMaterial({ color, linewidth: 2 });
  return new THREE.Line(geo, mat);
}

function buildSphere(center: Vector3Val, radius: number, color: string): THREE.Object3D | null {
  if (radius <= 0) return null;
  const geo = new THREE.SphereGeometry(radius, 36, 28);
  const mat = new THREE.MeshStandardMaterial({
    color,
    metalness: 0.25,
    roughness: 0.4,
    transparent: true,
    opacity: 0.7,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(mathToThree(center));

  // wireframe overlay
  const wfMat = new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.2 });
  const wf = new THREE.Mesh(geo.clone(), wfMat);
  mesh.add(wf);

  return mesh;
}

function buildCylinder(center: Vector3Val, radius: number, height: number, color: string): THREE.Object3D | null {
  if (radius <= 0 || height <= 0) return null;
  const geo = new THREE.CylinderGeometry(radius, radius, height, 36, 1, false);
  const mat = new THREE.MeshStandardMaterial({
    color,
    metalness: 0.25,
    roughness: 0.4,
    transparent: true,
    opacity: 0.7,
  });
  const mesh = new THREE.Mesh(geo, mat);
  // Cylinder is along three-Y by default; we want it standing on math-z (which IS three-Y), perfect.
  mesh.position.copy(mathToThree(center)).add(new THREE.Vector3(0, height / 2, 0));
  return mesh;
}

function buildCone(center: Vector3Val, radius: number, height: number, color: string): THREE.Object3D | null {
  if (radius <= 0 || height <= 0) return null;
  const geo = new THREE.ConeGeometry(radius, height, 36, 1, false);
  const mat = new THREE.MeshStandardMaterial({
    color,
    metalness: 0.25,
    roughness: 0.4,
    transparent: true,
    opacity: 0.7,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(mathToThree(center)).add(new THREE.Vector3(0, height / 2, 0));
  return mesh;
}

function buildPlane(a: number, b: number, c: number, d: number, color: string): THREE.Object3D | null {
  if (a === 0 && b === 0 && c === 0) return null;
  const normal = new THREE.Vector3(a, c, b).normalize(); // remember math (x,y,z) -> three (x,z,y)
  const geo = new THREE.PlaneGeometry(14, 14);
  const mat = new THREE.MeshStandardMaterial({
    color,
    metalness: 0.1,
    roughness: 0.6,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.4,
  });
  const mesh = new THREE.Mesh(geo, mat);
  // Position: any point on plane. d / |n|^2 * n.
  const denom = a * a + b * b + c * c;
  if (denom > 1e-9) {
    const k = d / denom;
    mesh.position.set(a * k, c * k, b * k); // math -> three remap
  }
  // Orient: align plane normal (default +Z in three) with our normal vector
  mesh.lookAt(mesh.position.clone().add(normal));
  return mesh;
}

// ============================================================
// Main Calculator3D Component
// ============================================================

export function Calculator3D() {
  const theme = useARStore((state) => state.theme);
  const isDark = theme === 'dark';

  // Sidebar state
  const [activeSidebarTab, setActiveSidebarTab] = useState<'algebra' | 'tools'>('algebra');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Initial demo objects
  const [objects, setObjects] = useState<Geo3DObject[]>(() => {
    const slA: Slider3D = { id: 'sl_a', kind: 'slider', name: 'a', visible: true, color: COLORS[0], value: 2, min: -5, max: 5, step: 0.1 };
    const slB: Slider3D = { id: 'sl_b', kind: 'slider', name: 'b', visible: true, color: COLORS[1], value: 1, min: -5, max: 5, step: 0.1 };
    const fSrc = 'a*cos(sqrt(x^2 + y^2)) - b';
    const surface: Surface3D = {
      id: 'surf_1', kind: 'surface', name: 'z', visible: true, color: COLORS[4],
      source: fSrc, compiled: tryCompile(fSrc), error: null,
    };
    return [slA, slB, surface];
  });

  // UI state
  const [showAxes, setShowAxes] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [autoRotate, setAutoRotate] = useState(false);

  // Inputs
  const [inputValue, setInputValue] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Editing in-place
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  // Virtual keyboard
  type KeyboardTarget = 'main' | { type: 'edit'; id: string };
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [keyboardTarget, setKeyboardTarget] = useState<KeyboardTarget>('main');

  // Tool form inputs
  const [toolInputs, setToolInputs] = useState({
    point: { name: '', x: '0', y: '0', z: '1' },
    line: { name: '', p1: 'A', p2: 'B' },
    sphere: { name: '', center: 'A', radius: '2' },
    cylinder: { name: '', center: 'A', radius: '1', height: '3' },
    cone: { name: '', center: 'A', radius: '1.2', height: '2.5' },
    plane: { name: '', a: '1', b: '1', c: '1', d: '2' },
  });

  // ---------- Derived ----------
  const scope = useMemo(() => {
    const s: Record<string, number> = {};
    objects.forEach(o => { if (o.kind === 'slider') s[o.name] = o.value; });
    return s;
  }, [objects]);

  const evaluatedPoints = useMemo(() => {
    const pts: Record<string, Vector3Val> = {};
    objects.forEach(o => {
      if (o.kind === 'point' && o.visible) {
        pts[o.name] = {
          x: evaluateExpr(o.xExpr, scope, 0),
          y: evaluateExpr(o.yExpr, scope, 0),
          z: evaluateExpr(o.zExpr, scope, 0),
        };
      }
    });
    return pts;
  }, [objects, scope]);

  const usedNames = useMemo(() => new Set(objects.map(o => o.name)), [objects]);

  // ---------- Object operations ----------
  const updateObject = useCallback((id: string, patch: Partial<Geo3DObject>) => {
    setObjects(prev => prev.map(o => o.id === id ? { ...o, ...patch } as Geo3DObject : o));
  }, []);

  const deleteObject = useCallback((id: string) => {
    setObjects(prev => prev.filter(o => o.id !== id));
  }, []);

  const updateSurfaceSource = useCallback((id: string, newSrc: string) => {
    const compiled = tryCompile(newSrc);
    setObjects(prev => prev.map(o => {
      if (o.id !== id || o.kind !== 'surface') return o;
      return { ...o, source: newSrc, compiled, error: compiled ? null : '语法错误' };
    }));
    if (compiled) {
      const missing = compiled.variables.filter(v => v !== 'x' && v !== 'y' && !objects.some(o => o.name === v));
      if (missing.length) {
        const newSliders: Slider3D[] = missing.map((v, i) => ({
          id: `sl_${Date.now()}_${i}`, kind: 'slider', name: v,
          visible: true, color: COLORS[(objects.length + i) % COLORS.length],
          value: 1, min: -5, max: 5, step: 0.1,
        }));
        setObjects(prev => [...newSliders, ...prev]);
      }
    }
  }, [objects]);

  const handleAddFromInput = useCallback(() => {
    const raw = inputValue.trim();
    if (!raw) return;
    setInputError(null);

    // Pattern: name = number  (slider)
    const slMatch = raw.match(/^([a-zA-Z]\w*)\s*=\s*(-?\d*\.?\d+)$/);
    if (slMatch) {
      const name = slMatch[1];
      const value = parseFloat(slMatch[2]);
      if (usedNames.has(name)) {
        setObjects(prev => prev.map(o => o.kind === 'slider' && o.name === name ? { ...o, value } : o));
      } else {
        const newSl: Slider3D = {
          id: `sl_${Date.now()}`, kind: 'slider', name, visible: true,
          color: COLORS[objects.length % COLORS.length],
          value, min: Math.min(-5, value - 5), max: Math.max(5, value + 5), step: 0.1,
        };
        setObjects(prev => [newSl, ...prev]);
      }
      setInputValue('');
      return;
    }

    // Pattern: z = expr  (surface)
    const surfMatch = raw.match(/^z\s*=\s*(.+)$/i);
    const body = surfMatch ? surfMatch[1] : raw;
    const compiled = tryCompile(body);
    if (!compiled) {
      setInputError('表达式语法错误');
      return;
    }

    const surfaceCount = objects.filter(o => o.kind === 'surface').length;
    const name = surfaceCount === 0 ? 'z' : `z${surfaceCount + 1}`;
    const newSurf: Surface3D = {
      id: `surf_${Date.now()}`, kind: 'surface', name, visible: true,
      color: COLORS[(objects.length) % COLORS.length],
      source: body, compiled, error: null,
    };
    // Auto-create missing sliders
    const missing = compiled.variables.filter(v => v !== 'x' && v !== 'y' && !objects.some(o => o.name === v));
    const newSliders: Slider3D[] = missing.map((v, i) => ({
      id: `sl_${Date.now()}_${i}`, kind: 'slider', name: v, visible: true,
      color: COLORS[(objects.length + i) % COLORS.length],
      value: 1, min: -5, max: 5, step: 0.1,
    }));
    setObjects(prev => [...newSliders, newSurf, ...prev]);
    setInputValue('');
  }, [inputValue, objects, usedNames]);

  // ---------- Tool form actions ----------
  const addPointVisual = () => {
    const { name, x, y, z } = toolInputs.point;
    const ptName = name.trim() || nextName('ABCDEFGHIJKLMNOPQRST'.split(''), usedNames);
    if (usedNames.has(ptName)) { alert(`名称 "${ptName}" 已占用`); return; }
    const newPt: Point3D = {
      id: `pt_${Date.now()}`, kind: 'point', name: ptName, visible: true,
      color: COLORS[objects.length % COLORS.length],
      xExpr: x, yExpr: y, zExpr: z,
    };
    setObjects(prev => [...prev, newPt]);
    setToolInputs(prev => ({ ...prev, point: { ...prev.point, name: '' } }));
  };

  const addLineVisual = () => {
    const { name, p1, p2 } = toolInputs.line;
    const lname = name.trim() || nextName('fghkpqrs'.split(''), usedNames);
    if (usedNames.has(lname)) { alert(`名称 "${lname}" 已占用`); return; }
    const newLn: Line3D = {
      id: `ln_${Date.now()}`, kind: 'line', name: lname, visible: true,
      color: COLORS[objects.length % COLORS.length], p1, p2,
    };
    setObjects(prev => [...prev, newLn]);
    setToolInputs(prev => ({ ...prev, line: { ...prev.line, name: '' } }));
  };

  const addSphereVisual = () => {
    const { name, center, radius } = toolInputs.sphere;
    const sname = name.trim() || nextName('SPQ'.split(''), usedNames);
    if (usedNames.has(sname)) { alert(`名称 "${sname}" 已占用`); return; }
    const newSp: Sphere3D = {
      id: `sp_${Date.now()}`, kind: 'sphere', name: sname, visible: true,
      color: COLORS[objects.length % COLORS.length],
      center, radiusExpr: radius,
    };
    setObjects(prev => [...prev, newSp]);
    setToolInputs(prev => ({ ...prev, sphere: { ...prev.sphere, name: '' } }));
  };

  const addCylinderVisual = () => {
    const { name, center, radius, height } = toolInputs.cylinder;
    const cname = name.trim() || nextName('CDE'.split(''), usedNames);
    if (usedNames.has(cname)) { alert(`名称 "${cname}" 已占用`); return; }
    const newCy: Cylinder3D = {
      id: `cy_${Date.now()}`, kind: 'cylinder', name: cname, visible: true,
      color: COLORS[objects.length % COLORS.length],
      center, radiusExpr: radius, heightExpr: height,
    };
    setObjects(prev => [...prev, newCy]);
    setToolInputs(prev => ({ ...prev, cylinder: { ...prev.cylinder, name: '' } }));
  };

  const addConeVisual = () => {
    const { name, center, radius, height } = toolInputs.cone;
    const cname = name.trim() || nextName('TUV'.split(''), usedNames);
    if (usedNames.has(cname)) { alert(`名称 "${cname}" 已占用`); return; }
    const newCn: Cone3D = {
      id: `cn_${Date.now()}`, kind: 'cone', name: cname, visible: true,
      color: COLORS[objects.length % COLORS.length],
      center, radiusExpr: radius, heightExpr: height,
    };
    setObjects(prev => [...prev, newCn]);
    setToolInputs(prev => ({ ...prev, cone: { ...prev.cone, name: '' } }));
  };

  const addPlaneVisual = () => {
    const { name, a, b, c, d } = toolInputs.plane;
    const pname = name.trim() || nextName('αβγδε'.split(''), usedNames);
    if (usedNames.has(pname)) { alert(`名称 "${pname}" 已占用`); return; }
    const newPl: Plane3D = {
      id: `pl_${Date.now()}`, kind: 'plane', name: pname, visible: true,
      color: COLORS[objects.length % COLORS.length],
      aExpr: a, bExpr: b, cExpr: c, dExpr: d,
    };
    setObjects(prev => [...prev, newPl]);
    setToolInputs(prev => ({ ...prev, plane: { ...prev.plane, name: '' } }));
  };

  // ---------- Reset ----------
  const sceneRef = useRef<SceneRefs | null>(null);

  const resetAll = () => {
    setObjects(() => {
      const slA: Slider3D = { id: 'sl_a', kind: 'slider', name: 'a', visible: true, color: COLORS[0], value: 2, min: -5, max: 5, step: 0.1 };
      const slB: Slider3D = { id: 'sl_b', kind: 'slider', name: 'b', visible: true, color: COLORS[1], value: 1, min: -5, max: 5, step: 0.1 };
      const fSrc = 'a*cos(sqrt(x^2 + y^2)) - b';
      const surface: Surface3D = {
        id: 'surf_1', kind: 'surface', name: 'z', visible: true, color: COLORS[4],
        source: fSrc, compiled: tryCompile(fSrc), error: null,
      };
      return [slA, slB, surface];
    });
    setAutoRotate(false);
    // 重置后允许自动居中视角
    userInteractedRef.current = false;
    if (sceneRef.current) {
      sceneRef.current.controls.reset();
    }
  };

  // ---------- Math keyboard helpers ----------
  const insertAtCursor = useCallback((text: string, opts?: { caretOffset?: number }) => {
    const target = keyboardTarget === 'main' ? inputRef.current : editInputRef.current;
    if (!target) return;
    const start = target.selectionStart ?? target.value.length;
    const end = target.selectionEnd ?? target.value.length;
    const before = target.value.slice(0, start);
    const after = target.value.slice(end);
    const newVal = before + text + after;
    const newCaret = start + text.length + (opts?.caretOffset ?? 0);
    if (keyboardTarget === 'main') { setInputValue(newVal); setInputError(null); }
    else { setEditingValue(newVal); }
    requestAnimationFrame(() => {
      target.focus();
      try { target.setSelectionRange(newCaret, newCaret); } catch {}
    });
  }, [keyboardTarget]);

  const handleBackspace = useCallback(() => {
    const target = keyboardTarget === 'main' ? inputRef.current : editInputRef.current;
    if (!target) return;
    const start = target.selectionStart ?? 0;
    const end = target.selectionEnd ?? 0;
    let newVal: string; let newCaret: number;
    if (start !== end) { newVal = target.value.slice(0, start) + target.value.slice(end); newCaret = start; }
    else if (start > 0) { newVal = target.value.slice(0, start - 1) + target.value.slice(start); newCaret = start - 1; }
    else return;
    if (keyboardTarget === 'main') { setInputValue(newVal); setInputError(null); }
    else { setEditingValue(newVal); }
    requestAnimationFrame(() => {
      target.focus();
      try { target.setSelectionRange(newCaret, newCaret); } catch {}
    });
  }, [keyboardTarget]);

  const handleArrow = useCallback((dir: 'left' | 'right') => {
    const target = keyboardTarget === 'main' ? inputRef.current : editInputRef.current;
    if (!target) return;
    const pos = target.selectionStart ?? 0;
    const newPos = dir === 'left' ? Math.max(0, pos - 1) : Math.min(target.value.length, pos + 1);
    target.focus();
    try { target.setSelectionRange(newPos, newPos); } catch {}
  }, [keyboardTarget]);

  // ============================================================
  // Three.js scene lifecycle
  // ============================================================
  const containerRef = useRef<HTMLDivElement>(null);

  /** 用户是否已开始交互(拖拽/缩放),用于决定是否还允许自动居中视角 */
  const userInteractedRef = useRef(false);

  // Init scene once (renderer, camera, lights, controls)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = null; // transparent so CSS bg shows

    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 200);
    // 等距视角:相机略往后并向下俯视,使模型居中
    camera.position.set(10, 8, 10);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    container.appendChild(renderer.domElement);

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(10, 12, 8);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    scene.add(dir);
    const fill = new THREE.DirectionalLight(0x88aaff, 0.4);
    fill.position.set(-8, 5, -6);
    scene.add(fill);

    // Axes
    const axesGroup = new THREE.Group();
    axesGroup.add(buildAxis('x', 5, '#ef4444'));   // red x
    axesGroup.add(buildAxis('y', 5, '#22c55e'));   // green y
    axesGroup.add(buildAxis('z', 5, '#3b82f6'));   // blue z
    scene.add(axesGroup);

    // Grid
    const gridGroup = new THREE.Group();
    gridGroup.add(buildGroundGrid(5, 20, isDark));
    scene.add(gridGroup);

    // Content group (user objects rebuilt here)
    const contentGroup = new THREE.Group();
    scene.add(contentGroup);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 2;
    controls.maxDistance = 40;
    controls.target.set(0, 0, 0);
    controls.saveState();

    // 一旦用户开始交互(拖动旋转/缩放),停止自动 recenter
    const markInteracted = () => { userInteractedRef.current = true; };
    controls.addEventListener('start', markInteracted);

    let rafId = 0;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      rafId = requestAnimationFrame(animate);
    };
    rafId = requestAnimationFrame(animate);

    sceneRef.current = { scene, camera, renderer, controls, contentGroup, axesGroup, gridGroup, rafId };

    // Resize handling via ResizeObserver (robust to sidebar collapse, layout changes)
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width <= 0 || height <= 0) continue;
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      }
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(rafId);
      controls.removeEventListener('start', markInteracted);
      controls.dispose();
      // Dispose all geometries/materials
      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry?.dispose?.();
        const mat = (obj as THREE.Mesh).material;
        if (Array.isArray(mat)) mat.forEach(m => m.dispose());
        else if (mat) mat.dispose();
      });
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
      sceneRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);  // mount once

  // Rebuild grid when theme changes
  useEffect(() => {
    const refs = sceneRef.current;
    if (!refs) return;
    while (refs.gridGroup.children.length > 0) {
      const c = refs.gridGroup.children[0] as THREE.Mesh;
      refs.gridGroup.remove(c);
      c.geometry?.dispose?.();
      const mm = c.material;
      if (Array.isArray(mm)) mm.forEach(m => m.dispose());
      else if (mm) (mm as THREE.Material).dispose();
    }
    refs.gridGroup.add(buildGroundGrid(5, 20, isDark));
  }, [isDark]);

  // Toggle axes/grid visibility
  useEffect(() => {
    const refs = sceneRef.current;
    if (!refs) return;
    refs.axesGroup.visible = showAxes;
  }, [showAxes]);

  useEffect(() => {
    const refs = sceneRef.current;
    if (!refs) return;
    refs.gridGroup.visible = showGrid;
  }, [showGrid]);

  // Auto rotate
  useEffect(() => {
    const refs = sceneRef.current;
    if (!refs) return;
    refs.controls.autoRotate = autoRotate;
    refs.controls.autoRotateSpeed = 1.2;
  }, [autoRotate]);

  // Rebuild content (user-added objects) whenever objects/scope/theme changes
  useEffect(() => {
    const refs = sceneRef.current;
    if (!refs) return;
    const group = refs.contentGroup;

    // Clear existing
    while (group.children.length > 0) {
      const c = group.children[0];
      group.remove(c);
      c.traverse?.((sub) => {
        const m = sub as THREE.Mesh;
        m.geometry?.dispose?.();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach(mm => mm.dispose());
        else if (mat) (mat as THREE.Material).dispose();
      });
    }

    // Rebuild
    for (const o of objects) {
      if (!o.visible) continue;
      let obj: THREE.Object3D | null = null;
      switch (o.kind) {
        case 'surface':
          obj = buildSurface(o, scope);
          break;
        case 'point': {
          const pos = evaluatedPoints[o.name] ?? {
            x: evaluateExpr(o.xExpr, scope, 0),
            y: evaluateExpr(o.yExpr, scope, 0),
            z: evaluateExpr(o.zExpr, scope, 0),
          };
          obj = buildPoint(o.name, pos, o.color, isDark);
          break;
        }
        case 'line': {
          const p1 = parseVec(o.p1, scope, evaluatedPoints);
          const p2 = parseVec(o.p2, scope, evaluatedPoints);
          obj = buildLine(p1, p2, o.color);
          break;
        }
        case 'sphere': {
          const c = parseVec(o.center, scope, evaluatedPoints);
          const r = evaluateExpr(o.radiusExpr, scope, 1);
          obj = buildSphere(c, r, o.color);
          break;
        }
        case 'cylinder': {
          const c = parseVec(o.center, scope, evaluatedPoints);
          const r = evaluateExpr(o.radiusExpr, scope, 1);
          const h = evaluateExpr(o.heightExpr, scope, 2);
          obj = buildCylinder(c, r, h, o.color);
          break;
        }
        case 'cone': {
          const c = parseVec(o.center, scope, evaluatedPoints);
          const r = evaluateExpr(o.radiusExpr, scope, 1);
          const h = evaluateExpr(o.heightExpr, scope, 2);
          obj = buildCone(c, r, h, o.color);
          break;
        }
        case 'plane': {
          const a = evaluateExpr(o.aExpr, scope, 1);
          const b = evaluateExpr(o.bExpr, scope, 1);
          const cc = evaluateExpr(o.cExpr, scope, 1);
          const d = evaluateExpr(o.dExpr, scope, 0);
          obj = buildPlane(a, b, cc, d, o.color);
          break;
        }
      }
      if (obj) group.add(obj);
    }

    // 用户尚未交互时,自动把视角中心对准模型中心,确保 3D 模型位于画面正中
    if (!userInteractedRef.current && refs) {
      const box = new THREE.Box3().setFromObject(group);
      if (!box.isEmpty()) {
        const center = new THREE.Vector3();
        box.getCenter(center);
        // 平滑地把 target 移动到中心,并相应平移相机使其朝同一方向看
        const offset = new THREE.Vector3().subVectors(refs.camera.position, refs.controls.target);
        refs.controls.target.copy(center);
        refs.camera.position.copy(center).add(offset);
        refs.controls.update();
      }
    }
  }, [objects, scope, evaluatedPoints, isDark]);

  // ============================================================
  // Preset views
  // ============================================================
  const setView = (view: 'iso' | 'top' | 'front' | 'side') => {
    const refs = sceneRef.current;
    if (!refs) return;
    const r = 14;
    // 以当前 contentGroup 的包围盒中心为视角中心,确保切换视图后模型仍居中
    const box = new THREE.Box3().setFromObject(refs.contentGroup);
    const center = new THREE.Vector3();
    if (!box.isEmpty()) box.getCenter(center);

    let pos: [number, number, number];
    switch (view) {
      case 'top':   pos = [center.x, center.y + r, center.z + 0.001]; break;     // looking down z (math up)
      case 'front': pos = [center.x, center.y + 0.001, center.z + r]; break;     // looking from +y
      case 'side':  pos = [center.x + r, center.y + 0.001, center.z]; break;     // looking from +x
      default:      pos = [center.x + 10, center.y + 8, center.z + 10];           // iso
    }
    refs.camera.position.set(...pos);
    refs.controls.target.copy(center);
    refs.controls.update();
    // 用户主动选择视图,认为这是一种 "重新对焦" 操作,后续仍允许自动 recenter
    // 但实际上用户已经点过按钮了,所以保持 userInteractedRef 当前值即可
  };

  // ============================================================
  // Render
  // ============================================================
  return (
    <div className="w-full h-full flex z-[35] relative select-none bg-gradient-to-br from-slate-50 to-slate-100 dark:from-zinc-950 dark:to-zinc-900 transition-colors duration-500 overflow-hidden">

      {/* ===== 1. Left Sidebar ===== */}
      <div
        className={cn(
          'h-full flex flex-col relative z-[36] select-none overflow-hidden border-r backdrop-blur-2xl transition-[width] duration-300',
          isDark
            ? 'border-white/10 bg-zinc-950/80 shadow-[10px_0_30px_rgba(0,0,0,0.5)]'
            : 'border-slate-200/80 bg-white/80 shadow-[10px_0_30px_rgba(0,0,0,0.05)]',
          isSidebarCollapsed ? 'w-0 border-r-0' : 'w-[400px]'
        )}
      >
        <div className="w-[400px] h-full flex flex-col shrink-0">

          {/* --- Header tabs --- */}
          <div className="flex items-center justify-between p-4 border-b border-black/5 dark:border-white/10 shrink-0">
            <div className="flex gap-1.5 p-1 rounded-xl bg-black/5 dark:bg-white/5 w-full">
              <button
                onClick={() => setActiveSidebarTab('algebra')}
                className={cn(
                  "flex-1 py-1.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                  activeSidebarTab === 'algebra'
                    ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm"
                    : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                )}
              >
                <ListMusic className="w-3.5 h-3.5" />
                <span>代数视图</span>
              </button>
              <button
                onClick={() => setActiveSidebarTab('tools')}
                className={cn(
                  "flex-1 py-1.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                  activeSidebarTab === 'tools'
                    ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm"
                    : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                )}
              >
                <Hammer className="w-3.5 h-3.5" />
                <span>几何建模</span>
              </button>
            </div>
          </div>

          {/* --- Dynamic content (scroll area) --- */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">

            {/* === TAB: ALGEBRA === */}
            {activeSidebarTab === 'algebra' && (
              <>
                {/* 表达式输入条 (FunctionExplorer 风格) */}
                <div className="flex flex-col gap-1.5">
                  <div className={cn(
                    'flex items-center gap-2.5 px-4 py-3 rounded-xl border transition-all duration-300',
                    isDark ? 'bg-zinc-900/50 border-white/10' : 'bg-slate-100/70 border-slate-200',
                    inputError
                      ? 'border-red-500/50 focus-within:border-red-500/80 focus-within:shadow-[0_0_0_3px_rgba(239,68,68,0.15)]'
                      : 'focus-within:border-cyan-500 focus-within:shadow-[0_0_0_3px_rgba(6,182,212,0.15)]'
                  )}>
                    <Sigma className="w-5 h-5 text-cyan-500 dark:text-cyan-400 shrink-0" />
                    <input
                      ref={inputRef}
                      type="text"
                      value={inputValue}
                      onChange={(e) => { setInputValue(e.target.value); setInputError(null); }}
                      onFocus={() => setKeyboardTarget('main')}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddFromInput()}
                      placeholder="z=x^2+y^2   ·   a=2   ·   A=(1,2,3)"
                      className={cn(
                        'flex-1 bg-transparent outline-none text-[15px] font-mono',
                        isDark ? 'text-white placeholder:text-zinc-500' : 'text-slate-800 placeholder:text-slate-400'
                      )}
                    />
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { setKeyboardTarget('main'); setKeyboardOpen(v => !v); inputRef.current?.focus(); }}
                      className={cn(
                        'shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-95 cursor-pointer',
                        keyboardOpen
                          ? 'bg-cyan-500/30 text-cyan-200'
                          : isDark
                            ? 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white'
                            : 'bg-slate-200/60 text-slate-500 hover:bg-slate-200 hover:text-slate-800'
                      )}
                      title={keyboardOpen ? '收起键盘' : '展开数学键盘'}
                    >
                      <Keyboard className="w-4 h-4" />
                    </button>
                    <button
                      onClick={handleAddFromInput}
                      className={cn(
                        'shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors active:scale-95 cursor-pointer',
                        isDark
                          ? 'bg-cyan-500/20 hover:bg-cyan-500/35 text-cyan-300'
                          : 'bg-cyan-100 hover:bg-cyan-200 text-cyan-700'
                      )}
                      title="添加"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  {inputError && (
                    <div className="flex items-center gap-1.5 text-xs text-red-500 dark:text-red-400 px-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>{inputError}</span>
                    </div>
                  )}
                </div>

                {/* 对象列表 (FunctionExplorer 风格) */}
                <div className="flex flex-col gap-3 flex-1 min-h-0">
                  <div className={cn(
                    'text-[13px] font-extrabold tracking-wider uppercase border-b pb-2 sticky top-0 backdrop-blur-md z-[1] transition-colors duration-500',
                    isDark
                      ? 'text-zinc-300 border-white/10 bg-zinc-950/85'
                      : 'text-slate-500 border-slate-200/80 bg-white/85'
                  )}>
                    对象列表 · {objects.length}
                  </div>

                  {objects.length === 0 && (
                    <div className={cn('text-center py-12 transition-colors duration-500', isDark ? 'text-zinc-500' : 'text-slate-400')}>
                      <p className="text-[15px] font-medium">暂无对象</p>
                      <p className="text-xs mt-2 opacity-80">在上方输入框创建第一个对象</p>
                    </div>
                  )}

                  {/* 曲面卡片 (z = f(x,y)) */}
                  {objects.filter((o): o is Surface3D => o.kind === 'surface').map(surf => {
                    const isEditing = editingId === surf.id;
                    return (
                      <div
                        key={surf.id}
                        className={cn(
                          'p-3.5 rounded-2xl border transition-all duration-300 flex flex-col gap-2.5 group/card shadow-sm',
                          isDark ? 'bg-zinc-900/30' : 'bg-slate-50/65 hover:bg-slate-50/90',
                          surf.visible
                            ? isDark ? 'border-white/10' : 'border-slate-200/80'
                            : 'border-transparent opacity-50'
                        )}
                      >
                        <div className="flex items-center gap-3">
                          {/* 显隐切换 */}
                          <button
                            onClick={() => updateObject(surf.id, { visible: !surf.visible } as Partial<Surface3D>)}
                            className="w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 active:scale-90 transition-all cursor-pointer"
                            style={{
                              backgroundColor: surf.visible ? surf.color : 'transparent',
                              borderColor: surf.color,
                            }}
                            title={surf.visible ? '隐藏' : '显示'}
                          >
                            {surf.visible
                              ? <Eye className="w-4 h-4 text-zinc-950 stroke-[3]" />
                              : <EyeOff className={cn('w-4 h-4', isDark ? 'text-zinc-400' : 'text-slate-400')} />}
                          </button>

                          {/* 名称 z = */}
                          <div className="font-mono font-bold text-[15px] shrink-0" style={{ color: surf.color }}>
                            {surf.name} =
                          </div>

                          {/* 表达式 (可点击编辑) */}
                          {isEditing ? (
                            <input
                              autoFocus
                              ref={editInputRef}
                              type="text"
                              inputMode="none"
                              autoComplete="off"
                              spellCheck={false}
                              value={editingValue}
                              onFocus={() => { setKeyboardTarget({ type: 'edit', id: surf.id }); setKeyboardOpen(true); }}
                              onChange={(e) => setEditingValue(e.target.value)}
                              onBlur={(e) => {
                                const next = e.relatedTarget as HTMLElement | null;
                                if (next && next.closest && next.closest('[data-mathkbd]')) return;
                                updateSurfaceSource(surf.id, editingValue);
                                setEditingId(null);
                                setKeyboardOpen(false);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  updateSurfaceSource(surf.id, editingValue);
                                  setEditingId(null);
                                  setKeyboardOpen(false);
                                } else if (e.key === 'Escape') {
                                  setEditingId(null);
                                  setKeyboardOpen(false);
                                }
                              }}
                              className={cn(
                                'flex-1 min-w-0 border rounded-md px-2.5 py-1 text-[15px] font-mono outline-none transition-colors',
                                isDark
                                  ? 'bg-zinc-950/60 border-cyan-400/40 text-white focus:border-cyan-400'
                                  : 'bg-white border-cyan-500/45 text-slate-800 focus:border-cyan-500'
                              )}
                            />
                          ) : (
                            <button
                              onClick={() => { setEditingId(surf.id); setEditingValue(surf.source); }}
                              className={cn(
                                'flex-1 min-w-0 text-left text-[15px] font-mono truncate transition-colors cursor-pointer hover:font-bold',
                                surf.visible
                                  ? isDark ? 'hover:text-white' : 'hover:text-slate-900'
                                  : isDark ? 'text-zinc-500' : 'text-slate-400'
                              )}
                              style={{ color: surf.visible ? surf.color : undefined }}
                              title="点击编辑"
                            >
                              {prettyFormula(surf.source)}
                            </button>
                          )}

                          {/* 删除 */}
                          <button
                            onClick={() => deleteObject(surf.id)}
                            className="opacity-0 group-hover/card:opacity-100 w-7 h-7 rounded-md text-zinc-400 hover:text-red-500 hover:bg-red-500/10 flex items-center justify-center transition-all shrink-0 cursor-pointer"
                            title="删除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        {surf.error && (
                          <div className="text-xs text-red-500 dark:text-red-400 ml-11 flex items-center gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5" />
                            <span>{surf.error}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* 滑动条卡片 */}
                  {objects.filter((o): o is Slider3D => o.kind === 'slider').length > 0 && (
                    <div className={cn(
                      'text-[13px] font-extrabold tracking-wider uppercase pt-3 flex items-center gap-1.5 transition-colors duration-500',
                      isDark ? 'text-zinc-400' : 'text-slate-500'
                    )}>
                      <Sliders className="w-4 h-4 text-cyan-500 dark:text-cyan-400" />
                      <span>滑动条 · {objects.filter(o => o.kind === 'slider').length}</span>
                    </div>
                  )}
                  {objects.filter((o): o is Slider3D => o.kind === 'slider').map(sl => (
                    <div
                      key={sl.id}
                      className={cn(
                        'p-3.5 rounded-2xl border transition-all duration-300 flex flex-col gap-3 group/card shadow-sm',
                        isDark
                          ? 'bg-zinc-900/30 border-white/10'
                          : 'bg-slate-50/65 hover:bg-slate-50/90 border-slate-200/80'
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 font-extrabold text-[13px]"
                          style={{ borderColor: sl.color, color: sl.color, backgroundColor: `${sl.color}15` }}
                        >
                          {sl.name}
                        </div>
                        <div className="flex-1 min-w-0 flex items-baseline gap-2">
                          <span className={cn('text-sm font-mono', isDark ? 'text-zinc-300' : 'text-slate-400')}>=</span>
                          <span className="text-[15px] font-mono font-bold" style={{ color: sl.color }}>
                            {sl.value.toFixed(2)}
                          </span>
                          <span className={cn('text-xs font-mono', isDark ? 'text-zinc-500' : 'text-slate-400')}>
                            [{sl.min}, {sl.max}]
                          </span>
                        </div>
                        <button
                          onClick={() => deleteObject(sl.id)}
                          className="opacity-0 group-hover/card:opacity-100 w-7 h-7 rounded-md text-zinc-400 hover:text-red-500 hover:bg-red-500/10 flex items-center justify-center transition-all shrink-0 cursor-pointer"
                          title="删除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <input
                        type="range"
                        min={sl.min}
                        max={sl.max}
                        step={sl.step}
                        value={sl.value}
                        onChange={(e) => updateObject(sl.id, { value: parseFloat(e.target.value) } as Partial<Slider3D>)}
                        className="w-full h-1.5 bg-slate-200 dark:bg-white/10 rounded-lg appearance-none cursor-pointer"
                        style={{ accentColor: sl.color }}
                      />
                      {/* 范围微调 */}
                      <div className={cn('flex items-center gap-1.5 text-xs font-medium', isDark ? 'text-zinc-400' : 'text-slate-500')}>
                        <input
                          type="number"
                          value={sl.min}
                          onChange={(e) => updateObject(sl.id, { min: parseFloat(e.target.value) || sl.min } as Partial<Slider3D>)}
                          className={cn(
                            'w-16 border rounded px-1.5 py-0.5 text-center font-mono outline-none transition-colors',
                            isDark
                              ? 'bg-zinc-950/60 border-white/10 text-zinc-200 focus:border-cyan-400/40'
                              : 'bg-white border-slate-200 text-slate-700 focus:border-cyan-500/40'
                          )}
                          step={0.5}
                        />
                        <span className={isDark ? 'text-zinc-600' : 'text-slate-300'}>〜</span>
                        <input
                          type="number"
                          value={sl.max}
                          onChange={(e) => updateObject(sl.id, { max: parseFloat(e.target.value) || sl.max } as Partial<Slider3D>)}
                          className={cn(
                            'w-16 border rounded px-1.5 py-0.5 text-center font-mono outline-none transition-colors',
                            isDark
                              ? 'bg-zinc-950/60 border-white/10 text-zinc-200 focus:border-cyan-400/40'
                              : 'bg-white border-slate-200 text-slate-700 focus:border-cyan-500/40'
                          )}
                          step={0.5}
                        />
                        <span className={cn('ml-auto', isDark ? 'text-zinc-500' : 'text-slate-400')}>步长</span>
                        <input
                          type="number"
                          value={sl.step}
                          onChange={(e) => updateObject(sl.id, { step: parseFloat(e.target.value) || sl.step } as Partial<Slider3D>)}
                          className={cn(
                            'w-14 border rounded px-1.5 py-0.5 text-center font-mono outline-none transition-colors',
                            isDark
                              ? 'bg-zinc-950/60 border-white/10 text-zinc-200 focus:border-cyan-400/40'
                              : 'bg-white border-slate-200 text-slate-700 focus:border-cyan-500/40'
                          )}
                          step={0.01}
                          min={0.001}
                        />
                      </div>
                    </div>
                  ))}

                  {/* 几何对象 (点/线/球/柱/锥/面) */}
                  {objects.filter(o => o.kind !== 'surface' && o.kind !== 'slider').length > 0 && (
                    <div className={cn(
                      'text-[13px] font-extrabold tracking-wider uppercase pt-3 flex items-center gap-1.5 transition-colors duration-500',
                      isDark ? 'text-zinc-400' : 'text-slate-500'
                    )}>
                      <Crosshair className="w-4 h-4 text-pink-500 dark:text-pink-400" />
                      <span>几何对象 · {objects.filter(o => o.kind !== 'surface' && o.kind !== 'slider').length}</span>
                    </div>
                  )}
                  {objects.filter(o => o.kind !== 'surface' && o.kind !== 'slider').map(obj => (
                    <div
                      key={obj.id}
                      className={cn(
                        'p-3.5 rounded-2xl border transition-all duration-300 flex items-center gap-3 group/card shadow-sm',
                        isDark
                          ? 'bg-zinc-900/30 border-white/10'
                          : 'bg-slate-50/65 hover:bg-slate-50/90 border-slate-200/80',
                        !obj.visible && 'opacity-50 border-transparent'
                      )}
                    >
                      <button
                        onClick={() => updateObject(obj.id, { visible: !obj.visible } as Partial<Geo3DObject>)}
                        className="w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 active:scale-90 transition-all cursor-pointer"
                        style={{
                          backgroundColor: obj.visible ? obj.color : 'transparent',
                          borderColor: obj.color,
                        }}
                        title={obj.visible ? '隐藏' : '显示'}
                      >
                        {obj.visible
                          ? <Eye className="w-4 h-4 text-zinc-950 stroke-[3]" />
                          : <EyeOff className={cn('w-4 h-4', isDark ? 'text-zinc-400' : 'text-slate-400')} />}
                      </button>

                      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                        <span className="font-mono font-bold text-[15px]" style={{ color: obj.color }}>
                          {obj.name}
                        </span>
                        <span className={cn('text-xs font-mono truncate', isDark ? 'text-zinc-400' : 'text-slate-500')}>
                          {obj.kind === 'point' && `(${(obj as Point3D).xExpr}, ${(obj as Point3D).yExpr}, ${(obj as Point3D).zExpr})`}
                          {obj.kind === 'line' && `Segment(${(obj as Line3D).p1}, ${(obj as Line3D).p2})`}
                          {obj.kind === 'sphere' && `Sphere(${(obj as Sphere3D).center}, r=${(obj as Sphere3D).radiusExpr})`}
                          {obj.kind === 'cylinder' && `Cyl(${(obj as Cylinder3D).center}, r=${(obj as Cylinder3D).radiusExpr}, h=${(obj as Cylinder3D).heightExpr})`}
                          {obj.kind === 'cone' && `Cone(${(obj as Cone3D).center}, r=${(obj as Cone3D).radiusExpr}, h=${(obj as Cone3D).heightExpr})`}
                          {obj.kind === 'plane' && `${(obj as Plane3D).aExpr}·x + ${(obj as Plane3D).bExpr}·y + ${(obj as Plane3D).cExpr}·z = ${(obj as Plane3D).dExpr}`}
                        </span>
                      </div>

                      <button
                        onClick={() => deleteObject(obj.id)}
                        className="opacity-0 group-hover/card:opacity-100 w-7 h-7 rounded-md text-zinc-400 hover:text-red-500 hover:bg-red-500/10 flex items-center justify-center transition-all shrink-0 cursor-pointer"
                        title="删除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* === TAB: TOOLS (geometry forms) === */}
            {activeSidebarTab === 'tools' && (
              <>
                {/* Point */}
                <div className="p-3.5 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-[0_0_8px_#3b82f6]" />
                    <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200">添加点 (Point)</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {(['x', 'y', 'z'] as const).map((axis) => (
                      <div className="flex flex-col gap-1" key={axis}>
                        <span className="text-[11px] text-zinc-400 pl-1">坐标 {axis.toUpperCase()}</span>
                        <input
                          type="text"
                          value={toolInputs.point[axis]}
                          onChange={(e) => setToolInputs(prev => ({ ...prev, point: { ...prev.point, [axis]: e.target.value } }))}
                          className="bg-black/5 dark:bg-white/5 rounded-lg px-2 py-1 text-sm focus:outline-none border border-transparent focus:border-cyan-500/40 text-center font-mono font-bold"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={toolInputs.point.name}
                      onChange={(e) => setToolInputs(prev => ({ ...prev, point: { ...prev.point, name: e.target.value } }))}
                      placeholder="名称(可空,自动 A/B...)"
                      className="flex-1 bg-black/5 dark:bg-white/5 rounded-lg px-2.5 py-1 text-sm focus:outline-none border border-transparent focus:border-cyan-500/40"
                    />
                    <button
                      onClick={addPointVisual}
                      className="px-3 py-1.5 rounded-lg bg-gradient-to-tr from-cyan-600 to-blue-500 text-white font-bold text-sm active:scale-95 transition-all shadow-md shadow-cyan-500/10 cursor-pointer"
                    >
                      添加
                    </button>
                  </div>
                </div>

                {/* Line segment */}
                <div className="p-3.5 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-0.5 bg-pink-500" />
                    <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200">连接线段 (Segment)</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] text-zinc-400 pl-1">起点(点名/坐标)</span>
                      <input
                        type="text"
                        value={toolInputs.line.p1}
                        onChange={(e) => setToolInputs(prev => ({ ...prev, line: { ...prev.line, p1: e.target.value } }))}
                        className="bg-black/5 dark:bg-white/5 rounded-lg px-2 py-1 text-sm focus:outline-none text-center font-mono"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] text-zinc-400 pl-1">终点(点名/坐标)</span>
                      <input
                        type="text"
                        value={toolInputs.line.p2}
                        onChange={(e) => setToolInputs(prev => ({ ...prev, line: { ...prev.line, p2: e.target.value } }))}
                        className="bg-black/5 dark:bg-white/5 rounded-lg px-2 py-1 text-sm focus:outline-none text-center font-mono"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={toolInputs.line.name}
                      onChange={(e) => setToolInputs(prev => ({ ...prev, line: { ...prev.line, name: e.target.value } }))}
                      placeholder="名称"
                      className="flex-1 bg-black/5 dark:bg-white/5 rounded-lg px-2.5 py-1 text-sm focus:outline-none"
                    />
                    <button
                      onClick={addLineVisual}
                      className="px-3 py-1.5 rounded-lg bg-gradient-to-tr from-cyan-600 to-blue-500 text-white font-bold text-sm active:scale-95 transition-all shadow-md shadow-cyan-500/10 cursor-pointer"
                    >
                      连接
                    </button>
                  </div>
                </div>

                {/* Sphere */}
                <div className="p-3.5 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-emerald-500" />
                    <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200">球面 (Sphere)</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] text-zinc-400 pl-1">球心</span>
                      <input
                        type="text"
                        value={toolInputs.sphere.center}
                        onChange={(e) => setToolInputs(prev => ({ ...prev, sphere: { ...prev.sphere, center: e.target.value } }))}
                        className="bg-black/5 dark:bg-white/5 rounded-lg px-2 py-1 text-sm focus:outline-none text-center font-mono"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] text-zinc-400 pl-1">半径</span>
                      <input
                        type="text"
                        value={toolInputs.sphere.radius}
                        onChange={(e) => setToolInputs(prev => ({ ...prev, sphere: { ...prev.sphere, radius: e.target.value } }))}
                        className="bg-black/5 dark:bg-white/5 rounded-lg px-2 py-1 text-sm focus:outline-none text-center font-mono"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={toolInputs.sphere.name}
                      onChange={(e) => setToolInputs(prev => ({ ...prev, sphere: { ...prev.sphere, name: e.target.value } }))}
                      placeholder="名称"
                      className="flex-1 bg-black/5 dark:bg-white/5 rounded-lg px-2.5 py-1 text-sm focus:outline-none"
                    />
                    <button
                      onClick={addSphereVisual}
                      className="px-3 py-1.5 rounded-lg bg-gradient-to-tr from-cyan-600 to-blue-500 text-white font-bold text-sm active:scale-95 transition-all shadow-md shadow-cyan-500/10 cursor-pointer"
                    >
                      生成球
                    </button>
                  </div>
                </div>

                {/* Cylinder & Cone (compact two-column) */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 flex flex-col gap-2.5">
                    <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200">圆柱</span>
                    <input
                      type="text"
                      value={toolInputs.cylinder.center}
                      onChange={(e) => setToolInputs(prev => ({ ...prev, cylinder: { ...prev.cylinder, center: e.target.value } }))}
                      placeholder="底心"
                      className="bg-black/5 dark:bg-white/5 rounded-lg px-2 py-1.5 text-xs focus:outline-none text-center"
                    />
                    <div className="grid grid-cols-2 gap-1.5">
                      <input
                        type="text"
                        value={toolInputs.cylinder.radius}
                        onChange={(e) => setToolInputs(prev => ({ ...prev, cylinder: { ...prev.cylinder, radius: e.target.value } }))}
                        placeholder="r"
                        className="bg-black/5 dark:bg-white/5 rounded-lg px-1.5 py-1 text-xs focus:outline-none text-center"
                      />
                      <input
                        type="text"
                        value={toolInputs.cylinder.height}
                        onChange={(e) => setToolInputs(prev => ({ ...prev, cylinder: { ...prev.cylinder, height: e.target.value } }))}
                        placeholder="h"
                        className="bg-black/5 dark:bg-white/5 rounded-lg px-1.5 py-1 text-xs focus:outline-none text-center"
                      />
                    </div>
                    <button
                      onClick={addCylinderVisual}
                      className="w-full py-1.5 rounded-lg bg-cyan-600/20 text-cyan-500 hover:bg-cyan-600/30 font-bold text-xs active:scale-95 transition-all border border-cyan-500/20 cursor-pointer"
                    >
                      添加圆柱
                    </button>
                  </div>

                  <div className="p-3 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 flex flex-col gap-2.5">
                    <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200">圆锥</span>
                    <input
                      type="text"
                      value={toolInputs.cone.center}
                      onChange={(e) => setToolInputs(prev => ({ ...prev, cone: { ...prev.cone, center: e.target.value } }))}
                      placeholder="底心"
                      className="bg-black/5 dark:bg-white/5 rounded-lg px-2 py-1.5 text-xs focus:outline-none text-center"
                    />
                    <div className="grid grid-cols-2 gap-1.5">
                      <input
                        type="text"
                        value={toolInputs.cone.radius}
                        onChange={(e) => setToolInputs(prev => ({ ...prev, cone: { ...prev.cone, radius: e.target.value } }))}
                        placeholder="r"
                        className="bg-black/5 dark:bg-white/5 rounded-lg px-1.5 py-1 text-xs focus:outline-none text-center"
                      />
                      <input
                        type="text"
                        value={toolInputs.cone.height}
                        onChange={(e) => setToolInputs(prev => ({ ...prev, cone: { ...prev.cone, height: e.target.value } }))}
                        placeholder="h"
                        className="bg-black/5 dark:bg-white/5 rounded-lg px-1.5 py-1 text-xs focus:outline-none text-center"
                      />
                    </div>
                    <button
                      onClick={addConeVisual}
                      className="w-full py-1.5 rounded-lg bg-cyan-600/20 text-cyan-500 hover:bg-cyan-600/30 font-bold text-xs active:scale-95 transition-all border border-cyan-500/20 cursor-pointer"
                    >
                      添加圆锥
                    </button>
                  </div>
                </div>

                {/* Plane (ax+by+cz=d) */}
                <div className="p-3.5 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <Box className="w-3.5 h-3.5 text-violet-500 rotate-12" />
                    <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200">平面 (Plane)</span>
                  </div>
                  <span className="text-[11px] text-zinc-400 text-center font-mono leading-relaxed">
                    a·x + b·y + c·z = d
                  </span>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(['a', 'b', 'c', 'd'] as const).map((k) => (
                      <input
                        key={k}
                        type="text"
                        value={toolInputs.plane[k]}
                        onChange={(e) => setToolInputs(prev => ({ ...prev, plane: { ...prev.plane, [k]: e.target.value } }))}
                        title={`系数 ${k}`}
                        className="bg-black/5 dark:bg-white/5 rounded-lg py-1.5 text-sm text-center font-mono font-bold focus:outline-none focus:border-cyan-500/40 border border-transparent"
                      />
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={toolInputs.plane.name}
                      onChange={(e) => setToolInputs(prev => ({ ...prev, plane: { ...prev.plane, name: e.target.value } }))}
                      placeholder="名称(可空,默认 α/β...)"
                      className="flex-1 bg-black/5 dark:bg-white/5 rounded-lg px-2.5 py-1 text-sm focus:outline-none"
                    />
                    <button
                      onClick={addPlaneVisual}
                      className="px-3 py-1.5 rounded-lg bg-gradient-to-tr from-cyan-600 to-blue-500 text-white font-bold text-sm active:scale-95 transition-all shadow-md shadow-cyan-500/10 cursor-pointer"
                    >
                      生成面
                    </button>
                  </div>
                </div>

                {/* Generated models list */}
                {objects.filter(o => o.kind !== 'surface' && o.kind !== 'slider').length > 0 && (
                  <div className="mt-4 flex flex-col gap-3">
                    <div className={cn(
                      'text-[13px] font-extrabold tracking-wider uppercase border-b pb-2 sticky top-0 backdrop-blur-md z-[1] transition-colors duration-500',
                      isDark
                        ? 'text-zinc-300 border-white/10 bg-zinc-950/85'
                        : 'text-slate-500 border-slate-200/80 bg-white/85'
                    )}>
                      模型列表 · {objects.filter(o => o.kind !== 'surface' && o.kind !== 'slider').length}
                    </div>
                    {objects.filter(o => o.kind !== 'surface' && o.kind !== 'slider').map(obj => (
                      <div
                        key={obj.id}
                        className={cn(
                          'p-3 rounded-xl border transition-all duration-300 flex items-center justify-between gap-3 shadow-sm',
                          isDark
                            ? 'bg-zinc-900/20 border-white/10 hover:bg-zinc-900/35'
                            : 'bg-slate-50/50 hover:bg-slate-50 border-slate-200/60',
                          !obj.visible && 'opacity-50'
                        )}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <button
                            onClick={() => updateObject(obj.id, { visible: !obj.visible } as Partial<Geo3DObject>)}
                            className="w-6 h-6 rounded-full border flex items-center justify-center shrink-0 active:scale-95 transition-all cursor-pointer"
                            style={{
                              backgroundColor: obj.visible ? obj.color : 'transparent',
                              borderColor: obj.color,
                            }}
                            title={obj.visible ? '隐藏' : '显示'}
                          >
                            {obj.visible ? (
                              <div className="w-1.5 h-1.5 rounded-full bg-zinc-950" />
                            ) : null}
                          </button>
                          <div className="flex flex-col min-w-0">
                            <span className="font-mono font-bold text-sm" style={{ color: obj.color }}>
                              {obj.name}
                            </span>
                            <span className={cn('text-[11px] font-mono truncate', isDark ? 'text-zinc-400' : 'text-slate-500')}>
                              {obj.kind === 'point' && `(${(obj as Point3D).xExpr}, ${(obj as Point3D).yExpr}, ${(obj as Point3D).zExpr})`}
                              {obj.kind === 'line' && `Segment(${(obj as Line3D).p1}, ${(obj as Line3D).p2})`}
                              {obj.kind === 'sphere' && `Sphere(${(obj as Sphere3D).center}, r=${(obj as Sphere3D).radiusExpr})`}
                              {obj.kind === 'cylinder' && `Cyl(${(obj as Cylinder3D).center}, r=${(obj as Cylinder3D).radiusExpr}, h=${(obj as Cylinder3D).heightExpr})`}
                              {obj.kind === 'cone' && `Cone(${(obj as Cone3D).center}, r=${(obj as Cone3D).radiusExpr}, h=${(obj as Cone3D).heightExpr})`}
                              {obj.kind === 'plane' && `${(obj as Plane3D).aExpr}·x + ${(obj as Plane3D).bExpr}·y + ${(obj as Plane3D).cExpr}·z = ${(obj as Plane3D).dExpr}`}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => deleteObject(obj.id)}
                          className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center transition-all shrink-0 cursor-pointer",
                            isDark
                              ? "text-zinc-400 hover:text-red-450 hover:bg-red-500/10"
                              : "text-slate-500 hover:text-red-650 hover:bg-red-50/80"
                          )}
                          title="删除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

              </>
            )}

          </div>

          {/* --- Bottom: Reset --- */}
          <div className="px-4 py-3 border-t border-black/5 dark:border-white/10 shrink-0">
            <button
              onClick={resetAll}
              className={cn(
                "w-full py-2.5 rounded-xl border text-[13px] font-extrabold flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer",
                isDark
                  ? "border-white/5 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white"
                  : "border-slate-200 bg-slate-100 hover:bg-slate-200 text-zinc-650 hover:text-zinc-800"
              )}
              title="重置全部对象与视角"
            >
              <RotateCcw className="w-4 h-4" />
              <span>重置全部</span>
            </button>
          </div>

        </div>
      </div>

      {/* ===== Sidebar collapse toggle ===== */}
      <button
        onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        className={cn(
          'absolute top-1/2 -translate-y-1/2 z-[38] w-6 h-28 flex items-center justify-center rounded-r-2xl border-y border-r transition-[left] duration-300 active:scale-y-95 cursor-pointer',
          isDark
            ? 'bg-zinc-950/90 hover:bg-zinc-900 border-white/10 text-zinc-400 hover:text-white shadow-[4px_0_15px_rgba(0,0,0,0.5)]'
            : 'bg-white hover:bg-slate-100 border-slate-200/80 text-slate-400 hover:text-slate-800 shadow-[4px_0_15px_rgba(0,0,0,0.03)]',
          isSidebarCollapsed ? 'left-0' : 'left-[400px]'
        )}
        title={isSidebarCollapsed ? '展开侧栏' : '收起侧栏'}
      >
        {isSidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>

      {/* ===== 2. 3D Render Canvas ===== */}
      <div className="flex-1 h-full relative z-0 overflow-hidden">
        {/* Three.js mount point */}
        <div ref={containerRef} className="absolute inset-0" />

        {/* Floating control bar (top right) */}
        <div className="absolute top-6 right-6 flex items-center gap-1.5 p-1.5 rounded-2xl bg-white/70 dark:bg-zinc-900/80 border border-black/5 dark:border-white/10 shadow-lg backdrop-blur-md transition-colors duration-500 z-10">
          {/* Preset views */}
          <button
            onClick={() => setView('iso')}
            className="px-2.5 py-2 rounded-xl text-xs font-bold text-zinc-600 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/10 transition-all cursor-pointer"
            title="等距视图"
          >等距</button>
          <button
            onClick={() => setView('top')}
            className="px-2.5 py-2 rounded-xl text-xs font-bold text-zinc-600 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/10 transition-all cursor-pointer"
            title="俯视图"
          >俯视</button>
          <button
            onClick={() => setView('front')}
            className="px-2.5 py-2 rounded-xl text-xs font-bold text-zinc-600 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/10 transition-all cursor-pointer"
            title="正视图"
          >正视</button>
          <button
            onClick={() => setView('side')}
            className="px-2.5 py-2 rounded-xl text-xs font-bold text-zinc-600 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/10 transition-all cursor-pointer"
            title="侧视图"
          >侧视</button>

          <div className="w-[1px] h-5 bg-black/10 dark:bg-white/15 mx-1" />

          <button
            onClick={() => setShowAxes(!showAxes)}
            className={cn(
              "p-2.5 rounded-xl transition-all cursor-pointer border",
              showAxes
                ? "bg-gradient-to-tr from-cyan-600 to-blue-500 border-cyan-400/20 text-white shadow-md shadow-cyan-500/10"
                : "bg-transparent text-zinc-400 hover:text-zinc-700 dark:hover:text-white border-transparent hover:bg-black/5 dark:hover:bg-white/10"
            )}
            title={showAxes ? "隐藏坐标轴" : "显示坐标轴"}
          >
            <Compass className="w-4 h-4" />
          </button>

          <button
            onClick={() => setShowGrid(!showGrid)}
            className={cn(
              "p-2.5 rounded-xl transition-all cursor-pointer border",
              showGrid
                ? "bg-gradient-to-tr from-cyan-600 to-blue-500 border-cyan-400/20 text-white shadow-md shadow-cyan-500/10"
                : "bg-transparent text-zinc-400 hover:text-zinc-700 dark:hover:text-white border-transparent hover:bg-black/5 dark:hover:bg-white/10"
            )}
            title={showGrid ? "隐藏网格" : "显示网格"}
          >
            <Grid className="w-4 h-4" />
          </button>

          <button
            onClick={() => setAutoRotate(!autoRotate)}
            className={cn(
              "p-2.5 rounded-xl transition-all cursor-pointer border",
              autoRotate
                ? "bg-gradient-to-tr from-cyan-600 to-blue-500 border-cyan-400/20 text-white shadow-md shadow-cyan-500/10"
                : "bg-transparent text-zinc-400 hover:text-zinc-700 dark:hover:text-white border-transparent hover:bg-black/5 dark:hover:bg-white/10"
            )}
            title={autoRotate ? "暂停自动旋转" : "开启自动旋转"}
          >
            {autoRotate ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* ===== 3. Math Keyboard ===== */}
      <MathKeyboard
        visible={keyboardOpen}
        onClose={() => setKeyboardOpen(false)}
        onInsert={insertAtCursor}
        onBackspace={handleBackspace}
        onArrow={handleArrow}
        onSubmit={() => {
          if (keyboardTarget === 'main') handleAddFromInput();
          else setEditingId(null);
          setKeyboardOpen(false);
        }}
      />
    </div>
  );
}
