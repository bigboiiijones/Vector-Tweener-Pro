
import React, { useEffect, useState } from 'react';
import { ToolType, ToolOptions, TransformMode, ProjectSettings, Stroke } from '../types';
import { Settings2, RefreshCcw, Unlink, ScanLine, ListOrdered, Magnet, Move, RotateCw, Scaling, Spline, Merge, Wand2, Layers, Grid, Palette, PaintBucket, Camera, Video, Eraser } from 'lucide-react';

interface ToolPropertiesPanelProps {
    currentTool: ToolType;
    options: ToolOptions;
    setOptions: (opt: ToolOptions) => void;
    projectSettings: ProjectSettings;
    setProjectSettings: (settings: ProjectSettings) => void;
    selectedStrokeIds: Set<string>;
    updateSelectedStrokes: (updates: Partial<Stroke>) => void;
    firstSelectedStroke?: Stroke;
    hasTransformPointSelection?: boolean;
    onSetTransformPointsSharp?: () => void;
    onSetTransformPointsCurve?: () => void;
}

export const ToolPropertiesPanel: React.FC<ToolPropertiesPanelProps> = React.memo(({
    currentTool,
    options,
    setOptions,
    projectSettings,
    setProjectSettings,
    selectedStrokeIds,
    updateSelectedStrokes,
    firstSelectedStroke,
    hasTransformPointSelection = false,
    onSetTransformPointsSharp,
    onSetTransformPointsCurve
}) => {
    
    const isDrawTool = [ToolType.PEN, ToolType.POLYLINE, ToolType.CURVE, ToolType.ADD_POINTS, ToolType.RECTANGLE, ToolType.CIRCLE, ToolType.TRIANGLE, ToolType.STAR].includes(currentTool);
    const isTransformTool = currentTool === ToolType.TRANSFORM;
    const isPaintTool = currentTool === ToolType.PAINT_BUCKET;
    const hasSelection = selectedStrokeIds.size > 0;

    const toValidHexColor = (color: string | undefined, fallback: string) => {
        if (!color) return fallback;
        return /^#[0-9a-fA-F]{6}$/.test(color) ? color : fallback;
    };

    // Local state for selection properties to avoid jitter
    const [selColor, setSelColor] = useState(options.defaultColor);
    const [selWidth, setSelWidth] = useState(options.defaultWidth);
    const [selTaperStart, setSelTaperStart] = useState(options.defaultTaperStart);
    const [selTaperEnd, setSelTaperEnd] = useState(options.defaultTaperEnd);

    // Sync local state when selection changes
    useEffect(() => {
        if (firstSelectedStroke) {
            setSelColor(toValidHexColor(firstSelectedStroke.color, options.defaultColor));
            setSelWidth(firstSelectedStroke.width || options.defaultWidth);
            setSelTaperStart(firstSelectedStroke.taperStart || 0);
            setSelTaperEnd(firstSelectedStroke.taperEnd || 0);
        }
    }, [firstSelectedStroke, options.defaultColor, options.defaultWidth]);

    const handleSelColorChange = (val: string) => {
        setSelColor(val);
        updateSelectedStrokes({ color: val });
    };
    const handleSelWidthChange = (val: number) => {
        setSelWidth(val);
        updateSelectedStrokes({ width: val });
    };
    const handleSelTaperStartChange = (val: number) => {
        setSelTaperStart(val);
        updateSelectedStrokes({ taperStart: val });
    };
    const handleSelTaperEndChange = (val: number) => {
        setSelTaperEnd(val);
        updateSelectedStrokes({ taperEnd: val });
    };

    const toggleOverwrite = () => setOptions({ ...options, overwriteTargets: !options.overwriteTargets });
    const toggleSwap = () => setOptions({ ...options, swapTargets: !options.swapTargets });
    const toggleMatchStrategy = () => setOptions({ 
        ...options, 
        autoMatchStrategy: options.autoMatchStrategy === 'INDEX' ? 'SPATIAL' : 'INDEX' 
    });
    const toggleSnapping = () => setOptions({ ...options, snappingEnabled: !options.snappingEnabled });
    const toggleCrossLayer = () => setOptions({ ...options, crossLayerSnapping: !options.crossLayerSnapping });
    const toggleBezier = () => setOptions({ ...options, showBezierHandles: !options.showBezierHandles });
    const toggleAutoMerge = () => setOptions({ ...options, autoMerge: !options.autoMerge });
    const toggleOptimize = () => setOptions({ ...options, optimizeFreehand: !options.optimizeFreehand });
    const toggleAutoClose = () => setOptions({ ...options, autoClose: !options.autoClose });
    const setGapClosing = (dist: number) => setOptions({ ...options, gapClosingDistance: dist });
    const setFillColor = (color: string) => setOptions({ ...options, defaultFillColor: color });
    const toggleDrawStroke = () => setOptions({ ...options, drawStroke: !options.drawStroke });
    const toggleDrawFill = () => setOptions({ ...options, drawFill: !options.drawFill });
    const toggleBezierAdaptive = () => setOptions({ ...options, bezierAdaptive: !options.bezierAdaptive });
    const toggleCloseCreatesFill = () => setOptions({ ...options, closeCreatesFill: !options.closeCreatesFill });
    const toggleTransformEditAllLayers = () => setOptions({ ...options, transformEditAllLayers: !options.transformEditAllLayers });
    const toggleBindLinkedFillsOnTransform = () => setOptions({ ...options, bindLinkedFillsOnTransform: !options.bindLinkedFillsOnTransform });

    // Canvas Settings Handlers
    const setCanvasColor = (color: string) => setProjectSettings({ ...projectSettings, canvasColor: color });
    const toggleTransparent = () => setProjectSettings({ ...projectSettings, canvasTransparent: !projectSettings.canvasTransparent });
    const toggleGrid = () => setProjectSettings({ ...projectSettings, showGrid: !projectSettings.showGrid });
    const setGridSize = (size: number) => setProjectSettings({ ...projectSettings, gridSize: size });
    const setGridOpacity = (opacity: number) => setProjectSettings({ ...projectSettings, gridOpacity: opacity });
    
    // Camera Overlay Handlers
    const toggleCameraOverlay = () => setProjectSettings({ ...projectSettings, showCameraOverlay: !projectSettings.showCameraOverlay });
    const setCameraOverlayColor = (color: string) => setProjectSettings({ ...projectSettings, cameraOverlayColor: color });
    const setCameraOverlayOpacity = (opacity: number) => setProjectSettings({ ...projectSettings, cameraOverlayOpacity: opacity });

    return (
        <div className="flex flex-col gap-2 bg-gray-800 p-3 rounded-lg shadow-xl border border-gray-700 w-56 pointer-events-auto animate-in fade-in slide-in-from-left-2 max-h-[80vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wider pb-2 border-b border-gray-700 mb-1">
                <Settings2 size={14} />
                <span>Tool Options</span>
            </div>

            <div className="flex flex-col gap-2">
                
                {/* SELECTION PROPERTIES (Override if selection exists) */}
                {hasSelection && (
                    <div className="flex flex-col gap-2 p-2 bg-blue-900/30 rounded border border-blue-700/50 mb-2">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] text-blue-200 uppercase font-bold">Selected ({selectedStrokeIds.size})</span>
                            <input 
                                type="color" 
                                value={toValidHexColor(selColor, options.defaultColor)}
                                onChange={(e) => handleSelColorChange(e.target.value)}
                                className="w-6 h-6 rounded cursor-pointer bg-transparent border-none"
                            />
                        </div>
                        
                        <div className="space-y-1">
                            <div className="flex justify-between text-[10px] text-blue-300">
                                <span>Width</span>
                                <span>{selWidth}px</span>
                            </div>
                            <input 
                                type="range" min="1" max="50" step="1"
                                value={selWidth}
                                onChange={(e) => handleSelWidthChange(parseInt(e.target.value))}
                                className="w-full h-1 bg-blue-600 rounded-lg appearance-none cursor-pointer"
                            />
                        </div>

                        <div className="space-y-1">
                            <div className="flex justify-between text-[10px] text-blue-300">
                                <span>Taper Start</span>
                                <span>{Math.round(selTaperStart * 100)}%</span>
                            </div>
                            <input 
                                type="range" min="0" max="1" step="0.05"
                                value={selTaperStart}
                                onChange={(e) => handleSelTaperStartChange(parseFloat(e.target.value))}
                                className="w-full h-1 bg-blue-600 rounded-lg appearance-none cursor-pointer"
                            />
                        </div>

                        <div className="space-y-1">
                            <div className="flex justify-between text-[10px] text-blue-300">
                                <span>Taper End</span>
                                <span>{Math.round(selTaperEnd * 100)}%</span>
                            </div>
                            <input 
                                type="range" min="0" max="1" step="0.05"
                                value={selTaperEnd}
                                onChange={(e) => handleSelTaperEndChange(parseFloat(e.target.value))}
                                className="w-full h-1 bg-blue-600 rounded-lg appearance-none cursor-pointer"
                            />
                        </div>

                        <div className="flex items-center justify-between">
                            <span className="text-[10px] text-blue-300">Fill Color</span>
                            <input
                                type="color"
                                value={toValidHexColor(firstSelectedStroke?.fillColor, options.defaultFillColor)}
                                onChange={(e) => updateSelectedStrokes({ fillColor: e.target.value })}
                                className="w-6 h-6 rounded cursor-pointer bg-transparent border-none"
                            />
                        </div>

                        <label className="flex items-center justify-between text-[10px] text-blue-300">
                            <span>Stroke Enabled</span>
                            <input
                                type="checkbox"
                                checked={!((firstSelectedStroke?.color === 'transparent') || (firstSelectedStroke?.width || 0) <= 0)}
                                onChange={(e) => updateSelectedStrokes(e.target.checked
                                    ? { color: toValidHexColor(firstSelectedStroke?.color, options.defaultColor), width: Math.max(1, firstSelectedStroke?.width || options.defaultWidth) }
                                    : { color: 'transparent', width: 0 })}
                                className="w-3 h-3 rounded bg-gray-700 border-gray-600"
                            />
                        </label>
                        <label className="flex items-center justify-between text-[10px] text-blue-300">
                            <span>Bind Fill to Linked Lines</span>
                            <input
                                type="checkbox"
                                checked={!!firstSelectedStroke?.bindToLinkedStrokes}
                                onChange={(e) => updateSelectedStrokes({ bindToLinkedStrokes: e.target.checked })}
                                className="w-3 h-3 rounded bg-gray-700 border-gray-600"
                            />
                        </label>
                        <label className="flex items-center justify-between text-[10px] text-blue-300">
                            <span>Fill Enabled</span>
                            <input
                                type="checkbox"
                                checked={!!(firstSelectedStroke?.fillColor && firstSelectedStroke.fillColor !== 'transparent')}
                                onChange={(e) => updateSelectedStrokes(e.target.checked
                                    ? { fillColor: toValidHexColor(firstSelectedStroke?.fillColor, options.defaultFillColor) }
                                    : { fillColor: undefined })}
                                className="w-3 h-3 rounded bg-gray-700 border-gray-600"
                            />
                        </label>
                    </div>
                )}

                {/* TRANSFORM MODES */}
                {isTransformTool && (
                     <div className="grid grid-cols-4 gap-1 mb-2">
                         <button 
                            onClick={() => setOptions({...options, transformMode: TransformMode.TRANSLATE})}
                            className={`p-2 rounded flex justify-center ${options.transformMode === TransformMode.TRANSLATE ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400'}`}
                            title="Translate Points"
                         ><Move size={14}/></button>
                         <button 
                            onClick={() => setOptions({...options, transformMode: TransformMode.ROTATE})}
                            className={`p-2 rounded flex justify-center ${options.transformMode === TransformMode.ROTATE ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400'}`}
                            title="Rotate Selection"
                         ><RotateCw size={14}/></button>
                         <button 
                            onClick={() => setOptions({...options, transformMode: TransformMode.SCALE})}
                            className={`p-2 rounded flex justify-center ${options.transformMode === TransformMode.SCALE ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400'}`}
                            title="Scale Selection"
                         ><Scaling size={14}/></button>
                         <button 
                            onClick={() => setOptions({...options, transformMode: TransformMode.SKEW})}
                            className={`p-2 rounded flex justify-center text-[10px] font-bold ${options.transformMode === TransformMode.SKEW ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400'}`}
                            title="Skew Selection"
                         >SK</button>
                     </div>
                )}

                {isTransformTool && (
                    <div className="grid grid-cols-2 gap-1 mb-2">
                        <button
                            onClick={() => onSetTransformPointsSharp?.()}
                            disabled={!hasTransformPointSelection}
                            className={`p-2 rounded text-[11px] font-semibold border transition-colors active:scale-[0.98] ${hasTransformPointSelection ? 'bg-gray-700 text-gray-100 border-gray-500 hover:bg-gray-600' : 'bg-gray-800 text-gray-500 border-gray-700 cursor-not-allowed'}`}
                            title="Convert selected points to sharp corners"
                        >
                            Sharp Corner
                        </button>
                        <button
                            onClick={() => onSetTransformPointsCurve?.()}
                            disabled={!hasTransformPointSelection}
                            className={`p-2 rounded text-[11px] font-semibold border transition-colors active:scale-[0.98] ${hasTransformPointSelection ? 'bg-gray-700 text-gray-100 border-gray-500 hover:bg-gray-600' : 'bg-gray-800 text-gray-500 border-gray-700 cursor-not-allowed'}`}
                            title="Set selected points to bezier curve (re-click resets curve handles)"
                        >
                            Bezier Curve
                        </button>
                    </div>
                )}


                {isTransformTool && (
                    <button
                        onClick={toggleTransformEditAllLayers}
                        className={`flex items-center gap-2 text-xs p-2 rounded transition-colors border ${
                            options.transformEditAllLayers
                            ? 'bg-indigo-900/30 border-indigo-500 text-indigo-200'
                            : 'bg-gray-700/50 border-gray-600 text-gray-400 hover:bg-gray-700'
                        }`}
                        title="Edit across all visible layers or only active layer"
                    >
                        <Layers size={14} />
                        <span>{options.transformEditAllLayers ? 'Edit: All Layers' : 'Edit: Active Layer'}</span>
                    </button>
                )}
                {isTransformTool && (
                    <button
                        onClick={toggleSnapping}
                        className={`flex items-center gap-2 text-xs p-2 rounded transition-colors border ${
                            options.snappingEnabled
                            ? 'bg-yellow-900/30 border-yellow-500 text-yellow-200'
                            : 'bg-gray-700/50 border-gray-600 text-gray-400 hover:bg-gray-700'
                        }`}
                        title="Snap selected points while transforming"
                    >
                        <Magnet size={14} />
                        <span>Cling / Snap</span>
                    </button>
                )}
                {isTransformTool && (
                    <button
                        onClick={toggleBindLinkedFillsOnTransform}
                        className={`flex items-center gap-2 text-xs p-2 rounded transition-colors border ${
                            options.bindLinkedFillsOnTransform
                            ? 'bg-emerald-900/30 border-emerald-500 text-emerald-200'
                            : 'bg-gray-700/50 border-gray-600 text-gray-400 hover:bg-gray-700'
                        }`}
                        title="Move linked fills when transforming source line art"
                    >
                        <PaintBucket size={14} />
                        <span>Bind Linked Fills</span>
                    </button>
                )}
                {/* BEZIER TOGGLE */}
                {isTransformTool && (
                     <button 
                        onClick={toggleBezier}
                        className={`flex items-center gap-2 text-xs p-2 rounded transition-colors border ${
                            options.showBezierHandles 
                            ? 'bg-purple-900/30 border-purple-500 text-purple-200' 
                            : 'bg-gray-700/50 border-gray-600 text-gray-400 hover:bg-gray-700'
                        }`}
                    >
                        <Spline size={14} />
                        <span>Show Handles</span>
                    </button>
                )}
                {isTransformTool && (
                    <>
                        <button 
                            onClick={toggleAutoClose}
                            className={`flex items-center gap-2 text-xs p-2 rounded transition-colors border ${
                                options.autoClose 
                                ? 'bg-green-900/30 border-green-500 text-green-200' 
                                : 'bg-gray-700/50 border-gray-600 text-gray-400 hover:bg-gray-700'
                            }`}
                        >
                            <Magnet size={14} />
                            <span>Cling / Close</span>
                        </button>
                        <button 
                            onClick={toggleAutoMerge}
                            className={`flex items-center gap-2 text-xs p-2 rounded transition-colors border ${
                                options.autoMerge 
                                ? 'bg-blue-900/30 border-blue-500 text-blue-200' 
                                : 'bg-gray-700/50 border-gray-600 text-gray-400 hover:bg-gray-700'
                            }`}
                        >
                            <Merge size={14} />
                            <span>Auto-Merge</span>
                        </button>

                        <button 
                            onClick={toggleCloseCreatesFill}
                            className={`flex items-center gap-2 text-xs p-2 rounded transition-colors border ${
                                options.closeCreatesFill 
                                ? 'bg-emerald-900/30 border-emerald-500 text-emerald-200' 
                                : 'bg-gray-700/50 border-gray-600 text-gray-400 hover:bg-gray-700'
                            }`}
                            title="When transform-closing, create or preserve fill"
                        >
                            <PaintBucket size={14} />
                            <span>Create Fill on Close</span>
                        </button>
                        <button 
                            onClick={toggleBezierAdaptive}
                            className={`flex items-center gap-2 text-xs p-2 rounded transition-colors border ${
                                options.bezierAdaptive 
                                ? 'bg-purple-900/30 border-purple-500 text-purple-200' 
                                : 'bg-gray-700/50 border-gray-600 text-gray-400 hover:bg-gray-700'
                            }`}
                        >
                            <Spline size={14} />
                            <span>Bezier Adapt</span>
                        </button>
                    </>
                )}

                {/* DRAWING PROPERTIES (Global) */}
                {!hasSelection && isDrawTool && (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between text-xs font-bold text-gray-400">
                            <span className="flex items-center gap-1"><Palette size={12}/> Appearance</span>
                        </div>

                        {/* Stroke/Fill Toggles */}
                        <div className="flex gap-1 bg-gray-900/50 p-1 rounded">
                            <button 
                                onClick={toggleDrawStroke}
                                className={`flex-1 py-1 rounded text-[10px] font-bold transition-colors ${options.drawStroke ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                            >
                                STROKE
                            </button>
                            <button 
                                onClick={toggleDrawFill}
                                className={`flex-1 py-1 rounded text-[10px] font-bold transition-colors ${options.drawFill ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                            >
                                FILL
                            </button>
                        </div>

                        {/* Stroke Settings */}
                        {options.drawStroke && (
                            <div className="space-y-2 pl-1 border-l-2 border-gray-700">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] text-gray-500">Color</span>
                                    <input 
                                        type="color" 
                                        value={options.defaultColor}
                                        onChange={(e) => setOptions({...options, defaultColor: e.target.value})}
                                        className="w-4 h-4 rounded-full overflow-hidden border-none p-0 bg-transparent cursor-pointer"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <div className="flex justify-between text-[10px] text-gray-500">
                                        <span>Width</span>
                                        <span>{options.defaultWidth}px</span>
                                    </div>
                                    <input 
                                        type="range" min="1" max="50" step="1"
                                        value={options.defaultWidth}
                                        onChange={(e) => setOptions({...options, defaultWidth: parseInt(e.target.value)})}
                                        className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <div className="flex justify-between text-[10px] text-gray-500">
                                        <span>Taper Start</span>
                                        <span>{Math.round(options.defaultTaperStart * 100)}%</span>
                                    </div>
                                    <input 
                                        type="range" min="0" max="1" step="0.05"
                                        value={options.defaultTaperStart}
                                        onChange={(e) => setOptions({...options, defaultTaperStart: parseFloat(e.target.value)})}
                                        className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <div className="flex justify-between text-[10px] text-gray-500">
                                        <span>Taper End</span>
                                        <span>{Math.round(options.defaultTaperEnd * 100)}%</span>
                                    </div>
                                    <input 
                                        type="range" min="0" max="1" step="0.05"
                                        value={options.defaultTaperEnd}
                                        onChange={(e) => setOptions({...options, defaultTaperEnd: parseFloat(e.target.value)})}
                                        className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                                    />
                                </div>
                            </div>
                        )}

                        {/* Fill Settings */}
                        {options.drawFill && (
                            <div className="space-y-2 pl-1 border-l-2 border-gray-700">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] text-gray-500">Color</span>
                                    <input 
                                        type="color" 
                                        value={options.defaultFillColor}
                                        onChange={(e) => setFillColor(e.target.value)}
                                        className="w-4 h-4 rounded-full overflow-hidden border-none p-0 bg-transparent cursor-pointer"
                                    />
                                </div>
                            </div>
                        )}

                        <button 
                            onClick={toggleSnapping}
                            className={`flex items-center gap-2 text-xs p-2 rounded transition-colors border ${
                                options.snappingEnabled 
                                ? 'bg-yellow-900/30 border-yellow-500 text-yellow-200' 
                                : 'bg-gray-700/50 border-gray-600 text-gray-400 hover:bg-gray-700'
                            }`}
                        >
                            <Magnet size={14} />
                            <span>Cling / Snap</span>
                        </button>

                         <button 
                            onClick={toggleCrossLayer}
                            className={`flex items-center gap-2 text-xs p-2 rounded transition-colors border ${
                                options.crossLayerSnapping 
                                ? 'bg-indigo-900/30 border-indigo-500 text-indigo-200' 
                                : 'bg-gray-700/50 border-gray-600 text-gray-400 hover:bg-gray-700'
                            }`}
                            title="Allow snapping to vectors on other visible layers"
                        >
                            <Layers size={14} />
                            <span>Cross-Layer Snap</span>
                        </button>

                         <button 
                            onClick={toggleAutoMerge}
                            className={`flex items-center gap-2 text-xs p-2 rounded transition-colors border ${
                                options.autoMerge 
                                ? 'bg-blue-900/30 border-blue-500 text-blue-200' 
                                : 'bg-gray-700/50 border-gray-600 text-gray-400 hover:bg-gray-700'
                            }`}
                            title="Automatically join new strokes to existing ones if endpoints match"
                        >
                            <Merge size={14} />
                            <span>Auto-Merge</span>
                        </button>

                        <button 
                            onClick={toggleBezierAdaptive}
                            className={`flex items-center gap-2 text-xs p-2 rounded transition-colors border ${
                                options.bezierAdaptive 
                                ? 'bg-purple-900/30 border-purple-500 text-purple-200' 
                                : 'bg-gray-700/50 border-gray-600 text-gray-400 hover:bg-gray-700'
                            }`}
                            title="Preserve smooth bezier curvature when snapping/closing/merging"
                        >
                            <Spline size={14} />
                            <span>Bezier Adapt</span>
                        </button>

                        <button 
                            onClick={toggleAutoClose}
                            className={`flex items-center gap-2 text-xs p-2 rounded transition-colors border ${
                                options.autoClose 
                                ? 'bg-green-900/30 border-green-500 text-green-200' 
                                : 'bg-gray-700/50 border-gray-600 text-gray-400 hover:bg-gray-700'
                            }`}
                            title="Automatically close the shape if ending near the start"
                        >
                            <Magnet size={14} />
                            <span>Cling / Close</span>
                        </button>

                        <button 
                            onClick={toggleOptimize}
                            className={`flex items-center gap-2 text-xs p-2 rounded transition-colors border ${
                                options.optimizeFreehand 
                                ? 'bg-purple-900/30 border-purple-500 text-purple-200' 
                                : 'bg-gray-700/50 border-gray-600 text-gray-400 hover:bg-gray-700'
                            }`}
                            title="Smartly reduce points and create smooth bezier curves"
                        >
                            <Wand2 size={14} />
                            <span>Smart Beziers</span>
                        </button>

                        <div className="px-1 py-2">
                            <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                                <span>Reduction/Smooth</span>
                                <span>{options.smoothingFactor}%</span>
                            </div>
                            <input 
                                type="range" 
                                min="0" max="100" 
                                value={options.smoothingFactor}
                                onChange={(e) => setOptions({...options, smoothingFactor: parseInt(e.target.value)})}
                                className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                            />
                        </div>
                    </div>
                )}

                <div className="h-px bg-gray-700 my-1"/>

                {isPaintTool && (
                    <div className="space-y-2 p-2 bg-amber-900/20 border border-amber-700/40 rounded">
                        <div className="text-[10px] uppercase tracking-wider text-amber-300 font-bold">Paint Bucket</div>
                        <div className="space-y-1">
                            <div className="flex justify-between text-[10px] text-gray-400">
                                <span>Gap Closing</span>
                                <span>{options.gapClosingDistance}px</span>
                            </div>
                            <input
                                type="range" min="1" max="80" step="1"
                                value={options.gapClosingDistance}
                                onChange={(e) => setGapClosing(parseInt(e.target.value))}
                                className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                            />
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] text-gray-400">Fill Color</span>
                                <input
                                    type="color"
                                    value={options.defaultFillColor}
                                    onChange={(e) => setFillColor(e.target.value)}
                                    className="w-5 h-5 rounded cursor-pointer bg-transparent border-none"
                                />
                            </div>
                            <div className="flex gap-1 bg-gray-900/50 p-1 rounded">
                                <button
                                    onClick={() => setOptions({ ...options, paintBucketMode: 'FILL' })}
                                    className={`flex-1 py-1 rounded text-[10px] font-bold transition-colors ${options.paintBucketMode === 'FILL' ? 'bg-amber-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                                >
                                    <PaintBucket size={12} className="inline mr-1"/> Fill
                                </button>
                                <button
                                    onClick={() => setOptions({ ...options, paintBucketMode: 'ERASE' })}
                                    className={`flex-1 py-1 rounded text-[10px] font-bold transition-colors ${options.paintBucketMode === 'ERASE' ? 'bg-red-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                                >
                                    <Eraser size={12} className="inline mr-1"/> Erase
                                </button>
                            </div>
                        </div>
                        <button onClick={() => setOptions({ ...options, crossLayerPainting: !options.crossLayerPainting })}
                            className={`flex items-center gap-2 text-xs p-2 rounded transition-colors border ${options.crossLayerPainting ? 'bg-indigo-900/30 border-indigo-500 text-indigo-200' : 'bg-gray-700/50 border-gray-600 text-gray-400 hover:bg-gray-700'}`}>
                            <Layers size={14} />
                            <span>Cross-Layer Paint</span>
                        </button>
                        <button onClick={() => setOptions({ ...options, crossGroupPainting: !options.crossGroupPainting })}
                            className={`flex items-center gap-2 text-xs p-2 rounded transition-colors border ${options.crossGroupPainting ? 'bg-indigo-900/30 border-indigo-500 text-indigo-200' : 'bg-gray-700/50 border-gray-600 text-gray-400 hover:bg-gray-700'}`}>
                            <Layers size={14} />
                            <span>Cross-Group Paint</span>
                        </button>
                    </div>
                )}

                {/* Match Strategy */}
                <button 
                    onClick={toggleMatchStrategy}
                    className={`flex items-center gap-2 text-xs p-2 rounded transition-colors border ${
                        options.autoMatchStrategy === 'SPATIAL'
                        ? 'bg-emerald-900/30 border-emerald-500 text-emerald-200' 
                        : 'bg-gray-700/50 border-gray-600 text-gray-400 hover:bg-gray-700'
                    }`}
                    title="Determines how unbound strokes are paired for tweening."
                >
                    {options.autoMatchStrategy === 'SPATIAL' ? <ScanLine size={14} /> : <ListOrdered size={14} />}
                    <div className="flex flex-col items-start">
                        <span>Auto-Match</span>
                        <span className="text-[9px] opacity-70 leading-tight">
                            {options.autoMatchStrategy === 'SPATIAL' ? 'By Proximity' : 'By Draw Order'}
                        </span>
                    </div>
                </button>

                {(currentTool === ToolType.CORRESPONDENCE || currentTool === ToolType.BIND) && (
                    <>
                        {/* Overwrite Toggle */}
                        <button 
                            onClick={toggleOverwrite}
                            className={`flex items-center gap-2 text-xs p-2 rounded transition-colors border ${
                                options.overwriteTargets 
                                ? 'bg-red-900/30 border-red-500 text-red-200' 
                                : 'bg-gray-700/50 border-gray-600 text-gray-400 hover:bg-gray-700'
                            }`}
                        >
                            <Unlink size={14} />
                            <div className="flex flex-col items-start">
                                <span>Overwrite Targets</span>
                            </div>
                        </button>

                        {/* Swap Toggle */}
                        <button 
                            onClick={toggleSwap}
                            className={`flex items-center gap-2 text-xs p-2 rounded transition-colors border ${
                                options.swapTargets 
                                ? 'bg-blue-900/30 border-blue-500 text-blue-200' 
                                : 'bg-gray-700/50 border-gray-600 text-gray-400 hover:bg-gray-700'
                            }`}
                        >
                            <RefreshCcw size={14} />
                            <div className="flex flex-col items-start">
                                <span>Auto-Swap</span>
                            </div>
                        </button>
                    </>
                )}

                <div className="h-px bg-gray-700 my-1"/>

                {/* CANVAS SETTINGS */}
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                        <Palette size={12} />
                        <span>Canvas</span>
                    </div>

                    <div className="flex items-center justify-between px-1">
                        <span className="text-[10px] text-gray-400">Bg Color</span>
                        <div className="flex items-center gap-2">
                             <input 
                                type="checkbox"
                                checked={projectSettings.canvasTransparent}
                                onChange={toggleTransparent}
                                className="w-3 h-3 rounded bg-gray-700 border-gray-600"
                                title="Transparent Background"
                             />
                             <span className="text-[9px] text-gray-500">Transp.</span>
                             <input 
                                type="color" 
                                value={projectSettings.canvasColor}
                                onChange={(e) => setCanvasColor(e.target.value)}
                                disabled={projectSettings.canvasTransparent}
                                className={`w-5 h-5 rounded cursor-pointer bg-transparent border-none ${projectSettings.canvasTransparent ? 'opacity-50' : ''}`}
                            />
                        </div>
                    </div>

                    <button 
                        onClick={toggleGrid}
                        className={`flex items-center gap-2 text-xs p-2 rounded transition-colors border ${
                            projectSettings.showGrid 
                            ? 'bg-cyan-900/30 border-cyan-500 text-cyan-200' 
                            : 'bg-gray-700/50 border-gray-600 text-gray-400 hover:bg-gray-700'
                        }`}
                    >
                        <Grid size={14} />
                        <span>Show Grid</span>
                    </button>

                    {projectSettings.showGrid && (
                        <div className="px-1 space-y-2 bg-gray-900/30 p-2 rounded">
                            <div className="space-y-1">
                                <div className="flex justify-between text-[10px] text-gray-500">
                                    <span>Size</span>
                                    <span>{projectSettings.gridSize}px</span>
                                </div>
                                <input 
                                    type="range" min="10" max="200" step="10"
                                    value={projectSettings.gridSize}
                                    onChange={(e) => setGridSize(parseInt(e.target.value))}
                                    className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                                />
                            </div>
                            <div className="space-y-1">
                                <div className="flex justify-between text-[10px] text-gray-500">
                                    <span>Opacity</span>
                                    <span>{Math.round(projectSettings.gridOpacity * 100)}%</span>
                                </div>
                                <input 
                                    type="range" min="0.05" max="1" step="0.05"
                                    value={projectSettings.gridOpacity}
                                    onChange={(e) => setGridOpacity(parseFloat(e.target.value))}
                                    className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                                />
                            </div>
                        </div>
                    )}
                </div>

                <div className="h-px bg-gray-700 my-1"/>

                {/* CAMERA OVERLAY SETTINGS */}
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                        <Camera size={12} />
                        <span>Camera Overlay</span>
                    </div>

                    <button 
                        onClick={toggleCameraOverlay}
                        className={`flex items-center gap-2 text-xs p-2 rounded transition-colors border ${
                            projectSettings.showCameraOverlay 
                            ? 'bg-blue-900/30 border-blue-500 text-blue-200' 
                            : 'bg-gray-700/50 border-gray-600 text-gray-400 hover:bg-gray-700'
                        }`}
                    >
                        <Video size={14} />
                        <span>Show Overlay</span>
                    </button>

                    {projectSettings.showCameraOverlay && (
                        <div className="px-1 space-y-2 bg-gray-900/30 p-2 rounded">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] text-gray-400">Color</span>
                                <input 
                                    type="color" 
                                    value={projectSettings.cameraOverlayColor}
                                    onChange={(e) => setCameraOverlayColor(e.target.value)}
                                    className="w-5 h-5 rounded cursor-pointer bg-transparent border-none"
                                />
                            </div>
                            <div className="space-y-1">
                                <div className="flex justify-between text-[10px] text-gray-500">
                                    <span>Opacity</span>
                                    <span>{Math.round(projectSettings.cameraOverlayOpacity * 100)}%</span>
                                </div>
                                <input 
                                    type="range" min="0" max="1" step="0.05"
                                    value={projectSettings.cameraOverlayOpacity}
                                    onChange={(e) => setCameraOverlayOpacity(parseFloat(e.target.value))}
                                    className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                                />
                            </div>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
});
