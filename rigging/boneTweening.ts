/**
 * boneTweening.ts
 * 
 * Handles interpolation of bone poses between keyframes.
 * Completely separate from stroke/path tweening - safe to run alongside it.
 */

import { BoneKeyframe, Skeleton, Bone } from './riggingTypes';
import { BoundPoint, BoundLayer } from './riggingTypes';
import { Stroke, Point, EasingType } from '../types';

function applyEasing(t: number, easing: EasingType = 'LINEAR'): number {
  switch (easing) {
    case 'EASE_IN': return t * t;
    case 'EASE_OUT': return 1 - (1 - t) * (1 - t);
    case 'EASE_IN_OUT': return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    default: return t;
  }
}

function lerpAngle(a: number, b: number, t: number): number {
  // Always interpolate through the shortest arc
  let diff = b - a;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return a + diff * t;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export interface BonePose {
  boneId: string;
  headX: number;
  headY: number;
  tailX: number;
  tailY: number;
  angle: number;
}

/**
 * Get interpolated bone poses for a skeleton at the given frame.
 * 
 * @param liveBones - Optional live bone state. When provided (animate mode during drag),
 *   the live bone positions are used as the "current frame" pose before any keyframe is
 *   recorded, giving real-time deformation feedback while dragging bones.
 */
export function getInterpolatedBonePoses(
  skeleton: Skeleton,
  frameIndex: number,
  boneKeyframes: BoneKeyframe[],
  liveBones?: Bone[]
): Map<string, BonePose> {
  const poses = new Map<string, BonePose>();

  const skeletonKeys = boneKeyframes
    .filter(kf => kf.skeletonId === skeleton.id)
    .sort((a, b) => a.frameIndex - b.frameIndex);

  // Helper: build pose from live bone state (used in animate mode for real-time deformation)
  const buildLivePose = (b: Bone): BonePose => {
    const live = liveBones?.find(lb => lb.id === b.id);
    if (live) {
      return { boneId: b.id, headX: live.headX, headY: live.headY, tailX: live.tailX, tailY: live.tailY, angle: live.angle };
    }
    return { boneId: b.id, headX: b.headX, headY: b.headY, tailX: b.tailX, tailY: b.tailY, angle: b.angle };
  };

  if (skeletonKeys.length === 0) {
    // No keyframes — use live bone positions if available (ANIMATE mode drag), else rest pose
    skeleton.bones.forEach(b => {
      if (liveBones) {
        poses.set(b.id, buildLivePose(b));
      } else {
        poses.set(b.id, {
          boneId: b.id,
          headX: b.restHeadX,
          headY: b.restHeadY,
          tailX: b.restTailX,
          tailY: b.restTailY,
          angle: b.restAngle,
        });
      }
    });
    return poses;
  }

  // Check if there's no keyframe at the exact current frame and we have live bones
  // In ANIMATE mode during drag, use the live pose for real-time feedback
  if (liveBones) {
    const exactHit = skeletonKeys.find(kf => kf.frameIndex === frameIndex);
    if (!exactHit) {
      // Between keyframes with live bones — use live positions for this frame
      skeleton.bones.forEach(b => {
        poses.set(b.id, buildLivePose(b));
      });
      return poses;
    }
  }

  // Find surrounding keyframes
  let prevKf = skeletonKeys[0];
  let nextKf = skeletonKeys[skeletonKeys.length - 1];

  for (const kf of skeletonKeys) {
    if (kf.frameIndex <= frameIndex) prevKf = kf;
    if (kf.frameIndex >= frameIndex) { nextKf = kf; break; }
  }

  // Exact hit
  if (prevKf.frameIndex === frameIndex) {
    skeleton.bones.forEach(b => {
      const transform = prevKf.boneTransforms[b.id];
      if (!transform) {
        poses.set(b.id, { boneId: b.id, headX: b.restHeadX, headY: b.restHeadY, tailX: b.restTailX, tailY: b.restTailY, angle: b.restAngle });
        return;
      }
      const len = b.length;
      const tailX = transform.headX + Math.cos(transform.angle) * len;
      const tailY = transform.headY + Math.sin(transform.angle) * len;
      poses.set(b.id, { boneId: b.id, headX: transform.headX, headY: transform.headY, tailX, tailY, angle: transform.angle });
    });
    return poses;
  }

  if (nextKf.frameIndex === frameIndex) {
    skeleton.bones.forEach(b => {
      const transform = nextKf.boneTransforms[b.id];
      if (!transform) {
        poses.set(b.id, { boneId: b.id, headX: b.restHeadX, headY: b.restHeadY, tailX: b.restTailX, tailY: b.restTailY, angle: b.restAngle });
        return;
      }
      const len = b.length;
      const tailX = transform.headX + Math.cos(transform.angle) * len;
      const tailY = transform.headY + Math.sin(transform.angle) * len;
      poses.set(b.id, { boneId: b.id, headX: transform.headX, headY: transform.headY, tailX, tailY, angle: transform.angle });
    });
    return poses;
  }

  // Interpolate between keyframes
  const span = nextKf.frameIndex - prevKf.frameIndex;
  if (span <= 0) {
    // Same frame, use prev
    skeleton.bones.forEach(b => {
      const transform = prevKf.boneTransforms[b.id];
      if (!transform) {
        poses.set(b.id, { boneId: b.id, headX: b.restHeadX, headY: b.restHeadY, tailX: b.restTailX, tailY: b.restTailY, angle: b.restAngle });
        return;
      }
      const len = b.length;
      const tailX = transform.headX + Math.cos(transform.angle) * len;
      const tailY = transform.headY + Math.sin(transform.angle) * len;
      poses.set(b.id, { boneId: b.id, headX: transform.headX, headY: transform.headY, tailX, tailY, angle: transform.angle });
    });
    return poses;
  }

  const rawT = (frameIndex - prevKf.frameIndex) / span;
  const t = applyEasing(rawT, 'EASE_IN_OUT'); // smooth bone animation by default

  skeleton.bones.forEach(b => {
    const pTransform = prevKf.boneTransforms[b.id];
    const nTransform = nextKf.boneTransforms[b.id];

    const prevH = pTransform ?? { headX: b.restHeadX, headY: b.restHeadY, angle: b.restAngle };
    const nextH = nTransform ?? { headX: b.restHeadX, headY: b.restHeadY, angle: b.restAngle };

    const angle = lerpAngle(prevH.angle, nextH.angle, t);
    const headX = lerp(prevH.headX, nextH.headX, t);
    const headY = lerp(prevH.headY, nextH.headY, t);
    const len = b.length;
    const tailX = headX + Math.cos(angle) * len;
    const tailY = headY + Math.sin(angle) * len;

    poses.set(b.id, { boneId: b.id, headX, headY, tailX, tailY, angle });
  });

  return poses;
}

/**
 * Apply bone poses to deform strokes based on bound points.
 * Returns new stroke array with deformed points.
 * Does NOT mutate input strokes — returns new instances only where changed.
 */
export function applyBonePosesToStrokes(
  strokes: Stroke[],
  boundPoints: BoundPoint[],
  bonePoses: Map<string, BonePose>,
  skeleton: Skeleton
): Stroke[] {
  if (boundPoints.length === 0 || bonePoses.size === 0) return strokes;

  // Group bound points by stroke
  const byStroke = new Map<string, { pointIndex: number; boneId: string; weight: number }[]>();
  for (const bp of boundPoints) {
    const list = byStroke.get(bp.strokeId) ?? [];
    list.push({ pointIndex: bp.pointIndex, boneId: bp.boneId, weight: bp.weight });
    byStroke.set(bp.strokeId, list);
  }

  return strokes.map(stroke => {
    const bindings = byStroke.get(stroke.id);
    if (!bindings || bindings.length === 0) return stroke;

    const newPoints = stroke.points.map((pt, idx) => {
      const binding = bindings.find(b => b.pointIndex === idx);
      if (!binding) return pt;

      const pose = bonePoses.get(binding.boneId);
      if (!pose) return pt;

      const bone = skeleton.bones.find(b => b.id === binding.boneId);
      if (!bone) return pt;

      // Delta from rest pose
      const deltaAngle = pose.angle - bone.restAngle;
      const dHeadX = pose.headX - bone.restHeadX;
      const dHeadY = pose.headY - bone.restHeadY;

      // Rotate point around the rest head position
      const cos = Math.cos(deltaAngle);
      const sin = Math.sin(deltaAngle);
      const rx = pt.x - bone.restHeadX;
      const ry = pt.y - bone.restHeadY;
      const rotX = bone.restHeadX + rx * cos - ry * sin;
      const rotY = bone.restHeadY + rx * sin + ry * cos;

      // Add head translation
      const finalX = rotX + dHeadX;
      const finalY = rotY + dHeadY;

      // Apply weight
      const w = binding.weight;
      const newPt: Point = {
        ...pt,
        x: pt.x + (finalX - pt.x) * w,
        y: pt.y + (finalY - pt.y) * w,
      };

      // Also deform control points if present
      if (pt.cp1) {
        const rx1 = pt.cp1.x - bone.restHeadX;
        const ry1 = pt.cp1.y - bone.restHeadY;
        const rotX1 = bone.restHeadX + rx1 * cos - ry1 * sin;
        const rotY1 = bone.restHeadY + rx1 * sin + ry1 * cos;
        newPt.cp1 = {
          x: pt.cp1.x + (rotX1 + dHeadX - pt.cp1.x) * w,
          y: pt.cp1.y + (rotY1 + dHeadY - pt.cp1.y) * w,
        };
      }
      if (pt.cp2) {
        const rx2 = pt.cp2.x - bone.restHeadX;
        const ry2 = pt.cp2.y - bone.restHeadY;
        const rotX2 = bone.restHeadX + rx2 * cos - ry2 * sin;
        const rotY2 = bone.restHeadY + rx2 * sin + ry2 * cos;
        newPt.cp2 = {
          x: pt.cp2.x + (rotX2 + dHeadX - pt.cp2.x) * w,
          y: pt.cp2.y + (rotY2 + dHeadY - pt.cp2.y) * w,
        };
      }

      return newPt;
    });

    return { ...stroke, points: newPoints };
  });
}

/**
 * Apply bone poses to transform entire bound layers.
 * Returns a translation/rotation transform per layerId.
 */
export interface LayerTransform {
  layerId: string;
  dx: number;
  dy: number;
  angle: number; // rotation in radians
  pivotX: number;
  pivotY: number;
}

export function getBoundLayerTransforms(
  boundLayers: BoundLayer[],
  bonePoses: Map<string, BonePose>,
  skeleton: Skeleton
): Map<string, LayerTransform> {
  const result = new Map<string, LayerTransform>();

  for (const bl of boundLayers) {
    const pose = bonePoses.get(bl.boneId);
    const bone = skeleton.bones.find(b => b.id === bl.boneId);
    if (!pose || !bone) continue;

    const deltaAngle = pose.angle - bone.restAngle;
    const dx = pose.headX - bone.restHeadX;
    const dy = pose.headY - bone.restHeadY;

    result.set(bl.layerId, {
      layerId: bl.layerId,
      dx,
      dy,
      angle: deltaAngle,
      pivotX: bone.restHeadX,
      pivotY: bone.restHeadY,
    });
  }

  return result;
}
