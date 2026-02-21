import React, { useState } from 'react';
import { Bone as BoneIcon, ChevronDown, ChevronRight, Link, Layers, X, Eye } from 'lucide-react';
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
  isVisible: boolean;
  onToggle: () => void;
}

export const RigPanel: React.FC<RigPanelProps> = ({
  skeletons,
  activeSkeletonId,
  selectedBoneIds,
  activeBoneId,
  boundLayers,
  layers,
  onSelectSkeleton,
  onSelectBone,
  onUnbindLayer,
  isVisible,
  onToggle,
}) => {
  const [expandedSkeletons, setExpandedSkeletons] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedSkeletons(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div
      className={`bg-gray-800 border-l border-gray-700 flex flex-col transition-all duration-200 ${
        isVisible ? 'w-48' : 'w-8'
      }`}
      style={{ minWidth: isVisible ? 192 : 32 }}
    >
      {/* Toggle button */}
      <button
        onClick={onToggle}
        className="h-8 flex items-center justify-center text-yellow-400/70 hover:text-yellow-400 border-b border-gray-700 shrink-0"
        title={isVisible ? 'Hide Rig Panel' : 'Show Rig Panel'}
      >
        <BoneIcon size={14} />
      </button>

      {isVisible && (
        <div className="flex-1 overflow-y-auto text-xs">
          <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-yellow-400/70 border-b border-gray-700">
            Skeletons
          </div>

          {skeletons.length === 0 && (
            <div className="px-3 py-3 text-gray-600 text-[10px]">
              No skeletons yet.<br/>Select Rig Mode &amp; create one.
            </div>
          )}

          {skeletons.map(skeleton => {
            const isActive = skeleton.id === activeSkeletonId;
            const isExpanded = expandedSkeletons.has(skeleton.id);

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
                    className="text-gray-500 hover:text-gray-300"
                  >
                    {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                  </button>
                  <BoneIcon size={10} className={isActive ? 'text-yellow-400' : 'text-gray-500'} />
                  <span className="flex-1 truncate text-[11px]">{skeleton.name}</span>
                  <span className="text-gray-600 text-[9px]">{skeleton.bones.length}b</span>
                </div>

                {/* Bones list */}
                {isExpanded && skeleton.bones.map(bone => {
                  const isSelected = selectedBoneIds.has(bone.id);
                  const isParent = skeleton.bones.some(b => b.parentBoneId === bone.id);
                  return (
                    <div
                      key={bone.id}
                      onClick={() => onSelectBone(bone.id)}
                      className={`flex items-center gap-1 pl-6 pr-2 py-0.5 cursor-pointer select-none ${
                        isSelected ? 'bg-yellow-700/30 text-yellow-200' : 'text-gray-400 hover:bg-gray-700'
                      }`}
                    >
                      <div
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: bone.color }}
                      />
                      <span className="flex-1 truncate text-[10px]">{bone.name}</span>
                      {bone.parentBoneId && (
                        <span className="text-indigo-400 text-[8px]" title="Has parent">↑</span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Bound Layers section */}
          {boundLayers.length > 0 && (
            <>
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-cyan-400/70 border-b border-t border-gray-700 mt-2">
                Bound Layers
              </div>
              {boundLayers.map(bl => {
                const layer = layers.find(l => l.id === bl.layerId);
                const skeleton = skeletons.find(s => s.id === bl.skeletonId);
                const bone = skeleton?.bones.find(b => b.id === bl.boneId);
                return (
                  <div key={bl.layerId} className="flex items-center gap-1 px-2 py-0.5 text-gray-400">
                    <Layers size={9} className="text-cyan-400 shrink-0" />
                    <span className="flex-1 truncate text-[10px]">{layer?.name || bl.layerId}</span>
                    <span className="text-gray-600 text-[9px] truncate max-w-[40px]">{bone?.name || '?'}</span>
                    <button
                      onClick={() => onUnbindLayer(bl.layerId)}
                      className="text-red-400/60 hover:text-red-400 ml-1"
                      title="Unbind layer"
                    >
                      <X size={9} />
                    </button>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
};
