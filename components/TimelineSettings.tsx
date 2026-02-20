
import React from 'react';
import { ProjectSettings, DEFAULT_CANVAS_WIDTH, DEFAULT_CANVAS_HEIGHT, DEFAULT_CAMERA_WIDTH, DEFAULT_CAMERA_HEIGHT } from '../types';
import { Sparkles, Video, Crop, Hash, Clock } from 'lucide-react';

interface TimelineSettingsProps {
    currentFrameIndex: number;
    fps: number;
    setFps: (fps: number) => void;
    projectSettings: ProjectSettings;
    setProjectSettings: (settings: ProjectSettings) => void;
    totalFrames: number;
    setTotalFrames: (frames: number) => void;
}

const CANVAS_PRESETS = [
    { label: 'Default', w: DEFAULT_CANVAS_WIDTH, h: DEFAULT_CANVAS_HEIGHT },
    { label: '4K UHD', w: 3840, h: 2160 },
    { label: '1080p', w: 1920, h: 1080 },
    { label: '720p', w: 1280, h: 720 },
    { label: 'Square (IG)', w: 1080, h: 1080 },
    { label: 'A4 (300dpi)', w: 2480, h: 3508 },
    { label: 'iPad Air', w: 2360, h: 1640 },
];

const CAMERA_PRESETS = [
    { label: 'Default', w: DEFAULT_CAMERA_WIDTH, h: DEFAULT_CAMERA_HEIGHT },
    { label: '16:9 (1080p)', w: 1920, h: 1080 },
    { label: '16:9 (720p)', w: 1280, h: 720 },
    { label: '9:16 (Story)', w: 1080, h: 1920 },
    { label: '4:3 (TV)', w: 1440, h: 1080 },
    { label: '2.35:1 (Cinema)', w: 1920, h: 817 },
];

export const TimelineSettings: React.FC<TimelineSettingsProps> = React.memo(({
    currentFrameIndex,
    fps,
    setFps,
    projectSettings,
    setProjectSettings,
    totalFrames,
    setTotalFrames
}) => {
    
    const handleCanvasPreset = (label: string) => {
        const p = CANVAS_PRESETS.find(x => x.label === label);
        if (p) {
            setProjectSettings({
                ...projectSettings,
                canvasSize: { width: p.w, height: p.h }
            });
        }
    };
  
    const handleCameraPreset = (label: string) => {
        const p = CAMERA_PRESETS.find(x => x.label === label);
        if (p) {
            setProjectSettings({
                ...projectSettings,
                cameraResolution: { width: p.w, height: p.h }
            });
        }
    };

    const adjustDuration = (seconds: number) => {
        setTotalFrames(Math.max(1, totalFrames + (seconds * fps)));
    };

    // Find matching preset for dropdown value
    const currentCanvasPreset = CANVAS_PRESETS.find(p => p.w === projectSettings.canvasSize.width && p.h === projectSettings.canvasSize.height)?.label || "";
    const currentCameraPreset = CAMERA_PRESETS.find(p => p.w === projectSettings.cameraResolution.width && p.h === projectSettings.cameraResolution.height)?.label || "";

    return (
        <div className="flex items-center gap-4 text-xs overflow-x-auto py-1 pr-2 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gray-700">
             {/* 1. FPS / Frame Counter */}
             <div className="flex items-center gap-2 bg-gray-900/50 p-1 rounded border border-gray-700 whitespace-nowrap shadow-sm">
                <span className="text-gray-500 pl-1">Frame:</span> <span className="text-white font-bold w-8 text-center">{currentFrameIndex + 1}</span>
                <div className="h-3 w-px bg-gray-600 mx-1"/>
                <span className="text-gray-500">FPS:</span>
                <input type="number" value={fps} onChange={e=>setFps(parseInt(e.target.value)||24)} className="w-12 bg-transparent text-white text-center focus:outline-none font-bold" />
             </div>

             <div className="h-4 w-px bg-gray-700 mx-2" />

             {/* 2. Duration / Length */}
             <div className="flex items-center gap-2 whitespace-nowrap">
                 <span className="text-gray-400 font-mono flex items-center gap-1"><Clock size={14}/> Len:</span>
                 <input 
                    type="number" 
                    value={totalFrames} 
                    onChange={e=>setTotalFrames(Math.max(1, parseInt(e.target.value)||100))} 
                    className="w-12 bg-gray-900 border border-gray-600 rounded px-1 text-center h-6 focus:border-blue-500 outline-none" 
                    title="Total Frames" 
                 />
                 <div className="flex gap-0.5">
                    <button 
                        onClick={() => adjustDuration(1)} 
                        className="px-1.5 h-6 bg-gray-700 hover:bg-gray-600 text-green-400 rounded-l border-r border-gray-600 text-[10px] font-bold" 
                        title={`Add 1s (+${fps} frames)`}
                    >
                        +1s
                    </button>
                    <button 
                        onClick={() => adjustDuration(-1)} 
                        className="px-1.5 h-6 bg-gray-700 hover:bg-gray-600 text-red-400 rounded-r text-[10px] font-bold" 
                        title={`Remove 1s (-${fps} frames)`}
                    >
                        -1s
                    </button>
                 </div>
             </div>

             <div className="h-4 w-px bg-gray-700 mx-2" />

             {/* 3. Canvas Settings */}
             <div className="flex items-center gap-2 whitespace-nowrap">
                 <span className="text-gray-400 font-mono flex items-center gap-1"><Crop size={14}/> Canvas:</span>
                 <select value={currentCanvasPreset} onChange={(e) => handleCanvasPreset(e.target.value)} className="bg-gray-700 text-white rounded px-1 border-gray-600 border h-6 w-28 text-[11px] focus:ring-1 focus:ring-blue-500 outline-none">
                     <option value="">Custom</option>
                     {CANVAS_PRESETS.map(p => <option key={p.label} value={p.label}>{p.label}</option>)}
                 </select>
                 <div className="flex items-center gap-1">
                    <input type="number" value={projectSettings.canvasSize.width} onChange={e=>setProjectSettings({...projectSettings, canvasSize: {...projectSettings.canvasSize, width: parseInt(e.target.value)}})} className="w-16 bg-gray-900 border border-gray-600 rounded px-1 text-center h-6 focus:border-blue-500 outline-none" />
                    <span className="text-gray-500">x</span>
                    <input type="number" value={projectSettings.canvasSize.height} onChange={e=>setProjectSettings({...projectSettings, canvasSize: {...projectSettings.canvasSize, height: parseInt(e.target.value)}})} className="w-16 bg-gray-900 border border-gray-600 rounded px-1 text-center h-6 focus:border-blue-500 outline-none" />
                 </div>
             </div>

             <div className="h-4 w-px bg-gray-700 mx-2" />

             {/* 4. Camera Settings */}
             <div className="flex items-center gap-2 whitespace-nowrap">
                 <span className="text-gray-400 font-mono flex items-center gap-1"><Video size={14}/> Cam:</span>
                 <select value={currentCameraPreset} onChange={(e) => handleCameraPreset(e.target.value)} className="bg-gray-700 text-white rounded px-1 border-gray-600 border h-6 w-28 text-[11px] focus:ring-1 focus:ring-blue-500 outline-none">
                     <option value="">Custom</option>
                     {CAMERA_PRESETS.map(p => <option key={p.label} value={p.label}>{p.label}</option>)}
                 </select>
                 <div className="flex items-center gap-1">
                    <input type="number" value={projectSettings.cameraResolution.width} onChange={e=>setProjectSettings({...projectSettings, cameraResolution: {...projectSettings.cameraResolution, width: parseInt(e.target.value)}})} className="w-16 bg-gray-900 border border-gray-600 rounded px-1 text-center h-6 focus:border-blue-500 outline-none" />
                    <span className="text-gray-500">x</span>
                    <input type="number" value={projectSettings.cameraResolution.height} onChange={e=>setProjectSettings({...projectSettings, cameraResolution: {...projectSettings.cameraResolution, height: parseInt(e.target.value)}})} className="w-16 bg-gray-900 border border-gray-600 rounded px-1 text-center h-6 focus:border-blue-500 outline-none" />
                 </div>
             </div>

             <div className="h-4 w-px bg-gray-700 mx-2" />
             
             {/* 5. DPI Setting */}
              <div className="flex items-center gap-2 whitespace-nowrap">
                 <span className="text-gray-400 font-mono flex items-center gap-1"><Hash size={14}/> DPI:</span>
                 <input type="number" value={projectSettings.dpi} onChange={e=>setProjectSettings({...projectSettings, dpi: parseInt(e.target.value) || 72})} className="w-16 bg-gray-900 border border-gray-600 rounded px-1 text-center h-6 focus:border-blue-500 outline-none" />
             </div>

             <div className="h-4 w-px bg-gray-700 mx-2" />

             {/* AA Button */}
             <button onClick={() => setProjectSettings({...projectSettings, antiAliasing: !projectSettings.antiAliasing})} className={`p-1 rounded flex items-center gap-1 transition-colors border ${projectSettings.antiAliasing ? 'bg-blue-600/30 text-blue-300 border-blue-500/50' : 'text-gray-500 hover:text-white border-transparent'}`} title="Anti-Aliasing">
                 <Sparkles size={14} />
                 <span className="text-[10px] font-bold">AA</span>
             </button>

         </div>
    );
});
