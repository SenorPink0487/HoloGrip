import * as THREE from 'three';

const N_CARRIERS = 90;

export class Effects {
  constructor(scene, sampleGroup, dims, refs) {
    this.scene = scene;
    this.sampleGroup = sampleGroup;
    this.dims = dims;
    this.refs = refs;

    this.group = new THREE.Group();
    sampleGroup.add(this.group);

    this.state = {
      drift: 0.3,
      field: 0.3,
      carrier: 'N',
      on: false,
      forceDirection: '+z',
      visualScale: { current: 0.3, field: 0.2, voltage: 0.2, thickness: 0.25, drift: 0.2 },
    };
    this.showCarriers = true;
    this.showField = true;
    this.showForce = true;

    this._buildCarriers();
    this._buildFieldLines();
    this._buildForceArrows();
  }

  _buildCarriers() {
    this.carriers = [];
    const geo = new THREE.SphereGeometry(0.14, 12, 12);
    this.matN = new THREE.MeshStandardMaterial({
      color: 0x6dffb0,
      emissive: 0x1f9d63,
      emissiveIntensity: 0.8,
      roughness: 0.3,
    });
    this.matP = new THREE.MeshStandardMaterial({
      color: 0xff8a6d,
      emissive: 0x9d3a1f,
      emissiveIntensity: 0.8,
      roughness: 0.3,
    });

    this.carrierGroup = new THREE.Group();
    this.group.add(this.carrierGroup);

    for (let i = 0; i < N_CARRIERS; i++) {
      const m = new THREE.Mesh(geo, this.matN);
      this._resetCarrier(m, true);
      this.carrierGroup.add(m);
      this.carriers.push(m);
    }
  }

  _resetCarrier(m, randomX = false) {
    const { W, H, D } = this.dims;
    m.position.set(
      randomX ? (Math.random() - 0.5) * W : -W / 2,
      (Math.random() - 0.5) * (H - 0.4),
      (Math.random() - 0.5) * (D - 0.6),
    );
    m.userData.baseZ = m.position.z;
    m.userData.speed = 0.6 + Math.random() * 0.5;
  }

  _buildFieldLines() {
    this.fieldGroup = new THREE.Group();
    this.group.add(this.fieldGroup);
    this.fieldLines = [];

    const positions = [];
    for (let gx = -3; gx <= 3; gx += 1.5) {
      for (let gz = -1.5; gz <= 1.5; gz += 1.5) {
        positions.push([gx, gz]);
      }
    }

    positions.forEach(([gx, gz]) => {
      const lineMat = new THREE.LineDashedMaterial({
        color: 0x7ab8ff,
        dashSize: 0.4,
        gapSize: 0.3,
        transparent: true,
        opacity: 0.55,
      });
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(gx, -3.2, gz),
        new THREE.Vector3(gx, 3.2, gz),
      ]);
      const line = new THREE.Line(geo, lineMat);
      line.computeLineDistances();
      this.fieldGroup.add(line);

      const arrow = new THREE.Mesh(
        new THREE.ConeGeometry(0.12, 0.34, 8),
        new THREE.MeshBasicMaterial({ color: 0x7ab8ff }),
      );
      arrow.position.set(gx, 0, gz);
      this.fieldGroup.add(arrow);
      this.fieldLines.push({ line, arrow, phase: Math.random() });
    });
  }

  _buildForceArrows() {
    this.forceArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, 0),
      2,
      0xffcf5d,
      0.6,
      0.35,
    );
    this.forceArrow.visible = false;
    this.group.add(this.forceArrow);
  }

  setState(s, hall) {
    const physical = hall.state || {};
    this.state.drift = physical.visualScale?.drift ?? hall.drift;
    this.state.field = physical.magneticFieldT ?? s.field;
    this.state.carrier = physical.carrierType ?? s.carrier;
    this.state.on = s.power;
    this.state.forceDirection = physical.forceDirection || '+z';
    this.state.visualScale = physical.visualScale || this.state.visualScale;

    const mat = this.state.carrier === 'N' ? this.matN : this.matP;
    this.carriers.forEach((c) => { c.material = mat; });

    if (this.refs.slab) {
      this.refs.slab.scale.y = 0.55 + this.state.visualScale.thickness * 1.15;
    }

    const faces = this.refs.chargeFaces;
    if (faces) {
      const frontPositive = this.state.carrier === 'P';
      faces.front.material.color.setHex(frontPositive ? 0xff4d4d : 0x4d8bff);
      faces.back.material.color.setHex(frontPositive ? 0x4d8bff : 0xff4d4d);
      const opacity = s.power ? Math.min(0.65, this.state.visualScale.voltage * 0.85) : 0;
      faces.front.material.opacity = opacity;
      faces.back.material.opacity = opacity;
    }
  }

  setVisibility({ carriers, field, force }) {
    if (carriers !== undefined) {
      this.showCarriers = carriers;
      this.carrierGroup.visible = carriers;
    }
    if (field !== undefined) {
      this.showField = field;
      this.fieldGroup.visible = field;
    }
    if (force !== undefined) this.showForce = force;
  }

  update(dt, t) {
    const { W, H, D } = this.dims;
    const on = this.state.on;
    const drift = on ? this.state.drift : 0;
    const fieldScale = this.state.visualScale.field;
    const deflectDir = this.state.forceDirection === '-z' ? -1 : 1;
    const deflect = deflectDir * this.state.visualScale.voltage * 1.15;

    this.carriers.forEach((c) => {
      const sp = c.userData.speed * (drift * 4 + this.state.visualScale.current * 0.8 + (on ? 0.25 : 0));
      c.position.x += sp * dt;
      if (c.position.x > W / 2) this._resetCarrier(c, false);

      const prog = (c.position.x + W / 2) / W;
      const targetZ = c.userData.baseZ + deflect * prog;
      c.position.z += (targetZ - c.position.z) * Math.min(1, dt * 5);
      const lim = D / 2 - 0.2;
      c.position.z = Math.max(-lim, Math.min(lim, c.position.z));

      const e = 0.6 + 0.4 * Math.sin(t * 4 + c.position.x);
      c.material.emissiveIntensity = on ? e : 0.15;
      c.visible = this.showCarriers;
    });

    this.fieldLines.forEach((fl) => {
      fl.phase = (fl.phase + dt * (0.25 + fieldScale * 1.1)) % 1;
      fl.arrow.position.y = -3 + fl.phase * 6;
      fl.arrow.visible = this.showField && fieldScale > 0.01;
      fl.line.material.opacity = 0.2 + 0.65 * fieldScale;
    });
    this.fieldGroup.visible = this.showField;

    if (this.showForce && on && fieldScale > 0.01 && drift > 0.001) {
      this.forceArrow.visible = true;
      const dirZ = Math.sign(deflect) || 1;
      this.forceArrow.setDirection(new THREE.Vector3(0, 0, dirZ));
      this.forceArrow.setLength(0.8 + Math.min(2.2, Math.abs(deflect) * 2.6), 0.5, 0.3);
      this.forceArrow.position.set(0, H / 2 + 0.4, 0);
    } else {
      this.forceArrow.visible = false;
    }
  }
}
