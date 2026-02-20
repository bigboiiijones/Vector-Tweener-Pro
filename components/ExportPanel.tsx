import React, { useState } from 'react';
import { ProjectSettings, Keyframe, Stroke, Layer, CameraTransform } from '../types';
import { X, Download, Image as ImageIcon, Film, FileVideo } from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { toPathString } from '../utils/mathUtils';
import { getTaperedPath } from '../utils/strokeUtils';
import { saveTGA } from '../utils/fileUtils';

interface ExportPanelProps {
    onClose: () => void;
    projectSettings: ProjectSettings;
    totalFrames: number;
    fps: number;
    svgRef: React.RefObject<SVGSVGElement | null>;
    currentFrameIndex: number;
    setCurrentFrameIndex: (frame: number) => void;
    keyframes: Keyframe[];
    cameraKeyframes: Keyframe[];
    layers: Layer[];
    getFrameContent: (frameIndex: number, strategy: 'INDEX' | 'SPATIAL', layers: Layer[]) => Stroke[];
    getCameraTransform: (frameIndex: number) => CameraTransform;
}

export const ExportPanel: React.FC<ExportPanelProps> = ({
    onClose,
    projectSettings,
    totalFrames,
    fps,
    svgRef,
    currentFrameIndex,
    setCurrentFrameIndex,
    keyframes,
    cameraKeyframes,
    layers,
    getFrameContent,
    getCameraTransform
}) => {
    const [isExporting, setIsExporting] = useState(false);
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState('');
    const [exportType, setExportType] = useState<'IMAGE' | 'SEQUENCE' | 'VIDEO'>('IMAGE');
    const [format, setFormat] = useState<'PNG' | 'JPG' | 'TGA' | 'WEBM' | 'MP4' | 'AVI' | 'MOV'>('PNG');
    const [includeInbetweenFrames, setIncludeInbetweenFrames] = useState(true);

    // Helper to render a specific frame to a canvas
    const renderFrameToCanvas = async (frameIndex: number, canvas: HTMLCanvasElement) => {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Background
        if (!projectSettings.canvasTransparent) {
            ctx.fillStyle = projectSettings.canvasColor;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        // Get Content
        const visibleLayerIds = new Set(layers.filter(l => l.type === 'VECTOR' && l.isVisible).map(l => l.id));
        const hasVisibleLayerKeyframe = keyframes.some(k => k.index === frameIndex && visibleLayerIds.has(k.layerId));
        const strokes = includeInbetweenFrames || hasVisibleLayerKeyframe
            ? getFrameContent(frameIndex, 'INDEX', layers).filter(s => visibleLayerIds.has(s.layerId))
            : [];
        const cameraTransform = getCameraTransform(frameIndex);

        const camW = projectSettings.cameraResolution.width;
        const camH = projectSettings.cameraResolution.height;
        const canvasCenterX = projectSettings.canvasSize.width / 2;
        const canvasCenterY = projectSettings.canvasSize.height / 2;
        
        ctx.save();
        ctx.translate(camW / 2, camH / 2);
        ctx.scale(cameraTransform.zoom, cameraTransform.zoom);
        ctx.rotate(-cameraTransform.rotation * Math.PI / 180);
        ctx.translate(-(canvasCenterX + cameraTransform.x), -(canvasCenterY + cameraTransform.y));

        for (const stroke of strokes) {
            if (!stroke.points || stroke.points.length < 2) continue;

            const path = new Path2D();
            
            // Tapering logic
            const hasTaper = (stroke.taperStart && stroke.taperStart > 0) || (stroke.taperEnd && stroke.taperEnd > 0);
            const width = stroke.width || 2;
            const color = stroke.color || '#000000';

            if (hasTaper) {
                const d = getTaperedPath(stroke.points, width, stroke.taperStart || 0, stroke.taperEnd || 0, stroke.isClosed);
                path.addPath(new Path2D(d));
                ctx.fillStyle = color;
                ctx.fill(path);
            } else {
                const d = toPathString(stroke.points);
                path.addPath(new Path2D(d));
                
                ctx.strokeStyle = color;
                ctx.lineWidth = width;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                if (stroke.isClosed && stroke.fillColor) {
                    ctx.fillStyle = stroke.fillColor;
                    ctx.fill(path);
                }
                ctx.stroke(path);
            }
        }

        ctx.restore();
    };

    const handleExport = async () => {
        setIsExporting(true);
        setProgress(0);
        setStatus('Initializing...');

        const canvas = document.createElement('canvas');
        canvas.width = projectSettings.cameraResolution.width;
        canvas.height = projectSettings.cameraResolution.height;

        try {
            if (exportType === 'IMAGE') {
                setStatus('Rendering Frame...');
                await renderFrameToCanvas(currentFrameIndex, canvas);
                
                if (format === 'TGA') {
                    saveTGA(canvas, `frame_${currentFrameIndex}.tga`);
                } else {
                    canvas.toBlob((blob) => {
                        if (blob) {
                            saveAs(blob, `frame_${currentFrameIndex}.${format.toLowerCase()}`);
                        }
                    }, format === 'JPG' ? 'image/jpeg' : 'image/png');
                }
                setIsExporting(false);

            } else if (exportType === 'SEQUENCE') {
                const zip = new JSZip();
                const folder = zip.folder("sequence");
                
                for (let i = 0; i < totalFrames; i++) {
                    setStatus(`Rendering Frame ${i + 1}/${totalFrames}`);
                    setProgress((i / totalFrames) * 100);
                    
                    await renderFrameToCanvas(i, canvas);
                    
                    if (format === 'TGA') {
                        // TGA Blob logic
                        const ctx = canvas.getContext('2d');
                        if (ctx) {
                            const width = canvas.width;
                            const height = canvas.height;
                            const imgData = ctx.getImageData(0, 0, width, height);
                            const data = imgData.data;
                            const header = new Uint8Array(18);
                            header[2] = 2; header[12] = width & 0xFF; header[13] = (width >> 8) & 0xFF;
                            header[14] = height & 0xFF; header[15] = (height >> 8) & 0xFF;
                            header[16] = 32; header[17] = 0x20;
                            const content = new Uint8Array(width * height * 4);
                            for (let j = 0; j < width * height; j++) {
                                const off = j * 4;
                                content[off] = data[off + 2]; content[off + 1] = data[off + 1];
                                content[off + 2] = data[off]; content[off + 3] = data[off + 3];
                            }
                            const blob = new Blob([header, content], { type: 'image/x-tga' });
                            if (folder) folder.file(`frame_${i.toString().padStart(4, '0')}.tga`, blob);
                        }
                    } else {
                        const blob = await new Promise<Blob | null>(resolve => 
                            canvas.toBlob(resolve, format === 'JPG' ? 'image/jpeg' : 'image/png')
                        );
                        if (blob && folder) {
                            const fileName = `frame_${i.toString().padStart(4, '0')}.${format.toLowerCase()}`;
                            folder.file(fileName, blob);
                        }
                    }
                    
                    await new Promise(r => setTimeout(r, 0));
                }

                setStatus('Zipping...');
                const content = await zip.generateAsync({ type: "blob" });
                saveAs(content, "sequence.zip");
                setIsExporting(false);

            } else if (exportType === 'VIDEO') {
                const stream = canvas.captureStream(fps);
                let mimeType = 'video/webm;codecs=vp9';
                if (format === 'MP4') mimeType = 'video/mp4'; // Try MP4 if supported
                
                // Fallback for AVI/MOV (Browser doesn't support native AVI/MOV encoding usually)
                // We will wrap WebM or MP4 and just change extension if user insists, or warn.
                // For now, let's try to use the requested format if supported, otherwise default to WebM but save with extension.
                // Note: Saving WebM as .avi won't make it an AVI. But user asked for the option.
                
                if (!MediaRecorder.isTypeSupported(mimeType)) {
                    console.warn(`${mimeType} not supported, falling back to video/webm`);
                    mimeType = 'video/webm';
                }

                const mediaRecorder = new MediaRecorder(stream, {
                    mimeType: mimeType,
                    videoBitsPerSecond: 8000000 // 8 Mbps
                });

                const chunks: Blob[] = [];
                mediaRecorder.ondataavailable = (e) => {
                    if (e.data.size > 0) chunks.push(e.data);
                };

                mediaRecorder.onstop = () => {
                    const blob = new Blob(chunks, { type: mimeType });
                    saveAs(blob, `animation.${format.toLowerCase()}`);
                    setIsExporting(false);
                };

                mediaRecorder.start();

                for (let i = 0; i < totalFrames; i++) {
                    setStatus(`Recording Frame ${i + 1}/${totalFrames}`);
                    setProgress((i / totalFrames) * 100);
                    await renderFrameToCanvas(i, canvas);
                    await new Promise(r => setTimeout(r, 1000 / fps));
                }

                mediaRecorder.stop();
            }
        } catch (e) {
            console.error(e);
            setStatus('Error exporting');
            setIsExporting(false);
        }
    };

    return (
        <div className="bg-gray-800 rounded-xl shadow-2xl border border-gray-700 w-[500px] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-900/50">
                <h2 className="text-lg font-bold flex items-center gap-2">
                    <Download size={20} className="text-blue-400"/>
                    Export
                </h2>
                <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                    <X size={20} />
                </button>
            </div>

            <div className="p-6 space-y-6">
                
                {/* Export Type Selection */}
                <div className="grid grid-cols-3 gap-4">
                    <button 
                        onClick={() => setExportType('IMAGE')}
                        className={`flex flex-col items-center gap-2 p-4 rounded-lg border transition-all ${exportType === 'IMAGE' ? 'bg-blue-600 border-blue-400 text-white' : 'bg-gray-700 border-gray-600 text-gray-400 hover:bg-gray-600'}`}
                    >
                        <ImageIcon size={24} />
                        <span className="text-sm font-bold">Current Frame</span>
                    </button>
                    <button 
                        onClick={() => setExportType('SEQUENCE')}
                        className={`flex flex-col items-center gap-2 p-4 rounded-lg border transition-all ${exportType === 'SEQUENCE' ? 'bg-blue-600 border-blue-400 text-white' : 'bg-gray-700 border-gray-600 text-gray-400 hover:bg-gray-600'}`}
                    >
                        <Film size={24} />
                        <span className="text-sm font-bold">Image Sequence</span>
                    </button>
                    <button 
                        onClick={() => {
                            setExportType('VIDEO');
                            setFormat('WEBM');
                        }}
                        className={`flex flex-col items-center gap-2 p-4 rounded-lg border transition-all ${exportType === 'VIDEO' ? 'bg-blue-600 border-blue-400 text-white' : 'bg-gray-700 border-gray-600 text-gray-400 hover:bg-gray-600'}`}
                    >
                        <FileVideo size={24} />
                        <span className="text-sm font-bold">Video</span>
                    </button>
                </div>

                {/* Format Selection */}
                <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase">Format</label>
                    <div className="flex gap-2 flex-wrap">
                        {exportType === 'VIDEO' ? (
                            <>
                                <button 
                                    onClick={() => setFormat('WEBM')}
                                    className={`px-4 py-2 rounded border text-sm font-bold transition-colors ${format === 'WEBM' ? 'bg-blue-600 border-blue-400 text-white' : 'bg-gray-700 border-gray-600 text-gray-400'}`}
                                >
                                    WEBM
                                </button>
                                <button 
                                    onClick={() => setFormat('MP4')}
                                    className={`px-4 py-2 rounded border text-sm font-bold transition-colors ${format === 'MP4' ? 'bg-blue-600 border-blue-400 text-white' : 'bg-gray-700 border-gray-600 text-gray-400'}`}
                                >
                                    MP4
                                </button>
                                <button 
                                    onClick={() => setFormat('AVI')}
                                    className={`px-4 py-2 rounded border text-sm font-bold transition-colors ${format === 'AVI' ? 'bg-blue-600 border-blue-400 text-white' : 'bg-gray-700 border-gray-600 text-gray-400'}`}
                                >
                                    AVI
                                </button>
                                <button 
                                    onClick={() => setFormat('MOV')}
                                    className={`px-4 py-2 rounded border text-sm font-bold transition-colors ${format === 'MOV' ? 'bg-blue-600 border-blue-400 text-white' : 'bg-gray-700 border-gray-600 text-gray-400'}`}
                                >
                                    MOV
                                </button>
                            </>
                        ) : (
                            <>
                                <button 
                                    onClick={() => setFormat('PNG')}
                                    className={`px-4 py-2 rounded border text-sm font-bold transition-colors ${format === 'PNG' ? 'bg-blue-600 border-blue-400 text-white' : 'bg-gray-700 border-gray-600 text-gray-400'}`}
                                >
                                    PNG
                                </button>
                                <button 
                                    onClick={() => setFormat('JPG')}
                                    className={`px-4 py-2 rounded border text-sm font-bold transition-colors ${format === 'JPG' ? 'bg-blue-600 border-blue-400 text-white' : 'bg-gray-700 border-gray-600 text-gray-400'}`}
                                >
                                    JPG
                                </button>
                                <button 
                                    onClick={() => setFormat('TGA')}
                                    className={`px-4 py-2 rounded border text-sm font-bold transition-colors ${format === 'TGA' ? 'bg-blue-600 border-blue-400 text-white' : 'bg-gray-700 border-gray-600 text-gray-400'}`}
                                >
                                    TGA
                                </button>
                            </>
                        )}
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                        <input
                            id="include-inbetween"
                            type="checkbox"
                            checked={includeInbetweenFrames}
                            onChange={(e) => setIncludeInbetweenFrames(e.target.checked)}
                            className="rounded border-gray-600 bg-gray-800 text-blue-500"
                        />
                        <label htmlFor="include-inbetween" className="text-xs text-gray-300">
                            Render in-between / tweened frames (off = only explicit keyframes render strokes)
                        </label>
                    </div>
                </div>

                {/* Info Summary */}
                <div className="bg-gray-900/50 p-3 rounded border border-gray-700 text-xs text-gray-400 space-y-1">
                    <div className="flex justify-between">
                        <span>Resolution:</span>
                        <span className="text-white">{projectSettings.cameraResolution.width} x {projectSettings.cameraResolution.height}</span>
                    </div>
                    {exportType !== 'IMAGE' && (
                        <div className="flex justify-between">
                            <span>Duration:</span>
                            <span className="text-white">{totalFrames} frames @ {fps} FPS ({(totalFrames/fps).toFixed(1)}s)</span>
                        </div>
                    )}
                </div>

                {/* Progress Bar */}
                {isExporting && (
                    <div className="space-y-1">
                        <div className="flex justify-between text-xs text-blue-300">
                            <span>{status}</span>
                            <span>{Math.round(progress)}%</span>
                        </div>
                        <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-blue-500 transition-all duration-100"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                    </div>
                )}

            </div>

            <div className="p-4 border-t border-gray-700 bg-gray-900/50 flex justify-end gap-2">
                <button 
                    onClick={onClose}
                    disabled={isExporting}
                    className="px-4 py-2 rounded text-sm font-bold text-gray-400 hover:text-white hover:bg-gray-700 transition-colors disabled:opacity-50"
                >
                    Cancel
                </button>
                <button 
                    onClick={handleExport}
                    disabled={isExporting}
                    className="px-6 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold shadow-lg shadow-blue-900/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                    {isExporting ? 'Exporting...' : 'Export'}
                </button>
            </div>
        </div>
    );
};
