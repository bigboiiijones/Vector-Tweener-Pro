import { Point } from '../types';
import { distance } from '../utils/mathUtils';

const clampStrength = (s: number) => Math.max(0.05, Math.min(0.45, s));

export const adaptBezierAtJoint = (points: Point[], jointIndex: number, strength = 0.22): Point[] => {
  if (points.length < 3 || jointIndex <= 0 || jointIndex >= points.length - 1) return points;

  const s = clampStrength(strength);
  const prev = points[jointIndex - 1];
  const curr = points[jointIndex];
  const next = points[jointIndex + 1];

  const vx = next.x - prev.x;
  const vy = next.y - prev.y;
  const len = Math.hypot(vx, vy);
  if (len < 0.001) return points;

  const nx = vx / len;
  const ny = vy / len;
  const inLen = distance(prev, curr) * s;
  const outLen = distance(curr, next) * s;

  const updated = [...points];
  updated[jointIndex] = {
    ...curr,
    cp1: { x: curr.x - nx * inLen, y: curr.y - ny * inLen },
    cp2: { x: curr.x + nx * outLen, y: curr.y + ny * outLen }
  };

  return updated;
};

export const adaptBezierForMergedPath = (
  points: Point[],
  mergeIndex: number,
  isClosed: boolean,
  strength = 0.22
): Point[] => {
  let updated = adaptBezierAtJoint(points, mergeIndex, strength);

  if (isClosed && updated.length > 3) {
    const first = updated[0];
    const last = updated[updated.length - 1];

    // If loop is explicitly closed, smooth at the start/end seam as well.
    if (distance(first, last) < 0.001) {
      const prev = updated[updated.length - 2];
      const next = updated[1];
      const vx = next.x - prev.x;
      const vy = next.y - prev.y;
      const len = Math.hypot(vx, vy);
      if (len > 0.001) {
        const s = clampStrength(strength);
        const nx = vx / len;
        const ny = vy / len;
        const inLen = distance(prev, first) * s;
        const outLen = distance(first, next) * s;
        const seamPoint: Point = {
          ...first,
          cp1: { x: first.x - nx * inLen, y: first.y - ny * inLen },
          cp2: { x: first.x + nx * outLen, y: first.y + ny * outLen }
        };
        updated = [...updated];
        updated[0] = seamPoint;
        updated[updated.length - 1] = { ...seamPoint };
      }
    }
  }

  return updated;
};
