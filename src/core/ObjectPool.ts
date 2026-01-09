import * as THREE from 'three';

/**
 * Generic object pool for reducing garbage collection
 * Reuses objects instead of creating/destroying them
 */
export class ObjectPool<T> {
  private available: T[] = [];
  private inUse: Set<T> = new Set();
  private factory: () => T;
  private reset: (obj: T) => void;
  private maxSize: number;

  constructor(
    factory: () => T,
    reset: (obj: T) => void,
    initialSize: number = 10,
    maxSize: number = 100
  ) {
    this.factory = factory;
    this.reset = reset;
    this.maxSize = maxSize;

    // Pre-populate pool
    for (let i = 0; i < initialSize; i++) {
      this.available.push(factory());
    }
  }

  acquire(): T {
    let obj: T;

    if (this.available.length > 0) {
      obj = this.available.pop()!;
    } else if (this.inUse.size < this.maxSize) {
      obj = this.factory();
    } else {
      // Pool exhausted, return oldest in-use object (force recycle)
      const oldest = this.inUse.values().next().value;
      if (oldest) {
        this.inUse.delete(oldest);
        this.reset(oldest);
        obj = oldest;
      } else {
        obj = this.factory();
      }
    }

    this.inUse.add(obj);
    return obj;
  }

  release(obj: T): void {
    if (!this.inUse.has(obj)) return;

    this.inUse.delete(obj);
    this.reset(obj);

    if (this.available.length < this.maxSize) {
      this.available.push(obj);
    }
  }

  releaseAll(): void {
    this.inUse.forEach(obj => {
      this.reset(obj);
      if (this.available.length < this.maxSize) {
        this.available.push(obj);
      }
    });
    this.inUse.clear();
  }

  getActiveCount(): number {
    return this.inUse.size;
  }

  getAvailableCount(): number {
    return this.available.length;
  }

  dispose(disposeFn?: (obj: T) => void): void {
    if (disposeFn) {
      this.available.forEach(disposeFn);
      this.inUse.forEach(disposeFn);
    }
    this.available = [];
    this.inUse.clear();
  }
}

/**
 * Vector3 pool for reducing allocations in hot paths
 */
export class Vector3Pool {
  private static pool: THREE.Vector3[] = [];
  private static maxSize = 50;

  static acquire(): THREE.Vector3 {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }
    return new THREE.Vector3();
  }

  static release(v: THREE.Vector3): void {
    v.set(0, 0, 0);
    if (this.pool.length < this.maxSize) {
      this.pool.push(v);
    }
  }

  static temp(): THREE.Vector3 {
    // For temporary calculations within a single function
    return this.acquire();
  }
}

/**
 * Matrix4 pool for transform calculations
 */
export class Matrix4Pool {
  private static pool: THREE.Matrix4[] = [];
  private static maxSize = 20;

  static acquire(): THREE.Matrix4 {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }
    return new THREE.Matrix4();
  }

  static release(m: THREE.Matrix4): void {
    m.identity();
    if (this.pool.length < this.maxSize) {
      this.pool.push(m);
    }
  }
}

/**
 * Quaternion pool for rotation calculations
 */
export class QuaternionPool {
  private static pool: THREE.Quaternion[] = [];
  private static maxSize = 20;

  static acquire(): THREE.Quaternion {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }
    return new THREE.Quaternion();
  }

  static release(q: THREE.Quaternion): void {
    q.identity();
    if (this.pool.length < this.maxSize) {
      this.pool.push(q);
    }
  }
}
