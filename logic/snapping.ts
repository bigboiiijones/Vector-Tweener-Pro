
import { Point, Stroke } from '../types';
import { distance, sampleStroke } from '../utils/mathUtils';

const SNAP_THRESHOLD = 15;

const closestPointOnSegment = (p: Point, a: Point, b: Point): Point => {
    const atob = { x: b.x - a.x, y: b.y - a.y };
    const atop = { x: p.x - a.x, y: p.y - a.y };
    const lenSq = atob.x * atob.x + atob.y * atob.y;
    if (lenSq === 0) return a;
    const dot = atop.x * atob.x + atop.y * atob.y;
    const t = Math.min(1, Math.max(0, dot / lenSq));
    return {
        x: a.x + atob.x * t,
        y: a.y + atob.y * t
    };
};

export const getSnappedPoint = (
    currentPos: Point, 
    displayedStrokes: Stroke[], 
    enabled: boolean,
    activeLayerId?: string,
    crossLayerSnapping?: boolean,
    ignorePoints?: Map<string, Set<number>>
): Point => {
    if (!enabled || displayedStrokes.length === 0) return currentPos;

    let bestPoint = currentPos;
    let minVertexDist = SNAP_THRESHOLD;
    let minEdgeDist = SNAP_THRESHOLD;
    
    let foundVertex = false;
    let foundEdge = false;

    // Filter strokes based on layer logic
    const snapCandidates = displayedStrokes.filter(s => {
        if (crossLayerSnapping) return true;
        return s.layerId === activeLayerId;
    });

    // Phase 1: Check Vertices (High Priority)
    for (const stroke of snapCandidates) {
        const ignoredIndices = ignorePoints?.get(stroke.id);

        stroke.points.forEach((p, idx) => {
            if (ignoredIndices && ignoredIndices.has(idx)) return;

            const d = distance(currentPos, p);
            if (d < minVertexDist) {
                minVertexDist = d;
                bestPoint = p;
                foundVertex = true;
            }
        });
    }

    // If we found a vertex within threshold, return it immediately.
    if (foundVertex) {
        return bestPoint;
    }

    // Phase 2: Check Edges (Lower Priority)
    for (const stroke of snapCandidates) {
         // Note: For edges, we ideally shouldn't snap to segments adjacent to the moving point,
         // but that's complex to filter. Usually fine as long as we don't snap to the moving point itself (vertex phase).
         const samples = sampleStroke(stroke, 10); 
         for (let i = 0; i < samples.length - 1; i++) {
             const p1 = samples[i];
             const p2 = samples[i+1];
             
             const proj = closestPointOnSegment(currentPos, p1, p2);
             const d = distance(currentPos, proj);
             
             if (d < minEdgeDist) {
                 minEdgeDist = d;
                 bestPoint = proj;
                 foundEdge = true;
             }
         }
    }

    return foundEdge ? bestPoint : currentPos;
};
