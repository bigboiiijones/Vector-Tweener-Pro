import React, { useState } from 'react';
import { Layer } from '../types';
import { Eye, EyeOff, Lock, Unlock, Folder, FolderOpen, Image as ImageIcon, Plus, Trash2, Layers, GitBranch } from 'lucide-react';
import { useContextMenu } from '../hooks/useContextMenu';

interface LayerPanelProps {
    flattenedLayers: Layer[];
    selectedLayerIds: Set<string>;
    activeLayerId: string;
    onSelect: (id: string, ctrl: boolean, shift: boolean) => void;
    onToggleVis: (id: string) => void;
    onToggleLock: (id: string) => void;
    onToggleExpand: (id: string) => void;
    onAddLayer: () => void;
    onAddGroup: () => void;
    onAddSwitch: () => void;
    onDelete: () => void;
    onMoveLayer: (dragId: string, targetId: string, pos: 'top'|'bottom'|'inside') => void;
    onConvertGroupToSwitch: (id: string) => void;
}

export const LayerPanel: React.FC<LayerPanelProps> = React.memo(({
    flattenedLayers,
    selectedLayerIds,
    activeLayerId,
    onSelect,
    onToggleVis,
    onToggleLock,
    onToggleExpand,
    onAddLayer,
    onAddGroup,
    onAddSwitch,
    onDelete,
    onMoveLayer,
    onConvertGroupToSwitch
}) => {
    const [dragOverInfo, setDragOverInfo] = useState<{ id: string, position: 'top'|'bottom'|'inside' } | null>(null);
    const { menu, openMenu, closeMenu } = useContextMenu<Layer>();

    const handleDragStart = (e: React.DragEvent, id: string) => {
        e.dataTransfer.setData('layerId', id);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e: React.DragEvent, layer: Layer) => {
        e.preventDefault();
        e.stopPropagation();

        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const y = e.clientY - rect.top;
        const height = rect.height;

        let position: 'top' | 'bottom' | 'inside' = 'bottom';

        if (layer.type === 'GROUP' || layer.type === 'SWITCH') {
            if (y < height * 0.25) position = 'top';
            else if (y > height * 0.75) position = 'bottom';
            else position = 'inside';
        } else {
            if (y < height * 0.5) position = 'top';
            else position = 'bottom';
        }

        setDragOverInfo({ id: layer.id, position });
    };

    const handleDragLeave = () => {
        setDragOverInfo(null);
    };

    const handleDrop = (e: React.DragEvent, targetId: string) => {
        e.preventDefault();
        const dragId = e.dataTransfer.getData('layerId');

        if (dragId && dragId !== targetId && dragOverInfo) {
            onMoveLayer(dragId, targetId, dragOverInfo.position);
        }
        setDragOverInfo(null);
    };

    return (
        <div className="flex flex-col bg-gray-900 border-l border-gray-700 w-64 h-full pointer-events-auto select-none" onClick={closeMenu}>
            <div className="h-10 bg-gray-800 border-b border-gray-700 flex items-center justify-between px-2">
                <div className="flex items-center gap-1 text-gray-400 text-xs font-bold uppercase">
                    <Layers size={14} /> Layers
                </div>
                <div className="flex gap-1">
                    <button onClick={onAddLayer} title="New Vector Layer" className="p-1 hover:bg-gray-700 rounded text-gray-300"><Plus size={14} /></button>
                    <button onClick={onAddGroup} title="New Group" className="p-1 hover:bg-gray-700 rounded text-gray-300"><Folder size={14} /></button>
                    <button onClick={onAddSwitch} title="New Switch Layer" className="p-1 hover:bg-gray-700 rounded text-gray-300"><GitBranch size={14} /></button>
                    <button onClick={onDelete} title="Delete Selected" className="p-1 hover:bg-red-900/50 rounded text-gray-300 hover:text-red-400"><Trash2 size={14} /></button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#1a1a1a]">
                {flattenedLayers.map(layer => {
                    const isSelected = selectedLayerIds.has(layer.id);
                    const isActive = layer.id === activeLayerId;
                    const isDragOver = dragOverInfo?.id === layer.id;
                    const dropPos = isDragOver ? dragOverInfo?.position : null;

                    return (
                        <div
                            key={layer.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, layer.id)}
                            onDragOver={(e) => handleDragOver(e, layer)}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDrop(e, layer.id)}
                            onContextMenu={(e) => {
                                if (layer.type === 'GROUP') {
                                    openMenu(e, layer);
                                }
                            }}
                            className={`flex items-center h-8 border-b border-gray-800 text-sm cursor-pointer group relative
                                ${isSelected ? 'bg-blue-900/40' : 'hover:bg-gray-800'}
                                ${isActive ? 'bg-blue-900/60 border-blue-500/50' : ''}
                                ${isDragOver && dropPos === 'inside' ? 'bg-blue-600/30' : ''}
                            `}
                            onClick={(e) => {
                                e.stopPropagation();
                                onSelect(layer.id, e.ctrlKey || e.metaKey, e.shiftKey);
                            }}
                        >
                            {isDragOver && dropPos === 'top' && (
                                <div className="absolute top-0 left-0 right-0 h-[2px] bg-blue-500 z-50 pointer-events-none"></div>
                            )}
                            {isDragOver && dropPos === 'bottom' && (
                                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-500 z-50 pointer-events-none"></div>
                            )}

                            <div
                                className="w-8 h-full flex items-center justify-center border-r border-gray-800 hover:text-white text-gray-500"
                                onClick={(e) => { e.stopPropagation(); onToggleVis(layer.id); }}
                            >
                                {layer.isVisible ? <Eye size={14} /> : <EyeOff size={14} className="opacity-50"/>}
                            </div>

                            <div
                                className="w-8 h-full flex items-center justify-center border-r border-gray-800 hover:text-white text-gray-500"
                                onClick={(e) => { e.stopPropagation(); onToggleLock(layer.id); }}
                            >
                                {layer.isLocked ? <Lock size={12} className="text-yellow-500"/> : <Unlock size={12} className="opacity-20 group-hover:opacity-100"/>}
                            </div>

                            <div className="flex-1 flex items-center px-2 min-w-0" style={{ paddingLeft: `${layer.depth * 12 + 8}px` }}>
                                {layer.type === 'GROUP' || layer.type === 'SWITCH' ? (
                                    <div onClick={(e) => { e.stopPropagation(); onToggleExpand(layer.id); }} className={`mr-2 ${layer.type === 'SWITCH' ? 'text-green-400' : 'text-yellow-400'}`}>
                                        {layer.isExpanded ? <FolderOpen size={14} /> : <Folder size={14} />}
                                    </div>
                                ) : (
                                    <div className="mr-2 text-blue-400">
                                        <ImageIcon size={14} />
                                    </div>
                                )}
                                <span className={`truncate ${isActive ? 'text-white font-medium' : 'text-gray-300'}`}>
                                    {layer.name}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {menu && (
                <div
                    className="fixed z-[120] min-w-[180px] bg-gray-800 border border-gray-600 rounded shadow-xl py-1"
                    style={{ left: `${menu.position.x}px`, top: `${menu.position.y}px` }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <button
                        className="w-full text-left px-3 py-2 text-xs text-gray-200 hover:bg-blue-600"
                        onClick={() => {
                            onConvertGroupToSwitch(menu.payload.id);
                            closeMenu();
                        }}
                    >
                        Convert Group to Switch Layer
                    </button>
                </div>
            )}
        </div>
    );
});
