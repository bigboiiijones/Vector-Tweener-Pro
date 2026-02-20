
import { Keyframe, Stroke, Point, GroupBinding, AutoMatchStrategy } from '../types';
import { 
  distance, 
  getPointsCentroid, 
  applyEasing, 
  solveTopologySplit, 
  interpolatePaths, 
  mergeStrokes, 
  resamplePath, 
  matchPathDirection, 
  isClosedPath, 
  alignPhase,
  upsampleStrokeTopology 
} from '../utils/mathUtils';
import { applyTweenedStrokeStyle } from './styleTweening';

const GUIDE_SNAP_DISTANCE = 15; 
const RESAMPLE_RESOLUTION = 60; 

export const findMotionPath = (prevFrame: Keyframe, startCenter: Point, endCenter: Point, relatedStrokeIds: string[]): Stroke | undefined => {
    if (!prevFrame.motionPaths || prevFrame.motionPaths.length === 0) return undefined;
    
    const linkedPath = prevFrame.motionPaths.find(p => 
      p.linkedStrokeIds && p.linkedStrokeIds.some(id => relatedStrokeIds.includes(id))
    );
    if (linkedPath) return linkedPath;

    return prevFrame.motionPaths.find(guide => {
        if (guide.linkedStrokeIds && guide.linkedStrokeIds.length > 0) return false;
        const guideStart = guide.points[0];
        const guideEnd = guide.points[guide.points.length - 1];
        return distance(guideStart, startCenter) < GUIDE_SNAP_DISTANCE && 
               distance(guideEnd, endCenter) < GUIDE_SNAP_DISTANCE;
    });
};

export const calculateTweens = (
    currentFrameIndex: number,
    prev: Keyframe,
    next: Keyframe,
    bindings: GroupBinding[],
    matchStrategy: AutoMatchStrategy = 'INDEX'
): Stroke[] => {
    if (prev.id === next.id) return prev.strokes;

    // We assume prev and next belong to the same layer now, or at least handled per-layer in loop.
    // The layerId logic is handled by the caller (useKeyframeSystem).
    const sourceStrokes = prev.strokes;
    const targetStrokes = next.strokes;
    
    // Safety check for empty frames
    if (sourceStrokes.length === 0 && targetStrokes.length === 0) return [];
    if (sourceStrokes.length > 0 && targetStrokes.length === 0) return []; // Disappear? Or hold last known? Usually hold is handled by Keyframe type.
    if (sourceStrokes.length === 0 && targetStrokes.length > 0) return []; // Appear?

    const rawT = (currentFrameIndex - prev.index) / (next.index - prev.index);
    const t = applyEasing(rawT, prev.easing); 

    const relevantBindings = bindings.filter(b => 
        b.sourceFrameIndex === prev.index && b.targetFrameIndex === next.index
    );

    const tweenedStrokes: Stroke[] = [];
    const usedSourceIds = new Set<string>();
    const usedTargetIds = new Set<string>();

    // 1. Explicit Bindings
    relevantBindings.forEach(binding => {
        const bindingSourceStrokes = sourceStrokes.filter(s => binding.sourceStrokeIds.includes(s.id));
        const bindingTargetStrokes = targetStrokes.filter(s => binding.targetStrokeIds.includes(s.id));

        if (bindingSourceStrokes.length === 0 && bindingTargetStrokes.length === 0) return;

        binding.sourceStrokeIds.forEach(id => usedSourceIds.add(id));
        binding.targetStrokeIds.forEach(id => usedTargetIds.add(id));

        if (bindingSourceStrokes.length > 0 && bindingTargetStrokes.length > 0) {
            let handled = false;

            // Simple 1-to-1 Explicit Bind
            if (bindingSourceStrokes.length === 1 && bindingTargetStrokes.length === 1) {
                const source = bindingSourceStrokes[0];
                const target = bindingTargetStrokes[0];

                const maxPts = Math.max(source.points.length, target.points.length);
                const adjSource = upsampleStrokeTopology(source.points, maxPts);
                const adjTarget = upsampleStrokeTopology(target.points, maxPts);
                
                const guide = findMotionPath(prev, getPointsCentroid(source.points), getPointsCentroid(target.points), [source.id]);
                const tweenPoints = interpolatePaths(adjSource, adjTarget, t, guide?.points);
                
                tweenedStrokes.push({ 
                    id: `tween-${binding.id}`, 
                    layerId: source.layerId,
                    points: tweenPoints, 
                    isSelected: false,
                    parents: [source.id, target.id],
                    ...applyTweenedStrokeStyle(source, target, t)
                });
                handled = true;
            }

            // Fallback for Splits/Merges
            if (!handled) {
                if (bindingSourceStrokes.length === 1 && bindingTargetStrokes.length > 1) {
                    const results = solveTopologySplit(bindingSourceStrokes[0], bindingTargetStrokes, true);
                    if (results.length > 0) {
                        results.forEach((res, i) => {
                            const guide = findMotionPath(prev, getPointsCentroid(res.start), getPointsCentroid(res.end), [bindingSourceStrokes[0].id]);
                            const tweenPoints = interpolatePaths(res.start, res.end, t, guide?.points);
                            const matchedTarget = bindingTargetStrokes.find(st => st.id === res.mappedStrokeId) || bindingTargetStrokes[0];
                            tweenedStrokes.push({ 
                                id: `tween-${binding.id}-${i}`, 
                                layerId: bindingSourceStrokes[0].layerId,
                                points: tweenPoints, 
                                isSelected: false,
                                parents: [bindingSourceStrokes[0].id, res.mappedStrokeId],
                                ...applyTweenedStrokeStyle(bindingSourceStrokes[0], matchedTarget, t)
                            });
                        });
                        handled = true;
                    }
                } 
                else if (bindingSourceStrokes.length > 1 && bindingTargetStrokes.length === 1) {
                    const results = solveTopologySplit(bindingTargetStrokes[0], bindingSourceStrokes, false);
                    if (results.length > 0) {
                        results.forEach((res, i) => {
                            const guide = findMotionPath(prev, getPointsCentroid(res.start), getPointsCentroid(res.end), binding.sourceStrokeIds);
                            const tweenPoints = interpolatePaths(res.start, res.end, t, guide?.points);
                            const matchedSource = bindingSourceStrokes.find(st => st.id === res.mappedStrokeId) || bindingSourceStrokes[0];
                            tweenedStrokes.push({ 
                                id: `tween-${binding.id}-${i}`, 
                                layerId: bindingTargetStrokes[0].layerId,
                                points: tweenPoints, 
                                isSelected: false,
                                parents: [res.mappedStrokeId, bindingTargetStrokes[0].id],
                                ...applyTweenedStrokeStyle(matchedSource, bindingTargetStrokes[0], t)
                            });
                        });
                        handled = true;
                    }
                } 
            }
            
            if (!handled) {
                const mergedSource = mergeStrokes(bindingSourceStrokes);
                let mergedTarget = mergeStrokes(bindingTargetStrokes);
                
                let normSource, normTarget;

                if (Math.abs(mergedSource.length - mergedTarget.length) < 5 && mergedSource.length < 50) {
                    const max = Math.max(mergedSource.length, mergedTarget.length);
                    normSource = upsampleStrokeTopology(mergedSource, max);
                    normTarget = upsampleStrokeTopology(mergedTarget, max);
                } else {
                    normSource = resamplePath(mergedSource, RESAMPLE_RESOLUTION);
                    normTarget = resamplePath(mergedTarget, RESAMPLE_RESOLUTION);
                }
                
                normTarget = matchPathDirection(normSource, normTarget);
                if (isClosedPath(normSource) && isClosedPath(normTarget)) {
                    normTarget = alignPhase(normSource, normTarget);
                }
                
                const startC = getPointsCentroid(normSource);
                const endC = getPointsCentroid(normTarget);
                const guide = findMotionPath(prev, startC, endC, binding.sourceStrokeIds);

                const tweenPoints = interpolatePaths(normSource, normTarget, t, guide?.points);
                // Inherit layer from first source
                const lId = bindingSourceStrokes[0]?.layerId || 'default';
                const styleSource = bindingSourceStrokes[0];
                const styleTarget = bindingTargetStrokes[0] || styleSource;
                tweenedStrokes.push({ 
                    id: `tween-${binding.id}`, 
                    layerId: lId,
                    points: tweenPoints, 
                    isSelected: false,
                    parents: [...binding.sourceStrokeIds, ...binding.targetStrokeIds],
                    ...applyTweenedStrokeStyle(styleSource, styleTarget, t)
                });
            }
        }
    });

    // 2. Auto-Match Unbound
    const unboundSource = sourceStrokes.filter(s => !usedSourceIds.has(s.id));
    const unboundTarget = targetStrokes.filter(s => !usedTargetIds.has(s.id));
    
    const matches: { s: Stroke, t: Stroke }[] = [];
    const matchedSourceIndices = new Set<number>();
    const matchedTargetIndices = new Set<number>();

    if (matchStrategy === 'SPATIAL') {
        const pairs: { sIdx: number, tIdx: number, dist: number }[] = [];
        const sourceCentroids = unboundSource.map(s => getPointsCentroid(s.points));
        const targetCentroids = unboundTarget.map(t => getPointsCentroid(t.points));

        sourceCentroids.forEach((sc, sIdx) => {
            targetCentroids.forEach((tc, tIdx) => {
                pairs.push({ sIdx, tIdx, dist: distance(sc, tc) });
            });
        });
        pairs.sort((a, b) => a.dist - b.dist);

        pairs.forEach(p => {
            if (!matchedSourceIndices.has(p.sIdx) && !matchedTargetIndices.has(p.tIdx)) {
                matches.push({ s: unboundSource[p.sIdx], t: unboundTarget[p.tIdx] });
                matchedSourceIndices.add(p.sIdx);
                matchedTargetIndices.add(p.tIdx);
            }
        });
    } else {
        unboundSource.forEach((source, index) => {
            if (index < unboundTarget.length) {
                matches.push({ s: source, t: unboundTarget[index] });
                matchedSourceIndices.add(index);
                matchedTargetIndices.add(index);
            }
        });
    }

    matches.forEach(({ s: source, t: target }) => {
        const maxPts = Math.max(source.points.length, target.points.length);
        const adjSource = upsampleStrokeTopology(source.points, maxPts);
        let adjTarget = upsampleStrokeTopology(target.points, maxPts);
        
        const dNormal = distance(adjSource[0], adjTarget[0]);
        const dFlipped = distance(adjSource[0], adjTarget[adjTarget.length - 1]);
        
        if (dFlipped < dNormal) {
             adjTarget = [...adjTarget].reverse().map(p => ({
                 ...p,
                 cp1: p.cp2,
                 cp2: p.cp1
             }));
        }

        const guide = findMotionPath(prev, getPointsCentroid(source.points), getPointsCentroid(target.points), [source.id]);
        const tweenPoints = interpolatePaths(adjSource, adjTarget, t, guide?.points);

        tweenedStrokes.push({ 
            id: `auto-${source.id}-${target.id}`, 
            layerId: source.layerId,
            points: tweenPoints, 
            isSelected: false,
            parents: [source.id, target.id],
            ...applyTweenedStrokeStyle(source, target, t)
        });
    });

    unboundSource.forEach((source, idx) => {
        if (!matchedSourceIndices.has(idx)) {
            tweenedStrokes.push({ ...source, id: `static-${source.id}`, parents: [source.id] });
        }
    });

    return tweenedStrokes;
};
