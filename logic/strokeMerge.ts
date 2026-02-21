import { Point, Stroke } from '../types';
import { distance } from '../utils/mathUtils';

export const reverseStrokePoints = (points: Point[]): Point[] => {
  return [...points].reverse().map((p) => ({
    ...p,
    cp1: p.cp2 ? { ...p.cp2 } : undefined,
    cp2: p.cp1 ? { ...p.cp1 } : undefined
  }));
};

interface MergeCandidate {
  points: Point[];
  joinIndex: number;
  gap: number;
}

const concatenateAtJoin = (first: Point[], second: Point[]): MergeCandidate | null => {
  if (first.length < 2 || second.length < 2) return null;
  const join = first[first.length - 1];
  const secondStart = second[0];
  const merged = [...first, ...second.slice(1)];
  const joinIndex = first.length - 1;

  merged[joinIndex] = {
    ...merged[joinIndex],
    cp1: join.cp1 ?? merged[joinIndex].cp1,
    cp2: secondStart.cp2 ?? merged[joinIndex].cp2
  };

  return {
    points: merged,
    joinIndex,
    gap: distance(join, secondStart)
  };
};

export const mergePointChains = (targetPoints: Point[], incomingPoints: Point[], threshold: number): MergeCandidate | null => {
  if (targetPoints.length < 2 || incomingPoints.length < 2) return null;

  const incomingReversed = reverseStrokePoints(incomingPoints);
  const candidates: MergeCandidate[] = [];

  const appendForward = concatenateAtJoin(targetPoints, incomingPoints);
  if (appendForward && appendForward.gap <= threshold) candidates.push(appendForward);

  const prependForward = concatenateAtJoin(incomingPoints, targetPoints);
  if (prependForward && prependForward.gap <= threshold) candidates.push(prependForward);

  const prependReversedIncoming = concatenateAtJoin(incomingReversed, targetPoints);
  if (prependReversedIncoming && prependReversedIncoming.gap <= threshold) candidates.push(prependReversedIncoming);

  const appendReversedIncoming = concatenateAtJoin(targetPoints, incomingReversed);
  if (appendReversedIncoming && appendReversedIncoming.gap <= threshold) candidates.push(appendReversedIncoming);

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => a.gap - b.gap);
  return candidates[0];
};

export const mergeStrokePair = (a: Stroke, b: Stroke, threshold: number) => {
  const merged = mergePointChains(a.points, b.points, threshold);
  if (!merged) return null;
  return {
    points: merged.points,
    joinIndex: merged.joinIndex,
    gap: merged.gap
  };
};
