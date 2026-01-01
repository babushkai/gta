import * as THREE from 'three';
import { PathNode } from '@/types';

interface AStarNode {
  node: PathNode;
  g: number;
  h: number;
  f: number;
  parent: AStarNode | null;
}

export class Pathfinding {
  private nodes: PathNode[] = [];
  private grid: Map<string, PathNode> = new Map();
  private gridSize: number = 5;

  constructor() {}

  initialize(worldSize: number): void {
    this.generateNavigationGrid(worldSize);
  }

  private generateNavigationGrid(size: number): void {
    const halfSize = size / 2;
    const step = this.gridSize;

    for (let x = -halfSize; x <= halfSize; x += step) {
      for (let z = -halfSize; z <= halfSize; z += step) {
        const node: PathNode = {
          position: new THREE.Vector3(x, 0, z),
          connections: [],
          type: this.determineNodeType(x, z)
        };
        this.nodes.push(node);
        this.grid.set(this.getGridKey(x, z), node);
      }
    }

    this.nodes.forEach(node => {
      node.connections = this.getNeighbors(node);
    });
  }

  private determineNodeType(x: number, z: number): PathNode['type'] {
    const isOnRoad = Math.abs(x % 50) < 8 || Math.abs(z % 50) < 8;
    const isIntersection = Math.abs(x % 50) < 8 && Math.abs(z % 50) < 8;

    if (isIntersection) return 'intersection';
    if (isOnRoad) return 'road';
    if (Math.abs(x % 50) < 12 || Math.abs(z % 50) < 12) return 'sidewalk';
    return 'building';
  }

  private getGridKey(x: number, z: number): string {
    const gridX = Math.round(x / this.gridSize) * this.gridSize;
    const gridZ = Math.round(z / this.gridSize) * this.gridSize;
    return `${gridX},${gridZ}`;
  }

  private getNeighbors(node: PathNode): PathNode[] {
    const neighbors: PathNode[] = [];
    const directions = [
      { x: -1, z: 0 },
      { x: 1, z: 0 },
      { x: 0, z: -1 },
      { x: 0, z: 1 },
      { x: -1, z: -1 },
      { x: 1, z: -1 },
      { x: -1, z: 1 },
      { x: 1, z: 1 }
    ];

    directions.forEach(dir => {
      const key = this.getGridKey(
        node.position.x + dir.x * this.gridSize,
        node.position.z + dir.z * this.gridSize
      );
      const neighbor = this.grid.get(key);
      if (neighbor && neighbor.type !== 'building') {
        neighbors.push(neighbor);
      }
    });

    return neighbors;
  }

  findPath(start: THREE.Vector3, end: THREE.Vector3): THREE.Vector3[] {
    const startNode = this.findNearestNode(start);
    const endNode = this.findNearestNode(end);

    if (!startNode || !endNode) {
      return [end];
    }

    const path = this.astar(startNode, endNode);
    return path.map(node => node.position.clone());
  }

  private findNearestNode(position: THREE.Vector3): PathNode | null {
    let nearest: PathNode | null = null;
    let nearestDistance = Infinity;

    this.nodes.forEach(node => {
      if (node.type === 'building') return;

      const distance = position.distanceTo(node.position);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = node;
      }
    });

    return nearest;
  }

  private astar(start: PathNode, end: PathNode): PathNode[] {
    const openSet: AStarNode[] = [];
    const closedSet: Set<PathNode> = new Set();

    const startANode: AStarNode = {
      node: start,
      g: 0,
      h: this.heuristic(start, end),
      f: 0,
      parent: null
    };
    startANode.f = startANode.g + startANode.h;
    openSet.push(startANode);

    while (openSet.length > 0) {
      openSet.sort((a, b) => a.f - b.f);
      const current = openSet.shift()!;

      if (current.node === end) {
        return this.reconstructPath(current);
      }

      closedSet.add(current.node);

      for (const neighbor of current.node.connections) {
        if (closedSet.has(neighbor)) continue;

        const g = current.g + current.node.position.distanceTo(neighbor.position);
        const h = this.heuristic(neighbor, end);
        const f = g + h;

        const existingNode = openSet.find(n => n.node === neighbor);

        if (!existingNode) {
          openSet.push({
            node: neighbor,
            g,
            h,
            f,
            parent: current
          });
        } else if (g < existingNode.g) {
          existingNode.g = g;
          existingNode.f = f;
          existingNode.parent = current;
        }
      }
    }

    return [];
  }

  private heuristic(a: PathNode, b: PathNode): number {
    return a.position.distanceTo(b.position);
  }

  private reconstructPath(endNode: AStarNode): PathNode[] {
    const path: PathNode[] = [];
    let current: AStarNode | null = endNode;

    while (current) {
      path.unshift(current.node);
      current = current.parent;
    }

    return this.smoothPath(path);
  }

  private smoothPath(path: PathNode[]): PathNode[] {
    if (path.length < 3) return path;

    const smoothed: PathNode[] = [path[0]];

    for (let i = 0; i < path.length - 1; i++) {
      let furthest = i + 1;

      for (let j = i + 2; j < path.length; j++) {
        if (this.hasLineOfSight(path[i], path[j])) {
          furthest = j;
        } else {
          break;
        }
      }

      smoothed.push(path[furthest]);
      i = furthest - 1;
    }

    return smoothed;
  }

  private hasLineOfSight(a: PathNode, b: PathNode): boolean {
    const direction = b.position.clone().sub(a.position);
    const distance = direction.length();
    direction.normalize();

    const steps = Math.ceil(distance / this.gridSize);

    for (let i = 1; i < steps; i++) {
      const point = a.position.clone().add(direction.clone().multiplyScalar(i * this.gridSize));
      const key = this.getGridKey(point.x, point.z);
      const node = this.grid.get(key);

      if (!node || node.type === 'building') {
        return false;
      }
    }

    return true;
  }

  getRandomWalkablePoint(near?: THREE.Vector3, radius: number = 50): THREE.Vector3 {
    const walkable = this.nodes.filter(n => n.type !== 'building');

    if (near) {
      const nearby = walkable.filter(n => n.position.distanceTo(near) < radius);
      if (nearby.length > 0) {
        const random = nearby[Math.floor(Math.random() * nearby.length)];
        return random.position.clone();
      }
    }

    const random = walkable[Math.floor(Math.random() * walkable.length)];
    return random.position.clone();
  }

  getRoadNodes(): PathNode[] {
    return this.nodes.filter(n => n.type === 'road' || n.type === 'intersection');
  }

  getSidewalkNodes(): PathNode[] {
    return this.nodes.filter(n => n.type === 'sidewalk');
  }
}
