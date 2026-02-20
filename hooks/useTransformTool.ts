
import { useState, useCallback } from 'react';
import { Point, Stroke, TransformMode } from '../types';
import { distance, rotatePoint, scalePoint, getPointsCentroid, sampleStroke } from '../utils/mathUtils';
import { getSnappedPoint } from '../logic/snapping';

interface TransformSelection {
    strokeId: string;
    pointIndices: Set<number>;
    handleType?: 'point' | 'cp1' | 'cp2'; 
}

// Deep clone helper
const deepCloneStrokes = (strokes: Stroke[]): Map<string, Stroke> => {
    const map = new Map<string, Stroke>();
    strokes.forEach(s => {
        const clonedPoints = s.points.map(p => ({
            x: p.x,
            y: p.y,
            cp1: p.cp1 ? { ...p.cp1 } : undefined,
            cp2: p.cp2 ? { ...p.cp2 } : undefined
        }));
        map.set(s.id, { ...s, points: clonedPoints });
    });
    return map;
};

// Fast bounding box check to avoid expensive sampling
const strokeBoundsHit = (s: Stroke, p: Point, pad: number) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for(const pt of s.points) {
        if(pt.x < minX) minX = pt.x;
        if(pt.x > maxX) maxX = pt.x;
        if(pt.y < minY) minY = pt.y;
        if(pt.y > maxY) maxY = pt.y;
    }
    return (p.x >= minX - pad && p.x <= maxX + pad && p.y >= minY - pad && p.y <= maxY + pad);
};

export const useTransformTool = (
    strokes: Stroke[], 
    mode: TransformMode,
    snappingEnabled: boolean,
    activeLayerId: string,
    crossLayerSnapping: boolean
) => {
    const [selection, setSelection] = useState<TransformSelection[]>([]);
    const [dragStart, setDragStart] = useState<Point | null>(null);
    const [initialStrokesMap, setInitialStrokesMap] = useState<Map<string, Stroke>>(new Map());
    const [centroid, setCentroid] = useState<Point | null>(null);
    const [previewStrokes, setPreviewStrokes] = useState<Map<string, Stroke>>(new Map());
    const [snapIndicator, setSnapIndicator] = useState<Point | null>(null);
    
    // Track which specific point (if any) is being used as the drag anchor for snapping
    const [dragAnchor, setDragAnchor] = useState<{strokeId: string, idx: number, initialPos: Point} | null>(null);

    const updateCentroid = (sel: TransformSelection[], strokeSource: Stroke[]) => {
        const allSelectedPoints: Point[] = [];
        sel.forEach(s => {
            const stroke = strokeSource.find(st => st.id === s.strokeId);
            if (stroke) {
                s.pointIndices.forEach(idx => allSelectedPoints.push(stroke.points[idx]));
            }
        });
        if (allSelectedPoints.length > 0) {
            setCentroid(getPointsCentroid(allSelectedPoints));
        } else {
            setCentroid(null);
        }
    };

    const getSelectionBounds = useCallback(() => {
        if (selection.length === 0) return null;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let hasPoints = false;

        selection.forEach(sel => {
            const s = strokes.find(str => str.id === sel.strokeId);
            if (s) {
                sel.pointIndices.forEach(idx => {
                    const p = s.points[idx];
                    if (p.x < minX) minX = p.x;
                    if (p.x > maxX) maxX = p.x;
                    if (p.y < minY) minY = p.y;
                    if (p.y > maxY) maxY = p.y;
                    hasPoints = true;
                });
            }
        });
        
        if (!hasPoints) return null;
        const padding = 10; // Hit padding
        return { 
            x: minX - padding, 
            y: minY - padding, 
            w: (maxX - minX) + padding * 2, 
            h: (maxY - minY) + padding * 2 
        };
    }, [selection, strokes]);

    const handleDown = useCallback((pos: Point, isShift: boolean, isCtrl: boolean): boolean => {
        setPreviewStrokes(new Map()); 
        setDragAnchor(null);
        
        let bestHit: { strokeId: string, idx: number, dist: number, type: 'point'|'cp1'|'cp2' } | null = null;
        
        // HIT TEST RADIUS CONFIG
        const POINT_RADIUS = 12;
        const HANDLE_RADIUS = 10;
        
        // 1. HIT TEST: HANDLES (Prioritize handles of current selection)
        for (const sel of selection) {
            const stroke = strokes.find(s => s.id === sel.strokeId);
            if (!stroke) continue;
            for (const idx of sel.pointIndices) {
                const pt = stroke.points[idx];
                if (pt.cp1) {
                    const d = distance(pos, pt.cp1);
                    if (d < HANDLE_RADIUS) {
                        bestHit = { strokeId: sel.strokeId, idx, dist: d, type: 'cp1' };
                        break;
                    }
                }
                if (pt.cp2) {
                     const d = distance(pos, pt.cp2);
                     if (d < HANDLE_RADIUS) {
                        bestHit = { strokeId: sel.strokeId, idx, dist: d, type: 'cp2' };
                        break;
                    }
                }
            }
            if (bestHit) break;
        }

        // 2. HIT TEST: VERTICES
        if (!bestHit) {
            // Check all strokes
            for (let i = strokes.length - 1; i >= 0; i--) {
                const stroke = strokes[i];
                if (!strokeBoundsHit(stroke, pos, POINT_RADIUS + 5)) continue; 

                stroke.points.forEach((p, idx) => {
                    const d = distance(p, pos);
                    if (d < POINT_RADIUS) {
                        if (!bestHit || d < bestHit.dist) {
                            bestHit = { strokeId: stroke.id, idx, dist: d, type: 'point' };
                        }
                    }
                });
            }
        }

        let newSelection: TransformSelection[] = [...selection];
        
        // Case A: Hit Handle or Vertex
        if (bestHit) {
            // Setup Drag Anchor for snapping if it's a point
            if (bestHit.type === 'point') {
                const s = strokes.find(s => s.id === bestHit!.strokeId);
                if (s) setDragAnchor({ strokeId: s.id, idx: bestHit.idx, initialPos: s.points[bestHit.idx] });
            }

            if (bestHit.type === 'cp1' || bestHit.type === 'cp2') {
                const selIndex = newSelection.findIndex(s => s.strokeId === bestHit!.strokeId);
                if (selIndex !== -1) {
                    newSelection[selIndex] = { 
                        ...newSelection[selIndex], 
                        handleType: bestHit.type,
                        pointIndices: new Set([bestHit.idx]) 
                    };
                }
                setSelection(newSelection);
            } else {
                // Hit a Vertex
                const alreadySelectedIdx = newSelection.findIndex(s => s.strokeId === bestHit!.strokeId);
                const isPointSelected = alreadySelectedIdx !== -1 && newSelection[alreadySelectedIdx].pointIndices.has(bestHit.idx);

                if (isShift) {
                    // Toggle Logic
                    if (alreadySelectedIdx !== -1) {
                        const newIndices = new Set(newSelection[alreadySelectedIdx].pointIndices);
                        if (newIndices.has(bestHit.idx)) newIndices.delete(bestHit.idx);
                        else newIndices.add(bestHit.idx);

                        if (newIndices.size === 0) newSelection.splice(alreadySelectedIdx, 1);
                        else newSelection[alreadySelectedIdx] = { ...newSelection[alreadySelectedIdx], pointIndices: newIndices };
                    } else {
                        newSelection.push({ strokeId: bestHit.strokeId, pointIndices: new Set([bestHit.idx]) });
                    }
                    setSelection(newSelection);
                } else {
                    // If hitting an already selected point, DO NOT change selection (allows moving the group)
                    // If hitting an unselected point, select ONLY it
                    if (!isPointSelected) {
                        newSelection = [{ strokeId: bestHit.strokeId, pointIndices: new Set([bestHit.idx]) }];
                        setSelection(newSelection);
                    }
                    // Clean up handle types
                    setSelection(prev => prev.map(s => ({ ...s, handleType: undefined })));
                }
            }
            
            setDragStart(pos);
            const selectedIds = new Set(newSelection.map(s => s.strokeId));
            const relevantStrokes = strokes.filter(s => selectedIds.has(s.id));
            setInitialStrokesMap(deepCloneStrokes(relevantStrokes));
            updateCentroid(newSelection, strokes);
            return true;
        }

        // 3. HIT TEST: BOUNDING BOX (Move Group)
        const bounds = getSelectionBounds();
        if (bounds) {
             if (pos.x >= bounds.x && pos.x <= bounds.x + bounds.w && pos.y >= bounds.y && pos.y <= bounds.y + bounds.h) {
                 // Clicked inside selection box -> Move Group
                 // We keep selection as is.
                 setDragStart(pos);
                 setDragAnchor(null); // No specific point anchor for box move
                 
                 const selectedIds = new Set(selection.map(s => s.strokeId));
                 const relevantStrokes = strokes.filter(s => selectedIds.has(s.id));
                 setInitialStrokesMap(deepCloneStrokes(relevantStrokes));
                 updateCentroid(selection, strokes);
                 return true;
             }
        }

        // 4. HIT TEST: STROKE BODY (Select new stroke)
        if (!isShift) {
             for (let i = strokes.length - 1; i >= 0; i--) {
                 const stroke = strokes[i];
                 if (!strokeBoundsHit(stroke, pos, 15)) continue;

                 const samples = sampleStroke(stroke, 8);
                 if (samples.some(p => distance(p, pos) < 8)) {
                     // Find closest point to snap selection to
                     let closestIdx = -1;
                     let closestDist = Infinity;
                     stroke.points.forEach((p, idx) => {
                         const d = distance(p, pos);
                         if (d < closestDist) {
                             closestDist = d;
                             closestIdx = idx;
                         }
                     });
                     
                     if (closestIdx !== -1) {
                        newSelection = [{ strokeId: stroke.id, pointIndices: new Set([closestIdx]) }];
                        setSelection(newSelection);
                        setDragStart(pos);
                        setDragAnchor({ strokeId: stroke.id, idx: closestIdx, initialPos: stroke.points[closestIdx] });
                        
                        setInitialStrokesMap(deepCloneStrokes([stroke]));
                        updateCentroid(newSelection, strokes);
                        return true;
                     }
                 }
            }
        }

        // 5. EMPTY SPACE
        if (!isShift) {
            setSelection([]);
            setCentroid(null);
        }
        setDragStart(null);
        return false;

    }, [strokes, selection, getSelectionBounds]);

    const handleMove = useCallback((pos: Point, isAlt: boolean) => {
        if (!dragStart || selection.length === 0 || initialStrokesMap.size === 0) return;

        let effectivePos = pos;
        let snapPt: Point | null = null;
        const activeHandleSel = selection.find(s => s.handleType !== undefined);

        // --- SNAPPING LOGIC ---
        // We allow snapping if:
        // 1. Snapping is enabled
        // 2. We are NOT dragging a bezier handle 
        // 3. We have a valid dragAnchor that is an ENDPOINT (start or end of stroke)
        
        let shouldSnap = snappingEnabled && !activeHandleSel && !!dragAnchor;
        
        if (shouldSnap && dragAnchor) {
            // Verify if anchor is actually an endpoint
            const anchorStroke = initialStrokesMap.get(dragAnchor.strokeId);
            if (anchorStroke) {
                 const isEndpoint = dragAnchor.idx === 0 || dragAnchor.idx === anchorStroke.points.length - 1;
                 if (!isEndpoint) shouldSnap = false;
            }
        }

        if (shouldSnap && dragAnchor) {
            const anchorInitial = dragAnchor.initialPos;
            const rawCurrentPos = {
                x: anchorInitial.x + (pos.x - dragStart.x),
                y: anchorInitial.y + (pos.y - dragStart.y)
            };

            // Build ignore map from selection (ignore points we are moving)
            const ignoreMap = new Map<string, Set<number>>();
            selection.forEach(s => {
                ignoreMap.set(s.strokeId, s.pointIndices);
            });

            // Force high priority snapping
            // Pass all strokes (including selected ones for potential self-closure)
            const snapped = getSnappedPoint(
                rawCurrentPos, 
                strokes, 
                true, 
                activeLayerId, 
                crossLayerSnapping,
                ignoreMap
            );

            // Distance check to avoid sticky start if snapped point is too close to start
            if (distance(snapped, rawCurrentPos) < 15) { // Visual range check
                if (snapped.x !== rawCurrentPos.x || snapped.y !== rawCurrentPos.y) {
                    snapPt = snapped;
                    // Adjust effectivePos to satisfy the snap relative to mouse delta
                    effectivePos = {
                        x: snapped.x - anchorInitial.x + dragStart.x,
                        y: snapped.y - anchorInitial.y + dragStart.y
                    };
                }
            }
        }
        setSnapIndicator(snapPt);

        const startPoint = dragStart;
        const delta = { x: effectivePos.x - startPoint.x, y: effectivePos.y - startPoint.y };
        const newPreviews = new Map<string, Stroke>();

        if (activeHandleSel) {
            const baseStroke = initialStrokesMap.get(activeHandleSel.strokeId);
            if (!baseStroke) return;

            const indices = Array.from(activeHandleSel.pointIndices) as number[];
            if (indices.length === 0) return;
            const idx = indices[0];
            
            const newPoints: Point[] = [...baseStroke.points];
            const pt = { ...newPoints[idx] };
            const isCp1 = activeHandleSel.handleType === 'cp1';

            if (isCp1) pt.cp1 = pos; 
            else pt.cp2 = pos;

            if (!isAlt && pt.cp1 && pt.cp2) {
                const draggedHandle = isCp1 ? pt.cp1 : pt.cp2;
                const vx = draggedHandle.x - pt.x;
                const vy = draggedHandle.y - pt.y;
                const len = Math.sqrt(vx*vx + vy*vy);
                if (len > 0.001) {
                    const nx = vx / len;
                    const ny = vy / len;
                    const basePt = baseStroke.points[idx];
                    const baseOther = isCp1 ? basePt.cp2! : basePt.cp1!;
                    const dx = baseOther.x - basePt.x;
                    const dy = baseOther.y - basePt.y;
                    const otherLen = Math.sqrt(dx*dx + dy*dy);
                    const newOtherX = pt.x - nx * otherLen;
                    const newOtherY = pt.y - ny * otherLen;
                    if (isCp1) pt.cp2 = { x: newOtherX, y: newOtherY };
                    else pt.cp1 = { x: newOtherX, y: newOtherY };
                }
            }
            newPoints[idx] = pt;
            newPreviews.set(baseStroke.id, { ...baseStroke, points: newPoints });
            setPreviewStrokes(newPreviews);
            return;
        }

        let totalPoints = 0;
        selection.forEach(s => totalPoints += s.pointIndices.size);
        const effectiveMode = (totalPoints < 2) ? TransformMode.TRANSLATE : mode;

        selection.forEach(sel => {
            const baseStroke = initialStrokesMap.get(sel.strokeId);
            if (!baseStroke) return;

            let pointsChanged = false;
            const newPoints: Point[] = baseStroke.points.map((p, idx) => {
                if (!sel.pointIndices.has(idx)) return p;
                pointsChanged = true;
                let newP: Point = { ...p };

                if (effectiveMode === TransformMode.TRANSLATE || !centroid) {
                    newP.x += delta.x;
                    newP.y += delta.y;
                    if (newP.cp1) { newP.cp1 = { x: newP.cp1.x + delta.x, y: newP.cp1.y + delta.y }; }
                    if (newP.cp2) { newP.cp2 = { x: newP.cp2.x + delta.x, y: newP.cp2.y + delta.y }; }
                }
                else if (effectiveMode === TransformMode.ROTATE && centroid) {
                    const startAngle = Math.atan2(startPoint.y - centroid.y, startPoint.x - centroid.x);
                    const currAngle = Math.atan2(pos.y - centroid.y, pos.x - centroid.x);
                    const angle = currAngle - startAngle;
                    newP = rotatePoint(p, centroid, angle);
                    if (p.cp1) newP.cp1 = rotatePoint(p.cp1 as Point, centroid, angle);
                    if (p.cp2) newP.cp2 = rotatePoint(p.cp2 as Point, centroid, angle);
                }
                else if (effectiveMode === TransformMode.SCALE && centroid) {
                    const startDist = distance(startPoint, centroid);
                    if (startDist > 1) {
                        const currDist = distance(pos, centroid);
                        const scale = currDist / startDist;
                        newP = scalePoint(p, centroid, scale);
                        if (p.cp1) newP.cp1 = scalePoint(p.cp1 as Point, centroid, scale);
                        if (p.cp2) newP.cp2 = scalePoint(p.cp2 as Point, centroid, scale);
                    }
                }
                return newP;
            });

            if (pointsChanged) {
                newPreviews.set(baseStroke.id, { ...baseStroke, points: newPoints });
            }
        });

        setPreviewStrokes(newPreviews);
    }, [dragStart, selection, initialStrokesMap, centroid, mode, snappingEnabled, strokes, dragAnchor, activeLayerId, crossLayerSnapping]);

    const handleUp = useCallback((onCommit: (strokes: Stroke[]) => void) => {
        setDragStart(null);
        setSnapIndicator(null);
        setDragAnchor(null);
        
        if (previewStrokes.size > 0) {
            const finalStrokes = strokes.map(s => {
                if (previewStrokes.has(s.id)) return previewStrokes.get(s.id)!;
                return s;
            });
            onCommit(finalStrokes);
            setPreviewStrokes(new Map());
            updateCentroid(selection, finalStrokes);
        }
        
        if (selection.some(s => s.handleType)) {
             setSelection(prev => prev.map(s => ({ ...s, handleType: undefined })));
        }
    }, [previewStrokes, strokes, selection]);

    const handleBoxSelect = useCallback((box: { start: Point, end: Point }, isShift: boolean) => {
        let newSelection: TransformSelection[] = isShift ? [...selection] : [];
        const xMin = Math.min(box.start.x, box.end.x);
        const xMax = Math.max(box.start.x, box.end.x);
        const yMin = Math.min(box.start.y, box.end.y);
        const yMax = Math.max(box.start.y, box.end.y);

        strokes.forEach(s => {
            const indices = new Set<number>();
            s.points.forEach((p, idx) => {
                if (p.x >= xMin && p.x <= xMax && p.y >= yMin && p.y <= yMax) {
                    indices.add(idx);
                }
            });

            if (indices.size > 0) {
                 const existingIdx = newSelection.findIndex(sel => sel.strokeId === s.id);
                 if (existingIdx !== -1) {
                     indices.forEach(i => newSelection[existingIdx].pointIndices.add(i));
                 } else {
                     newSelection.push({ strokeId: s.id, pointIndices: indices });
                 }
            }
        });

        setSelection(newSelection);
        updateCentroid(newSelection, strokes);
    }, [strokes, selection]);

    const handleDoubleClick = useCallback((pos: Point) => {
        // Double click logic:
        // 1. If hit point: select ONLY that point
        // 2. If hit box: Deselect all (or reset selection)
        // 3. Else: Deselect all
        
        // Simple hit test for point
        const POINT_RADIUS = 12;
        for (let i = strokes.length - 1; i >= 0; i--) {
            const stroke = strokes[i];
            if (!strokeBoundsHit(stroke, pos, POINT_RADIUS + 5)) continue; 
            for (let idx = 0; idx < stroke.points.length; idx++) {
                const p = stroke.points[idx];
                if (distance(p, pos) < POINT_RADIUS) {
                    const newSel = [{ strokeId: stroke.id, pointIndices: new Set([idx]) }];
                    setSelection(newSel);
                    updateCentroid(newSel, strokes);
                    return;
                }
            }
        }

        // If not hit point, but inside bounds? Deselect.
        setSelection([]);
        setCentroid(null);
    }, [strokes, getSelectionBounds]);

    return {
        selection,
        previewStrokes,
        handleDown,
        handleMove,
        handleUp,
        handleBoxSelect,
        handleDoubleClick,
        centroid,
        snapIndicator
    };
};
