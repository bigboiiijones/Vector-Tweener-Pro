import { Point, Stroke } from '../types';
import { distance } from '../utils/mathUtils';
import { mergeStrokePair } from './strokeMerge';

export interface TransformPostProcessOptions {
  autoClose: boolean;
  autoMerge: boolean;
  bezierAdaptive: boolean;
  closeCreatesFill: boolean;
  fillColor: string;
  closeThreshold: number;
}


const adaptClosedSeamToBezier = (points: Point[]) => {
  if (points.length < 4) return;
  const first = points[0];
  const prev = points[points.length - 2];
  const next = points[1];

  const inDx = first.x - prev.x;
  const inDy = first.y - prev.y;
  const outDx = next.x - first.x;
  const outDy = next.y - first.y;
  const inLen = Math.hypot(inDx, inDy);
  const outLen = Math.hypot(outDx, outDy);
  if (inLen < 0.001 || outLen < 0.001) return;

  const inNx = inDx / inLen;
  const inNy = inDy / inLen;
  const outNx = outDx / outLen;
  const outNy = outDy / outLen;
  const handleIn = Math.min(inLen, outLen) * 0.35;
  const handleOut = Math.min(inLen, outLen) * 0.35;

  points[0] = {
    ...first,
    cp1: { x: first.x - inNx * handleIn, y: first.y - inNy * handleIn },
    cp2: { x: first.x + outNx * handleOut, y: first.y + outNy * handleOut }
  };
};

const adaptJointToBezier = (points: Point[], joinIndex: number) => {
  if (joinIndex <= 0 || joinIndex >= points.length - 1) return;
  const prev = points[joinIndex - 1];
  const joint = points[joinIndex];
  const next = points[joinIndex + 1];

  const inDx = joint.x - prev.x;
  const inDy = joint.y - prev.y;
  const outDx = next.x - joint.x;
  const outDy = next.y - joint.y;

  const inLen = Math.hypot(inDx, inDy);
  const outLen = Math.hypot(outDx, outDy);
  if (inLen < 0.001 || outLen < 0.001) return;

  const dirX = (inDx / inLen + outDx / outLen) / 2;
  const dirY = (inDy / inLen + outDy / outLen) / 2;
  const dirLen = Math.hypot(dirX, dirY);
  if (dirLen < 0.001) return;

  const nx = dirX / dirLen;
  const ny = dirY / dirLen;
  const handleLength = Math.min(inLen, outLen) * 0.35;

  points[joinIndex] = {
    ...joint,
    cp1: { x: joint.x - nx * handleLength, y: joint.y - ny * handleLength },
    cp2: { x: joint.x + nx * handleLength, y: joint.y + ny * handleLength }
  };
};

const applyAutoClose = (strokes: Stroke[], options: TransformPostProcessOptions): Stroke[] => {
  return strokes.map((stroke) => {
    if (stroke.points.length < 3 || stroke.isClosed) return stroke;
    const first = stroke.points[0];
    const last = stroke.points[stroke.points.length - 1];
    if (distance(first, last) > options.closeThreshold) return stroke;

    const closedPoints = [...stroke.points.slice(0, -1), first];
    if (options.bezierAdaptive) {
      adaptClosedSeamToBezier(closedPoints);
      adaptJointToBezier(closedPoints, Math.max(1, closedPoints.length - 2));
      adaptJointToBezier(closedPoints, 1);
    }

    return {
      ...stroke,
      isClosed: true,
      fillColor: options.closeCreatesFill ? (stroke.fillColor || options.fillColor) : stroke.fillColor,
      points: closedPoints
    };
  });
};

export const postProcessTransformedStrokes = (
  strokes: Stroke[],
  options: TransformPostProcessOptions
): Stroke[] => {
  let next = [...strokes];

  if (options.autoClose) {
    next = applyAutoClose(next, options);
  }

  if (options.autoMerge) {
    const consumed = new Set<string>();
    const merged: Stroke[] = [];

    for (let i = 0; i < next.length; i++) {
      const a = next[i];
      if (consumed.has(a.id)) continue;

      let mergedStroke = a;
      let keepMerging = true;

      while (keepMerging) {
        keepMerging = false;
        let bestIdx = -1;
        let bestResult: ReturnType<typeof mergeStrokePair> | null = null;

        for (let j = 0; j < next.length; j++) {
          if (j === i) continue;
          const b = next[j];
          if (consumed.has(b.id) || b.id === mergedStroke.id) continue;

          const candidate = mergeStrokePair(mergedStroke, b, options.closeThreshold);
          if (!candidate) continue;

          if (!bestResult || candidate.gap < bestResult.gap) {
            bestResult = candidate;
            bestIdx = j;
          }
        }

        if (bestResult && bestIdx !== -1) {
          let mergedPoints = bestResult.points;
          if (options.bezierAdaptive) {
            adaptJointToBezier(mergedPoints, bestResult.joinIndex);
          }
          mergedStroke = { ...mergedStroke, points: mergedPoints };
          consumed.add(next[bestIdx].id);
          keepMerging = true;
        }
      }

      merged.push(mergedStroke);
    }

    next = merged;
  }

  if (options.autoClose) {
    next = applyAutoClose(next, options);
  }

  return next;
};
