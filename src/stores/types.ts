import type { Vector2 } from 'three';
import type { AIVertex } from '../lib/gemini';

export type MathShape = 'cube' | 'sphere' | 'cylinder' | 'cone' | 'pyramid';
export type AppTab = 'launcher' | 'whiteboard' | 'function' | 'calculator3d' | 'ar_3d' | 'physics' | 'chem' | 'rocket' | 'pool' | 'profile';

export interface UserProfile {
  name: string;
  avatar: string;
  role: string;
  email: string;
}

export interface HandState {
  cursor: Vector2;
  pixelCursor: { x: number; y: number };
  isPinched: boolean;
  isVisible: boolean;
  pinchDistance: number;
}

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface CustomModel {
  id: string;
  name: string;
  vertices: AIVertex[];
  faces: number[][];
  edges: number[][];
}

export interface SurfaceStroke {
  id: string;
  points: Point3D[];
  color: string;
  thickness: number;
}

export interface AuxiliaryLine {
  id: string;
  p1: Point3D;
  p2: Point3D;
  isAuxiliary: boolean;
  extendBefore: number;
  extendAfter: number;
  showLength: boolean;
}

export interface SectionPlane {
  id: string;
  points: Point3D[];
  color: string;
}

export interface PageData {
  id: string;
  whiteboardDataUrl: string | null;
  boardWidth?: number;
  boardHeight?: number;
  embeds?: WhiteboardEmbed[];
  geometry: {
    points: any[];
    segments: any[];
    circles: any[];
  };
}

export type WhiteboardEmbedKind = 'function' | 'calculator3d';

export interface WhiteboardEmbed {
  id: string;
  kind: WhiteboardEmbedKind;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  minimized: boolean;
  state: Record<string, unknown>;
}
