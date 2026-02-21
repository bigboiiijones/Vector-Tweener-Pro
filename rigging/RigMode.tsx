import React, { useState, useCallback } from 'react';
import { RigTool, Skeleton } from './riggingTypes';
import { RigToolbar } from './RigToolbar';
import { SkeletonOverlay } from './SkeletonOverlay';
import { BindPointsOverlay } from './BindPointsOverlay';
import { BonePropertiesPanel } from './BonePropertiesPanel';
import { RigPanel } from './RigPanel';
import { useRigCanvasInteraction } from './useRigCanvasInteraction';
import { useRigging } from './useRigging';
import { Stroke, ViewportTransform, Layer } from '../types';
import { Bone as BoneIcon, X, AlertCircle } from 'lucide-react';

interface RigModeProps {
  isActive: boolean;
  onToggle: () => void;
  displayedStrokes: Stroke[];
  viewport: ViewportTransform;
  activeLayerId: string;
  layers: Layer[];
  svgRef: React.RefObject<SVGSVGElement | null>;
}

export const RigMode: React.FC<RigModeProps> = ({
  isActive,
  onToggle,
  displayedStrokes,
  viewport,
  activeLayerId,
  layers,
  svgRef,
}) => {
  const rigging = useRigging();
  const [activeTool, setActiveTool] = useState<RigTool>('BONE_CREATE');
  const [rigPanelVisible, setRigPanelVisible] = useState(true);

  const activeSkeleton = rigging.getActiveSkeleton();
  const activeBone = activeSkeleton?.bones.find(b => b.id === rigging.activeBoneId) || null;

  const handleCreateSkeleton = useCallback(() => {
    rigging.createSkeleton(activeLayerId);
  }, [rigging.createSkeleton, activeLayerId]);

  const rigInteraction = useRigCanvasInteraction({
    activeTool,
    activeSkeletonId: rigging.activeSkeletonId,
    skeletons: rigging.skeletons,
    activeBoneId: rigging.activeBoneId,
    pendingParentBoneId: rigging.pendingParentBoneId,
    viewport,
    activeLayerId,
    onAddBone: rigging.addBone,
    onUpdateBoneTail: rigging.updateBoneTail,
    onSelectBone: rigging.selectBone,
    onClearBoneSelection: rigging.clearBoneSelection,
    onRotateBone: rigging.rotateBone,
    onMoveBone: rigging.moveBone,
    onSetPendingParent: rigging.setPendingParentBoneId,
    onSetBoneParent: rigging.setBoneParent,
    onBindPoint: rigging.bindPoint,
    onBindLayer: rigging.bindLayer,
  });

  if (!isActive) {
    return (
      <button
        onClick={onToggle}
        title="Enter Rig Mode (Moho-style bone rigging)"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider bg-yellow-900/30 text-yellow-400/70 hover:bg-yellow-800/40 hover:text-yellow-300 border border-yellow-700/30 transition-colors"
      >
        <BoneIcon size={13} />
        Rig Mode
      </button>
    );
  }

  return (
    <>
      {/* Rig mode indicator strip */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-yellow-500 z-[200] pointer-events-none" />

      {/* Rig mode header badge */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-2 bg-yellow-900/90 border border-yellow-600/50 rounded-full px-3 py-1 text-xs text-yellow-300 font-bold pointer-events-none">
        <BoneIcon size={12} />
        RIG MODE
      </div>

      {/* Rig toolbar (left side, below main toolbar) */}
      <div className="absolute top-4 left-4 z-[150] pointer-events-auto" style={{ marginLeft: '80px' }}>
        <RigToolbar
          activeTool={activeTool}
          setActiveTool={setActiveTool}
          onCreateSkeleton={handleCreateSkeleton}
          hasActiveSkeleton={!!rigging.activeSkeletonId}
        />
      </div>

      {/* Bone properties panel */}
      <div className="absolute top-4 right-52 z-[150] pointer-events-auto">
        <BonePropertiesPanel
          bone={activeBone}
          onRename={rigging.renameBone}
          onColorChange={rigging.setBoneColor}
          onStrengthChange={rigging.setBoneStrength}
          onDelete={rigging.deleteSelectedBones}
        />
      </div>

      {/* Rig panel (right side) */}
      <div className="absolute top-0 right-0 bottom-0 z-[150] pointer-events-auto flex">
        <RigPanel
          skeletons={rigging.skeletons}
          activeSkeletonId={rigging.activeSkeletonId}
          selectedBoneIds={rigging.selectedBoneIds}
          activeBoneId={rigging.activeBoneId}
          boundLayers={rigging.boundLayers}
          layers={layers}
          onSelectSkeleton={rigging.setActiveSkeletonId}
          onSelectBone={rigging.selectBone}
          onUnbindLayer={rigging.unbindLayer}
          isVisible={rigPanelVisible}
          onToggle={() => setRigPanelVisible(v => !v)}
        />
      </div>

      {/* Bind Layer button (shown when BIND_LAYER tool is active) */}
      {activeTool === 'BIND_LAYER' && rigging.activeBoneId && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-[150] pointer-events-auto">
          <button
            onClick={rigInteraction.handleBindLayerClick}
            className="bg-cyan-700 hover:bg-cyan-600 text-white text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-lg shadow-xl border border-cyan-500/50 transition-colors"
          >
            Bind Layer "{layers.find(l => l.id === activeLayerId)?.name}" → Bone
          </button>
        </div>
      )}

      {/* Parent tool hint */}
      {activeTool === 'BONE_PARENT' && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-[150] pointer-events-none">
          <div className="bg-indigo-900/90 border border-indigo-600/50 text-indigo-200 text-xs px-4 py-2 rounded-lg shadow-xl">
            {rigging.pendingParentBoneId
              ? '✓ Child selected — now click the PARENT bone'
              : 'Click a bone to set as CHILD, then click its PARENT bone'}
          </div>
        </div>
      )}

      {/* Exit rig mode button */}
      <button
        onClick={onToggle}
        className="absolute top-3 right-3 z-[200] pointer-events-auto flex items-center gap-1 px-2 py-1 rounded text-xs bg-yellow-800/80 text-yellow-300 hover:bg-yellow-700 border border-yellow-600/40 transition-colors"
        title="Exit Rig Mode"
      >
        <X size={12} /> Exit Rig
      </button>

      {/* SVG overlay layer (injected into canvas via portal-style approach via render prop) */}
      {/* We expose these for CanvasView to consume */}
    </>
  );
};

// Export everything the canvas needs to render
export { useRigging };
export type { RigTool };
