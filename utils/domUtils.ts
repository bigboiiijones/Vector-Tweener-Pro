import React from 'react';
import { Point } from '../types';

export const getMousePos = (e: React.MouseEvent | React.TouchEvent, svg: SVGSVGElement | null): Point => {
  if (!svg) return { x: 0, y: 0 };
  const point = svg.createSVGPoint();
  const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
  const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
  point.x = clientX;
  point.y = clientY;
  const ctm = svg.getScreenCTM();
  if (ctm) {
    const svgPoint = point.matrixTransform(ctm.inverse());
    return { x: svgPoint.x, y: svgPoint.y };
  }
  return { x: 0, y: 0 };
};