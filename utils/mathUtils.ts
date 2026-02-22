
import { Point, Stroke, EasingType } from '../types';

// --- Basic Math Helpers ---

export const distance = (p1: Point, p2: Point): number => {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
};

export const getPathLength = (points: Point[]): number => {
  let len = 0;
  for (let i = 0; i < points.length - 1; i++) {
    len += distance(points[i], points[i + 1]);
  }
  return len;
};

export const isClosedPath = (pts: Point[]): boolean => {
  if (pts.length < 3) return false;
  const endD = distance(pts[0], pts[pts.length - 1]);
  if (endD < 10) return true; 
  const len = getPathLength(pts);
  return len > 0 && (endD / len) < 0.05; 
};

export const toPathString = (points: Point[], isClosed?: boolean) => {
    if (!points || points.length === 0) return '';
    
    let d = `M ${points[0].x} ${points[0].y}`;
    
    for (let i = 1; i < points.length; i++) {
        const p0 = points[i-1];
        const p1 = points[i];

        if (p0.cp2 && p1.cp1) {
            d += ` C ${p0.cp2.x} ${p0.cp2.y}, ${p1.cp1.x} ${p1.cp1.y}, ${p1.x} ${p1.y}`;
        } else {
            d += ` L ${p1.x} ${p1.y}`;
        }
    }

    // BUGFIX: Use explicit isClosed flag when provided; otherwise fall back to the
    // distance heuristic.  Merged/closed strokes set isClosed=true but the last point
    // may not sit within 2px of the first after the duplicate-removal slice, causing
    // an invisible open gap between the seam points.
    const shouldClose = isClosed !== undefined
        ? isClosed
        : (points.length > 2 && distance(points[0], points[points.length-1]) < 2);

    if (shouldClose) {
        // CRITICAL: SVG "Z" draws a STRAIGHT line back to the start — it does NOT
        // respect bezier control points. For smooth closed bezier paths, we must
        // explicitly render the closing segment as a "C" command using the last
        // point's cp2 and the first point's cp1, THEN add Z for fill purposes.
        const last = points[points.length - 1];
        const first = points[0];
        if (last.cp2 && first.cp1) {
            d += ` C ${last.cp2.x} ${last.cp2.y}, ${first.cp1.x} ${first.cp1.y}, ${first.x} ${first.y}`;
        }
        d += ' Z';
        return d;
    }

    return d;
};

// --- Bezier Math ---

// Convert a Quadratic Curve (Start, Control, End) into a Cubic Bezier Stroke (Start w/ cp2, End w/ cp1)
export const createSmoothCubicStroke = (p0: Point, control: Point, p2: Point): Point[] => {
    const cp1x = p0.x + (2/3) * (control.x - p0.x);
    const cp1y = p0.y + (2/3) * (control.y - p0.y);
    
    const cp2x = p2.x + (2/3) * (control.x - p2.x);
    const cp2y = p2.y + (2/3) * (control.y - p2.y);

    const startPoint: Point = {
        x: p0.x, 
        y: p0.y,
        cp2: { x: cp1x, y: cp1y } // Outgoing handle
    };

    const endPoint: Point = {
        x: p2.x,
        y: p2.y,
        cp1: { x: cp2x, y: cp2y } // Incoming handle
    };

    return [startPoint, endPoint];
};

// New: Create a curve with 3 vectors (Start, Mid, End)
export const createThreePointCubicStroke = (p0: Point, control: Point, p2: Point): Point[] => {
    // 1. Get the Cubic Handles for the full arc
    const cp1x = p0.x + (2/3) * (control.x - p0.x);
    const cp1y = p0.y + (2/3) * (control.y - p0.y);
    const cp2x = p2.x + (2/3) * (control.x - p2.x);
    const cp2y = p2.y + (2/3) * (control.y - p2.y);

    const fullCp1 = { x: cp1x, y: cp1y };
    const fullCp2 = { x: cp2x, y: cp2y };

    // 2. Split this Cubic Bezier at t=0.5 to get the mid point and new handles
    const [start, mid, end] = splitCubicBezier(p0, fullCp1, fullCp2, p2, 0.5);

    return [start, mid, end];
};

// Split a cubic bezier at t=0.5
const splitCubicBezier = (p0: Point, cp1: Point, cp2: Point, p3: Point, t: number = 0.5): [Point, Point, Point] => {
    const x0 = p0.x, y0 = p0.y;
    const x1 = cp1.x, y1 = cp1.y;
    const x2 = cp2.x, y2 = cp2.y;
    const x3 = p3.x, y3 = p3.y;

    const x01 = (1 - t) * x0 + t * x1;
    const y01 = (1 - t) * y0 + t * y1;
    const x12 = (1 - t) * x1 + t * x2;
    const y12 = (1 - t) * y1 + t * y2;
    const x23 = (1 - t) * x2 + t * x3;
    const y23 = (1 - t) * y2 + t * y3;

    const x012 = (1 - t) * x01 + t * x12;
    const y012 = (1 - t) * y01 + t * y12;
    const x123 = (1 - t) * x12 + t * x23;
    const y123 = (1 - t) * y12 + t * y23;

    const x0123 = (1 - t) * x012 + t * x123;
    const y0123 = (1 - t) * y012 + t * y123;

    const mid: Point = { x: x0123, y: y0123 };
    const seg1_cp1 = { x: x01, y: y01 };
    const seg1_cp2 = { x: x012, y: y012 };
    const seg2_cp1 = { x: x123, y: y123 };
    const seg2_cp2 = { x: x23, y: y23 };

    const startPt = { ...p0, cp2: seg1_cp1 };
    const midPt = { ...mid, cp1: seg1_cp2, cp2: seg2_cp1 };
    const endPt = { ...p3, cp1: seg2_cp2 };

    return [startPt, midPt, endPt];
};

export const upsampleStrokeTopology = (points: Point[], targetCount: number): Point[] => {
    if (points.length >= targetCount) return points;
    let currentPoints = [...points];

    while (currentPoints.length < targetCount) {
        let maxLen = -1;
        let splitIndex = -1;

        for (let i = 0; i < currentPoints.length - 1; i++) {
            const d = distance(currentPoints[i], currentPoints[i+1]);
            if (d > maxLen) {
                maxLen = d;
                splitIndex = i;
            }
        }

        if (splitIndex === -1) break;

        const p0 = currentPoints[splitIndex];
        const p1 = currentPoints[splitIndex + 1];

        if (p0.cp2 && p1.cp1) {
            const [newStart, newMid, newEnd] = splitCubicBezier(p0, p0.cp2, p1.cp1, p1, 0.5);
            newStart.cp1 = p0.cp1;
            newEnd.cp2 = p1.cp2;
            currentPoints.splice(splitIndex, 2, newStart, newMid, newEnd);
        } else {
            const mid = {
                x: (p0.x + p1.x) / 2,
                y: (p0.y + p1.y) / 2
            };
            currentPoints.splice(splitIndex + 1, 0, mid);
        }
    }
    return currentPoints;
};

// --- Sampling ---

const sampleCubicBezier = (p0: Point, cp1: Point, cp2: Point, p3: Point, t: number): Point => {
    const invT = 1 - t;
    const invT2 = invT * invT;
    const invT3 = invT2 * invT;
    const t2 = t * t;
    const t3 = t2 * t;

    return {
        x: invT3 * p0.x + 3 * invT2 * t * cp1.x + 3 * invT * t2 * cp2.x + t3 * p3.x,
        y: invT3 * p0.y + 3 * invT2 * t * cp1.y + 3 * invT * t2 * cp2.y + t3 * p3.y
    };
};

export const sampleStroke = (stroke: Stroke, samplesPerSegment: number = 10): Point[] => {
    const result: Point[] = [];
    if (stroke.points.length === 0) return result;
    result.push(stroke.points[0]);

    for (let i = 1; i < stroke.points.length; i++) {
        const p0 = stroke.points[i-1];
        const p1 = stroke.points[i];

        if (p0.cp2 && p1.cp1) {
            for (let j = 1; j <= samplesPerSegment; j++) {
                const t = j / samplesPerSegment;
                result.push(sampleCubicBezier(p0, p0.cp2, p1.cp1, p1, t));
            }
        } else {
            for (let j = 1; j <= samplesPerSegment; j++) {
                const t = j / samplesPerSegment;
                result.push({
                    x: p0.x + (p1.x - p0.x) * t,
                    y: p0.y + (p1.y - p0.y) * t
                });
            }
        }
    }
    return result;
};


// --- Simplification ---

const perpendicularDistance = (point: Point, lineStart: Point, lineEnd: Point) => {
    let dx = lineEnd.x - lineStart.x;
    let dy = lineEnd.y - lineStart.y;
    if (dx === 0 && dy === 0) {
        return distance(point, lineStart);
    }
    const mag = Math.sqrt(dx * dx + dy * dy);
    return Math.abs(dy * point.x - dx * point.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x) / mag;
};

export const simplifyPath = (points: Point[], epsilon: number): Point[] => {
    if (points.length < 3) return points;

    let dmax = 0;
    let index = 0;
    const end = points.length - 1;

    for (let i = 1; i < end; i++) {
        const d = perpendicularDistance(points[i], points[0], points[end]);
        if (d > dmax) {
            index = i;
            dmax = d;
        }
    }

    if (dmax > epsilon) {
        const recResults1 = simplifyPath(points.slice(0, index + 1), epsilon);
        const recResults2 = simplifyPath(points.slice(index), epsilon);
        return [...recResults1.slice(0, recResults1.length - 1), ...recResults2];
    } else {
        return [points[0], points[end]];
    }
};

export const smoothPolyline = (points: Point[], factor: number = 0.35): Point[] => {
    if (points.length < 2) return points; 
    const result: Point[] = [];
    
    for (let i = 0; i < points.length; i++) {
        const p = points[i];

        // Start Point: Project CP2 towards P1
        if (i === 0) {
            const next = points[i + 1];
            const d = distance(p, next);
            if (d > 0) {
                 const dx = next.x - p.x;
                 const dy = next.y - p.y;
                 const cp2 = {
                     x: p.x + (dx / d) * d * factor,
                     y: p.y + (dy / d) * d * factor
                 };
                 result.push({ ...p, cp2 });
            } else {
                 result.push({ ...p });
            }
            continue;
        }

        // End Point: Project CP1 back towards P(n-1)
        if (i === points.length - 1) {
             const prev = points[i - 1];
             const d = distance(p, prev);
             if (d > 0) {
                 const dx = p.x - prev.x;
                 const dy = p.y - prev.y;
                 const cp1 = {
                     x: p.x - (dx / d) * d * factor,
                     y: p.y - (dy / d) * d * factor
                 };
                 result.push({ ...p, cp1 });
             } else {
                 result.push({ ...p });
             }
             continue;
        }

        // Middle Points
        const prev = points[i - 1];
        const next = points[i + 1];
        const dx = next.x - prev.x;
        const dy = next.y - prev.y;
        
        const distPrev = distance(p, prev);
        const distNext = distance(p, next);
        
        const len = Math.sqrt(dx*dx + dy*dy);
        if (len === 0) {
             result.push({ ...p });
             continue;
        }
        
        const nx = dx / len;
        const ny = dy / len;
        const cpLen1 = distPrev * factor;
        const cpLen2 = distNext * factor;

        const cp1 = { x: p.x - nx * cpLen1, y: p.y - ny * cpLen1 };
        const cp2 = { x: p.x + nx * cpLen2, y: p.y + ny * cpLen2 };
        
        result.push({ ...p, cp1: cp1, cp2: cp2 });
    }
    return result;
};


// --- Transformation ---

export const rotatePoint = (p: Point, center: Point, angleRad: number): Point => {
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    const dx = p.x - center.x;
    const dy = p.y - center.y;
    return {
        x: center.x + (dx * cos - dy * sin),
        y: center.y + (dx * sin + dy * cos)
    };
};

export const scalePoint = (p: Point, center: Point, scale: number): Point => {
    return {
        x: center.x + (p.x - center.x) * scale,
        y: center.y + (p.y - center.y) * scale
    };
};

// --- Sampling Utils ---

export const getPointAtLength = (points: Point[], targetLen: number): Point => {
  if (targetLen <= 0) return points[0];
  let currentLen = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const d = distance(points[i], points[i + 1]);
    if (currentLen + d >= targetLen) {
      const remaining = targetLen - currentLen;
      const t = remaining / d;
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * t,
        y: points[i].y + (points[i + 1].y - points[i].y) * t,
      };
    }
    currentLen += d;
  }
  return points[points.length - 1];
};

export const resamplePath = (points: Point[], numPoints: number): Point[] => {
  if (points.length === 0) return [];
  if (points.length === 1) return Array(numPoints).fill(points[0]);
  
  const totalLength = getPathLength(points);
  const step = totalLength / (numPoints - 1);
  
  const newPoints: Point[] = [points[0]];
  let currentDist = 0;
  let nextTarget = step;
  let index = 0;

  while (newPoints.length < numPoints) {
    if (index >= points.length - 1) {
      while (newPoints.length < numPoints) newPoints.push(points[points.length - 1]);
      break;
    }

    const p1 = points[index];
    const p2 = points[index + 1];
    const d = distance(p1, p2);

    if (currentDist + d >= nextTarget) {
      const t = (nextTarget - currentDist) / d;
      const nx = p1.x + (p2.x - p1.x) * t;
      const ny = p1.y + (p2.y - p1.y) * t;
      newPoints.push({ x: nx, y: ny });
      nextTarget += step;
    } else {
      currentDist += d;
      index++;
    }
  }

  return newPoints;
};

// ... (Existing slicePathByRatios, splitPathByRatios, getPointsCentroid, getCentroid, getPathDistanceCost, matchPathDirection) ...
// Keeping those for compatibility but updated calculateTweens will favour upsampleStrokeTopology
// We include them here to ensure file completeness in the XML

const slicePathByRatios = (points: Point[], ratios: number[], enforceMinSeg: boolean = false): Point[][] => {
    const result: Point[][] = [];
    const totalPoints = points.length;
    let currentIdx = 0;
    const totalRatio = ratios.reduce((a, b) => a + b, 0);
    const MIN_SEG_POINTS = 5; 
    
    ratios.forEach((ratio, i) => {
        if (i === ratios.length - 1) {
            const segment = points.slice(currentIdx);
            if (segment.length > 0) result.push(segment);
            else if (result.length > 0 && result[result.length-1].length > 0) {
                 result.push([result[result.length-1][result[result.length-1].length-1]]);
            } else {
                 result.push([points[points.length-1]]);
            }
        } else {
            let count = Math.floor((ratio / totalRatio) * totalPoints);
            if (enforceMinSeg) count = Math.max(MIN_SEG_POINTS, count);
            const endIndex = Math.min(currentIdx + count, totalPoints - 1);
            const segment = points.slice(currentIdx, endIndex + 1);
            result.push(segment);
            currentIdx = endIndex;
        }
    });
    return result;
};

export const splitPathByRatios = (points: Point[], ratios: number[]): Point[][] => {
    const highRes = resamplePath(points, 200);
    return slicePathByRatios(highRes, ratios);
};

export const getPointsCentroid = (points: Point[]): Point => {
  let sx = 0, sy = 0;
  const len = points.length;
  if (len === 0) return { x: 0, y: 0 };
  for (let i = 0; i < len; i++) {
    sx += points[i].x;
    sy += points[i].y;
  }
  return { x: sx / len, y: sy / len };
};

export const getCentroid = (stroke: Stroke): Point => {
    return getPointsCentroid(stroke.points);
};

export const getPathDistanceCost = (pathA: Point[], pathB: Point[]): number => {
  let cost = 0;
  const len = Math.min(pathA.length, pathB.length);
  for(let i=0; i<len; i++) {
     cost += distance(pathA[i], pathB[i]);
  }
  if (pathA.length > 0 && pathB.length > 0) {
      cost += distance(pathA[0], pathB[0]) * 5;
      cost += distance(pathA[pathA.length-1], pathB[pathB.length-1]) * 5;
  }
  return cost;
}

export const matchPathDirection = (pathA: Point[], pathB: Point[]): Point[] => {
    if (pathA.length === 0 || pathB.length === 0) return pathB;
    const startStart = distance(pathA[0], pathB[0]);
    const endEnd = distance(pathA[pathA.length - 1], pathB[pathB.length - 1]);
    const costNormal = startStart + endEnd;
    const startEnd = distance(pathA[0], pathB[pathB.length - 1]);
    const endStart = distance(pathA[pathA.length - 1], pathB[0]);
    const costReverse = startEnd + endStart;
    if (costReverse < costNormal) {
        return [...pathB].reverse();
    }
    return pathB;
}

export const getPointOnPath = (path: Point[], t: number): Point => {
    if (path.length === 0) return {x:0, y:0};
    if (path.length === 1) return path[0];
    const totalLen = getPathLength(path);
    const targetLen = totalLen * t;
    return getPointAtLength(path, targetLen);
};

export const applyEasing = (t: number, type?: EasingType): number => {
  switch (type) {
    case 'EASE_IN': return t * t; 
    case 'EASE_OUT': return t * (2 - t);
    case 'EASE_IN_OUT': return t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    default: return t;
  }
};

export const interpolatePaths = (pathA: Point[], pathB: Point[], t: number, guidePath?: Point[]): Point[] => {
  const result: Point[] = [];
  const len = Math.min(pathA.length, pathB.length);
  
  let offset = { x: 0, y: 0 };
  if (guidePath && guidePath.length > 1) {
      const startC = getPointsCentroid(pathA);
      const endC = getPointsCentroid(pathB);
      const linearC = {
          x: startC.x + (endC.x - startC.x) * t,
          y: startC.y + (endC.y - startC.y) * t
      };
      const pathC = getPointOnPath(guidePath, t);
      offset = {
          x: pathC.x - linearC.x,
          y: pathC.y - linearC.y
      };
  }

  for (let i = 0; i < len; i++) {
    const pA = pathA[i];
    const pB = pathB[i];

    const x = pA.x + (pB.x - pA.x) * t + offset.x;
    const y = pA.y + (pB.y - pA.y) * t + offset.y;
    
    let cp1: Point | undefined = undefined;
    let cp2: Point | undefined = undefined;

    if (pA.cp1 && pB.cp1) {
        cp1 = {
            x: pA.cp1.x + (pB.cp1.x - pA.cp1.x) * t + offset.x,
            y: pA.cp1.y + (pB.cp1.y - pA.cp1.y) * t + offset.y
        };
    }

    if (pA.cp2 && pB.cp2) {
        cp2 = {
            x: pA.cp2.x + (pB.cp2.x - pA.cp2.x) * t + offset.x,
            y: pA.cp2.y + (pB.cp2.y - pA.cp2.y) * t + offset.y
        };
    }

    result.push({ x, y, cp1, cp2 });
  }
  return result;
};

function permute<T>(permutation: T[]): T[][] {
  const length = permutation.length;
  const result = [permutation.slice()];
  const c = new Array(length).fill(0);
  let i = 1, k, p;
  while (i < length) {
    if (c[i] < i) {
      k = i % 2 && c[i];
      p = permutation[i];
      permutation[i] = permutation[k];
      permutation[k] = p;
      ++c[i];
      i = 1;
      result.push(permutation.slice());
    } else {
      c[i] = 0;
      ++i;
    }
  }
  return result;
}

const rotateArray = <T>(arr: T[], shift: number): T[] => {
    if (arr.length === 0) return arr;
    const s = ((shift % arr.length) + arr.length) % arr.length;
    return [...arr.slice(s), ...arr.slice(0, s)];
};

export const mergeStrokes = (strokes: Stroke[]): Point[] => {
  if (strokes.length === 0) return [];
  if (strokes.length === 1) return strokes[0].points;
  let result = [...strokes[0].points];
  const remaining = strokes.slice(1);
  while (remaining.length > 0) {
    const currentEnd = result[result.length - 1];
    let bestIdx = -1;
    let minD = Infinity;
    let shouldReverse = false;
    for (let i = 0; i < remaining.length; i++) {
      const s = remaining[i];
      const head = s.points[0];
      const tail = s.points[s.points.length - 1];
      const dHead = distance(currentEnd, head);
      const dTail = distance(currentEnd, tail);
      if (dHead < minD) { minD = dHead; bestIdx = i; shouldReverse = false; }
      if (dTail < minD) { minD = dTail; bestIdx = i; shouldReverse = true; }
    }
    if (bestIdx !== -1) {
      const nextStroke = remaining.splice(bestIdx, 1)[0];
      const pointsToAdd = shouldReverse ? [...nextStroke.points].reverse() : nextStroke.points;
      result = result.concat(pointsToAdd);
    } else { break; }
  }
  return result;
};

export const alignPhase = (targetRefPath: Point[], loopPath: Point[]): Point[] => {
  if (loopPath.length < 3 || targetRefPath.length < 2) return loopPath;
  let clean = [...loopPath];
  if (distance(clean[0], clean[clean.length - 1]) < 5) clean.pop();
  if (clean.length < 3) return resamplePath(loopPath, targetRefPath.length);
  const target = resamplePath(targetRefPath, targetRefPath.length);
  let bestShift = 0;
  let bestCost = Infinity;
  for (let shift = 0; shift < clean.length; shift++) {
      const rotated = [...clean.slice(shift), ...clean.slice(0, shift)];
      rotated.push(rotated[0]); 
      const candidate = resamplePath(rotated, target.length);
      const cost = getPathDistanceCost(target, candidate);
      if (cost < bestCost) { bestCost = cost; bestShift = shift; }
  }
  const rotatedBest = [...clean.slice(bestShift), ...clean.slice(0, bestShift)];
  rotatedBest.push(rotatedBest[0]);
  return resamplePath(rotatedBest, targetRefPath.length);
};

export const solveTopologySplit = (singleStroke: Stroke, manyStrokes: Stroke[], isSplitting: boolean): { start: Point[], end: Point[], mappedStrokeId: string }[] => {
    const childSpecs = manyStrokes.map((s, i) => ({
        centroid: getPointsCentroid(s.points),
        length: getPathLength(s.points),
        stroke: s,
        originalIndex: i,
        isClosed: isClosedPath(s.points)
    }));
    const totalChildLen = childSpecs.reduce((sum, c) => sum + c.length, 0);
    if (totalChildLen === 0) return [];
    const parentRes = 300; 
    let parentPoints = resamplePath(singleStroke.points, parentRes);
    const isParentClosed = isClosedPath(parentPoints);
    if (isParentClosed && distance(parentPoints[0], parentPoints[parentPoints.length-1]) < 5) parentPoints.pop();
    const anyChildClosed = childSpecs.some(c => c.isClosed);
    const useRobustMode = isParentClosed || anyChildClosed;
    const permutations = permute(childSpecs.map((s, i) => ({ s, i }))); 
    let bestResult: { start: Point[], end: Point[], mappedStrokeId: string }[] = [];
    let minGlobalCost = Infinity;

    for (const p of permutations) {
         const orderedChildren = p.map(item => item.s);
         const currentRatios = orderedChildren.map(c => c.length / totalChildLen);
         const directions = isParentClosed ? [1, -1] : [1, -1]; 
         const offsetStep = useRobustMode ? (isParentClosed ? 5 : 1) : parentPoints.length + 1;
         for (const dir of directions) {
             const basePoints = dir === 1 ? parentPoints : [...parentPoints].reverse();
             for (let offset = 0; offset < basePoints.length; offset += offsetStep) {
                 let currentParent = basePoints;
                 if (offset > 0) currentParent = rotateArray(basePoints, offset);
                 const sliceableParent = isParentClosed ? [...currentParent, currentParent[0]] : currentParent;
                 const segments = slicePathByRatios(sliceableParent, currentRatios, useRobustMode);
                 if (segments.length !== orderedChildren.length) continue;
                 let currentCost = 0;
                 for (let k = 0; k < orderedChildren.length; k++) {
                     const segCentroid = getPointsCentroid(segments[k]);
                     const childCentroid = orderedChildren[k].centroid;
                     currentCost += distance(segCentroid, childCentroid);
                 }
                 if (currentCost < minGlobalCost) {
                     minGlobalCost = currentCost;
                     const mapping: { start: Point[], end: Point[], mappedStrokeId: string }[] = [];
                     for (let k = 0; k < orderedChildren.length; k++) {
                         const segment = segments[k];
                         const child = orderedChildren[k];
                         let bestChildPoints: Point[] = [];
                         if (child.isClosed) {
                             const normalAligned = alignPhase(segment, child.stroke.points);
                             const reverseAligned = alignPhase(segment, [...child.stroke.points].reverse());
                             bestChildPoints = getPathDistanceCost(segment, normalAligned) < getPathDistanceCost(segment, reverseAligned) ? normalAligned : reverseAligned;
                         } else {
                             const rawTarget = resamplePath(child.stroke.points, segment.length);
                             bestChildPoints = matchPathDirection(segment, rawTarget);
                         }
                         if (isSplitting) mapping.push({ start: segment, end: bestChildPoints, mappedStrokeId: child.stroke.id });
                         else mapping.push({ start: bestChildPoints, end: segment, mappedStrokeId: child.stroke.id });
                     }
                     bestResult = mapping;
                 }
             }
         }
    }
    return bestResult;
};

// Shape generators (getRectPoints etc) omitted from this XML block to assume unchanged, or if needed can be included.
// Including common ones to be safe:
export const getRectPoints = (start: Point, end: Point): Point[] => {
    const p0 = start; const p1 = { x: end.x, y: start.y }; const p2 = end; const p3 = { x: start.x, y: end.y };
    return [p0, p1, p2, p3, { x: p0.x, y: p0.y }];
};
export const getCirclePoints = (center: Point, edge: Point): Point[] => {
    const r = distance(center, edge); const points: Point[] = []; const steps = 60;
    for(let i=0; i<steps; i++) { const theta = (i/steps)*Math.PI*2; points.push({x: center.x + Math.cos(theta)*r, y: center.y + Math.sin(theta)*r}); }
    points.push({x: points[0].x, y: points[0].y}); return points;
};
export const getTrianglePoints = (start: Point, end: Point): Point[] => {
    const width = end.x - start.x; const height = end.y - start.y;
    return [{x: start.x+width/2, y: start.y}, {x: end.x, y: end.y}, {x: start.x, y: end.y}, {x: start.x+width/2, y: start.y}];
};
export const getStarPoints = (center: Point, edge: Point, points=5): Point[] => {
    const outer = distance(center, edge); const inner = outer*0.4; const res: Point[]=[]; const step = Math.PI/points; const rot = -Math.PI/2;
    for(let i=0; i<points*2; i++) { const r = i%2===0?outer:inner; const a = i*step+rot; res.push({x: center.x+Math.cos(a)*r, y: center.y+Math.sin(a)*r}); }
    res.push({x: res[0].x, y: res[0].y}); return res;
};
export const getQuadraticBezierPoints = (p0: Point, p1: Point, p2: Point, steps = 30): Point[] => {
    const pts: Point[] = [];
    const cp1 = { x: p0.x + (2/3)*(p1.x - p0.x), y: p0.y + (2/3)*(p1.y - p0.y) };
    const cp2 = { x: p2.x + (2/3)*(p1.x - p2.x), y: p2.y + (2/3)*(p1.y - p2.y) };
    for(let i=0; i<=steps; i++) {
        const t = i / steps; const invT = 1 - t;
        pts.push({ x: invT * invT * p0.x + 2 * invT * t * p1.x + t * t * p2.x, y: invT * invT * p0.y + 2 * invT * t * p1.y + t * t * p2.y });
    }
    return pts;
};
export const convertQuadToCubicPoints = (p0: Point, p1: Point, p2: Point): Point[] => {
    const cp1 = { x: p0.x + (2/3)*(p1.x - p0.x), y: p0.y + (2/3)*(p1.y - p0.y) };
    const cp2 = { x: p2.x + (2/3)*(p1.x - p2.x), y: p2.y + (2/3)*(p1.y - p2.y) };
    return [{ ...p0, cp2: cp1 }, { ...p2, cp1: cp2 }];
};
