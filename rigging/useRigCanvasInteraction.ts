import { useRef, useCallback, useState } from 'react';
import { RigTool, Skeleton } from './riggingTypes';
import { ViewportTransform } from '../types';

interface UseRigCanvasInteractionProps {
  activeTool: RigTool;
  activeSkeletonId: string | null;
  skeletons: Skeleton[];
  activeBoneId: string | null;
  pendingParentBoneId: string | null;
  viewport: ViewportTransform;
  activeLayerId: string;
  svgRef?: React.RefObject<SVGSVGElement | null>;
  onAddBone: (hx: number, hy: number, tx: number, ty: number, parentId?: string | null) => string | null;
  onUpdateBoneTail: (id: string, tx: number, ty: number) => void;
  onSelectBone: (id: string, multi?: boolean) => void;
  onClearBoneSelection: () => void;
  onRotateBone: (id: string, tx: number, ty: number) => void;
  onMoveBone: (id: string, dx: number, dy: number) => void;
  onSetPendingParent: (id: string | null) => void;
  onSetBoneParent: (childId: string, parentId: string | null) => void;
  onBindPoint: (strokeId: string, pointIndex: number, boneId: string, weight: number) => void;
  onBindLayer: (layerId: string, boneId: string, skeletonId: string) => void;
}

/**
 * Converts a pointer/mouse event to SVG canvas coordinates using SVG's own CTM.
 */
function svgCoords(
  e: React.MouseEvent | React.TouchEvent | React.PointerEvent,
  svg: SVGSVGElement | null
): { x: number; y: number } {
  if (!svg) return { x: 0, y: 0 };
  const pt = svg.createSVGPoint();
  const clientX = 'touches' in e ? (e as React.TouchEvent).touches[0]?.clientX ?? 0 : (e as React.MouseEvent).clientX;
  const clientY = 'touches' in e ? (e as React.TouchEvent).touches[0]?.clientY ?? 0 : (e as React.MouseEvent).clientY;
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (ctm) {
    const svgPt = pt.matrixTransform(ctm.inverse());
    return { x: svgPt.x, y: svgPt.y };
  }
  return { x: 0, y: 0 };
}

export const useRigCanvasInteraction = ({
  activeTool,
  activeSkeletonId,
  skeletons,
  activeBoneId,
  pendingParentBoneId,
  viewport,
  activeLayerId,
  svgRef,
  onAddBone,
  onUpdateBoneTail,
  onSelectBone,
  onClearBoneSelection,
  onRotateBone,
  onMoveBone,
  onSetPendingParent,
  onSetBoneParent,
  onBindPoint,
  onBindLayer,
}: UseRigCanvasInteractionProps) => {
  const dragStateRef = useRef<{
    mode: 'none' | 'create_bone' | 'rotate_bone' | 'move_bone';
    boneId: string | null;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
  }>({ mode: 'none', boneId: null, startX: 0, startY: 0, lastX: 0, lastY: 0 });

  const [previewTail, setPreviewTail] = useState<{ x: number; y: number } | null>(null);
  const [creatingHead, setCreatingHead] = useState<{ x: number; y: number } | null>(null);

  const getSvg = useCallback(() => svgRef?.current ?? null, [svgRef]);

  const handleCanvasPointerDown = useCallback(
    (e: React.MouseEvent) => {
      if (!activeSkeletonId) return;
      const pos = svgCoords(e, getSvg());

      if (activeTool === 'BONE_CREATE') {
        dragStateRef.current = {
          mode: 'create_bone',
          boneId: null,
          startX: pos.x,
          startY: pos.y,
          lastX: pos.x,
          lastY: pos.y,
        };
        setCreatingHead({ x: pos.x, y: pos.y });
        setPreviewTail({ x: pos.x, y: pos.y });
      } else if (activeTool === 'BONE_SELECT') {
        onClearBoneSelection();
        dragStateRef.current = { mode: 'none', boneId: null, startX: 0, startY: 0, lastX: 0, lastY: 0 };
      }
    },
    [activeTool, activeSkeletonId, getSvg, onClearBoneSelection]
  );

  const handleCanvasPointerMove = useCallback(
    (e: React.MouseEvent) => {
      const pos = svgCoords(e, getSvg());
      const ds = dragStateRef.current;

      if (ds.mode === 'create_bone') {
        setPreviewTail({ x: pos.x, y: pos.y });
      } else if (ds.mode === 'rotate_bone' && ds.boneId) {
        onRotateBone(ds.boneId, pos.x, pos.y);
      } else if (ds.mode === 'move_bone' && ds.boneId) {
        const dx = pos.x - ds.lastX;
        const dy = pos.y - ds.lastY;
        onMoveBone(ds.boneId, dx, dy);
        dragStateRef.current = { ...ds, lastX: pos.x, lastY: pos.y };
      }
    },
    [getSvg, onRotateBone, onMoveBone]
  );

  const handleCanvasPointerUp = useCallback(
    (e: React.MouseEvent) => {
      const pos = svgCoords(e, getSvg());
      const ds = dragStateRef.current;

      if (ds.mode === 'create_bone') {
        const dx = pos.x - ds.startX;
        const dy = pos.y - ds.startY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 5) {
          let parentId: string | null = null;
          const activeSkeleton = skeletons.find(s => s.id === activeSkeletonId);
          if (activeBoneId && activeSkeleton) {
            const bone = activeSkeleton.bones.find(b => b.id === activeBoneId);
            if (bone) parentId = activeBoneId;
          }
          onAddBone(ds.startX, ds.startY, pos.x, pos.y, parentId);
        }
        setCreatingHead(null);
        setPreviewTail(null);
      }

      dragStateRef.current = { mode: 'none', boneId: null, startX: 0, startY: 0, lastX: 0, lastY: 0 };
    },
    [getSvg, skeletons, activeSkeletonId, activeBoneId, onAddBone]
  );

  const handleBonePointerDown = useCallback(
    (e: React.PointerEvent, boneId: string, part: 'head' | 'tail' | 'body') => {
      e.stopPropagation();
      const pos = svgCoords(e, getSvg());

      if (activeTool === 'BONE_SELECT') {
        onSelectBone(boneId, e.ctrlKey || e.metaKey);
        if (part === 'tail') {
          dragStateRef.current = { mode: 'rotate_bone', boneId, startX: pos.x, startY: pos.y, lastX: pos.x, lastY: pos.y };
        } else {
          dragStateRef.current = { mode: 'move_bone', boneId, startX: pos.x, startY: pos.y, lastX: pos.x, lastY: pos.y };
        }
      } else if (activeTool === 'BONE_PARENT') {
        if (pendingParentBoneId === null) {
          onSetPendingParent(boneId);
          onSelectBone(boneId);
        } else {
          if (pendingParentBoneId !== boneId) {
            onSetBoneParent(pendingParentBoneId, boneId);
          }
          onSetPendingParent(null);
          onClearBoneSelection();
        }
      }
    },
    [activeTool, getSvg, pendingParentBoneId, onSelectBone, onSetPendingParent, onSetBoneParent, onClearBoneSelection]
  );

  const handlePointClick = useCallback(
    (strokeId: string, pointIndex: number, _x: number, _y: number) => {
      if (activeTool !== 'BIND_POINTS' || !activeBoneId) return;
      onBindPoint(strokeId, pointIndex, activeBoneId, 1.0);
    },
    [activeTool, activeBoneId, onBindPoint]
  );

  const handleBindLayerClick = useCallback(() => {
    if (activeTool !== 'BIND_LAYER' || !activeBoneId || !activeSkeletonId) return;
    onBindLayer(activeLayerId, activeBoneId, activeSkeletonId);
  }, [activeTool, activeBoneId, activeSkeletonId, activeLayerId, onBindLayer]);

  return {
    previewTail,
    creatingHead,
    handleCanvasPointerDown,
    handleCanvasPointerMove,
    handleCanvasPointerUp,
    handleBonePointerDown,
    handlePointClick,
    handleBindLayerClick,
  };
};

