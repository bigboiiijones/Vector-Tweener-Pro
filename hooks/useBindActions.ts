
import { Keyframe, Stroke, GroupBinding, ToolOptions } from '../types';

interface BindActionsProps {
    selectedStrokeIds: Set<string>;
    corresSelection: Set<string>;
    keyframes: Keyframe[];
    prevContext: Keyframe;
    nextContext: Keyframe;
    displayedStrokes: Stroke[]; 
    groupBindings: GroupBinding[];
    createBinding: (sIdx: number, tIdx: number, sIds: string[], tIds: string[], overwrite: boolean) => void;
    setFramePairBindings: (sIdx: number, tIdx: number, bindings: { sourceStrokeIds: string[], targetStrokeIds: string[] }[]) => void;
    clearSelections: () => void;
    toolOptions: ToolOptions; 
}

// Helper: Group connections into connected components to preserve Topology (Split/Merge)
const groupConnections = (connections: {source: string, target: string}[]) => {
    // 1. Build Adjacency List
    // We use prefixes to distinguish Source IDs from Target IDs in the graph
    const adj = new Map<string, string[]>();
    const allNodes = new Set<string>();
    
    connections.forEach(c => {
        const s = `src:${c.source}`;
        const t = `tgt:${c.target}`;
        allNodes.add(s);
        allNodes.add(t);
        
        if(!adj.has(s)) adj.set(s, []);
        if(!adj.has(t)) adj.set(t, []);
        
        adj.get(s)!.push(t);
        adj.get(t)!.push(s);
    });
    
    // 2. Find Connected Components (BFS)
    const visited = new Set<string>();
    const groups: {sourceStrokeIds: string[], targetStrokeIds: string[]}[] = [];
    
    allNodes.forEach(node => {
        if(visited.has(node)) return;
        
        const componentNodes = new Set<string>();
        const queue = [node];
        visited.add(node);
        componentNodes.add(node);
        
        while(queue.length > 0) {
            const curr = queue.pop()!;
            const neighbors = adj.get(curr) || [];
            neighbors.forEach(n => {
                if(!visited.has(n)) {
                    visited.add(n);
                    componentNodes.add(n);
                    queue.push(n);
                }
            });
        }
        
        // 3. Reconstruct Component Edges & Determine Topology
        // Filter original connections to find those that belong to this component
        const compEdges = connections.filter(c => 
            componentNodes.has(`src:${c.source}`) && componentNodes.has(`tgt:${c.target}`)
        );

        const sourceIds = compEdges.map(c => c.source);
        const targetIds = compEdges.map(c => c.target);
        
        const uniqueSources = new Set(sourceIds);
        const uniqueTargets = new Set(targetIds);

        let finalSources: string[] = [];
        let finalTargets: string[] = [];

        // Logic: Preserve Multiplicity for Split (1->N) or Merge (N->1)
        // If we simply use unique sets, we lose the info that S1 connects to E1 TWICE (split topology).
        
        if (uniqueSources.size === 1) {
            // 1-to-Many (Split) or 1-to-1
            // Use unique Source, keep ALL Targets (preserving duplicates)
            finalSources = Array.from(uniqueSources);
            finalTargets = targetIds; 
        } else if (uniqueTargets.size === 1) {
            // Many-to-1 (Merge)
            // Keep ALL Sources (preserving duplicates), use unique Target
            finalSources = sourceIds;
            finalTargets = Array.from(uniqueTargets);
        } else {
            // Many-to-Many / Complex Mesh
            // Fallback to Unique Sets to avoid combinatorial ghosts in complex merges
            finalSources = Array.from(uniqueSources);
            finalTargets = Array.from(uniqueTargets);
        }
        
        if (finalSources.length > 0 && finalTargets.length > 0) {
            groups.push({
                sourceStrokeIds: finalSources,
                targetStrokeIds: finalTargets
            });
        }
    });
    
    return groups;
};

export const useBindActions = ({
    selectedStrokeIds,
    corresSelection,
    keyframes,
    prevContext,
    nextContext,
    displayedStrokes,
    groupBindings,
    createBinding,
    setFramePairBindings,
    clearSelections,
    toolOptions
}: BindActionsProps) => {

    const handleSmartBind = () => {
        const selectedIdsArr = Array.from(selectedStrokeIds);
        if (selectedIdsArr.length < 2) return;
        
        const strokesByKeyframe: Record<number, string[]> = {};
        selectedIdsArr.forEach(id => {
            const kf = keyframes.find(k => k.strokes.some(s => s.id === id));
            if (kf) {
                if (!strokesByKeyframe[kf.index]) strokesByKeyframe[kf.index] = [];
                strokesByKeyframe[kf.index].push(id);
            }
        });
        const indices = Object.keys(strokesByKeyframe).map(Number).sort((a,b) => a-b);
        if (indices.length !== 2) {
             alert("Select strokes from exactly two different frames for Smart Bind.");
             return;
        }
        createBinding(indices[0], indices[1], strokesByKeyframe[indices[0]], strokesByKeyframe[indices[1]], toolOptions.overwriteTargets);
        clearSelections();
        alert(`Bound Frame ${indices[0]+1} to ${indices[1]+1}`);
    };

    const handleCorresConnect = () => {
        if (corresSelection.size === 0 || prevContext.id === nextContext.id) return;
        
        // --- 1. Build List of ALL Individual Connections (Exploded) ---
        type Connection = { source: string; target: string };
        let allConnections: Connection[] = [];
        
        const relevantBindings = groupBindings.filter(b => 
            b.sourceFrameIndex === prevContext.index && b.targetFrameIndex === nextContext.index
        );
        
        const boundSourceIds = new Set<string>();

        // A. Load Explicit Bindings
        // Note: We need to reconstruct individual edges from the GroupBindings.
        relevantBindings.forEach(b => {
             // Heuristic to explode group back to edges:
             if (b.sourceStrokeIds.length === 1) {
                 // 1-to-N
                 const s = b.sourceStrokeIds[0];
                 boundSourceIds.add(s);
                 b.targetStrokeIds.forEach(t => allConnections.push({ source: s, target: t }));
             } else if (b.targetStrokeIds.length === 1) {
                 // N-to-1
                 const t = b.targetStrokeIds[0];
                 b.sourceStrokeIds.forEach(s => {
                     boundSourceIds.add(s);
                     allConnections.push({ source: s, target: t });
                 });
             } else {
                 // N-to-N (Complex) - Pair by index or full mesh? 
                 // Assuming full mesh for safety in retrieval, though 'groupConnections' will re-simplify.
                 // Actually, best effort is to map unique sources to unique targets.
                 const uniqueS = Array.from(new Set(b.sourceStrokeIds));
                 const uniqueT = Array.from(new Set(b.targetStrokeIds));
                 uniqueS.forEach(s => {
                     boundSourceIds.add(s);
                     uniqueT.forEach(t => allConnections.push({ source: s, target: t }));
                 });
             }
        });

        // B. Load Auto-Tweens
        displayedStrokes.forEach(s => {
            if (s.parents && s.parents.length >= 2) {
                 const sources = s.parents.filter(pid => prevContext.strokes.some(ps => ps.id === pid));
                 const targets = s.parents.filter(pid => nextContext.strokes.some(ns => ns.id === pid));
                 
                 if (sources.length > 0 && targets.length > 0) {
                     sources.forEach(src => {
                         if (!boundSourceIds.has(src)) {
                             targets.forEach(tgt => {
                                 allConnections.push({ source: src, target: tgt });
                             });
                         }
                     });
                 }
            }
        });

        allConnections = allConnections.filter(c => 
            prevContext.strokes.some(s => s.id === c.source) &&
            nextContext.strokes.some(s => s.id === c.target)
        );

        // --- 2. Identify Selection ---
        let selectedSources: string[] = [];
        let selectedOldTargets: string[] = [];
        let selectedNewTargetId: string | undefined;

        corresSelection.forEach(id => {
            const tween = displayedStrokes.find(s => s.id === id);
            
            if (tween && tween.parents) {
                const sources = tween.parents.filter(pid => prevContext.strokes.some(ps => ps.id === pid));
                const targets = tween.parents.filter(pid => nextContext.strokes.some(ns => ns.id === pid));
                
                if (sources.length > 0) {
                    selectedSources.push(...sources);
                    if (targets.length > 0) {
                        selectedOldTargets.push(...targets);
                    }
                }
            } 
            else if (nextContext.strokes.some(s => s.id === id)) {
                selectedNewTargetId = id;
            }
        });

        if (selectedSources.length === 0 && selectedNewTargetId) {
             const directSources = Array.from(corresSelection).filter(id => prevContext.strokes.some(s => s.id === id));
             if (directSources.length > 0) {
                 selectedSources = directSources;
             }
        }

        if (selectedSources.length === 0 || !selectedNewTargetId) {
             alert("Please select a source (Green Stroke / Yellow Line) and a target (Red Stroke).");
             return;
        }

        // --- 3. Apply Rebind Logic ---
        selectedSources.forEach(src => {
            const relatedOldTargets = selectedOldTargets.filter(t => 
                allConnections.some(c => c.source === src && c.target === t)
            );

            // Case 1: ADD New Connection
            if (relatedOldTargets.length === 0) {
                 if (toolOptions.overwriteTargets) {
                     allConnections = allConnections.filter(c => c.target !== selectedNewTargetId);
                 }
                 allConnections.push({ source: src, target: selectedNewTargetId! });
            } 
            // Case 2: MOVE Existing Connection
            else {
                relatedOldTargets.forEach(oldTgt => {
                    const connIndex = allConnections.findIndex(c => c.source === src && c.target === oldTgt);
                    
                    if (connIndex !== -1) {
                        const connection = allConnections[connIndex];
                        const conflicts = allConnections.filter((c, i) => i !== connIndex && c.target === selectedNewTargetId);
                        
                        if (conflicts.length > 0) {
                            if (toolOptions.overwriteTargets) {
                                allConnections = allConnections.filter(c => c.target !== selectedNewTargetId || c === connection);
                            } 
                            else if (toolOptions.swapTargets) {
                                // Swap logic
                                conflicts.forEach(conf => {
                                    conf.target = oldTgt;
                                });
                            }
                        }

                        connection.target = selectedNewTargetId!;
                    } else {
                        allConnections.push({ source: src, target: selectedNewTargetId! });
                    }
                });
            }
        });

        // --- 4. Group & Save ---
        const groupedBindings = groupConnections(allConnections);
        setFramePairBindings(prevContext.index, nextContext.index, groupedBindings);
        clearSelections();
    };

    return {
        handleSmartBind,
        handleCorresConnect
    };
};
