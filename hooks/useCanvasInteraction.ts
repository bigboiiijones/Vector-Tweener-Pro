
import React, { useState, useRef } from 'react';
import { Point, ToolType, Keyframe, Stroke, ToolOptions, TransformMode, CameraTransform, ViewportTransform } from '../types';
import { getMousePos } from '../utils/domUtils';
import { distance, getRectPoints, getCirclePoints, getTrianglePoints, getStarPoints, getQuadraticBezierPoints, simplifyPath, createThreePointCubicStroke, createSmoothCubicStroke } from '../utils/mathUtils';
import { calculateSelection } from '../utils/selectionUtils';
import { getSnappedPoint } from '../logic/snapping';
import { useTransformTool } from './useTransformTool';
import { findPaintTarget } from '../logic/paintBucket';
import { postProcessTransformedStrokes } from '../logic/transformPostprocess';

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
    onStrokeUpdate
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

    // Transform Tool Hook
    const { 
        selection: transformSelection, 
        previewStrokes: transformPreviews,
        handleDown: handleTransformDown, 
        handleMove: handleTransformMove, 
        handleUp: handleTransformUp,
        handleBoxSelect,
        handleDoubleClick,
        snapIndicator
    } = useTransformTool(
        displayedStrokes, 
        toolOptions.transformMode,
        toolOptions.snappingEnabled,
        activeLayerId,
        toolOptions.crossLayerSnapping
    );

    const forceFinishPolyline = () => {
        if (pendingPoints.length > 1) {
            commitStroke(pendingPoints, currentTool, currentFrameIndex, [], toolOptions, activeLayerId);
            setPendingPoints([]);
            setCurrentStroke(null);
            setIsDrawing(false);
            setDrawingSnapPoint(null);
        }
    };

    const resetInteraction = () => {
        setIsDrawing(false);
        setCurrentStroke(null);
        setPendingPoints([]);
        setSelectionBox(null);
        setDrawingSnapPoint(null);
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
        if (!isShift && [ToolType.PEN, ToolType.POLYLINE, ToolType.CURVE, ToolType.RECTANGLE, ToolType.CIRCLE, ToolType.TRIANGLE, ToolType.STAR].includes(currentTool)) {
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
            const paintPool = toolOptions.crossLayerPainting ? displayedStrokes : displayedStrokes.filter(s => s.layerId === activeLayerId);
            const targetStroke = findPaintTarget(pos, paintPool, toolOptions.gapClosingDistance, viewport.zoom);

            if (targetStroke && onStrokeUpdate) {
                onStrokeUpdate(targetStroke.id, {
                    fillColor: toolOptions.defaultFillColor,
                    isClosed: true 
                });
            }
            return;
        }

        if (currentTool === ToolType.TRANSFORM) {
            if (handleTransformDown(pos, isShift, isCtrl)) {
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
        } else if (currentTool === ToolType.POLYLINE || currentTool === ToolType.MOTION_PATH) {
            if (pendingPoints.length > 2 && distance(snappedPos, pendingPoints[0]) < 15) {
                // Close loop (if near start)
                const finalPoints = [...pendingPoints, pendingPoints[0]];
                commitStroke(finalPoints, currentTool, currentFrameIndex, [], toolOptions, activeLayerId, true);
                setPendingPoints([]);
                setCurrentStroke(null);
                setIsDrawing(false);
                setDrawingSnapPoint(null);
            } else {
                setPendingPoints(prev => [...prev, snappedPos]);
                // Initialize line preview immediately
                if (pendingPoints.length === 0) setCurrentStroke([snappedPos, snappedPos]);
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
            handleTransformMove(pos, e.altKey);
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
        } else if (currentTool === ToolType.POLYLINE || currentTool === ToolType.MOTION_PATH) {
             if (pendingPoints.length > 0) {
                 // Polyline preview must show ALL points + current snap
                 setCurrentStroke([...pendingPoints, snappedPos]);
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
        } else if (currentTool === ToolType.POLYLINE || currentTool === ToolType.MOTION_PATH) {
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
        }
    };

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
        snapPoint: drawingSnapPoint || snapIndicator // Return active snap point from either drawing or transform
    };
};
