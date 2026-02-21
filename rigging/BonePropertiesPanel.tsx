import React, { useState, useEffect } from 'react';
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

  useEffect(() => {
    if (bone) setLocalName(bone.name);
  }, [bone?.id]);

  if (!bone) {
    return (
      <div className="bg-gray-800 border border-yellow-600/30 rounded-lg p-3 text-xs text-gray-500 min-w-[160px]">
        <div className="flex items-center gap-1 text-yellow-400/60 mb-2 font-bold uppercase tracking-wider text-[10px]">
          <BoneIcon size={10} /> Bone Properties
        </div>
        <p className="text-gray-600">No bone selected</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 border border-yellow-600/40 rounded-lg p-3 text-xs min-w-[160px] shadow-xl">
      <div className="flex items-center justify-between mb-2 pb-1 border-b border-yellow-600/30">
        <span className="flex items-center gap-1 text-yellow-400 font-bold uppercase tracking-wider text-[10px]">
          <BoneIcon size={10} /> Bone
        </span>
        <button
          onClick={onDelete}
          title="Delete bone"
          className="text-red-400 hover:text-red-300 transition-colors"
        >
          <Trash2 size={11} />
        </button>
      </div>

      {/* Name */}
      <label className="block mb-2">
        <span className="text-gray-400 block mb-0.5">Name</span>
        <input
          type="text"
          value={localName}
          onChange={e => setLocalName(e.target.value)}
          onBlur={() => onRename(bone.id, localName)}
          onKeyDown={e => e.key === 'Enter' && onRename(bone.id, localName)}
          className="w-full bg-gray-700 text-white text-xs rounded px-2 py-1 border border-gray-600 focus:border-yellow-500 outline-none"
        />
      </label>

      {/* Color */}
      <label className="block mb-2">
        <span className="text-gray-400 block mb-0.5">Color</span>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={bone.color}
            onChange={e => onColorChange(bone.id, e.target.value)}
            className="w-7 h-7 rounded cursor-pointer bg-transparent border-0"
          />
          <span className="text-gray-400 font-mono text-[10px]">{bone.color}</span>
        </div>
      </label>

      {/* Strength */}
      <label className="block mb-2">
        <span className="text-gray-400 block mb-0.5">Strength: {Math.round(bone.strength * 100)}%</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={bone.strength}
          onChange={e => onStrengthChange(bone.id, parseFloat(e.target.value))}
          className="w-full accent-yellow-500"
        />
      </label>

      {/* Info */}
      <div className="mt-2 pt-2 border-t border-gray-700 text-gray-500 text-[10px] font-mono space-y-0.5">
        <div>Length: {Math.round(bone.length)}px</div>
        <div>Angle: {Math.round((bone.angle * 180) / Math.PI)}°</div>
        <div>Parent: {bone.parentBoneId ? 'Yes' : 'None'}</div>
      </div>
    </div>
  );
};
