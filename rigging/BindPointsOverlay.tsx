import React from 'react';
import { BoundPoint } from './riggingTypes';
import { Stroke } from '../types';

interface BindPointsOverlayProps {
  strokes: Stroke[];
  boundPoints: BoundPoint[];
  activeBoneId: string | null;
  activeTool: string;
  onPointClick: (strokeId: string, pointIndex: number, x: number, y: number) => void;
}

const BOUND_COLOR = '#22d3ee'; // cyan for bound points
const HOVER_COLOR = '#f0abfc'; // pink for hoverable
const POINT_R = 5;

export const BindPointsOverlay: React.FC<BindPointsOverlayProps> = ({
  strokes,
  boundPoints,
  activeBoneId,
  activeTool,
  onPointClick,
}) => {
  if (activeTool !== 'BIND_POINTS' || !activeBoneId) return null;

  return (
    <g className="bind-points-overlay">
      {strokes.map(stroke => {
        if (!stroke.points || stroke.points.length === 0) return null;
        return stroke.points.map((pt, idx) => {
          const isBound = boundPoints.some(
            bp => bp.strokeId === stroke.id && bp.pointIndex === idx
          );
          const boundToCurrent = boundPoints.some(
            bp => bp.strokeId === stroke.id && bp.pointIndex === idx && bp.boneId === activeBoneId
          );

          return (
            <circle
              key={`${stroke.id}-${idx}`}
              cx={pt.x}
              cy={pt.y}
              r={POINT_R}
              fill={boundToCurrent ? BOUND_COLOR : isBound ? '#f59e0b' : 'transparent'}
              stroke={boundToCurrent ? '#06b6d4' : isBound ? '#f59e0b' : HOVER_COLOR}
              strokeWidth={boundToCurrent ? 2 : 1.5}
              style={{ cursor: 'pointer' }}
              opacity={0.9}
              onPointerDown={e => {
                e.stopPropagation();
                onPointClick(stroke.id, idx, pt.x, pt.y);
              }}
            />
          );
        });
      })}
    </g>
  );
};
