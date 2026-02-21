import React, { useState, useEffect, useRef } from 'react';
import { Bone as BoneIcon, Trash2 } from 'lucide-react';
import { Bone } from './riggingTypes';

interface BonePropertiesPanelProps {
  bone: Bone | null;
  onRename: (id: string, name: string) => void;
  onColorChange: (id: string, color: string) => void;
  onStrengthChange: (id: string, strength: number) => void;
  onDelete: () => void;
}

export const BonePropertiesPanel: React.FC<BonePropertiesPanelProps> = ({
  bone,
  onRename,
  onColorChange,
  onStrengthChange,
  onDelete,
}) => {
  const [localName, setLocalName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (bone) setLocalName(bone.name);
  }, [bone?.id]);

  // Stop canvas from capturing pointer events when interacting with this panel
  const stopProp = (e: React.SyntheticEvent) => e.stopPropagation();

  if (!bone) {
    return (
      <div
        className="bg-gray-900/90 border border-yellow-600/30 rounded-lg p-3 text-xs min-w-[150px] shadow-xl backdrop-blur-sm"
        onMouseDown={stopProp}
        onPointerDown={stopProp}
      >
        <div className="flex items-center gap-1 text-yellow-400/60 font-bold uppercase tracking-wider text-[10px]">
          <BoneIcon size={10} /> Bone Properties
        </div>
        <p className="text-gray-600 mt-1 text-[10px]">No bone selected</p>
      </div>
    );
  }

  const commitName = () => {
    if (localName.trim() && localName !== bone.name) {
      onRename(bone.id, localName.trim());
    }
  };

  return (
    <div
      className="bg-gray-900/90 border border-yellow-600/40 rounded-lg p-3 text-xs min-w-[150px] shadow-xl backdrop-blur-sm"
      onMouseDown={stopProp}
      onPointerDown={stopProp}
    >
      <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-yellow-700/40">
        <span className="flex items-center gap-1 text-yellow-400 font-bold uppercase tracking-wider text-[10px]">
          <BoneIcon size={10} /> Bone
        </span>
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          title="Delete bone"
          className="text-red-400/70 hover:text-red-400 transition-colors"
        >
          <Trash2 size={11} />
        </button>
      </div>

      {/* Name — click to focus, Enter or blur to commit */}
      <div className="mb-2">
        <span className="text-gray-500 block mb-0.5 text-[9px] uppercase tracking-wider">Name</span>
        <input
          ref={inputRef}
          type="text"
          value={localName}
          onChange={e => setLocalName(e.target.value)}
          onBlur={commitName}
          onKeyDown={e => {
            e.stopPropagation();
            if (e.key === 'Enter') { commitName(); inputRef.current?.blur(); }
            if (e.key === 'Escape') { setLocalName(bone.name); inputRef.current?.blur(); }
          }}
          onMouseDown={e => e.stopPropagation()}
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); (e.target as HTMLInputElement).focus(); }}
          className="w-full bg-gray-800 text-white text-xs rounded px-2 py-1 border border-gray-600 focus:border-yellow-500 outline-none cursor-text"
          style={{ pointerEvents: 'auto' }}
        />
      </div>

      {/* Color */}
      <div className="mb-2">
        <span className="text-gray-500 block mb-0.5 text-[9px] uppercase tracking-wider">Color</span>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={bone.color}
            onChange={e => { e.stopPropagation(); onColorChange(bone.id, e.target.value); }}
            onMouseDown={e => e.stopPropagation()}
            className="w-6 h-6 rounded cursor-pointer bg-transparent border-0"
            style={{ pointerEvents: 'auto' }}
          />
          <span className="text-gray-500 font-mono text-[9px]">{bone.color}</span>
        </div>
      </div>

      {/* Strength */}
      <div className="mb-2">
        <span className="text-gray-500 block mb-0.5 text-[9px] uppercase tracking-wider">
          Strength {Math.round(bone.strength * 100)}%
        </span>
        <input
          type="range"
          min={0} max={1} step={0.01}
          value={bone.strength}
          onChange={e => { e.stopPropagation(); onStrengthChange(bone.id, parseFloat(e.target.value)); }}
          onMouseDown={e => e.stopPropagation()}
          className="w-full accent-yellow-500"
          style={{ pointerEvents: 'auto' }}
        />
      </div>

      {/* Read-only info */}
      <div className="pt-1.5 border-t border-gray-700/60 text-gray-600 text-[9px] font-mono space-y-0.5">
        <div>Len: {Math.round(bone.length)}px &nbsp; ∠{Math.round((bone.angle * 180) / Math.PI)}°</div>
        <div>Parent: {bone.parentBoneId ? '✓' : '—'}</div>
      </div>
    </div>
  );
};
