
export interface Point {
  x: number;
  y: number;
  cp1?: { x: number, y: number }; // Incoming Control Point (Left/Previous)
  cp2?: { x: number, y: number }; // Outgoing Control Point (Right/Next)
}

export interface Stroke {
  id: string;
  points: Point[];
  layerId: string; // New: Association with a specific layer
  isSelected?: boolean;
  center?: Point; 
  linkedStrokeIds?: string[]; 
  parents?: string[]; 
  isClosed?: boolean; 
  fillColor?: string;
  color?: string;
  width?: number;
  taperStart?: number; // 0-1 (percentage of length)
  taperEnd?: number; // 0-1 (percentage of length)
}

export type EasingType = 'LINEAR' | 'EASE_IN' | 'EASE_OUT' | 'EASE_IN_OUT';
export type KeyframeType = 'KEY' | 'HOLD' | 'GENERATED';

export interface Keyframe {
  id: string;
  layerId: string; // CHANGED: Keyframes are now owned by a layer
  index: number; 
  type: KeyframeType;
  strokes: Stroke[];
  motionPaths?: Stroke[]; 
  easing?: EasingType; 
  generatedStrategy?: AutoMatchStrategy; 
}

// --- Camera & Project Types ---

export interface Resolution {
  width: number;
  height: number;
}

export interface ViewportTransform {
    x: number;
    y: number;
    zoom: number;
}

export interface CameraTransform {
  x: number; // Center X
  y: number; // Center Y
  rotation: number; // Degrees
  zoom: number; // Scale factor
}

export interface CameraKeyframe {
  id: string;
  index: number;
  transform: CameraTransform;
  easing: EasingType;
}

export interface ProjectSettings {
  cameraResolution: Resolution;
  canvasSize: Resolution;
  dpi: number;
  antiAliasing: boolean;
  canvasColor: string;
  canvasTransparent: boolean; // For export
  showGrid: boolean;
  gridSize: number;
  gridOpacity: number;
  showCameraOverlay: boolean;
  cameraOverlayColor: string;
  cameraOverlayOpacity: number;
}

// ------------------------------

export interface BindingMap {
  [sourceStrokeId: string]: string; 
}

export interface GroupBinding {
  id: string;
  sourceFrameIndex: number;
  targetFrameIndex: number;
  sourceStrokeIds: string[];
  targetStrokeIds: string[];
}

// ToolType enum removed from here as it was redefined below.
// Wait, I should remove the OLD definition.

export enum TransformMode {
  TRANSLATE = 'TRANSLATE',
  ROTATE = 'ROTATE',
  SCALE = 'SCALE'
}

export type AutoMatchStrategy = 'INDEX' | 'SPATIAL';

export interface ToolOptions {
    overwriteTargets: boolean; 
    swapTargets: boolean;      
    autoMatchStrategy: AutoMatchStrategy;
    snappingEnabled: boolean;
    crossLayerSnapping: boolean; // New: Allow vectors to snap across different layers
    crossLayerPainting: boolean;
    crossGroupPainting: boolean;
    closeCreatesFill: boolean;
    smoothingFactor: number; 
    showBezierHandles: boolean;
    transformMode: TransformMode;
    autoMerge: boolean; 
    optimizeFreehand: boolean;
    defaultColor: string;
    defaultWidth: number;
    defaultTaperStart: number;
    defaultTaperEnd: number;
    autoClose: boolean;
    defaultFillColor: string;
    drawStroke: boolean;
    drawFill: boolean;
    gapClosingDistance: number;
}

// --- Layer System Types ---
export type LayerType = 'VECTOR' | 'GROUP';

export interface Layer {
    id: string;
    name: string;
    type: LayerType;
    parentId: string | null; // For nesting in groups
    isVisible: boolean;
    isLocked: boolean;
    isExpanded: boolean; // For groups
    isSynced: boolean; // NEW: Determines if timeline actions apply uniformly
    depth: number; // Visual indentation level
}

export const DEFAULT_FPS = 24;
export const DEFAULT_CANVAS_WIDTH = 2334;
export const DEFAULT_CANVAS_HEIGHT = 1658;
export const DEFAULT_CAMERA_WIDTH = 1920;
export const DEFAULT_CAMERA_HEIGHT = 1080;

export enum ToolType {
  SELECT = 'SELECT',
  TRANSFORM = 'TRANSFORM', 
  PEN = 'PEN',
  BIND = 'BIND',
  ANCHOR = 'ANCHOR',
  POLYLINE = 'POLYLINE', 
  CURVE = 'CURVE',       
  RECTANGLE = 'RECTANGLE',
  CIRCLE = 'CIRCLE',
  TRIANGLE = 'TRIANGLE',
  STAR = 'STAR',
  MOTION_PATH = 'MOTION_PATH',
  CORRESPONDENCE = 'CORRESPONDENCE',
  CAMERA_PAN = 'CAMERA_PAN',
  PAINT_BUCKET = 'PAINT_BUCKET'
}
