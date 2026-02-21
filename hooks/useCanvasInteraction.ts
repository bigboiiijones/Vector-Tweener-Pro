
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Point, ToolType, Keyframe, Stroke, ToolOptions, TransformMode, CameraTransform, ViewportTransform } from '../types';
import { getMousePos } from '../utils/domUtils';
import { distance, getRectPoints, getCirclePoints, getTrianglePoints, getStarPoints, simplifyPath, createThreePointCubicStroke } from '../utils/mathUtils';
import { calculateSelection } from '../utils/selectionUtils';
import { getSnappedPoint } from '../logic/snapping';
import { useTransformTool } from './useTransformTool';
import { findPaintTarget } from '../logic/paintBucket';
import { postProcessTransformedStrokes } from '../logic/transformPostprocess';



const ADD_POINT_HANDLE_FACTOR = 0.32;
const ENDPOINT_HANDLE_FACTOR = 0.08;
const MAX_ADD_POINT_HANDLE = 120;
const MAX_ENDPOINT_HANDLE = 18;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const normalize = (x: number, y: number): { x: number; y: number } => {
    const len = Math.hypot(x, y);
    if (len < 0.001) return { x: 0, y: 0 };
    return { x: x / len, y: y / len };
};

const withAutoBezierForAddPoints = (
    points: Point[],
    sharpPointIndices: Set<number>,
    closedHint: boolean = false
): Point[] => {
    if (points.length < 2) return points.map(p => ({ x: p.x, y: p.y }));

    const isClosed = closedHint || (points.length > 2 && distance(points[0], points[points.length - 1]) < 2);
    const hasDuplicatedClosure = isClosed && distance(points[0], points[points.length - 1]) < 2;
    const core = hasDuplicatedClosure ? points.slice(0, -1) : points;
    const shaped = core.map(p => ({ x: p.x, y: p.y }));
    const n = shaped.length;

    const idx = (i: number): number => {
        if (!isClosed) return i;
        return ((i % n) + n) % n;
    };

    const tangentAt = (i: number): { x: number; y: number } => {
        if (isClosed) {
            const prev = shaped[idx(i - 1)];
            const next = shaped[idx(i + 1)];
            return normalize(next.x - prev.x, next.y - prev.y);
        }

        if (i === 0) {
            const next = shaped[1];
            return normalize(next.x - shaped[0].x, next.y - shaped[0].y);
        }

        if (i === n - 1) {
            const prev = shaped[n - 2];
            return normalize(shaped[n - 1].x - prev.x, shaped[n - 1].y - prev.y);
        }

        const prev = shaped[i - 1];
        const next = shaped[i + 1];
        return normalize(next.x - prev.x, next.y - prev.y);
    };

    const tangents = shaped.map((_, i) => tangentAt(i));

    for (let i = 0; i < n - 1 + (isClosed ? 1 : 0); i++) {
        const aIdx = idx(i);
        const bIdx = idx(i + 1);
        if (aIdx === bIdx) continue;

        const a = shaped[aIdx];
        const b = shaped[bIdx];
        const segLen = distance(a, b);
        if (segLen < 0.001) continue;

        const fromEndpoint = !isClosed && (aIdx === 0 || aIdx === n - 1);
        const toEndpoint = !isClosed && (bIdx === 0 || bIdx === n - 1);
        const outHandleLen = clamp(segLen * (fromEndpoint ? ENDPOINT_HANDLE_FACTOR : ADD_POINT_HANDLE_FACTOR), 0, fromEndpoint ? MAX_ENDPOINT_HANDLE : MAX_ADD_POINT_HANDLE);
        const inHandleLen = clamp(segLen * (toEndpoint ? ENDPOINT_HANDLE_FACTOR : ADD_POINT_HANDLE_FACTOR), 0, toEndpoint ? MAX_ENDPOINT_HANDLE : MAX_ADD_POINT_HANDLE);

        if (!sharpPointIndices.has(aIdx)) {
            const t = tangents[aIdx];
            a.cp2 = { x: a.x + t.x * outHandleLen, y: a.y + t.y * outHandleLen };
        }

        if (!sharpPointIndices.has(bIdx)) {
            const t = tangents[bIdx];
            b.cp1 = { x: b.x - t.x * inHandleLen, y: b.y - t.y * inHandleLen };
        }
    }

    shaped.forEach((pt, i) => {
        if (sharpPointIndices.has(i)) {
            pt.cp1 = undefined;
            pt.cp2 = undefined;
        }
    });

    if (!isClosed) return shaped;

    const first = shaped[0];
    const closing: Point = {
        x: first.x,
        y: first.y,
        cp1: first.cp1 ? { ...first.cp1 } : undefined
    };

    return [...shaped, closing];
};

interface InteractionProps {
    currentTool: ToolType;
    currentFrameIndex: number;
    activeKeyframe?: Keyframe;
    prevContext: Keyframe;
    nextContext: Keyframe;
    displayedStrokes: Stroke[];
    addKeyframe: (idx: number, copy?: boolean) => void; // Updated signature
    addCameraKeyframe: (idx: number, t: CameraTransform) => void;
    commitStroke: (points: Point[], tool: ToolType, idx: number, linked: string[], opts: ToolOptions, layerId: string, isClosed?: boolean) => string | undefined;
    selectedStrokeIds: Set<string>;
    setSelectedStrokeIds: (s: Set<string>) => void;
    corresSelection: Set<string>;
    setCorresSelection: (s: Set<string>) => void;
    setSelectionBox: (box: { start: Point; end: Point } | null) => void;
    selectionBox: { start: Point; end: Point } | null;
    svgRef: React.RefObject<SVGSVGElement | null>;
    toolOptions: ToolOptions;
    updateStrokes: (strokes: Stroke[]) => void;
    activeLayerId: string;
    visibleLayerIds: Set<string>;
    currentCameraTransform: CameraTransform;
    onUpdateCameraTemp: (t: CameraTransform | null) => void;
    tempCameraTransform: CameraTransform | null; // Added prop
    viewport: ViewportTransform;
    setViewport: (v: ViewportTransform) => void;
    onStrokeUpdate?: (strokeId: string, updates: Partial<Stroke>) => void;
    onDeleteStroke?: (strokeId: string) => void;
    onCreateFillStroke?: (points: Point[], sourceIds?: string[]) => void;
}

export const useCanvasInteraction = ({
    currentTool,
    currentFrameIndex,
    activeKeyframe,
    prevContext,
    nextContext,
    displayedStrokes,
    addKeyframe,
    addCameraKeyframe,
    commitStroke,
    selectedStrokeIds,
    setSelectedStrokeIds,
    corresSelection,
    setCorresSelection,
    setSelectionBox,
    selectionBox,
    svgRef,
    toolOptions,
    updateStrokes,
    activeLayerId,
    visibleLayerIds,
    currentCameraTransform,
    onUpdateCameraTemp,
    tempCameraTransform, // Destructured
    viewport,
    setViewport,
    onStrokeUpdate,
    onDeleteStroke,
    onCreateFillStroke
}: InteractionProps) => {

    const [isDrawing, setIsDrawing] = useState(false);
    const [currentStroke, setCurrentStroke] = useState<Point[] | null>(null);
    const [pendingPoints, setPendingPoints] = useState<Point[]>([]); 
    const [drawingSnapPoint, setDrawingSnapPoint] = useState<Point | null>(null); // State for snap indicator
    const dragStart = useRef<Point | null>(null);
    const isDragRef = useRef(false);
    
    // Viewport Panning Refs
    const isPanningRef = useRef(false);
    const lastPanPoint = useRef<{x: number, y: number} | null>(null);
    const addPointSharpCornerRef = useRef(false);
    const addPointSharpIndicesRef = useRef<Set<number>>(new Set());

    // Transform Tool Hook
    const { 
        selection: transformSelection, 
        previewStrokes: transformPreviews,
        handleDown: handleTransformDown, 
        handleMove: handleTransformMove, 
        handleUp: handleTransformUp,
        handleBoxSelect,
        handleDoubleClick,
        snapIndicator,
        getSelectionBounds
    } = useTransformTool(
        displayedStrokes, 
        toolOptions.transformMode,
        toolOptions.snappingEnabled,
        activeLayerId,
        toolOptions.crossLayerSnapping,
        toolOptions.transformEditAllLayers,
        toolOptions.bindLinkedFillsOnTransform
    );

    const forceFinishPolyline = () => {
        if (pendingPoints.length > 1) {
            const commitTool = currentTool === ToolType.ADD_POINTS ? ToolType.ADD_POINTS : currentTool;
            commitStroke(pendingPoints, commitTool, currentFrameIndex, [], toolOptions, activeLayerId);
            setPendingPoints([]);
            setCurrentStroke(null);
            setIsDrawing(false);
            setDrawingSnapPoint(null);
            addPointSharpIndicesRef.current.clear();
        }
    };



    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key.toLowerCase() === 'x') {
                addPointSharpCornerRef.current = true;
            }
        };
        const onKeyUp = (event: KeyboardEvent) => {
            if (event.key.toLowerCase() === 'x') {
                addPointSharpCornerRef.current = false;
            }
        };
        const onBlur = () => {
            addPointSharpCornerRef.current = false;
        };

        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        window.addEventListener('blur', onBlur);

        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
            window.removeEventListener('blur', onBlur);
        };
    }, []);

    const resetInteraction = () => {
        setIsDrawing(false);
        setCurrentStroke(null);
        setPendingPoints([]);
        setSelectionBox(null);
        setDrawingSnapPoint(null);
        addPointSharpIndicesRef.current.clear();
        isDragRef.current = false;
        dragStart.current = null;
        onUpdateCameraTemp(null);
        isPanningRef.current = false;
    };

    const handleWheel = (e: React.WheelEvent) => {
        const zoomFactor = 1.05;
        const delta = e.deltaY > 0 ? 1 / zoomFactor : zoomFactor;
        
        const newZoom = Math.min(Math.max(viewport.zoom * delta, 0.1), 10);
        
        const rect = e.currentTarget.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const newX = mouseX - (mouseX - viewport.x) * (newZoom / viewport.zoom);
        const newY = mouseY - (mouseY - viewport.y) * (newZoom / viewport.zoom);

        setViewport({
            zoom: newZoom,
            x: newX,
            y: newY
        });
    };

    const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
        // Middle Mouse Panning (Universal)
        const isMiddleClick = 'button' in e && e.button === 1;
        
        if (isMiddleClick) {
            e.preventDefault();
            isPanningRef.current = true;
            const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
            const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
            lastPanPoint.current = { x: clientX, y: clientY };
            return;
        }

        const pos = getMousePos(e, svgRef.current);
        const snappedPos = toolOptions.snappingEnabled 
            ? getSnappedPoint(pos, displayedStrokes, true, activeLayerId, toolOptions.crossLayerSnapping) 
            : pos;
        
        const isShift = e.shiftKey;
        const isCtrl = e.ctrlKey || e.metaKey;

        // Clear selection if drawing new shape/line (unless holding shift)
        if (!isShift && [ToolType.PEN, ToolType.POLYLINE, ToolType.CURVE, ToolType.ADD_POINTS, ToolType.RECTANGLE, ToolType.CIRCLE, ToolType.TRIANGLE, ToolType.STAR].includes(currentTool)) {
            setSelectedStrokeIds(new Set());
        }

        // Camera Pan Tool
        if (currentTool === ToolType.CAMERA_PAN) {
            if (!activeKeyframe) addCameraKeyframe(currentFrameIndex, currentCameraTransform);
            dragStart.current = { x: 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX, y: 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY };
            setIsDrawing(true); 
            return;
        }

        // Paint Bucket Tool
        if (currentTool === ToolType.PAINT_BUCKET) {
            const basePool = toolOptions.crossLayerPainting ? displayedStrokes : displayedStrokes.filter(s => s.layerId === activeLayerId);
            const paintPool = toolOptions.paintBucketMode === 'FILL'
                ? basePool.filter(s => !(((s.width || 0) <= 0) && (!s.color || s.color === 'transparent')))
                : basePool;
            const paintHit = findPaintTarget(pos, paintPool, toolOptions.gapClosingDistance, viewport.zoom);

            if (paintHit) {
                if (toolOptions.paintBucketMode === 'ERASE') {
                    if (paintHit.kind === 'STROKE' && paintHit.stroke) {
                        const isFillOnly = (paintHit.stroke.width || 0) <= 0 && (!paintHit.stroke.color || paintHit.stroke.color === 'transparent');
                        if (isFillOnly) {
                            onDeleteStroke?.(paintHit.stroke.id);
                        } else if (onStrokeUpdate) {
                            onStrokeUpdate(paintHit.stroke.id, { fillColor: undefined });
                        }
                    }
                } else if (paintHit.kind === 'STROKE' && paintHit.stroke && onStrokeUpdate) {
                    onStrokeUpdate(paintHit.stroke.id, {
                        fillColor: toolOptions.defaultFillColor,
                        isClosed: true
                    });
                } else if (paintHit.kind === 'LOOP' && paintHit.loopPoints) {
                    onCreateFillStroke?.(paintHit.loopPoints, paintHit.sourceStrokeIds);
                }
            }
            return;
        }

        if (currentTool === ToolType.TRANSFORM) {
            if (handleTransformDown(pos, isShift)) {
                setIsDrawing(true); 
                return;
            } else {
                 dragStart.current = pos;
                 isDragRef.current = false;
                 setSelectionBox({ start: pos, end: pos });
                 return;
            }
        }

        if (currentTool === ToolType.SELECT || currentTool === ToolType.BIND || currentTool === ToolType.CORRESPONDENCE) {
            dragStart.current = pos;
            isDragRef.current = false;
            setSelectionBox({ start: pos, end: pos });
            return;
        }

        // --- Drawing Tools ---
        setIsDrawing(true);
        // Important: When drawing on a blank frame, do NOT copy previous frame strokes. 
        // Pass false to shouldCopy.
        if (!activeKeyframe) addKeyframe(currentFrameIndex, false);

        if (currentTool === ToolType.PEN) {
            setCurrentStroke([snappedPos]);
        } else if (currentTool === ToolType.POLYLINE || currentTool === ToolType.MOTION_PATH || currentTool === ToolType.ADD_POINTS) {
            if (pendingPoints.length > 2 && distance(snappedPos, pendingPoints[0]) < 15) {
                // Close loop (if near start)
                const finalPoints = [...pendingPoints, pendingPoints[0]];
                const commitTool = currentTool === ToolType.ADD_POINTS ? ToolType.ADD_POINTS : currentTool;
                const pointsToCommit = currentTool === ToolType.ADD_POINTS
                    ? withAutoBezierForAddPoints(finalPoints, addPointSharpIndicesRef.current, true)
                    : finalPoints;
                commitStroke(pointsToCommit, commitTool, currentFrameIndex, [], toolOptions, activeLayerId, true);
                setPendingPoints([]);
                setCurrentStroke(null);
                setIsDrawing(false);
                setDrawingSnapPoint(null);
                addPointSharpIndicesRef.current.clear();
            } else {
                if (currentTool === ToolType.ADD_POINTS) {
                    const sharpCorner = e.altKey || addPointSharpCornerRef.current;
                    const nextIndex = pendingPoints.length;
                    if (sharpCorner) addPointSharpIndicesRef.current.add(nextIndex);
                    else addPointSharpIndicesRef.current.delete(nextIndex);

                    const nextPending = withAutoBezierForAddPoints([...pendingPoints, snappedPos], addPointSharpIndicesRef.current, false);
                    setPendingPoints(nextPending);
                    if (nextPending.length === 1) setCurrentStroke([snappedPos, snappedPos]);
                    else setCurrentStroke(nextPending);
                } else {
                    setPendingPoints(prev => [...prev, snappedPos]);
                    // Initialize line preview immediately
                    if (pendingPoints.length === 0) setCurrentStroke([snappedPos, snappedPos]);
                }
            }
        } else if (currentTool === ToolType.CURVE) {
            if (pendingPoints.length === 0) {
                // Phase 1 Start: Click and Drag for Line (Start Point)
                dragStart.current = snappedPos;
                setCurrentStroke([snappedPos, snappedPos]);
            } else if (pendingPoints.length === 2) {
                // Phase 2 Start: Click and Drag for Bend (Middle Point)
                const curve = createThreePointCubicStroke(pendingPoints[0], snappedPos, pendingPoints[1]);
                setCurrentStroke(curve);
            }
        } else {
            // Shapes (Rectangle, Circle, etc.)
            dragStart.current = snappedPos;
            setCurrentStroke([snappedPos]);
        }
    };

    const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
        const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

        // Middle Mouse Panning (Universal)
        if (isPanningRef.current && lastPanPoint.current) {
            const dx = clientX - lastPanPoint.current.x;
            const dy = clientY - lastPanPoint.current.y;
            
            setViewport({
                ...viewport,
                x: viewport.x + dx,
                y: viewport.y + dy
            });
            
            lastPanPoint.current = { x: clientX, y: clientY };
            return;
        }

        const pos = getMousePos(e, svgRef.current);
        // Prevent generic snapping visual when using Transform tool, as it handles its own snapping
        const shouldSnap = toolOptions.snappingEnabled 
            && currentTool !== ToolType.SELECT 
            && currentTool !== ToolType.BIND 
            && currentTool !== ToolType.CAMERA_PAN 
            && currentTool !== ToolType.CORRESPONDENCE
            && currentTool !== ToolType.TRANSFORM;

        const snappedPos = shouldSnap 
            ? getSnappedPoint(pos, displayedStrokes, true, activeLayerId, toolOptions.crossLayerSnapping) 
            : pos;

        if (shouldSnap && (snappedPos.x !== pos.x || snappedPos.y !== pos.y)) {
             setDrawingSnapPoint(snappedPos);
        } else {
             setDrawingSnapPoint(null);
        }

        if (currentTool === ToolType.CAMERA_PAN && isDrawing && dragStart.current) {
             const dx = (clientX - dragStart.current.x) / viewport.zoom; 
             const dy = (clientY - dragStart.current.y) / viewport.zoom;
             const isZooming = e.ctrlKey || e.metaKey;

             if (isZooming) {
                 const zoomDelta = dy * 0.01;
                 const newZoom = Math.max(0.1, currentCameraTransform.zoom + zoomDelta);
                 onUpdateCameraTemp({ ...currentCameraTransform, zoom: newZoom });
             } else {
                 // Invert dx/dy to make camera move in direction of drag (like moving a viewport frame)
                 onUpdateCameraTemp({
                     ...currentCameraTransform,
                     x: currentCameraTransform.x + dx,
                     y: currentCameraTransform.y + dy
                 });
             }
             dragStart.current = { x: clientX, y: clientY };
             return;
        }

        if (currentTool === ToolType.TRANSFORM && isDrawing) {
            handleTransformMove(pos, e.altKey, e.ctrlKey || e.metaKey);
            return;
        }

        if (selectionBox) {
            setSelectionBox({ ...selectionBox, end: pos });
            if (dragStart.current && distance(dragStart.current, pos) > 5) {
                isDragRef.current = true;
            }
            return;
        }

        if (currentTool === ToolType.CURVE) {
            if (isDrawing && pendingPoints.length === 0 && dragStart.current) {
                // Phase 1 Drag: Preview Straight Line
                setCurrentStroke([dragStart.current, snappedPos]);
            } else if (pendingPoints.length === 2) {
                // Phase 2 Drag or Hover: Preview Curve
                // If dragging (isDrawing) OR just hovering (Paint style), update curve
                const curve = createThreePointCubicStroke(pendingPoints[0], snappedPos, pendingPoints[1]);
                setCurrentStroke(curve);
            }
        }

        if (!isDrawing && pendingPoints.length === 0) return;

        // Visual Preview updates for other tools
        if (currentTool === ToolType.PEN) {
             if (currentStroke) setCurrentStroke([...currentStroke, snappedPos]);
        } else if (currentTool === ToolType.POLYLINE || currentTool === ToolType.MOTION_PATH || currentTool === ToolType.ADD_POINTS) {
             if (pendingPoints.length > 0) {
                 if (currentTool === ToolType.ADD_POINTS) {
                     const sharpCorner = e.altKey || addPointSharpCornerRef.current;
                     const previewSharpIndices = new Set(addPointSharpIndicesRef.current);
                     const previewIndex = pendingPoints.length;
                     if (sharpCorner) previewSharpIndices.add(previewIndex);
                     else previewSharpIndices.delete(previewIndex);
                     setCurrentStroke(withAutoBezierForAddPoints([...pendingPoints, snappedPos], previewSharpIndices, false));
                 } else {
                     // Polyline preview must show ALL points + current snap
                     setCurrentStroke([...pendingPoints, snappedPos]);
                 }
             }
        } else if (dragStart.current) {
             // Shapes
             const start = dragStart.current;
             if (currentTool === ToolType.RECTANGLE) setCurrentStroke(getRectPoints(start, snappedPos));
             else if (currentTool === ToolType.CIRCLE) setCurrentStroke(getCirclePoints(start, snappedPos));
             else if (currentTool === ToolType.TRIANGLE) setCurrentStroke(getTrianglePoints(start, snappedPos));
             else if (currentTool === ToolType.STAR) setCurrentStroke(getStarPoints(start, snappedPos));
        }
    };

    const handlePointerUp = (e: React.MouseEvent | React.TouchEvent) => {
        if (isPanningRef.current) {
            isPanningRef.current = false;
            lastPanPoint.current = null;
            return;
        }

        if (currentTool === ToolType.CAMERA_PAN) {
            if (isDrawing) {
                if (tempCameraTransform) {
                     addCameraKeyframe(currentFrameIndex, tempCameraTransform);
                }
                onUpdateCameraTemp(null);
                setIsDrawing(false);
            }
            return;
        }

        if (currentTool === ToolType.TRANSFORM) {
             if (isDrawing) {
                 handleTransformUp((modifiedStrokes) => {
                     const postProcessed = postProcessTransformedStrokes(modifiedStrokes, {
                         autoClose: toolOptions.autoClose,
                         autoMerge: toolOptions.autoMerge,
                         bezierAdaptive: toolOptions.bezierAdaptive,
                         closeCreatesFill: toolOptions.closeCreatesFill,
                         fillColor: toolOptions.defaultFillColor,
                         closeThreshold: Math.max(2, toolOptions.gapClosingDistance / Math.max(0.2, viewport.zoom))
                     });
                     updateStrokes(postProcessed);
                 });
                 setIsDrawing(false);
             } else if (selectionBox) {
                 handleBoxSelect(selectionBox, e.shiftKey);
                 setSelectionBox(null);
                 dragStart.current = null;
             } else if (!isDragRef.current) {
                 const pos = getMousePos(e, svgRef.current);
                 if (e.detail === 2) {
                     handleDoubleClick(pos);
                 }
             }
             return;
        }

        if (selectionBox) {
             if (dragStart.current) {
                const isShift = e.shiftKey;
                const context = { activeKeyframe, prevContext, nextContext, displayedStrokes };
                const newSel = calculateSelection(selectionBox, currentTool, isShift, currentTool === ToolType.CORRESPONDENCE ? corresSelection : selectedStrokeIds, context);
                
                if (currentTool === ToolType.CORRESPONDENCE) setCorresSelection(newSel);
                else setSelectedStrokeIds(newSel);
             }
             setSelectionBox(null);
             dragStart.current = null;
             return;
        }

        const pos = getMousePos(e, svgRef.current);
        const snappedPos = toolOptions.snappingEnabled 
            ? getSnappedPoint(pos, displayedStrokes, true, activeLayerId, toolOptions.crossLayerSnapping) 
            : pos;

        if (currentTool === ToolType.CURVE && isDrawing) {
             if (pendingPoints.length === 0 && dragStart.current) {
                 // Phase 1 End: Commit Line Endpoints
                 // Only if length > minimal
                 if (distance(dragStart.current, snappedPos) > 2) {
                     setPendingPoints([dragStart.current, snappedPos]);
                     // Keep line visible while user prepares for Phase 2
                     setCurrentStroke([dragStart.current, snappedPos]);
                 } else {
                     setCurrentStroke(null);
                 }
                 setIsDrawing(false);
                 dragStart.current = null;
                 return;
             } else if (pendingPoints.length === 2) {
                 // Phase 2 End: Commit Curve
                 const curve = createThreePointCubicStroke(pendingPoints[0], snappedPos, pendingPoints[1]);
                 commitStroke(curve, ToolType.CURVE, currentFrameIndex, [], toolOptions, activeLayerId);
                 setPendingPoints([]);
                 setCurrentStroke(null);
                 setIsDrawing(false);
                 setDrawingSnapPoint(null);
                 return;
             }
        }

        if (!isDrawing && pendingPoints.length === 0) return;

        // Finish Drawing Actions
        if (currentTool === ToolType.PEN) {
            if (currentStroke && currentStroke.length > 1) {
                let finalStroke = currentStroke;
                let isClosed = false;

                // Auto-Close Logic
                if (toolOptions.autoClose) {
                    const start = currentStroke[0];
                    const end = currentStroke[currentStroke.length - 1];
                    if (distance(start, end) < 20 / viewport.zoom) { // 20px threshold
                        finalStroke = [...currentStroke, start];
                        isClosed = true;
                    }
                }

                const simple = simplifyPath(finalStroke, 2); 
                // Pass isClosed to commitStroke (need to update commitStroke signature or handle it inside)
                // Actually commitStroke creates the Stroke object. We should pass options or modify it.
                // commitStroke takes toolOptions. We can modify toolOptions temporarily or update commitStroke.
                // Better: update commitStroke to accept partial stroke properties override.
                
                // For now, let's assume commitStroke uses toolOptions. 
                // But isClosed is a property of the stroke, not just a tool option.
                // The current commitStroke implementation creates a stroke with `isClosed: false` by default for PEN.
                
                // We need to update commitStroke to handle this.
                // OR, we can just manually create the stroke object here if we want full control.
                // But commitStroke handles logic for adding to keyframe.
                
                // Let's modify commitStroke in useKeyframeSystem to accept an override object.
                // But I can't modify useKeyframeSystem right now easily without context switching.
                
                // Workaround: Pass a special "tool" type or modify the stroke after commit?
                // No, commitStroke returns void.
                
                // Let's look at commitStroke in useKeyframeSystem.ts (I viewed it earlier).
                // It takes (points, toolType, frameIndex, ...).
                // It creates `const newStroke: Stroke = { ... isClosed: [RECT, CIRCLE...].includes(toolType) ... }`
                
                // I should update useKeyframeSystem.ts to accept `isClosed` as an optional argument or part of options.
                
                // For now, I will modify useCanvasInteraction to calculate `isClosed` and pass it if I can.
                // If I can't change commitStroke signature easily, I will rely on a hack or update it.
                
                // Let's update commitStroke signature in the next step.
                // For this step, I'll just put the logic here.
                
                commitStroke(simple, ToolType.PEN, currentFrameIndex, [], toolOptions, activeLayerId, isClosed);
            }
            setCurrentStroke(null);
            setIsDrawing(false);
            setDrawingSnapPoint(null);
        } else if (currentTool === ToolType.POLYLINE || currentTool === ToolType.MOTION_PATH || currentTool === ToolType.ADD_POINTS) {
             // Handled on PointerDown mostly, this just keeps drawing state active
        } else {
            // Shapes (Finish on Up)
            if (currentStroke) {
                commitStroke(currentStroke, currentTool, currentFrameIndex, [], toolOptions, activeLayerId);
            }
            setCurrentStroke(null);
            setIsDrawing(false);
            dragStart.current = null;
            setDrawingSnapPoint(null);
            addPointSharpIndicesRef.current.clear();
        }
    };


    const setTransformPointsSharp = useCallback(() => {
        if (transformSelection.length === 0) return;
        const selectionMap = new Map(transformSelection.map(sel => [sel.strokeId, sel.pointIndices]));
        const updated = displayedStrokes.map(stroke => {
            const indices = selectionMap.get(stroke.id);
            if (!indices) return stroke;
            const points = stroke.points.map((pt, idx) => indices.has(idx) ? { x: pt.x, y: pt.y } : pt);
            return { ...stroke, points };
        });
        updateStrokes(updated);
    }, [transformSelection, displayedStrokes, updateStrokes]);

    const setTransformPointsCurve = useCallback(() => {
        if (transformSelection.length === 0) return;
        const selectionMap = new Map(transformSelection.map(sel => [sel.strokeId, sel.pointIndices]));
        const updated = displayedStrokes.map(stroke => {
            const indices = selectionMap.get(stroke.id);
            if (!indices) return stroke;
            const points = stroke.points.map((pt, idx, arr) => {
                if (!indices.has(idx)) return pt;
                const prev = arr[Math.max(0, idx - 1)];
                const next = arr[Math.min(arr.length - 1, idx + 1)];
                const vx = next.x - prev.x;
                const vy = next.y - prev.y;
                const len = Math.hypot(vx, vy);
                if (len < 0.001) {
                    return { ...pt, cp1: { x: pt.x - 20, y: pt.y }, cp2: { x: pt.x + 20, y: pt.y } };
                }
                const nx = vx / len;
                const ny = vy / len;
                const prevDist = Math.hypot(pt.x - prev.x, pt.y - prev.y);
                const nextDist = Math.hypot(next.x - pt.x, next.y - pt.y);
                const handleLen = Math.max(8, Math.min(50, Math.min(prevDist, nextDist) * 0.35));
                return {
                    ...pt,
                    cp1: { x: pt.x - nx * handleLen, y: pt.y - ny * handleLen },
                    cp2: { x: pt.x + nx * handleLen, y: pt.y + ny * handleLen }
                };
            });
            return { ...stroke, points };
        });
        updateStrokes(updated);
    }, [transformSelection, displayedStrokes, updateStrokes]);


    return {
        handlePointerDown,
        handlePointerMove,
        handlePointerUp,
        handleWheel,
        currentStroke,
        pendingPoints,
        forceFinishPolyline,
        resetInteraction,
        transformSelection,
        transformPreviews,
        snapPoint: drawingSnapPoint || snapIndicator, // Return active snap point from either drawing or transform
        transformBounds: getSelectionBounds(),
        setTransformPointsSharp,
        setTransformPointsCurve
    };
};
