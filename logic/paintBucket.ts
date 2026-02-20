import { Point, Stroke } from '../types';
import { distance, sampleStroke } from '../utils/mathUtils';

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

const reverseStrokePoints = (points: Point[]): Point[] => {
  return [...points].reverse().map((p) => ({
    ...p,
    cp1: p.cp2 ? { ...p.cp2 } : undefined,
    cp2: p.cp1 ? { ...p.cp1 } : undefined
  }));
};

const mergePathPoints = (a: Point[], b: Point[]): Point[] => {
  if (!a.length) return b;
  if (!b.length) return a;
  return [...a, ...b.slice(1)];
};

const buildTwoStrokeLoopPoints = (a: Stroke, b: Stroke, threshold: number): Point[] | null => {
  if (a.points.length < 2 || b.points.length < 2) return null;

  const aStart = a.points[0];
  const aEnd = a.points[a.points.length - 1];
  const bStart = b.points[0];
  const bEnd = b.points[b.points.length - 1];

  // aStart~bStart and aEnd~bEnd => reverse b
  if (distance(aStart, bStart) <= threshold && distance(aEnd, bEnd) <= threshold) {
    const bReversed = reverseStrokePoints(b.points);
    return mergePathPoints(a.points, [...bReversed, a.points[0]]);
  }

  // aStart~bEnd and aEnd~bStart => natural order
  if (distance(aStart, bEnd) <= threshold && distance(aEnd, bStart) <= threshold) {
    return mergePathPoints(a.points, [...b.points, a.points[0]]);
  }

  return null;
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

  // Two-stroke clung loop targets
  for (let i = displayedStrokes.length - 1; i >= 0; i--) {
    for (let j = i - 1; j >= 0; j--) {
      const loopPoints = buildTwoStrokeLoopPoints(displayedStrokes[i], displayedStrokes[j], threshold);
      if (!loopPoints) continue;
      const sampledLoop = sampleStroke({ ...displayedStrokes[i], points: loopPoints }, 10);
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
