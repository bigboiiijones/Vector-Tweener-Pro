import React from 'react';
import { Skeleton, Bone, RigTool, RigMode } from './riggingTypes';

interface SkeletonOverlayProps {
  skeletons: Skeleton[];
  activeSkeletonId: string | null;
  selectedBoneIds: Set<string>;
  activeTool: RigTool;
  rigMode: RigMode;
  viewport: { x: number; y: number; zoom: number };
  onBonePointerDown: (e: React.PointerEvent, boneId: string, part: 'head' | 'tail' | 'body') => void;
  /** Called on pointer-up — used to commit animate-tool keyframes */
  onBonePointerUp?: (e: React.PointerEvent, boneId: string) => void;
  // Box-select rect in canvas coords (null when not dragging)
  boxSelectRect: { x: number; y: number; w: number; h: number } | null;
}

const SELECTED_COLOR = '#facc15';
function BoneShape({
  bone,
  isSelected,
  activeTool,
  rigMode,
  onPointerDown,
  onPointerUp,
}: {
  bone: Bone;
  isSelected: boolean;
  activeTool: RigTool;
  rigMode: RigMode;
  onPointerDown: (e: React.PointerEvent, boneId: string, part: 'head' | 'tail' | 'body') => void;
  onPointerUp?: (e: React.PointerEvent, boneId: string) => void;
}) {
  const isAnimateTool = rigMode === 'ANIMATE';
  const color = isSelected
    ? (isAnimateTool ? '#34d399' : SELECTED_COLOR)
    : (bone.color || '#f59e0b');
  const dx = bone.tailX - bone.headX;
  const dy = bone.tailY - bone.headY;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 2) return null;

  const nx = -dy / len;
  const ny = dx / len;
  const width = Math.max(4, Math.min(14, len * 0.18));

  const midX = bone.headX + dx * 0.25;
  const midY = bone.headY + dy * 0.25;
  const p1x = midX + nx * width;
  const p1y = midY + ny * width;
  const p2x = midX - nx * width;
  const p2y = midY - ny * width;
  const dPath = `M ${bone.headX} ${bone.headY} L ${p1x} ${p1y} L ${bone.tailX} ${bone.tailY} L ${p2x} ${p2y} Z`;

  const isSelectTool = activeTool === 'BONE_SELECT';
  const isMoveTool = activeTool === 'BONE_MOVE';
  const isRotateTool = activeTool === 'BONE_ROTATE';
  const isScaleTool = activeTool === 'BONE_SCALE';
  const isDeleteTool = activeTool === 'BONE_DELETE';
  const interactable = isSelectTool || isMoveTool || isRotateTool || isScaleTool || isDeleteTool || activeTool === 'BONE_PARENT';

  const handlePointerUp = onPointerUp
    ? (e: React.PointerEvent) => { e.stopPropagation(); onPointerUp(e, bone.id); }
    : undefined;

  return (
    <g style={{ pointerEvents: interactable ? 'auto' : 'none' }}>
      {/* Wide hit-area transparent overlay for easy clicking */}
      <path
        d={dPath}
        fill="transparent"
        stroke="transparent"
        strokeWidth={Math.max(8, width * 2)}
        style={{ cursor: interactable ? 'pointer' : 'default' }}
        onPointerDown={e => onPointerDown(e, bone.id, 'body')}
        onPointerUp={handlePointerUp}
      />

      {/* Visible bone body */}
      <path
        d={dPath}
        fill={color}
        fillOpacity={isSelected ? 0.95 : 0.8}
        stroke={isSelected ? (isAnimateTool ? '#6ee7b7' : '#fff') : '#92400e'}
        strokeWidth={isSelected ? (isAnimateTool ? 2 : 1.5) : 0.8}
        style={{ pointerEvents: 'none' }}
      />

      {/* Green glow ring when posing in animate mode */}
      {isAnimateTool && isSelected && (
        <path
          d={dPath}
          fill="none"
          stroke="#34d399"
          strokeWidth={4}
          strokeOpacity={0.25}
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* Head joint */}
      <circle
        cx={bone.headX}
        cy={bone.headY}
        r={isSelected ? 7 : 5}
        fill={isSelected ? (isAnimateTool ? '#6ee7b7' : '#fff') : '#fde68a'}
        stroke={color}
        strokeWidth={1.5}
        style={{ cursor: isSelectTool || isMoveTool ? 'grab' : 'default', pointerEvents: interactable ? 'auto' : 'none' }}
        onPointerDown={e => { e.stopPropagation(); onPointerDown(e, bone.id, 'head'); }}
        onPointerUp={handlePointerUp}
      />

      {/* Tail joint */}
      <circle
        cx={bone.tailX}
        cy={bone.tailY}
        r={isSelected ? 6 : 4}
        fill={isSelected ? '#facc15' : '#78350f'}
        stroke={isSelected ? '#fff' : '#d97706'}
        strokeWidth={1.5}
        style={{
          cursor: isSelectTool || isRotateTool ? 'crosshair' : 'default',
          pointerEvents: interactable ? 'auto' : 'none',
        }}
        onPointerDown={e => { e.stopPropagation(); onPointerDown(e, bone.id, 'tail'); }}
        onPointerUp={handlePointerUp}
      />

      {/* Bone name */}
      <text
        x={(bone.headX + bone.tailX) / 2 + 5}
        y={(bone.headY + bone.tailY) / 2 - 5}
        fontSize="9"
        fill={isSelected ? '#fef3c7' : '#fde68a'}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
        opacity={0.9}
      >
        {bone.name}
      </text>
    </g>
  );
}

export const SkeletonOverlay: React.FC<SkeletonOverlayProps> = ({
  skeletons,
  activeSkeletonId,
  selectedBoneIds,
  activeTool,
  rigMode,
  onBonePointerDown,
  onBonePointerUp,
  boxSelectRect,
}) => {
  return (
    <g className="skeleton-overlay" style={{ pointerEvents: 'none' }}>
      {skeletons.map(skeleton => {
        const isActive = skeleton.id === activeSkeletonId;
        return (
          <g key={skeleton.id} opacity={isActive ? 1 : 0.25}>
            {/* Parent chain lines */}
            {skeleton.bones.map(bone => {
              if (!bone.parentBoneId) return null;
              const parent = skeleton.bones.find(b => b.id === bone.parentBoneId);
              if (!parent) return null;
              return (
                <line
                  key={`chain-${bone.id}`}
                  x1={parent.tailX} y1={parent.tailY}
                  x2={bone.headX} y2={bone.headY}
                  stroke="#818cf8"
                  strokeWidth={1}
                  strokeDasharray="3,3"
                  opacity={0.7}
                  style={{ pointerEvents: 'none' }}
                />
              );
            })}

            {/* Bone shapes */}
            {skeleton.bones.map(bone => (
              <BoneShape
                key={bone.id}
                bone={bone}
                isSelected={isActive && selectedBoneIds.has(bone.id)}
                activeTool={activeTool}
                rigMode={rigMode}
                onPointerDown={onBonePointerDown}
                onPointerUp={onBonePointerUp}
              />
            ))}
          </g>
        );
      })}

      {/* Box select rect */}
      {boxSelectRect && (
        <rect
          x={boxSelectRect.x}
          y={boxSelectRect.y}
          width={boxSelectRect.w}
          height={boxSelectRect.h}
          fill="rgba(250,204,21,0.08)"
          stroke="#facc15"
          strokeWidth={1}
          strokeDasharray="4,3"
          style={{ pointerEvents: 'none' }}
        />
      )}
    </g>
  );
};
