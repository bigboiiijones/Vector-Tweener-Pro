import { useState, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Bone, Skeleton, BoundPoint, BoundLayer, BoneKeyframe, RigTool } from './riggingTypes';
import { angleBetween, distance } from './riggingMath';

export const useRigging = () => {
  const [skeletons, setSkeletons] = useState<Skeleton[]>([]);
  const [activeSkeletonId, setActiveSkeletonId] = useState<string | null>(null);
  const [selectedBoneIds, setSelectedBoneIds] = useState<Set<string>>(new Set());
  const [boundPoints, setBoundPoints] = useState<BoundPoint[]>([]);
  const [boundLayers, setBoundLayers] = useState<BoundLayer[]>([]);
  const [boneKeyframes, setBoneKeyframes] = useState<BoneKeyframe[]>([]);
  const [activeBoneId, setActiveBoneId] = useState<string | null>(null);
  const [pendingParentBoneId, setPendingParentBoneId] = useState<string | null>(null);

  const getActiveSkeleton = useCallback((): Skeleton | null => {
    return skeletons.find(s => s.id === activeSkeletonId) || null;
  }, [skeletons, activeSkeletonId]);

  // Create a new skeleton for a layer
  const createSkeleton = useCallback((layerId: string, name?: string) => {
    const id = uuidv4();
    const skeleton: Skeleton = {
      id,
      layerId,
      name: name || `Skeleton ${Date.now()}`,
      bones: [],
    };
    setSkeletons(prev => [...prev, skeleton]);
    setActiveSkeletonId(id);
    return id;
  }, []);

  // Add a bone to the active skeleton
  const addBone = useCallback(
    (headX: number, headY: number, tailX: number, tailY: number, parentBoneId?: string | null) => {
      if (!activeSkeletonId) return null;
      const boneId = uuidv4();
      const angle = angleBetween(headX, headY, tailX, tailY);
      const len = distance(headX, headY, tailX, tailY);

      const bone: Bone = {
        id: boneId,
        name: `Bone ${Date.now()}`,
        parentBoneId: parentBoneId ?? null,
        headX,
        headY,
        tailX,
        tailY,
        angle,
        length: len,
        restAngle: angle,
        restHeadX: headX,
        restHeadY: headY,
        restTailX: tailX,
        restTailY: tailY,
        color: '#f59e0b',
        strength: 1.0,
        zOrder: 0,
        isSelected: false,
      };

      setSkeletons(prev =>
        prev.map(s =>
          s.id === activeSkeletonId ? { ...s, bones: [...s.bones, bone] } : s
        )
      );
      setActiveBoneId(boneId);
      setSelectedBoneIds(new Set([boneId]));
      return boneId;
    },
    [activeSkeletonId]
  );

  // Update a bone's tail position (during drag)
  const updateBoneTail = useCallback(
    (boneId: string, tailX: number, tailY: number) => {
      setSkeletons(prev =>
        prev.map(s => ({
          ...s,
          bones: s.bones.map(b => {
            if (b.id !== boneId) return b;
            const angle = angleBetween(b.headX, b.headY, tailX, tailY);
            const len = distance(b.headX, b.headY, tailX, tailY);
            return { ...b, tailX, tailY, angle, length: len, restAngle: angle, restTailX: tailX, restTailY: tailY };
          }),
        }))
      );
    },
    []
  );

  // Select a single bone
  const selectBone = useCallback((boneId: string, multi = false) => {
    setSelectedBoneIds(prev => {
      if (multi) {
        const next = new Set(prev);
        next.has(boneId) ? next.delete(boneId) : next.add(boneId);
        return next;
      }
      return new Set([boneId]);
    });
    setActiveBoneId(boneId);
  }, []);

  // Select multiple bones at once (from box-select). additive = shift key
  const selectBones = useCallback((ids: string[], additive: boolean) => {
    setSelectedBoneIds(prev => {
      if (additive) {
        const next = new Set(prev);
        ids.forEach(id => next.add(id));
        return next;
      }
      return new Set(ids);
    });
    if (ids.length > 0) setActiveBoneId(ids[ids.length - 1]);
    else setActiveBoneId(null);
  }, []);

  const clearBoneSelection = useCallback(() => {
    setSelectedBoneIds(new Set());
    setActiveBoneId(null);
  }, []);

  // Parent tool: set bone A as parent of bone B
  const setBoneParent = useCallback((childBoneId: string, parentBoneId: string | null) => {
    if (!activeSkeletonId) return;
    setSkeletons(prev =>
      prev.map(s =>
        s.id === activeSkeletonId
          ? {
              ...s,
              bones: s.bones.map(b =>
                b.id === childBoneId ? { ...b, parentBoneId } : b
              ),
            }
          : s
      )
    );
  }, [activeSkeletonId]);

  // Bind a stroke point to a bone
  const bindPoint = useCallback(
    (strokeId: string, pointIndex: number, boneId: string, weight = 1.0) => {
      setBoundPoints(prev => {
        // Remove existing bind for same stroke+point
        const filtered = prev.filter(bp => !(bp.strokeId === strokeId && bp.pointIndex === pointIndex));
        return [...filtered, { strokeId, pointIndex, boneId, weight }];
      });
    },
    []
  );

  // Unbind a point
  const unbindPoint = useCallback((strokeId: string, pointIndex: number) => {
    setBoundPoints(prev =>
      prev.filter(bp => !(bp.strokeId === strokeId && bp.pointIndex === pointIndex))
    );
  }, []);

  // Bind a whole layer to a bone
  const bindLayer = useCallback((layerId: string, boneId: string, skeletonId: string) => {
    setBoundLayers(prev => {
      const filtered = prev.filter(bl => bl.layerId !== layerId);
      return [...filtered, { layerId, boneId, skeletonId }];
    });
  }, []);

  const unbindLayer = useCallback((layerId: string) => {
    setBoundLayers(prev => prev.filter(bl => bl.layerId !== layerId));
  }, []);

  // Record bone keyframe
  const recordBoneKeyframe = useCallback((frameIndex: number) => {
    if (!activeSkeletonId) return;
    const skeleton = skeletons.find(s => s.id === activeSkeletonId);
    if (!skeleton) return;

    const transforms: BoneKeyframe['boneTransforms'] = {};
    skeleton.bones.forEach(b => {
      transforms[b.id] = { angle: b.angle, headX: b.headX, headY: b.headY };
    });

    setBoneKeyframes(prev => {
      const filtered = prev.filter(
        kf => !(kf.frameIndex === frameIndex && kf.skeletonId === activeSkeletonId)
      );
      return [
        ...filtered,
        { id: uuidv4(), frameIndex, skeletonId: activeSkeletonId, boneTransforms: transforms },
      ];
    });
  }, [activeSkeletonId, skeletons]);

  // Move a bone (translate head+tail)
  const moveBone = useCallback((boneId: string, dx: number, dy: number) => {
    setSkeletons(prev =>
      prev.map(s => ({
        ...s,
        bones: s.bones.map(b => {
          if (b.id !== boneId) return b;
          return {
            ...b,
            headX: b.headX + dx,
            headY: b.headY + dy,
            tailX: b.tailX + dx,
            tailY: b.tailY + dy,
          };
        }),
      }))
    );
  }, []);

  // Rotate bone by dragging tail
  const rotateBone = useCallback((boneId: string, tailX: number, tailY: number) => {
    setSkeletons(prev =>
      prev.map(s => ({
        ...s,
        bones: s.bones.map(b => {
          if (b.id !== boneId) return b;
          const angle = angleBetween(b.headX, b.headY, tailX, tailY);
          const len = b.length > 0 ? b.length : distance(b.headX, b.headY, tailX, tailY);
          const newTailX = b.headX + Math.cos(angle) * len;
          const newTailY = b.headY + Math.sin(angle) * len;
          return { ...b, tailX: newTailX, tailY: newTailY, angle };
        }),
      }))
    );
  }, []);

  // Delete selected bones
  const deleteSelectedBones = useCallback(() => {
    if (!activeSkeletonId || selectedBoneIds.size === 0) return;
    setSkeletons(prev =>
      prev.map(s =>
        s.id === activeSkeletonId
          ? { ...s, bones: s.bones.filter(b => !selectedBoneIds.has(b.id)) }
          : s
      )
    );
    setSelectedBoneIds(new Set());
    setActiveBoneId(null);
  }, [activeSkeletonId, selectedBoneIds]);

  // Rename bone
  const renameBone = useCallback((boneId: string, name: string) => {
    setSkeletons(prev =>
      prev.map(s => ({
        ...s,
        bones: s.bones.map(b => (b.id === boneId ? { ...b, name } : b)),
      }))
    );
  }, []);

  // Update bone color
  const setBoneColor = useCallback((boneId: string, color: string) => {
    setSkeletons(prev =>
      prev.map(s => ({
        ...s,
        bones: s.bones.map(b => (b.id === boneId ? { ...b, color } : b)),
      }))
    );
  }, []);

  // Update bone strength
  const setBoneStrength = useCallback((boneId: string, strength: number) => {
    setSkeletons(prev =>
      prev.map(s => ({
        ...s,
        bones: s.bones.map(b => (b.id === boneId ? { ...b, strength } : b)),
      }))
    );
  }, []);

  const getSkeletonForLayer = useCallback((layerId: string): Skeleton | null => {
    return skeletons.find(s => s.layerId === layerId) || null;
  }, [skeletons]);

  return {
    skeletons,
    activeSkeletonId,
    setActiveSkeletonId,
    selectedBoneIds,
    activeBoneId,
    boundPoints,
    boundLayers,
    boneKeyframes,
    pendingParentBoneId,
    setPendingParentBoneId,
    getActiveSkeleton,
    createSkeleton,
    addBone,
    updateBoneTail,
    selectBone,
    selectBones,
    clearBoneSelection,
    setBoneParent,
    bindPoint,
    unbindPoint,
    bindLayer,
    unbindLayer,
    recordBoneKeyframe,
    moveBone,
    rotateBone,
    deleteSelectedBones,
    renameBone,
    setBoneColor,
    setBoneStrength,
    getSkeletonForLayer,
  };
};
