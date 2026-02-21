// Rigging math utilities

export function angleBetween(x1: number, y1: number, x2: number, y2: number): number {
  return Math.atan2(y2 - y1, x2 - x1);
}

export function distance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

export function rotatePoint(
  px: number,
  py: number,
  cx: number,
  cy: number,
  angle: number
): { x: number; y: number } {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = px - cx;
  const dy = py - cy;
  return {
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos,
  };
}

/**
 * Get world position of a bone's head given its parent chain.
 */
export function getBoneWorldHead(boneId: string, bones: import('./riggingTypes').Bone[]): { x: number; y: number } {
  const bone = bones.find(b => b.id === boneId);
  if (!bone) return { x: 0, y: 0 };
  return { x: bone.headX, y: bone.headY };
}

export function getBoneWorldTail(boneId: string, bones: import('./riggingTypes').Bone[]): { x: number; y: number } {
  const bone = bones.find(b => b.id === boneId);
  if (!bone) return { x: 0, y: 0 };
  return { x: bone.tailX, y: bone.tailY };
}

/**
 * Compute influenced position for a point given bound bones.
 */
export function computeInfluencedPosition(
  px: number,
  py: number,
  bones: import('./riggingTypes').Bone[],
  boneId: string,
  weight: number
): { x: number; y: number } {
  const bone = bones.find(b => b.id === boneId);
  if (!bone) return { x: px, y: py };

  const deltaAngle = bone.angle - bone.restAngle;
  const dHeadX = bone.headX - bone.restHeadX;
  const dHeadY = bone.headY - bone.restHeadY;

  // Rotate around the bone head
  const rotated = rotatePoint(px, py, bone.restHeadX, bone.restHeadY, deltaAngle);
  // Then translate by head movement
  const final = {
    x: rotated.x + dHeadX,
    y: rotated.y + dHeadY,
  };

  return {
    x: px + (final.x - px) * weight,
    y: py + (final.y - py) * weight,
  };
}

export function pointToSegmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return distance(px, py, ax, ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return distance(px, py, ax + t * dx, ay + t * dy);
}
