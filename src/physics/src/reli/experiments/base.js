import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { tempToColor } from '../lab/materials.js';

/**
 * Modern laboratory experiment base.
 * Shared environment map, lab floor, lighting, camera controls.
 */
export class Experiment {
  constructor(renderer, canvas) {
    this.renderer = renderer;
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.05, 200);
    this.camera.position.set(5.5, 3.8, 7.5);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.minDistance = 2.5;
    this.controls.maxDistance = 22;
    this.controls.maxPolarAngle = Math.PI * 0.48;
    this.controls.target.set(0, 1.4, 0);
    this.clock = new THREE.Clock();
    this.params = {};
    this._disposed = false;
    this._pmrem = null;
    this._envRT = null;
  }

  get meta() {
    return {
      id: 'base',
      name: 'Base',
      tag: '',
      title: '',
      description: '',
      formula: '',
    };
  }

  get controlDefs() {
    return [];
  }

  get readoutDefs() {
    return [];
  }

  setup() {
    // Cool modern lab backdrop
    this.scene.background = new THREE.Color(0x0a0e16);
    this.scene.fog = new THREE.FogExp2(0x0a0e16, 0.028);

    // Studio / lab environment reflections
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this._pmrem = pmrem;
    const room = new RoomEnvironment();
    this._envRT = pmrem.fromScene(room, 0.04);
    this.scene.environment = this._envRT.texture;
    room.dispose?.();

    // Lighting: key + fill + rim + ambient for metal/glass
    const amb = new THREE.AmbientLight(0x6a7a94, 0.35);
    this.scene.add(amb);

    const hemi = new THREE.HemisphereLight(0xd0e4ff, 0x1a2030, 0.55);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xfff5e8, 1.35);
    key.position.set(6, 12, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 40;
    key.shadow.camera.left = -12;
    key.shadow.camera.right = 12;
    key.shadow.camera.top = 12;
    key.shadow.camera.bottom = -12;
    key.shadow.bias = -0.0002;
    key.shadow.normalBias = 0.02;
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0x7eb6ff, 0.45);
    fill.position.set(-7, 4, -3);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight(0x00d4aa, 0.25);
    rim.position.set(0, 3, -8);
    this.scene.add(rim);

    // Lab floor — dark epoxy with subtle tile
    const floorGeo = new THREE.PlaneGeometry(40, 40);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x121820,
      metalness: 0.15,
      roughness: 0.82,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Floor grid inlay (subtle tech lines)
    const grid = new THREE.GridHelper(20, 40, 0x1e2a3a, 0x15202c);
    grid.position.y = 0.005;
    grid.material.transparent = true;
    grid.material.opacity = 0.55;
    this.scene.add(grid);

    // Back wall panel (lab wall)
    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(28, 10),
      new THREE.MeshStandardMaterial({
        color: 0x151c28,
        metalness: 0.1,
        roughness: 0.9,
      })
    );
    wall.position.set(0, 5, -8);
    wall.receiveShadow = true;
    this.scene.add(wall);

    // Accent LED strip on wall
    const led = new THREE.Mesh(
      new THREE.BoxGeometry(16, 0.04, 0.06),
      new THREE.MeshStandardMaterial({
        color: 0x00d4aa,
        emissive: 0x00d4aa,
        emissiveIntensity: 0.8,
      })
    );
    led.position.set(0, 0.15, -7.95);
    this.scene.add(led);

    // Side accent
    const led2 = led.clone();
    led2.position.set(0, 7.2, -7.95);
    led2.material = led.material.clone();
    led2.material.color.set(0x3b82f6);
    led2.material.emissive.set(0x3b82f6);
    this.scene.add(led2);
  }

  reset() {
    this.clock.start();
  }

  update(_dt) {
    this.controls.update();
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  getReadouts() {
    return {};
  }

  onParamChange(_key, _value) {}

  dispose() {
    this._disposed = true;
    this.controls.dispose();
    if (this._envRT) {
      this._envRT.dispose();
      this._envRT = null;
    }
    if (this._pmrem) {
      this._pmrem.dispose();
      this._pmrem = null;
    }
    this.scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m) => {
          if (m.map) m.map.dispose();
          m.dispose();
        });
      }
    });
    while (this.scene.children.length) this.scene.remove(this.scene.children[0]);
  }

  makeLabelSprite(text, color = '#c8d4e8') {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 640, 128);
    // pill background
    ctx.fillStyle = 'rgba(10, 16, 28, 0.72)';
    roundRect(ctx, 24, 28, 592, 72, 16);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 212, 170, 0.35)';
    ctx.lineWidth = 2;
    roundRect(ctx, 24, 28, 592, 72, 16);
    ctx.stroke();

    ctx.font = '600 36px "Noto Sans SC", system-ui, sans-serif';
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 320, 64);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.8, 0.36, 1);
    return sprite;
  }

  tempColor(t, tMin = 200, tMax = 600) {
    return tempToColor(t, tMin, tMax);
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
