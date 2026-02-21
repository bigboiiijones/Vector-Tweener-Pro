import React from 'react';
import { RigTool, RigMode, InheritMode } from './riggingTypes';
import {
  Bone, GitBranch, Crosshair, Layers, Link, Move, RotateCw, PlusCircle,
  Film, Edit3, Trash2, Maximize2, Zap, GitMerge
} from 'lucide-react';

interface RigToolbarProps {
  activeTool: RigTool;
  setActiveTool: (t: RigTool) => void;
  rigMode: RigMode;
  setRigMode: (m: RigMode) => void;
  inheritMode: InheritMode;
  setInheritMode: (m: InheritMode) => void;
  flexiBindEnabled: boolean;
  onCreateSkeleton: () => void;
  hasActiveSkeleton: boolean;
  activeLayerName: string;
  activeBoneId: string | null;
  activeBoneName: string;
  selectedBindPointCount: number;
  onBindSelectedPoints: () => void;
  onBindLayer: () => void;
  onFlexiBind: () => void;
  onDeleteSelectedBones: () => void;
  onAddBoneKey: () => void;
}

const SHARED_TOOLS: { id: RigTool; label: string; icon: React.ReactNode; shortcut: string }[] = [
  { id: 'BONE_SELECT', label: 'Select — click or drag-box',           icon: <Crosshair size={13} />, shortcut: 'V' },
  { id: 'BONE_MOVE',   label: 'Move — drag to translate',             icon: <Move size={13} />,      shortcut: 'G' },
  { id: 'BONE_ROTATE', label: 'Rotate — drag tail to rotate',         icon: <RotateCw size={13} />,  shortcut: 'R' },
  { id: 'BONE_SCALE',  label: 'Scale — drag to resize length',        icon: <Maximize2 size={13} />, shortcut: 'S' },
];

const EDIT_ONLY_TOOLS: { id: RigTool; label: string; icon: React.ReactNode; shortcut: string }[] = [
  { id: 'BONE_CREATE', label: 'Add Bone — click+drag',                icon: <Bone size={13} />,      shortcut: 'B' },
  { id: 'BONE_PARENT', label: 'Set Parent — click child then parent', icon: <GitBranch size={13} />, shortcut: 'P' },
  { id: 'BONE_DELETE', label: 'Delete selected bone',                 icon: <Trash2 size={13} />,    shortcut: 'X' },
];

const BIND_TOOLS: { id: RigTool; label: string; icon: React.ReactNode; shortcut: string }[] = [
  { id: 'BIND_POINTS', label: 'Bind Points — Ctrl+drag to add, Alt+drag to remove (overwrites layer bind)', icon: <Link size={13} />,   shortcut: 'N' },
  { id: 'BIND_LAYER',  label: 'Bind Layer — attach active layer to bone (overwrites point bind for layer)',  icon: <Layers size={13} />, shortcut: 'M' },
];

export const RigToolbar: React.FC<RigToolbarProps> = ({
  activeTool, setActiveTool,
  rigMode, setRigMode,
  inheritMode, setInheritMode,
  flexiBindEnabled,
  onCreateSkeleton,
  hasActiveSkeleton,
  activeLayerName,
  activeBoneId,
  activeBoneName,
  selectedBindPointCount,
  onBindSelectedPoints,
  onBindLayer,
  onFlexiBind,
  onDeleteSelectedBones,
  onAddBoneKey,
}) => {
  const isAnimate  = rigMode === 'ANIMATE';
  const isInherit  = inheritMode === 'INHERIT';

  const toolBtn = (active: boolean, color: 'yellow' | 'green' | 'cyan' | 'gray', disabled = false) => {
    const base = 'p-1.5 rounded transition-colors flex items-center justify-center';
    const dis  = disabled ? ' opacity-30 cursor-not-allowed' : '';
    const cols = {
      yellow: active ? 'bg-yellow-600 text-white ring-1 ring-yellow-400' : 'text-yellow-400/70 hover:bg-yellow-900/40 hover:text-yellow-200',
      green:  active ? 'bg-emerald-600 text-white ring-1 ring-emerald-400' : 'text-emerald-400/60 hover:bg-emerald-900/40 hover:text-emerald-200',
      cyan:   active ? 'bg-cyan-700 text-white ring-1 ring-cyan-400' : 'text-cyan-400/70 hover:bg-cyan-900/40 hover:text-cyan-200',
      gray:   active ? 'bg-gray-600 text-white' : 'text-gray-400/70 hover:bg-gray-700/60 hover:text-white',
    };
    return `${base}${dis} ${cols[color]}`;
  };

  const transformColor: 'yellow' | 'green' = isAnimate ? 'green' : 'yellow';

  return (
    <div className={`flex items-center gap-0.5 rounded-lg px-2 py-1.5 shadow-2xl pointer-events-auto select-none backdrop-blur-sm border transition-colors ${
      isAnimate ? 'bg-gray-900/95 border-emerald-600/60' : 'bg-gray-900/95 border-yellow-600/50'
    }`}>

      {/* ── Edit / Animate mode toggle ───────────────────────── */}
      <div className="flex items-center rounded overflow-hidden border border-gray-600/50 mr-1">
        <button
          onClick={() => setRigMode('EDIT')}
          title="Edit Mode — modifies rest pose, no keyframes created"
          className={`flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase tracking-wide transition-colors ${
            !isAnimate ? 'bg-yellow-600 text-white' : 'text-yellow-600/60 hover:text-yellow-400 hover:bg-yellow-900/30'
          }`}
        >
          <Edit3 size={10} /> Edit
        </button>
        <button
          onClick={() => setRigMode('ANIMATE')}
          title="Animate Mode — poses bones and auto-records keyframes"
          className={`flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase tracking-wide transition-colors ${
            isAnimate ? 'bg-emerald-600 text-white' : 'text-emerald-600/60 hover:text-emerald-400 hover:bg-emerald-900/30'
          }`}
        >
          <Film size={10} /> Pose
        </button>
      </div>

      {/* ── Inherit / Ignore parent toggle ───────────────────── */}
      <button
        onClick={() => setInheritMode(isInherit ? 'IGNORE_PARENT' : 'INHERIT')}
        title={isInherit
          ? 'Parent Inherit ON — children move with parent. Click to disable.'
          : 'Parent Inherit OFF — bones move independently. Click to enable.'}
        disabled={!hasActiveSkeleton}
        className={`flex items-center gap-0.5 px-1.5 py-1 rounded text-[9px] font-bold uppercase tracking-wide transition-colors disabled:opacity-30 border ${
          isInherit
            ? 'bg-violet-700/70 border-violet-500/60 text-violet-200 hover:bg-violet-600/70'
            : 'bg-gray-700/60 border-gray-600/40 text-gray-400 hover:bg-gray-600/60'
        }`}
      >
        <GitMerge size={10} />
        <span>{isInherit ? 'Chain' : 'Solo'}</span>
      </button>

      <div className="w-px h-5 bg-gray-600 mx-0.5" />

      {/* ── Shared transform tools (work in both modes) ──────── */}
      <span className={`text-[8px] font-bold uppercase tracking-widest px-0.5 ${isAnimate ? 'text-emerald-600/70' : 'text-yellow-600/70'}`}>
        Transform
      </span>
      {SHARED_TOOLS.map(tool => (
        <button
          key={tool.id}
          onClick={() => setActiveTool(tool.id)}
          title={`${tool.label} (${tool.shortcut}) · ${isAnimate ? 'Animate: auto-keys children' : 'Edit: moves rest pose'} · ${isInherit ? 'Chain: children follow' : 'Solo: bone only'}`}
          disabled={!hasActiveSkeleton}
          className={toolBtn(activeTool === tool.id, transformColor, !hasActiveSkeleton)}
        >
          {tool.icon}
        </button>
      ))}

      {/* ── Edit-only: rig structure tools ───────────────────── */}
      {!isAnimate && (
        <>
          <div className="w-px h-5 bg-gray-600 mx-0.5" />
          <span className="text-[8px] text-yellow-600/70 font-bold uppercase tracking-widest px-0.5">Rig</span>
          {EDIT_ONLY_TOOLS.map(tool => (
            <button
              key={tool.id}
              onClick={() => {
                if (tool.id === 'BONE_DELETE') { onDeleteSelectedBones(); return; }
                setActiveTool(tool.id);
              }}
              title={`${tool.label} (${tool.shortcut})`}
              disabled={!hasActiveSkeleton || (tool.id === 'BONE_DELETE' && !activeBoneId)}
              className={toolBtn(activeTool === tool.id, 'yellow', !hasActiveSkeleton || (tool.id === 'BONE_DELETE' && !activeBoneId))}
            >
              {tool.icon}
            </button>
          ))}
          <button
            onClick={onCreateSkeleton}
            title="New Skeleton for active layer"
            className="flex items-center gap-0.5 px-1.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-colors ml-0.5 bg-yellow-800/50 text-yellow-300 hover:bg-yellow-700/60 whitespace-nowrap"
          >
            <PlusCircle size={11} /> New
          </button>
        </>
      )}

      {/* ── Animate-only: manual keyframe button ─────────────── */}
      {isAnimate && (
        <>
          <div className="w-px h-5 bg-gray-600 mx-0.5" />
          <button
            onClick={onAddBoneKey}
            title="Record Bone Keyframe at current frame (K)"
            disabled={!hasActiveSkeleton}
            className="flex items-center gap-0.5 px-1.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-800/60 text-emerald-300 hover:bg-emerald-700/70 disabled:opacity-30 transition-colors whitespace-nowrap"
          >
            <Film size={10} /> Key
          </button>
        </>
      )}

      <div className="w-px h-5 bg-gray-600 mx-0.5" />

      {/* ── Bind tools ───────────────────────────────────────── */}
      <span className="text-[8px] text-cyan-600/70 font-bold uppercase tracking-widest px-0.5">Bind</span>
      {BIND_TOOLS.map(tool => (
        <button
          key={tool.id}
          onClick={() => setActiveTool(tool.id)}
          title={`${tool.label} (${tool.shortcut})`}
          disabled={!hasActiveSkeleton || !activeBoneId}
          className={toolBtn(activeTool === tool.id, 'cyan', !hasActiveSkeleton || !activeBoneId)}
        >
          {tool.icon}
        </button>
      ))}

      {/* Flexi-Bind toggle — shows ON/OFF state clearly */}
      <button
        onClick={onFlexiBind}
        title={flexiBindEnabled
          ? 'Flexi-Bind is ON — click to DISABLE and restore previous bindings'
          : 'Flexi-Bind — auto-weight all visible strokes by bone proximity'}
        disabled={!hasActiveSkeleton}
        className={`flex items-center gap-0.5 px-1.5 py-1 rounded text-[10px] font-bold uppercase tracking-wide transition-colors border disabled:opacity-30 whitespace-nowrap ${
          flexiBindEnabled
            ? 'bg-cyan-600 border-cyan-400 text-white ring-1 ring-cyan-400'
            : 'bg-gray-700/60 border-gray-600/40 text-cyan-400/70 hover:bg-cyan-900/40 hover:text-cyan-200'
        }`}
      >
        <Zap size={11} />
        {flexiBindEnabled ? 'Flexi ON' : 'Flexi'}
      </button>

      {/* Contextual: bind points action */}
      {activeTool === 'BIND_POINTS' && activeBoneId && (
        <>
          <div className="w-px h-5 bg-gray-600 mx-0.5" />
          <span className="text-[10px] whitespace-nowrap">
            {selectedBindPointCount > 0
              ? <span className="text-cyan-300">{selectedBindPointCount}pt</span>
              : <span className="text-gray-500">Ctrl+drag to select</span>
            }
          </span>
          {selectedBindPointCount > 0 && (
            <button
              onClick={onBindSelectedPoints}
              title="Bind selected points to active bone (clears layer bind for this layer)"
              className="ml-0.5 px-1.5 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-[10px] font-bold uppercase tracking-wider transition-colors whitespace-nowrap"
            >
              → {activeBoneName}
            </button>
          )}
        </>
      )}

      {/* Contextual: bind layer action */}
      {activeTool === 'BIND_LAYER' && activeBoneId && (
        <>
          <div className="w-px h-5 bg-gray-600 mx-0.5" />
          <button
            onClick={onBindLayer}
            title="Bind layer to bone (clears point binds for this layer's strokes)"
            className="px-1.5 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-[10px] font-bold uppercase tracking-wider transition-colors whitespace-nowrap"
          >
            "{activeLayerName}" → {activeBoneName}
          </button>
        </>
      )}

      {/* Active bone indicator */}
      {activeBoneId && (
        <>
          <div className="w-px h-5 bg-gray-700 mx-0.5" />
          <span className={`text-[9px] font-semibold whitespace-nowrap ${isAnimate ? 'text-emerald-300' : 'text-yellow-300'}`}>
            {activeBoneName}
          </span>
          {isAnimate && (
            <span className="ml-0.5 text-[8px] text-emerald-400/80 bg-emerald-900/40 px-1 py-0.5 rounded font-bold uppercase tracking-wide whitespace-nowrap">
              ⚡ Auto-Key
            </span>
          )}
          {!isInherit && (
            <span className="ml-0.5 text-[8px] text-violet-400/80 bg-violet-900/40 px-1 py-0.5 rounded font-bold uppercase tracking-wide whitespace-nowrap">
              Solo
            </span>
          )}
        </>
      )}
    </div>
  );
};
