import { useState, useCallback } from 'react';
import { Point, Stroke, TransformMode } from '../types';
import { distance, rotatePoint, scalePoint, getPointsCentroid, sampleStroke } from '../utils/mathUtils';
import { getSnappedPoint } from '../logic/snapping';

interface TransformSelection {
    strokeId: string;
    pointIndices: Set<number>;
    handleType?: 'point' | 'cp1' | 'cp2';
}

type BoxHandleKind =
    | 'scale-nw' | 'scale-n' | 'scale-ne' | 'scale-e' | 'scale-se' | 'scale-s' | 'scale-sw' | 'scale-w'
    | 'rotate-ring'
    | 'skew-n' | 'skew-ne' | 'skew-e' | 'skew-se' | 'skew-s' | 'skew-sw' | 'skew-w' | 'skew-nw';

interface ActiveBoxHandle {
    kind: BoxHandleKind;
    bounds: { x: number; y: number; w: number; h: number };
    outerBounds: { x: number; y: number; w: number; h: number };
    handlePoint: Point;
}

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

const strokeBoundsHit = (s: Stroke, p: Point, pad: number) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const pt of s.points) {
        if (pt.x < minX) minX = pt.x;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.y > maxY) maxY = pt.y;
    }
    return p.x >= minX - pad && p.x <= maxX + pad && p.y >= minY - pad && p.y <= maxY + pad;
};

const getBoundsFromSelection = (sel: TransformSelection[], strokeSource: Stroke[], pad = 0) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let has = false;
    sel.forEach(s => {
        const stroke = strokeSource.find(st => st.id === s.strokeId);
        if (!stroke) return;
        s.pointIndices.forEach(idx => {
            const p = stroke.points[idx];
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
            has = true;
        });
    });
    if (!has) return null;
    return { x: minX - pad, y: minY - pad, w: (maxX - minX) + pad * 2, h: (maxY - minY) + pad * 2 };
};

const getSelectionCenter = (sel: TransformSelection[], strokeSource: Stroke[]): Point | null => {
    const b = getBoundsFromSelection(sel, strokeSource, 0);
    if (!b) return null;
    return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
};

const getBoxHandles = (bounds: { x: number; y: number; w: number; h: number }, outerPad = 26) => {
    const x = bounds.x;
    const y = bounds.y;
    const w = Math.max(0.001, bounds.w);
    const h = Math.max(0.001, bounds.h);
    const cx = x + w / 2;
    const cy = y + h / 2;

    const outer = { x: x - outerPad, y: y - outerPad, w: w + outerPad * 2, h: h + outerPad * 2 };
    const ox = outer.x;
    const oy = outer.y;
    const ow = outer.w;
    const oh = outer.h;
    const ocx = ox + ow / 2;
    const ocy = oy + oh / 2;

    const scaleHandles: Array<{ kind: BoxHandleKind; point: Point }> = [
        { kind: 'scale-nw', point: { x, y } },
        { kind: 'scale-n', point: { x: cx, y } },
        { kind: 'scale-ne', point: { x: x + w, y } },
        { kind: 'scale-e', point: { x: x + w, y: cy } },
        { kind: 'scale-se', point: { x: x + w, y: y + h } },
        { kind: 'scale-s', point: { x: cx, y: y + h } },
        { kind: 'scale-sw', point: { x, y: y + h } },
        { kind: 'scale-w', point: { x, y: cy } }
    ];

    const outerHandles: Array<{ kind: BoxHandleKind; point: Point }> = [
        { kind: 'skew-nw', point: { x: ox, y: oy } },
        { kind: 'skew-n', point: { x: ocx, y: oy } },
        { kind: 'skew-ne', point: { x: ox + ow, y: oy } },
        { kind: 'skew-e', point: { x: ox + ow, y: ocy } },
        { kind: 'skew-se', point: { x: ox + ow, y: oy + oh } },
        { kind: 'skew-s', point: { x: ocx, y: oy + oh } },
        { kind: 'skew-sw', point: { x: ox, y: oy + oh } },
        { kind: 'skew-w', point: { x: ox, y: ocy } }
    ];

    return { scaleHandles, outerHandles, outer };
};

const pointInRect = (p: Point, r: { x: number; y: number; w: number; h: number }) =>
    p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

const expandRect = (r: { x: number; y: number; w: number; h: number }, pad: number) => ({
    x: r.x - pad,
    y: r.y - pad,
    w: r.w + pad * 2,
    h: r.h + pad * 2
});

export const useTransformTool = (
    strokes: Stroke[],
    mode: TransformMode,
    snappingEnabled: boolean,
    activeLayerId: string,
    crossLayerSnapping: boolean,
    transformEditAllLayers: boolean,
    bindLinkedFillsOnTransform: boolean
) => {
    const [selection, setSelection] = useState<TransformSelection[]>([]);
    const [dragStart, setDragStart] = useState<Point | null>(null);
    const [initialStrokesMap, setInitialStrokesMap] = useState<Map<string, Stroke>>(new Map());
    const [centroid, setCentroid] = useState<Point | null>(null);
    const [transformCenter, setTransformCenter] = useState<Point | null>(null);
    const [previewStrokes, setPreviewStrokes] = useState<Map<string, Stroke>>(new Map());
    const [snapIndicator, setSnapIndicator] = useState<Point | null>(null);
    const [dragAnchor, setDragAnchor] = useState<{ strokeId: string; idx: number; initialPos: Point } | null>(null);
    const [activeBoxHandle, setActiveBoxHandle] = useState<ActiveBoxHandle | null>(null);

    const selectableStrokes = transformEditAllLayers ? strokes : strokes.filter(s => s.layerId === activeLayerId);


    const getSelectionCenter = (sel: TransformSelection[], strokeSource: Stroke[]): Point | null => {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let has = false;
        sel.forEach(s => {
            const stroke = strokeSource.find(st => st.id === s.strokeId);
            if (!stroke) return;
            s.pointIndices.forEach(idx => {
                const p = stroke.points[idx];
                minX = Math.min(minX, p.x);
                minY = Math.min(minY, p.y);
                maxX = Math.max(maxX, p.x);
                maxY = Math.max(maxY, p.y);
                has = true;
            });
        });
        if (!has) return null;
        return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    };

    const updateCentroid = (sel: TransformSelection[], strokeSource: Stroke[]) => {
        const allSelectedPoints: Point[] = [];
        sel.forEach(s => {
            const stroke = strokeSource.find(st => st.id === s.strokeId);
            if (!stroke) return;
            s.pointIndices.forEach(idx => allSelectedPoints.push(stroke.points[idx]));
        });
        if (allSelectedPoints.length > 0) {
            setCentroid(getPointsCentroid(allSelectedPoints));
            setTransformCenter(getSelectionCenter(sel, strokeSource));
        } else {
            setCentroid(null);
            setTransformCenter(null);
        }
    };

    const getSelectionBounds = useCallback(() => {
        const totalPoints = selection.reduce((acc, s) => acc + s.pointIndices.size, 0);
        if (totalPoints < 2) return null;
        const raw = getBoundsFromSelection(selection, strokes, 10);
        if (!raw) return null;
        // Enforce the same minimum box the hit testing uses so circles are drawn where they're clickable
        const MIN_INNER = 56;
        const cx = raw.x + raw.w / 2;
        const cy = raw.y + raw.h / 2;
        const w = Math.max(MIN_INNER, raw.w);
        const h = Math.max(MIN_INNER, raw.h);
        return { x: cx - w / 2, y: cy - h / 2, w, h };
    }, [selection, strokes]);

    const expandLinkedFillSelection = (baseSelection: TransformSelection[]) => {
        if (!bindLinkedFillsOnTransform) return baseSelection;

        const newSelection = [...baseSelection];
        const selectedIds = new Set(newSelection.map(s => s.strokeId));
        const sourcePoints: Point[] = [];
        newSelection.forEach(sel => {
            const source = strokes.find(st => st.id === sel.strokeId);
            if (!source) return;
            sel.pointIndices.forEach(idx => sourcePoints.push(source.points[idx]));
        });

        strokes.forEach(st => {
            if (!st.bindToLinkedStrokes || !st.linkedStrokeIds?.length) return;
            if (!st.linkedStrokeIds.some(id => selectedIds.has(id))) return;

            const pointIndices = new Set<number>();
            if (sourcePoints.length <= 2) {
                sourcePoints.forEach(src => {
                    let bestIdx = 0;
                    let bestDist = Infinity;
                    st.points.forEach((p, idx) => {
                        const d = distance(src, p);
                        if (d < bestDist) {
                            bestDist = d;
                            bestIdx = idx;
                        }
                    });
                    pointIndices.add(bestIdx);
                });
            } else {
                st.points.forEach((_, idx) => pointIndices.add(idx));
            }

            if (!newSelection.some(sel => sel.strokeId === st.id)) {
                newSelection.push({ strokeId: st.id, pointIndices });
            }
        });

        return newSelection;
    };

    const handleDown = useCallback((pos: Point, isShift: boolean): boolean => {
        setPreviewStrokes(new Map());
        setDragAnchor(null);
        setActiveBoxHandle(null);

        let bestHit: { strokeId: string; idx: number; dist: number; type: 'point' | 'cp1' | 'cp2' } | null = null;
        const POINT_RADIUS = 12;
        const HANDLE_RADIUS = 10;

        const rawBoundsEarly = getBoundsFromSelection(selection, strokes, 0);
        const totalSelectedPointsEarly = selection.reduce((acc, s) => acc + s.pointIndices.size, 0);
        // When a bounding box is active (2+ points selected), don't allow accidental
        // cp handle or point re-selection — the box controls take full priority.
        const boxIsActive = !!(rawBoundsEarly && selection.length > 0 && totalSelectedPointsEarly >= 2);

        if (!boxIsActive) {
            for (const sel of selection) {
                const stroke = strokes.find(s => s.id === sel.strokeId);
                if (!stroke) continue;
                for (const idx of sel.pointIndices) {
                    const pt = stroke.points[idx];
                    if (pt.cp1) {
                        const d = distance(pos, pt.cp1);
                        if (d < HANDLE_RADIUS) { bestHit = { strokeId: sel.strokeId, idx, dist: d, type: 'cp1' }; break; }
                    }
                    if (pt.cp2) {
                        const d = distance(pos, pt.cp2);
                        if (d < HANDLE_RADIUS) { bestHit = { strokeId: sel.strokeId, idx, dist: d, type: 'cp2' }; break; }
                    }
                }
                if (bestHit) break;
            }
        }

        const rawBounds = getBoundsFromSelection(selection, strokes, 0);
        const totalSelectedPoints = selection.reduce((acc, s) => acc + s.pointIndices.size, 0);
        if (!bestHit && rawBounds && selection.length > 0 && totalSelectedPoints >= 2) {
            // --- Math-guaranteed minimum box sizes ---
            // Circle hit radius = 14px. For no two circles to overlap: gap ≥ 2×14 = 28px.
            // Inner box adjacent circles (e.g. scale-n to scale-ne) are w/2 apart → min w = 56px.
            // Inner-to-outer edge-midpoint gap = OUTER_PAD → min OUTER_PAD = 28px (use 30 for comfort).
            // This guarantees every circle is always individually clickable.
            const CIRCLE_R = 14;       // hit radius for all circles
            const MIN_INNER = 56;      // minimum inner box dimension (2 × 2×CIRCLE_R)
            const OUTER_PAD = 30;      // gap between inner and outer box (> 2×CIRCLE_R)
            const CENTER_R = 18;       // center crosshair hit radius

            // Enforce minimum inner box, centered on rawBounds center
            const rawCx = rawBounds.x + rawBounds.w / 2;
            const rawCy = rawBounds.y + rawBounds.h / 2;
            const innerW = Math.max(MIN_INNER, rawBounds.w);
            const innerH = Math.max(MIN_INNER, rawBounds.h);
            const innerBounds = {
                x: rawCx - innerW / 2,
                y: rawCy - innerH / 2,
                w: innerW,
                h: innerH
            };

            // Build ALL handles from the enforced innerBounds
            const handles = getBoxHandles(innerBounds, OUTER_PAD);
            const outerBox = handles.outer;

            const commitHandle = (kind: BoxHandleKind, handlePoint: Point) => {
                // Transform math still uses rawBounds so actual data isn't affected by visual expansion
                setActiveBoxHandle({ kind, bounds: rawBounds, outerBounds: outerBox, handlePoint });
                setDragStart(pos);
                const selectedIds = new Set(selection.map(s => s.strokeId));
                setInitialStrokesMap(deepCloneStrokes(strokes.filter(s => selectedIds.has(s.id))));
            };

            const commitMove = () => {
                setDragStart(pos);
                const selectedIds = new Set(selection.map(s => s.strokeId));
                setInitialStrokesMap(deepCloneStrokes(strokes.filter(s => selectedIds.has(s.id))));
                updateCentroid(selection, strokes);
            };

            // Priority 0: Center crosshair — always move, no exceptions
            if (distance(pos, { x: rawCx, y: rawCy }) <= CENTER_R) {
                commitMove();
                return true;
            }

            // Priority 1: Scale circles (inner box corners + edge midpoints)
            const scaleHit = handles.scaleHandles
                .map(h => ({ h, d: distance(pos, h.point) }))
                .filter(item => item.d <= CIRCLE_R)
                .sort((a, b) => a.d - b.d)[0];

            // Priority 2: Skew circles (outer box corners + edge midpoints)
            const skewHit = handles.outerHandles
                .map(h => ({ h, d: distance(pos, h.point) }))
                .filter(item => item.d <= CIRCLE_R)
                .sort((a, b) => a.d - b.d)[0];

            if (scaleHit) {
                commitHandle(scaleHit.h.kind, scaleHit.h.point);
                return true;
            }
            if (skewHit) {
                commitHandle(skewHit.h.kind, skewHit.h.point);
                return true;
            }

            // Priority 3: Move — inside inner box, no circle hit
            if (pointInRect(pos, innerBounds)) {
                commitMove();
                return true;
            }

            // Priority 4: Rotate — ring between inner and outer box, no circle hit
            if (pointInRect(pos, outerBox)) {
                commitHandle('rotate-ring', { x: rawCx, y: rawCy });
                return true;
            }

            // Priority 5: Buffer — just outside outer box, absorbs near-misses
            const bufferOuter = { x: outerBox.x - CIRCLE_R, y: outerBox.y - CIRCLE_R, w: outerBox.w + CIRCLE_R * 2, h: outerBox.h + CIRCLE_R * 2 };
            if (pointInRect(pos, bufferOuter)) {
                return true;
            }

            // Priority 6: Deselect — clearly outside
            if (!isShift) {
                setSelection([]);
                setCentroid(null);
                setTransformCenter(null);
            }
            setDragStart(null);
            return false;
        }

        if (!bestHit) {
            for (let i = selectableStrokes.length - 1; i >= 0; i--) {
                const stroke = selectableStrokes[i];
                if (!strokeBoundsHit(stroke, pos, POINT_RADIUS + 5)) continue;
                stroke.points.forEach((p, idx) => {
                    const d = distance(p, pos);
                    if (d < POINT_RADIUS && (!bestHit || d < bestHit.dist)) {
                        bestHit = { strokeId: stroke.id, idx, dist: d, type: 'point' };
                    }
                });
            }
        }

        let newSelection: TransformSelection[] = [...selection];
        if (bestHit) {
            if (bestHit.type === 'point') {
                const s = strokes.find(st => st.id === bestHit!.strokeId);
                if (s) setDragAnchor({ strokeId: s.id, idx: bestHit.idx, initialPos: s.points[bestHit.idx] });
            }

            if (bestHit.type === 'cp1' || bestHit.type === 'cp2') {
                const selIndex = newSelection.findIndex(s => s.strokeId === bestHit!.strokeId);
                if (selIndex !== -1) {
                    newSelection[selIndex] = { ...newSelection[selIndex], handleType: bestHit.type, pointIndices: new Set([bestHit.idx]) };
                }
            } else {
                const alreadySelectedIdx = newSelection.findIndex(s => s.strokeId === bestHit!.strokeId);
                const isPointSelected = alreadySelectedIdx !== -1 && newSelection[alreadySelectedIdx].pointIndices.has(bestHit.idx);

                if (isShift) {
                    if (alreadySelectedIdx !== -1) {
                        const newIndices = new Set(newSelection[alreadySelectedIdx].pointIndices);
                        if (newIndices.has(bestHit.idx)) newIndices.delete(bestHit.idx);
                        else newIndices.add(bestHit.idx);
                        if (newIndices.size === 0) newSelection.splice(alreadySelectedIdx, 1);
                        else newSelection[alreadySelectedIdx] = { ...newSelection[alreadySelectedIdx], pointIndices: newIndices };
                    } else {
                        newSelection.push({ strokeId: bestHit.strokeId, pointIndices: new Set([bestHit.idx]) });
                    }
                } else if (!isPointSelected) {
                    newSelection = [{ strokeId: bestHit.strokeId, pointIndices: new Set([bestHit.idx]) }];
                }

                newSelection = newSelection.map(s => ({ ...s, handleType: undefined }));
            }

            newSelection = expandLinkedFillSelection(newSelection);
            setSelection(newSelection);
            setDragStart(pos);
            const selectedIds = new Set(newSelection.map(s => s.strokeId));
            setInitialStrokesMap(deepCloneStrokes(strokes.filter(s => selectedIds.has(s.id))));
            updateCentroid(newSelection, strokes);
            return true;
        }

        if (!isShift) {
            for (let i = selectableStrokes.length - 1; i >= 0; i--) {
                const stroke = selectableStrokes[i];
                if (!strokeBoundsHit(stroke, pos, 15)) continue;
                // Use more samples per segment for accurate bezier hit detection
                const samples = sampleStroke(stroke, 20);
                const HIT_DIST = 10;
                if (!samples.some(p => distance(p, pos) < HIT_DIST)) continue;

                const allIndices = new Set<number>();
                stroke.points.forEach((_, idx) => allIndices.add(idx));
                newSelection = [{ strokeId: stroke.id, pointIndices: allIndices }];
                newSelection = expandLinkedFillSelection(newSelection);
                setSelection(newSelection);
                setDragStart(pos);
                setInitialStrokesMap(deepCloneStrokes(strokes.filter(s => new Set(newSelection.map(sel => sel.strokeId)).has(s.id))));
                updateCentroid(newSelection, strokes);
                return true;
            }
        }

        if (!isShift) {
            setSelection([]);
            setCentroid(null);
            setTransformCenter(null);
        }
        setDragStart(null);
        return false;
    }, [selection, strokes, selectableStrokes, bindLinkedFillsOnTransform]);

    const handleMove = useCallback((pos: Point, isAlt: boolean, isCtrl: boolean) => {
        if (!dragStart || selection.length === 0 || initialStrokesMap.size === 0) return;

        let effectivePos = pos;
        let snapPt: Point | null = null;
        const activeHandleSel = selection.find(s => s.handleType !== undefined);
        let shouldSnap = snappingEnabled && !activeHandleSel && !activeBoxHandle && !!dragAnchor;

        if (shouldSnap && dragAnchor) {
            const anchorStroke = initialStrokesMap.get(dragAnchor.strokeId);
            if (anchorStroke) {
                const isEndpoint = dragAnchor.idx === 0 || dragAnchor.idx === anchorStroke.points.length - 1;
                if (!isEndpoint) shouldSnap = false;
            }
        }

        if (shouldSnap && dragAnchor) {
            const anchorInitial = dragAnchor.initialPos;
            const rawCurrentPos = { x: anchorInitial.x + (pos.x - dragStart.x), y: anchorInitial.y + (pos.y - dragStart.y) };
            const ignoreMap = new Map<string, Set<number>>();
            selection.forEach(s => ignoreMap.set(s.strokeId, s.pointIndices));
            const snapped = getSnappedPoint(rawCurrentPos, strokes, true, activeLayerId, crossLayerSnapping, ignoreMap);
            if (distance(snapped, rawCurrentPos) < 15 && (snapped.x !== rawCurrentPos.x || snapped.y !== rawCurrentPos.y)) {
                snapPt = snapped;
                effectivePos = { x: snapped.x - anchorInitial.x + dragStart.x, y: snapped.y - anchorInitial.y + dragStart.y };
            }
        }
        setSnapIndicator(snapPt);

        const startPoint = dragStart;
        const delta = { x: effectivePos.x - startPoint.x, y: effectivePos.y - startPoint.y };
        const newPreviews = new Map<string, Stroke>();

        if (activeHandleSel) {
            const baseStroke = initialStrokesMap.get(activeHandleSel.strokeId);
            if (!baseStroke) return;
            const idx = Array.from(activeHandleSel.pointIndices)[0];
            if (idx === undefined) return;
            const newPoints = [...baseStroke.points];
            const pt = { ...newPoints[idx] };
            const isCp1 = activeHandleSel.handleType === 'cp1';
            if (isCp1) pt.cp1 = pos;
            else pt.cp2 = pos;

            if (!isAlt && pt.cp1 && pt.cp2) {
                const dragged = isCp1 ? pt.cp1 : pt.cp2;
                const vx = dragged.x - pt.x;
                const vy = dragged.y - pt.y;
                const len = Math.hypot(vx, vy);
                if (len > 0.001) {
                    const nx = vx / len;
                    const ny = vy / len;
                    const basePt = baseStroke.points[idx];
                    const baseOther = isCp1 ? basePt.cp2! : basePt.cp1!;
                    const otherLen = Math.hypot(baseOther.x - basePt.x, baseOther.y - basePt.y);
                    const mirror = { x: pt.x - nx * otherLen, y: pt.y - ny * otherLen };
                    if (isCp1) pt.cp2 = mirror;
                    else pt.cp1 = mirror;
                }
            }

            newPoints[idx] = pt;
            newPreviews.set(baseStroke.id, { ...baseStroke, points: newPoints });
            setPreviewStrokes(newPreviews);
            return;
        }

        selection.forEach(sel => {
            const baseStroke = initialStrokesMap.get(sel.strokeId);
            if (!baseStroke) return;

            let pointsChanged = false;
            const newPoints = baseStroke.points.map((p, idx) => {
                if (!sel.pointIndices.has(idx)) return p;
                pointsChanged = true;

                let newP = { ...p };
                if (activeBoxHandle) {
                    const b = activeBoxHandle.bounds;
                    const cx = b.x + b.w / 2;
                    const cy = b.y + b.h / 2;
                    const safeW = Math.max(1, b.w);
                    const safeH = Math.max(1, b.h);

                    if (activeBoxHandle.kind.startsWith('scale-')) {
                        const handle = activeBoxHandle.kind.replace('scale-', '');
                        const isCorner = (handle.includes('n') || handle.includes('s')) && (handle.includes('e') || handle.includes('w'));
                        const oppositeX = handle.includes('w') ? b.x + b.w : handle.includes('e') ? b.x : cx;
                        const oppositeY = handle.includes('n') ? b.y + b.h : handle.includes('s') ? b.y : cy;
                        const movingStartX = activeBoxHandle.handlePoint.x;
                        const movingStartY = activeBoxHandle.handlePoint.y;
                        // Ctrl = scale from center, otherwise scale from opposite corner/edge
                        const anchor = isCtrl ? { x: cx, y: cy } : { x: oppositeX, y: oppositeY };

                        const dx0 = movingStartX - anchor.x;
                        const dy0 = movingStartY - anchor.y;
                        const denomX = Math.abs(dx0) < 8 ? (dx0 < 0 ? -8 : 8) : dx0;
                        const denomY = Math.abs(dy0) < 8 ? (dy0 < 0 ? -8 : 8) : dy0;
                        let sx = (effectivePos.x - anchor.x) / denomX;
                        let sy = (effectivePos.y - anchor.y) / denomY;
                        // Side handles: force axis lock
                        if (handle === 'n' || handle === 's') sx = 1;
                        if (handle === 'e' || handle === 'w') sy = 1;
                        if (!Number.isFinite(sx)) sx = 1;
                        if (!Number.isFinite(sy)) sy = 1;
                        sx = Math.max(-8, Math.min(8, sx));
                        sy = Math.max(-8, Math.min(8, sy));
                        // Corners: uniform scale by default; Alt = free non-uniform scale
                        if (isCorner && !isAlt) {
                            const ratioX = Math.abs(effectivePos.x - anchor.x) / Math.max(1, Math.abs(denomX));
                            const ratioY = Math.abs(effectivePos.y - anchor.y) / Math.max(1, Math.abs(denomY));
                            const uni = ratioX >= ratioY ? Math.abs(sx) : Math.abs(sy);
                            sx = Math.sign(sx || 1) * uni;
                            sy = Math.sign(sy || 1) * uni;
                        }

                        // Inline scale with separate sx/sy (scalePoint only supports uniform scale)
                        const applyScale = (pt: Point): Point => ({
                            x: anchor.x + (pt.x - anchor.x) * sx,
                            y: anchor.y + (pt.y - anchor.y) * sy
                        });
                        newP = { ...p, ...applyScale(p) };
                        if (p.cp1) newP.cp1 = applyScale(p.cp1);
                        if (p.cp2) newP.cp2 = applyScale(p.cp2);
                    } else if (activeBoxHandle.kind === 'rotate-ring') {
                        // Default: rotate around bounding box center. Ctrl: rotate around drag start point.
                        const center = isCtrl ? dragStart : (transformCenter || { x: cx, y: cy });
                        const a0 = Math.atan2(startPoint.y - center.y, startPoint.x - center.x);
                        const a1 = Math.atan2(effectivePos.y - center.y, effectivePos.x - center.x);
                        const angle = ((a1 - a0) * 180) / Math.PI;
                        newP = rotatePoint(p, center, angle);
                        if (p.cp1) newP.cp1 = rotatePoint(p.cp1, center, angle);
                        if (p.cp2) newP.cp2 = rotatePoint(p.cp2, center, angle);
                    } else {
                        const origin = isCtrl ? activeBoxHandle.handlePoint : (transformCenter || { x: cx, y: cy });
                        const local = { x: p.x - origin.x, y: p.y - origin.y };
                        let skewX = 0;
                        let skewY = 0;
                        if (activeBoxHandle.kind === 'skew-n' || activeBoxHandle.kind === 'skew-s' || activeBoxHandle.kind === 'skew-nw' || activeBoxHandle.kind === 'skew-ne' || activeBoxHandle.kind === 'skew-sw' || activeBoxHandle.kind === 'skew-se') {
                            skewX = (effectivePos.x - startPoint.x) / safeH;
                        } else {
                            skewY = (effectivePos.y - startPoint.y) / safeW;
                        }
                        if (activeBoxHandle.kind === 'skew-nw' || activeBoxHandle.kind === 'skew-ne' || activeBoxHandle.kind === 'skew-sw' || activeBoxHandle.kind === 'skew-se') {
                            skewY = (effectivePos.y - startPoint.y) / safeW;
                        }
                        newP.x = origin.x + local.x + local.y * skewX;
                        newP.y = origin.y + local.y + local.x * skewY;
                        if (p.cp1) {
                            const c1 = { x: p.cp1.x - origin.x, y: p.cp1.y - origin.y };
                            newP.cp1 = { x: origin.x + c1.x + c1.y * skewX, y: origin.y + c1.y + c1.x * skewY };
                        }
                        if (p.cp2) {
                            const c2 = { x: p.cp2.x - origin.x, y: p.cp2.y - origin.y };
                            newP.cp2 = { x: origin.x + c2.x + c2.y * skewX, y: origin.y + c2.y + c2.x * skewY };
                        }
                    }
                } else {
                    newP = { x: p.x + delta.x, y: p.y + delta.y };
                    if (p.cp1) newP.cp1 = { x: p.cp1.x + delta.x, y: p.cp1.y + delta.y };
                    if (p.cp2) newP.cp2 = { x: p.cp2.x + delta.x, y: p.cp2.y + delta.y };
                }

                return newP;
            });

            if (pointsChanged) newPreviews.set(baseStroke.id, { ...baseStroke, points: newPoints });
        });

        setPreviewStrokes(newPreviews);
    }, [dragStart, selection, initialStrokesMap, centroid, transformCenter, mode, snappingEnabled, strokes, dragAnchor, activeLayerId, crossLayerSnapping, activeBoxHandle]);

    const handleUp = useCallback((onCommit: (strokes: Stroke[]) => void) => {
        setDragStart(null);
        setSnapIndicator(null);
        setDragAnchor(null);
        setActiveBoxHandle(null);

        if (previewStrokes.size > 0) {
            const finalStrokes = strokes.map(s => previewStrokes.get(s.id) || s);
            onCommit(finalStrokes);
            setPreviewStrokes(new Map());
            updateCentroid(selection, finalStrokes);
        }

        if (selection.some(s => s.handleType)) {
            setSelection(prev => prev.map(s => ({ ...s, handleType: undefined })));
        }
    }, [previewStrokes, strokes, selection]);

    const handleBoxSelect = useCallback((box: { start: Point; end: Point }, isShift: boolean) => {
        let newSelection: TransformSelection[] = isShift ? [...selection] : [];
        const xMin = Math.min(box.start.x, box.end.x);
        const xMax = Math.max(box.start.x, box.end.x);
        const yMin = Math.min(box.start.y, box.end.y);
        const yMax = Math.max(box.start.y, box.end.y);

        selectableStrokes.forEach(s => {
            const indices = new Set<number>();
            s.points.forEach((p, idx) => {
                if (p.x >= xMin && p.x <= xMax && p.y >= yMin && p.y <= yMax) indices.add(idx);
            });
            if (indices.size > 0) {
                const existingIdx = newSelection.findIndex(sel => sel.strokeId === s.id);
                if (existingIdx !== -1) indices.forEach(i => newSelection[existingIdx].pointIndices.add(i));
                else newSelection.push({ strokeId: s.id, pointIndices: indices });
            }
        });

        newSelection = expandLinkedFillSelection(newSelection);
        setSelection(newSelection);
        updateCentroid(newSelection, strokes);
    }, [strokes, selectableStrokes, selection]);

    const handleDoubleClick = useCallback((pos: Point) => {
        const POINT_RADIUS = 12;
        for (let i = selectableStrokes.length - 1; i >= 0; i--) {
            const stroke = selectableStrokes[i];
            if (!strokeBoundsHit(stroke, pos, POINT_RADIUS + 5)) continue;
            for (let idx = 0; idx < stroke.points.length; idx++) {
                if (distance(stroke.points[idx], pos) < POINT_RADIUS) {
                    setSelection([{ strokeId: stroke.id, pointIndices: new Set([idx]) }]);
                    updateCentroid([{ strokeId: stroke.id, pointIndices: new Set([idx]) }], strokes);
                    return;
                }
            }
        }
        setSelection([]);
        setCentroid(null);
    }, [strokes, selectableStrokes]);

    return {
        selection,
        previewStrokes,
        handleDown,
        handleMove,
        handleUp,
        handleBoxSelect,
        handleDoubleClick,
        centroid,
        snapIndicator,
        getSelectionBounds
    };
};
