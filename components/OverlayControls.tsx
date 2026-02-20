
import React from 'react';
import { ToolType } from '../types';

interface OverlayControlsProps {
    currentTool: ToolType;
    selectedCount: number;
    corresCount: number;
    onSmartBind: () => void;
    onConnectStrokes: () => void;
}

export const OverlayControls: React.FC<OverlayControlsProps> = React.memo(({
    currentTool,
    selectedCount,
    corresCount,
    onSmartBind,
    onConnectStrokes
}) => {
    return (
        <div className="flex flex-col gap-2 pointer-events-auto">
            {currentTool === ToolType.BIND && selectedCount > 1 && (
                <button 
                    onClick={onSmartBind}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-3 rounded shadow-lg font-bold flex items-center gap-2 animate-in fade-in slide-in-from-left-2"
                >
                    Create Smart Bind
                </button>
            )}
            {currentTool === ToolType.CORRESPONDENCE && corresCount >= 1 && (
                <button 
                    onClick={onConnectStrokes}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-3 rounded shadow-lg font-bold flex items-center gap-2 animate-in fade-in slide-in-from-left-2"
                >
                    Connect Strokes ({corresCount})
                </button>
            )}
        </div>
    );
});
