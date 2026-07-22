import * as THREE from 'three';

/**
 * High-detail Saturn ring system (procedural multi-band + ice dust).
 * Approximates A/B/C rings + Cassini Division + fine ringlets.
 */
export function createSaturnRingSystem(center, planetR, {
  colorMap = null,
  tiltX = Math.PI / 2.35,
  tiltZ = 0.38,
  sunDir = new THREE.Vector3(1, 0.4, 0.6),
} = {}) {
  const group = new THREE.Group();
  group.name = 'SaturnRings';
  group.position.copy(center);
  group.rotation.x = tiltX;
  group.rotation.z = tiltZ;

  // Spin child keeps orbital tilt fixed while rings rotate in-plane
  const spin = new THREE.Group();
  spin.name = 'RingSpin';
  group.add(spin);

  const R = planetR;
  const densityTex = createRingDensityTexture(1024);
  const colorTex = colorMap || createRingColorTexture(512);

  // Main continuous ring disc (shader drives A/B/C/F + Cassini / Encke)
  const inner = R * 1.2;
  const outer = R * 2.38;
  const main = createRingMesh(inner, outer, {
    densityTex,
    colorTex,
    sunDir,
    opacity: 1,
    radialSegs: 10,
    thetaSegs: 256,
  });
  spin.add(main);

  // Second layer for thickness / parallax
  const main2 = createRingMesh(inner * 1.001, outer * 0.999, {
    densityTex,
    colorTex,
    sunDir,
    opacity: 0.4,
    radialSegs: 6,
    thetaSegs: 160,
    z: R * 0.0025,
  });
  spin.add(main2);

  // Soft umbra on rings from planet
  spin.add(createRingPlanetShadow(R));

  // Ice particle sparkle (B + A densest) — fades out at distance to avoid bloom flare
  const dust = createRingDust(R, 5200, sunDir);
  spin.add(dust);

  group.userData = {
    sunDir,
    spin,
    materials: [main.material, main2.material],
    dust,
    setSunDir(dir) {
      for (const m of group.userData.materials) {
        if (m.uniforms?.uSunDir) m.uniforms.uSunDir.value.copy(dir).normalize();
      }
    },
    /**
     * 1 = full rings (close), 0 = far.
     * Only dims the ring disc + ice dust — not the planet body.
     * Additive dust is the main far-bloom source; hide it early.
     */
    setDistanceFade(near = 1) {
      const n = THREE.MathUtils.clamp(near, 0, 1);
      for (const m of group.userData.materials) {
        if (m.uniforms?.uBrightness) {
          // Stay readable up close; fall to a dull tan at distance (no white flare)
          m.uniforms.uBrightness.value = 0.22 + 0.78 * n;
        }
        if (m.uniforms?.uOpacity) {
          const base = m.userData?.baseOpacity ?? 1;
          m.uniforms.uOpacity.value = base * (0.35 + 0.65 * n);
        }
      }
      if (dust) {
        // Dust sparkles collapse into a glowing core when far — off early
        dust.visible = n > 0.35;
        if (dust.material?.uniforms?.uFade) {
          dust.material.uniforms.uFade.value = Math.max(0, (n - 0.2) / 0.8);
        }
      }
    },
    spinStep(amount = 0.0004) {
      spin.rotation.z += amount;
    },
  };

  // Remember base opacities for fade
  main.material.userData.baseOpacity = 1;
  main2.material.userData.baseOpacity = 0.4;

  return group;
}

function createRingMesh(inner, outer, {
  densityTex,
  colorTex,
  sunDir,
  opacity = 1,
  radialSegs = 8,
  thetaSegs = 128,
  z = 0,
} = {}) {
  const geo = new THREE.RingGeometry(inner, outer, thetaSegs, radialSegs);
  // UV: u = angle, v = radial 0..1
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const r = Math.sqrt(x * x + y * y);
    const ang = Math.atan2(y, x);
    const u = ang / (Math.PI * 2) + 0.5;
    const v = (r - inner) / (outer - inner);
    uv.setXY(i, u, THREE.MathUtils.clamp(v, 0, 1));
  }
  uv.needsUpdate = true;

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uDensity: { value: densityTex },
      uColor: { value: colorTex },
      uSunDir: { value: sunDir.clone().normalize() },
      uOpacity: { value: opacity },
      uBrightness: { value: 1.0 },
      uInner: { value: inner },
      uOuter: { value: outer },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        // Ring plane normal in world (from model matrix Y after rotations)
        vWorldNormal = normalize(mat3(modelMatrix) * vec3(0.0, 0.0, 1.0));
        gl_Position = projectionMatrix * viewMatrix * wp;
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <logdepthbuf_pars_fragment>
      uniform sampler2D uDensity;
      uniform sampler2D uColor;
      uniform vec3 uSunDir;
      uniform float uOpacity;
      uniform float uBrightness;
      uniform float uInner;
      uniform float uOuter;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;

      // Structural gaps (normalized radial 0..1 across full disc)
      float ringStructure(float t) {
        // t: 0 at inner, 1 at outer of whole system
        float d = 1.0;
        // C ring weaker
        if (t < 0.18) d *= smoothstep(0.0, 0.06, t) * 0.45;
        // B dense
        if (t > 0.18 && t < 0.48) d *= 0.85 + 0.15 * sin(t * 80.0);
        // Cassini Division
        if (t > 0.48 && t < 0.56) d *= smoothstep(0.48, 0.50, t) * smoothstep(0.56, 0.54, t) * 0.08;
        // A ring
        if (t > 0.56 && t < 0.88) {
          d *= 0.75;
          // Encke gap ~0.82
          if (t > 0.80 && t < 0.84) d *= 0.12;
        }
        // F thin
        if (t > 0.90) d *= smoothstep(0.90, 0.93, t) * smoothstep(1.0, 0.96, t) * 0.4;
        // Outer soft falloff
        d *= smoothstep(1.0, 0.92, t);
        d *= smoothstep(0.0, 0.04, t);
        return d;
      }

      void main() {
        #include <logdepthbuf_fragment>
        float t = vUv.y; // radial
        float ang = vUv.x;

        // Fine ringlets from density texture (sampled radially)
        float dens = texture2D(uDensity, vec2(t * 3.0 + ang * 0.02, 0.5)).r;
        dens = mix(0.55, 1.0, dens);

        float structure = ringStructure(t);
        float alpha = structure * dens * uOpacity;

        // Color: icy tan with radial variation
        vec3 base = texture2D(uColor, vec2(t, ang)).rgb;
        base = mix(vec3(0.55, 0.5, 0.42), base, 0.75);
        // B ring slightly brighter / creamier
        if (t > 0.2 && t < 0.48) base *= vec3(1.08, 1.04, 0.95);
        // Cassini darker
        if (t > 0.48 && t < 0.56) base *= 0.4;

        // Lighting: rings are thin — lit from sun, translucent when backlit
        vec3 N = normalize(vWorldNormal);
        vec3 L = normalize(uSunDir);
        vec3 V = normalize(cameraPosition - vWorldPos);
        float ndotl = abs(dot(N, L)); // both faces
        float front = max(dot(N, L), 0.0);
        // Mild backlighting only — strong backscatter looks like the rings glow
        float back = pow(max(dot(-V, L), 0.0), 6.0) * 0.22;
        float lit = 0.16 + ndotl * 0.58 + back;

        // Soft self-shadow near planet (inner edge darker)
        float innerShade = smoothstep(0.0, 0.15, t);
        lit *= 0.55 + 0.45 * innerShade;

        vec3 col = base * lit * uBrightness;

        // Soft ice glint (capped so rings never act like a light source)
        float glint = pow(max(dot(reflect(-L, N), V), 0.0), 40.0) * dens * structure;
        col += vec3(1.0, 0.98, 0.9) * glint * 0.08 * uBrightness;
        col = min(col, vec3(0.95));

        alpha = clamp(alpha * (0.7 + dens * 0.3), 0.0, 0.88);
        if (alpha < 0.02) discard;

        gl_FragColor = vec4(col, alpha);
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.z = z;
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  // Transparent ring shaders don't write useful shadow maps; globe uses a
  // cheap equatorial multiply band (space.js createSaturnBodyRingShadow).
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

/** Radial density ringlets (1D noise → 2D strip). */
function createRingDensityTexture(size = 1024) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = 4;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, 4);
  let n = 0.5;
  for (let x = 0; x < size; x++) {
    // multi-octave value noise along radius
    n += (Math.random() - 0.5) * 0.15;
    n = Math.max(0.15, Math.min(0.95, n));
    const fine = Math.sin(x * 0.35) * 0.08 + Math.sin(x * 1.7) * 0.04;
    const v = Math.floor(THREE.MathUtils.clamp(n + fine, 0, 1) * 255);
    for (let y = 0; y < 4; y++) {
      const i = (y * size + x) * 4;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function createRingColorTexture(size = 512) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  // Radial gradient bands
  for (let x = 0; x < size; x++) {
    const t = x / size;
    let r = 200, g = 185, b = 155;
    if (t < 0.2) {
      r = 160; g = 150; b = 130;
    } else if (t < 0.5) {
      r = 220; g = 205; b = 170;
    } else if (t < 0.55) {
      r = 80; g = 75; b = 65;
    } else {
      r = 200; g = 188; b = 160;
    }
    // subtle angular mottling later via noise in shader — here solid stripes
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(x, 0, 1, size);
  }
  // Fine noise
  const id = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < id.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 18;
    id.data[i] = Math.max(0, Math.min(255, id.data[i] + n));
    id.data[i + 1] = Math.max(0, Math.min(255, id.data[i + 1] + n));
    id.data[i + 2] = Math.max(0, Math.min(255, id.data[i + 2] + n * 0.8));
  }
  ctx.putImageData(id, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createRingDust(planetR, count, sunDir) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    // Bias to B and A rings
    const pick = Math.random();
    let rNorm;
    if (pick < 0.55) rNorm = 1.55 + Math.random() * 0.38; // B
    else if (pick < 0.9) rNorm = 2.05 + Math.random() * 0.2; // A
    else rNorm = 1.25 + Math.random() * 0.25; // C
    const r = planetR * rNorm;
    const a = Math.random() * Math.PI * 2;
    // Slight vertical scatter for thickness
    const z = (Math.random() - 0.5) * planetR * 0.008;
    positions[i * 3] = Math.cos(a) * r;
    positions[i * 3 + 1] = Math.sin(a) * r;
    positions[i * 3 + 2] = z;

    const warm = 0.85 + Math.random() * 0.15;
    colors[i * 3] = warm;
    colors[i * 3 + 1] = warm * 0.95;
    colors[i * 3 + 2] = warm * 0.82;
    sizes[i] = 1.5 + Math.random() * 4;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    // Normal blend — additive dust was the white “glowing rings” at distance
    blending: THREE.NormalBlending,
    toneMapped: true,
    uniforms: {
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
      uFade: { value: 1.0 },
    },
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      attribute float aSize;
      attribute vec3 color;
      varying vec3 vColor;
      varying float vFade;
      uniform float uPixelRatio;
      uniform float uFade;
      void main() {
        vColor = color;
        vFade = uFade;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float dist = max(100.0, -mv.z);
        gl_PointSize = aSize * uPixelRatio * (70.0 / dist) * uFade;
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <logdepthbuf_pars_fragment>
      varying vec3 vColor;
      varying float vFade;
      void main() {
        #include <logdepthbuf_fragment>
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv);
        if (d > 0.5) discard;
        float a = smoothstep(0.5, 0.05, d) * 0.28 * vFade;
        if (a < 0.015) discard;
        gl_FragColor = vec4(vColor * 0.75, a);
      }
    `,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 3;
  return points;
}

function createRingPlanetShadow(planetR) {
  // Darken a sector — simple translucent disc suggesting umbra on rings
  const geo = new THREE.RingGeometry(planetR * 1.2, planetR * 2.35, 64, 1, 0, Math.PI * 0.55);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.z = planetR * 0.0015;
  mesh.renderOrder = 1;
  return mesh;
}
