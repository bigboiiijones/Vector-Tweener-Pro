import React from 'react';
import { BoundPoint } from './riggingTypes';
import { Stroke } from '../types';

interface BindPointsOverlayProps {
  strokes: Stroke[];
  boundPoints: BoundPoint[];
  // Points currently staged for binding (selected in UI, not yet committed)
  pendingSelectedPoints: Set<string>; // key = `${strokeId}:${pointIndex}`
  activeBoneId: string | null;
  activeTool: string;
  // Drag-box selection rect in canvas coords
  bindBoxRect: { x: number; y: number; w: number; h: number } | null;
  onPointPointerDown: (e: React.PointerEvent, strokeId: string, pointIndex: number) => void;
}

const PT_R = 6;

function pointKey(strokeId: string, idx: number) {
  return `${strokeId}:${idx}`;
}

export const BindPointsOverlay: React.FC<BindPointsOverlayProps> = ({
  strokes,
  boundPoints,
  pendingSelectedPoints,
  activeBoneId,
  activeTool,
  bindBoxRect,
  onPointPointerDown,
}) => {
  if (activeTool !== 'BIND_POINTS') return null;

  return (
    // pointer-events-auto so clicks on points register despite parent SVG being none
    <g className="bind-points-overlay" style={{ pointerEvents: 'none' }}>
      {strokes.map(stroke => {
        if (!stroke.points?.length) return null;
        return (
          <g key={stroke.id}>
            {stroke.points.map((pt, idx) => {
              const key = pointKey(stroke.id, idx);
              const boundToCurrent = boundPoints.some(
                bp => bp.strokeId === stroke.id && bp.pointIndex === idx && bp.boneId === activeBoneId
              );
              const boundToOther = !boundToCurrent && boundPoints.some(
                bp => bp.strokeId === stroke.id && bp.pointIndex === idx
              );
              const isPending = pendingSelectedPoints.has(key);

              // Color coding:
              // cyan solid = bound to current bone
              // amber = bound to another bone
              // magenta ring = pending (staged for binding)
              // gray ring = unbound, hoverable
              let fill = 'transparent';
              let stroke2 = 'rgba(200,200,200,0.4)';
              let sw = 1;
              let r = PT_R;

              if (boundToCurrent) { fill = '#22d3ee'; stroke2 = '#0891b2'; sw = 2; }
              else if (boundToOther) { fill = '#fbbf24'; stroke2 = '#d97706'; sw = 1.5; }
              if (isPending) { stroke2 = '#e879f9'; sw = 2.5; r = PT_R + 2; fill = isPending && !boundToCurrent ? 'rgba(232,121,249,0.3)' : fill; }

              return (
                <circle
                  key={key}
                  cx={pt.x}
                  cy={pt.y}
                  r={r}
                  fill={fill}
                  stroke={stroke2}
                  strokeWidth={sw}
                  opacity={0.95}
                  style={{ pointerEvents: 'auto', cursor: 'crosshair' }}
                  onPointerDown={e => { e.stopPropagation(); onPointPointerDown(e, stroke.id, idx); }}
                />
              );
            })}
          </g>
        );
      })}

      {/* Drag-select box */}
      {bindBoxRect && (
        <rect
          x={bindBoxRect.x}
          y={bindBoxRect.y}
          width={bindBoxRect.w}
          height={bindBoxRect.h}
          fill="rgba(14,165,233,0.08)"
          stroke="#0ea5e9"
          strokeWidth={1}
          strokeDasharray="4,3"
          style={{ pointerEvents: 'none' }}
        />
      )}
    </g>
  );
};
