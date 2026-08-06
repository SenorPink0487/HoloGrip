/** Lightweight pointer-event joystick for touch-capable devices. */
export function createVirtualJoystick({ root, label = '移动', onChange, onActiveChange } = {}) {
  if (!root) return null;
  // Lab pages deliberately include this control. Do not gate it on the
  // WebView's pointer profile; iPadOS can report a desktop pointer device.
  root.hidden = false;
  root.removeAttribute('hidden');
  root.style.display = 'block';
  root.setAttribute('aria-label', `${label}摇杆`);
  const knob = root.querySelector('[data-joystick-knob]');
  let pointerId = null;
  let visible = true;
  const emit = (x, y) => onChange?.({ x, y });
  const reset = () => {
    if (pointerId == null) return;
    pointerId = null;
    root.classList.remove('is-active');
    if (knob) knob.style.transform = 'translate3d(-50%, -50%, 0)';
    emit(0, 0);
    onActiveChange?.(false);
  };
  const update = (clientX, clientY) => {
    const rect = root.getBoundingClientRect();
    const radius = Math.max(1, Math.min(rect.width, rect.height) * 0.34);
    const dx = clientX - (rect.left + rect.width / 2);
    const dy = clientY - (rect.top + rect.height / 2);
    const length = Math.hypot(dx, dy) || 1;
    const scale = Math.min(1, radius / length);
    const x = (dx * scale) / radius;
    const y = (dy * scale) / radius;
    if (knob) knob.style.transform = `translate3d(calc(-50% + ${x * radius}px), calc(-50% + ${y * radius}px), 0)`;
    emit(x, y);
  };
  root.addEventListener('pointerdown', (event) => {
    if (pointerId != null) return;
    pointerId = event.pointerId;
    root.setPointerCapture?.(pointerId);
    root.classList.add('is-active');
    onActiveChange?.(true);
    update(event.clientX, event.clientY);
    event.preventDefault();
    event.stopPropagation();
  }, { passive: false });
  root.addEventListener('pointermove', (event) => {
    if (event.pointerId !== pointerId) return;
    update(event.clientX, event.clientY);
    event.preventDefault();
    event.stopPropagation();
  }, { passive: false });
  root.addEventListener('pointerup', reset);
  root.addEventListener('pointercancel', reset);
  root.addEventListener('lostpointercapture', reset);
  return {
    setVisible(visible) {
      if (visible === this.isVisible) return;
      this.isVisible = visible;
      root.classList.toggle('is-hidden', !visible);
      root.hidden = !visible;
      if (visible) root.style.display = 'block';
      if (!visible) reset();
    },
    isVisible: visible,
    reset,
  };
}
