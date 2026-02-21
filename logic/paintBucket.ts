import { Point, Stroke } from '../types';
import { distance, sampleStroke } from '../utils/mathUtils';
import { reverseStrokePoints } from './strokeMerge';

export interface PaintHit {
  kind: 'STROKE' | 'LOOP';
  stroke?: Stroke;
  loopPoints?: Point[];
  sourceStrokeIds?: string[];
}

const pointInPolygon = (point: Point, polygon: Point[]): boolean => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersect = ((yi > point.y) !== (yj > point.y))
      && (point.x < (xj - xi) * (point.y - yi) / ((yj - yi) || Number.EPSILON) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};

const buildCandidateLoop = (pathA: Point[], pathB: Point[], threshold: number): Point[] | null => {
  if (pathA.length < 2 || pathB.length < 2) return null;
  const dJoin = distance(pathA[pathA.length - 1], pathB[0]);
  const dClose = distance(pathB[pathB.length - 1], pathA[0]);
  if (dJoin > threshold || dClose > threshold) return null;

  const merged = [...pathA, ...pathB.slice(1)];
  const start = pathA[0];
  const end = merged[merged.length - 1];
  if (distance(start, end) > 0.001) merged.push(start);
  return merged;
};

const buildTwoStrokeLoopPoints = (a: Stroke, b: Stroke, threshold: number): Point[] | null => {
  if (a.points.length < 2 || b.points.length < 2) return null;

  const candidates: Point[][] = [];

  const forwardA = a.points;
  const reverseA = reverseStrokePoints(a.points);
  const forwardB = b.points;
  const reverseB = reverseStrokePoints(b.points);

  const c1 = buildCandidateLoop(forwardA, forwardB, threshold);
  if (c1) candidates.push(c1);
  const c2 = buildCandidateLoop(forwardA, reverseB, threshold);
  if (c2) candidates.push(c2);
  const c3 = buildCandidateLoop(reverseA, forwardB, threshold);
  if (c3) candidates.push(c3);
  const c4 = buildCandidateLoop(reverseA, reverseB, threshold);
  if (c4) candidates.push(c4);

  if (candidates.length === 0) return null;

  // Favor smoother loop with longer boundary (reduces accidental straight-chord closures)
  let best = candidates[0];
  let bestLen = -Infinity;
  candidates.forEach(c => {
    let len = 0;
    for (let i = 1; i < c.length; i++) len += distance(c[i - 1], c[i]);
    if (len > bestLen) {
      best = c;
      bestLen = len;
    }
  });
  return best;
};

export const findClosedLoopFromStrokes = (strokes: Stroke[], threshold: number): { points: Point[]; strokeIds: string[] } | null => {
  for (let i = 0; i < strokes.length; i++) {
    for (let j = i + 1; j < strokes.length; j++) {
      const points = buildTwoStrokeLoopPoints(strokes[i], strokes[j], threshold);
      if (points && points.length >= 4) {
        return { points, strokeIds: [strokes[i].id, strokes[j].id] };
      }
    }
  }
  return null;
};

export const findPaintTarget = (
  clickPos: Point,
  displayedStrokes: Stroke[],
  gapClosingDistance: number,
  viewportZoom: number
): PaintHit | undefined => {
  const threshold = Math.max(2, gapClosingDistance / Math.max(0.1, viewportZoom));

  // Closed single-stroke targets (top-most first)
  for (let i = displayedStrokes.length - 1; i >= 0; i--) {
    const stroke = displayedStrokes[i];
    if (!stroke.points || stroke.points.length < 2) continue;

    const paintPolygon = sampleStroke(stroke, 12);
    if (paintPolygon.length < 3) continue;

    const minX = Math.min(...paintPolygon.map(p => p.x));
    const maxX = Math.max(...paintPolygon.map(p => p.x));
    const minY = Math.min(...paintPolygon.map(p => p.y));
    const maxY = Math.max(...paintPolygon.map(p => p.y));

    if (clickPos.x < minX - threshold || clickPos.x > maxX + threshold || clickPos.y < minY - threshold || clickPos.y > maxY + threshold) {
      continue;
    }

    const isClosedByDistance = distance(paintPolygon[0], paintPolygon[paintPolygon.length - 1]) <= threshold;
    const isPaintableClosed = stroke.isClosed || isClosedByDistance;

    if (isPaintableClosed && pointInPolygon(clickPos, paintPolygon)) {
      return { kind: 'STROKE', stroke };
    }
  }

  for (let i = displayedStrokes.length - 1; i >= 0; i--) {
    for (let j = i - 1; j >= 0; j--) {
      const loopPoints = buildTwoStrokeLoopPoints(displayedStrokes[i], displayedStrokes[j], threshold);
      if (!loopPoints) continue;
      const sampledLoop = sampleStroke({ ...displayedStrokes[i], points: loopPoints }, 12);
      if (sampledLoop.length < 3) continue;
      if (pointInPolygon(clickPos, sampledLoop)) {
        return {
          kind: 'LOOP',
          loopPoints,
          sourceStrokeIds: [displayedStrokes[i].id, displayedStrokes[j].id]
        };
      }
    }
  }

  return undefined;
};
