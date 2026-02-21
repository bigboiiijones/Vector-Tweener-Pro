// Rigging system types

export interface Bone {
  id: string;
  name: string;
  parentBoneId: string | null;
  // Live pose (world space)
  headX: number;
  headY: number;
  tailX: number;
  tailY: number;
  angle: number;   // world-space radians
  length: number;
  // Rest pose baseline
  restAngle: number;
  restHeadX: number;
  restHeadY: number;
  restTailX: number;
  restTailY: number;
  restLength: number;
  // Properties
  color: string;
  strength: number;
  flexiBindRadius: number;
  zOrder: number;
  isSelected: boolean;
}

export interface Skeleton {
  id: string;
  layerId: string;
  name: string;
  bones: Bone[];
}

export interface BoundPoint {
  strokeId: string;
  pointIndex: number;
  boneId: string;
  weight: number;
}

export interface BoundLayer {
  layerId: string;
  boneId: string;
  skeletonId: string;
}

// ── Per-channel keyframe system ───────────────────────────────────────────────
// Each channel (translate, rotate, scale) is keyed independently.
// A BoneKeyframe is ONE master record per skeleton per frame — it stores
// whichever channels were active when the key was set.
// Channels not stored in a keyframe are interpolated from surrounding keys
// for that specific channel.

export type BoneKeyChannel = 'translate' | 'rotate' | 'scale';

export interface BoneChannelData {
  // Translate
  headX?: number;
  headY?: number;
  // Rotate
  angle?: number;
  // Scale
  length?: number;
}

// One keyframe record = one bone's channel data at one frame
export interface BoneChannelKeyframe {
  id: string;
  frameIndex: number;
  skeletonId: string;
  boneId: string;
  channel: BoneKeyChannel;
  data: BoneChannelData;
}

// Legacy combined keyframe kept for backward compat (used when keyAllChannels=true)
// Internally we now store BoneChannelKeyframe[]; the combined type is assembled on read.
export interface BoneKeyframe {
  id: string;
  frameIndex: number;
  skeletonId: string;
  boneTransforms: {
    [boneId: string]: {
      angle: number;
      headX: number;
      headY: number;
      length: number;
      // Which channels were explicitly keyed at this frame
      keyedChannels?: BoneKeyChannel[];
    };
  };
}

export type RigMode = 'EDIT' | 'ANIMATE';
export type InheritMode = 'INHERIT' | 'IGNORE_PARENT';

export type RigTool =
  | 'BONE_CREATE'
  | 'BONE_SELECT'
  | 'BONE_MOVE'
  | 'BONE_ROTATE'
  | 'BONE_SCALE'
  | 'BONE_DELETE'
  | 'BONE_PARENT'
  | 'BIND_POINTS'
  | 'BIND_LAYER'
  | 'FLEXI_BIND';
