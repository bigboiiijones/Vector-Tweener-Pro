
import React from 'react';
import { ToolType } from '../types';
import { 
    MousePointer2, 
    PenTool, 
    Link2, 
    Square, 
    Trash2, 
    ArrowLeftRight,
    Circle,
    Triangle,
    Star,
    Spline,
    Activity,
    Route,
    Network,
    Play,
    Move3d,
    Video,
    PaintBucket
} from 'lucide-react';

interface ToolbarProps {
  currentTool: ToolType;
  setTool: (t: ToolType) => void;
  isPlaying: boolean;
  togglePlay: () => void;
  clearFrame: () => void;
  deleteSelected: () => void;
  reverseSelected: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = React.memo(({ 
  currentTool, 
  setTool, 
  isPlaying, 
  togglePlay,
  clearFrame,
  deleteSelected,
  reverseSelected
}) => {
  const tools = [
    { id: ToolType.SELECT, icon: <MousePointer2 size={18} />, label: 'Select Stroke (S)' },
    { id: ToolType.TRANSFORM, icon: <Move3d size={18} />, label: 'Transform Points (T) - Edit Vertex/Bezier' },
    { id: ToolType.CAMERA_PAN, icon: <Video size={18} />, label: 'Camera Pan & Zoom (Drag to Pan, Ctrl+Drag to Zoom)' },
    { id: ToolType.PEN, icon: <PenTool size={18} />, label: 'Pen (P)' },
    { id: ToolType.POLYLINE, icon: <Activity size={18} />, label: 'Polyline (L)' },
    { id: ToolType.CURVE, icon: <Spline size={18} />, label: 'Curve (C)' },
    { id: ToolType.RECTANGLE, icon: <Square size={18} />, label: 'Rectangle' },
    { id: ToolType.CIRCLE, icon: <Circle size={18} />, label: 'Circle' },
    { id: ToolType.TRIANGLE, icon: <Triangle size={18} />, label: 'Triangle' },
    { id: ToolType.STAR, icon: <Star size={18} />, label: 'Star' },
    { id: ToolType.BIND, icon: <Link2 size={18} />, label: 'Bind (B)' },
    { id: ToolType.CORRESPONDENCE, icon: <Network size={18} />, label: 'Correspondence (K)' },
    { id: ToolType.MOTION_PATH, icon: <Route size={18} />, label: 'Motion Path (M)' },
    { id: ToolType.PAINT_BUCKET, icon: <PaintBucket size={18} />, label: 'Paint Bucket (G)' },
  ];

  return (
    <div className="flex flex-col gap-2 bg-gray-800 p-2 rounded-lg shadow-xl border border-gray-700 pointer-events-auto">
      <div className="grid grid-cols-2 gap-2">
          {tools.map((tool) => (
            <button
              key={tool.id}
              onClick={() => setTool(tool.id)}
              title={tool.label}
              className={`p-2 rounded-md transition-colors flex justify-center items-center ${
                currentTool === tool.id
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:bg-gray-700 hover:text-white'
              }`}
            >
              {tool.icon}
            </button>
          ))}
      </div>
      
      <div className="h-px bg-gray-700 my-1" />
      
      <div className="flex gap-2">
          <button
            onClick={reverseSelected}
            title="Reverse Stroke Direction (R)"
            className="flex-1 p-2 rounded-md text-gray-400 hover:bg-indigo-900/50 hover:text-indigo-400 transition-colors flex justify-center"
          >
            <ArrowLeftRight size={18} />
          </button>
          <button
            onClick={deleteSelected}
            title="Delete Selected (Del)"
            className="flex-1 p-2 rounded-md text-gray-400 hover:bg-red-900/50 hover:text-red-400 transition-colors flex justify-center"
          >
            <Trash2 size={18} />
          </button>
      </div>
      
      <button
        onClick={togglePlay}
        title={isPlaying ? "Stop (Space)" : "Play (Space)"}
        className={`p-3 rounded-md transition-colors flex justify-center items-center ${
          isPlaying ? 'bg-red-600 text-white' : 'bg-green-600 text-white'
        }`}
      >
        {isPlaying ? <Square size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
      </button>
    </div>
  );
});
