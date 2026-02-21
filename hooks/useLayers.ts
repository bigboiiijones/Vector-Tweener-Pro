import { useState, useCallback, useMemo, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Layer, LayerType } from '../types';

export const useLayers = () => {
    const [layers, setLayers] = useState<Layer[]>([
        { id: 'layer-1', name: 'Layer 1', type: 'VECTOR', parentId: null, isVisible: true, isLocked: false, isExpanded: true, isSynced: true, depth: 0 }
    ]);
    const [activeLayerId, setActiveLayerId] = useState<string>('layer-1');
    const [selectedLayerIds, setSelectedLayerIds] = useState<Set<string>>(new Set(['layer-1']));

    // Flatten tree to linear list for Shift+Select logic
    const getFlattenedLayerList = useCallback((layerList: Layer[]): Layer[] => {
        const result: Layer[] = [];
        const process = (parentId: string | null, depth: number) => {
            const children = layerList.filter(l => l.parentId === parentId);
            // Reverse order to match typical layer stack (top of list = top layer)
            for (let i = children.length - 1; i >= 0; i--) {
                const layer = children[i];
                result.push({ ...layer, depth });
                if ((layer.type === 'GROUP' || layer.type === 'SWITCH') && layer.isExpanded) {
                    process(layer.id, depth + 1);
                }
            }
        };
        process(null, 0);
        return result;
    }, []);

    const flattenedLayers = useMemo(() => getFlattenedLayerList(layers), [layers, getFlattenedLayerList]);

    const addLayer = useCallback((type: LayerType) => {
        setLayers(prev => {
            const parentId = null; 
            const count = prev.filter(l => l.type === type).length + 1;
            const name = type === 'GROUP' ? `Group ${count}` : type === 'SWITCH' ? `Switch ${count}` : `Layer ${count}`;
            
            const newLayer: Layer = {
                id: uuidv4(),
                name,
                type,
                parentId,
                isVisible: true,
                isLocked: false,
                isExpanded: true,
                isSynced: true,
                depth: 0
            };
            return [...prev, newLayer];
        });
    }, []);

    const moveLayer = useCallback((dragId: string, targetId: string, position: 'top' | 'bottom' | 'inside') => {
        setLayers(prev => {
            const dragLayer = prev.find(l => l.id === dragId);
            const targetLayer = prev.find(l => l.id === targetId);
            if (!dragLayer || !targetLayer || dragId === targetId) return prev;

            let curr = targetLayer;
            while (curr.parentId) {
                if (curr.parentId === dragId) return prev;
                const p = prev.find(x => x.id === curr.parentId);
                if (!p) break;
                curr = p;
            }

            const newLayers = [...prev];
            const dragIdx = newLayers.findIndex(l => l.id === dragId);
            newLayers.splice(dragIdx, 1);

            const targetIdx = newLayers.findIndex(l => l.id === targetId);
            if (targetIdx === -1) return prev;

            let newParentId = dragLayer.parentId;
            let insertIndex = targetIdx;

            if (position === 'inside') {
                newParentId = targetLayer.id;
                insertIndex = targetIdx + 1;
            } else if (position === 'top') {
                newParentId = targetLayer.parentId;
                insertIndex = targetIdx + 1;
            } else {
                newParentId = targetLayer.parentId;
                insertIndex = targetIdx;
            }

            newLayers.splice(insertIndex, 0, { ...dragLayer, parentId: newParentId });
            return newLayers;
        });
    }, []);

    const deleteSelectedLayers = useCallback(() => {
        setLayers(prev => {
            if (prev.length <= 1 && selectedLayerIds.size >= prev.length) return prev;
            
            const toDelete = new Set(selectedLayerIds);
            let changed = true;
            while(changed) {
                changed = false;
                prev.forEach(l => {
                    if (l.parentId && toDelete.has(l.parentId) && !toDelete.has(l.id)) {
                        toDelete.add(l.id);
                        changed = true;
                    }
                });
            }

            const remaining = prev.filter(l => !toDelete.has(l.id));
            if (remaining.length === 0) return prev;
            return remaining;
        });
    }, [selectedLayerIds, activeLayerId]);

    useEffect(() => {
        const activeExists = layers.find(l => l.id === activeLayerId);
        if (!activeExists && layers.length > 0) {
            setActiveLayerId(layers[layers.length - 1].id);
            setSelectedLayerIds(new Set([layers[layers.length - 1].id]));
        }
    }, [layers, activeLayerId]);

    const selectLayer = useCallback((id: string, isCtrl: boolean, isShift: boolean) => {
        if (isShift) {
            const lastActiveIdx = flattenedLayers.findIndex(l => l.id === activeLayerId);
            const targetIdx = flattenedLayers.findIndex(l => l.id === id);
            if (lastActiveIdx !== -1 && targetIdx !== -1) {
                const start = Math.min(lastActiveIdx, targetIdx);
                const end = Math.max(lastActiveIdx, targetIdx);
                const range = flattenedLayers.slice(start, end + 1).map(l => l.id);
                setSelectedLayerIds(new Set(range));
            }
        } else if (isCtrl) {
            setSelectedLayerIds(prev => {
                const next = new Set(prev);
                if (next.has(id)) {
                    if (next.size > 1) next.delete(id); 
                } else {
                    next.add(id);
                }
                return next;
            });
            setActiveLayerId(id);
        } else {
            setSelectedLayerIds(new Set([id]));
            setActiveLayerId(id);
        }
    }, [activeLayerId, flattenedLayers]);

    const toggleVisibility = useCallback((id: string) => {
        setLayers(prev => prev.map(l => l.id === id ? { ...l, isVisible: !l.isVisible } : l));
    }, []);

    const toggleLock = useCallback((id: string) => {
        setLayers(prev => prev.map(l => l.id === id ? { ...l, isLocked: !l.isLocked } : l));
    }, []);

    const toggleExpand = useCallback((id: string) => {
        setLayers(prev => prev.map(l => l.id === id ? { ...l, isExpanded: !l.isExpanded } : l));
    }, []);

    const toggleSync = useCallback((id: string) => {
        setLayers(prev => prev.map(l => l.id === id ? { ...l, isSynced: !l.isSynced } : l));
    }, []);

    // Set all VECTOR layers to the same sync state at once
    const setSyncAll = useCallback((synced: boolean) => {
        setLayers(prev => prev.map(l => l.type === 'VECTOR' ? { ...l, isSynced: synced } : l));
    }, []);


    const convertGroupToSwitch = useCallback((id: string) => {
        setLayers(prev => prev.map(l => {
            if (l.id !== id || l.type !== 'GROUP') return l;
            return { ...l, type: 'SWITCH', name: l.name.startsWith('Switch') ? l.name : l.name.replace(/^Group/i, 'Switch') };
        }));
    }, []);

    const getVectorDescendants = useCallback((layerId: string): string[] => {
        const descendants: string[] = [];
        const queue = [layerId];
        while (queue.length > 0) {
            const currentId = queue.shift()!;
            layers.forEach(layer => {
                if (layer.parentId !== currentId) return;
                if (layer.type === 'VECTOR') descendants.push(layer.id);
                else queue.push(layer.id);
            });
        }
        return descendants;
    }, [layers]);


    const getSwitchActivationTarget = useCallback((layerId: string): { switchLayerId: string; childId: string } | null => {
        const layerMap = new Map<string, Layer>();
        layers.forEach(layer => layerMap.set(layer.id, layer));

        let currentId: string | null = layerId;
        while (currentId) {
            const currentLayer = layerMap.get(currentId);
            if (!currentLayer) return null;

            const parentId = currentLayer.parentId;
            if (!parentId) return null;

            const parent = layerMap.get(parentId);
            if (!parent) return null;

            if (parent.type === 'SWITCH') {
                return { switchLayerId: parent.id, childId: currentId };
            }

            currentId = parent.id;
        }

        return null;
    }, [layers]);

    const getVisibleLayerIds = useCallback(() => {
        const visibleIds = new Set<string>();
        const layerMap = new Map<string, Layer>();
        layers.forEach(l => layerMap.set(l.id, l));

        layers.forEach(l => {
            if (l.type !== 'VECTOR') return;
            let isVisible = true;
            let currentId: string | null = l.id;
            while (currentId) {
                const layer = layerMap.get(currentId);
                if (!layer) break;
                if (!layer.isVisible) {
                    isVisible = false;
                    break;
                }
                currentId = layer.parentId;
            }
            if (isVisible) visibleIds.add(l.id);
        });
        return visibleIds;
    }, [layers]);

    return {
        layers,
        flattenedLayers,
        activeLayerId,
        selectedLayerIds,
        addLayer,
        convertGroupToSwitch,
        moveLayer,
        deleteSelectedLayers,
        selectLayer,
        toggleVisibility,
        toggleLock,
        toggleExpand,
        toggleSync,
        setSyncAll,
        getVisibleLayerIds,
        getVectorDescendants,
        getSwitchActivationTarget
    };
};
