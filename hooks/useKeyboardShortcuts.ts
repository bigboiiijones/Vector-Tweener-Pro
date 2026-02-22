
import { useEffect } from 'react';
import { ToolType } from '../types';

interface ShortcutsProps {
    currentTool: ToolType;
    setTool: (t: ToolType) => void;
    setIsPlaying: (cb: (prev: boolean) => boolean) => void;
    deleteSelected: () => void;
    reverseSelected: () => void;
    forceFinishPolyline: () => void;
    resetInteraction: () => void;
    clearSelections: () => void;
    activePanel: 'CANVAS' | 'TIMELINE' | 'LAYERS';
    deleteFrames?: () => void; // Optional if only checking canvas
}

export const useKeyboardShortcuts = ({
    currentTool,
    setTool,
    setIsPlaying,
    deleteSelected,
    reverseSelected,
    forceFinishPolyline,
    resetInteraction,
    clearSelections,
    activePanel,
    deleteFrames
}: ShortcutsProps) => {
    
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Global Shortcuts
            if (e.key === ' ' && !e.repeat) { 
                // Prevent space from scrolling if target is body or common UI
                if ((e.target as HTMLElement).tagName !== 'INPUT') {
                    e.preventDefault(); 
                    setIsPlaying(p => !p); 
                }
            }

            // Context Aware Shortcuts
            if (activePanel === 'CANVAS') {
                if (e.key === 'Enter') {
                    if (currentTool === ToolType.POLYLINE) forceFinishPolyline();
                }
                if (e.key === 'Escape') {
                    resetInteraction();
                    clearSelections();
                }
                if (e.key === 's') setTool(ToolType.SELECT);
                if (e.key === 'p') setTool(ToolType.PEN);
                if (e.key === 'b') setTool(ToolType.BIND);
                if (e.key === 'l') setTool(ToolType.POLYLINE);
                if (e.key === 'c') setTool(ToolType.CURVE);
                if (e.key === 'a') setTool(ToolType.ADD_POINTS);
                if (e.key === 'm') setTool(ToolType.MOTION_PATH);
                if (e.key === 'k') setTool(ToolType.CORRESPONDENCE);
                if (e.key === 'g') setTool(ToolType.PAINT_BUCKET);
                if (e.key === 'Delete') deleteSelected();
                if (e.key === 'r') reverseSelected();
            } else if (activePanel === 'TIMELINE') {
                if (e.key === 'Delete' && deleteFrames) {
                    // Logic handled in Timeline component typically, but we can trigger it here if we lifted state.
                    // However, Timeline component handles its own selection state internally (selectedIndices).
                    // If we want this global hook to trigger it, we'd need to lift selectedIndices to App.
                    // For now, let's assume the Timeline component handles the Delete key internally via its own listener 
                    // OR we rely on focus. Since the Timeline is now focusable (tabIndex), it will receive key events naturally if focused.
                    
                    // Actually, if we use this global listener, we need to know what to delete.
                    // Since selection state is inside Timeline, let's skip global Delete for Timeline here 
                    // and rely on the Timeline's internal handling or focus.
                    // BUT, to satisfy the requirement "make sure the UI can smartly tell what window your actively interacting with",
                    // we are checking activePanel. The delete logic inside Timeline can listen to keydown event when focused.
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentTool, setTool, setIsPlaying, deleteSelected, reverseSelected, forceFinishPolyline, resetInteraction, clearSelections, activePanel, deleteFrames]);
};
