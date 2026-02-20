import { Point, Stroke } from '../types';
import { distance } from '../utils/mathUtils';

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
  options: { autoClose: boolean; autoMerge: boolean; bezierAdaptive: boolean; closeThreshold: number }
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
          adaptJointToBezier(closedPoints, 0);
          adaptJointToBezier(closedPoints, closedPoints.length - 2);
        }

        return {
          ...stroke,
          isClosed: true,
          fillColor: stroke.fillColor || '#000000',
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
