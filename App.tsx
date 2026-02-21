import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { ToolType, DEFAULT_FPS, ToolOptions, TransformMode, ProjectSettings, DEFAULT_CANVAS_WIDTH, DEFAULT_CANVAS_HEIGHT, DEFAULT_CAMERA_WIDTH, DEFAULT_CAMERA_HEIGHT, CameraTransform, ViewportTransform, Stroke } from './types';
import { Toolbar } from './components/Toolbar';
import { ToolPropertiesPanel } from './components/ToolPropertiesPanel';
import { Timeline } from './components/Timeline';
import { TimingPanel } from './components/TimingPanel';
import { CanvasView } from './components/CanvasView';
import { OverlayControls } from './components/OverlayControls';
import { LayerPanel } from './components/LayerPanel';
import { ExportPanel } from './components/ExportPanel';

import { useKeyframeSystem } from './hooks/useKeyframeSystem';
import { useSelection } from './hooks/useSelection';
import { useCanvasInteraction } from './hooks/useCanvasInteraction';
import { useBindActions } from './hooks/useBindActions';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useLayers } from './hooks/useLayers';
import { findClosedLoopFromStrokes } from './logic/paintBucket';
import { useRigging } from './rigging/useRigging';
import { RigToolbar } from './rigging/RigToolbar';
import { RigPanel } from './rigging/RigPanel';
import { BonePropertiesPanel } from './rigging/BonePropertiesPanel';
import { SkeletonOverlay } from './rigging/SkeletonOverlay';
import { BindPointsOverlay } from './rigging/BindPointsOverlay';
import { useRigCanvasInteraction } from './rigging/useRigCanvasInteraction';
import type { RigTool } from './rigging/riggingTypes';

const App: React.FC = () => {
  // --- Core State ---
  const [currentTool, setCurrentTool] = useState<ToolType>(ToolType.PEN);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [totalFrames, setTotalFrames] = useState(100);
  const [fps, setFps] = useState(DEFAULT_FPS);
  const [activePanel, setActivePanel] = useState<'CANVAS' | 'TIMELINE' | 'LAYERS'>('CANVAS');
  const [showExport, setShowExport] = useState(false);

  // New Project Settings State
  const [projectSettings, setProjectSettings] = useState<ProjectSettings>({
      cameraResolution: { width: DEFAULT_CAMERA_WIDTH, height: DEFAULT_CAMERA_HEIGHT },
      canvasSize: { width: DEFAULT_CANVAS_WIDTH, height: DEFAULT_CANVAS_HEIGHT },
      dpi: 72,
      antiAliasing: true,
      canvasColor: '#ffffff',
      canvasTransparent: false,
      showGrid: false,
      gridSize: 50,
      gridOpacity: 0.1,
      showCameraOverlay: true,
      cameraOverlayColor: '#000000',
      cameraOverlayOpacity: 0.5
  });
  
  // Viewport State (Zoom/Pan)
  const [viewport, setViewport] = useState<ViewportTransform>({ x: 0, y: 0, zoom: 0.5 }); // Start slightly zoomed out to see canvas

  // Temp camera override for smooth dragging
  const [tempCameraTransform, setTempCameraTransform] = useState<CameraTransform | null>(null);

  const [toolOptions, setToolOptions] = useState<ToolOptions>({ 
      overwriteTargets: false, 
      swapTargets: false,
      autoMatchStrategy: 'INDEX',
      snappingEnabled: false,
      crossLayerSnapping: false,
      crossLayerPainting: true,
      crossGroupPainting: true,
      closeCreatesFill: true,
      smoothingFactor: 20,
      showBezierHandles: true,
      transformMode: TransformMode.TRANSLATE,
      autoMerge: false,
      optimizeFreehand: false,
      defaultColor: '#000000',
      defaultWidth: 2,
      defaultTaperStart: 0,
      defaultTaperEnd: 0,
      autoClose: false,
      defaultFillColor: '#000000',
      drawStroke: true,
      drawFill: false,
      gapClosingDistance: 20,
      paintBucketMode: 'FILL',
      bezierAdaptive: false,
      transformEditAllLayers: true,
      bindLinkedFillsOnTransform: false
  });
  
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const hasCenteredRef = useRef(false);
  const animationFrameRef = useRef<number>(0);
  
  // --- Hooks & Logic ---
  const keyframeSystem = useKeyframeSystem(totalFrames);
  const selection = useSelection();
  const layerSystem = useLayers();

  // --- Rigging System ---
  const [isRigMode, setIsRigMode] = useState(false);
  const [activeRigTool, setActiveRigTool] = useState<RigTool>('BONE_CREATE');
  const [rigPanelVisible, setRigPanelVisible] = useState(true);
  const rigging = useRigging();

  // Deselect when changing tools
  useEffect(() => {
      selection.setSelectedStrokeIds(new Set());
      setToolOptions(prev => ({
          ...prev,
          transformMode: TransformMode.TRANSLATE,
          snappingEnabled: currentTool === ToolType.CURVE ? true : prev.snappingEnabled
      }));
  }, [currentTool]);

  // Initialize keyframes for layers
  useEffect(() => {
      keyframeSystem.ensureInitialKeyframes(layerSystem.layers);
  }, [layerSystem.layers, keyframeSystem.ensureInitialKeyframes]);

  // ── Apply bone keyframe poses when frame changes ──────────────────────────────
  // This drives the bone positions from the boneKeyframes tween system when scrubbing.
  // Only active when rig mode is on and there are bone keyframes to apply.
  useEffect(() => {
    if (isRigMode && rigging.boneKeyframes.length > 0) {
      rigging.applyBoneKeyframeAtFrame(currentFrameIndex);
    }
  }, [currentFrameIndex, isRigMode, rigging.boneKeyframes.length]);
  

  // NOTE: Switch layer selection is set explicitly via the Timeline right-click context menu
  // (onSetSwitchSelection). We do NOT auto-set switch selection on frame navigation or active
  // layer change because that would overwrite per-frame keyframe data with whatever child
  // happens to be active — causing the "applies across the whole timeline" bug.

  // Get content for the composite view (all layers)
  const displayedStrokes = keyframeSystem.getFrameContent(currentFrameIndex, toolOptions.autoMatchStrategy, layerSystem.layers, layerSystem.activeLayerId);

  // ── Bone deformation post-process ────────────────────────────────────────────
  // When in rig mode and bound points exist, deform strokes by current bone poses.
  // This works alongside (not replacing) the stroke tweening in tweening.ts.
  const rigDeformedStrokes = isRigMode
    ? rigging.getDeformedStrokes(displayedStrokes)
    : displayedStrokes;
  
  // Get active context (for onionskins and tools working on active layer)
  const { prev: prevContext, next: nextContext } = keyframeSystem.getTweenContext(currentFrameIndex, layerSystem.activeLayerId);
  const activeKeyframe = keyframeSystem.keyframes.find(k => k.layerId === layerSystem.activeLayerId && k.index === currentFrameIndex);

  // Calculate Camera Transform for current frame (Use temp override if interacting)
  const computedCameraTransform = keyframeSystem.getCameraTransform(currentFrameIndex);
  const activeCameraTransform = tempCameraTransform || computedCameraTransform;

  const updateStrokes = useCallback((newStrokes: any[]) => {
      keyframeSystem.replaceCompositeFrameStrokes(currentFrameIndex, newStrokes);
  }, [currentFrameIndex, keyframeSystem]);

  const updateSelectedStrokes = useCallback((updates: Partial<Stroke>) => {
      if (!activeKeyframe) return;

      if (typeof updates.fillColor === 'string' && selection.selectedStrokeIds.size >= 2) {
          const selected = activeKeyframe.strokes.filter(s => selection.selectedStrokeIds.has(s.id));
          const loop = findClosedLoopFromStrokes(selected, Math.max(2, toolOptions.gapClosingDistance / Math.max(0.2, viewport.zoom)));
          if (loop) {
              const fillId = keyframeSystem.createFillStroke(currentFrameIndex, layerSystem.activeLayerId, loop.points, updates.fillColor, loop.strokeIds);
              if (fillId) selection.setSelectedStrokeIds(new Set([fillId]));
              return;
          }
      }

      const nextUpdates = { ...updates };
      if (typeof nextUpdates.fillColor === 'string' && nextUpdates.isClosed) {
          delete nextUpdates.isClosed;
      }

      const newStrokes = activeKeyframe.strokes.map(s => {
          if (selection.selectedStrokeIds.has(s.id)) {
              return { ...s, ...nextUpdates };
          }
          return s;
      });
      updateStrokes(newStrokes);
  }, [activeKeyframe, selection.selectedStrokeIds, updateStrokes, toolOptions.gapClosingDistance, viewport.zoom, keyframeSystem, currentFrameIndex, layerSystem.activeLayerId]);

  // Fit canvas to screen
  const fitToScreen = useCallback(() => {
      if (!canvasContainerRef.current) return;
      const { width: containerW, height: containerH } = canvasContainerRef.current.getBoundingClientRect();
      const { width: canvasW, height: canvasH } = projectSettings.canvasSize;
      
      // Safety check
      if (containerW === 0 || containerH === 0) return;

      const padding = 80; // More padding to clear UI
      const availableW = Math.max(100, containerW - padding * 2);
      const availableH = Math.max(100, containerH - padding * 2);
      
      const scaleW = availableW / canvasW;
      const scaleH = availableH / canvasH;
      const scale = Math.min(scaleW, scaleH);
      
      // Clamp zoom to reasonable levels
      const zoom = Math.min(Math.max(scale, 0.05), 2.0); 

      const x = (containerW - canvasW * zoom) / 2;
      const y = (containerH - canvasH * zoom) / 2;

      setViewport({ x, y, zoom });
  }, [projectSettings.canvasSize]);

  // Initial Canvas Centering with Observer
  useEffect(() => {
    if (!canvasContainerRef.current) return;
    
    // Check if already has size
    const rect = canvasContainerRef.current.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0 && !hasCenteredRef.current) {
        fitToScreen();
        hasCenteredRef.current = true;
    }

    const observer = new ResizeObserver(() => {
        if (!hasCenteredRef.current && canvasContainerRef.current) {
             const { width } = canvasContainerRef.current.getBoundingClientRect();
             if (width > 0) {
                 fitToScreen();
                 hasCenteredRef.current = true;
                 // We disconnect after first successful center to allow manual pan/zoom without reset
                 observer.disconnect();
             }
        }
    });
    
    observer.observe(canvasContainerRef.current);
    return () => observer.disconnect();
  }, [fitToScreen]);

  // Interactions
  const interaction = useCanvasInteraction({
      currentTool,
      currentFrameIndex,
      activeKeyframe,
      prevContext,
      nextContext,
      displayedStrokes,
      addKeyframe: (idx, copy) => keyframeSystem.addKeyframe(idx, layerSystem.activeLayerId, layerSystem.layers, copy),
      addCameraKeyframe: keyframeSystem.addCameraKeyframe,
      commitStroke: keyframeSystem.commitStroke,
      selectedStrokeIds: selection.selectedStrokeIds,
      setSelectedStrokeIds: selection.setSelectedStrokeIds,
      corresSelection: selection.corresSelection,
      setCorresSelection: selection.setCorresSelection,
      setSelectionBox: selection.setSelectionBox,
      selectionBox: selection.selectionBox,
      svgRef,
      toolOptions,
      updateStrokes,
      activeLayerId: layerSystem.activeLayerId,
      visibleLayerIds: layerSystem.getVisibleLayerIds(),
      currentCameraTransform: activeCameraTransform,
      onUpdateCameraTemp: setTempCameraTransform,
      tempCameraTransform: tempCameraTransform, // Added this prop
      viewport,
      setViewport,
      onStrokeUpdate: (id, updates) => keyframeSystem.updateStrokeById(currentFrameIndex, id, updates),
      onDeleteStroke: (id) => keyframeSystem.deleteStrokeById(currentFrameIndex, id, layerSystem.activeLayerId),
      onCreateFillStroke: (points, sourceIds) => {
          const fillId = keyframeSystem.createFillStroke(currentFrameIndex, layerSystem.activeLayerId, points, toolOptions.defaultFillColor, sourceIds || []);
          if (fillId) selection.setSelectedStrokeIds(new Set([fillId]));
      }
  });

  const bindActions = useBindActions({      selectedStrokeIds: selection.selectedStrokeIds,
      corresSelection: selection.corresSelection,
      keyframes: keyframeSystem.keyframes,
      prevContext,
      nextContext,
      displayedStrokes, 
      groupBindings: keyframeSystem.groupBindings,
      createBinding: keyframeSystem.createBinding,
      setFramePairBindings: keyframeSystem.setFramePairBindings,
      clearSelections: selection.clearAllSelections,
      toolOptions
  });

  const togglePlay = useCallback(() => setIsPlaying(p => !p), []);

  // Rig canvas interaction
  const rigInteraction = useRigCanvasInteraction({
    activeTool: activeRigTool,
    rigMode: rigging.rigMode,
    activeSkeletonId: rigging.activeSkeletonId,
    skeletons: rigging.skeletons,
    activeBoneId: rigging.activeBoneId,
    pendingParentBoneId: rigging.pendingParentBoneId,
    svgRef,
    activeLayerId: layerSystem.activeLayerId,
    currentFrameIndex,
    displayedStrokes,
    onAddBone: rigging.addBone,
    onSelectBones: rigging.selectBones,
    onClearBoneSelection: rigging.clearBoneSelection,
    onEditMoveBone: rigging.editMoveBone,
    onEditRotateBone: rigging.editRotateBone,
    onEditScaleBone: rigging.editScaleBone,
    onAnimMoveBone: rigging.animMoveBone,
    onAnimRotateBone: rigging.animRotateBone,
    onAnimScaleBone: rigging.animScaleBone,
    onDeleteSelectedBones: rigging.deleteSelectedBones,
    onSetPendingParent: rigging.setPendingParentBoneId,
    onSetBoneParent: rigging.setBoneParent,
    onBindLayer: rigging.bindLayer,
    onRecordBoneKeyframe: rigging.recordBoneKeyframe,
    keyAllChannels: rigging.keyAllChannels,
  });

  // Flexi-bind: auto-weight all visible strokes by bone proximity
  const handleFlexiBind = useCallback(() => {
    rigging.applyFlexiBind(displayedStrokes, rigging.activeSkeletonId ?? undefined);
  }, [rigging, displayedStrokes]);

  // Bind selected points to active bone.
  // Point binding overwrites layer binding for the ACTIVE layer (mutual exclusion).
  const handleBindSelectedPoints = useCallback(() => {
    if (!rigging.activeBoneId) return;
    rigInteraction.commitBindPoints(rigging.activeBoneId, rigging.bindPoint);
    // Point binding clears layer binding for the active layer
    rigging.unbindLayer(layerSystem.activeLayerId);
  }, [rigging, rigInteraction, layerSystem.activeLayerId]);

  const deleteSelected = useCallback(() => keyframeSystem.deleteSelected(currentFrameIndex, selection.selectedStrokeIds, layerSystem.activeLayerId), [currentFrameIndex, selection.selectedStrokeIds, keyframeSystem, layerSystem.activeLayerId]);
  const reverseSelected = useCallback(() => keyframeSystem.reverseSelected(currentFrameIndex, selection.selectedStrokeIds, layerSystem.activeLayerId), [currentFrameIndex, selection.selectedStrokeIds, keyframeSystem, layerSystem.activeLayerId]);
  const addKeyframe = useCallback((layerId?: string) => keyframeSystem.addKeyframe(currentFrameIndex, layerId || layerSystem.activeLayerId, layerSystem.layers), [currentFrameIndex, keyframeSystem, layerSystem.activeLayerId, layerSystem.layers]);
  const addCameraKeyframe = useCallback(() => keyframeSystem.addCameraKeyframe(currentFrameIndex, activeCameraTransform), [currentFrameIndex, keyframeSystem, activeCameraTransform]);

  const addHoldFrame = useCallback(() => keyframeSystem.addHoldFrame(currentFrameIndex, layerSystem.activeLayerId, layerSystem.layers), [currentFrameIndex, keyframeSystem, layerSystem.activeLayerId, layerSystem.layers]);
  const addGeneratedFrame = useCallback(() => keyframeSystem.addGeneratedFrame(currentFrameIndex, toolOptions.autoMatchStrategy, layerSystem.activeLayerId, layerSystem.layers), [currentFrameIndex, toolOptions.autoMatchStrategy, keyframeSystem, layerSystem.activeLayerId, layerSystem.layers]);
  const generateSequence = useCallback(() => keyframeSystem.generateSequence(currentFrameIndex, toolOptions.autoMatchStrategy, layerSystem.activeLayerId, layerSystem.layers), [currentFrameIndex, toolOptions.autoMatchStrategy, keyframeSystem, layerSystem.activeLayerId, layerSystem.layers]);

  useKeyboardShortcuts({
      currentTool,
      setTool: setCurrentTool,
      setIsPlaying,
      deleteSelected,
      reverseSelected,
      forceFinishPolyline: interaction.forceFinishPolyline,
      resetInteraction: interaction.resetInteraction,
      clearSelections: selection.clearAllSelections,
      activePanel
  });

  useEffect(() => {
    if (isPlaying) {
      let lastTime = performance.now();
      const loop = (time: number) => {
        const delta = time - lastTime;
        if (delta >= 1000 / fps) {
          setCurrentFrameIndex(c => (c + 1) % totalFrames);
          lastTime = time;
        }
        animationFrameRef.current = requestAnimationFrame(loop);
      };
      animationFrameRef.current = requestAnimationFrame(loop);
    } else {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    }
    return () => { if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current); };
  }, [isPlaying, fps, totalFrames]);

  const displayedGuides = activeKeyframe ? (activeKeyframe.motionPaths || []) : (prevContext?.motionPaths || []);
  const showOnion = !isPlaying && !activeKeyframe;
  const showCorresOverlay = currentTool === ToolType.CORRESPONDENCE && prevContext && nextContext && prevContext.id !== nextContext.id;
  const controllingKeyframe = activeKeyframe || prevContext;
  const visibleLayerIds = layerSystem.getVisibleLayerIds();

  // Get first selected stroke for property panel defaults
  const firstSelectedStroke = activeKeyframe?.strokes.find(s => selection.selectedStrokeIds.has(s.id));

  return (
    <div className="flex flex-col h-screen w-screen bg-gray-900 text-white overflow-hidden select-none">
      
      {/* Header */}
      <div className="h-12 bg-gray-800 border-b border-gray-700 flex items-center px-4 justify-between z-10 shrink-0">
        <div className="flex items-center gap-2">
           <div className="w-6 h-6 bg-gradient-to-br from-blue-500 to-purple-600 rounded"></div>
           <h1 className="font-bold text-lg tracking-tight">VectorTweener <span className="text-blue-400 text-xs uppercase font-mono bg-blue-900/50 px-1 rounded">Pro</span></h1>
        </div>
        <div className="flex items-center gap-4">
             <button 
                onClick={() => setShowExport(true)}
                className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded text-xs font-bold uppercase tracking-wider transition-colors"
             >
                 Export
             </button>
             <button
                onClick={() => setIsRigMode(v => !v)}
                className={`px-3 py-1 rounded text-xs font-bold uppercase tracking-wider transition-colors ${
                  isRigMode
                    ? 'bg-yellow-600 hover:bg-yellow-500 text-white ring-2 ring-yellow-400'
                    : 'bg-yellow-900/30 hover:bg-yellow-800/40 text-yellow-400/80 border border-yellow-700/30'
                }`}
                title="Toggle Rig Mode (Moho-style bone rigging)"
             >
                 🦴 Rig
             </button>
             <div className="text-xs text-gray-500 font-mono border-l border-gray-700 pl-4">
                Layer: {layerSystem.layers.find(l=>l.id===layerSystem.activeLayerId)?.name} | 
                Tool: {currentTool} | 
                Context: {activePanel}
            </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        {/* Main Canvas Area */}
        <div 
            ref={canvasContainerRef}
            className="flex-1 relative bg-[#1a1a1a]"
            onMouseDown={() => setActivePanel('CANVAS')}
            onTouchStart={() => setActivePanel('CANVAS')}
        >
            
            {/* Top Left Toolbar Container */}
            <div className="absolute top-4 left-4 z-50 flex flex-row items-start gap-4 pointer-events-none">
                <Toolbar 
                    currentTool={currentTool} 
                    setTool={setCurrentTool} 
                    isPlaying={isPlaying} 
                    togglePlay={togglePlay}
                    clearFrame={() => {}} 
                    deleteSelected={deleteSelected}
                    reverseSelected={reverseSelected}
                />

                <ToolPropertiesPanel 
                    currentTool={currentTool}
                    options={toolOptions}
                    setOptions={setToolOptions}
                    projectSettings={projectSettings}
                    setProjectSettings={setProjectSettings}
                    selectedStrokeIds={selection.selectedStrokeIds}
                    updateSelectedStrokes={updateSelectedStrokes}
                    firstSelectedStroke={firstSelectedStroke}
                    hasTransformPointSelection={interaction.transformSelection.length > 0}
                    onSetTransformPointsSharp={interaction.setTransformPointsSharp}
                    onSetTransformPointsCurve={interaction.setTransformPointsCurve}
                />

                <OverlayControls 
                    currentTool={currentTool}
                    selectedCount={selection.selectedStrokeIds.size}
                    corresCount={selection.corresSelection.size}
                    onSmartBind={bindActions.handleSmartBind}
                    onConnectStrokes={bindActions.handleCorresConnect}
                />
            </div>

            {/* Rig Mode UI — horizontal strip at top of canvas, BoneProps floating right */}
            {isRigMode && (
              <>
                {/* Top yellow accent line */}
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-yellow-500 z-[200] pointer-events-none" />

                {/* Horizontal rig toolbar — pinned top center, does not overlap left sidebar */}
                <div className="absolute top-2 left-0 right-0 z-[160] flex justify-center pointer-events-none">
                  <RigToolbar
                    activeTool={activeRigTool}
                    setActiveTool={setActiveRigTool}
                    rigMode={rigging.rigMode}
                    setRigMode={rigging.setRigMode}
                    inheritMode={rigging.inheritMode}
                    setInheritMode={rigging.setInheritMode}
                    flexiBindEnabled={rigging.flexiBindEnabled}
                    onCreateSkeleton={() => rigging.createSkeleton(layerSystem.activeLayerId)}
                    hasActiveSkeleton={!!rigging.activeSkeletonId}
                    activeLayerName={layerSystem.layers.find(l => l.id === layerSystem.activeLayerId)?.name ?? 'Layer'}
                    activeBoneId={rigging.activeBoneId}
                    activeBoneName={rigging.getActiveSkeleton()?.bones.find(b => b.id === rigging.activeBoneId)?.name ?? ''}
                    selectedBindPointCount={rigInteraction.pendingSelectedPoints.size}
                    onBindSelectedPoints={handleBindSelectedPoints}
                    onBindLayer={rigInteraction.handleBindLayer}
                    onFlexiBind={handleFlexiBind}
                    onDeleteSelectedBones={rigging.deleteSelectedBones}
                    onAddBoneKey={() => rigging.recordBoneKeyframe(currentFrameIndex)}
                  />
                </div>

                {/* Bone properties — floating panel, top-right corner, above layer panel */}
                <div className="absolute top-12 right-52 z-[155] pointer-events-auto">
                  <BonePropertiesPanel
                    bone={rigging.getActiveSkeleton()?.bones.find(b => b.id === rigging.activeBoneId) || null}
                    onRename={rigging.renameBone}
                    onColorChange={rigging.setBoneColor}
                    onStrengthChange={rigging.setBoneStrength}
                    onFlexiRadiusChange={rigging.setBoneFlexiRadius}
                    onDelete={rigging.deleteSelectedBones}
                  />
                </div>

                {/* Parent tool hint */}
                {activeRigTool === 'BONE_PARENT' && (
                  <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[150] pointer-events-none">
                    <div className="bg-indigo-900/90 border border-indigo-600/50 text-indigo-200 text-xs px-4 py-2 rounded-lg shadow-xl">
                      {rigging.pendingParentBoneId
                        ? '✓ Child selected — now click the PARENT bone'
                        : 'Click a bone to set as CHILD, then click its PARENT'}
                    </div>
                  </div>
                )}

                {/* Bind points hint */}
                {activeRigTool === 'BIND_POINTS' && !rigging.activeBoneId && (
                  <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[150] pointer-events-none">
                    <div className="bg-cyan-900/90 border border-cyan-600/50 text-cyan-200 text-xs px-4 py-2 rounded-lg">
                      Select a bone first to use Bind Points
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Rig Panel (right side, inside canvas area) */}
            {isRigMode && (
              <div className="absolute top-0 right-0 bottom-0 z-[140] pointer-events-auto">
                <RigPanel
                  skeletons={rigging.skeletons}
                  activeSkeletonId={rigging.activeSkeletonId}
                  selectedBoneIds={rigging.selectedBoneIds}
                  activeBoneId={rigging.activeBoneId}
                  boundLayers={rigging.boundLayers}
                  layers={layerSystem.layers}
                  onSelectSkeleton={rigging.setActiveSkeletonId}
                  onSelectBone={rigging.selectBone}
                  onUnbindLayer={rigging.unbindLayer}
                  onRenameSkeleton={rigging.renameSkeleton}
                  onRenameBone={rigging.renameBone}
                  onSetBoneParent={rigging.setBoneParent}
                  isVisible={rigPanelVisible}
                  onToggle={() => setRigPanelVisible(v => !v)}
                />
              </div>
            )}

            {controllingKeyframe && controllingKeyframe.id !== 'dummy' && (
                <TimingPanel 
                    controllingKeyframe={controllingKeyframe} 
                    isCurrent={controllingKeyframe.id === activeKeyframe?.id}
                    updateEasing={keyframeSystem.updateEasing}
                />
            )}
            
            <CanvasView 
                width={projectSettings.canvasSize.width}
                height={projectSettings.canvasSize.height}
                strokes={rigDeformedStrokes}
                guides={displayedGuides}
                prevOnion={prevContext}
                nextOnion={nextContext}
                showOnion={showOnion}
                activeKeyframe={activeKeyframe}
                currentStroke={interaction.currentStroke}
                currentTool={currentTool}
                selectedStrokeIds={selection.selectedStrokeIds}
                pendingPoints={interaction.pendingPoints}
                selectionBox={selection.selectionBox}
                showCorresOverlay={showCorresOverlay}
                corresPrev={prevContext}
                corresNext={nextContext}
                corresSelection={selection.corresSelection}
                groupBindings={keyframeSystem.groupBindings}
                tempConnectionLine={null}
                showBezierHandles={toolOptions.showBezierHandles}
                transformSelection={interaction.transformSelection}
                transformPreviews={interaction.transformPreviews} 
                transformBounds={interaction.transformBounds}
                snapPoint={interaction.snapPoint}
                onPointerDown={isRigMode ? rigInteraction.handleCanvasPointerDown as any : interaction.handlePointerDown}
                onPointerMove={isRigMode ? rigInteraction.handleCanvasPointerMove as any : interaction.handlePointerMove}
                onPointerUp={isRigMode ? rigInteraction.handleCanvasPointerUp as any : interaction.handlePointerUp}
                onWheel={interaction.handleWheel}
                svgRef={svgRef}
                visibleLayerIds={visibleLayerIds}
                projectSettings={projectSettings}
                cameraTransform={activeCameraTransform}
                viewport={viewport}
                toolOptions={toolOptions}
                rigOverlay={isRigMode ? (
                  <>
                    <SkeletonOverlay
                      skeletons={rigging.skeletons}
                      activeSkeletonId={rigging.activeSkeletonId}
                      selectedBoneIds={rigging.selectedBoneIds}
                      activeTool={activeRigTool}
                      viewport={viewport}
                      onBonePointerDown={rigInteraction.handleBonePointerDown as any}
                      onBonePointerUp={rigInteraction.handleBonePointerUp as any}
                      boxSelectRect={rigInteraction.boxSelectRect}
                    />
                    <BindPointsOverlay
                      strokes={rigDeformedStrokes}
                      boundPoints={rigging.boundPoints}
                      pendingSelectedPoints={rigInteraction.pendingSelectedPoints}
                      activeBoneId={rigging.activeBoneId}
                      activeTool={activeRigTool}
                      bindBoxRect={rigInteraction.bindBoxRect}
                      onPointPointerDown={rigInteraction.handlePointPointerDown as any}
                    />
                    {/* Bone creation preview */}
                    {rigInteraction.creatingHead && rigInteraction.previewTail && (
                      <g style={{ pointerEvents: 'none' }}>
                        <circle cx={rigInteraction.creatingHead.x} cy={rigInteraction.creatingHead.y} r={6} fill="#fde68a" opacity={0.9} />
                        <line
                          x1={rigInteraction.creatingHead.x} y1={rigInteraction.creatingHead.y}
                          x2={rigInteraction.previewTail.x} y2={rigInteraction.previewTail.y}
                          stroke="#f59e0b" strokeWidth={2} strokeDasharray="5,4" opacity={0.85}
                        />
                        <circle cx={rigInteraction.previewTail.x} cy={rigInteraction.previewTail.y} r={4} fill="#f59e0b" opacity={0.85} />
                      </g>
                    )}
                  </>
                ) : undefined}
            />
        </div>

        {/* Right Panel - Layers */}
        <div onMouseDown={() => setActivePanel('LAYERS')}>
            <LayerPanel 
                flattenedLayers={layerSystem.flattenedLayers}
                selectedLayerIds={layerSystem.selectedLayerIds}
                activeLayerId={layerSystem.activeLayerId}
                currentFrameIndex={currentFrameIndex}
                onSelect={layerSystem.selectLayer}
                onToggleVis={layerSystem.toggleVisibility}
                onToggleLock={layerSystem.toggleLock}
                onToggleExpand={layerSystem.toggleExpand}
                onAddLayer={() => layerSystem.addLayer('VECTOR')}
                onAddGroup={() => layerSystem.addLayer('GROUP')}
                onAddSwitch={() => layerSystem.addLayer('SWITCH')}
                onDelete={layerSystem.deleteSelectedLayers}
                onConvertGroupToSwitch={layerSystem.convertGroupToSwitch}
                onMoveLayer={layerSystem.moveLayer}
                onSetSwitchSelection={keyframeSystem.setSwitchSelection}
            />
        </div>

        {/* Export Modal Overlay */}
        {showExport && (
            <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
                <ExportPanel 
                    onClose={() => setShowExport(false)}
                    projectSettings={projectSettings}
                    totalFrames={totalFrames}
                    fps={fps}
                    svgRef={svgRef}
                    currentFrameIndex={currentFrameIndex}
                    setCurrentFrameIndex={setCurrentFrameIndex}
                    keyframes={keyframeSystem.keyframes}
                    cameraKeyframes={keyframeSystem.cameraKeyframes}
                    layers={layerSystem.layers}
                    getFrameContent={keyframeSystem.getFrameContent}
                    getCameraTransform={keyframeSystem.getCameraTransform}
                />
            </div>
        )}
      </div>

      <Timeline 
        totalFrames={totalFrames}
        currentFrameIndex={currentFrameIndex}
        keyframes={keyframeSystem.keyframes}
        cameraKeyframes={keyframeSystem.cameraKeyframes}
        boneKeyframes={rigging.boneKeyframes}
        skeletons={rigging.skeletons}
        isRigMode={isRigMode}
        keyAllChannels={rigging.keyAllChannels}
        onSetKeyAllChannels={rigging.setKeyAllChannels}
        onAddBoneKeyframe={(channels) => rigging.recordBoneKeyframe(currentFrameIndex, channels)}
        onDeleteBoneKeyframes={(indices, skeletonId, channels) => indices.forEach(i => rigging.deleteBoneKeyframe(i, skeletonId, channels))}
        layers={layerSystem.layers}
        activeLayerId={layerSystem.activeLayerId}
        onSeek={setCurrentFrameIndex}
        addKeyframe={addKeyframe}
        addCameraKeyframe={addCameraKeyframe}
        addHoldFrame={addHoldFrame}
        addGeneratedFrame={addGeneratedFrame}
        generateSequence={generateSequence}
        onMoveKeyframes={keyframeSystem.moveKeyframes}
        onMoveCameraFrames={keyframeSystem.moveCameraFrames}
        onDeleteFrames={keyframeSystem.deleteFrames}
        onDeleteCameraFrames={keyframeSystem.deleteCameraKeyframes}
        setTotalFrames={setTotalFrames}
        fps={fps}
        setFps={setFps}
        setActivePanel={(p) => setActivePanel(p)}
        projectSettings={projectSettings}
        setProjectSettings={setProjectSettings}
        toggleSync={layerSystem.toggleSync}
        setSyncAll={layerSystem.setSyncAll}
        selectLayer={layerSystem.selectLayer}
        toggleExpand={layerSystem.toggleExpand}
        onSetSwitchSelection={keyframeSystem.setSwitchSelection}
      />
    </div>
  );
};

export default App;
