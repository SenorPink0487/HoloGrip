import * as THREE from 'three';
import {
  createEarthSurfaceMaterial,
  createSolidEarthMaterial,
  createCloudMaterial,
  createAtmosphereMaterial,
} from './earthShaders.js';
import { createKspStyleEarth } from './earthTerrain.js';
import { createSaturnRingSystem } from './planetaryRings.js';
import { createSunVisual } from './sun.js';
import {
  BODY_RADIUS_RATIOS,
  ORBIT_AU,
  createSolarScale,
} from './solarScale.js';

/**
 * Visual Earth radius (compressed globe — whole solar system is display-scaled).
 * The launch site is NOT free-scale: it uses real metres → visual via METERS_TO_VISUAL
 * so Starbase / stack match true size relative to this globe.
 */
export const EARTH_RADIUS = 14000;

/** Mean Earth radius in real metres (WGS84-ish). */
export const REAL_EARTH_RADIUS_M = 6_371_000;

/**
 * 1 real metre in scene units. Pad, tower, rocket are built in metres then
 * parented under a group with this scale → site : Earth = real ratio.
 * ≈ 0.002198 with EARTH_RADIUS 14000.
 */
export const METERS_TO_VISUAL = EARTH_RADIUS / REAL_EARTH_RADIUS_M;

/**
 * Shared cinematic handoff on altitude **in real metres AGL**.
 * (siteMeters group converts metres → globe-proportion world units.)
 *
 * Designed as a long cross-dissolve, not a hard set-change:
 *   START  — atmosphere limb + soft curvature cues begin
 *   END    — Earth disc is solid; pad structures still linger
 *   PAD_OUT — flat site / sky dome fully gone
 */
export const CINEMATIC_HANDOFF_START = 4_500; // ~4.5 km — early limb / haze
export const CINEMATIC_HANDOFF_END = 78_000; // ~78 km — solid globe
/** Pad / sky fully gone only after the globe is solid. */
export const CINEMATIC_PAD_OUT_END = 125_000;
/** Soft LEO band (~400 km) in real metres. */
export const CINEMATIC_LEO_VISUAL = 400_000;

/**
 * Texture registry: local first, remote CDN fallback, solid color last-resort.
 * Offline-safe — never leaves materials pure black on load failure.
 */
const TEX = {
  earthDay: {
    // Clear SSS continent map (prefer 2k original, then 4k upsample)
    local: '/textures/earth_day_4k.jpg',
    remote:
      'https://upload.wikimedia.org/wikipedia/commons/c/c3/Solarsystemscope_texture_2k_earth_daymap.jpg',
    color: 0x6a9cc8,
  },
  earthDayFallback: {
    local: '/textures/earth_day_hi.jpg',
    remote: 'https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-blue-marble.jpg',
    color: 0x6a9cc8,
  },
  earthNormal: {
    local: '/textures/earth_normal.jpg',
    remote:
      'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r172/examples/textures/planets/earth_normal_2048.jpg',
    color: 0x8080ff,
  },
  earthBump: {
    // NASA GEBCO elevation 4K — mountain / trench relief
    local: '/textures/earth_bump_hi.jpg',
    remote: 'https://cdn.jsdelivr.net/gh/turban/webgl-earth@master/images/elev_bump_4k.jpg',
    color: 0x808080,
  },
  earthSpec: {
    local: '/textures/earth_water_hi.jpg',
    remote: 'https://cdn.jsdelivr.net/gh/turban/webgl-earth@master/images/water_4k.png',
    color: 0x222222,
  },
  earthSpecFallback: {
    local: '/textures/earth_spec.jpg',
    remote:
      'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r172/examples/textures/planets/earth_specular_2048.jpg',
    color: 0x222222,
  },
  // Real satellite cloud deck (Blue Marble look — primary)
  // Solar System Scope 8K equirectangular, NASA imagery / CC BY 4.0
  earthClouds: {
    local: '/textures/earth_clouds_8k.jpg',
    remote:
      'https://commons.wikimedia.org/wiki/Special:FilePath/Solarsystemscope_texture_8k_earth_clouds.jpg',
    color: 0xdddddd,
  },
  // NASA Blue Marble combined cloud layer (2001, public domain)
  earthCloudsNasa: {
    local: '/textures/nasa_clouds_2k.jpg',
    remote:
      'https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud_combined_2048.jpg',
    color: 0xdddddd,
  },
  // Dense fair-weather: ONLY as high wisps with hard threshold in shader
  earthCloudsHi: {
    local: '/textures/earth_clouds_hi.jpg',
    remote: 'https://cdn.jsdelivr.net/gh/turban/webgl-earth@master/images/fair_clouds_4k.png',
    color: 0xdddddd,
  },
  earthCloudsFallback: {
    local: '/textures/earth_clouds_4k.jpg',
    remote:
      'https://cdn.jsdelivr.net/gh/jeromeetienne/threex.planets@master/images/earthcloudmap.jpg',
    color: 0xdddddd,
  },
  // three.js classic day map with deep navy oceans (Blue Marble family)
  earthAtmosDay: {
    local: '/textures/earth_atmos_2048.jpg',
    remote:
      'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r172/examples/textures/planets/earth_atmos_2048.jpg',
    color: 0x1a3a6a,
  },
  earthLights: {
    // NASA Black Marble 2016 city lights (8K)
    local: '/textures/earth_night_hi.jpg',
    remote:
      'https://eoimages.gsfc.nasa.gov/images/imagerecords/144000/144898/BlackMarble_2016_01deg.jpg',
    color: 0x000000,
  },
  earthLightsFallback: {
    local: '/textures/earth_lights.png',
    remote:
      'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r172/examples/textures/planets/earth_lights_2048.png',
    color: 0x000000,
  },
  moon: {
    local: '/textures/moon.jpg',
    remote:
      'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r172/examples/textures/planets/moon_1024.jpg',
    color: 0x888880,
  },
  mars: {
    local: '/textures/mars.jpg',
    remote:
      'https://cdn.jsdelivr.net/gh/jeromeetienne/threex.planets@master/images/marsmap1k.jpg',
    color: 0xa05030,
  },
  jupiter: {
    local: '/textures/jupiter.jpg',
    remote:
      'https://cdn.jsdelivr.net/gh/jeromeetienne/threex.planets@master/images/jupitermap.jpg',
    color: 0xc8a070,
  },
  venus: {
    local: '/textures/venus.jpg',
    remote:
      'https://cdn.jsdelivr.net/gh/jeromeetienne/threex.planets@master/images/venusmap.jpg',
    color: 0xc8b070,
  },
  mercury: {
    local: '/textures/mercury.jpg',
    remote:
      'https://cdn.jsdelivr.net/gh/jeromeetienne/threex.planets@master/images/mercurymap.jpg',
    color: 0x777770,
  },
  saturn: {
    local: '/textures/saturn.jpg',
    remote:
      'https://cdn.jsdelivr.net/gh/jeromeetienne/threex.planets@master/images/saturnmap.jpg',
    color: 0xc8b080,
  },
  sun: { local: '/textures/sun_4k.jpg', remote: null, color: 0xffd060 },
  sunFallback: { local: '/textures/sun_2k.jpg', remote: null, color: 0xffd060 },
  milkyWayCubeLocal: '/textures/milkyway/',
  milkyWayCubeRemote:
    'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r172/examples/textures/cube/MilkyWay/',
};

const CUBE_FACES = [
  'dark-s_px.jpg',
  'dark-s_nx.jpg',
  'dark-s_py.jpg',
  'dark-s_ny.jpg',
  'dark-s_pz.jpg',
  'dark-s_nz.jpg',
];

/**
 * Deep space + realistic Earth + solar system bodies.
 *
 * Lighting model:
 *   pad: sun + weak ambient/hemi + near shadow light
 *   vacuum: parallel sunlight only (no ambient / hemi / bounce wash)
 */
export function createSpace(scene) {
  const root = new THREE.Group();
  root.name = 'SpaceSystem';
  scene.add(root);

  scene.background = new THREE.Color(0x000000);
  // Lighter haze so the pad site reads kilometers deep (was 0.00085 ≈ 1 km)
  scene.fog = new THREE.FogExp2(0x8aa8c4, 0.00028);

  const loader = new THREE.TextureLoader();
  loader.crossOrigin = 'anonymous';
  const maxAniso = 16;

  /** Solid-color canvas texture used as last-resort offline fallback. */
  function makeSolidTex(hex, colorSpace = THREE.SRGBColorSpace) {
    const c = document.createElement('canvas');
    c.width = c.height = 4;
    const ctx = c.getContext('2d');
    ctx.fillStyle = `#${hex.toString(16).padStart(6, '0')}`;
    ctx.fillRect(0, 0, 4, 4);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = colorSpace;
    t.needsUpdate = true;
    return t;
  }

  /**
   * Bake richer Blue-Marble colors into day albedo pixels.
   * Raw day maps + ACES often look washed out; this rewrites the texture so
   * MeshBasicMaterial shows deeper oceans and more saturated land for sure.
   */
  function bakeIssOceanColor(tex) {
    const img = tex.image;
    if (!img || !img.width || img.width < 16) return;
    try {
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      const id = ctx.getImageData(0, 0, c.width, c.height);
      const d = id.data;
      const clampByte = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

      for (let i = 0; i < d.length; i += 4) {
        let r = d[i];
        let g = d[i + 1];
        let b = d[i + 2];
        const blueDom = b - Math.max(r, g);
        const luma0 = 0.299 * r + 0.587 * g + 0.114 * b;
        const cool = b - (r + g) * 0.5;

        // Ocean mask: blue-dominant or dark cool navy
        let ocean = 0;
        if (blueDom > 6) ocean = Math.min(1, (blueDom - 6) / 35);
        if (luma0 < 110 && cool > -5) {
          ocean = Math.max(ocean, (1 - luma0 / 110) * Math.min(1, (cool + 5) / 40));
        }
        // Keep green land / desert out of the ocean remap
        if (g > b + 8) ocean *= 0.12;
        if (r > b + 15 && r > g) ocean *= 0.2;

        if (ocean > 0.08) {
          // Deeper azure (not pale cyan) — Blue Marble / ISS disc midtones
          const depth = 1 - Math.min(1, luma0 / 140);
          const tR = 28 + depth * 18; // ~28–46
          const tG = 95 + depth * 20; // ~95–115
          const tB = 175 + depth * 35; // ~175–210
          const k = Math.min(1, ocean * 0.9);
          r = r * (1 - k) + tR * k;
          g = g * (1 - k) + tG * k;
          b = b * (1 - k) + tB * k;
        }

        // --- Vibrancy: saturation + mild contrast (fixes washed-out land) ---
        let rf = r / 255;
        let gf = g / 255;
        let bf = b / 255;
        const luma = 0.299 * rf + 0.587 * gf + 0.114 * bf;

        // Land gets stronger chroma push; ocean a lighter one
        const land = 1 - ocean;
        const satBoost = 1.0 + 0.42 * land + 0.18 * ocean;
        rf = luma + (rf - luma) * satBoost;
        gf = luma + (gf - luma) * satBoost;
        bf = luma + (bf - luma) * satBoost;

        // Land greens / deserts: nudge toward richer foliage & warm soil
        if (land > 0.4) {
          const greenBias = Math.max(0, gf - Math.max(rf, bf));
          const warmBias = Math.max(0, rf - bf) * Math.max(0, 1 - greenBias * 4);
          gf += greenBias * 0.22 * land;
          rf += warmBias * 0.1 * land;
          // Slight deep-green for dense vegetation
          if (greenBias > 0.04) {
            rf *= 1 - 0.08 * land;
            bf *= 1 - 0.06 * land;
          }
        }

        // Soft S-curve contrast so midtones aren't milky
        const contrast = 1.12;
        rf = (rf - 0.5) * contrast + 0.5;
        gf = (gf - 0.5) * contrast + 0.5;
        bf = (bf - 0.5) * contrast + 0.5;

        // Mild overall lift so night-side reading still works with MeshBasic
        rf = Math.pow(Math.max(rf, 0), 0.96) * 1.02;
        gf = Math.pow(Math.max(gf, 0), 0.96) * 1.02;
        bf = Math.pow(Math.max(bf, 0), 0.96) * 1.02;

        d[i] = Math.round(clampByte(rf * 255));
        d[i + 1] = Math.round(clampByte(gf * 255));
        d[i + 2] = Math.round(clampByte(bf * 255));
      }
      ctx.putImageData(id, 0, 0);
      tex.image = c;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.version = (tex.version || 0) + 1;
      tex.needsUpdate = true;
      console.info('[space] baked richer earth day colors', c.width, 'x', c.height);
    } catch (err) {
      console.warn('[space] earth day color bake failed', err);
    }
  }

  /**
   * Load texture: local → remote → solid color.
   * Uses THREE.TextureLoader's native Texture object (image fills in async).
   * Materials that hold this reference update automatically when ready.
   * @param {(tex: THREE.Texture) => void} [onReady] called after image adopted
   */
  function loadTex(spec, colorSpace = THREE.SRGBColorSpace, onReady = null) {
    const entry =
      typeof spec === 'string'
        ? { local: spec, remote: null, color: 0x666666 }
        : spec;
    const fallbackColor = entry.color ?? 0x666666;

    const configure = (tex) => {
      tex.colorSpace = colorSpace;
      tex.anisotropy = maxAniso;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.magFilter = THREE.LinearFilter;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.generateMipmaps = true;
      tex.flipY = true;
      tex.needsUpdate = true;
      return tex;
    };

    // Start with a solid so materials never sample a null image
    const tex = configure(makeSolidTex(fallbackColor, colorSpace));

    const adopt = (loaded) => {
      tex.image = loaded.image;
      tex.colorSpace = colorSpace;
      tex.anisotropy = maxAniso;
      tex.magFilter = THREE.LinearFilter;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.generateMipmaps = true;
      tex.flipY = true;
      // Bump version so WebGLTextures reallocates for new dimensions
      tex.version = (tex.version || 0) + 1;
      tex.needsUpdate = true;
      onReady?.(tex);
    };

    const tryUrl = (url, onFail) => {
      if (!url) {
        onFail?.();
        return;
      }
      loader.load(
        url,
        (loaded) => adopt(loaded),
        undefined,
        () => {
          console.warn('[space] texture failed:', url);
          onFail?.();
        }
      );
    };

    tryUrl(entry.local, () => {
      tryUrl(entry.remote, () => {
        console.warn('[space] using solid fallback for', entry.local);
      });
    });

    return tex;
  }

  // ----- Shared sun direction (updated each frame from Earth→Sun) -----
  // Initial guess; syncPadLights overwrites from actual Earth / Sun positions.
  const sunDir = new THREE.Vector3(1, 0.15, 0.35).normalize();
  /**
   * Sun at world origin — true heliocentric frame.
   * All planets share one horizontal (XZ) orbital plane through the sun.
   */
  const sunPos = new THREE.Vector3(0, 0, 0);
  /** Body sizes are real relative ratios; heliocentric distances use a shared
   * compressed display AU so the system remains practical to explore. */
  const solarScale = createSolarScale(EARTH_RADIUS);
  const AU = solarScale.AU;

  // ----- Milky Way cubemap (local first) -----
  let milkyCube = null;
  let milkyReady = false;
  const cubeLoader = new THREE.CubeTextureLoader();
  cubeLoader.crossOrigin = 'anonymous';

  const onMilkyLoaded = (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    milkyCube = tex;
    milkyReady = true;
    // Background only — never use MW as IBL (metals would reflect bright
    // galactic bands and trip bloom). Pad keeps RoomEnvironment from main.
  };

  /** Soft pad IBL captured once; cleared in deep space so planets stay dark. */
  let padEnvironment = null;

  cubeLoader.setPath(TEX.milkyWayCubeLocal);
  milkyCube = cubeLoader.load(
    CUBE_FACES,
    onMilkyLoaded,
    undefined,
    () => {
      console.warn('[space] local milky way failed, trying CDN');
      cubeLoader.setPath(TEX.milkyWayCubeRemote);
      cubeLoader.load(
        CUBE_FACES,
        onMilkyLoaded,
        undefined,
        (err) => console.warn('[space] milky way cubemap failed', err)
      );
    }
  );

  // Sharp stars live in a CubeTexture background (not Points) — see createDeepSky.
  const skySystem = createDeepSky(root, EARTH_RADIUS, scene);

  // =========================================================================
  // EARTH (heliocentric — position set with the rest of the solar system)
  // =========================================================================
  const earthGroup = new THREE.Group();
  earthGroup.name = 'EarthSystem';
  root.add(earthGroup);

  // Reliable full-daylight Earth:
  // Direct TextureLoader for day map + MeshBasicMaterial (no custom bind issues).
  const configureMap = (tex, colorSpace = THREE.SRGBColorSpace) => {
    tex.colorSpace = colorSpace;
    tex.anisotropy = maxAniso;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;
    return tex;
  };

  // Declared first so async texture onReady can assign without TDZ errors
  let earthMat = null;

  // Day map: bake ISS cyan oceans into pixels when the image arrives
  const earthDay = loadTex(TEX.earthDay, THREE.SRGBColorSpace, (tex) => {
    bakeIssOceanColor(tex);
    if (earthMat) {
      earthMat.map = tex;
      earthMat.needsUpdate = true;
    }
  });
  const earthNormal = loadTex(TEX.earthNormal, THREE.NoColorSpace);
  // Elevation (GEBCO) drives KSP-style radial displacement on the crust mesh
  const earthBump = loadTex(TEX.earthBump, THREE.NoColorSpace, (tex) => {
    if (earthMat?.setElevationMap) earthMat.setElevationMap(tex);
  });
  const earthSpec = loadTex(TEX.earthSpec, THREE.NoColorSpace);
  const earthLights = loadTex(TEX.earthLights);
  const earthCloudsMain = loadTex(TEX.earthClouds);

  const earthSpin = new THREE.Group();
  earthSpin.rotation.y = -1.65;
  earthSpin.rotation.z = (23.4 * Math.PI) / 180;
  earthGroup.add(earthSpin);

  // KSP-style crust: high-tessellation sphere + heightmap vertex displacement.
  // Oceans stay near sea-level radius; land/peaks push outward (exaggerated).
  // Elevation starts null so the solid-color placeholder bump does not warp the globe.
  const earthTerrain = createKspStyleEarth(EARTH_RADIUS, {
    dayMap: earthDay,
    elevMap: null,
    sunDir,
  });
  earthMat = earthTerrain.material;
  const earth = earthTerrain.mesh;
  earth.visible = false;
  earthSpin.add(earth);
  // If bump already resolved (cached), enable displacement immediately
  if (earthBump.image && earthBump.image.width > 16) {
    earthMat.setElevationMap(earthBump);
  }

  // Kept for optional lighting experiments / sunDir list compatibility
  const earthMatShader = createEarthSurfaceMaterial({
    dayMap: earthDay,
    nightMap: earthLights,
    normalMap: earthNormal,
    specMap: earthSpec,
    bumpMap: earthBump,
    sunDir,
  });

  // Real satellite cloud deck (8K SSS / NASA Blue Marble style)
  const cloudMat = createCloudMaterial({
    cloudMap: earthCloudsMain,
    sunDir,
    soft: false,
  });
  cloudMat.uniforms.uOpacity.value = 0.72;
  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_RADIUS * 1.006, 160, 112),
    cloudMat
  );
  clouds.frustumCulled = false;
  clouds.castShadow = false;
  clouds.visible = false;
  clouds.renderOrder = 1;
  earthSpin.add(clouds);

  // Thin high cirrus from NASA cloud composite (soft threshold, low opacity)
  const earthCloudsNasa = loadTex(TEX.earthCloudsNasa);
  const cloudHighMat = createCloudMaterial({
    cloudMap: earthCloudsNasa,
    sunDir,
    soft: true,
  });
  cloudHighMat.uniforms.uOpacity.value = 0.18;
  const cloudsHigh = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_RADIUS * 1.012, 96, 64),
    cloudHighMat
  );
  cloudsHigh.frustumCulled = false;
  cloudsHigh.castShadow = false;
  cloudsHigh.visible = false;
  cloudsHigh.renderOrder = 1;
  earthSpin.add(cloudsHigh);

  const atmoOuterMat = createAtmosphereMaterial({
    sunDir,
    outer: true,
    planetRadius: EARTH_RADIUS,
  });
  const atmoOuter = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_RADIUS * 1.04, 96, 64),
    atmoOuterMat
  );
  atmoOuter.frustumCulled = false;
  atmoOuter.castShadow = false;
  atmoOuter.visible = false;
  atmoOuter.renderOrder = 2;
  earthGroup.add(atmoOuter);

  const atmoInnerMat = createAtmosphereMaterial({
    sunDir,
    outer: false,
    planetRadius: EARTH_RADIUS,
  });
  const atmoInner = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_RADIUS * 1.012, 96, 64),
    atmoInnerMat
  );
  atmoInner.frustumCulled = false;
  atmoInner.castShadow = false;
  atmoInner.visible = false;
  atmoInner.renderOrder = 2;
  earthGroup.add(atmoInner);

  const haze = new THREE.Mesh(
    new THREE.SphereGeometry(1, 4, 2),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  haze.visible = false;
  earthGroup.add(haze);

  let earthFadeMode = 'hidden';
  // Cached fade state so we skip redundant material/light thrash every frame
  let lastFadeKey = -1;
  let lastSpaceResult = {
    exposure: 1.05,
    bloomBias: 0,
    inSpace: false,
    spaceFactor: 0,
    deepSpace: 0,
    earthFade: 0,
    celestial: 0,
  };
  const fogColor = scene.fog?.color ?? new THREE.Color(0x000000);
  // Pad/day: solid black. Vacuum: star cubemap (skySystem owns the switch).
  const spaceBg = new THREE.Color(0x000000);
  scene.background = spaceBg;
  scene.backgroundIntensity = 1;

  // =========================================================================
  // SOLAR SYSTEM BODIES — orbital elements (compressed but relative scale)
  // =========================================================================
  const planetsGroup = new THREE.Group();
  planetsGroup.name = 'SolarSystemBodies';
  planetsGroup.visible = false;
  root.add(planetsGroup);

  // World-up for pad surface (+Y from Earth center). Orbits use XZ only.
  const orbitUp = new THREE.Vector3(0, 1, 0);
  // Horizontal orbital basis (same plane for every planet, sun-centered)
  const orbitE1 = new THREE.Vector3(1, 0, 0);
  const orbitE2 = new THREE.Vector3(0, 0, 1);

  /**
   * Unified heliocentric system: every planet (including Earth) shares
   * placeHeliocentric on the world XZ plane. Moon is hierarchical under Earth.
   * Orbit radii = real AU ratios × AU (display scale).
   * Pad / stack ride Earth's surface frame in main.js.
   */
  const R = EARTH_RADIUS;
  /** Master time warp for all orbital motion (1 = period values as written). */
  let orbitTimeScale = 1;

  // Even azimuthal spacing so the system view reads as a full disk, not a clump.
  // Phases stay offset so neighbours never stack on one ray from the sun.
  const planetDefs = [
    {
      key: 'mercury',
      name: 'Mercury',
      radius: R * BODY_RADIUS_RATIOS.mercury,
      orbitRadius: AU * ORBIT_AU.mercury,
      angle: 0.35,
      period: 42,
      incl: 0,
      map: TEX.mercury,
      roughness: 1,
      segs: 32,
      pathColor: 0x9aa3ad,
    },
    {
      key: 'venus',
      name: 'Venus',
      radius: R * BODY_RADIUS_RATIOS.venus,
      orbitRadius: AU * ORBIT_AU.venus,
      angle: 1.55,
      period: 68,
      incl: 0,
      map: TEX.venus,
      roughness: 0.75,
      segs: 40,
      pathColor: 0xc9b07a,
    },
    {
      key: 'mars',
      name: 'Mars',
      radius: R * BODY_RADIUS_RATIOS.mars,
      orbitRadius: AU * ORBIT_AU.mars,
      angle: 3.4,
      period: 100,
      incl: 0,
      map: TEX.mars,
      roughness: 0.95,
      segs: 40,
      glow: 0xcc6644,
      pathColor: 0xc07050,
    },
    {
      key: 'jupiter',
      name: 'Jupiter',
      radius: R * BODY_RADIUS_RATIOS.jupiter,
      orbitRadius: AU * ORBIT_AU.jupiter,
      angle: 4.6,
      period: 170,
      incl: 0,
      map: TEX.jupiter,
      roughness: 0.85,
      segs: 48,
      glow: 0xffddaa,
      pathColor: 0xc4a882,
    },
    {
      key: 'saturn',
      name: 'Saturn',
      radius: R * BODY_RADIUS_RATIOS.saturn,
      orbitRadius: AU * ORBIT_AU.saturn,
      angle: 5.9,
      period: 240,
      incl: 0,
      map: TEX.saturn,
      roughness: 0.82,
      segs: 48,
      glow: 0xffddaa,
      oblate: 0.9,
      rings: true,
      pathColor: 0xd0c090,
    },
  ];

  // Earth opposite the inner-planet cluster for readable layout
  const earthDef = {
    key: 'earth',
    name: 'Earth',
    radius: R * BODY_RADIUS_RATIOS.earth,
    orbitRadius: AU * ORBIT_AU.earth,
    angle: 2.45,
    period: 85,
    incl: 0,
    pathColor: 0x5a9fd4,
    isEarth: true,
  };

  // Moon: local orbit in Earth-centered frame (horizontal XZ relative to Earth)
  const moonDef = {
    key: 'moon',
    name: 'Moon',
    radius: R * BODY_RADIUS_RATIOS.moon,
    orbitRadius: solarScale.moonOrbitRadius,
    angle: 0.8,
    period: 32,
    incl: 0,
    map: TEX.moon,
    roughness: 1,
    segs: 64,
    aroundEarth: true,
    pathColor: 0xa8b4c8,
  };

  for (const def of [...planetDefs, earthDef, moonDef]) {
    def.omega = (Math.PI * 2) / def.period;
  }

  const orbits = [];
  const orbitPaths = [];
  const planetRefs = { earth, sun: null };
  let saturnRings = null;
  const tmpPos = new THREE.Vector3();
  const tmpSurface = new THREE.Vector3();

  /**
   * Heliocentric placement on the shared horizontal plane (world XZ).
   * All planets share sunPos.y — no inclination / out-of-plane motion.
   */
  function placeHeliocentric(def, out) {
    const c = Math.cos(def.angle);
    const s = Math.sin(def.angle);
    out.set(
      sunPos.x + c * def.orbitRadius,
      sunPos.y,
      sunPos.z + s * def.orbitRadius
    );
  }

  /** Moon offset in Earth-local space — also flat on Earth's equatorial XZ. */
  function placeMoonLocal(def, out) {
    out.set(
      Math.cos(def.angle) * def.orbitRadius,
      0,
      Math.sin(def.angle) * def.orbitRadius
    );
  }

  /** Thin closed heliocentric path (horizontal ring around the sun). */
  function createOrbitPath(def) {
    const segs = 256;
    const pts = new Float32Array(segs * 3);
    const a0 = def.angle;
    for (let i = 0; i < segs; i++) {
      def.angle = (i / segs) * Math.PI * 2;
      placeHeliocentric(def, tmpPos);
      const o = i * 3;
      pts[o] = tmpPos.x;
      pts[o + 1] = tmpPos.y;
      pts[o + 2] = tmpPos.z;
    }
    def.angle = a0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    const mat = new THREE.LineBasicMaterial({
      color: def.pathColor || 0x6a90b8,
      transparent: true,
      // Brighter than before so rings read in system / mid-ascent views
      opacity: def.key === 'earth' ? 0.55 : 0.4,
      depthWrite: false,
      depthTest: true,
      fog: false,
      toneMapped: false,
    });
    const line = new THREE.LineLoop(geo, mat);
    line.name = `OrbitPath_${def.key}`;
    line.frustumCulled = false;
    line.renderOrder = -3;
    line.userData.baseOpacity = mat.opacity;
    // Earth's own path vertex sits on the globe — hide path when close-up
    // or it draws a streak/ring across the surface under log-depth.
    if (def.key === 'earth') {
      line.userData.hideNearEarth = true;
    }
    return line;
  }

  /** Moon path in Earth-local space (child of earthGroup). */
  function createMoonOrbitPath(def) {
    const segs = 128;
    const pts = new Float32Array(segs * 3);
    const a0 = def.angle;
    for (let i = 0; i < segs; i++) {
      def.angle = (i / segs) * Math.PI * 2;
      placeMoonLocal(def, tmpPos);
      const o = i * 3;
      pts[o] = tmpPos.x;
      pts[o + 1] = tmpPos.y;
      pts[o + 2] = tmpPos.z;
    }
    def.angle = a0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    const mat = new THREE.LineBasicMaterial({
      color: def.pathColor || 0xa8b4c8,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      // Must depth-test: with log-depth, untested lines paint a hard ring
      // straight across the Earth disc when the camera is near the planet.
      depthTest: true,
      fog: false,
      toneMapped: false,
    });
    const line = new THREE.LineLoop(geo, mat);
    line.name = 'OrbitPath_moon';
    line.frustumCulled = false;
    line.renderOrder = -3;
    line.userData.baseOpacity = 0.4;
    // Hidden unless camera is far enough (see updateByAltitude / setOrbitPathsVisible)
    line.userData.minShowDist = def.orbitRadius * 1.8;
    return line;
  }

  // Orbit rings live on the space root (not inside planetsGroup) so they can
  // fade in earlier than the planet meshes and stay drawn when bodies hide.
  const orbitPathsGroup = new THREE.Group();
  orbitPathsGroup.name = 'OrbitPaths';
  orbitPathsGroup.visible = false;
  root.add(orbitPathsGroup);
  /** null = auto by altitude; true/false = user/camera preset override */
  /** true only while 全日系 camera is active */
  let orbitPathsOverride = false;
  let moonOrbitPath = null;

  // --- Earth on the shared heliocentric track ---
  placeHeliocentric(earthDef, tmpPos);
  earthGroup.position.copy(tmpPos);
  planetRefs.earth = earth;
  earth.userData.radius = earthDef.radius;
  {
    const earthPath = createOrbitPath(earthDef);
    orbitPathsGroup.add(earthPath);
    orbitPaths.push(earthPath);
  }
  orbits.push({ def: earthDef, mesh: earthGroup, isEarth: true });

  // --- Other planets (same placeHeliocentric) ---
  for (const def of planetDefs) {
    placeHeliocentric(def, tmpPos);
    const body = createPlanet({
      name: def.name,
      radius: def.radius,
      map: loadTex(def.map),
      position: tmpPos.clone(),
      roughness: def.roughness,
      segs: def.segs,
      glow: def.glow,
    });
    if (def.oblate) body.mesh.scale.set(1, def.oblate, 1);
    planetsGroup.add(body.mesh);
    planetRefs[def.key] = body.mesh;

    if (def.rings) {
      saturnRings = createSaturnRingSystem(tmpPos.clone(), def.radius, {
        sunDir,
        tiltX: Math.PI / 2.32,
        tiltZ: 0.42,
      });
      planetsGroup.add(saturnRings);
      const ringShadow = createSaturnBodyRingShadow(def.radius, sunDir);
      body.mesh.add(ringShadow);
    }

    const path = createOrbitPath(def);
    orbitPathsGroup.add(path);
    orbitPaths.push(path);
    orbits.push({ def, mesh: body.mesh });
  }

  // --- Moon: child of Earth (one hierarchy, one time scale) ---
  placeMoonLocal(moonDef, tmpPos);
  const moonBody = createPlanet({
    name: moonDef.name,
    radius: moonDef.radius,
    map: loadTex(moonDef.map),
    position: tmpPos.clone(),
    roughness: moonDef.roughness,
    segs: moonDef.segs,
  });
  earthGroup.add(moonBody.mesh);
  moonBody.mesh.visible = false;
  planetRefs.moon = moonBody.mesh;
  moonOrbitPath = createMoonOrbitPath(moonDef);
  moonOrbitPath.visible = false;
  earthGroup.add(moonOrbitPath);
  orbits.push({ def: moonDef, mesh: moonBody.mesh, isMoon: true });

  // =========================================================================
  // SUN — main parallel light (no shadow) + near shadow caster for pad
  // =========================================================================
  // Warm golden key light to match the sun visual corona
  const sunLight = new THREE.DirectionalLight(0xffe8a8, 3.8);
  sunLight.position.copy(sunPos);
  sunLight.castShadow = false; // lighting only
  scene.add(sunLight);
  scene.add(sunLight.target);

  // Dedicated near shadow light — covers launch pad + stack (~hundreds of m)
  // Anchored to Earth surface each frame (pad rides the heliocentric orbit).
  const shadowLight = new THREE.DirectionalLight(0xffe8a8, 0.0);
  const shadowDist = 450;
  scene.add(shadowLight);
  scene.add(shadowLight.target);
  shadowLight.castShadow = true;
  // 1024 is enough for pad/stack; 2048 was a major cost while Earth faded in
  shadowLight.shadow.mapSize.set(1024, 1024);
  const sc = 160;
  shadowLight.shadow.camera.near = shadowDist - 400;
  shadowLight.shadow.camera.far = shadowDist + 300;
  shadowLight.shadow.camera.left = -sc;
  shadowLight.shadow.camera.right = sc;
  shadowLight.shadow.camera.top = 220;
  shadowLight.shadow.camera.bottom = -40;
  shadowLight.shadow.bias = -0.0003;
  shadowLight.shadow.normalBias = 0.02;
  shadowLight.shadow.camera.updateProjectionMatrix();

  // Weak ambient / hemi only — sole fill baseline
  const ambient = new THREE.AmbientLight(0x1a2638, 0.2);
  scene.add(ambient);
  const hemi = new THREE.HemisphereLight(0x3b5f8f, 0x111822, 0.22);
  scene.add(hemi);
  // Earth albedo bounce (ramps up once in space) — follows Earth center
  const earthBounce = new THREE.DirectionalLight(0x5588cc, 0.0);
  earthBounce.position.copy(earthGroup.position);
  scene.add(earthBounce);

  function getSurfaceOrigin(out = tmpSurface) {
    // Pad sits on +Y from Earth center (cinematic "top" site)
    return out.copy(earthGroup.position).addScaledVector(orbitUp, EARTH_RADIUS);
  }

  function syncPadLights() {
    // All Earth-local lighting uses the actual Earth→Sun direction, not the
    // Sun's direction from the arbitrary heliocentric world origin.
    sunDir.copy(sunPos).sub(earthGroup.position).normalize();
    getSurfaceOrigin(tmpSurface);
    sunLight.target.position.copy(earthGroup.position);
    sunLight.position.copy(earthGroup.position).addScaledVector(sunDir, EARTH_RADIUS * 20);
    shadowLight.target.position.set(tmpSurface.x, tmpSurface.y + 60, tmpSurface.z);
    shadowLight.position
      .copy(tmpSurface)
      .addScaledVector(sunDir, shadowDist);
    earthBounce.position.copy(earthGroup.position);
  }
  syncPadLights();

  // Sun visual — photosphere disk only (no corona / no soft glow sprites)
  // 4k local → 2k local → solid color (via remote slot as second local path)
  const sunMap = loadTex({
    local: TEX.sun.local,
    remote: TEX.sunFallback.local,
    color: TEX.sun.color,
  });
  sunMap.wrapS = THREE.RepeatWrapping;

  // Real mean-radius ratio relative to Earth (~109.2 R⊕).
  const sunRadius = solarScale.sunRadius;
  const sunVisual = createSunVisual({
    position: sunPos,
    radius: sunRadius,
    sunMap,
  });
  root.add(sunVisual.group);
  sunVisual.group.visible = false;
  const sunMesh = sunVisual.mesh;
  planetRefs.sun = sunMesh;

  const spinBodies = [
    { mesh: earthSpin, speed: 0.000012 },
    { mesh: clouds, speed: 0.000035 },
  ];
  for (const { def, mesh, isEarth, isMoon } of orbits) {
    if (isEarth || isMoon) continue; // Earth uses earthSpin; moon is rocky, slow spin ok via mesh
    const spin =
      def.key === 'venus'
        ? -0.000015
        : def.key === 'jupiter'
          ? 0.000035
          : def.key === 'saturn'
            ? 0.000025
            : def.key === 'mars'
              ? 0.00002
              : 0.000018;
    spinBodies.push({ mesh, speed: spin });
  }
  // Slow lunar spin
  spinBodies.push({ mesh: moonBody.mesh, speed: 0.00001 });

  const sunUniforms = [
    earthMat.uniforms.uSunDir,
    earthMatShader.uniforms.uSunDir,
    cloudMat.uniforms.uSunDir,
    cloudHighMat.uniforms.uSunDir,
    atmoOuterMat.uniforms.uSunDir,
    atmoInnerMat.uniforms.uSunDir,
  ];

  // Real-scale planets are sub-pixel in the full-system view. These proxies
  // preserve the meshes at true scale and only provide a small screen-space cue.
  const overviewMarkers = createOverviewMarkers(scene, [
    { key: 'mercury', mesh: planetRefs.mercury, color: 0xa7a39b },
    { key: 'venus', mesh: planetRefs.venus, color: 0xd8bd79 },
    { key: 'earth', mesh: earth, color: 0x5aa9ff },
    { key: 'moon', mesh: planetRefs.moon, color: 0xc4c7ca },
    { key: 'mars', mesh: planetRefs.mars, color: 0xd56f45 },
    { key: 'jupiter', mesh: planetRefs.jupiter, color: 0xd5b08b },
    { key: 'saturn', mesh: planetRefs.saturn, color: 0xe0c88c },
  ]);

  function wrapAngle(a) {
    const twoPi = Math.PI * 2;
    a = a % twoPi;
    return a < 0 ? a + twoPi : a;
  }

  function updateOrbits(dt) {
    const step = dt * orbitTimeScale;
    if (step === 0) {
      syncPadLights();
      return;
    }
    for (const { def, mesh, isMoon } of orbits) {
      def.angle = wrapAngle(def.angle + def.omega * step);
      if (isMoon) {
        placeMoonLocal(def, tmpPos);
        mesh.position.copy(tmpPos);
      } else {
        placeHeliocentric(def, tmpPos);
        mesh.position.copy(tmpPos);
        if (def.rings && saturnRings) {
          saturnRings.position.copy(tmpPos);
        }
      }
    }
    syncPadLights();
  }

  return {
    root,
    earth,
    earthGroup,
    atmo: atmoOuter,
    clouds,
    stars: skySystem.group,
    sunLight,
    shadowLight,
    ambient,
    hemi,
    /** Shared world-space sun direction — wire into pad sky dome etc. */
    sunDir,
    planets: planetRefs,
    EARTH_RADIUS,
    /** Compressed display AU (400 Earth radii) used for heliocentric radii. */
    AU,
    /** Saturn semi-major axis — outer edge of the drawn system */
    outerOrbitRadius: solarScale.outerOrbitRadius,

    setOverviewMarkersVisible(v) {
      overviewMarkers.setVisible(!!v);
    },

    /**
     * Planetary orbit rings — only the 全日系 (system overview) camera shows them.
     * @param {boolean|null} v  true = show; false/null = hide (no altitude auto)
     */
    setOrbitPathsVisible(v) {
      // null used to mean “altitude auto”; that path lit rings mid-ascent and in
      // LEO free-look. Now only explicit true (system cam) shows the rings.
      orbitPathsOverride = v === true;
      orbitPathsGroup.visible = orbitPathsOverride;
      // Moon ring stays distance-gated in update() — forcing it on paints a
      // hard circle through the Earth disc under logarithmic depth.
      if (moonOrbitPath && !orbitPathsOverride) moonOrbitPath.visible = false;
    },

    setSaturnRingsVisible(v) {
      if (saturnRings) saturnRings.visible = !!v;
    },

    /** Cinematic time warp for heliocentric / lunar orbits (default 1). */
    setOrbitTimeScale(scale) {
      orbitTimeScale = Math.max(0, scale);
    },

    getOrbitTimeScale() {
      return orbitTimeScale;
    },

    /**
     * Transition flat pad site → Earth globe → hard vacuum.
     * Heavy work is skipped when altitude barely moved (prevents per-frame
     * material thrash / shadow toggles during the dual-render window).
     * @returns {{ exposure: number, bloomBias: number, earthFade: number }}
     */
    updateByAltitude(altitude, physicalAltitude = null) {
      const a = Math.max(0, altitude);
      // Telemetry drives vacuum look; visual alt drives the pad↔globe cut.
      const atmosphereAlt = Math.max(
        0,
        physicalAltitude ?? (a / CINEMATIC_LEO_VISUAL) * 100000
      );

      // Sun dir uniforms still need a fresh copy even on early-out
      for (const u of sunUniforms) u.value.copy(sunDir);

      // Quantize so micro camera/altitude jitter does not re-touch materials
      const fadeKey =
        Math.round(a * 0.5) * 100000 + Math.round(atmosphereAlt * 0.02);
      if (fadeKey === lastFadeKey) {
        saturnRings?.userData.setSunDir?.(sunDir);
        return lastSpaceResult;
      }
      lastFadeKey = fadeKey;

      // Continuous climb grade (not a single hard cut):
      //   limb → solid disc → vacuum. Pad/sky linger past END (PAD_OUT_END).
      const toSpace = THREE.MathUtils.smoothstep(atmosphereAlt, 18_000, 140_000);
      const deep = THREE.MathUtils.smoothstep(a, 95_000, CINEMATIC_LEO_VISUAL);
      // Overall handoff envelope (structures / fog / framing)
      const earthFade = THREE.MathUtils.smoothstep(
        a,
        CINEMATIC_HANDOFF_START,
        CINEMATIC_HANDOFF_END
      );
      // Layered reveals — atmosphere first, disc later (avoids glass-ball pop)
      const limbFade = THREE.MathUtils.smoothstep(a, 3_200, 28_000);
      const discFade = THREE.MathUtils.smoothstep(a, 14_000, 68_000);
      const cloudFade = THREE.MathUtils.smoothstep(a, 22_000, 80_000);
      // Stars bleed in as the sky thins (zenith first in the pad dome shader)
      const starReveal = Math.max(
        THREE.MathUtils.smoothstep(atmosphereAlt, 12_000, 95_000),
        THREE.MathUtils.smoothstep(toSpace, 0.05, 0.55),
        deep * 0.85
      );
      // Stars / system — late enough that the climb still feels atmospheric
      const celestial = Math.max(
        THREE.MathUtils.smoothstep(a, 45_000, CINEMATIC_LEO_VISUAL),
        THREE.MathUtils.smoothstep(toSpace, 0.2, 0.55)
      );

      if (scene.fog) {
        // Continuous aerial haze → dark vacuum (blue→near-black, density falls)
        const fogT = Math.max(
          toSpace * 0.92,
          THREE.MathUtils.smoothstep(a, 8_000, 95_000)
        );
        const climbThin = THREE.MathUtils.smoothstep(atmosphereAlt, 0, 55_000);
        if (fogT > 0.94) {
          scene.fog.density = 0;
        } else {
          fogColor.setRGB(
            THREE.MathUtils.lerp(0.58, 0.01, fogT),
            THREE.MathUtils.lerp(0.7, 0.02, fogT),
            THREE.MathUtils.lerp(0.82, 0.05, fogT)
          );
          // Slightly denser low haze early → sells “looking through air”
          const groundFog = THREE.MathUtils.lerp(0.00034, 0.0001, climbThin);
          scene.fog.density = THREE.MathUtils.lerp(groundFog, 0, fogT);
        }
      }

      // Background is owned by skySystem (black on pad, star cubemap in vacuum).

      // Keep the pad IBL bound and fade its intensity continuously. A boolean
      // environment swap made the stainless hull pop from bright to black.
      if (!padEnvironment && scene.environment && toSpace < 0.15) {
        padEnvironment = scene.environment;
      }
      if (padEnvironment) {
        if (scene.environment !== padEnvironment) {
          scene.environment = padEnvironment;
        }
        // Floor IBL so stainless never drops to pure black for a frame
        scene.environmentIntensity = Math.max(0.08, 1 - toSpace * 0.92);
      }

      // Vacuum still needs a tiny fill — zero ambient + black BG = screen flash
      ambient.intensity = THREE.MathUtils.lerp(0.22, 0.04, toSpace);
      hemi.intensity = THREE.MathUtils.lerp(0.24, 0.05, toSpace);
      // Hard sun only in space; drop pad shadows early — Earth fade-in + 1k
      // shadow maps was the main hitch window during ascent.
      sunLight.intensity = THREE.MathUtils.lerp(2.35, 3.15, toSpace);
      const shadowW =
        (1 - toSpace) *
        (1 -
          THREE.MathUtils.smoothstep(
            a,
            CINEMATIC_HANDOFF_START * 0.35,
            CINEMATIC_HANDOFF_END * 0.85
          ));
      shadowLight.intensity = 1.1 * shadowW;
      // One-way: only turn shadows OFF during climb. Re-creating the shadow map
      // mid-ascent black-flashes many GPUs. Pad reset re-enables via warm path.
      if (shadowLight.castShadow && shadowW < 0.1) {
        shadowLight.castShadow = false;
      }
      // Soft Earth bounce once globe is in — fills night side, no pure black voids
      earthBounce.intensity = discFade * THREE.MathUtils.lerp(0.1, 0.28, toSpace);

      // Celestial bodies + orbit rings (later — keep atmosphere readable)
      const showCelestial = celestial > 0.02;
      if (planetsGroup.visible !== showCelestial) {
        planetsGroup.visible = showCelestial;
      }
      if (moonBody.mesh.visible !== showCelestial) {
        moonBody.mesh.visible = showCelestial;
      }
      if (sunVisual.group.visible !== showCelestial) {
        sunVisual.group.visible = showCelestial;
      }

      // Orbit paths: only when setOrbitPathsVisible(true) — 全日系 menu cam.
      // (No altitude auto-show; LEO free-look stays clean.)
      const showOrbits = orbitPathsOverride === true;
      if (orbitPathsGroup.visible !== showOrbits) {
        orbitPathsGroup.visible = showOrbits;
      }
      // Full opacity when system overview forces rings on
      if (showOrbits) {
        for (const line of orbitPaths) {
          if (line.material) {
            const base = line.userData.baseOpacity ?? 0.45;
            line.material.opacity = base;
          }
        }
      }
      // Moon ring visibility is camera-distance gated in update() — never force
      // it on here or a LineLoop paints a hard circle across the Earth disc.

      // Reveal order: limb glow → solid disc → clouds (never a translucent glass ball)
      const showAtmo = limbFade > 0.02;
      const showEarth = discFade > 0.08;
      const showClouds = cloudFade > 0.1;
      const showCloudsHigh = cloudFade > 0.22;
      const showHaze = false;
      if (earth.visible !== showEarth) earth.visible = showEarth;
      if (clouds.visible !== showClouds) clouds.visible = showClouds;
      if (cloudsHigh.visible !== showCloudsHigh) cloudsHigh.visible = showCloudsHigh;
      if (atmoOuter.visible !== showAtmo) atmoOuter.visible = showAtmo;
      if (atmoInner.visible !== showAtmo) atmoInner.visible = showAtmo;
      if (haze.visible !== showHaze) haze.visible = showHaze;

      // Once the disc is on, keep it fully opaque (sort-safe). Softness is the limb.
      const solid = discFade >= 0.22;
      const op = solid ? 1 : THREE.MathUtils.clamp(discFade * 1.35, 0, 1);
      earthMat.opacity = op;
      earthMat.transparent = !solid;
      earthMat.depthWrite = true;
      earthMat.depthTest = true;
      if (earthMat?.uniforms?.uAlpha) {
        earthMat.uniforms.uAlpha.value = op;
      }
      if (earthMatShader?.uniforms?.uAlpha) {
        earthMatShader.uniforms.uAlpha.value = op;
      }

      let mode = 'hidden';
      if (solid) mode = 'solid';
      else if (showEarth || showAtmo) mode = 'fading';
      earthFadeMode = mode;

      // Atmosphere peaks mid-ascent (bright limb) then eases in hard vacuum
      const atmoPeak = THREE.MathUtils.clamp(
        limbFade * (1.05 - toSpace * 0.35) * (0.55 + discFade * 0.55),
        0,
        1.15
      );
      atmoOuterMat.uniforms.uIntensity.value = atmoPeak * 0.95;
      atmoInnerMat.uniforms.uIntensity.value = atmoPeak * 0.42;
      cloudMat.uniforms.uOpacity.value =
        cloudFade * THREE.MathUtils.lerp(0.72, 0.48, toSpace);
      cloudHighMat.uniforms.uOpacity.value =
        cloudFade * THREE.MathUtils.lerp(0.18, 0.11, toSpace);

      saturnRings?.userData.setSunDir?.(sunDir);
      // Stars ramp with atmospheric thinning — pad sky dome alpha lets them through
      skySystem.setAltitudeVisibility(starReveal);

      lastSpaceResult = {
        exposure: THREE.MathUtils.lerp(1.1, 1.04, deep),
        // Keep vacuum bloom near-zero — star cubemap + UnrealBloom near threshold
        // reads as continuous black/sparkle flashes after the handoff.
        bloomBias: THREE.MathUtils.lerp(0.06, 0.04, deep),
        inSpace: toSpace > 0.65,
        spaceFactor: toSpace,
        deepSpace: deep,
        earthFade,
        limbFade,
        discFade,
        celestial,
      };
      return lastSpaceResult;
    },

    /**
     * Force-compile Earth / sky / celestial materials before launch so the
     * first pad→space handoff does not hitch on shader/pipeline creation.
     */
    warmGpu(renderer, camera) {
      if (!renderer || !camera) return;
      const restore = [
        [earth, earth.visible],
        [clouds, clouds.visible],
        [cloudsHigh, cloudsHigh.visible],
        [atmoOuter, atmoOuter.visible],
        [atmoInner, atmoInner.visible],
        [haze, haze.visible],
        [planetsGroup, planetsGroup.visible],
        [moonBody.mesh, moonBody.mesh.visible],
        [sunVisual.group, sunVisual.group.visible],
      ];
      earth.visible = true;
      clouds.visible = true;
      cloudsHigh.visible = true;
      atmoOuter.visible = true;
      atmoInner.visible = true;
      haze.visible = true;
      planetsGroup.visible = true;
      moonBody.mesh.visible = true;
      sunVisual.group.visible = true;
      earthMat.transparent = false;
      earthMat.opacity = 1;
      earthMat.depthWrite = true;
      try {
        renderer.compile(scene, camera);
      } catch (_) {
        /* ignore compile warm failures */
      }
      for (const [obj, vis] of restore) obj.visible = vis;
      earthMat.transparent = false;
      earthMat.opacity = 1;
      earthMat.depthWrite = true;
      earthFadeMode = 'hidden';
      lastFadeKey = -1;
    },

    getEarthCenter() {
      return earthGroup.position.clone();
    },

    /** Non-allocating Earth center (reuse caller buffer). */
    getEarthCenterInto(out) {
      return out.copy(earthGroup.position);
    },

    /** World position of the launch-site surface point (Earth center + local up). */
    getSurfaceOrigin(out) {
      return getSurfaceOrigin(out);
    },

    getPlanetWorldPos(name) {
      if (name === 'earth') {
        return earthGroup.position.clone();
      }
      const p = planetRefs[name];
      if (!p) return null;
      const v = new THREE.Vector3();
      p.getWorldPosition(v);
      return v;
    },

    /** Lock the procedural star reveal when a caller owns the flight view. */
    setStarVisibility(factor = 1) {
      skySystem.setAltitudeVisibility(factor);
    },

    /** Pad / abort: clear one-way star latch so pad can use solid black again. */
    resetStarReveal() {
      skySystem.resetStarReveal?.();
    },

    update(dt, camera) {
      updateOrbits(dt);
      const spinStep = dt * orbitTimeScale * 60;
      if (spinStep > 0) {
        for (const b of spinBodies) b.mesh.rotation.y += b.speed * spinStep;
        // Clouds stay locked to the crust (no independent drift)
        saturnRings?.userData.spinStep?.(0.00035 * spinStep);
      }
      // Keep cloud UV time frozen so the deck does not crawl
      if (cloudMat.uniforms.uTime) cloudMat.uniforms.uTime.value = 0;
      if (cloudHighMat.uniforms.uTime) cloudHighMat.uniforms.uTime.value = 0;

      // Orbit path depth hygiene (log-depth + huge scales punch lines through Earth)
      if (camera) {
        // Saturn rings (ice dust + bright disc) bloom into a white flare when far.
        // Fade only the rings — planet body keeps original materials.
        if (saturnRings?.userData?.setDistanceFade && planetRefs.saturn) {
          planetRefs.saturn.getWorldPosition(tmpPos);
          const r = planetRefs.saturn.userData.radius || 1;
          const distR = camera.position.distanceTo(tmpPos) / r;
          const ringNear = 1.0 - THREE.MathUtils.smoothstep(10, 60, distR);
          saturnRings.userData.setDistanceFade(ringNear);
        }

        const dist = camera.position.distanceTo(earthGroup.position);
        // Moon ring only when far enough that it sits outside the disc cleanly
        if (moonOrbitPath) {
          const minD = moonOrbitPath.userData.minShowDist || EARTH_RADIUS * 10;
          const wantMoon =
            orbitPathsGroup.visible && dist > minD && dist > EARTH_RADIUS * 8;
          if (moonOrbitPath.visible !== wantMoon) moonOrbitPath.visible = wantMoon;
          if (wantMoon && moonOrbitPath.material) {
            const base = moonOrbitPath.userData.baseOpacity ?? 0.4;
            moonOrbitPath.material.opacity = base;
          }
        }
        // Earth's own heliocentric path has a vertex on the globe — hide close-up
        for (const line of orbitPaths) {
          if (!line.userData.hideNearEarth) continue;
          const want = orbitPathsGroup.visible && dist > EARTH_RADIUS * 10;
          if (line.visible !== want) line.visible = want;
        }
      }

      // Deep-sky shells sit at infinity — follow camera every frame
      skySystem.update(dt, camera);
      sunVisual.update(dt, camera);
      overviewMarkers.update(camera);
    },

    /**
     * Re-anchor camera-locked sky/overlay objects after a flight controller
     * moves the camera. The main loop updates orbital state before flight, so
     * without this second lightweight sync the star shell lags by one frame;
     * that subpixel slip is perceived as stars flashing while the ship moves.
     */
    syncCamera(camera) {
      if (!camera) return;
      skySystem.update(0, camera);
      sunVisual.update(0, camera);
      overviewMarkers.update(camera);
    },
  };
}

// ---------------------------------------------------------------------------
// Deep sky: star CUBEMAP background + faint dust shells
// ---------------------------------------------------------------------------
//
// New approach (after Points and equirect meshes both failed UX):
//   Stars are baked once into a CubeTexture and assigned to scene.background.
//   Three.js draws cubemap backgrounds with view-rotation only — no Points
//   re-rasterization, no large-world float jitter, no FOV sprite shimmer.
//   Ship speed/translation literally cannot make background stars blink.
//
function createDeepSky(parent, earthR, scene) {
  const group = new THREE.Group();
  group.name = 'DeepSky';
  parent.add(group);

  const skyR = earthR * 16;
  const spaceBg = new THREE.Color(0x000000);
  // Higher-res cube + sparse bake → clean pinpoints, not a noisy snow field
  const starCube = bakeStarCubeTexture(1536);

  // Soft galactic glow (mesh) — UV sampling is motion-stable
  const milkyBand = createGalacticDustBand(skyR * 0.99, {
    tint: [165, 185, 230],
    opacity: 0.0,
  });
  milkyBand.material.opacity = 0;
  group.add(milkyBand);

  const zodi = createZodiacalLight(skyR * 0.97);
  zodi.material.opacity = 0;
  group.add(zodi);

  let spaceFactor = 0;
  let lastStarRevealQ = -1;
  /** Peak star reveal this mission — intensity only rises (stops reverse-fade strobe). */
  let peakStarReveal = 0;
  let starsLatched = false;

  function applyBackground(reveal) {
    // One-way: once stars appear, never swap back to solid black until reset.
    // Swapping CubeTexture ↔ Color mid-ascent flashes the whole frame.
    peakStarReveal = Math.max(peakStarReveal, reveal);
    const r = peakStarReveal;

    if (r < 0.02 && !starsLatched) {
      if (scene.background !== spaceBg) scene.background = spaceBg;
      scene.backgroundIntensity = 1;
      return;
    }
    starsLatched = true;
    if (scene.background !== starCube) scene.background = starCube;
    // Coarse steps only — fine intensity hunting strobes against the pad sky
    const bi =
      r >= 0.9
        ? 1
        : r >= 0.55
          ? 0.75
          : r >= 0.25
            ? 0.45
            : 0.22;
    if (Math.abs((scene.backgroundIntensity ?? 1) - bi) > 0.04) {
      scene.backgroundIntensity = bi;
    }
  }

  // Start black (pad)
  applyBackground(0);

  return {
    group,
    starCube,
    /** Call on abort / new launch so pad can return to solid black sky. */
    resetStarReveal() {
      peakStarReveal = 0;
      starsLatched = false;
      lastStarRevealQ = -1;
      spaceFactor = 0;
      if (scene.background !== spaceBg) scene.background = spaceBg;
      scene.backgroundIntensity = 1;
      milkyBand.material.opacity = 0;
      zodi.material.opacity = 0;
    },
    setAltitudeVisibility(factor) {
      spaceFactor = THREE.MathUtils.clamp(factor, 0, 1);
      // Fully open: lock and never re-touch intensity (stops LEO strobing)
      if (spaceFactor >= 0.995 || peakStarReveal >= 0.995) {
        if (lastStarRevealQ !== 999) {
          lastStarRevealQ = 999;
          applyBackground(1);
          milkyBand.material.opacity = 0.018;
          zodi.material.opacity = 0.008;
        }
        return;
      }
      const reveal = Math.pow(spaceFactor, 1.25);
      // Very coarse quantize — fewer backgroundIntensity writes
      const rq = Math.round(reveal * 8);
      if (rq === lastStarRevealQ) return;
      lastStarRevealQ = rq;
      applyBackground(reveal);
      const use = Math.max(peakStarReveal, reveal);
      milkyBand.material.opacity = use * 0.018;
      zodi.material.opacity = use * 0.008;
    },
    update(_dt, camera) {
      if (camera) group.position.copy(camera.position);
    },
  };
}

/** Deterministic 0..1 hash for stable star bake. */
function starHash(n) {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Project a unit direction onto a cube face (Three.js / WebGL order:
 * +X,-X,+Y,-Y,+Z,-Z). Returns face index and canvas UV in [0,1], origin top-left.
 */
function dirToCubeFaceUV(x, y, z) {
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const az = Math.abs(z);
  let face;
  let u;
  let v;
  if (ax >= ay && ax >= az) {
    if (x > 0) {
      face = 0; // +X
      u = 0.5 * (-z / ax + 1);
      v = 0.5 * (-y / ax + 1);
    } else {
      face = 1; // -X
      u = 0.5 * (z / ax + 1);
      v = 0.5 * (-y / ax + 1);
    }
  } else if (ay >= ax && ay >= az) {
    if (y > 0) {
      face = 2; // +Y
      u = 0.5 * (x / ay + 1);
      v = 0.5 * (z / ay + 1);
    } else {
      face = 3; // -Y
      u = 0.5 * (x / ay + 1);
      v = 0.5 * (-z / ay + 1);
    }
  } else if (z > 0) {
    face = 4; // +Z
    u = 0.5 * (x / az + 1);
    v = 0.5 * (-y / az + 1);
  } else {
    face = 5; // -Z
    u = 0.5 * (-x / az + 1);
    v = 0.5 * (-y / az + 1);
  }
  // Canvas Y grows downward
  return { face, u, v: 1 - v };
}

/**
 * Bake a clean cinematic star cubemap.
 * Sparse + steep magnitude curve + tiny soft cores (no hard 1px snow / crosses).
 */
function bakeStarCubeTexture(faceSize = 1536) {
  const canvases = [];
  const ctxs = [];
  for (let f = 0; f < 6; f++) {
    const c = document.createElement('canvas');
    c.width = c.height = faceSize;
    const ctx = c.getContext('2d');
    // Near-black space fill (not pure #000) so ACES / free-look voids never
    // read as a solid "missing render" slab when stars are sparse on a face.
    ctx.fillStyle = '#03060e';
    ctx.fillRect(0, 0, faceSize, faceSize);
    // Soft additive stamps
    ctx.globalCompositeOperation = 'lighter';
    canvases.push(c);
    ctxs.push(ctx);
  }

  /** Tight gaussian-ish disc — reads as a real star, not a pixel or plus sign. */
  const paint = (face, u, v, radiusPx, rgb, peakA) => {
    const ctx = ctxs[face];
    const x = u * faceSize;
    const y = v * faceSize;
    const r = Math.max(0.9, radiusPx);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0.0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${peakA})`);
    g.addColorStop(0.35, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${peakA * 0.35})`);
    g.addColorStop(1.0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };

  // Mostly neutral white; rare cool/warm — avoids candy confetti look
  const spectral = (t) => {
    if (t < 0.06) return [200, 215, 255];
    if (t < 0.14) return [220, 228, 255];
    if (t < 0.75) return [240, 242, 250];
    if (t < 0.92) return [255, 240, 220];
    return [255, 220, 190];
  };

  // Field stars — dense enough that free-look space never looks like a black plate
  const fieldN = 4800;
  for (let i = 0; i < fieldN; i++) {
    // Light MW bias only (0.22) — heavy clustering looked like noise clumps
    const dir = sampleSkyDirection(i, fieldN, 0.22, 'mixed');
    const { face, u, v } = dirToCubeFaceUV(dir.x, dir.y, dir.z);
    const mag = Math.pow(starHash(i * 11.7 + 4.1), 3.6);
    const radiusPx = 0.9 + mag * 1.15;
    const peakA = 0.28 + mag * 0.42;
    paint(face, u, v, radiusPx, spectral(starHash(i * 1.9 + 6.2)), peakA);
  }

  // Readable mid stars
  const midN = 720;
  for (let i = 0; i < midN; i++) {
    const dir = sampleSkyDirection(i + 20000, midN, 0.28, 'mixed');
    const { face, u, v } = dirToCubeFaceUV(dir.x, dir.y, dir.z);
    const mag = Math.pow(starHash(i * 8.8 + 120.0), 2.5);
    const radiusPx = 1.2 + mag * 1.4;
    const peakA = 0.48 + mag * 0.4;
    paint(face, u, v, radiusPx, spectral(starHash(i * 2.7 + 130.0)), peakA);
  }

  // Sparse heroes — soft core only, no diffraction spikes
  const brightN = 48;
  for (let i = 0; i < brightN; i++) {
    const dir = sampleSkyDirection(i + 50000, brightN, 0.12, 'mixed');
    const { face, u, v } = dirToCubeFaceUV(dir.x, dir.y, dir.z);
    const mag = 0.45 + starHash(i * 21.0 + 402.0) * 0.55;
    const radiusPx = 1.7 + mag * 1.5;
    const peakA = 0.62 + mag * 0.28;
    paint(
      face,
      u,
      v,
      radiusPx,
      spectral(starHash(i * 23.0 + 403.0) * 0.4),
      peakA
    );
  }

  const cube = new THREE.CubeTexture(canvases);
  cube.colorSpace = THREE.SRGBColorSpace;
  cube.needsUpdate = true;
  cube.magFilter = THREE.LinearFilter;
  cube.minFilter = THREE.LinearMipmapLinearFilter;
  cube.generateMipmaps = true;
  return cube;
}

/**
 * Unit direction on the sphere.
 * - mixed: Fibonacci base + MW-band clustering (realistic density texture)
 * - uniform: pure Fibonacci lattice
 * milkyBias: probability a star is drawn into the galactic plane
 */
function sampleSkyDirection(i, count, milkyBias = 0.35, distribution = 'mixed') {
  const hash = (n) => {
    const x = Math.sin(n * 127.1 + i * 311.7) * 43758.5453;
    return x - Math.floor(x);
  };

  if (distribution === 'uniform' || hash(1.1) > milkyBias) {
    // Fibonacci sphere + jitter so lattice doesn't read as a grid
    const t = (i + 0.5) / count;
    const y = 1 - 2 * t;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    const jt = (hash(2.3) - 0.5) * 0.09;
    const jp = (hash(4.7) - 0.5) * 0.06;
    return new THREE.Vector3(
      Math.cos(theta + jt) * r,
      THREE.MathUtils.clamp(y + jp, -1, 1),
      Math.sin(theta + jt) * r
    ).normalize();
  }

  // Galactic plane: tight core + broader halo (real MW density profile)
  const along = hash(6.1) * Math.PI * 2;
  // Box-Muller-ish latitude (more stars near plane)
  const u1 = Math.max(1e-4, hash(8.2));
  const u2 = hash(9.3);
  const gauss = Math.sqrt(-2 * Math.log(u1)) * Math.cos(Math.PI * 2 * u2);
  const core = hash(10.4) < 0.55;
  const lat = gauss * (core ? 0.07 : 0.2);
  // Occasional void (dark dust lane) — push slightly off plane
  const lanePush = hash(11.5) < 0.08 ? (hash(12.6) - 0.5) * 0.18 : 0;
  const tilt = 1.05; // ~60° to celestial equator-ish
  const cl = Math.cos(lat + lanePush);
  const x = Math.cos(along) * cl;
  const y = Math.sin(lat + lanePush);
  const z = Math.sin(along) * cl;
  const cy = y * Math.cos(tilt) - z * Math.sin(tilt);
  const cz = y * Math.sin(tilt) + z * Math.cos(tilt);
  return new THREE.Vector3(x, cy, cz).normalize();
}

/** Stellar colour temperature mix — muted, not candy sci-fi. */
function starColor(brightBias = 0.2) {
  const r = Math.random();
  let c;
  // Spectral mix skewed to K/G/M; few true O/B (as in naked-eye sky)
  if (r < 0.03 + brightBias * 0.06) c = new THREE.Color(0.62, 0.76, 1.0);
  else if (r < 0.12 + brightBias * 0.1) c = new THREE.Color(0.82, 0.88, 1.0);
  else if (r < 0.55) c = new THREE.Color(0.96, 0.97, 1.0);
  else if (r < 0.78) c = new THREE.Color(1.0, 0.95, 0.86);
  else if (r < 0.92) c = new THREE.Color(1.0, 0.86, 0.68);
  else c = new THREE.Color(1.0, 0.7, 0.52);
  // Keep luma modest so UnrealBloom doesn't turn the sky into disco balls
  const luma = 0.55 + Math.random() * 0.35 + brightBias * 0.28;
  c.multiplyScalar(luma);
  return c;
}

function createStarLayer({
  count,
  sizeMin,
  sizeMax,
  map,
  milkyBias = 0.35,
  brightBias,
  opacity,
  magPower = 2.2,
  maxLuma = 0,
  distribution = 'mixed',
}) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    // Store UNIT directions only — infinite projection ignores translation
    const dir = sampleSkyDirection(i, count, milkyBias, distribution);
    positions[i * 3] = dir.x;
    positions[i * 3 + 1] = dir.y;
    positions[i * 3 + 2] = dir.z;
    const c = starColor(brightBias);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
    // Power-law magnitude: vast majority faint pinpricks
    const mag = Math.pow(Math.random(), magPower);
    sizes[i] = sizeMin + mag * (sizeMax - sizeMin);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: map },
      uOpacity: { value: opacity },
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
      // Keep under bloom extract threshold — edge of threshold = disco flash
      uMaxLuma: { value: maxLuma > 0 ? maxLuma : 10.0 },
    },
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      attribute float aSize;
      attribute vec3 color;
      varying vec3 vColor;
      varying float vAlpha;
      varying float vMag;
      uniform float uPixelRatio;
      uniform float uOpacity;
      void main() {
        vColor = color;
        vAlpha = uOpacity;
        float pr = max(uPixelRatio, 1.0);
        // Integer sizes: avoid sub-pixel size swimming when the camera moves
        gl_PointSize = max(2.0, floor(aSize * pr + 0.5));
        vMag = clamp((aSize - 1.4) / 3.5, 0.0, 1.0);

        // Infinite background: apply rotation only (w = 0 drops translation).
        // Star vertices are unit directions — no huge world coords, so
        // accelerating the ship cannot introduce float jitter / sparkle.
        vec4 viewDir = modelViewMatrix * vec4(position, 0.0);
        vec3 vd = normalize(viewDir.xyz);
        // Must sit beyond camera.near (pilot near can be ~2–4). Distance is
        // constant in view space so ship translation never changes precision.
        vec4 mv = vec4(vd * 2000.0, 1.0);
        gl_Position = projectionMatrix * mv;
        // Bias to far plane so nothing z-fights the sky (depthTest is off too)
        gl_Position.z = gl_Position.w * 0.99999;
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <logdepthbuf_pars_fragment>
      uniform sampler2D uMap;
      uniform float uMaxLuma;
      varying vec3 vColor;
      varying float vAlpha;
      varying float vMag;
      void main() {
        #include <logdepthbuf_fragment>
        vec2 pc = gl_PointCoord - vec2(0.5);
        float d2 = dot(pc, pc);
        // Outside the sprite circle — soft kill (no hard discard pop)
        if (d2 > 0.25) discard;
        float d = sqrt(d2);
        vec4 tex = texture2D(uMap, gl_PointCoord);
        // Sharp hot core, almost no halo (crisp night-sky pinpoints)
        float core = exp(-d2 * mix(90.0, 42.0, vMag));
        float halo = exp(-d2 * 14.0) * (0.03 + 0.08 * vMag);
        float shape = max(core + halo, tex.r * core);
        float edge = 1.0 - smoothstep(0.42, 0.5, d);
        float a = shape * vAlpha * max(tex.a, 0.5) * edge;
        vec3 col = vColor * (0.55 + core * 1.15);
        col = min(col, vec3(uMaxLuma));
        gl_FragColor = vec4(col, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });

  Object.defineProperty(mat, 'opacity', {
    get() {
      return mat.uniforms.uOpacity.value;
    },
    set(v) {
      mat.uniforms.uOpacity.value = v;
    },
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = -5;
  // Unit directions — bounding sphere for safety (culling is off)
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);
  return { points, material: mat };
}

/** Tight white core + almost no blue glow — real stars are diffraction points. */
function makePinpointStarTexture(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const half = size / 2;
  const g = ctx.createRadialGradient(half, half, 0, half, half, half);
  g.addColorStop(0.0, 'rgba(255,255,255,1)');
  g.addColorStop(0.06, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.14, 'rgba(245,248,255,0.45)');
  g.addColorStop(0.32, 'rgba(210,220,255,0.08)');
  g.addColorStop(0.55, 'rgba(0,0,0,0)');
  g.addColorStop(1.0, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.LinearFilter;
  // Star sprites are screen-sized; mip transitions shimmer during movement.
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

/** @deprecated alias — kept for any external callers */
function makeSoftStarTexture(size) {
  return makePinpointStarTexture(size);
}

/** Subtle 4-spike diffraction (not thick cartoon crosshairs). */
function makeSpikeStarTexture(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const cx = size / 2;
  const cy = size / 2;
  // Tiny hot core
  let g = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.12);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const spike = (angle, alpha = 0.55, halfLen = 0.42, halfW = 0.006) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    const grad = ctx.createLinearGradient(0, -size * halfLen, 0, size * halfLen);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.55)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.55, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(-size * halfW, -size * halfLen, size * halfW * 2, size * halfLen * 2);
    ctx.restore();
  };
  // Primary diffraction cross — thin
  spike(0, 0.5, 0.44, 0.0055);
  spike(Math.PI / 2, 0.5, 0.44, 0.0055);
  // Weaker diagonals
  spike(Math.PI / 4, 0.18, 0.28, 0.004);
  spike(-Math.PI / 4, 0.18, 0.28, 0.004);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

/**
 * Continuous galactic plane glow with dark dust lanes.
 * Avoids sparse "blob polka" which reads as fake nebula stickers.
 */
function createGalacticDustBand(
  radius,
  { tint = [165, 185, 230], opacity = 0.12 } = {}
) {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const [tr, tg, tb] = tint;

  // Continuous equatorial band (vertical center of equirect strip)
  const band = ctx.createLinearGradient(0, 0, 0, 512);
  band.addColorStop(0.0, 'rgba(0,0,0,0)');
  band.addColorStop(0.28, `rgba(${tr},${tg},${tb},0)`);
  band.addColorStop(0.42, `rgba(${tr},${tg},${tb},0.09)`);
  band.addColorStop(0.5, `rgba(${tr},${tg},${tb},0.2)`);
  band.addColorStop(0.58, `rgba(${tr},${tg},${tb},0.09)`);
  band.addColorStop(0.72, `rgba(${tr},${tg},${tb},0)`);
  band.addColorStop(1.0, 'rgba(0,0,0,0)');
  ctx.fillStyle = band;
  ctx.fillRect(0, 0, 2048, 512);

  // Longitude brightness variation (galactic center bulge + fainter anti-center)
  const bulge = ctx.createRadialGradient(1024, 256, 0, 1024, 256, 700);
  bulge.addColorStop(
    0,
    `rgba(${Math.min(255, tr + 30)},${Math.min(255, tg + 20)},${tb},0.22)`
  );
  bulge.addColorStop(0.35, `rgba(${tr},${tg},${tb},0.08)`);
  bulge.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = bulge;
  ctx.fillRect(0, 0, 2048, 512);

  // Secondary glow patches along the plane
  for (let i = 0; i < 28; i++) {
    const x = Math.random() * 2048;
    const y = 220 + Math.random() * 72;
    const rx = 90 + Math.random() * 220;
    const ry = 14 + Math.random() * 36;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
    const a0 = 0.04 + Math.random() * 0.08;
    g.addColorStop(0, `rgba(${tr}, ${tg}, ${tb}, ${a0})`);
    g.addColorStop(0.5, `rgba(${tr}, ${tg}, ${tb}, ${a0 * 0.3})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, (Math.random() - 0.5) * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }

  // Dark dust lanes
  ctx.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 18; i++) {
    const x = Math.random() * 2048;
    const y = 240 + Math.random() * 40;
    const g = ctx.createRadialGradient(x, y, 0, x, y, 70 + Math.random() * 90);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.2)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, 110 + Math.random() * 60, 12 + Math.random() * 14, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    opacity,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 32), mat);
  mesh.rotation.z = 1.05;
  mesh.rotation.y = 0.5;
  mesh.renderOrder = -7;
  mesh.frustumCulled = false;
  return mesh;
}

function createZodiacalLight(radius) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  // Thin ecliptic band — warm but very soft (real zodiacal light is subtle)
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, 'rgba(255,220,160,0)');
  g.addColorStop(0.42, 'rgba(255,215,150,0.02)');
  g.addColorStop(0.5, 'rgba(255,230,190,0.22)');
  g.addColorStop(0.58, 'rgba(255,215,150,0.02)');
  g.addColorStop(1, 'rgba(255,220,160,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 256);
  // Brighter near sun direction (one side of the band)
  const gx = ctx.createLinearGradient(0, 0, 1024, 0);
  gx.addColorStop(0, 'rgba(255,255,255,0.08)');
  gx.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  gx.addColorStop(0.55, 'rgba(255,255,255,0.2)');
  gx.addColorStop(1, 'rgba(255,255,255,0.06)');
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = gx;
  ctx.fillRect(0, 0, 1024, 256);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    opacity: 0.06,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    color: 0xffe8c8,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 24), mat);
  mesh.rotation.z = 0.35;
  mesh.renderOrder = -8;
  mesh.frustumCulled = false;
  return mesh;
}

/**
 * Soft umbra cast by rings onto Saturn's globe (equatorial band darkening).
 * Cheaper and more stable than true shadow maps on transparent rings.
 */
function createSaturnBodyRingShadow(planetR, sunDir) {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    depthTest: true,
    uniforms: {
      uSunDir: { value: sunDir.clone().normalize() },
      uStrength: { value: 0.5 },
    },
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <logdepthbuf_pars_fragment>
      uniform vec3 uSunDir;
      uniform float uStrength;
      varying vec3 vPos;
      void main() {
        #include <logdepthbuf_fragment>
        // Local planet coords: rings ≈ equatorial plane
        vec3 n = normalize(vPos);
        float lat = abs(n.y);
        float band = smoothstep(0.32, 0.0, lat);
        float sunElev = uSunDir.y;
        float side = sunElev > 0.0 ? smoothstep(0.08, -0.15, n.y) : smoothstep(0.08, -0.15, -n.y);
        float eq = smoothstep(0.1, 0.0, lat) * 0.3;
        float shadow = clamp(band * 0.7 * side + eq, 0.0, 1.0) * uStrength;
        if (shadow < 0.02) discard;
        gl_FragColor = vec4(0.0, 0.0, 0.0, shadow);
      }
    `,
  });
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(planetR * 1.002, 64, 48),
    mat
  );
  mesh.renderOrder = 1;
  mesh.name = 'SaturnRingShadow';
  return mesh;
}

function createPlanet({
  name,
  radius,
  map,
  position,
  roughness = 0.9,
  metalness = 0.02,
  segs = 48,
  glow = null,
}) {
  const mat = new THREE.MeshStandardMaterial({
    map,
    // Keep the source texture visible on the night side without flattening
    // the surface into an unlit solid-color sphere.
    color: 0x888888,
    emissive: 0xffffff,
    emissiveMap: map,
    emissiveIntensity: 0.72,
    roughness,
    metalness: Math.min(metalness, 0.04),
    fog: false,
  });

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, segs, Math.floor(segs * 0.75)),
    mat
  );
  mesh.name = name;
  mesh.position.copy(position);
  mesh.userData.radius = radius;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;

  if (glow) {
    const glowMesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 1.04, 28, 20),
      new THREE.MeshBasicMaterial({
        color: glow,
        transparent: true,
        opacity: 0.05,
        side: THREE.BackSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        fog: false,
      })
    );
    mesh.add(glowMesh);
  }

  return { mesh, radius };
}

/**
 * Fixed-pixel visual cues for the full-system view. Planet diameters map
 * logarithmically from 6–14 px; the Moon uses a compact 4 px cue.
 */
function createOverviewMarkers(parent, entries) {
  const group = new THREE.Group();
  group.name = 'SolarSystemOverviewMarkers';
  group.visible = false;
  parent.add(group);

  const minR = BODY_RADIUS_RATIOS.mercury;
  const maxR = BODY_RADIUS_RATIOS.jupiter;
  const logSpan = Math.log(maxR / minR);
  const markers = [];

  for (const { key, mesh, color } of entries) {
    if (!mesh) continue;
    const ratio = BODY_RADIUS_RATIOS[key] || minR;
    const pixels =
      key === 'moon'
        ? 4
        : 6 + 8 * THREE.MathUtils.clamp(Math.log(ratio / minR) / logSpan, 0, 1);
    const texture = createOverviewMarkerTexture(color);
    const marker = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: texture,
        color: 0xffffff,
        transparent: true,
        opacity: 0.95,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      })
    );
    marker.name = `OverviewMarker_${key}`;
    marker.renderOrder = 1000;
    marker.frustumCulled = false;
    group.add(marker);
    markers.push({ marker, mesh, pixels });
  }

  const worldPos = new THREE.Vector3();
  return {
    group,
    setVisible(v) {
      group.visible = v;
    },
    update(camera) {
      if (!group.visible || !camera) return;
      const viewportHeight = Math.max(1, window.innerHeight || 1);
      const halfFov = THREE.MathUtils.degToRad(camera.fov * 0.5);
      for (const { marker, mesh, pixels } of markers) {
        mesh.getWorldPosition(worldPos);
        marker.position.copy(worldPos);
        const distance = Math.max(1, camera.position.distanceTo(worldPos));
        const worldDiameter =
          2 * Math.tan(halfFov) * distance * (pixels / viewportHeight);
        marker.scale.setScalar(worldDiameter);
      }
    },
  };
}

function createOverviewMarkerTexture(color) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const c = new THREE.Color(color);
  const rgb = `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}`;
  const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
  gradient.addColorStop(0, `rgba(${rgb},1)`);
  gradient.addColorStop(0.34, `rgba(${rgb},0.98)`);
  gradient.addColorStop(0.58, `rgba(${rgb},0.42)`);
  gradient.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}
