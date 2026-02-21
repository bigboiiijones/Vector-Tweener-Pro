import { useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  Bone, Skeleton, BoundPoint, BoundLayer, BoneKeyframe, BoneKeyChannel,
  RigMode, InheritMode
} from './riggingTypes';
import { angleBetween, distance, pointToSegmentDistance } from './riggingMath';
import type { Stroke } from '../types';

// ─── Angle lerp ──────────────────────────────────────────────────────────────
function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI)  d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
}

// ─── Parent propagation (FIXED) ───────────────────────────────────────────────
//
// KEY INSIGHT: All angles in this system are WORLD-SPACE (absolute radians).
// When a parent bone rotates, its TAIL moves in world space. Children whose
// restHeadX/Y was at the parent's restTailX/Y should now have their headX/Y
// at the parent's NEW tail position. The child's OWN angle does NOT change
// unless the child is being directly manipulated.
//
// So propagation = translate the child's head/tail to follow the parent tail,
// preserving the child's own live angle unchanged.
//
function propagateParentToBone(bone: Bone, allBones: Bone[]): Bone {
  if (!bone.parentBoneId) return bone;
  const parent = allBones.find(b => b.id === bone.parentBoneId);
  if (!parent) return bone;

  // Parent's live tail position
  const parentLiveTailX = parent.headX + Math.cos(parent.angle) * parent.length;
  const parentLiveTailY = parent.headY + Math.sin(parent.angle) * parent.length;

  // Child's rest offset from parent's rest tail
  // (This is where the child "lives" relative to the parent tail at rest)
  const parentRestTailX = parent.restHeadX + Math.cos(parent.restAngle) * parent.restLength;
  const parentRestTailY = parent.restHeadY + Math.sin(parent.restAngle) * parent.restLength;

  // Offset of child head from parent rest tail
  const offsetX = bone.restHeadX - parentRestTailX;
  const offsetY = bone.restHeadY - parentRestTailY;

  // Rotate that rest offset by the parent's delta angle (parent's rotation in animate pose)
  const parentDelta = parent.angle - parent.restAngle;
  const cosD = Math.cos(parentDelta);
  const sinD = Math.sin(parentDelta);
  const rotOffX = offsetX * cosD - offsetY * sinD;
  const rotOffY = offsetX * sinD + offsetY * cosD;

  // Child's new head = parent's live tail + rotated offset
  const newHeadX = parentLiveTailX + rotOffX;
  const newHeadY = parentLiveTailY + rotOffY;

  // Child's own angle is PRESERVED — it doesn't spin with parent
  // (only translation/position changes; the child's own orientation is unchanged)
  const ownAngle = bone.angle;
  const newTailX = newHeadX + Math.cos(ownAngle) * bone.length;
  const newTailY = newHeadY + Math.sin(ownAngle) * bone.length;

  return { ...bone, headX: newHeadX, headY: newHeadY, tailX: newTailX, tailY: newTailY };
}

/** BFS from movedBoneId, propagate transform to all descendants. */
function propagateToDescendants(movedBoneId: string, bones: Bone[]): Bone[] {
  const result = [...bones];
  const queue = [movedBoneId];
  const visited = new Set<string>([movedBoneId]);

  while (queue.length > 0) {
    const parentId = queue.shift()!;
    for (let i = 0; i < result.length; i++) {
      const b = result[i];
      if (b.parentBoneId === parentId && !visited.has(b.id)) {
        result[i] = propagateParentToBone(b, result);
        visited.add(b.id);
        queue.push(b.id);
      }
    }
  }
  return result;
}

const DEFAULT_FLEXI_RADIUS = 120;

// ─── Per-channel keyframe interpolation ──────────────────────────────────────
//
// BoneKeyframe.boneTransforms[boneId] stores ALL channels at a given frame.
// keyedChannels[] records which channels were explicitly set.
// When interpolating, per-channel we find the surrounding keyframes that have
// that specific channel keyed and interpolate only between those.

function getChannelAtFrame(
  boneId: string,
  channel: BoneKeyChannel,
  frameIndex: number,
  keyframes: BoneKeyframe[],
  bone: Bone
): { angle: number; headX: number; headY: number; length: number } | null {
  // Collect only keyframes that have this channel explicitly keyed for this bone
  const relevant = keyframes
    .filter(kf => {
      const bt = kf.boneTransforms[boneId];
      if (!bt) return false;
      const keyed = bt.keyedChannels ?? ['translate', 'rotate', 'scale']; // old keys: all channels
      return keyed.includes(channel);
    })
    .sort((a, b) => a.frameIndex - b.frameIndex);

  if (relevant.length === 0) return null;

  // Find surrounding keys
  let prev = relevant[0];
  let next = relevant[relevant.length - 1];
  for (let i = 0; i < relevant.length; i++) {
    if (relevant[i].frameIndex <= frameIndex) prev = relevant[i];
    if (relevant[i].frameIndex >= frameIndex) { next = relevant[i]; break; }
  }

  const pBt = prev.boneTransforms[boneId]!;
  const nBt = next.boneTransforms[boneId]!;
  const isExact = prev.frameIndex === next.frameIndex;
  const t = isExact ? 0 : (frameIndex - prev.frameIndex) / (next.frameIndex - prev.frameIndex);
  const ct = Math.max(0, Math.min(1, t));

  return {
    angle:  lerpAngle(pBt.angle  ?? bone.restAngle,  nBt.angle  ?? bone.restAngle,  ct),
    headX:  (pBt.headX ?? bone.restHeadX)  + ((nBt.headX ?? bone.restHeadX)  - (pBt.headX ?? bone.restHeadX))  * ct,
    headY:  (pBt.headY ?? bone.restHeadY)  + ((nBt.headY ?? bone.restHeadY)  - (pBt.headY ?? bone.restHeadY))  * ct,
    length: (pBt.length ?? bone.restLength) + ((nBt.length ?? bone.restLength) - (pBt.length ?? bone.restLength)) * ct,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
export const useRigging = () => {
  const [skeletons, setSkeletons]         = useState<Skeleton[]>([]);
  const [activeSkeletonId, setActiveSkeletonId] = useState<string | null>(null);
  const [selectedBoneIds, setSelectedBoneIds]   = useState<Set<string>>(new Set());
  const [boundPoints, setBoundPoints]     = useState<BoundPoint[]>([]);
  const [boundLayers, setBoundLayers]     = useState<BoundLayer[]>([]);
  const [boneKeyframes, setBoneKeyframes] = useState<BoneKeyframe[]>([]);
  const [activeBoneId, setActiveBoneId]   = useState<string | null>(null);
  const [pendingParentBoneId, setPendingParentBoneId] = useState<string | null>(null);
  const [rigMode, setRigMode]             = useState<RigMode>('EDIT');
  const [inheritMode, setInheritMode]     = useState<InheritMode>('INHERIT');
  const [flexiBindEnabled, setFlexiBindEnabled] = useState(false);
  const [preFlexi, setPreFlexi]           = useState<BoundPoint[] | null>(null);
  // When true, manipulating any channel keys ALL channels (default ON)
  const [keyAllChannels, setKeyAllChannels] = useState(true);

  const getActiveSkeleton = useCallback((): Skeleton | null =>
    skeletons.find(s => s.id === activeSkeletonId) || null,
    [skeletons, activeSkeletonId]
  );

  // ── Skeleton / bone creation ──────────────────────────────────────────────
  const createSkeleton = useCallback((layerId: string, name?: string) => {
    const id = uuidv4();
    setSkeletons(prev => [...prev, { id, layerId, name: name || 'Skeleton', bones: [] }]);
    setActiveSkeletonId(id);
    return id;
  }, []);

  const renameSkeleton = useCallback((skeletonId: string, name: string) => {
    setSkeletons(prev => prev.map(s => s.id === skeletonId ? { ...s, name } : s));
  }, []);

  const addBone = useCallback(
    (headX: number, headY: number, tailX: number, tailY: number, parentBoneId?: string | null) => {
      if (!activeSkeletonId) return null;
      const boneId = uuidv4();
      const angle  = angleBetween(headX, headY, tailX, tailY);
      const len    = distance(headX, headY, tailX, tailY);
      const bone: Bone = {
        id: boneId, name: 'Bone', parentBoneId: parentBoneId ?? null,
        headX, headY, tailX, tailY, angle, length: len,
        restAngle: angle, restHeadX: headX, restHeadY: headY,
        restTailX: tailX, restTailY: tailY, restLength: len,
        color: '#f59e0b', strength: 1.0, flexiBindRadius: DEFAULT_FLEXI_RADIUS,
        zOrder: 0, isSelected: false,
      };
      setSkeletons(prev =>
        prev.map(s => s.id === activeSkeletonId ? { ...s, bones: [...s.bones, bone] } : s)
      );
      setActiveBoneId(boneId);
      setSelectedBoneIds(new Set([boneId]));
      return boneId;
    }, [activeSkeletonId]
  );

  const updateBoneTail = useCallback((boneId: string, tailX: number, tailY: number) => {
    setSkeletons(prev => prev.map(s => ({
      ...s, bones: s.bones.map(b => {
        if (b.id !== boneId) return b;
        const angle = angleBetween(b.headX, b.headY, tailX, tailY);
        const len   = distance(b.headX, b.headY, tailX, tailY);
        return { ...b, tailX, tailY, angle, length: len, restAngle: angle, restLength: len, restTailX: tailX, restTailY: tailY };
      }),
    })));
  }, []);

  // ── Selection ─────────────────────────────────────────────────────────────
  const selectBone = useCallback((boneId: string, multi = false) => {
    setSelectedBoneIds(prev => {
      if (multi) { const n = new Set(prev); n.has(boneId) ? n.delete(boneId) : n.add(boneId); return n; }
      return new Set([boneId]);
    });
    setActiveBoneId(boneId);
  }, []);

  const selectBones = useCallback((ids: string[], additive: boolean) => {
    setSelectedBoneIds(prev => {
      if (additive) { const n = new Set(prev); ids.forEach(id => n.add(id)); return n; }
      return new Set(ids);
    });
    setActiveBoneId(ids.length > 0 ? ids[ids.length - 1] : null);
  }, []);

  const clearBoneSelection = useCallback(() => { setSelectedBoneIds(new Set()); setActiveBoneId(null); }, []);

  const setBoneParent = useCallback((childBoneId: string, parentBoneId: string | null) => {
    if (!activeSkeletonId) return;
    setSkeletons(prev => prev.map(s =>
      s.id === activeSkeletonId
        ? { ...s, bones: s.bones.map(b => b.id === childBoneId ? { ...b, parentBoneId } : b) }
        : s
    ));
  }, [activeSkeletonId]);

  // ── Binding ───────────────────────────────────────────────────────────────
  const bindPoint = useCallback((strokeId: string, pointIndex: number, boneId: string, weight = 1.0) => {
    setBoundPoints(prev => {
      const filtered = prev.filter(bp => !(bp.strokeId === strokeId && bp.pointIndex === pointIndex && bp.boneId === boneId));
      return [...filtered, { strokeId, pointIndex, boneId, weight }];
    });
  }, []);

  const unbindPoint   = useCallback((strokeId: string, pointIndex: number) => {
    setBoundPoints(prev => prev.filter(bp => !(bp.strokeId === strokeId && bp.pointIndex === pointIndex)));
  }, []);
  const unbindStroke  = useCallback((strokeId: string) => {
    setBoundPoints(prev => prev.filter(bp => bp.strokeId !== strokeId));
  }, []);

  const bindLayer = useCallback((layerId: string, boneId: string, skeletonId: string, strokeIdsOnLayer?: string[]) => {
    setBoundLayers(prev => {
      const filtered = prev.filter(bl => bl.layerId !== layerId);
      return [...filtered, { layerId, boneId, skeletonId }];
    });
    if (strokeIdsOnLayer?.length) {
      setBoundPoints(prev => prev.filter(bp => !strokeIdsOnLayer.includes(bp.strokeId)));
    }
  }, []);
  const unbindLayer = useCallback((layerId: string) => {
    setBoundLayers(prev => prev.filter(bl => bl.layerId !== layerId));
  }, []);

  // ── Per-channel keyframe recording ────────────────────────────────────────
  // Each bone stores all its channels in one BoneKeyframe per frame per skeleton.
  // keyedChannels[] on boneTransforms records which channels were explicitly set.
  const recordBoneKeyframe = useCallback((
    frameIndex: number,
    channels?: BoneKeyChannel[]   // if omitted, records all channels
  ) => {
    if (!activeSkeletonId) return;
    const skeleton = skeletons.find(s => s.id === activeSkeletonId);
    if (!skeleton) return;

    const activeChannels: BoneKeyChannel[] = channels ?? ['translate', 'rotate', 'scale'];

    setBoneKeyframes(prev => {
      // Find or create the keyframe for this frame+skeleton
      const existingIdx = prev.findIndex(kf => kf.frameIndex === frameIndex && kf.skeletonId === activeSkeletonId);
      const existing = existingIdx >= 0 ? prev[existingIdx] : null;

      const newTransforms: BoneKeyframe['boneTransforms'] = existing ? { ...existing.boneTransforms } : {};

      skeleton.bones.forEach(b => {
        const prevEntry = newTransforms[b.id] ?? {
          angle: b.restAngle, headX: b.restHeadX, headY: b.restHeadY, length: b.restLength,
          keyedChannels: [],
        };
        const existingKeyed = prevEntry.keyedChannels ?? [];
        const mergedKeyed = Array.from(new Set([...existingKeyed, ...activeChannels]));

        newTransforms[b.id] = {
          angle:  activeChannels.includes('rotate')    ? b.angle  : (prevEntry.angle  ?? b.restAngle),
          headX:  activeChannels.includes('translate') ? b.headX  : (prevEntry.headX  ?? b.restHeadX),
          headY:  activeChannels.includes('translate') ? b.headY  : (prevEntry.headY  ?? b.restHeadY),
          length: activeChannels.includes('scale')     ? b.length : (prevEntry.length ?? b.restLength),
          keyedChannels: mergedKeyed,
        };
      });

      const newKf: BoneKeyframe = {
        id: existing?.id ?? uuidv4(),
        frameIndex,
        skeletonId: activeSkeletonId,
        boneTransforms: newTransforms,
      };

      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = newKf;
        return updated;
      }
      return [...prev, newKf];
    });
  }, [activeSkeletonId, skeletons]);

  const deleteBoneKeyframe = useCallback((frameIndex: number, skeletonId: string, channels?: BoneKeyChannel[]) => {
    if (!channels || channels.length === 3) {
      // Delete entire keyframe
      setBoneKeyframes(prev => prev.filter(kf => !(kf.frameIndex === frameIndex && kf.skeletonId === skeletonId)));
    } else {
      // Remove only specific channels
      setBoneKeyframes(prev => prev.map(kf => {
        if (kf.frameIndex !== frameIndex || kf.skeletonId !== skeletonId) return kf;
        const newTransforms = { ...kf.boneTransforms };
        for (const boneId in newTransforms) {
          const bt = newTransforms[boneId];
          const keyed = (bt.keyedChannels ?? ['translate','rotate','scale']).filter(c => !channels.includes(c));
          newTransforms[boneId] = { ...bt, keyedChannels: keyed };
        }
        return { ...kf, boneTransforms: newTransforms };
      }));
    }
  }, []);

  // ── Bone update helper: apply + propagate to descendants ─────────────────
  const applyBoneUpdate = useCallback((boneId: string, updater: (b: Bone) => Bone, propagate: boolean) => {
    setSkeletons(prev => prev.map(s => {
      const idx = s.bones.findIndex(b => b.id === boneId);
      if (idx === -1) return s;
      let bones = [...s.bones];
      bones[idx] = updater(bones[idx]);
      if (propagate) bones = propagateToDescendants(boneId, bones);
      return { ...s, bones };
    }));
  }, []);

  // ── EDIT mode ops — modify rest pose ─────────────────────────────────────
  const editMoveBone = useCallback((boneId: string, dx: number, dy: number) => {
    applyBoneUpdate(boneId, b => ({
      ...b,
      headX: b.headX + dx, headY: b.headY + dy,
      tailX: b.tailX + dx, tailY: b.tailY + dy,
      restHeadX: b.restHeadX + dx, restHeadY: b.restHeadY + dy,
      restTailX: b.restTailX + dx, restTailY: b.restTailY + dy,
    }), inheritMode === 'INHERIT');
  }, [applyBoneUpdate, inheritMode]);

  const editRotateBone = useCallback((boneId: string, tailX: number, tailY: number) => {
    applyBoneUpdate(boneId, b => {
      const angle = angleBetween(b.headX, b.headY, tailX, tailY);
      const len   = b.restLength > 0 ? b.restLength : distance(b.headX, b.headY, tailX, tailY);
      const nTailX = b.headX + Math.cos(angle) * len;
      const nTailY = b.headY + Math.sin(angle) * len;
      return { ...b, angle, tailX: nTailX, tailY: nTailY, restAngle: angle, restTailX: nTailX, restTailY: nTailY };
    }, inheritMode === 'INHERIT');
  }, [applyBoneUpdate, inheritMode]);

  const editScaleBone = useCallback((boneId: string, scaleFactor: number) => {
    applyBoneUpdate(boneId, b => {
      const newLen  = Math.max(5, b.length * scaleFactor);
      const nTailX  = b.headX + Math.cos(b.angle) * newLen;
      const nTailY  = b.headY + Math.sin(b.angle) * newLen;
      return { ...b, length: newLen, restLength: newLen, tailX: nTailX, tailY: nTailY, restTailX: nTailX, restTailY: nTailY };
    }, inheritMode === 'INHERIT');
  }, [applyBoneUpdate, inheritMode]);

  // ── ANIMATE mode ops — live pose only ────────────────────────────────────
  const animMoveBone = useCallback((boneId: string, dx: number, dy: number) => {
    applyBoneUpdate(boneId, b => ({
      ...b,
      headX: b.headX + dx, headY: b.headY + dy,
      tailX: b.tailX + dx, tailY: b.tailY + dy,
    }), inheritMode === 'INHERIT');
  }, [applyBoneUpdate, inheritMode]);

  const animRotateBone = useCallback((boneId: string, tailX: number, tailY: number) => {
    applyBoneUpdate(boneId, b => {
      const angle = angleBetween(b.headX, b.headY, tailX, tailY);
      const len   = b.length > 0 ? b.length : distance(b.headX, b.headY, tailX, tailY);
      return { ...b, angle, tailX: b.headX + Math.cos(angle) * len, tailY: b.headY + Math.sin(angle) * len };
    }, inheritMode === 'INHERIT');
  }, [applyBoneUpdate, inheritMode]);

  const animScaleBone = useCallback((boneId: string, scaleFactor: number) => {
    applyBoneUpdate(boneId, b => {
      const newLen = Math.max(5, b.length * scaleFactor);
      return { ...b, length: newLen, tailX: b.headX + Math.cos(b.angle) * newLen, tailY: b.headY + Math.sin(b.angle) * newLen };
    }, inheritMode === 'INHERIT');
  }, [applyBoneUpdate, inheritMode]);

  const resetBonePose = useCallback((boneId: string) => {
    applyBoneUpdate(boneId, b => ({
      ...b,
      headX: b.restHeadX, headY: b.restHeadY, tailX: b.restTailX, tailY: b.restTailY,
      angle: b.restAngle, length: b.restLength,
    }), inheritMode === 'INHERIT');
  }, [applyBoneUpdate, inheritMode]);

  // ── Delete ────────────────────────────────────────────────────────────────
  const deleteSelectedBones = useCallback(() => {
    if (!activeSkeletonId || selectedBoneIds.size === 0) return;
    const deletedIds = Array.from(selectedBoneIds);
    setBoundPoints(prev => prev.filter(bp => !deletedIds.includes(bp.boneId)));
    setBoundLayers(prev => prev.filter(bl => !deletedIds.includes(bl.boneId)));
    setSkeletons(prev => prev.map(s =>
      s.id === activeSkeletonId ? { ...s, bones: s.bones.filter(b => !selectedBoneIds.has(b.id)) } : s
    ));
    setSelectedBoneIds(new Set());
    setActiveBoneId(null);
  }, [activeSkeletonId, selectedBoneIds]);

  // ── Properties ───────────────────────────────────────────────────────────
  const renameBone        = useCallback((id: string, name: string) =>
    setSkeletons(prev => prev.map(s => ({ ...s, bones: s.bones.map(b => b.id === id ? { ...b, name } : b) }))), []);
  const setBoneColor      = useCallback((id: string, color: string) =>
    setSkeletons(prev => prev.map(s => ({ ...s, bones: s.bones.map(b => b.id === id ? { ...b, color } : b) }))), []);
  const setBoneStrength   = useCallback((id: string, strength: number) =>
    setSkeletons(prev => prev.map(s => ({ ...s, bones: s.bones.map(b => b.id === id ? { ...b, strength } : b) }))), []);
  const setBoneFlexiRadius = useCallback((id: string, flexiBindRadius: number) =>
    setSkeletons(prev => prev.map(s => ({ ...s, bones: s.bones.map(b => b.id === id ? { ...b, flexiBindRadius } : b) }))), []);

  const getSkeletonForLayer = useCallback((layerId: string): Skeleton | null =>
    skeletons.find(s => s.layerId === layerId) || null, [skeletons]);

  // ── Flexi-Bind ────────────────────────────────────────────────────────────
  const enableFlexiBind = useCallback((strokes: Stroke[], skeletonId?: string) => {
    const skeleton = skeletonId
      ? skeletons.find(s => s.id === skeletonId)
      : skeletons.find(s => s.id === activeSkeletonId);
    if (!skeleton || skeleton.bones.length === 0) return;

    setBoundPoints(prev => {
      setPreFlexi(prev);
      const newBindings: BoundPoint[] = [];
      for (const stroke of strokes) {
        for (let i = 0; i < stroke.points.length; i++) {
          const pt = stroke.points[i];
          const influences: { boneId: string; w: number }[] = [];
          let totalW = 0;
          for (const bone of skeleton.bones) {
            const d = pointToSegmentDistance(pt.x, pt.y, bone.headX, bone.headY, bone.tailX, bone.tailY);
            const r = bone.flexiBindRadius * bone.strength;
            if (r > 0 && d < r) {
              const w = Math.pow(1 - d / r, 2);
              influences.push({ boneId: bone.id, w });
              totalW += w;
            }
          }
          if (totalW === 0) continue;
          for (const inf of influences) {
            const norm = inf.w / totalW;
            if (norm > 0.01) newBindings.push({ strokeId: stroke.id, pointIndex: i, boneId: inf.boneId, weight: norm });
          }
        }
      }
      const strokeIds = new Set(strokes.map(s => s.id));
      return [...prev.filter(bp => !strokeIds.has(bp.strokeId)), ...newBindings];
    });
    setFlexiBindEnabled(true);
  }, [skeletons, activeSkeletonId]);

  const disableFlexiBind = useCallback(() => {
    if (preFlexi !== null) { setBoundPoints(preFlexi); setPreFlexi(null); }
    setFlexiBindEnabled(false);
  }, [preFlexi]);

  const applyFlexiBind = useCallback((strokes: Stroke[], skeletonId?: string) => {
    if (flexiBindEnabled) disableFlexiBind();
    else enableFlexiBind(strokes, skeletonId);
  }, [flexiBindEnabled, enableFlexiBind, disableFlexiBind]);

  // ── Playback: apply bone keyframe at frame ────────────────────────────────
  const applyBoneKeyframeAtFrame = useCallback((frameIndex: number) => {
    setSkeletons(prev => prev.map(skeleton => {
      const skKfs = boneKeyframes.filter(kf => kf.skeletonId === skeleton.id);
      if (skKfs.length === 0) return skeleton;

      // For each bone, evaluate each channel independently
      let updatedBones = skeleton.bones.map(bone => {
        const tData = getChannelAtFrame(bone.id, 'translate', frameIndex, skKfs, bone);
        const rData = getChannelAtFrame(bone.id, 'rotate',    frameIndex, skKfs, bone);
        const sData = getChannelAtFrame(bone.id, 'scale',     frameIndex, skKfs, bone);

        const headX  = tData?.headX   ?? bone.restHeadX;
        const headY  = tData?.headY   ?? bone.restHeadY;
        const angle  = rData?.angle   ?? bone.restAngle;
        const length = sData?.length  ?? bone.restLength;
        const tailX  = headX + Math.cos(angle) * length;
        const tailY  = headY + Math.sin(angle) * length;

        return { ...bone, headX, headY, tailX, tailY, angle, length };
      });

      // Propagate parent transforms in topological order
      const roots = updatedBones.filter(b => !b.parentBoneId);
      roots.forEach(root => { updatedBones = propagateToDescendants(root.id, updatedBones); });

      return { ...skeleton, bones: updatedBones };
    }));
  }, [boneKeyframes]);

  // ── Squash/stretch deformation ────────────────────────────────────────────
  const getDeformedStrokes = useCallback((strokes: Stroke[]): Stroke[] => {
    if (boundPoints.length === 0 || skeletons.length === 0) return strokes;

    const deformMap = new Map<string, Map<number, { dx: number; dy: number }>>();

    for (const bp of boundPoints) {
      const { strokeId, pointIndex, boneId, weight } = bp;
      const skeleton = skeletons.find(s => s.bones.some(b => b.id === boneId));
      if (!skeleton) continue;
      const bone = skeleton.bones.find(b => b.id === boneId);
      if (!bone) continue;

      const dAngle = bone.angle  - bone.restAngle;
      const dHeadX = bone.headX  - bone.restHeadX;
      const dHeadY = bone.headY  - bone.restHeadY;
      const axisScale = bone.restLength > 0 ? bone.length / bone.restLength : 1;
      const perpScale = axisScale > 0 ? 1 / Math.sqrt(Math.abs(axisScale)) : 1;
      const hasScale  = Math.abs(axisScale - 1) > 0.001;
      const hasXform  = Math.abs(dAngle) > 0.00001 || Math.abs(dHeadX) > 0.001 || Math.abs(dHeadY) > 0.001 || hasScale;
      if (!hasXform) continue;

      for (const stroke of strokes) {
        const isMatch = stroke.id === strokeId || stroke.parents?.includes(strokeId);
        if (!isMatch) continue;
        const pt = stroke.points[pointIndex];
        if (!pt) continue;

        // Offset from bone rest head
        const rOffX = pt.x - bone.restHeadX;
        const rOffY = pt.y - bone.restHeadY;

        // Project into bone local space (axis + perp)
        const cosR = Math.cos(bone.restAngle), sinR = Math.sin(bone.restAngle);
        const axisP =  rOffX * cosR + rOffY * sinR;
        const perpP = -rOffX * sinR + rOffY * cosR;

        // Squash/stretch
        const sAxis = axisP * axisScale;
        const sPerp = perpP * perpScale;

        // Back to world at rest angle
        const sOffX = sAxis * cosR - sPerp * sinR;
        const sOffY = sAxis * sinR + sPerp * cosR;

        // Rotate by delta angle
        const cosA = Math.cos(dAngle), sinA = Math.sin(dAngle);
        const rotX = sOffX * cosA - sOffY * sinA;
        const rotY = sOffX * sinA + sOffY * cosA;

        const newX = bone.headX + rotX;
        const newY = bone.headY + rotY;
        const dx = (newX - pt.x) * weight;
        const dy = (newY - pt.y) * weight;

        if (!deformMap.has(stroke.id)) deformMap.set(stroke.id, new Map());
        const m = deformMap.get(stroke.id)!;
        const ex = m.get(pointIndex);
        m.set(pointIndex, ex ? { dx: ex.dx + dx, dy: ex.dy + dy } : { dx, dy });
      }
    }

    if (deformMap.size === 0) return strokes;
    return strokes.map(stroke => {
      const sm = deformMap.get(stroke.id);
      if (!sm) return stroke;
      return {
        ...stroke,
        points: stroke.points.map((pt, idx) => {
          const d = sm.get(idx);
          if (!d) return pt;
          return {
            ...pt, x: pt.x + d.dx, y: pt.y + d.dy,
            cp1: pt.cp1 ? { x: pt.cp1.x + d.dx, y: pt.cp1.y + d.dy } : undefined,
            cp2: pt.cp2 ? { x: pt.cp2.x + d.dx, y: pt.cp2.y + d.dy } : undefined,
          };
        }),
      };
    });
  }, [boundPoints, skeletons]);

  return {
    skeletons, activeSkeletonId, setActiveSkeletonId,
    selectedBoneIds, activeBoneId,
    boundPoints, boundLayers, boneKeyframes,
    pendingParentBoneId, setPendingParentBoneId,
    rigMode, setRigMode,
    inheritMode, setInheritMode,
    flexiBindEnabled,
    keyAllChannels, setKeyAllChannels,
    getActiveSkeleton,
    createSkeleton, renameSkeleton, addBone, updateBoneTail,
    selectBone, selectBones, clearBoneSelection,
    setBoneParent,
    bindPoint, unbindPoint, unbindStroke,
    bindLayer, unbindLayer,
    recordBoneKeyframe, deleteBoneKeyframe,
    editMoveBone, editRotateBone, editScaleBone,
    animMoveBone, animRotateBone, animScaleBone,
    resetBonePose,
    deleteSelectedBones,
    renameBone, setBoneColor, setBoneStrength, setBoneFlexiRadius,
    getSkeletonForLayer,
    applyFlexiBind, enableFlexiBind, disableFlexiBind,
    applyBoneKeyframeAtFrame,
    getDeformedStrokes,
  };
};
