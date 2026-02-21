import React, { useState, useRef, useCallback } from 'react';
import {
  Bone as BoneIcon, ChevronDown, ChevronRight,
  Layers, X, Link2, Unlink
} from 'lucide-react';
import { Skeleton, BoundLayer } from './riggingTypes';
import { Layer } from '../types';

interface RigPanelProps {
  skeletons: Skeleton[];
  activeSkeletonId: string | null;
  selectedBoneIds: Set<string>;
  activeBoneId: string | null;
  boundLayers: BoundLayer[];
  layers: Layer[];
  onSelectSkeleton: (id: string) => void;
  onSelectBone: (id: string, multi?: boolean) => void;
  onUnbindLayer: (layerId: string) => void;
  onRenameSkeleton: (skeletonId: string, name: string) => void;
  onRenameBone: (boneId: string, name: string) => void;
  onSetBoneParent: (childBoneId: string, parentBoneId: string | null) => void;
  isVisible: boolean;
  onToggle: () => void;
}

// Double-click-to-edit inline label
const InlineLabel: React.FC<{
  value: string;
  onCommit: (v: string) => void;
  className?: string;
}> = ({ value, onCommit, className = '' }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  const start = () => { setDraft(value); setEditing(true); setTimeout(() => inputRef.current?.select(), 0); };
  const commit = () => {
    const t = draft.trim();
    if (t && t !== value) onCommit(t);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEditing(false);
          e.stopPropagation();
        }}
        onClick={e => e.stopPropagation()}
        className={`bg-gray-700 border border-yellow-500 rounded px-1 outline-none text-yellow-200 ${className}`}
        style={{ width: '100%', minWidth: 50 }}
        autoFocus
      />
    );
  }
  return (
    <span
      className={`cursor-default ${className}`}
      onDoubleClick={e => { e.stopPropagation(); start(); }}
      title="Double-click to rename"
    >
      {value}
    </span>
  );
};

export const RigPanel: React.FC<RigPanelProps> = ({
  skeletons, activeSkeletonId, selectedBoneIds, activeBoneId,
  boundLayers, layers,
  onSelectSkeleton, onSelectBone, onUnbindLayer,
  onRenameSkeleton, onRenameBone, onSetBoneParent,
  isVisible, onToggle,
}) => {
  const [expandedSkeletons, setExpandedSkeletons] = useState<Set<string>>(new Set());
  const [dragBoneId, setDragBoneId] = useState<string | null>(null);
  const [dragOverBoneId, setDragOverBoneId] = useState<string | null>(null);
  // Pick-parent mode: first click = child, second click = parent
  const [pendingChildId, setPendingChildId] = useState<string | null>(null);

  const toggleExpand = (id: string) =>
    setExpandedSkeletons(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const handleBoneClick = (boneId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (pendingChildId !== null) {
      if (pendingChildId !== boneId) onSetBoneParent(pendingChildId, boneId);
      setPendingChildId(null);
      return;
    }
    onSelectBone(boneId, e.ctrlKey || e.metaKey);
  };

  return (
    <div
      className={`bg-gray-800 border-l border-gray-700 flex flex-col transition-all duration-200 ${isVisible ? 'w-52' : 'w-8'}`}
      style={{ minWidth: isVisible ? 208 : 32 }}
    >
      <button
        onClick={onToggle}
        className="h-8 flex items-center justify-center text-yellow-400/70 hover:text-yellow-400 border-b border-gray-700 shrink-0"
        title={isVisible ? 'Hide Rig Panel' : 'Show Rig Panel'}
      >
        <BoneIcon size={14} />
      </button>

      {isVisible && (
        <div className="flex-1 overflow-y-auto text-xs">
          {/* Header */}
          <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-yellow-400/70 border-b border-gray-700 flex items-center justify-between">
            <span>Skeletons</span>
            {/* Drop zone to remove parent */}
            {dragBoneId && (
              <div
                className="text-[9px] text-red-300 bg-red-900/30 px-1.5 py-0.5 rounded border border-red-700/40 cursor-pointer"
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault();
                  const src = e.dataTransfer.getData('text/bone');
                  if (src) onSetBoneParent(src, null);
                  setDragBoneId(null); setDragOverBoneId(null);
                }}
                title="Drop here to unparent"
              >
                ✕ Remove Parent
              </div>
            )}
          </div>

          {/* Pick-parent hint banner */}
          {pendingChildId && (
            <div className="px-2 py-1.5 bg-indigo-900/50 border-b border-indigo-700/40 text-indigo-300 text-[10px] flex items-center justify-between">
              <span>Click a <b>parent</b> bone →</span>
              <button onClick={() => setPendingChildId(null)} className="text-gray-500 hover:text-gray-200 text-[10px]">✕</button>
            </div>
          )}

          {skeletons.length === 0 && (
            <div className="px-3 py-3 text-gray-600 text-[10px]">No skeletons yet.<br/>Create one in Rig Mode.</div>
          )}

          {skeletons.map(skeleton => {
            const isActive   = skeleton.id === activeSkeletonId;
            const isExpanded = expandedSkeletons.has(skeleton.id);

            // Build parent→children index for tree rendering
            const childrenMap = new Map<string | null, string[]>();
            skeleton.bones.forEach(b => {
              const pid = b.parentBoneId ?? null;
              if (!childrenMap.has(pid)) childrenMap.set(pid, []);
              childrenMap.get(pid)!.push(b.id);
            });

            const renderBoneTree = (parentId: string | null, depth: number): React.ReactNode[] =>
              (childrenMap.get(parentId) ?? []).flatMap(boneId => {
                const bone = skeleton.bones.find(b => b.id === boneId);
                if (!bone) return [];
                const isSelected    = selectedBoneIds.has(boneId);
                const isDragOver    = dragOverBoneId === boneId;
                const isPendChild   = pendingChildId === boneId;
                const hasChildren   = (childrenMap.get(boneId) ?? []).length > 0;

                return [
                  <div
                    key={boneId}
                    draggable
                    onDragStart={e => {
                      setDragBoneId(boneId);
                      e.dataTransfer.effectAllowed = 'link';
                      e.dataTransfer.setData('text/bone', boneId);
                    }}
                    onDragEnd={() => { setDragBoneId(null); setDragOverBoneId(null); }}
                    onDragOver={e => { e.preventDefault(); setDragOverBoneId(boneId); }}
                    onDragLeave={() => setDragOverBoneId(null)}
                    onDrop={e => {
                      e.preventDefault(); e.stopPropagation();
                      const src = e.dataTransfer.getData('text/bone');
                      if (src && src !== boneId) onSetBoneParent(src, boneId);
                      setDragBoneId(null); setDragOverBoneId(null);
                    }}
                    onClick={e => handleBoneClick(boneId, e)}
                    className={`flex items-center gap-1 pr-1 py-0.5 cursor-pointer select-none group transition-colors ${
                      isDragOver    ? 'bg-indigo-700/50 ring-1 ring-inset ring-indigo-400' :
                      isPendChild   ? 'bg-indigo-900/40 text-indigo-200' :
                      isSelected    ? 'bg-yellow-700/30 text-yellow-200' :
                                      'text-gray-400 hover:bg-gray-700'
                    }`}
                    style={{ paddingLeft: `${6 + depth * 14}px` }}
                    title={dragBoneId && dragBoneId !== boneId
                      ? 'Drop here → set as parent'
                      : 'Click to select · Drag to parent · Dbl-click name to rename'}
                  >
                    {/* Tree indent connector */}
                    {depth > 0 && <span className="text-gray-700 text-[8px] shrink-0 -ml-1">└</span>}

                    {/* Bone color dot */}
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: bone.color }} />

                    {/* Inline rename */}
                    <InlineLabel
                      value={bone.name}
                      onCommit={name => onRenameBone(boneId, name)}
                      className="flex-1 truncate text-[10px]"
                    />

                    {/* Parent-link icon */}
                    {bone.parentBoneId && (
                      <button
                        onClick={e => { e.stopPropagation(); onSetBoneParent(boneId, null); }}
                        className="text-indigo-400/50 hover:text-red-400 shrink-0 opacity-60 hover:opacity-100"
                        title="Remove parent"
                      ><Unlink size={8} /></button>
                    )}

                    {/* Set-parent button (when no parent yet) */}
                    {!bone.parentBoneId && !pendingChildId && (
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          onSelectBone(boneId);
                          setPendingChildId(boneId);
                        }}
                        className="text-gray-600 hover:text-indigo-400 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Set parent — click this, then click the parent bone"
                      ><Link2 size={8} /></button>
                    )}

                    {/* Has-children indicator */}
                    {hasChildren && (
                      <span className="text-gray-600 text-[8px] shrink-0">▾</span>
                    )}
                  </div>,
                  ...renderBoneTree(boneId, depth + 1),
                ];
              });

            return (
              <div key={skeleton.id}>
                {/* Skeleton row */}
                <div
                  className={`flex items-center gap-1 px-2 py-1 cursor-pointer select-none ${
                    isActive ? 'bg-yellow-900/30 text-yellow-300' : 'text-gray-300 hover:bg-gray-700'
                  }`}
                  onClick={() => onSelectSkeleton(skeleton.id)}
                >
                  <button
                    onClick={e => { e.stopPropagation(); toggleExpand(skeleton.id); }}
                    className="text-gray-500 hover:text-gray-300 shrink-0"
                  >
                    {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                  </button>
                  <BoneIcon size={10} className={`${isActive ? 'text-yellow-400' : 'text-gray-500'} shrink-0`} />
                  <InlineLabel
                    value={skeleton.name}
                    onCommit={name => onRenameSkeleton(skeleton.id, name)}
                    className={`flex-1 text-[11px] truncate font-semibold ${isActive ? 'text-yellow-200' : ''}`}
                  />
                  <span className="text-gray-600 text-[9px] shrink-0">{skeleton.bones.length}b</span>
                </div>

                {/* Bone tree */}
                {isExpanded && (
                  <>
                    {renderBoneTree(null, 0)}
                    {skeleton.bones.length === 0 && (
                      <div className="pl-6 py-1 text-[9px] text-gray-600">No bones yet</div>
                    )}
                  </>
                )}
              </div>
            );
          })}

          {/* Bound Layers */}
          {boundLayers.length > 0 && (
            <>
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-cyan-400/70 border-b border-t border-gray-700 mt-2">
                Bound Layers
              </div>
              {boundLayers.map(bl => {
                const layer    = layers.find(l => l.id === bl.layerId);
                const skeleton = skeletons.find(s => s.id === bl.skeletonId);
                const bone     = skeleton?.bones.find(b => b.id === bl.boneId);
                return (
                  <div key={bl.layerId} className="flex items-center gap-1 px-2 py-0.5 text-gray-400">
                    <Layers size={9} className="text-cyan-400 shrink-0" />
                    <span className="flex-1 truncate text-[10px]">{layer?.name || bl.layerId}</span>
                    <span className="text-gray-600 text-[9px] truncate max-w-[40px]">{bone?.name || '?'}</span>
                    <button onClick={() => onUnbindLayer(bl.layerId)} className="text-red-400/60 hover:text-red-400 ml-1 shrink-0" title="Unbind">
                      <X size={9} />
                    </button>
                  </div>
                );
              })}
            </>
          )}

          {/* Hint */}
          {skeletons.some(s => s.bones.length > 1) && !dragBoneId && !pendingChildId && (
            <div className="px-2 py-2 text-[9px] text-gray-600 border-t border-gray-700/40 mt-1 leading-relaxed">
              Drag bone → bone to parent<br/>
              🔗 icon → pick parent mode<br/>
              Double-click name to rename
            </div>
          )}
        </div>
      )}
    </div>
  );
};
