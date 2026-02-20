import { Point, Stroke } from '../types';
import { distance } from '../utils/mathUtils';

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

const distanceToSegment = (p: Point, a: Point, b: Point): number => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return distance(p, a);

  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  const proj = { x: a.x + t * dx, y: a.y + t * dy };
  return distance(p, proj);
};

const isNearPathBoundary = (point: Point, stroke: Stroke, threshold: number): boolean => {
  const points = stroke.points;
  for (let i = 0; i < points.length - 1; i++) {
    if (distanceToSegment(point, points[i], points[i + 1]) <= threshold) return true;
  }

  // Explicitly test closing segment for near-closed loops to support gap-closing fills.
  if (points.length > 2 && distance(points[0], points[points.length - 1]) <= threshold) {
    if (distanceToSegment(point, points[points.length - 1], points[0]) <= threshold) return true;
  }

  return false;
};

export const findPaintTarget = (
  clickPos: Point,
  displayedStrokes: Stroke[],
  gapClosingDistance: number,
  viewportZoom: number
): Stroke | undefined => {
  const threshold = Math.max(2, gapClosingDistance / Math.max(0.1, viewportZoom));

  for (let i = displayedStrokes.length - 1; i >= 0; i--) {
    const stroke = displayedStrokes[i];
    if (!stroke.points || stroke.points.length < 3) continue;

    const minX = Math.min(...stroke.points.map(p => p.x));
    const maxX = Math.max(...stroke.points.map(p => p.x));
    const minY = Math.min(...stroke.points.map(p => p.y));
    const maxY = Math.max(...stroke.points.map(p => p.y));

    if (clickPos.x < minX - threshold || clickPos.x > maxX + threshold || clickPos.y < minY - threshold || clickPos.y > maxY + threshold) {
      continue;
    }

    const isClosedByDistance = distance(stroke.points[0], stroke.points[stroke.points.length - 1]) <= threshold;
    const isPaintableClosed = stroke.isClosed || isClosedByDistance;

    if (!isPaintableClosed) continue;

    const isInside = pointInPolygon(clickPos, stroke.points);
    const isNearBoundary = isNearPathBoundary(clickPos, stroke, threshold);

    if (isInside || isNearBoundary) {
      return stroke;
    }
  }

  return undefined;
};
