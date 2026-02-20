
import { Point, Stroke, Keyframe, ToolType } from '../types';
import { distance, sampleStroke } from './mathUtils';

// Increased threshold to 20 for easier selection
export const hitTest = (point: Point, strokes: Stroke[], threshold = 20): Stroke | undefined => {
    // We reverse strokes so we pick the "topmost" (latest drawn) one if overlapping
    for (let i = strokes.length - 1; i >= 0; i--) {
        const s = strokes[i];
        // Generate dense points for this stroke including bezier interpolation
        const visualPoints = sampleStroke(s, 15);
        if (visualPoints.some(p => distance(p, point) < threshold)) {
            return s;
        }
    }
    return undefined;
};

export const boxTest = (
    box: { start: Point; end: Point }, 
    strokes: Stroke[]
): Set<string> => {
    const xMin = Math.min(box.start.x, box.end.x);
    const xMax = Math.max(box.start.x, box.end.x);
    const yMin = Math.min(box.start.y, box.end.y);
    const yMax = Math.max(box.start.y, box.end.y);

    const result = new Set<string>();
    strokes.forEach(s => {
        // For box select, checking vertices is usually enough, but for long sparse curves
        // one might expect the curve segment inside the box to trigger selection.
        // For performance, we'll check vertices first, then if needed, sample.
        const verticesInside = s.points.some(p => p.x >= xMin && p.x <= xMax && p.y >= yMin && p.y <= yMax);
        if (verticesInside) {
            result.add(s.id);
        } else {
             // Optional: Check samples if strictness is required
             const samples = sampleStroke(s, 5);
             if (samples.some(p => p.x >= xMin && p.x <= xMax && p.y >= yMin && p.y <= yMax)) {
                 result.add(s.id);
             }
        }
    });
    return result;
};

interface SelectionContext {
    activeKeyframe?: Keyframe;
    prevContext: Keyframe;
    nextContext: Keyframe;
    displayedStrokes: Stroke[]; // For tweens/onionskins
}

export const calculateSelection = (
    box: { start: Point; end: Point },
    tool: ToolType,
    isShift: boolean,
    currentSelection: Set<string>, // standard or corres depending on tool
    context: SelectionContext
): Set<string> => {
    const isClick = distance(box.start, box.end) < 5;
    const newSelection = new Set<string>(currentSelection);

    if (tool === ToolType.CORRESPONDENCE) {
        const prevStrokes = context.prevContext.strokes;
        const nextStrokes = context.nextContext.strokes;
        const tweenStrokes = context.displayedStrokes;
        const allSelectables = [...prevStrokes, ...nextStrokes];

        if (isClick) {
            const hitTween = hitTest(box.end, tweenStrokes);
            const hitAnchor = hitTest(box.end, allSelectables);

            // AUTO-ACCUMULATE LOGIC:
            // If we have a Tween selected and click an Anchor (or vice versa), 
            // assume user wants to connect them -> Add to selection.
            const hasTweenSelected = Array.from(currentSelection).some(id => tweenStrokes.some(ts => ts.id === id));
            const hasAnchorSelected = Array.from(currentSelection).some(id => allSelectables.some(as => as.id === id));

            if (isShift) {
                // Explicit toggle
                if (hitTween) {
                    if (newSelection.has(hitTween.id)) newSelection.delete(hitTween.id);
                    else newSelection.add(hitTween.id);
                } else if (hitAnchor) {
                    if (newSelection.has(hitAnchor.id)) newSelection.delete(hitAnchor.id);
                    else newSelection.add(hitAnchor.id);
                }
            } else {
                // Smart Selection
                if (hitTween && hitAnchor) {
                    // Overlap: Prioritize Tween, but if Tween already selected, pick Anchor
                    if (currentSelection.has(hitTween.id)) {
                        newSelection.add(hitAnchor.id);
                    } else {
                        newSelection.clear();
                        newSelection.add(hitTween.id);
                    }
                } else if (hitTween) {
                    // If we have an anchor selected, keep it and add tween
                    if (hasAnchorSelected) {
                        newSelection.add(hitTween.id);
                    } else {
                        newSelection.clear();
                        newSelection.add(hitTween.id);
                    }
                } else if (hitAnchor) {
                     // If we have a tween selected, keep it and add anchor
                     if (hasTweenSelected) {
                         newSelection.add(hitAnchor.id);
                     } else {
                         newSelection.clear();
                         newSelection.add(hitAnchor.id);
                     }
                } else {
                    newSelection.clear();
                }
            }
            return newSelection;
        } else {
            // Box Select
            const inBox = boxTest(box, allSelectables);
            inBox.forEach(id => newSelection.add(id));
            
            // Also select tweens in box
            const tweensInBox = boxTest(box, tweenStrokes);
            tweensInBox.forEach(id => newSelection.add(id));
        }
    } else {
        // Standard Select / Bind
        const activeStrokes = context.activeKeyframe ? context.activeKeyframe.strokes : [];
        const activeGuides = context.activeKeyframe ? (context.activeKeyframe.motionPaths || []) : [];
        const allSelectables = [...activeStrokes, ...activeGuides];

        if (isClick) {
            const clicked = hitTest(box.end, allSelectables);
            if (clicked) {
                if (tool === ToolType.BIND && !activeStrokes.some(s => s.id === clicked.id)) {
                    // ignore
                } else {
                    if (isShift) {
                        if (newSelection.has(clicked.id)) newSelection.delete(clicked.id);
                        else newSelection.add(clicked.id);
                    } else {
                        if (!newSelection.has(clicked.id)) {
                            newSelection.clear();
                            newSelection.add(clicked.id);
                        } else newSelection.delete(clicked.id);
                    }
                }
            } else {
                if (tool !== ToolType.BIND) newSelection.clear();
            }
        } else {
            const inBox = boxTest(box, allSelectables);
            inBox.forEach(id => {
                 if (tool === ToolType.BIND && !activeStrokes.some(s => s.id === id)) return;
                 newSelection.add(id);
            });
        }
    }

    return newSelection;
};
