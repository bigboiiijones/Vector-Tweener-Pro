import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useContextMenu } from '../hooks/useContextMenu';
import { Keyframe, ProjectSettings, CameraKeyframe, Layer } from '../types';
import { TimelineSettings } from './TimelineSettings';
import { Trash2, Video, Folder, FolderOpen, Image as ImageIcon, Link2, Unlink, Plus, GitMerge, Bone } from 'lucide-react';
import type { BoneKeyframe, Skeleton } from '../rigging/riggingTypes';

interface TimelineProps {
  totalFrames: number;
  currentFrameIndex: number;
  keyframes: Keyframe[];
  cameraKeyframes: CameraKeyframe[];
  // Bone timeline
  boneKeyframes: BoneKeyframe[];
  skeletons: Skeleton[];
  isRigMode: boolean;
  onAddBoneKeyframe: (channels?: import('../rigging/riggingTypes').BoneKeyChannel[]) => void;
  onDeleteBoneKeyframes: (frameIndices: number[], skeletonId: string, channels?: import('../rigging/riggingTypes').BoneKeyChannel[]) => void;
  keyAllChannels: boolean;
  onSetKeyAllChannels: (v: boolean) => void;
  layers: Layer[];
  activeLayerId: string;
  onSeek: (frame: number) => void;
  // Actions
  addKeyframe: (layerId?: string) => void; // Updated signature to allow specific layer
  addCameraKeyframe: () => void;
  addHoldFrame: () => void;
  addGeneratedFrame: () => void;
  generateSequence: () => void;
  
  onMoveKeyframes: (keyframeIds: Set<string>, offset: number) => void; 
  onMoveCameraFrames: (indices: number[], targetIndex: number) => void;
  
  onDeleteFrames: (keyframeIds: Set<string>) => void;
  onDeleteCameraFrames: (indices: number[]) => void;
  
  setTotalFrames: (n: number) => void;
  fps: number;
  setFps: (n: number) => void;
  setActivePanel: (panel: 'TIMELINE') => void;
  projectSettings: ProjectSettings;
  setProjectSettings: (s: ProjectSettings) => void;

  toggleSync: (layerId: string) => void;
  setSyncAll: (synced: boolean) => void;
  selectLayer: (id: string, ctrl: boolean, shift: boolean) => void;
  toggleExpand: (id: string) => void;
  onSetSwitchSelection: (switchLayerId: string, childLayerId: string, frameIndex: number) => void;
}

interface SwitchCellMenuPayload {
  switchLayerId: string;
  frameIndex: number;
}

export const Timeline: React.FC<TimelineProps> = React.memo(({
  totalFrames,
  currentFrameIndex,
  keyframes,
  cameraKeyframes,
  boneKeyframes,
  skeletons,
  isRigMode,
  onAddBoneKeyframe,
  onDeleteBoneKeyframes,
  keyAllChannels,
  onSetKeyAllChannels,
  layers,
  activeLayerId,
  onSeek,
  addKeyframe,
  addCameraKeyframe,
  addHoldFrame,
  addGeneratedFrame,
  generateSequence,
  onMoveKeyframes,
  onMoveCameraFrames,
  onDeleteFrames,
  onDeleteCameraFrames,
  setTotalFrames,
  fps,
  setFps,
  setActivePanel,
  projectSettings,
  setProjectSettings,
  toggleSync,
  setSyncAll,
  selectLayer,
  toggleExpand,
  onSetSwitchSelection
}) => {
  // Selection
  const [selectedKeyframeIds, setSelectedKeyframeIds] = useState<Set<string>>(new Set());
  const [selectedCameraIndices, setSelectedCameraIndices] = useState<Set<number>>(new Set());
  const [selectedBoneFrameIndices, setSelectedBoneFrameIndices] = useState<Set<number>>(new Set());
  const [lastClicked, setLastClicked] = useState<{ layerId: string, index: number } | null>(null);
  const [lastCameraClickedIndex, setLastCameraClickedIndex] = useState<number | null>(null);
  // Which skeleton bone tracks are expanded to show per-channel sub-rows
  const [expandedBoneSkeletons, setExpandedBoneSkeletons] = useState<Set<string>>(new Set());

  const containerRef = useRef<HTMLDivElement>(null);

  const { menu: switchMenu, openMenu: openSwitchMenu, closeMenu: closeSwitchMenu } = useContextMenu<SwitchCellMenuPayload>();

  const getSwitchCandidates = (switchLayerId: string): Layer[] => {
      return layers.filter(layer => layer.parentId === switchLayerId && (layer.type === 'VECTOR' || layer.type === 'GROUP' || layer.type === 'SWITCH'));
  };

  const getFirstVectorDescendant = (layerId: string): string | null => {
      const queue = [layerId];
      while (queue.length > 0) {
          const currentId = queue.shift()!;
          const children = layers.filter(layer => layer.parentId === currentId);
          for (const child of children) {
              if (child.type === 'VECTOR') return child.id;
              if (child.type === 'GROUP' || child.type === 'SWITCH') queue.push(child.id);
          }
      }
      return null;
  };


  // Data prep
  const keyframesByLayer = useMemo(() => {
      const map = new Map<string, Record<number, Keyframe>>();
      keyframes.forEach(k => {
          if (!map.has(k.layerId)) map.set(k.layerId, {});
          map.get(k.layerId)![k.index] = k;
      });
      return map;
  }, [keyframes]);

  // Are all VECTOR layers currently synced? Used for the Sync All toggle button
  const vectorLayers = useMemo(() => layers.filter(l => l.type === 'VECTOR'), [layers]);
  const allSynced = useMemo(() => vectorLayers.length > 0 && vectorLayers.every(l => l.isSynced), [vectorLayers]);

  const getFlattenedLayers = (layerList: Layer[], depth = 0): Layer[] => {
      let result: Layer[] = [];
      for (let i = layerList.length - 1; i >= 0; i--) {
          const l = layerList[i];
          if (!l.parentId) {
              result.push({ ...l, depth });
              if ((l.type === 'GROUP' || l.type === 'SWITCH') && l.isExpanded) {
                  result = [...result, ...getChildren(layerList, l.id, depth + 1)];
              }
          }
      }
      return result;
  };

  const getChildren = (allLayers: Layer[], parentId: string, depth: number): Layer[] => {
      let result: Layer[] = [];
      const children = allLayers.filter(l => l.parentId === parentId);
      for (let i = children.length - 1; i >= 0; i--) {
          const l = children[i];
          result.push({ ...l, depth });
          if ((l.type === 'GROUP' || l.type === 'SWITCH') && l.isExpanded) {
              result = [...result, ...getChildren(allLayers, l.id, depth + 1)];
          }
      }
      return result;
  };

  const visibleRows = useMemo(() => getFlattenedLayers(layers), [layers]);

  // --- Actions ---

  const handleEmptyClick = (frameIndex: number) => {
      onSeek(frameIndex);
      setSelectedKeyframeIds(new Set());
      setSelectedCameraIndices(new Set());
      setLastClicked(null);
      setLastCameraClickedIndex(null);
  };

  const handleKeyframeClick = (e: React.MouseEvent, kf: Keyframe, layer: Layer) => {
      e.stopPropagation();
      const isShift = e.shiftKey;
      const isCtrl = e.ctrlKey || e.metaKey;

      let newSel = new Set(isCtrl ? selectedKeyframeIds : []);
      
      if (isShift && lastClicked) {
          // Range Selection
          // Find index of start and end layers
          const startLayerIdx = visibleRows.findIndex(l => l.id === lastClicked.layerId);
          const endLayerIdx = visibleRows.findIndex(l => l.id === layer.id);
          
          const minLayer = Math.min(startLayerIdx, endLayerIdx);
          const maxLayer = Math.max(startLayerIdx, endLayerIdx);

          const minFrame = Math.min(lastClicked.index, kf.index);
          const maxFrame = Math.max(lastClicked.index, kf.index);

          for (let l = minLayer; l <= maxLayer; l++) {
              const lId = visibleRows[l].id;
              const rowKeys = keyframesByLayer.get(lId);
              if (rowKeys) {
                  for (let f = minFrame; f <= maxFrame; f++) {
                      if (rowKeys[f]) newSel.add(rowKeys[f].id);
                  }
              }
          }
      } else {
          // Toggle or Single
          if (isCtrl) {
              if (newSel.has(kf.id)) newSel.delete(kf.id);
              else newSel.add(kf.id);
          } else {
              newSel.clear();
              newSel.add(kf.id);
              
              // Sync logic for single click without modifiers
              if (layer.isSynced) {
                   visibleRows.forEach(l => {
                       if (l.id !== layer.id && l.isSynced && l.type === 'VECTOR') {
                           const partnerKf = keyframesByLayer.get(l.id)?.[kf.index];
                           if (partnerKf) newSel.add(partnerKf.id);
               }
           });
              }
          }
          setLastClicked({ layerId: layer.id, index: kf.index });
      }

      setSelectedKeyframeIds(newSel);
      // Don't clear camera indices if user might be trying to multi-select both types (e.g. via ctrl), 
      // but standard behavior is usually mutually exclusive or additive. Let's keep separate logic unless Ctrl pressed.
      if (!isCtrl) setSelectedCameraIndices(new Set()); 
      
      onSeek(kf.index);
      selectLayer(layer.id, false, false);
  };

  const handleCameraClick = (e: React.MouseEvent, index: number) => {
      e.stopPropagation();
      const isShift = e.shiftKey;
      const isCtrl = e.ctrlKey || e.metaKey;
      
      let newSel = new Set(isCtrl ? selectedCameraIndices : []);

      if (isShift && lastCameraClickedIndex !== null) {
          const min = Math.min(lastCameraClickedIndex, index);
          const max = Math.max(lastCameraClickedIndex, index);
          // Add all camera keyframes in range
          cameraKeyframes.forEach(k => {
              if (k.index >= min && k.index <= max) {
                  newSel.add(k.index);
              }
          });
      } else {
          if (isCtrl) {
              if (newSel.has(index)) newSel.delete(index);
              else newSel.add(index);
          } else {
              newSel.clear();
              newSel.add(index);
          }
          setLastCameraClickedIndex(index);
      }

      setSelectedCameraIndices(newSel);
      if (!isCtrl) setSelectedKeyframeIds(new Set());
      onSeek(index);
  };

  const handleDragStart = (e: React.DragEvent, anchorIndex: number, specificKeyframeId?: string, isCamera: boolean = false) => {
      // Prevent dragging frame 0
      if (anchorIndex === 0) {
          e.preventDefault();
          return;
      }

      // Determine what to drag based on what initiated it.
      let kfIds = Array.from(selectedKeyframeIds);
      let camIndices = Array.from(selectedCameraIndices);

      // IMPORTANT: Auto-select if the dragged item is NOT in the current selection
      // This allows "Drag unselected item" to work intuitively without a prior click
      if (isCamera) {
          if (!selectedCameraIndices.has(anchorIndex)) {
              camIndices = [anchorIndex];
              setSelectedCameraIndices(new Set([anchorIndex]));
              setSelectedKeyframeIds(new Set());
              kfIds = [];
          }
      } else if (specificKeyframeId) {
          if (!selectedKeyframeIds.has(specificKeyframeId)) {
              kfIds = [specificKeyframeId];
              setSelectedKeyframeIds(new Set([specificKeyframeId]));
              setSelectedCameraIndices(new Set());
              camIndices = [];
          }
      }

      e.dataTransfer.setData('anchorIndex', anchorIndex.toString());
      if (kfIds.length > 0) e.dataTransfer.setData('kfIds', JSON.stringify(kfIds));
      if (camIndices.length > 0) e.dataTransfer.setData('camIndices', JSON.stringify(camIndices));
      
      e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
      e.preventDefault();
      // Prevent dropping onto frame 0
      if (targetIndex === 0) return;

      const anchorStr = e.dataTransfer.getData('anchorIndex');
      if (!anchorStr) return;
      
      const anchorIndex = parseInt(anchorStr, 10);
      const delta = targetIndex - anchorIndex;
      if (delta === 0) return;

      const kfIdsStr = e.dataTransfer.getData('kfIds');
      if (kfIdsStr) {
          const ids = JSON.parse(kfIdsStr) as string[];
          if (ids.length > 0) {
            onMoveKeyframes(new Set(ids), delta);
            setSelectedKeyframeIds(new Set());
          }
      }
      
      const camStr = e.dataTransfer.getData('camIndices');
      if (camStr) {
          const indices = JSON.parse(camStr) as number[];
          if (indices.length > 0) {
            const min = Math.min(...indices); // not strictly needed for logic but good for bounds checking if implemented
            onMoveCameraFrames(indices, min + delta); // logic handles offset calculation
            setSelectedCameraIndices(new Set());
          }
      }
  };

  const handleDeleteSelected = () => {
      if (selectedKeyframeIds.size > 0) {
          onDeleteFrames(selectedKeyframeIds);
          setSelectedKeyframeIds(new Set());
      }
      if (selectedCameraIndices.size > 0) {
          onDeleteCameraFrames(Array.from(selectedCameraIndices));
          setSelectedCameraIndices(new Set());
      }
  };

  const handleDeleteLayerKeys = (e: React.MouseEvent, layerId: string) => {
      e.stopPropagation();
      const layerKeysMap = keyframesByLayer.get(layerId);
      if (!layerKeysMap) return;

      const idsToDelete = new Set<string>();
      Object.values(layerKeysMap).forEach(kf => {
          if (selectedKeyframeIds.has(kf.id)) {
              idsToDelete.add(kf.id);
          }
      });
      
      if (idsToDelete.size > 0) {
          onDeleteFrames(idsToDelete);
          const newSel = new Set(selectedKeyframeIds);
          idsToDelete.forEach(id => newSel.delete(id));
          setSelectedKeyframeIds(newSel);
      }
  };

  return (
    <div 
        className="absolute bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-700 h-80 flex flex-col z-50 outline-none focus-within:ring-1 focus-within:ring-blue-500 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.3)]"
        onMouseDown={(e) => { 
            setActivePanel('TIMELINE');
            // Close the switch menu only if the mousedown target is NOT inside the switch menu.
            // Using onMouseDown here (instead of onClick) is intentional for panel focus,
            // but it would fire before menu button onClick events. We guard against this by
            // checking if the click originated from the menu overlay itself.
            const target = e.target as HTMLElement;
            if (!target.closest('[data-switch-menu]')) {
                closeSwitchMenu();
            }
        }}
        ref={containerRef}
        tabIndex={0} 
        onKeyDown={(e) => {
            if (e.key === 'Delete') handleDeleteSelected();
        }}
    >
        {/* Top Control Bar / Project Settings */}
        <div className="h-11 bg-gray-800 border-b border-gray-700 flex items-center px-4 justify-between shrink-0 gap-4 overflow-hidden">
             
             {/* Left: Settings Component */}
             <TimelineSettings 
                currentFrameIndex={currentFrameIndex}
                fps={fps}
                setFps={setFps}
                projectSettings={projectSettings}
                setProjectSettings={setProjectSettings}
                totalFrames={totalFrames} // New: Pass totalFrames
                setTotalFrames={setTotalFrames} // New: Pass setTotalFrames
             />

             {/* Right: Actions */}
             <div className="flex items-center gap-2 ml-auto shrink-0 bg-gray-800 pl-2 border-l border-gray-700 shadow-[-4px_0_4px_-2px_rgba(0,0,0,0.5)] z-10">
                 <button onClick={() => addKeyframe()} className="px-3 py-1 bg-blue-700 hover:bg-blue-600 text-xs text-white rounded font-bold shadow-sm flex items-center gap-1">
                     <Plus size={10} /> Key
                 </button>
                 <button onClick={addCameraKeyframe} className="px-3 py-1 bg-orange-700 hover:bg-orange-600 text-xs text-white rounded font-bold shadow-sm flex items-center gap-1">
                     <Video size={10} /> Cam
                 </button>
                 <button onClick={addHoldFrame} className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-xs text-white rounded font-bold border border-gray-600">Hold</button>
                 <div className="w-px h-4 bg-gray-600 mx-1"></div>
                 {/* Sync All / Unsync All toggle */}
                 <button
                     onClick={() => setSyncAll(!allSynced)}
                     title={allSynced ? 'Unsync All Layers' : 'Sync All Layers'}
                     className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-bold border transition-colors
                         ${allSynced
                             ? 'bg-green-900/50 border-green-700 text-green-300 hover:bg-green-900/80'
                             : 'bg-gray-700 border-gray-600 text-gray-400 hover:bg-gray-600 hover:text-gray-200'
                         }`}
                 >
                     <GitMerge size={12} />
                     {allSynced ? 'Synced' : 'Sync All'}
                 </button>
                 <div className="w-px h-4 bg-gray-600 mx-1"></div>
                 <button onClick={handleDeleteSelected} className="px-2 py-1 bg-red-900/40 hover:bg-red-900/60 text-xs text-red-200 rounded border border-red-900/50" title="Delete Selected Frames">
                     <Trash2 size={14} />
                 </button>
             </div>
        </div>

        {/* Main Scrolling Area with Sticky Alignment */}
        <div className="flex-1 overflow-auto relative custom-scrollbar bg-[#1a1a1a]">
            {/* Wrapper to ensure width expands */}
            <div style={{ minWidth: 'max-content' }}>
                
                {/* RULER ROW (Sticky Top) */}
                <div className="flex sticky top-0 z-40 bg-gray-800 h-6 border-b border-gray-600 shadow-sm">
                     {/* Top-Left Corner (Sticky Left + Top) */}
                     <div className="sticky left-0 w-64 bg-gray-800 border-r border-gray-600 z-50 flex items-center justify-between px-2">
                         <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Layers</span>
                         <button
                             onClick={() => setSyncAll(!allSynced)}
                             title={allSynced ? 'Unsync All Layers' : 'Sync All Layers'}
                             className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold border transition-colors
                                 ${allSynced
                                     ? 'bg-green-900/50 border-green-700/60 text-green-400 hover:bg-green-900/80'
                                     : 'bg-transparent border-gray-600 text-gray-500 hover:text-gray-300 hover:border-gray-400'
                                 }`}
                         >
                             <GitMerge size={9} />
                             {allSynced ? 'All' : 'Sync'}
                         </button>
                     </div>
                     {/* Ruler Ticks */}
                     <div className="flex relative">
                        {Array.from({ length: totalFrames }).map((_, i) => (
                             <div 
                                key={i} 
                                onClick={() => handleEmptyClick(i)}
                                className={`flex-shrink-0 w-6 h-full border-r border-gray-700 text-[9px] flex items-center justify-center cursor-pointer hover:bg-gray-700 ${i === currentFrameIndex ? 'bg-blue-600 text-white' : 'text-gray-500'}`}
                             >
                                 {i + 1}
                             </div>
                         ))}
                         {/* Extender to allow adding frames */}
                         <div className="w-20 flex items-center justify-center cursor-pointer hover:bg-gray-700 text-gray-500 text-xs border-r border-gray-700" onClick={() => setTotalFrames(totalFrames + 20)}>+</div>
                     </div>
                </div>

                {/* CAMERA TRACK ROW */}
                <div className="flex h-7 border-b border-gray-700/50 bg-gray-900/30">
                    <div className="sticky left-0 w-64 bg-gray-800 border-r border-gray-700 z-30 flex items-center px-2 justify-between">
                        <div className="flex items-center gap-2 text-xs text-gray-300 font-bold">
                            <Video size={12} className="text-orange-500"/> Camera
                        </div>
                        <div className="flex gap-1 opacity-50 hover:opacity-100">
                             <button onClick={addCameraKeyframe} className="p-1 hover:text-white" title="Add Camera Key"><Plus size={10}/></button>
                             <button onClick={() => onDeleteCameraFrames(Array.from(selectedCameraIndices))} className="p-1 hover:text-red-400" title="Delete Selected Camera Keys"><Trash2 size={10}/></button>
                        </div>
                    </div>
                    <div className="flex relative">
                         {Array.from({ length: totalFrames }).map((_, i) => {
                             const kf = cameraKeyframes.find(k => k.index === i);
                             const isSel = kf && selectedCameraIndices.has(i);
                             const isCurrent = i === currentFrameIndex;
                             return (
                                 <div 
                                    key={i} 
                                    className={`flex-shrink-0 w-6 h-full border-r border-gray-700/20 relative ${isCurrent ? 'bg-blue-500/5' : ''}`}
                                    draggable={i !== 0}
                                    onClick={(e) => {
                                        if (kf) handleCameraClick(e, i);
                                        else handleEmptyClick(i);
                                    }}
                                    onDragStart={(e) => {
                                        e.stopPropagation();
                                        handleDragStart(e, i, undefined, true);
                                    }}
                                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                                    onDrop={(e) => handleDrop(e, i)}
                                 >
                                     {isCurrent && <div className="absolute inset-0 border-l border-red-500 pointer-events-none opacity-30"/>}
                                     {kf && (
                                         <div 
                                            className={`absolute top-1.5 left-1.5 w-3 h-3 rounded-full border border-black/50 cursor-pointer ${isSel ? 'bg-white ring-1 ring-orange-500' : 'bg-orange-500'}`}
                                         />
                                     )}
                                 </div>
                             )
                         })}
                    </div>
                </div>

                {/* BONE KEYFRAME TRACKS — expandable per-channel rows */}
                {isRigMode && skeletons.length > 0 && skeletons.map(skeleton => {
                  const skeletonBoneKeys = boneKeyframes.filter(kf => kf.skeletonId === skeleton.id);
                  const keysByFrame = new Map(skeletonBoneKeys.map(kf => [kf.frameIndex, kf]));
                  const isExpanded = expandedBoneSkeletons.has(skeleton.id);

                  // Per-channel helpers
                  type BKC = import('../rigging/riggingTypes').BoneKeyChannel;
                  const CHANNELS: { ch: BKC; label: string; color: string; ring: string; dot: string }[] = [
                    { ch: 'translate', label: 'T',  color: 'bg-sky-500',    ring: 'ring-sky-300',    dot: 'bg-sky-400' },
                    { ch: 'rotate',    label: 'R',  color: 'bg-violet-500', ring: 'ring-violet-300', dot: 'bg-violet-400' },
                    { ch: 'scale',     label: 'S',  color: 'bg-amber-500',  ring: 'ring-amber-300',  dot: 'bg-amber-400' },
                  ];

                  // Check which channels exist at a frame
                  const channelAtFrame = (i: number, ch: BKC): boolean => {
                    const kf = keysByFrame.get(i);
                    if (!kf) return false;
                    // Check any bone has this channel keyed
                    return Object.values(kf.boneTransforms).some(bt => {
                      const keyed = bt.keyedChannels ?? ['translate','rotate','scale'];
                      return keyed.includes(ch);
                    });
                  };

                  const hasAnyKeyAtFrame = (i: number) => keysByFrame.has(i);

                  return (
                    <React.Fragment key={skeleton.id}>
                      {/* Master row */}
                      <div className="flex h-7 border-b border-emerald-800/40 bg-emerald-950/20">
                        <div className="sticky left-0 w-64 bg-gray-800 border-r border-emerald-800/40 z-30 flex items-center px-2 justify-between">
                          <div className="flex items-center gap-1 text-xs text-emerald-300 font-bold">
                            {/* Expand/collapse */}
                            <button
                              onClick={() => setExpandedBoneSkeletons(prev => {
                                const n = new Set(prev);
                                n.has(skeleton.id) ? n.delete(skeleton.id) : n.add(skeleton.id);
                                return n;
                              })}
                              className="text-emerald-600 hover:text-emerald-300 p-0.5"
                              title={isExpanded ? 'Collapse channels' : 'Expand per-channel rows'}
                            >
                              {isExpanded
                                ? <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 3 L5 7 L8 3" stroke="currentColor" strokeWidth="1.5" fill="none"/></svg>
                                : <svg width="10" height="10" viewBox="0 0 10 10"><path d="M3 2 L7 5 L3 8" stroke="currentColor" strokeWidth="1.5" fill="none"/></svg>
                              }
                            </button>
                            <Bone size={11} className="text-emerald-400 shrink-0" />
                            <span className="truncate text-[10px]">{skeleton.name}</span>
                            {/* Key-All toggle pill */}
                            <button
                              onClick={() => onSetKeyAllChannels(!keyAllChannels)}
                              title={keyAllChannels ? 'Key All ON — every move keys all channels. Click to key only touched channel.' : 'Key One — only the used channel is keyed. Click to key all channels.'}
                              className={`ml-1 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wide border transition-colors shrink-0 ${
                                keyAllChannels
                                  ? 'bg-emerald-700 border-emerald-500 text-emerald-100'
                                  : 'bg-gray-700 border-gray-600 text-gray-400'
                              }`}
                            >
                              {keyAllChannels ? 'All' : '1ch'}
                            </button>
                          </div>
                          <div className="flex gap-1 opacity-60 hover:opacity-100 shrink-0">
                            <button onClick={() => onAddBoneKeyframe()} className="p-1 hover:text-emerald-300" title="Record bone key (all channels)"><Plus size={10}/></button>
                            <button
                              onClick={() => {
                                const sel = Array.from(selectedBoneFrameIndices).filter(i => keysByFrame.has(i));
                                if (sel.length > 0) onDeleteBoneKeyframes(sel, skeleton.id);
                              }}
                              className="p-1 hover:text-red-400" title="Delete selected bone keys"><Trash2 size={10}/></button>
                          </div>
                        </div>
                        {/* Master track cells — show combined diamond when any channel is keyed */}
                        <div className="flex relative">
                          {Array.from({ length: totalFrames }).map((_, i) => {
                            const hasKey = hasAnyKeyAtFrame(i);
                            const isSel = hasKey && selectedBoneFrameIndices.has(i);
                            const isCurrent = i === currentFrameIndex;
                            // Show which channels are present as mini colored dots
                            const presentChs = CHANNELS.filter(c => channelAtFrame(i, c.ch));
                            return (
                              <div
                                key={i}
                                className={`flex-shrink-0 w-6 h-full border-r border-gray-700/20 relative cursor-pointer ${isCurrent ? 'bg-emerald-500/5' : ''}`}
                                onClick={(e) => {
                                  if (hasKey) {
                                    setSelectedBoneFrameIndices(prev => {
                                      const next = new Set(e.ctrlKey || e.metaKey ? prev : []);
                                      next.has(i) ? next.delete(i) : next.add(i);
                                      return next;
                                    });
                                  } else {
                                    onSeek(i);
                                  }
                                }}
                              >
                                {isCurrent && <div className="absolute inset-0 border-l border-red-500 pointer-events-none opacity-30"/>}
                                {hasKey && !isExpanded && (
                                  <div className={`absolute top-1.5 left-1 w-4 h-4 rotate-45 border border-black/40 cursor-pointer ${isSel ? 'bg-white ring-1 ring-emerald-400' : 'bg-emerald-500'}`}>
                                    {/* micro channel dots inside diamond */}
                                    {presentChs.length < 3 && (
                                      <div className="absolute -rotate-45 inset-0 flex items-center justify-center gap-px">
                                        {presentChs.map(c => (
                                          <div key={c.ch} className={`w-1 h-1 rounded-full ${c.dot}`} />
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Per-channel sub-rows (only when expanded) */}
                      {isExpanded && CHANNELS.map(({ ch, label, color, ring, dot }) => (
                        <div key={ch} className="flex h-5 border-b border-gray-700/20 bg-gray-900/40">
                          <div className="sticky left-0 w-64 bg-gray-850 border-r border-gray-700/30 z-30 flex items-center px-3 gap-1.5" style={{ background: 'rgb(20,24,30)' }}>
                            <div className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                            <span className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">
                              {ch === 'translate' ? 'Position' : ch === 'rotate' ? 'Rotation' : 'Scale'}
                            </span>
                            <button
                              onClick={() => onAddBoneKeyframe([ch])}
                              className="ml-auto text-gray-600 hover:text-emerald-300 p-0.5"
                              title={`Key ${ch} channel only`}
                            ><Plus size={8}/></button>
                            <button
                              onClick={() => {
                                const sel = Array.from(selectedBoneFrameIndices).filter(i => channelAtFrame(i, ch));
                                if (sel.length > 0) onDeleteBoneKeyframes(sel, skeleton.id, [ch]);
                              }}
                              className="text-gray-600 hover:text-red-400 p-0.5"
                              title={`Delete selected ${ch} keys`}
                            ><Trash2 size={8}/></button>
                          </div>
                          <div className="flex relative">
                            {Array.from({ length: totalFrames }).map((_, i) => {
                              const hasChKey = channelAtFrame(i, ch);
                              const isSel = hasChKey && selectedBoneFrameIndices.has(i);
                              const isCurrent = i === currentFrameIndex;
                              return (
                                <div
                                  key={i}
                                  className={`flex-shrink-0 w-6 h-full border-r border-gray-700/10 relative cursor-pointer ${isCurrent ? 'bg-blue-500/5' : ''}`}
                                  onClick={(e) => {
                                    if (hasChKey) {
                                      setSelectedBoneFrameIndices(prev => {
                                        const next = new Set(e.ctrlKey || e.metaKey ? prev : []);
                                        next.has(i) ? next.delete(i) : next.add(i);
                                        return next;
                                      });
                                    } else {
                                      onSeek(i);
                                    }
                                  }}
                                >
                                  {isCurrent && <div className="absolute inset-0 border-l border-red-500 pointer-events-none opacity-20"/>}
                                  {hasChKey && (
                                    <div className={`absolute top-1 left-2 w-2 h-2 rounded-full border border-black/30 ${isSel ? `bg-white ${ring} ring-1` : dot}`} />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </React.Fragment>
                  );
                })}

                {/* LAYER ROWS */}
                {visibleRows.map(layer => {
                    const layerKeys = keyframesByLayer.get(layer.id) || {};
                    const isActive = layer.id === activeLayerId;

                    return (
                        <div key={layer.id} className={`flex h-7 border-b border-gray-700/30 group ${isActive ? 'bg-white/5' : ''}`}>
                            {/* Layer Header (Sticky Left) */}
                            <div 
                                className={`sticky left-0 w-64 border-r border-gray-700 z-30 flex items-center px-2 cursor-pointer group
                                    ${isActive ? 'bg-gray-700' : 'bg-gray-800 hover:bg-gray-700'}
                                `}
                                style={{ paddingLeft: `${layer.depth * 16 + 8}px` }}
                                onClick={() => selectLayer(layer.id, false, false)}
                            >
                                <div className="mr-2" onClick={(e) => { e.stopPropagation(); if(layer.type === 'GROUP' || layer.type === 'SWITCH') toggleExpand(layer.id); }}>
                                    {layer.type === 'GROUP' 
                                        ? (layer.isExpanded ? <FolderOpen size={12} className="text-yellow-500"/> : <Folder size={12} className="text-yellow-500"/>)
                                        : layer.type === 'SWITCH'
                                        ? (layer.isExpanded ? <FolderOpen size={12} className="text-green-400"/> : <Folder size={12} className="text-green-400"/>)
                                        : <ImageIcon size={12} className="text-blue-400"/>
                                    }
                                </div>
                                <span className="truncate flex-1 text-xs text-gray-300 select-none">{layer.name}</span>
                                
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-800/80 rounded px-1">
                                    {/* Sync Toggle — only for VECTOR layers */}
                                    {layer.type === 'VECTOR' && (
                                        <div onClick={(e) => { e.stopPropagation(); toggleSync(layer.id); }} className={`p-1 rounded hover:bg-black/20 ${layer.isSynced ? 'text-green-400' : 'text-gray-600'}`} title="Sync Timeline Actions">
                                            {layer.isSynced ? <Link2 size={12} /> : <Unlink size={12} />}
                                        </div>
                                    )}
                                    
                                    {/* Add Keyframe — SWITCH layers only get a key if they have children */}
                                    {layer.type !== 'GROUP' && (
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); addKeyframe(layer.id); }} 
                                            className={`p-1 rounded hover:bg-black/40 hover:text-white
                                                ${layer.type === 'SWITCH' ? 'text-green-600 hover:text-green-300' : 'text-gray-400'}`}
                                            title={layer.type === 'SWITCH' ? 'Add Switch Key (holds active child)' : 'Add Keyframe'}
                                        >
                                            <Plus size={10} />
                                        </button>
                                    )}

                                    {/* Delete Selected Layer Keys */}
                                    <button 
                                        onClick={(e) => handleDeleteLayerKeys(e, layer.id)} 
                                        className="p-1 rounded hover:bg-black/40 text-gray-400 hover:text-red-400" 
                                        title="Delete Selected Keys on Layer"
                                    >
                                        <Trash2 size={10} />
                                    </button>
                                </div>
                            </div>

                            {/* Track Content */}
                            <div className="flex relative">
                                {Array.from({ length: totalFrames }).map((_, i) => {
                                    const kf = layerKeys[i];
                                    const isSel = kf && selectedKeyframeIds.has(kf.id);
                                    const isCurrent = i === currentFrameIndex;

                                    return (
                                        <div 
                                            key={i}
                                            draggable={i !== 0}
                                            onClick={(e) => kf ? handleKeyframeClick(e, kf, layer) : handleEmptyClick(i)}
                                            onContextMenu={(e) => {
                                                if (layer.type === 'SWITCH') {
                                                    openSwitchMenu(e, { switchLayerId: layer.id, frameIndex: i });
                                                }
                                            }}
                                            onDragStart={(e) => handleDragStart(e, i, kf?.id, false)}
                                            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                                            onDrop={(e) => handleDrop(e, i)}
                                            className={`flex-shrink-0 w-6 h-full border-r border-gray-800 relative cursor-pointer
                                                ${isCurrent ? 'bg-blue-500/10' : ''}
                                                ${isSel ? 'bg-blue-600/20' : 'hover:bg-white/5'}
                                            `}
                                        >
                                            {isCurrent && <div className="absolute inset-0 border-l border-red-500 pointer-events-none opacity-50 z-0"/>}
                                            
                                            {kf && (
                                                <div 
                                                    className={`absolute top-1.5 left-1.5 w-3 h-3 rounded-sm rotate-45 border border-black/50 shadow-sm z-10
                                                        ${isSel ? 'bg-white scale-110 ring-1 ring-blue-500' : 
                                                          layer.type === 'SWITCH'
                                                            ? (kf.switchChildId ? 'bg-green-400' : 'bg-green-900 border-green-700')
                                                            : (kf.type === 'HOLD' ? 'bg-gray-500' : (kf.type === 'GENERATED' ? 'bg-purple-500' : 'bg-yellow-500'))}
                                                    `}
                                                    title={layer.type === 'SWITCH'
                                                        ? (kf.switchChildId
                                                            ? `Frame ${i+1}: Switch → ${layers.find(l => l.id === kf.switchChildId)?.name ?? kf.switchChildId}`
                                                            : `Frame ${i+1}: Switch (no child set — right-click to assign)`)
                                                        : `Frame ${i+1}: ${kf.type}`}
                                                ></div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>

        {switchMenu && (
            <div
                data-switch-menu="true"
                className="fixed z-[130] min-w-[200px] bg-gray-800 border border-gray-600 rounded shadow-xl py-1"
                style={{ left: `${switchMenu.position.x}px`, top: `${switchMenu.position.y}px` }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="px-3 py-1 text-[10px] text-gray-400 uppercase tracking-wider border-b border-gray-700 mb-1">
                    Switch at Frame {switchMenu.payload.frameIndex + 1}
                </div>
                {getSwitchCandidates(switchMenu.payload.switchLayerId).length === 0 && (
                    <div className="px-3 py-2 text-xs text-gray-500 italic">No child layers found</div>
                )}
                {getSwitchCandidates(switchMenu.payload.switchLayerId).map(candidate => {
                    // Check if this candidate is the currently active one at this frame
                    const activeChildId = keyframes
                        .filter(k => k.layerId === switchMenu.payload.switchLayerId && typeof k.switchChildId === 'string' && k.index <= switchMenu.payload.frameIndex)
                        .sort((a, b) => b.index - a.index)[0]?.switchChildId;
                    const isActive = activeChildId === candidate.id;

                    return (
                        <button
                            key={candidate.id}
                            className={`w-full text-left px-3 py-2 text-xs hover:bg-blue-600 flex items-center gap-2
                                ${isActive ? 'text-green-400 font-bold' : 'text-gray-200'}`}
                            onClick={() => {
                                onSetSwitchSelection(switchMenu.payload.switchLayerId, candidate.id, switchMenu.payload.frameIndex);
                                const layerToActivate = candidate.type === 'VECTOR' ? candidate.id : getFirstVectorDescendant(candidate.id);
                                if (layerToActivate) {
                                    selectLayer(layerToActivate, false, false);
                                }
                                closeSwitchMenu();
                            }}
                        >
                            {isActive && <span>▶</span>}
                            {!isActive && <span className="w-[10px]"/>}
                            {candidate.name}
                        </button>
                    );
                })}
            </div>
        )}

    </div>
  );
});
