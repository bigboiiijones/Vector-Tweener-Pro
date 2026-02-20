
import React from 'react';
import { Keyframe, EasingType } from '../types';

interface TimingPanelProps {
    controllingKeyframe: Keyframe;
    isCurrent: boolean;
    updateEasing: (id: string, easing: EasingType) => void;
}

export const TimingPanel: React.FC<TimingPanelProps> = React.memo(({ controllingKeyframe, isCurrent, updateEasing }) => {
    return (
        <div className="absolute bottom-4 right-4 z-50 bg-gray-800 border border-gray-700 p-3 rounded-lg shadow-lg flex flex-col gap-2 w-48 animate-in slide-in-from-right-2">
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                Timing / Ease {isCurrent ? '(Current)' : '(Previous)'}
            </div>
            <select 
                value={controllingKeyframe.easing || 'LINEAR'} 
                onChange={(e) => updateEasing(controllingKeyframe.id, e.target.value as EasingType)}
                className="bg-gray-900 text-white text-sm p-2 rounded border border-gray-700 focus:outline-none focus:border-blue-500"
            >
                <option value="LINEAR">Linear (Constant)</option>
                <option value="EASE_IN">Accelerate (Ease In)</option>
                <option value="EASE_OUT">Decelerate (Ease Out)</option>
                <option value="EASE_IN_OUT">Accel -&gt; Decel</option>
            </select>
            <div className="text-[10px] text-gray-500 leading-tight">
                Controls spacing from Frame {controllingKeyframe.index + 1}.
            </div>
        </div>
    );
});
