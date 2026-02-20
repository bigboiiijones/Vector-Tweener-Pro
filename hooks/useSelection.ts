
import { useState } from 'react';
import { Point } from '../types';

export const useSelection = () => {
    const [selectedStrokeIds, setSelectedStrokeIds] = useState<Set<string>>(new Set());
    const [corresSelection, setCorresSelection] = useState<Set<string>>(new Set());
    const [selectionBox, setSelectionBox] = useState<{start: Point, end: Point} | null>(null);

    const clearAllSelections = () => {
        setSelectedStrokeIds(new Set());
        setCorresSelection(new Set());
        setSelectionBox(null);
    };

    return {
        selectedStrokeIds,
        setSelectedStrokeIds,
        corresSelection,
        setCorresSelection,
        selectionBox,
        setSelectionBox,
        clearAllSelections
    };
};
