import { Point, Stroke } from '../types';
import { distance, sampleStroke } from '../utils/mathUtils';

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

const getPaintPolygon = (stroke: Stroke): Point[] => {
  if (stroke.points.length < 2) return stroke.points;
  return sampleStroke(stroke, 12);
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
    if (!stroke.points || stroke.points.length < 2) continue;

    const paintPolygon = getPaintPolygon(stroke);
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
      return stroke;
    }
  }

  return undefined;
};
