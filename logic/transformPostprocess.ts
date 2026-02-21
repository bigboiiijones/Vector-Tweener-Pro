import { Point, Stroke } from '../types';
import { distance } from '../utils/mathUtils';

export interface TransformPostProcessOptions {
  autoMerge: boolean;
  bezierAdaptive: boolean;
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


const reversePoints = (points: Point[]): Point[] => {
  return [...points].reverse().map((p) => ({
    ...p,
    cp1: p.cp2 ? { ...p.cp2 } : undefined,
    cp2: p.cp1 ? { ...p.cp1 } : undefined
  }));
};

const tryMergePoints = (
  base: Point[],
  other: Point[],
  threshold: number,
  bezierAdaptive: boolean
): { points: Point[]; closed: boolean } | null => {
  if (base.length < 2 || other.length < 2) return null;

  const baseStart = base[0];
  const baseEnd = base[base.length - 1];
  const otherStart = other[0];
  const otherEnd = other[other.length - 1];

  const candidates: Array<{ score: number; points: Point[]; closed: boolean }> = [];
  const append = (a: Point[], b: Point[], score: number) => {
    const joinIndex = Math.max(1, a.length - 1);
    const points = [...a, ...b.slice(1)];
    const incomingJoin = a[a.length - 1];
    const outgoingJoin = b[0];
    points[joinIndex] = {
      ...points[joinIndex],
      cp1: points[joinIndex].cp1 || incomingJoin.cp1,
      cp2: outgoingJoin.cp2 || points[joinIndex].cp2
    };
    if (bezierAdaptive) adaptJointToBezier(points, joinIndex);
    const closed = distance(points[0], points[points.length - 1]) <= threshold;
    candidates.push({ score, points, closed });
  };

  const dEndStart = distance(baseEnd, otherStart);
  if (dEndStart <= threshold) append(base, other, dEndStart);

  const dEndEnd = distance(baseEnd, otherEnd);
  if (dEndEnd <= threshold) append(base, reversePoints(other), dEndEnd);

  const dStartEnd = distance(baseStart, otherEnd);
  if (dStartEnd <= threshold) append(other, base, dStartEnd);

  const dStartStart = distance(baseStart, otherStart);
  if (dStartStart <= threshold) append(reversePoints(other), base, dStartStart);

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    if (a.closed !== b.closed) return a.closed ? -1 : 1;
    return a.score - b.score;
  });

  const DUPLICATE_EPSILON = 0.001;
  let mergedPoints = candidates[0].points;
  const closed = candidates[0].closed;

  if (closed && distance(mergedPoints[0], mergedPoints[mergedPoints.length - 1]) <= DUPLICATE_EPSILON) {
    mergedPoints = mergedPoints.slice(0, -1);
  }

  return { points: mergedPoints, closed };
};

export const postProcessTransformedStrokes = (
  strokes: Stroke[],
  options: TransformPostProcessOptions
): Stroke[] => {
  let next = [...strokes];


  if (options.autoMerge) {
    const consumed = new Set<string>();
    const merged: Stroke[] = [];

    for (let i = 0; i < next.length; i++) {
      const a = next[i];
      if (consumed.has(a.id)) continue;

      let mergedStroke = a;

      for (let j = i + 1; j < next.length; j++) {
        const b = next[j];
        if (consumed.has(b.id)) continue;

        const mergedResult = tryMergePoints(
          mergedStroke.points,
          b.points,
          options.closeThreshold,
          options.bezierAdaptive
        );
        if (!mergedResult) continue;

        mergedStroke = {
          ...mergedStroke,
          points: mergedResult.points,
          isClosed: !!mergedStroke.isClosed || mergedResult.closed
        };
        consumed.add(b.id);
      }

      merged.push(mergedStroke);
    }

    next = merged;
  }


  return next;
};
