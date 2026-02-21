import { Stroke } from '../types';
import { tweenColor } from '../utils/colorUtils';

export const applyTweenedStrokeStyle = (source: Stroke, target: Stroke, t: number): Partial<Stroke> => {
  const sourceWidth = source.width ?? 2;
  const targetWidth = target.width ?? sourceWidth;

  const sourceTaperStart = source.taperStart ?? 0;
  const targetTaperStart = target.taperStart ?? sourceTaperStart;

  const sourceTaperEnd = source.taperEnd ?? 0;
  const targetTaperEnd = target.taperEnd ?? sourceTaperEnd;

  const sourceClosed = !!source.isClosed;
  const targetClosed = !!target.isClosed;
  const isClosed = sourceClosed || targetClosed;
  const sourceHasFill = !!source.fillColor && source.fillColor !== 'transparent';

  return {
    color: tweenColor(source.color || '#000000', target.color || source.color || '#000000', t),
    fillColor: isClosed && sourceHasFill
      ? tweenColor(source.fillColor || '#000000', target.fillColor || source.fillColor || '#000000', t)
      : undefined,
    width: sourceWidth + (targetWidth - sourceWidth) * t,
    taperStart: sourceTaperStart + (targetTaperStart - sourceTaperStart) * t,
    taperEnd: sourceTaperEnd + (targetTaperEnd - sourceTaperEnd) * t,
    isClosed
  };
};
