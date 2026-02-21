import React from 'react';
import { RigTool } from './riggingTypes';
import { Bone, GitBranch, Crosshair, Layers, Link, Move, RotateCw, PlusCircle } from 'lucide-react';

interface RigToolbarProps {
  activeTool: RigTool;
  setActiveTool: (t: RigTool) => void;
  onCreateSkeleton: () => void;
  hasActiveSkeleton: boolean;
  activeLayerName: string;
  activeBoneId: string | null;
  activeBoneName: string;
  selectedBindPointCount: number;
  onBindSelectedPoints: () => void;
  onBindLayer: () => void;
}

const RIG_TOOLS: { id: RigTool; label: string; icon: React.ReactNode; shortcut: string; group: string }[] = [
  { id: 'BONE_CREATE', label: 'Add Bone — click+drag to place a bone', icon: <Bone size={14} />, shortcut: 'B', group: 'bones' },
  { id: 'BONE_SELECT', label: 'Select Bone — click or drag-box to select', icon: <Crosshair size={14} />, shortcut: 'V', group: 'bones' },
  { id: 'BONE_MOVE', label: 'Move Bone — drag to translate selected bone', icon: <Move size={14} />, shortcut: 'G', group: 'bones' },
  { id: 'BONE_ROTATE', label: 'Rotate Bone — drag to rotate around bone head', icon: <RotateCw size={14} />, shortcut: 'R', group: 'bones' },
  { id: 'BONE_PARENT', label: 'Set Parent — click child bone then parent bone', icon: <GitBranch size={14} />, shortcut: 'P', group: 'bones' },
  { id: 'BIND_POINTS', label: 'Bind Points — Ctrl+click/drag to add, Alt+click/drag to remove', icon: <Link size={14} />, shortcut: 'N', group: 'bind' },
  { id: 'BIND_LAYER', label: 'Bind Layer — attach active layer to selected bone', icon: <Layers size={14} />, shortcut: 'M', group: 'bind' },
];

export const RigToolbar: React.FC<RigToolbarProps> = ({
  activeTool,
  setActiveTool,
  onCreateSkeleton,
  hasActiveSkeleton,
  activeLayerName,
  activeBoneId,
  activeBoneName,
  selectedBindPointCount,
  onBindSelectedPoints,
  onBindLayer,
}) => {
  const boneTools = RIG_TOOLS.filter(t => t.group === 'bones');
  const bindTools = RIG_TOOLS.filter(t => t.group === 'bind');

  return (
    <div className="flex items-center gap-1 bg-gray-900/95 border border-yellow-600/50 rounded-lg px-2 py-1.5 shadow-2xl pointer-events-auto select-none backdrop-blur-sm">
      {/* Rig label */}
      <span className="text-yellow-500 text-[10px] font-black uppercase tracking-widest flex items-center gap-1 pr-2 border-r border-yellow-700/50">
        <Bone size={11} /> Rig
      </span>

      {/* New Skeleton button */}
      <button
        onClick={onCreateSkeleton}
        title="Create a new skeleton for the active layer"
        className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-colors whitespace-nowrap ${
          !hasActiveSkeleton
            ? 'bg-yellow-600 hover:bg-yellow-500 text-white'
            : 'bg-gray-700 hover:bg-gray-600 text-yellow-400/70'
        }`}
      >
        <PlusCircle size={11} />
        {hasActiveSkeleton ? 'New Skel' : 'New Skeleton'}
      </button>

      <div className="w-px h-5 bg-yellow-700/40 mx-1" />

      {/* Bone tools */}
      {boneTools.map(tool => (
        <button
          key={tool.id}
          onClick={() => setActiveTool(tool.id)}
          title={`${tool.label} (${tool.shortcut})`}
          disabled={!hasActiveSkeleton}
          className={`p-1.5 rounded transition-colors flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed ${
            activeTool === tool.id
              ? 'bg-yellow-600 text-white ring-1 ring-yellow-400'
              : 'text-yellow-400/70 hover:bg-yellow-900/50 hover:text-yellow-300'
          }`}
        >
          {tool.icon}
        </button>
      ))}

      <div className="w-px h-5 bg-yellow-700/40 mx-1" />

      {/* Bind tools */}
      {bindTools.map(tool => (
        <button
          key={tool.id}
          onClick={() => setActiveTool(tool.id)}
          title={`${tool.label} (${tool.shortcut})`}
          disabled={!hasActiveSkeleton || !activeBoneId}
          className={`p-1.5 rounded transition-colors flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed ${
            activeTool === tool.id
              ? 'bg-cyan-700 text-white ring-1 ring-cyan-400'
              : 'text-cyan-400/70 hover:bg-cyan-900/50 hover:text-cyan-300'
          }`}
        >
          {tool.icon}
        </button>
      ))}

      {/* Contextual bind points action */}
      {activeTool === 'BIND_POINTS' && activeBoneId && (
        <>
          <div className="w-px h-5 bg-gray-600 mx-1" />
          <span className="text-[10px] whitespace-nowrap">
            {selectedBindPointCount > 0
              ? <span className="text-cyan-300">{selectedBindPointCount} pt{selectedBindPointCount !== 1 ? 's' : ''}</span>
              : <span className="text-gray-500">Ctrl+drag to select</span>
            }
          </span>
          {selectedBindPointCount > 0 && (
            <button
              onClick={onBindSelectedPoints}
              className="ml-1 px-2 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-[10px] font-bold uppercase tracking-wider transition-colors whitespace-nowrap"
            >
              Bind → {activeBoneName}
            </button>
          )}
        </>
      )}

      {/* Contextual bind layer action */}
      {activeTool === 'BIND_LAYER' && activeBoneId && (
        <>
          <div className="w-px h-5 bg-gray-600 mx-1" />
          <button
            onClick={onBindLayer}
            className="px-2 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-[10px] font-bold uppercase tracking-wider transition-colors whitespace-nowrap"
          >
            Bind "{activeLayerName}" → {activeBoneName}
          </button>
        </>
      )}

      {/* Active bone indicator */}
      {activeBoneId && (
        <>
          <div className="w-px h-5 bg-gray-700 mx-1" />
          <span className="text-[9px] text-yellow-400/60 whitespace-nowrap">
            bone: <span className="text-yellow-300 font-semibold">{activeBoneName}</span>
          </span>
        </>
      )}
    </div>
  );
};
