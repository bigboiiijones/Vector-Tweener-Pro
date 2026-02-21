import React from 'react';
import { RigTool } from './riggingTypes';
import { Bone, GitBranch, Crosshair, Layers, Link } from 'lucide-react';

interface RigToolbarProps {
  activeTool: RigTool;
  setActiveTool: (t: RigTool) => void;
  onCreateSkeleton: () => void;
  hasActiveSkeleton: boolean;
}

const RIG_TOOLS: { id: RigTool; label: string; icon: React.ReactNode; shortcut: string }[] = [
  { id: 'BONE_CREATE', label: 'Add Bone — click+drag to create bone', icon: <Bone size={16} />, shortcut: 'B' },
  { id: 'BONE_SELECT', label: 'Select Bone — click to select, drag tail to rotate', icon: <Crosshair size={16} />, shortcut: 'V' },
  { id: 'BONE_PARENT', label: 'Set Parent — click child bone then parent bone', icon: <GitBranch size={16} />, shortcut: 'P' },
  { id: 'BIND_POINTS', label: 'Bind Points — click stroke control points to bind to selected bone', icon: <Link size={16} />, shortcut: 'N' },
  { id: 'BIND_LAYER', label: 'Bind Layer — binds entire active layer to selected bone', icon: <Layers size={16} />, shortcut: 'M' },
];

export const RigToolbar: React.FC<RigToolbarProps> = ({
  activeTool,
  setActiveTool,
  onCreateSkeleton,
  hasActiveSkeleton,
}) => {
  return (
    <div className="flex flex-col gap-1 bg-gray-800 border border-yellow-600/40 rounded-lg p-2 shadow-xl">
      <div className="text-yellow-400 text-[10px] font-bold uppercase tracking-widest px-1 pb-1 border-b border-yellow-600/30 flex items-center gap-1">
        <Bone size={10} /> Rig
      </div>

      {!hasActiveSkeleton && (
        <button
          onClick={onCreateSkeleton}
          className="text-[10px] bg-yellow-600 hover:bg-yellow-500 text-white rounded px-2 py-1 font-bold uppercase tracking-wider transition-colors whitespace-nowrap"
          title="Create Skeleton for this layer"
        >
          + New Skeleton
        </button>
      )}

      {RIG_TOOLS.map(tool => (
        <button
          key={tool.id}
          onClick={() => setActiveTool(tool.id)}
          title={`${tool.label} (${tool.shortcut})`}
          className={`p-2 rounded flex items-center justify-center transition-colors ${
            activeTool === tool.id
              ? 'bg-yellow-600 text-white'
              : 'text-yellow-400/70 hover:bg-yellow-900/40 hover:text-yellow-300'
          }`}
          disabled={!hasActiveSkeleton && tool.id !== 'BONE_CREATE'}
        >
          {tool.icon}
        </button>
      ))}
    </div>
  );
};
