import { useRef, useCallback, useState } from 'react';
import { RigTool, Skeleton } from './riggingTypes';

/** Convert a mouse/pointer event to SVG canvas coordinates using the SVG's screen CTM. */
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

/** Check if a bone's head is within an AABB rect */
function boneInRect(
  bone: { headX: number; headY: number; tailX: number; tailY: number },
  rect: { x: number; y: number; w: number; h: number }
) {
  const minX = rect.x, maxX = rect.x + rect.w;
  const minY = rect.y, maxY = rect.y + rect.h;
  // Select if head OR tail is inside rect
  const headIn = bone.headX >= minX && bone.headX <= maxX && bone.headY >= minY && bone.headY <= maxY;
  const tailIn = bone.tailX >= minX && bone.tailX <= maxX && bone.tailY >= minY && bone.tailY <= maxY;
  return headIn || tailIn;
}

/** Check if a point is inside an AABB rect */
function pointInRect(
  pt: { x: number; y: number },
  rect: { x: number; y: number; w: number; h: number }
) {
  return pt.x >= rect.x && pt.x <= rect.x + rect.w && pt.y >= rect.y && pt.y <= rect.y + rect.h;
}

function makeRect(x1: number, y1: number, x2: number, y2: number) {
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    w: Math.abs(x2 - x1),
    h: Math.abs(y2 - y1),
  };
}

function pointKey(strokeId: string, idx: number) {
  return `${strokeId}:${idx}`;
}

interface UseRigCanvasInteractionProps {
  activeTool: RigTool;
  activeSkeletonId: string | null;
  skeletons: Skeleton[];
  activeBoneId: string | null;
  pendingParentBoneId: string | null;
  svgRef: React.RefObject<SVGSVGElement | null>;
  activeLayerId: string;
  displayedStrokes: Array<{ id: string; points: Array<{ x: number; y: number }>; layerId: string }>;
  onAddBone: (hx: number, hy: number, tx: number, ty: number, parentId?: string | null) => string | null;
  onSelectBones: (ids: string[], additive: boolean) => void;
  onClearBoneSelection: () => void;
  onMoveBone: (id: string, dx: number, dy: number) => void;
  onRotateBone: (id: string, tailX: number, tailY: number) => void;
  onSetPendingParent: (id: string | null) => void;
  onSetBoneParent: (childId: string, parentId: string | null) => void;
  onBindLayer: (layerId: string, boneId: string, skeletonId: string) => void;
}

type DragMode =
  | 'none'
  | 'creating_bone'
  | 'box_select_bones'
  | 'moving_bone'
  | 'rotating_bone'
  | 'box_select_points';

export const useRigCanvasInteraction = ({
  activeTool,
  activeSkeletonId,
  skeletons,
  activeBoneId,
  pendingParentBoneId,
  svgRef,
  activeLayerId,
  displayedStrokes,
  onAddBone,
  onSelectBones,
  onClearBoneSelection,
  onMoveBone,
  onRotateBone,
  onSetPendingParent,
  onSetBoneParent,
  onBindLayer,
}: UseRigCanvasInteractionProps) => {
  const dragModeRef = useRef<DragMode>('none');
  const dragBoneIdRef = useRef<string | null>(null);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragLastRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragModifiersRef = useRef<{ ctrl: boolean; alt: boolean; shift: boolean }>({ ctrl: false, alt: false, shift: false });

  // Visual state
  const [creatingHead, setCreatingHead] = useState<{ x: number; y: number } | null>(null);
  const [previewTail, setPreviewTail] = useState<{ x: number; y: number } | null>(null);
  const [boxSelectRect, setBoxSelectRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [bindBoxRect, setBindBoxRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // Pending bind points selection: key = `strokeId:pointIndex`
  const [pendingSelectedPoints, setPendingSelectedPoints] = useState<Set<string>>(new Set());

  const getSvg = useCallback(() => svgRef?.current ?? null, [svgRef]);

  // ── Canvas pointer down (background clicks, bone creation, box-select start) ──
  const handleCanvasPointerDown = useCallback(
    (e: React.MouseEvent) => {
      if (!activeSkeletonId) return;
      const pos = toSvgCoords(e, getSvg());
      const mods = { ctrl: e.ctrlKey || e.metaKey, alt: e.altKey, shift: e.shiftKey };

      if (activeTool === 'BONE_CREATE') {
        dragModeRef.current = 'creating_bone';
        dragBoneIdRef.current = null;
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
        // Ctrl = add, Alt = remove
        dragModeRef.current = 'box_select_points';
        dragStartRef.current = pos;
        dragModifiersRef.current = mods;
        setBindBoxRect({ x: pos.x, y: pos.y, w: 0, h: 0 });
      }
    },
    [activeTool, activeSkeletonId, getSvg, onClearBoneSelection]
  );

  // ── Canvas pointer move ──
  const handleCanvasPointerMove = useCallback(
    (e: React.MouseEvent) => {
      const pos = toSvgCoords(e, getSvg());
      const mode = dragModeRef.current;

      if (mode === 'creating_bone') {
        setPreviewTail({ x: pos.x, y: pos.y });

      } else if (mode === 'box_select_bones') {
        const r = makeRect(dragStartRef.current.x, dragStartRef.current.y, pos.x, pos.y);
        setBoxSelectRect(r);

      } else if (mode === 'moving_bone' && dragBoneIdRef.current) {
        const dx = pos.x - dragLastRef.current.x;
        const dy = pos.y - dragLastRef.current.y;
        onMoveBone(dragBoneIdRef.current, dx, dy);
        dragLastRef.current = pos;

      } else if (mode === 'rotating_bone' && dragBoneIdRef.current) {
        onRotateBone(dragBoneIdRef.current, pos.x, pos.y);

      } else if (mode === 'box_select_points') {
        const r = makeRect(dragStartRef.current.x, dragStartRef.current.y, pos.x, pos.y);
        setBindBoxRect(r);
      }
    },
    [getSvg, onMoveBone, onRotateBone]
  );

  // ── Canvas pointer up ──
  const handleCanvasPointerUp = useCallback(
    (e: React.MouseEvent) => {
      const pos = toSvgCoords(e, getSvg());
      const mode = dragModeRef.current;
      const mods = dragModifiersRef.current;

      if (mode === 'creating_bone') {
        const dx = pos.x - dragStartRef.current.x;
        const dy = pos.y - dragStartRef.current.y;
        if (Math.sqrt(dx * dx + dy * dy) > 8) {
          const parentId = activeBoneId ?? null;
          onAddBone(dragStartRef.current.x, dragStartRef.current.y, pos.x, pos.y, parentId);
        }
        setCreatingHead(null);
        setPreviewTail(null);

      } else if (mode === 'box_select_bones') {
        const r = makeRect(dragStartRef.current.x, dragStartRef.current.y, pos.x, pos.y);
        if (r.w > 4 || r.h > 4) {
          const activeSkeleton = skeletons.find(s => s.id === activeSkeletonId);
          const hits = (activeSkeleton?.bones ?? [])
            .filter(b => boneInRect(b, r))
            .map(b => b.id);
          onSelectBones(hits, mods.shift);
        }
        setBoxSelectRect(null);

      } else if (mode === 'box_select_points') {
        const r = makeRect(dragStartRef.current.x, dragStartRef.current.y, pos.x, pos.y);
        // Collect hits
        const hits = new Set<string>();
        for (const stroke of displayedStrokes) {
          for (let i = 0; i < (stroke.points?.length ?? 0); i++) {
            const pt = stroke.points[i];
            if (r.w < 2 && r.h < 2) continue; // too small, skip
            if (pointInRect(pt, r)) hits.add(pointKey(stroke.id, i));
          }
        }
        if (hits.size > 0) {
          setPendingSelectedPoints(prev => {
            const next = new Set(prev);
            if (mods.alt) {
              hits.forEach(k => next.delete(k));
            } else {
              hits.forEach(k => next.add(k));
            }
            return next;
          });
        }
        setBindBoxRect(null);
      }

      dragModeRef.current = 'none';
      dragBoneIdRef.current = null;
    },
    [getSvg, activeBoneId, skeletons, activeSkeletonId, displayedStrokes, onAddBone, onSelectBones]
  );

  // ── Bone element pointer down (called from SkeletonOverlay) ──
  const handleBonePointerDown = useCallback(
    (e: React.PointerEvent, boneId: string, part: 'head' | 'tail' | 'body') => {
      e.stopPropagation();
      const pos = toSvgCoords(e as unknown as React.MouseEvent, getSvg());
      const mods = { ctrl: e.ctrlKey || e.metaKey, alt: e.altKey, shift: e.shiftKey };

      if (activeTool === 'BONE_SELECT') {
        onSelectBones([boneId], mods.shift || mods.ctrl);
        if (part === 'tail') {
          dragModeRef.current = 'rotating_bone';
        } else {
          dragModeRef.current = 'moving_bone';
        }
        dragBoneIdRef.current = boneId;
        dragLastRef.current = pos;

      } else if (activeTool === 'BONE_MOVE') {
        onSelectBones([boneId], mods.shift || mods.ctrl);
        dragModeRef.current = 'moving_bone';
        dragBoneIdRef.current = boneId;
        dragLastRef.current = pos;

      } else if (activeTool === 'BONE_ROTATE') {
        onSelectBones([boneId], mods.shift || mods.ctrl);
        dragModeRef.current = 'rotating_bone';
        dragBoneIdRef.current = boneId;
        dragLastRef.current = pos;

      } else if (activeTool === 'BONE_PARENT') {
        if (pendingParentBoneId === null) {
          onSetPendingParent(boneId);
          onSelectBones([boneId], false);
        } else {
          if (pendingParentBoneId !== boneId) {
            onSetBoneParent(pendingParentBoneId, boneId);
          }
          onSetPendingParent(null);
          onClearBoneSelection();
        }
      }
    },
    [activeTool, getSvg, pendingParentBoneId, onSelectBones, onSetPendingParent, onSetBoneParent, onClearBoneSelection]
  );

  // ── Point click in BIND_POINTS mode (Ctrl = add, Alt = remove) ──
  const handlePointPointerDown = useCallback(
    (e: React.PointerEvent, strokeId: string, pointIndex: number) => {
      e.stopPropagation();
      const key = pointKey(strokeId, pointIndex);
      const isAlt = e.altKey;
      setPendingSelectedPoints(prev => {
        const next = new Set(prev);
        if (isAlt) {
          next.delete(key);
        } else {
          // Ctrl or default = add; if it's already there and no modifier, toggle off
          if (next.has(key) && !e.ctrlKey && !e.metaKey) {
            next.delete(key);
          } else {
            next.add(key);
          }
        }
        return next;
      });
    },
    []
  );

  // ── Commit pending bind points to active bone ──
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

  // ── Deselect pending point (Alt+click from overlay directly) ──
  const removePendingPoint = useCallback((strokeId: string, pointIndex: number) => {
    setPendingSelectedPoints(prev => {
      const next = new Set(prev);
      next.delete(pointKey(strokeId, pointIndex));
      return next;
    });
  }, []);

  // ── Bind layer shortcut ──
  const handleBindLayer = useCallback(() => {
    if (!activeBoneId || !activeSkeletonId) return;
    onBindLayer(activeLayerId, activeBoneId, activeSkeletonId);
  }, [activeBoneId, activeSkeletonId, activeLayerId, onBindLayer]);

  const clearPendingPoints = useCallback(() => setPendingSelectedPoints(new Set()), []);

  return {
    // Visual state for rendering
    creatingHead,
    previewTail,
    boxSelectRect,
    bindBoxRect,
    pendingSelectedPoints,
    // Handlers
    handleCanvasPointerDown,
    handleCanvasPointerMove,
    handleCanvasPointerUp,
    handleBonePointerDown,
    handlePointPointerDown,
    commitBindPoints,
    removePendingPoint,
    clearPendingPoints,
    handleBindLayer,
  };
};
