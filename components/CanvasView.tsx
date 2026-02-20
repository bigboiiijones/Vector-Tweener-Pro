
import React, { useMemo } from 'react';
import { Keyframe, Stroke, Point, ToolType, GroupBinding, ProjectSettings, CameraTransform, ViewportTransform } from '../types';
import { toPathString } from '../utils/mathUtils';
import { getTaperedPath } from '../utils/strokeUtils';

interface CanvasViewProps {
    width: number;
    height: number;
    strokes: Stroke[];
    guides: Stroke[];
    prevOnion?: Keyframe;
    nextOnion?: Keyframe;
    showOnion: boolean;
    activeKeyframe?: Keyframe;
    currentStroke: Point[] | null;
    currentTool: ToolType;
    selectedStrokeIds: Set<string>;
    pendingPoints: Point[];
    selectionBox: { start: Point; end: Point } | null;
    showCorresOverlay: boolean;
    corresPrev?: Keyframe;
    corresNext?: Keyframe;
    corresSelection: Set<string>;
    groupBindings: GroupBinding[];
    tempConnectionLine: { start: Point; end: Point } | null;
    showBezierHandles: boolean;
    transformSelection: any[]; 
    transformPreviews: Map<string, Stroke>; 
    snapPoint: Point | null; 
    onPointerDown: (e: React.MouseEvent | React.TouchEvent) => void;
    onPointerMove: (e: React.MouseEvent | React.TouchEvent) => void;
    onPointerUp: (e: React.MouseEvent | React.TouchEvent) => void;
    onWheel?: (e: React.WheelEvent) => void; // Added onWheel prop
    svgRef: React.RefObject<SVGSVGElement | null>;
    visibleLayerIds: Set<string>;
    projectSettings: ProjectSettings;
    cameraTransform: CameraTransform;
    viewport: ViewportTransform;
    toolOptions: any; // Add this prop
}

// -- Sub-Component for Individual Stroke Rendering --
const MemoizedStroke = React.memo(({ 
    stroke, 
    isSelected, 
    isTransforming, 
    transformIndices, 
    showBezierHandles, 
    currentTool, 
    activeKeyframe, 
    showCorresOverlay 
}: { 
    stroke: Stroke, 
    isSelected: boolean, 
    isTransforming: boolean, 
    transformIndices?: Set<number>, 
    showBezierHandles: boolean, 
    currentTool: ToolType, 
    activeKeyframe?: Keyframe, 
    showCorresOverlay: boolean 
}) => {
    const fill = stroke.isClosed ? (stroke.fillColor || "none") : "none";
    
    // Determine Color
    let strokeColor = stroke.color || "#fbbf24"; 
    if (isSelected || isTransforming) strokeColor = "#3b82f6";
    else if (showCorresOverlay) strokeColor = "#fbbf24"; 
    else if (activeKeyframe) strokeColor = stroke.color || "#e0e0e0"; 
    else strokeColor = stroke.color || "#e0e0e0"; // Default color if not active keyframe

    // Determine Width
    const strokeWidth = stroke.width || 2;
    const effectiveWidth = isSelected ? strokeWidth + 1 : strokeWidth;

    // Tapering Check
    const hasTaper = (stroke.taperStart && stroke.taperStart > 0) || (stroke.taperEnd && stroke.taperEnd > 0);

    const startP = stroke.points[0];
    const endP = stroke.points[stroke.points.length - 1];

    return (
        <g>
            {hasTaper ? (
                // Render Tapered Outline (Filled Path)
                <path 
                    d={getTaperedPath(stroke.points, effectiveWidth, stroke.taperStart || 0, stroke.taperEnd || 0, stroke.isClosed)}
                    fill={strokeColor}
                    stroke="none"
                    opacity={activeKeyframe ? 1 : 0.9}
                />
            ) : (
                // Render Standard Stroke
                <path
                    d={toPathString(stroke.points)}
                    fill={fill}
                    stroke={strokeColor}
                    strokeWidth={effectiveWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={activeKeyframe ? 1 : 0.9}
                />
            )}
            
            {/* Visual Direction Indicators */}
            {isSelected && (
                <>
                    <circle cx={startP.x} cy={startP.y} r={4} fill="#22c55e" stroke="white" strokeWidth="1.5" />
                    <circle cx={endP.x} cy={endP.y} r={4} fill="#ef4444" stroke="white" strokeWidth="1.5" />
                </>
            )}

            {/* TRANSFORM MODE: Render Points */}
            {currentTool === ToolType.TRANSFORM && (
                <g>
                    {stroke.points.map((p, idx) => {
                        const isPtSelected = transformIndices ? transformIndices.has(idx) : false;
                        
                        const ptFill = isPtSelected ? "#facc15" : "#ffffff"; 
                        const ptStroke = isPtSelected ? "#ffffff" : "#3b82f6";
                        const ptSize = isPtSelected ? 8 : 6;
                        const offset = ptSize / 2;
                        const strokeWidth = isPtSelected ? 2 : 1;
                        
                        return (
                            <g key={idx}>
                                <rect 
                                    x={p.x - offset} y={p.y - offset} width={ptSize} height={ptSize} 
                                    fill={ptFill} 
                                    stroke={ptStroke} strokeWidth={strokeWidth}
                                />
                                {showBezierHandles && isPtSelected && (
                                    <>
                                        {p.cp1 && (
                                            <>
                                                <line x1={p.x} y1={p.y} x2={p.cp1.x} y2={p.cp1.y} stroke="#888" strokeWidth="1" />
                                                <circle cx={p.cp1.x} cy={p.cp1.y} r={3} fill="#ccc" stroke="#888" strokeWidth="1" />
                                            </>
                                        )}
                                        {p.cp2 && (
                                            <>
                                                <line x1={p.x} y1={p.y} x2={p.cp2.x} y2={p.cp2.y} stroke="#888" strokeWidth="1" />
                                                <circle cx={p.cp2.x} cy={p.cp2.y} r={3} fill="#ccc" stroke="#888" strokeWidth="1" />
                                            </>
                                        )}
                                    </>
                                )}
                            </g>
                        );
                    })}
                </g>
            )}
        </g>
    );
}, (prev, next) => {
    return (
        prev.stroke === next.stroke && 
        prev.isSelected === next.isSelected && 
        prev.isTransforming === next.isTransforming &&
        prev.showBezierHandles === next.showBezierHandles &&
        prev.currentTool === next.currentTool &&
        prev.activeKeyframe === next.activeKeyframe &&
        prev.showCorresOverlay === next.showCorresOverlay &&
        prev.transformIndices === next.transformIndices 
    );
});


export const CanvasView: React.FC<CanvasViewProps> = React.memo(({
    width, // Passed from Project Settings
    height,
    strokes,
    guides,
    prevOnion,
    nextOnion,
    showOnion,
    activeKeyframe,
    currentStroke,
    currentTool,
    selectedStrokeIds,
    pendingPoints,
    selectionBox,
    showCorresOverlay,
    corresPrev,
    corresNext,
    corresSelection,
    groupBindings,
    tempConnectionLine,
    showBezierHandles,
    transformSelection,
    transformPreviews,
    snapPoint, 
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onWheel,
    svgRef,
    visibleLayerIds,
    projectSettings,
    cameraTransform,
    viewport,
    toolOptions // Add this prop
}) => {
    
    // Filter visible strokes
    const visibleStrokes = useMemo(() => {
        return strokes.filter(s => visibleLayerIds.has(s.layerId));
    }, [strokes, visibleLayerIds]);

    const displayStrokes = useMemo(() => {
        if (!transformPreviews || transformPreviews.size === 0) return visibleStrokes;
        return visibleStrokes.map(s => transformPreviews.has(s.id) ? transformPreviews.get(s.id)! : s);
    }, [visibleStrokes, transformPreviews]);

    const transformIndicesMap = useMemo(() => {
        const map = new Map<string, Set<number>>();
        if (transformSelection) {
            transformSelection.forEach((sel: any) => {
                map.set(sel.strokeId, sel.pointIndices);
            });
        }
        return map;
    }, [transformSelection]);

    const transformBox = useMemo(() => {
        if (!transformSelection || transformSelection.length === 0) return null;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let count = 0;

        transformSelection.forEach((sel: any) => {
            const s = displayStrokes.find(str => str.id === sel.strokeId);
            if (s) {
                sel.pointIndices.forEach((idx: number) => {
                    const p = s.points[idx];
                    if (p.x < minX) minX = p.x;
                    if (p.x > maxX) maxX = p.x;
                    if (p.y < minY) minY = p.y;
                    if (p.y > maxY) maxY = p.y;
                    count++;
                });
            }
        });

        if (count < 2) return null; 
        return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }, [transformSelection, displayStrokes]);

    // Calculate Camera Box position relative to Canvas
    // Camera Transform (x, y) is the center of the camera view
    const camW = projectSettings.cameraResolution.width;
    const camH = projectSettings.cameraResolution.height;
    // Default Camera Center is usually center of canvas (w/2, h/2) PLUS the transform offset
    const canvasCenterX = width / 2;
    const canvasCenterY = height / 2;
    
    const camX = (canvasCenterX + cameraTransform.x) - (camW * cameraTransform.zoom) / 2;
    const camY = (canvasCenterY + cameraTransform.y) - (camH * cameraTransform.zoom) / 2;
    const scaledCamW = camW * cameraTransform.zoom;
    const scaledCamH = camH * cameraTransform.zoom;

    const bgColor = projectSettings.canvasTransparent ? 'transparent' : projectSettings.canvasColor;

    return (
        <div 
            className="w-full h-full cursor-crosshair relative overflow-hidden bg-[#101010]"
            onMouseDown={onPointerDown}
            onMouseMove={onPointerMove}
            onMouseUp={onPointerUp}
            onTouchStart={onPointerDown}
            onTouchMove={onPointerMove}
            onTouchEnd={onPointerUp}
            onWheel={onWheel}
        >
            <svg 
                ref={svgRef}
                width={width}
                height={height}
                viewBox={`0 0 ${width} ${height}`}
                className="pointer-events-none shadow-2xl absolute top-0 left-0" 
                style={{ 
                    touchAction: 'none',
                    shapeRendering: projectSettings.antiAliasing ? 'geometricPrecision' : 'optimizeSpeed',
                    // Apply Viewport Transform here
                    transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
                    transformOrigin: '0 0',
                    backgroundColor: bgColor
                }}
            >
                <defs>
                    <pattern id="grid" width={projectSettings.gridSize} height={projectSettings.gridSize} patternUnits="userSpaceOnUse">
                        <path d={`M ${projectSettings.gridSize} 0 L 0 0 0 ${projectSettings.gridSize}`} fill="none" stroke="#333" strokeWidth="1" strokeOpacity={projectSettings.gridOpacity}/>
                    </pattern>
                </defs>
                
                {projectSettings.showGrid && (
                    <rect width="100%" height="100%" fill="url(#grid)" pointerEvents="none" />
                )}
                
                {/* Canvas Border (Drawing Limit) */}
                <rect 
                    x="1" y="1" 
                    width={width - 2} height={height - 2} 
                    fill="none" 
                    stroke="#444" 
                    strokeWidth="2" 
                    strokeDasharray="10, 5"
                />

                {/* Camera View Border */}
                {projectSettings.showCameraOverlay && (
                    <g transform={`rotate(${cameraTransform.rotation}, ${camX + scaledCamW/2}, ${camY + scaledCamH/2})`}>
                        <rect 
                            x={camX} y={camY}
                            width={scaledCamW} height={scaledCamH}
                            fill="none"
                            stroke={projectSettings.cameraOverlayColor}
                            strokeWidth="3"
                        />
                        {/* Camera Label */}
                        <text x={camX + 5} y={camY + 20} fill={projectSettings.cameraOverlayColor} fontSize="14" fontWeight="bold">CAMERA</text>
                        
                        {/* Darken area outside camera (Simple approximation using 4 rects or a mask) */}
                        <path 
                            d={`M -5000 -5000 L ${width+5000} -5000 L ${width+5000} ${height+5000} L -5000 ${height+5000} Z M ${camX} ${camY} L ${camX} ${camY+scaledCamH} L ${camX+scaledCamW} ${camY+scaledCamH} L ${camX+scaledCamW} ${camY} Z`}
                            fill={projectSettings.cameraOverlayColor}
                            fillOpacity={projectSettings.cameraOverlayOpacity}
                            fillRule="evenodd"
                        />
                    </g>
                )}

                {/* Onion Skins (Filtered by visibility too if strict, but maybe helpful reference) */}
                {showOnion && prevOnion && prevOnion.strokes.filter(s => visibleLayerIds.has(s.layerId)).map((s, i) => (
                    <g key={`onion-prev-${s.id}`}>
                        <path d={toPathString(s.points)} fill="none" stroke="rgba(0, 255, 0, 0.15)" strokeWidth="4" />
                        <path d={toPathString(s.points)} fill="none" stroke="rgba(0, 255, 0, 0.4)" strokeWidth="1" strokeDasharray="2,2" />
                    </g>
                ))}
                {showOnion && nextOnion && nextOnion.strokes.filter(s => visibleLayerIds.has(s.layerId)).map(s => (
                     <path key={`onion-next-${s.id}`} d={toPathString(s.points)} fill="none" stroke="rgba(255, 0, 0, 0.15)" strokeWidth="2" />
                ))}

                {/* Correspondence Overlay */}
                {showCorresOverlay && corresPrev && corresNext && (
                    <>
                        {corresPrev.strokes.filter(s => visibleLayerIds.has(s.layerId)).map(s => (
                            <path 
                                key={`corres-green-${s.id}`} 
                                d={toPathString(s.points)} 
                                fill="none" 
                                stroke={corresSelection.has(s.id) ? "#ffffff" : "#22c55e"} 
                                strokeWidth={corresSelection.has(s.id) ? 3 : 2} 
                                opacity={corresSelection.has(s.id) ? 1 : 0.4}
                            />
                        ))}
                        {corresNext.strokes.filter(s => visibleLayerIds.has(s.layerId)).map(s => (
                             <path 
                                key={`corres-red-${s.id}`} 
                                d={toPathString(s.points)} 
                                fill="none" 
                                stroke={corresSelection.has(s.id) ? "#ffffff" : "#ef4444"} 
                                strokeWidth={corresSelection.has(s.id) ? 3 : 2} 
                                opacity={corresSelection.has(s.id) ? 1 : 0.4}
                            />
                        ))}
                    </>
                )}

                {/* Main Strokes Rendered via Memoized Component */}
                {displayStrokes.map((stroke) => {
                    const isSelected = selectedStrokeIds.has(stroke.id) || (showCorresOverlay && corresSelection.has(stroke.id));
                    const transformIndices = transformIndicesMap.get(stroke.id);
                    const isTransforming = transformIndices !== undefined;

                    return (
                        <MemoizedStroke 
                            key={stroke.id}
                            stroke={stroke}
                            isSelected={isSelected}
                            isTransforming={isTransforming}
                            transformIndices={transformIndices}
                            showBezierHandles={showBezierHandles}
                            currentTool={currentTool}
                            activeKeyframe={activeKeyframe}
                            showCorresOverlay={showCorresOverlay}
                            toolOptions={toolOptions} // Pass tool options
                        />
                    );
                })}

                {/* Transform Bounding Box */}
                {transformBox && currentTool === ToolType.TRANSFORM && (
                    <rect 
                        x={transformBox.x - 5} 
                        y={transformBox.y - 5} 
                        width={transformBox.w + 10} 
                        height={transformBox.h + 10} 
                        fill="none"
                        stroke="#3b82f6" 
                        strokeWidth="1" 
                        strokeDasharray="4"
                    />
                )}

                {/* Connection Line */}
                {tempConnectionLine && (
                    <line 
                        x1={tempConnectionLine.start.x} y1={tempConnectionLine.start.y}
                        x2={tempConnectionLine.end.x} y2={tempConnectionLine.end.y}
                        stroke="#0ea5e9"
                        strokeWidth="2"
                        strokeDasharray="5,5"
                    />
                )}

                {/* Live Preview */}
                {currentStroke && (
                    <MemoizedStroke 
                        stroke={{
                            id: 'preview',
                            layerId: 'preview',
                            points: currentStroke,
                            isSelected: false,
                            color: toolOptions.defaultColor,
                            width: toolOptions.defaultWidth,
                            taperStart: toolOptions.defaultTaperStart,
                            taperEnd: toolOptions.defaultTaperEnd,
                            isClosed: [ToolType.RECTANGLE, ToolType.CIRCLE, ToolType.TRIANGLE, ToolType.STAR].includes(currentTool)
                        }}
                        isSelected={false}
                        isTransforming={false}
                        showBezierHandles={false}
                        currentTool={currentTool}
                        activeKeyframe={activeKeyframe} // Pass active keyframe to ensure opacity is 1
                        showCorresOverlay={false}
                    />
                )}
                
                {/* Pending Points */}
                {pendingPoints.map((p, i) => (
                    <circle key={`pending-${i}`} cx={p.x} cy={p.y} r={3} fill="#ef4444" />
                ))}

                {/* SNAP / CLING INDICATOR */}
                {snapPoint && (
                    <g pointerEvents="none">
                        <circle cx={snapPoint.x} cy={snapPoint.y} r={6} fill="none" stroke="#facc15" strokeWidth="2" />
                        <circle cx={snapPoint.x} cy={snapPoint.y} r={2} fill="#facc15" />
                    </g>
                )}

                {/* Selection Box */}
                {selectionBox && (
                    <rect 
                        x={Math.min(selectionBox.start.x, selectionBox.end.x)}
                        y={Math.min(selectionBox.start.y, selectionBox.end.y)}
                        width={Math.abs(selectionBox.end.x - selectionBox.start.x)}
                        height={Math.abs(selectionBox.end.y - selectionBox.start.y)}
                        fill="rgba(59, 130, 246, 0.1)"
                        stroke="#3b82f6"
                        strokeDasharray="4"
                    />
                )}
            </svg>
        </div>
    );
});
