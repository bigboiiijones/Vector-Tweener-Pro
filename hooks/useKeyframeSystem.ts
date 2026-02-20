
import { useState, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Keyframe, GroupBinding, Stroke, Point, ToolType, EasingType, AutoMatchStrategy, ToolOptions, CameraKeyframe, CameraTransform, Layer } from '../types';
import { calculateTweens } from '../logic/tweening';
import { simplifyPath, smoothPolyline, distance } from '../utils/mathUtils';

const DUMMY_KEYFRAME: Keyframe = { 
    id: 'dummy', 
    layerId: 'none', 
    index: -1, 
    type: 'KEY', 
    strokes: [], 
    motionPaths: [], 
    easing: 'LINEAR' 
};

export const useKeyframeSystem = (totalFrames: number) => {
    // Stores all keyframes for all layers as a flat list
    const [keyframes, setKeyframes] = useState<Keyframe[]>([
        { id: 'start-l1', layerId: 'layer-1', index: 0, strokes: [], motionPaths: [], easing: 'LINEAR', type: 'KEY' }
    ]);
    
    // Camera Keyframes (Independent Track)
    const [cameraKeyframes, setCameraKeyframes] = useState<CameraKeyframe[]>([
        { 
            id: 'cam-start', 
            index: 0, 
            transform: { x: 0, y: 0, rotation: 0, zoom: 1 }, 
            easing: 'LINEAR' 
        }
    ]);

    const [groupBindings, setGroupBindings] = useState<GroupBinding[]>([]);

    // Ensure initial keyframe exists for new layers
    const ensureInitialKeyframes = useCallback((layers: Layer[]): void => {
        setKeyframes(prev => {
            const newKeys = [...prev];
            let changed = false;
            layers.forEach(layer => {
                if (layer.type === 'VECTOR' && !newKeys.some(k => k.layerId === layer.id && k.index === 0)) {
                    newKeys.push({
                        id: uuidv4(),
                        layerId: layer.id,
                        index: 0,
                        strokes: [],
                        motionPaths: [],
                        easing: 'LINEAR',
                        type: 'KEY'
                    });
                    changed = true;
                }
            });
            return changed ? newKeys : prev;
        });
        return fillStroke.id;
    }, []);

    // Helper to get Tween Context for a SPECIFIC Layer
    const getLayerContext = useCallback((layerId: string, currentFrameIndex: number, currentKeyframes: Keyframe[]) => {
        const layerKeys = currentKeyframes.filter(k => k.layerId === layerId && k.type !== 'GENERATED');
        const sorted = [...layerKeys].sort((a, b) => a.index - b.index);
        
        if (sorted.length === 0) {
            const dummyForLayer = { ...DUMMY_KEYFRAME, layerId };
            return { prev: dummyForLayer, next: dummyForLayer };
        }

        let prev = sorted[0];
        let next = sorted[sorted.length - 1];
        
        for (let i = 0; i < sorted.length; i++) {
            if (sorted[i].index <= currentFrameIndex) prev = sorted[i];
            if (sorted[i].index >= currentFrameIndex) {
                next = sorted[i];
                break;
            }
        }
        return { prev, next };
    }, []);

    // Get Composite Frame Content (All Visible Layers)
    const getFrameContent = useCallback((currentFrameIndex: number, strategy: AutoMatchStrategy = 'INDEX', layers: Layer[] = []) => {
        let allStrokes: Stroke[] = [];
        
        // Iterate visible vector layers
        layers.forEach(layer => {
             if (layer.type !== 'VECTOR' || !layer.isVisible) return;
             
             const exactKeyframe = keyframes.find(k => k.layerId === layer.id && k.index === currentFrameIndex);
             
             if (exactKeyframe) {
                 allStrokes = [...allStrokes, ...exactKeyframe.strokes];
             } else {
                 const { prev, next } = getLayerContext(layer.id, currentFrameIndex, keyframes);
                 if (prev && next) {
                     const layerTweens = calculateTweens(currentFrameIndex, prev, next, groupBindings, strategy);
                     allStrokes = [...allStrokes, ...layerTweens];
                 }
             }
        });

        return allStrokes;
    }, [keyframes, groupBindings, getLayerContext]);

    // Get Context for Active Layer (used for UI states, onionskin, etc of the active work area)
    const getTweenContext = useCallback((currentFrameIndex: number, activeLayerId?: string) => {
        if (!activeLayerId) return { prev: DUMMY_KEYFRAME, next: DUMMY_KEYFRAME };
        return getLayerContext(activeLayerId, currentFrameIndex, keyframes);
    }, [keyframes, getLayerContext]);


    // --- Camera Logic ---
    const getCameraTransform = useCallback((frameIndex: number): CameraTransform => {
        const sorted = [...cameraKeyframes].sort((a, b) => a.index - b.index);
        const exact = sorted.find(k => k.index === frameIndex);
        if (exact) return exact.transform;

        let prev = sorted[0];
        let next = sorted[sorted.length - 1];

        for (let i = 0; i < sorted.length; i++) {
            if (sorted[i].index <= frameIndex) prev = sorted[i];
            if (sorted[i].index >= frameIndex) {
                next = sorted[i];
                break;
            }
        }

        if (prev.id === next.id) return prev.transform;

        // Simple linear ease for camera unless ease is implemented in mathUtils for camera
        const t = (frameIndex - prev.index) / (next.index - prev.index);
        
        return {
            x: prev.transform.x + (next.transform.x - prev.transform.x) * t,
            y: prev.transform.y + (next.transform.y - prev.transform.y) * t,
            rotation: prev.transform.rotation + (next.transform.rotation - prev.transform.rotation) * t,
            zoom: prev.transform.zoom + (next.transform.zoom - prev.transform.zoom) * t,
        };
    }, [cameraKeyframes]);

    const addCameraKeyframe = useCallback((frameIndex: number, transform: CameraTransform): void => {
        setCameraKeyframes(prev => {
            const exists = prev.find(k => k.index === frameIndex);
            if (exists) {
                return prev.map(k => k.index === frameIndex ? { ...k, transform } : k);
            }
            return [...prev, { id: uuidv4(), index: frameIndex, transform, easing: 'LINEAR' }];
        });
        return fillStroke.id;
    }, []);

    const deleteCameraKeyframes = useCallback((indices: number[]) => {
        setCameraKeyframes(prev => prev.filter(k => !indices.includes(k.index) || k.index === 0));
    }, []);

    const moveCameraFrames = useCallback((selectedIndices: number[], targetIndex: number): void => {
        if (selectedIndices.length === 0) return;
        const sortedIndices = [...selectedIndices].sort((a, b) => a - b);
        const minIndex = sortedIndices[0];
        const offset = targetIndex - minIndex;
        if (offset === 0) return;

        setCameraKeyframes(prev => {
            // Filter moving: selected AND not index 0 (Locked start)
            const movingFrames = prev.filter(k => selectedIndices.includes(k.index) && k.index !== 0);
            if (movingFrames.length === 0) return prev;
            
            const movingIndices = new Set(movingFrames.map(k => k.index));
            
            // Keep frames that are NOT moving
            let newKeyframes = prev.filter(k => !movingIndices.has(k.index));
            
            const movedFrames = movingFrames.map(k => ({ ...k, index: k.index + offset }));
            if (movedFrames.some(k => k.index < 0)) return prev;
            
            const newIndices = new Set(movedFrames.map(k => k.index));
            newKeyframes = newKeyframes.filter(k => !newIndices.has(k.index));
            return [...newKeyframes, ...movedFrames].sort((a, b) => a.index - b.index);
        });
        return fillStroke.id;
    }, []);


    // --- Core Action Logic ---

    // Generalized helper to apply an action to the active layer OR all synced layers
    const applyToLayers = useCallback((
        activeLayerId: string, 
        layers: Layer[], 
        action: (layerId: string) => void
    ) => {
        const activeLayer = layers.find(l => l.id === activeLayerId);
        // If active layer is synced, apply to all synced layers. Else only active.
        if (activeLayer && activeLayer.isSynced && activeLayer.type === 'VECTOR') {
            layers.forEach(l => {
                if (l.type === 'VECTOR' && l.isSynced) {
                    action(l.id);
                }
            });
        } else {
            action(activeLayerId);
        }
    }, []);

    // Updated addKeyframe: accepts shouldCopy boolean
    // If shouldCopy is false, we create a BLANK keyframe (used when drawing on new frame)
    const addKeyframe = useCallback((currentFrameIndex: number, activeLayerId: string, layers: Layer[], shouldCopy = true) => {
        setKeyframes(prevList => {
            let newKeyframes = [...prevList];

            const processLayer = (lid: string) => {
                const existingIndex = newKeyframes.findIndex(k => k.layerId === lid && k.index === currentFrameIndex);
                if (existingIndex !== -1) {
                     const existing = newKeyframes[existingIndex];
                     // If converting HOLD/GENERATED to KEY, ensure type is set
                     if (existing.type === 'HOLD' || existing.type === 'GENERATED') {
                         newKeyframes[existingIndex] = { ...existing, type: 'KEY', generatedStrategy: undefined };
                     }
                     return;
                }

                let newStrokes: Stroke[] = [];

                if (shouldCopy) {
                    // Bake Tween or Copy Previous logic (Original behavior)
                    const { prev, next } = getLayerContext(lid, currentFrameIndex, newKeyframes);
                    
                    if (prev.id !== next.id && prev.type !== 'KEY' && next.type !== 'KEY' && prev.layerId === 'none') {
                        newStrokes = [];
                    } else if (prev.id !== next.id) {
                        newStrokes = calculateTweens(currentFrameIndex, prev, next, groupBindings, 'INDEX').map(s => ({ 
                            ...s, id: uuidv4(), isSelected: false, parents: undefined 
                        }));
                    } else {
                        // Copy previous frame strokes
                        newStrokes = prev.strokes.map(s => ({...s, id: uuidv4(), isSelected: false}));
                    }
                }
                // If shouldCopy is false, newStrokes remains []

                newKeyframes.push({ 
                    id: uuidv4(), 
                    layerId: lid,
                    index: currentFrameIndex, 
                    strokes: newStrokes, 
                    motionPaths: [], 
                    easing: 'LINEAR', 
                    type: 'KEY' 
                });
            };

            applyToLayers(activeLayerId, layers, processLayer);
            return newKeyframes;
        });
    }, [applyToLayers, getLayerContext, groupBindings]);

    const addHoldFrame = useCallback((currentFrameIndex: number, activeLayerId: string, layers: Layer[]) => {
        setKeyframes(prevList => {
            const newKeyframes = [...prevList];
            
            const processLayer = (lid: string) => {
                const { prev } = getLayerContext(lid, currentFrameIndex, newKeyframes);
                if (!prev || prev.index >= currentFrameIndex || prev.layerId === 'none') return;
                
                // Add holds for all empty frames between prev and current
                for (let i = prev.index + 1; i <= currentFrameIndex; i++) {
                    if (newKeyframes.some(k => k.layerId === lid && k.index === i && k.type === 'KEY')) continue;
                    
                    // Remove existing generated if any
                    const existingIdx = newKeyframes.findIndex(k => k.layerId === lid && k.index === i);
                    if (existingIdx !== -1) newKeyframes.splice(existingIdx, 1);

                    // IMPORTANT: Copy strokes preserving IDs for hold continuity
                    const copiedStrokes = prev.strokes.map(s => ({ ...s, isSelected: false }));
                    newKeyframes.push({
                        id: uuidv4(),
                        layerId: lid,
                        index: i,
                        type: 'HOLD',
                        strokes: copiedStrokes,
                        motionPaths: [],
                        easing: 'LINEAR'
                    });
                }
            };
            
            applyToLayers(activeLayerId, layers, processLayer);
            return newKeyframes;
        });
    }, [applyToLayers, getLayerContext]);

    // Add Generated/Sequence logic needs to be layer aware too
    const addGeneratedFrame = useCallback((currentFrameIndex: number, strategy: AutoMatchStrategy, activeLayerId: string, layers: Layer[]) => {
        setKeyframes(prevList => {
            const newKeyframes = [...prevList];
            const processLayer = (lid: string) => {
                 const existing = newKeyframes.find(k => k.layerId === lid && k.index === currentFrameIndex);
                 if (existing) return;

                 const { prev, next } = getLayerContext(lid, currentFrameIndex, newKeyframes);
                 if (prev.id === next.id) return;

                 const newStrokes = calculateTweens(currentFrameIndex, prev, next, groupBindings, strategy);
                 newKeyframes.push({
                    id: uuidv4(),
                    layerId: lid,
                    index: currentFrameIndex,
                    strokes: newStrokes,
                    motionPaths: [],
                    easing: 'LINEAR',
                    type: 'GENERATED',
                    generatedStrategy: strategy
                 });
            };
            applyToLayers(activeLayerId, layers, processLayer);
            return newKeyframes;
        });
    }, [applyToLayers, getLayerContext, groupBindings]);

    const generateSequence = useCallback((currentFrameIndex: number, strategy: AutoMatchStrategy, activeLayerId: string, layers: Layer[]) => {
        setKeyframes(prevList => {
             const newKeyframes = [...prevList];
             const processLayer = (lid: string) => {
                 const { prev, next } = getLayerContext(lid, currentFrameIndex, newKeyframes);
                 if (prev.id === next.id || next.index <= prev.index + 1) return;
                 
                 for (let i = prev.index + 1; i < next.index; i++) {
                     if (newKeyframes.some(k => k.layerId === lid && k.index === i)) continue;
                     const newStrokes = calculateTweens(i, prev, next, groupBindings, strategy);
                     newKeyframes.push({
                         id: uuidv4(),
                         layerId: lid,
                         index: i,
                         strokes: newStrokes,
                         motionPaths: [],
                         easing: 'LINEAR',
                         type: 'GENERATED',
                         generatedStrategy: strategy
                     });
                 }
             };
             applyToLayers(activeLayerId, layers, processLayer);
             return newKeyframes;
        });
    }, [applyToLayers, getLayerContext, groupBindings]);

    // Keyframe Moving logic updated for specific Keyframe IDs
    const moveKeyframes = useCallback((selectedKeyframeIds: Set<string>, offset: number): void => {
         if (offset === 0 || selectedKeyframeIds.size === 0) return;
         
         setKeyframes(prev => {
             // Filter moving: selected AND not index 0 (Locked start)
             const moving = prev.filter(k => selectedKeyframeIds.has(k.id) && k.index !== 0);
             if (moving.length === 0) return prev;
             
             const movingIds = new Set(moving.map(k => k.id));
             
             // Check collisions or invalid moves
             const movedMap = new Map<string, number>();
             moving.forEach(k => movedMap.set(k.id, k.index + offset));
             
             // Cannot move before 0
             for (const val of movedMap.values()) if (val < 0) return prev;

             // Remove moving keys from the list (they will be re-added)
             const nonMoving = prev.filter(k => !movingIds.has(k.id));
             
             // Remove targets that are being overwritten
             const finalKeys = nonMoving.filter(k => {
                 const targetForLayer = moving.find(mk => mk.layerId === k.layerId);
                 if (targetForLayer && movedMap.get(targetForLayer.id) === k.index) return false; 
                 return true;
             });

             const newMoved = moving.map(k => ({ ...k, index: movedMap.get(k.id)! }));
             return [...finalKeys, ...newMoved];
         });
        return fillStroke.id;
    }, []);

    const deleteSelected = useCallback((currentFrameIndex: number, selectedIds: Set<string>, activeLayerId: string): void => {
        setKeyframes(prev => {
            const nextKeys = prev.map(k => {
                if (k.index === currentFrameIndex && k.layerId === activeLayerId) {
                    return { 
                        ...k, 
                        strokes: k.strokes.filter(s => !selectedIds.has(s.id)),
                        motionPaths: k.motionPaths?.filter(s => !selectedIds.has(s.id)) || []
                    };
                }
                return k;
            });
            
            // Propagate change to holds
            const changedFrame = nextKeys.find(k => k.index === currentFrameIndex && k.layerId === activeLayerId);
            if (changedFrame) {
                let curr = currentFrameIndex + 1;
                while (true) {
                    const nextHold = nextKeys.find(k => k.layerId === activeLayerId && k.index === curr);
                    if (nextHold && nextHold.type === 'HOLD') {
                         nextHold.strokes = changedFrame.strokes.map(s => ({...s, isSelected: false}));
                         curr++;
                    } else {
                        break;
                    }
                }
            }
            return nextKeys;
        });
        return fillStroke.id;
    }, []);

    // Reverse selected strokes (vector op)
    const reverseSelected = useCallback((currentFrameIndex: number, selectedIds: Set<string>, activeLayerId: string): void => {
        setKeyframes(prev => {
            const nextKeys = prev.map(k => {
                if (k.index === currentFrameIndex && k.layerId === activeLayerId) {
                    return { 
                        ...k, 
                        strokes: k.strokes.map(s => selectedIds.has(s.id) ? { 
                            ...s, 
                            points: [...s.points].reverse().map(p => ({
                                ...p,
                                cp1: p.cp2 ? { ...p.cp2 } : undefined,
                                cp2: p.cp1 ? { ...p.cp1 } : undefined
                            }))
                        } : s) 
                    };
                }
                return k;
            });

            // Propagate change to holds
            const changedFrame = nextKeys.find(k => k.index === currentFrameIndex && k.layerId === activeLayerId);
            if (changedFrame) {
                let curr = currentFrameIndex + 1;
                while (true) {
                    const nextHold = nextKeys.find(k => k.layerId === activeLayerId && k.index === curr);
                    if (nextHold && nextHold.type === 'HOLD') {
                         nextHold.strokes = changedFrame.strokes.map(s => ({...s, isSelected: false}));
                         curr++;
                    } else {
                        break;
                    }
                }
            }
            return nextKeys;
        });
        return fillStroke.id;
    }, []);


    const adaptJointToBezier = (points: Point[], joinIndex: number): Point[] => {
        if (joinIndex <= 0 || joinIndex >= points.length - 1) return points;
        const prev = points[joinIndex - 1];
        const joint = points[joinIndex];
        const next = points[joinIndex + 1];
        const inDx = joint.x - prev.x;
        const inDy = joint.y - prev.y;
        const outDx = next.x - joint.x;
        const outDy = next.y - joint.y;
        const inLen = Math.hypot(inDx, inDy);
        const outLen = Math.hypot(outDx, outDy);
        if (inLen < 0.001 || outLen < 0.001) return points;

        const dirX = (inDx / inLen + outDx / outLen) / 2;
        const dirY = (inDy / inLen + outDy / outLen) / 2;
        const dirLen = Math.hypot(dirX, dirY);
        if (dirLen < 0.001) return points;

        const nx = dirX / dirLen;
        const ny = dirY / dirLen;
        const handleLength = Math.min(inLen, outLen) * 0.35;

        const clone = [...points];
        clone[joinIndex] = {
            ...joint,
            cp1: { x: joint.x - nx * handleLength, y: joint.y - ny * handleLength },
            cp2: { x: joint.x + nx * handleLength, y: joint.y + ny * handleLength }
        };
        return clone;
    };

    const commitStroke = useCallback((
        points: Point[], 
        tool: ToolType, 
        currentFrameIndex: number, 
        linkedIds: string[],
        options: ToolOptions,
        activeLayerId: string,
        isClosed: boolean = false
    ) => {
        if (points.length < 2) return;
        const isMotionPath = tool === ToolType.MOTION_PATH;
        let processedPoints = points;

        if (!isMotionPath && options) {
            const smoothEpsilon = (options.smoothingFactor / 100) * 5; 
            if (tool === ToolType.PEN) {
                if (options.optimizeFreehand) {
                    const aggressiveEpsilon = Math.max(2.5, smoothEpsilon * 3); 
                    const simple = simplifyPath(points, aggressiveEpsilon);
                    processedPoints = smoothPolyline(simple, 0.35); 
                } else {
                     const mildEpsilon = Math.max(0.8, smoothEpsilon);
                     const simple = simplifyPath(points, mildEpsilon);
                     processedPoints = smoothPolyline(simple, 0.35);
                }
            } 
        }

        if (isClosed && options.bezierAdaptive && processedPoints.length > 3) {
            const closedPoints = [...processedPoints.slice(0, -1), processedPoints[0]];
            processedPoints = adaptJointToBezier(closedPoints, closedPoints.length - 2);
        }

        const newStroke: Stroke = {
            id: uuidv4(),
            layerId: activeLayerId, 
            points: processedPoints, 
            isSelected: true,
            linkedStrokeIds: isMotionPath ? linkedIds : undefined,
            color: options.drawStroke ? options.defaultColor : 'transparent',
            width: options.drawStroke ? options.defaultWidth : 0,
            taperStart: options.defaultTaperStart,
            taperEnd: options.defaultTaperEnd,
            isClosed: isClosed || [ToolType.RECTANGLE, ToolType.CIRCLE, ToolType.TRIANGLE, ToolType.STAR].includes(tool),
            fillColor: (options.drawFill || (isClosed && options.closeCreatesFill))
                ? options.defaultFillColor
                : undefined
        };
        
        let mergedStrokeId: string | undefined = undefined;

        setKeyframes(prev => {
            // Only modify keyframe for ACTIVE LAYER
            const existingFrameIdx = prev.findIndex(k => k.index === currentFrameIndex && k.layerId === activeLayerId);
            
            let nextKeys = [...prev];
            let targetFrame: Keyframe | null = null;

            if (existingFrameIdx !== -1) {
                const existingFrame = nextKeys[existingFrameIdx];
                let updatedStrokes = [...existingFrame.strokes];
                let updatedMotionPaths = [...(existingFrame.motionPaths || [])];
                
                // ... (Auto Merge logic similar to before, but scoped to this keyframe)
                 if (!isMotionPath && options?.autoMerge) {
                    const MERGE_THRESHOLD = 10; 
                    const newStart = processedPoints[0];
                    const newEnd = processedPoints[processedPoints.length - 1];
                    let targetStroke: Stroke | null = null;
                    let mergeType: 'APPEND_TO_END' | 'PREPEND_TO_START' | null = null;

                    for (const s of updatedStrokes) {
                        const sStart = s.points[0];
                        const sEnd = s.points[s.points.length - 1];
                        if (distance(sEnd, newStart) < MERGE_THRESHOLD) {
                            targetStroke = s;
                            mergeType = 'APPEND_TO_END';
                            break;
                        } else if (distance(sStart, newEnd) < MERGE_THRESHOLD) {
                            targetStroke = s;
                            mergeType = 'PREPEND_TO_START';
                            break;
                        }
                    }

                    if (targetStroke && mergeType) {
                        let mergedPoints: Point[] = [];
                        if (mergeType === 'APPEND_TO_END') {
                            mergedPoints = [...targetStroke.points, ...processedPoints.slice(1)];
                            const joinIndex = Math.max(1, targetStroke.points.length - 1);
                            const incomingJoin = targetStroke.points[targetStroke.points.length - 1];
                            const outgoingJoin = processedPoints[0];
                            mergedPoints[joinIndex] = {
                                ...mergedPoints[joinIndex],
                                cp1: mergedPoints[joinIndex].cp1 || incomingJoin.cp1,
                                cp2: outgoingJoin.cp2 || mergedPoints[joinIndex].cp2
                            };
                            if (options.bezierAdaptive) mergedPoints = adaptJointToBezier(mergedPoints, joinIndex);
                        } else {
                            mergedPoints = [...processedPoints, ...targetStroke.points.slice(1)];
                            const joinIndex = Math.max(1, processedPoints.length - 1);
                            const incomingJoin = processedPoints[processedPoints.length - 1];
                            const outgoingJoin = targetStroke.points[0];
                            mergedPoints[joinIndex] = {
                                ...mergedPoints[joinIndex],
                                cp1: incomingJoin.cp1 || mergedPoints[joinIndex].cp1,
                                cp2: outgoingJoin.cp2 || mergedPoints[joinIndex].cp2
                            };
                            if (options.bezierAdaptive) mergedPoints = adaptJointToBezier(mergedPoints, joinIndex);
                        }
                        const mergedStroke = { ...targetStroke, points: mergedPoints, isSelected: true };
                        mergedStrokeId = mergedStroke.id;
                        updatedStrokes = updatedStrokes.map(s => s.id === targetStroke!.id ? mergedStroke : s);
                    } else {
                        updatedStrokes.push(newStroke);
                    }
                } else if (!isMotionPath) {
                    updatedStrokes.push(newStroke);
                } else {
                    updatedMotionPaths.push(newStroke);
                }

                nextKeys[existingFrameIdx] = { 
                    ...existingFrame, 
                    strokes: updatedStrokes, 
                    motionPaths: updatedMotionPaths,
                    // Convert hold to key if editing
                    type: existingFrame.type === 'HOLD' ? 'KEY' : existingFrame.type
                };
                targetFrame = nextKeys[existingFrameIdx];

            } else {
                targetFrame = { 
                    id: uuidv4(), 
                    layerId: activeLayerId,
                    index: currentFrameIndex, 
                    strokes: isMotionPath ? [] : [newStroke],
                    motionPaths: isMotionPath ? [newStroke] : [],
                    easing: 'LINEAR',
                    type: 'KEY'
                };
                nextKeys.push(targetFrame);
            }

            // Propagate change to subsequent holds
            if (targetFrame && !isMotionPath) {
                 let curr = currentFrameIndex + 1;
                 while (true) {
                     const nextHoldIdx = nextKeys.findIndex(k => k.layerId === activeLayerId && k.index === curr);
                     if (nextHoldIdx !== -1 && nextKeys[nextHoldIdx].type === 'HOLD') {
                         nextKeys[nextHoldIdx] = {
                             ...nextKeys[nextHoldIdx],
                             strokes: targetFrame.strokes.map(s => ({...s, isSelected: false}))
                         };
                         curr++;
                     } else {
                         break;
                     }
                 }
            }

            return nextKeys;
        });
        return mergedStrokeId || newStroke.id;
    }, []);


    const deleteStrokeById = useCallback((currentFrameIndex: number, strokeId: string, activeLayerId: string) => {
        setKeyframes(prev => prev.map(k => {
            if (k.index !== currentFrameIndex || k.layerId !== activeLayerId) return k;
            const nextStrokes = k.strokes.filter(s => s.id !== strokeId);
            if (nextStrokes.length === k.strokes.length) return k;
            return { ...k, strokes: nextStrokes, type: k.type === 'HOLD' ? 'KEY' : k.type };
        }));
    }, []);


    const createFillStroke = useCallback((
        currentFrameIndex: number,
        activeLayerId: string,
        points: Point[],
        fillColor: string,
        sourceStrokeIds: string[] = []
    ):
        string | undefined => {
        if (points.length < 3) return undefined;
        const fillStroke: Stroke = {
            id: uuidv4(),
            layerId: activeLayerId,
            points,
            isSelected: false,
            isClosed: true,
            color: 'transparent',
            width: 0,
            fillColor,
            linkedStrokeIds: sourceStrokeIds,
            bindToLinkedStrokes: true
        };

        setKeyframes(prev => {
            const existingFrameIdx = prev.findIndex(k => k.index === currentFrameIndex && k.layerId === activeLayerId);
            const nextKeys = [...prev];
            if (existingFrameIdx !== -1) {
                const existingFrame = nextKeys[existingFrameIdx];
                nextKeys[existingFrameIdx] = {
                    ...existingFrame,
                    strokes: [...existingFrame.strokes, fillStroke],
                    type: existingFrame.type === 'HOLD' ? 'KEY' : existingFrame.type
                };
            } else {
                nextKeys.push({
                    id: uuidv4(),
                    layerId: activeLayerId,
                    index: currentFrameIndex,
                    strokes: [fillStroke],
                    motionPaths: [],
                    easing: 'LINEAR',
                    type: 'KEY'
                });
            }
            return nextKeys;
        });
        return fillStroke.id;
    }, []);


    const replaceStrokesForFrame = useCallback((currentFrameIndex: number, activeLayerId: string, strokes: Stroke[]): void => {
        setKeyframes(prev => {
            const idx = prev.findIndex(k => k.index === currentFrameIndex && k.layerId === activeLayerId);
            const next = [...prev];
            if (idx !== -1) {
                const frame = next[idx];
                next[idx] = {
                    ...frame,
                    strokes: strokes.map(st => ({ ...st, isSelected: false })),
                    type: frame.type === 'HOLD' ? 'KEY' : frame.type
                };
            } else {
                next.push({
                    id: uuidv4(),
                    layerId: activeLayerId,
                    index: currentFrameIndex,
                    strokes: strokes.map(st => ({ ...st, isSelected: false })),
                    motionPaths: [],
                    easing: 'LINEAR',
                    type: 'KEY'
                });
            }
            return next;
        });
    }, []);

    const replaceCompositeFrameStrokes = useCallback((currentFrameIndex: number, strokes: Stroke[]): void => {
        const grouped = new Map<string, Stroke[]>();
        strokes.forEach(stroke => {
            const list = grouped.get(stroke.layerId) || [];
            list.push({ ...stroke, isSelected: false });
            grouped.set(stroke.layerId, list);
        });

        setKeyframes(prev => {
            const next = [...prev];
            grouped.forEach((layerStrokes, layerId) => {
                const idx = next.findIndex(k => k.index === currentFrameIndex && k.layerId === layerId);
                if (idx !== -1) {
                    const frame = next[idx];
                    next[idx] = {
                        ...frame,
                        strokes: layerStrokes,
                        type: frame.type === 'HOLD' ? 'KEY' : frame.type
                    };
                } else {
                    next.push({
                        id: uuidv4(),
                        layerId,
                        index: currentFrameIndex,
                        strokes: layerStrokes,
                        motionPaths: [],
                        easing: 'LINEAR',
                        type: 'KEY'
                    });
                }
            });
            return next;
        });
    }, []);

    const updateEasing = useCallback((id: string, easing: EasingType) => {
        setKeyframes(prev => prev.map(k => k.id === id ? { ...k, easing } : k));
    }, []);


    const updateStrokeById = useCallback((currentFrameIndex: number, strokeId: string, updates: Partial<Stroke>) => {
        setKeyframes(prev => prev.map(k => {
            if (k.index !== currentFrameIndex) return k;

            let changed = false;
            const nextStrokes = k.strokes.map(s => {
                if (s.id === strokeId) {
                    changed = true;
                    return { ...s, ...updates };
                }
                return s;
            });

            if (!changed) return k;
            return { ...k, strokes: nextStrokes, type: k.type === 'HOLD' ? 'KEY' : k.type };
        }));
    }, []);

    // Delete Frames logic - now accepts list of Keyframe IDs to delete
    const deleteFrames = useCallback((keyframeIds: Set<string>) => {
        setKeyframes(prev => prev.filter(k => !keyframeIds.has(k.id)));
    }, []);

    // Basic passthrough for Bindings creation (assuming IDs are globally unique enough)
    const createBinding = useCallback((sourceIndex: number, targetIndex: number, sourceIds: string[], targetIds: string[], overwrite: boolean) => {
         setGroupBindings(prev => [...prev, { id: uuidv4(), sourceFrameIndex: sourceIndex, targetFrameIndex: targetIndex, sourceStrokeIds: sourceIds, targetStrokeIds: targetIds }]);
    }, []);

    const setFramePairBindings = useCallback((sIdx: number, tIdx: number, newBinds: any[]) => {
         // simplified for brevity
         setGroupBindings(prev => [...prev, ...newBinds.map((b: any) => ({...b, id: uuidv4(), sourceFrameIndex: sIdx, targetFrameIndex: tIdx}))]);
    }, []);

    return {
        keyframes,
        cameraKeyframes,
        groupBindings,
        getFrameContent,
        getTweenContext,
        getCameraTransform,
        addKeyframe,
        addCameraKeyframe,
        addGeneratedFrame,
        generateSequence,
        addHoldFrame,
        commitStroke,
        deleteSelected,
        reverseSelected,
        updateStrokeById,
        deleteStrokeById,
        createFillStroke,
        replaceStrokesForFrame,
        replaceCompositeFrameStrokes,
        updateEasing,
        createBinding,
        setFramePairBindings,
        moveKeyframes, // Replaces moveFrames
        moveCameraFrames,
        deleteFrames, // Updated
        deleteCameraKeyframes,
        ensureInitialKeyframes
    };
};
