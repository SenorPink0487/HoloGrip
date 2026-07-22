let bridge = null;

export function setThreeBridge(nextBridge) {
  bridge = nextBridge || null;
}

export function getThreeBridge() {
  return bridge;
}

export function callBridge(name, ...args) {
  const fn = bridge?.[name];
  if (typeof fn !== 'function') return undefined;
  return fn(...args);
}

