import { Point, Stroke } from '../types';
import { distance, getPathLength, resamplePath } from './mathUtils';

export const getTaperedPath = (
    points: Point[], 
    baseWidth: number, 
    taperStart: number, 
    taperEnd: number,
    isClosed: boolean = false
): string => {
    if (points.length < 2) return '';

    // If no tapering, we can't just return the centerline because this function 
    // is expected to return an OUTLINE (filled shape), not a stroke.
    // However, if width is uniform, we could technically use stroke-width, 
    // but to keep rendering consistent (always fill), we should generate the outline.
    // But for performance, if taperStart=0 and taperEnd=0, maybe we should just use stroke?
    // The caller (CanvasView) decides whether to use fill or stroke. 
    // If this function is called, we assume we want the outline path.

    // 1. Resample for smoothness
    // We need enough density to make the taper look good.
    const totalLen = getPathLength(points);
    const numPoints = Math.max(20, Math.ceil(totalLen / 5)); // 1 point every 5 pixels roughly
    const resampled = resamplePath(points, numPoints);
    
    if (resampled.length < 2) return '';

    const leftSide: Point[] = [];
    const rightSide: Point[] = [];

    for (let i = 0; i < resampled.length; i++) {
        const p = resampled[i];
        
        // Calculate Tangent
        let tangent = { x: 0, y: 0 };
        if (i === 0) {
            const next = resampled[i + 1];
            tangent = { x: next.x - p.x, y: next.y - p.y };
        } else if (i === resampled.length - 1) {
            const prev = resampled[i - 1];
            tangent = { x: p.x - prev.x, y: p.y - prev.y };
        } else {
            const prev = resampled[i - 1];
            const next = resampled[i + 1];
            tangent = { x: next.x - prev.x, y: next.y - prev.y };
        }

        // Normalize Tangent
        let len = Math.sqrt(tangent.x * tangent.x + tangent.y * tangent.y);
        if (len === 0) {
            tangent = { x: 1, y: 0 };
        } else {
            tangent = { x: tangent.x / len, y: tangent.y / len };
        }

        // Calculate Normal (-y, x)
        const normal = { x: -tangent.y, y: tangent.x };

        // Calculate Width Factor
        const t = i / (resampled.length - 1);
        let widthFactor = 1;

        if (t < taperStart) {
            // Ease in
            widthFactor = t / taperStart;
            // Optional: Smoothstep for nicer taper
            // widthFactor = widthFactor * widthFactor * (3 - 2 * widthFactor);
        } else if (t > (1 - taperEnd)) {
            // Ease out
            // t goes from (1-taperEnd) to 1.
            // We want factor to go from 1 to 0.
            // (1 - t) goes from taperEnd to 0.
            // So (1 - t) / taperEnd goes from 1 to 0.
            widthFactor = (1 - t) / taperEnd;
            // widthFactor = widthFactor * widthFactor * (3 - 2 * widthFactor);
        }

        const currentHalfWidth = (baseWidth * widthFactor) / 2;

        leftSide.push({
            x: p.x + normal.x * currentHalfWidth,
            y: p.y + normal.y * currentHalfWidth
        });

        rightSide.push({
            x: p.x - normal.x * currentHalfWidth,
            y: p.y - normal.y * currentHalfWidth
        });
    }

    // Construct Path
    let d = `M ${leftSide[0].x} ${leftSide[0].y}`;
    
    // Forward along left side
    for (let i = 1; i < leftSide.length; i++) {
        d += ` L ${leftSide[i].x} ${leftSide[i].y}`;
    }

    // Connect to right side end
    d += ` L ${rightSide[rightSide.length - 1].x} ${rightSide[rightSide.length - 1].y}`;

    // Backward along right side
    for (let i = rightSide.length - 2; i >= 0; i--) {
        d += ` L ${rightSide[i].x} ${rightSide[i].y}`;
    }

    // Close
    d += ' Z';

    return d;
};
