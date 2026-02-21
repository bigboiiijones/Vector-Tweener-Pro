import { useRef, useCallback, useState } from 'react';
import { RigTool, RigMode, Skeleton } from './riggingTypes';

function toSvgCoords(
  e: React.MouseEvent | React.PointerEvent,
  svg: SVGSVGElement | null
): { x: number; y: number } {
  if (!svg) return { x: 0, y: 0 };
  const pt = svg.createSVGPoint();
  pt.x = (e as React.MouseEvent).clientX;
  pt.y = (e as React.MouseEvent).clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const p = pt.matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

function boneInRect(bone: { headX: number; headY: number; tailX: number; tailY: number }, rect: { x: number; y: number; w: number; h: number }) {
  const minX = rect.x, maxX = rect.x + rect.w;
  const minY = rect.y, maxY = rect.y + rect.h;
  const headIn = bone.headX >= minX && bone.headX <= maxX && bone.headY >= minY && bone.headY <= maxY;
  const tailIn = bone.tailX >= minX && bone.tailX <= maxX && bone.tailY >= minY && bone.tailY <= maxY;
  return headIn || tailIn;
}

function pointInRect(pt: { x: number; y: number }, rect: { x: number; y: number; w: number; h: number }) {
  return pt.x >= rect.x && pt.x <= rect.x + rect.w && pt.y >= rect.y && pt.y <= rect.y + rect.h;
}

function makeRect(x1: number, y1: number, x2: number, y2: number) {
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
}

function pointKey(strokeId: string, idx: number) { return `${strokeId}:${idx}`; }

interface UseRigCanvasInteractionProps {
  activeTool: RigTool;
  rigMode: RigMode;
  activeSkeletonId: string | null;
  skeletons: Skeleton[];
  activeBoneId: string | null;
  pendingParentBoneId: string | null;
  svgRef: React.RefObject<SVGSVGElement | null>;
  activeLayerId: string;
  currentFrameIndex: number;
  displayedStrokes: Array<{ id: string; points: Array<{ x: number; y: number }>; layerId: string }>;
  onAddBone: (hx: number, hy: number, tx: number, ty: number, parentId?: string | null) => string | null;
  onSelectBones: (ids: string[], additive: boolean) => void;
  onClearBoneSelection: () => void;
  // Edit mode handlers (modify rest pose)
  onEditMoveBone: (id: string, dx: number, dy: number) => void;
  onEditRotateBone: (id: string, tailX: number, tailY: number) => void;
  onEditScaleBone: (id: string, factor: number) => void;
  // Animate mode handlers (live pose only)
  onAnimMoveBone: (id: string, dx: number, dy: number) => void;
  onAnimRotateBone: (id: string, tailX: number, tailY: number) => void;
  onAnimScaleBone: (id: string, factor: number) => void;
  onDeleteSelectedBones: () => void;
  onSetPendingParent: (id: string | null) => void;
  onSetBoneParent: (childId: string, parentId: string | null) => void;
  onBindLayer: (layerId: string, boneId: string, skeletonId: string, strokeIdsOnLayer?: string[]) => void;
  onRecordBoneKeyframe: (frameIndex: number, channels?: import('./riggingTypes').BoneKeyChannel[]) => void;
  keyAllChannels: boolean;
}

type DragMode =
  | 'none'
  | 'creating_bone'
  | 'box_select_bones'
  | 'moving_bone'
  | 'rotating_bone'
  | 'scaling_bone'
  | 'box_select_points';

export const useRigCanvasInteraction = ({
  activeTool,
  rigMode,
  activeSkeletonId,
  skeletons,
  activeBoneId,
  pendingParentBoneId,
  svgRef,
  activeLayerId,
  currentFrameIndex,
  displayedStrokes,
  onAddBone,
  onSelectBones,
  onClearBoneSelection,
  onEditMoveBone,
  onEditRotateBone,
  onEditScaleBone,
  onAnimMoveBone,
  onAnimRotateBone,
  onAnimScaleBone,
  onDeleteSelectedBones,
  onSetPendingParent,
  onSetBoneParent,
  onBindLayer,
  onRecordBoneKeyframe,
  keyAllChannels,
}: UseRigCanvasInteractionProps) => {
  const dragModeRef = useRef<DragMode>('none');
  const dragBoneIdRef = useRef<string | null>(null);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragLastRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragModifiersRef = useRef<{ ctrl: boolean; alt: boolean; shift: boolean }>({ ctrl: false, alt: false, shift: false });
  const scaleOriginRef = useRef<{ x: number; y: number; startLen: number }>({ x: 0, y: 0, startLen: 0 });

  const [creatingHead, setCreatingHead] = useState<{ x: number; y: number } | null>(null);
  const [previewTail, setPreviewTail] = useState<{ x: number; y: number } | null>(null);
  const [boxSelectRect, setBoxSelectRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [bindBoxRect, setBindBoxRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [pendingSelectedPoints, setPendingSelectedPoints] = useState<Set<string>>(new Set());

  const getSvg = useCallback(() => svgRef?.current ?? null, [svgRef]);

  const isAnimateMode = rigMode === 'ANIMATE';

  // Dispatch move/rotate/scale to correct handler based on current mode
  const doMove = useCallback((id: string, dx: number, dy: number) => {
    if (isAnimateMode) onAnimMoveBone(id, dx, dy);
    else onEditMoveBone(id, dx, dy);
  }, [isAnimateMode, onAnimMoveBone, onEditMoveBone]);

  const doRotate = useCallback((id: string, tailX: number, tailY: number) => {
    if (isAnimateMode) onAnimRotateBone(id, tailX, tailY);
    else onEditRotateBone(id, tailX, tailY);
  }, [isAnimateMode, onAnimRotateBone, onEditRotateBone]);

  const doScale = useCallback((id: string, factor: number) => {
    if (isAnimateMode) onAnimScaleBone(id, factor);
    else onEditScaleBone(id, factor);
  }, [isAnimateMode, onAnimScaleBone, onEditScaleBone]);

  const handleCanvasPointerDown = useCallback((e: React.MouseEvent) => {
    if (!activeSkeletonId) return;
    const pos = toSvgCoords(e, getSvg());
    const mods = { ctrl: e.ctrlKey || e.metaKey, alt: e.altKey, shift: e.shiftKey };

    if (activeTool === 'BONE_CREATE') {
      dragModeRef.current = 'creating_bone';
      dragStartRef.current = pos;
      setCreatingHead({ x: pos.x, y: pos.y });
      setPreviewTail({ x: pos.x, y: pos.y });
    } else if (activeTool === 'BONE_SELECT') {
      dragModeRef.current = 'box_select_bones';
      dragStartRef.current = pos;
      dragModifiersRef.current = mods;
      if (!mods.shift) onClearBoneSelection();
      setBoxSelectRect({ x: pos.x, y: pos.y, w: 0, h: 0 });
    } else if (activeTool === 'BIND_POINTS') {
      dragModeRef.current = 'box_select_points';
      dragStartRef.current = pos;
      dragModifiersRef.current = mods;
      setBindBoxRect({ x: pos.x, y: pos.y, w: 0, h: 0 });
    }
  }, [activeTool, activeSkeletonId, getSvg, onClearBoneSelection]);

  const handleCanvasPointerMove = useCallback((e: React.MouseEvent) => {
    const pos = toSvgCoords(e, getSvg());
    const mode = dragModeRef.current;

    if (mode === 'creating_bone') {
      setPreviewTail({ x: pos.x, y: pos.y });
    } else if (mode === 'box_select_bones') {
      setBoxSelectRect(makeRect(dragStartRef.current.x, dragStartRef.current.y, pos.x, pos.y));
    } else if (mode === 'moving_bone' && dragBoneIdRef.current) {
      const dx = pos.x - dragLastRef.current.x;
      const dy = pos.y - dragLastRef.current.y;
      doMove(dragBoneIdRef.current, dx, dy);
      dragLastRef.current = pos;
    } else if (mode === 'rotating_bone' && dragBoneIdRef.current) {
      doRotate(dragBoneIdRef.current, pos.x, pos.y);
    } else if (mode === 'scaling_bone' && dragBoneIdRef.current) {
      // Scale by how far mouse has moved from origin compared to initial bone length
      const { x: ox, y: oy, startLen } = scaleOriginRef.current;
      const currentDist = Math.sqrt((pos.x - ox) ** 2 + (pos.y - oy) ** 2);
      if (startLen > 0 && currentDist > 0) {
        const newFactor = currentDist / startLen;
        // Apply incrementally: undo previous frame's scale then apply new
        const prevDist = Math.sqrt((dragLastRef.current.x - ox) ** 2 + (dragLastRef.current.y - oy) ** 2);
        const prevFactor = prevDist > 0 ? prevDist / startLen : 1;
        const delta = prevFactor > 0 ? newFactor / prevFactor : 1;
        doScale(dragBoneIdRef.current, delta);
        dragLastRef.current = pos;
      }
    } else if (mode === 'box_select_points') {
      setBindBoxRect(makeRect(dragStartRef.current.x, dragStartRef.current.y, pos.x, pos.y));
    }
  }, [getSvg, doMove, doRotate, doScale]);

  const handleCanvasPointerUp = useCallback((e: React.MouseEvent) => {
    const pos = toSvgCoords(e, getSvg());
    const mode = dragModeRef.current;
    const mods = dragModifiersRef.current;
    const wasAnimateDrag = isAnimateMode && (mode === 'moving_bone' || mode === 'rotating_bone' || mode === 'scaling_bone') && dragBoneIdRef.current;

    if (mode === 'creating_bone') {
      const dx = pos.x - dragStartRef.current.x;
      const dy = pos.y - dragStartRef.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > 8) {
        onAddBone(dragStartRef.current.x, dragStartRef.current.y, pos.x, pos.y, activeBoneId ?? null);
      }
      setCreatingHead(null);
      setPreviewTail(null);
    } else if (mode === 'box_select_bones') {
      const r = makeRect(dragStartRef.current.x, dragStartRef.current.y, pos.x, pos.y);
      if (r.w > 4 || r.h > 4) {
        const activeSkeleton = skeletons.find(s => s.id === activeSkeletonId);
        const hits = (activeSkeleton?.bones ?? []).filter(b => boneInRect(b, r)).map(b => b.id);
        onSelectBones(hits, mods.shift);
      }
      setBoxSelectRect(null);
    } else if (mode === 'box_select_points') {
      const r = makeRect(dragStartRef.current.x, dragStartRef.current.y, pos.x, pos.y);
      const hits = new Set<string>();
      for (const stroke of displayedStrokes) {
        for (let i = 0; i < (stroke.points?.length ?? 0); i++) {
          const pt = stroke.points[i];
          if (r.w < 2 && r.h < 2) continue;
          if (pointInRect(pt, r)) hits.add(pointKey(stroke.id, i));
        }
      }
      if (hits.size > 0) {
        setPendingSelectedPoints(prev => {
          const next = new Set(prev);
          if (mods.alt) { hits.forEach(k => next.delete(k)); }
          else { hits.forEach(k => next.add(k)); }
          return next;
        });
      }
      setBindBoxRect(null);
    }

    // Auto-keyframe in animate mode after any drag
    if (wasAnimateDrag) {
      // Determine which channel(s) were manipulated
      const draggedChannel = mode === 'moving_bone' ? 'translate' as const
        : mode === 'rotating_bone' ? 'rotate' as const
        : 'scale' as const;
      const channels = keyAllChannels
        ? (['translate', 'rotate', 'scale'] as import('./riggingTypes').BoneKeyChannel[])
        : [draggedChannel];
      onRecordBoneKeyframe(currentFrameIndex, channels);
    }

    dragModeRef.current = 'none';
    dragBoneIdRef.current = null;
  }, [getSvg, isAnimateMode, activeBoneId, currentFrameIndex, skeletons, activeSkeletonId, displayedStrokes,
      onAddBone, onSelectBones, onRecordBoneKeyframe]);

  const handleBonePointerDown = useCallback(
    (e: React.PointerEvent, boneId: string, part: 'head' | 'tail' | 'body') => {
      e.stopPropagation();
      const pos = toSvgCoords(e as unknown as React.MouseEvent, getSvg());
      const mods = { ctrl: e.ctrlKey || e.metaKey, alt: e.altKey, shift: e.shiftKey };

      if (activeTool === 'BONE_DELETE') {
        onSelectBones([boneId], false);
        onDeleteSelectedBones();
        return;
      }

      if (activeTool === 'BONE_SELECT' || activeTool === 'BONE_MOVE' || activeTool === 'BONE_ROTATE' || activeTool === 'BONE_SCALE') {
        onSelectBones([boneId], mods.shift || mods.ctrl);

        if (activeTool === 'BONE_SCALE' || (activeTool === 'BONE_SELECT' && part === 'tail' && mods.shift)) {
          dragModeRef.current = 'scaling_bone';
          // Find the bone's head to use as scale origin
          const activeSkeleton = skeletons.find(s => s.bones.some(b => b.id === boneId));
          const bone = activeSkeleton?.bones.find(b => b.id === boneId);
          if (bone) {
            const headPos = { x: bone.headX, y: bone.headY };
            const initialDist = Math.sqrt((pos.x - headPos.x) ** 2 + (pos.y - headPos.y) ** 2);
            scaleOriginRef.current = { x: headPos.x, y: headPos.y, startLen: Math.max(initialDist, 5) };
          }
        } else if (activeTool === 'BONE_ROTATE' || (activeTool === 'BONE_SELECT' && part === 'tail')) {
          dragModeRef.current = 'rotating_bone';
        } else {
          dragModeRef.current = 'moving_bone';
        }
        dragBoneIdRef.current = boneId;
        dragLastRef.current = pos;
      } else if (activeTool === 'BONE_PARENT') {
        if (pendingParentBoneId === null) {
          onSetPendingParent(boneId);
          onSelectBones([boneId], false);
        } else {
          if (pendingParentBoneId !== boneId) onSetBoneParent(pendingParentBoneId, boneId);
          onSetPendingParent(null);
          onClearBoneSelection();
        }
      }
    },
    [activeTool, getSvg, skeletons, pendingParentBoneId, onSelectBones, onDeleteSelectedBones,
     onSetPendingParent, onSetBoneParent, onClearBoneSelection]
  );

  const handleBonePointerUp = useCallback((e: React.PointerEvent, boneId: string) => {
    e.stopPropagation();
    const mode = dragModeRef.current;
    const wasAnimateDrag = isAnimateMode &&
      (mode === 'moving_bone' || mode === 'rotating_bone' || mode === 'scaling_bone');
    if (wasAnimateDrag) {
      const draggedChannel = mode === 'moving_bone' ? 'translate' as const
        : mode === 'rotating_bone' ? 'rotate' as const
        : 'scale' as const;
      const channels = keyAllChannels
        ? (['translate', 'rotate', 'scale'] as import('./riggingTypes').BoneKeyChannel[])
        : [draggedChannel];
      onRecordBoneKeyframe(currentFrameIndex, channels);
    }
    dragModeRef.current = 'none';
    dragBoneIdRef.current = null;
  }, [isAnimateMode, currentFrameIndex, keyAllChannels, onRecordBoneKeyframe]);

  const handlePointPointerDown = useCallback((e: React.PointerEvent, strokeId: string, pointIndex: number) => {
    e.stopPropagation();
    const key = pointKey(strokeId, pointIndex);
    const isAlt = e.altKey;
    setPendingSelectedPoints(prev => {
      const next = new Set(prev);
      if (isAlt) { next.delete(key); }
      else {
        if (next.has(key) && !e.ctrlKey && !e.metaKey) next.delete(key);
        else next.add(key);
      }
      return next;
    });
  }, []);

  const commitBindPoints = useCallback(
    (boneId: string, onBindPoint: (strokeId: string, idx: number, boneId: string, weight: number) => void) => {
      pendingSelectedPoints.forEach(key => {
        const [strokeId, idxStr] = key.split(':');
        onBindPoint(strokeId, parseInt(idxStr, 10), boneId, 1.0);
      });
      setPendingSelectedPoints(new Set());
    },
    [pendingSelectedPoints]
  );

  const removePendingPoint = useCallback((strokeId: string, pointIndex: number) => {
    setPendingSelectedPoints(prev => {
      const next = new Set(prev);
      next.delete(pointKey(strokeId, pointIndex));
      return next;
    });
  }, []);

  const handleBindLayer = useCallback(() => {
    if (!activeBoneId || !activeSkeletonId) return;
    // Pass all stroke IDs visible on the active layer so bindLayer can clear their point bindings
    const strokeIdsOnLayer = displayedStrokes
      .filter(s => s.layerId === activeLayerId)
      .map(s => s.id);
    onBindLayer(activeLayerId, activeBoneId, activeSkeletonId, strokeIdsOnLayer);
  }, [activeBoneId, activeSkeletonId, activeLayerId, displayedStrokes, onBindLayer]);

  const clearPendingPoints = useCallback(() => setPendingSelectedPoints(new Set()), []);

  return {
    creatingHead, previewTail, boxSelectRect, bindBoxRect, pendingSelectedPoints,
    handleCanvasPointerDown, handleCanvasPointerMove, handleCanvasPointerUp,
    handleBonePointerDown, handleBonePointerUp,
    handlePointPointerDown, commitBindPoints, removePendingPoint, clearPendingPoints,
    handleBindLayer,
  };
};
