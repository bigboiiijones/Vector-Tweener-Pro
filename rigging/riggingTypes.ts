// Moho Pro 14 style rigging system types

export interface Bone {
  id: string;
  name: string;
  parentBoneId: string | null;
  // In canvas space
  headX: number;
  headY: number;
  tailX: number;
  tailY: number;
  // Transform state
  angle: number;       // radians, local
  length: number;
  restAngle: number;   // rest pose angle
  restHeadX: number;
  restHeadY: number;
  restTailX: number;
  restTailY: number;
  // Moho-style properties
  color: string;
  strength: number;   // 0-1 influence radius
  zOrder: number;
  isSelected: boolean;
}

export interface Skeleton {
  id: string;
  layerId: string; // which layer owns this skeleton
  name: string;
  bones: Bone[];
}

// Bind Points: vector control points bound to specific bones
export interface BoundPoint {
  strokeId: string;
  pointIndex: number;
  boneId: string;
  weight: number; // 0-1
}

// Bind Layer: entire layer transforms with bone
export interface BoundLayer {
  layerId: string;
  boneId: string;
  skeletonId: string;
}

// Bone keyframe for animation
export interface BoneKeyframe {
  id: string;
  frameIndex: number;
  skeletonId: string;
  boneTransforms: {
    [boneId: string]: {
      angle: number;
      headX: number;
      headY: number;
    };
  };
}

export type RigTool = 'BONE_CREATE' | 'BONE_SELECT' | 'BONE_PARENT' | 'BIND_POINTS' | 'BIND_LAYER';
