import { Stroke } from '../types';
import { distance } from '../utils/mathUtils';

export const postProcessTransformedStrokes = (
  strokes: Stroke[],
  options: { autoClose: boolean; autoMerge: boolean; closeThreshold: number }
): Stroke[] => {
  let next = [...strokes];

  if (options.autoClose) {
    next = next.map((stroke) => {
      if (stroke.points.length < 3 || stroke.isClosed) return stroke;
      const first = stroke.points[0];
      const last = stroke.points[stroke.points.length - 1];
      if (distance(first, last) <= options.closeThreshold) {
        return {
          ...stroke,
          isClosed: true,
          fillColor: stroke.fillColor || '#000000',
          points: [...stroke.points.slice(0, -1), first]
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
          mergedStroke = {
            ...mergedStroke,
            points: [...mergedStroke.points, ...b.points.slice(1)]
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
