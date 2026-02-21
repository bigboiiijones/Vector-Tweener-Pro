import React, { useCallback } from 'react';
import { Skeleton, Bone, BoundPoint, RigTool } from './riggingTypes';
import { pointToSegmentDistance } from './riggingMath';

interface SkeletonOverlayProps {
  skeletons: Skeleton[];
  activeSkeletonId: string | null;
  selectedBoneIds: Set<string>;
  activeTool: RigTool;
  boundPoints: BoundPoint[];
  viewport: { x: number; y: number; zoom: number };
  // Interaction callbacks
  onBonePointerDown: (e: React.PointerEvent, boneId: string, part: 'head' | 'tail' | 'body') => void;
  onCanvasPointerDown: (e: React.PointerEvent) => void;
  // SVG dimensions
  svgWidth: number;
  svgHeight: number;
}

const BONE_HEAD_R = 8;
const BONE_TAIL_R = 5;
const SELECTED_COLOR = '#facc15';
const DEFAULT_COLOR = '#f59e0b';

function renderBone(
  bone: Bone,
  isSelected: boolean,
  activeTool: RigTool,
  onPointerDown: (e: React.PointerEvent, boneId: string, part: 'head' | 'tail' | 'body') => void
) {
  const color = isSelected ? SELECTED_COLOR : (bone.color || DEFAULT_COLOR);
  const opacity = 0.85;
  const dx = bone.tailX - bone.headX;
  const dy = bone.tailY - bone.headY;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return null;

  // Build bone diamond shape (Moho-style)
  const nx = -dy / len;
  const ny = dx / len;
  const width = Math.min(12, len * 0.18);

  // Diamond control points: head -> wide point (20% along) -> tail
  const midX = bone.headX + dx * 0.25;
  const midY = bone.headY + dy * 0.25;
  const p1x = midX + nx * width;
  const p1y = midY + ny * width;
  const p2x = midX - nx * width;
  const p2y = midY - ny * width;

  const dPath = `M ${bone.headX} ${bone.headY} L ${p1x} ${p1y} L ${bone.tailX} ${bone.tailY} L ${p2x} ${p2y} Z`;

  return (
    <g key={bone.id} style={{ cursor: activeTool === 'BONE_SELECT' ? 'pointer' : 'default' }}>
      {/* Bone body */}
      <path
        d={dPath}
        fill={color}
        fillOpacity={opacity}
        stroke={isSelected ? '#fff' : '#d97706'}
        strokeWidth={isSelected ? 1.5 : 0.8}
        onPointerDown={e => onPointerDown(e, bone.id, 'body')}
      />

      {/* Head circle */}
      <circle
        cx={bone.headX}
        cy={bone.headY}
        r={BONE_HEAD_R / 1.5}
        fill={isSelected ? '#fff' : '#fde68a'}
        stroke={color}
        strokeWidth={1}
        style={{ cursor: 'grab' }}
        onPointerDown={e => { e.stopPropagation(); onPointerDown(e, bone.id, 'head'); }}
      />

      {/* Tail circle */}
      <circle
        cx={bone.tailX}
        cy={bone.tailY}
        r={BONE_TAIL_R}
        fill={isSelected ? '#facc15' : '#92400e'}
        stroke={isSelected ? '#fff' : '#d97706'}
        strokeWidth={1}
        style={{ cursor: activeTool === 'BONE_SELECT' ? 'crosshair' : 'default' }}
        onPointerDown={e => { e.stopPropagation(); onPointerDown(e, bone.id, 'tail'); }}
      />

      {/* Bone name label */}
      <text
        x={(bone.headX + bone.tailX) / 2 + 4}
        y={(bone.headY + bone.tailY) / 2 - 4}
        fontSize="9"
        fill={isSelected ? '#fef3c7' : '#fde68a'}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
        opacity={0.9}
      >
        {bone.name}
      </text>

      {/* Parent connection line */}
      {/* handled by parent iteration */}
    </g>
  );
}

export const SkeletonOverlay: React.FC<SkeletonOverlayProps> = ({
  skeletons,
  activeSkeletonId,
  selectedBoneIds,
  activeTool,
  boundPoints,
  viewport,
  onBonePointerDown,
  onCanvasPointerDown,
  svgWidth,
  svgHeight,
}) => {
  const activeSkeleton = skeletons.find(s => s.id === activeSkeletonId);
  const allSkeletons = skeletons;

  return (
    <g className="skeleton-overlay">
      {/* Render all skeletons (non-active as ghost) */}
      {allSkeletons.map(skeleton => {
        const isActive = skeleton.id === activeSkeletonId;
        return (
          <g key={skeleton.id} opacity={isActive ? 1 : 0.3}>
            {/* Parent connection lines */}
            {skeleton.bones.map(bone => {
              if (!bone.parentBoneId) return null;
              const parent = skeleton.bones.find(b => b.id === bone.parentBoneId);
              if (!parent) return null;
              return (
                <line
                  key={`parent-${bone.id}`}
                  x1={parent.tailX}
                  y1={parent.tailY}
                  x2={bone.headX}
                  y2={bone.headY}
                  stroke="#6366f1"
                  strokeWidth={1}
                  strokeDasharray="3,3"
                  opacity={0.6}
                  style={{ pointerEvents: 'none' }}
                />
              );
            })}
            {/* Bone shapes */}
            {skeleton.bones.map(bone =>
              renderBone(
                bone,
                isActive && selectedBoneIds.has(bone.id),
                activeTool,
                onBonePointerDown
              )
            )}
          </g>
        );
      })}
    </g>
  );
};
