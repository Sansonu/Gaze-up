
export interface Point {
  x: number;
  y: number;
}

export enum AppStatus {
  IDLE = 'IDLE',
  LOADING_MODEL = 'LOADING_MODEL',
  CALIBRATING = 'CALIBRATING',
  ACTIVE = 'ACTIVE',
  ERROR = 'ERROR'
}

export enum Gesture {
  NONE = 'NONE',
  BLINK = 'BLINK',
  DOUBLE_BLINK = 'DOUBLE_BLINK',
  DWELL = 'DWELL'
}

export interface VisionEvent {
  cursor: Point;
  rawHead: Point; // Raw normalized coordinates from the model [0,1]
  isBlinking: boolean;
  ear: number;
  didBlink: boolean;
  leftEyeOpen: number;
  rightEyeOpen: number;
  dwellProgress: number; // 0 to 1
  didDwell: boolean;
}

export interface CalibrationConfig {
  x: { start: number; end: number }; // map raw val 'start' -> screen 0, 'end' -> screen 1
  y: { start: number; end: number }; // map raw val 'start' -> screen 0, 'end' -> screen 1
}

export interface AppDefinition {
  id: string;
  name: string;
  icon: string;
  description: string;
  component: React.ReactNode;
}
