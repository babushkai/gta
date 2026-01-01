import * as THREE from 'three';

export const MathUtils = {
  clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  },

  lerp(start: number, end: number, t: number): number {
    return start + (end - start) * t;
  },

  smoothstep(edge0: number, edge1: number, x: number): number {
    const t = MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  },

  randomRange(min: number, max: number): number {
    return min + Math.random() * (max - min);
  },

  randomInt(min: number, max: number): number {
    return Math.floor(MathUtils.randomRange(min, max + 1));
  },

  degToRad(degrees: number): number {
    return degrees * (Math.PI / 180);
  },

  radToDeg(radians: number): number {
    return radians * (180 / Math.PI);
  },

  distance2D(x1: number, z1: number, x2: number, z2: number): number {
    const dx = x2 - x1;
    const dz = z2 - z1;
    return Math.sqrt(dx * dx + dz * dz);
  },

  angleBetween(from: THREE.Vector3, to: THREE.Vector3): number {
    const direction = to.clone().sub(from);
    return Math.atan2(direction.x, direction.z);
  },

  shortestAngle(from: number, to: number): number {
    let diff = to - from;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return diff;
  },

  pointInCircle(px: number, pz: number, cx: number, cz: number, radius: number): boolean {
    const dx = px - cx;
    const dz = pz - cz;
    return dx * dx + dz * dz <= radius * radius;
  },

  pointInRect(
    px: number,
    pz: number,
    rx: number,
    rz: number,
    rw: number,
    rh: number
  ): boolean {
    return px >= rx && px <= rx + rw && pz >= rz && pz <= rz + rh;
  },

  mapRange(
    value: number,
    inMin: number,
    inMax: number,
    outMin: number,
    outMax: number
  ): number {
    return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
  },

  randomPointInCircle(centerX: number, centerZ: number, radius: number): THREE.Vector2 {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * radius;
    return new THREE.Vector2(
      centerX + r * Math.cos(angle),
      centerZ + r * Math.sin(angle)
    );
  },

  easeInQuad(t: number): number {
    return t * t;
  },

  easeOutQuad(t: number): number {
    return t * (2 - t);
  },

  easeInOutQuad(t: number): number {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  },

  easeInCubic(t: number): number {
    return t * t * t;
  },

  easeOutCubic(t: number): number {
    return --t * t * t + 1;
  },

  easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
  },

  formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  },

  formatMoney(amount: number): string {
    return `$${amount.toLocaleString()}`;
  }
};
