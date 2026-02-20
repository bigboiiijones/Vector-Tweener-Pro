import { Point, Stroke } from '../types';
import { distance } from '../utils/mathUtils';

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

export const postProcessTransformedStrokes = (
  strokes: Stroke[],
  options: TransformPostProcessOptions
  options: { autoClose: boolean; autoMerge: boolean; bezierAdaptive: boolean; closeCreatesFill: boolean; fillColor: string; closeThreshold: number }
): Stroke[] => {
  let next = [...strokes];

  if (options.autoClose) {
    next = next.map((stroke) => {
      if (stroke.points.length < 3 || stroke.isClosed) return stroke;
      const first = stroke.points[0];
      const last = stroke.points[stroke.points.length - 1];
      if (distance(first, last) <= options.closeThreshold) {
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
      }
      return stroke;
    });
  }

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

        const aEnd = mergedStroke.points[mergedStroke.points.length - 1];
        const bStart = b.points[0];

        if (distance(aEnd, bStart) <= options.closeThreshold) {
          const joinIndex = Math.max(1, mergedStroke.points.length - 1);
          const mergedPoints = [...mergedStroke.points, ...b.points.slice(1)];
          const incomingJoin = mergedStroke.points[mergedStroke.points.length - 1];
          const outgoingJoin = b.points[0];
          mergedPoints[joinIndex] = {
            ...mergedPoints[joinIndex],
            cp1: mergedPoints[joinIndex].cp1 || incomingJoin.cp1,
            cp2: outgoingJoin.cp2 || mergedPoints[joinIndex].cp2
          };

          if (options.bezierAdaptive) {
            adaptJointToBezier(mergedPoints, joinIndex);
          }

          mergedStroke = {
            ...mergedStroke,
            points: mergedPoints
          };
          consumed.add(b.id);
        }
      }

      merged.push(mergedStroke);
    }

    next = merged;
  }

  return next;
};
