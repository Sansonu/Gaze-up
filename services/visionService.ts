
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { Point, CalibrationConfig } from "../types";

// Configuration for blink detection sensitivity
const BLINK_THRESHOLD = 0.45; // Eye Aspect Ratio threshold
const BLINK_MIN_DURATION = 100; // ms
const BLINK_MAX_DURATION = 300; // ms

// MediaPipe Model Asset Path (using standard CDN)
const MP_BASE_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm";

class VisionService {
  private faceLandmarker: FaceLandmarker | null = null;
  private video: HTMLVideoElement | null = null;
  private lastVideoTime = -1;
  private requestRef: number | null = null;
  private onResult: (result: any) => void;
  
  // Cursor State
  private cursorX = 0.5;
  private cursorY = 0.5;

  // Smoothing & Jitter Control
  // Refined parameters for smoother fine control and responsive large movements
  private readonly JITTER_THRESHOLD = 0.002; // Reduced threshold to prevent 'stuck' feeling on micro-moves
  private readonly IDLE_SMOOTHING = 0.02; // Higher value for fine control stability
  private readonly ACTIVE_SMOOTHING = 0.1; // Lower base for smoother acceleration
  private readonly MAX_SMOOTHING = 0.5; // Higher cap for fast flicks

  // Blink Tracking
  private blinkStartTime = -1;

  // Dwell Tracking
  private dwellAnchor = { x: 0.5, y: 0.5 };
  private dwellStartTime = -1;
  private hasTriggeredDwell = false;
  private readonly DWELL_RADIUS = 0.04; // 4% of screen dimensions
  private readonly DWELL_DURATION = 600; // ms to trigger dwell

  // Calibration
  private calibration: CalibrationConfig | null = null;

  constructor(onResult: (result: any) => void) {
    this.onResult = onResult;
    this.loadCalibration();
  }

  loadCalibration() {
    try {
      const stored = localStorage.getItem('gazeos-calibration');
      if (stored) {
        this.calibration = JSON.parse(stored);
      }
    } catch (e) {
      console.warn("Failed to load calibration", e);
    }
  }

  setCalibration(config: CalibrationConfig) {
    this.calibration = config;
    localStorage.setItem('gazeos-calibration', JSON.stringify(config));
  }

  async initialize() {
    const vision = await FilesetResolver.forVisionTasks(MP_BASE_URL);
    this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
        delegate: "GPU",
      },
      outputFaceBlendshapes: true,
      runningMode: "VIDEO",
      numFaces: 1,
    });
    // Init dwell timer
    this.dwellStartTime = performance.now();
  }

  async startCamera(videoElement: HTMLVideoElement) {
    this.video = videoElement;
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 1280, height: 720, facingMode: "user" },
    });
    this.video.srcObject = stream;
    this.video.addEventListener("loadeddata", this.predictWebcam);
  }

  stop() {
    if (this.requestRef) {
      cancelAnimationFrame(this.requestRef);
    }
    if (this.video && this.video.srcObject) {
      const stream = this.video.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }
  }

  private predictWebcam = () => {
    if (!this.faceLandmarker || !this.video) return;

    if (this.video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = this.video.currentTime;
      const startTimeMs = performance.now();
      
      const results = this.faceLandmarker.detectForVideo(this.video, startTimeMs);

      if (results.faceLandmarks && results.faceLandmarks.length > 0) {
        const landmarks = results.faceLandmarks[0];

        // 1. Get Raw Nose Position (Index 1)
        const noseX = landmarks[1].x; 
        const noseY = landmarks[1].y;

        let targetX = 0.5;
        let targetY = 0.5;

        // 2. Map to Screen Coordinates
        if (this.calibration) {
            // Use calibration data
            // Formula: screen = (raw - start) / (end - start)
            targetX = (noseX - this.calibration.x.start) / (this.calibration.x.end - this.calibration.x.start);
            targetY = (noseY - this.calibration.y.start) / (this.calibration.y.end - this.calibration.y.start);
        } else {
            // Default Fallback Logic (Manual amplification)
            const amplifiedX = 0.5 + (noseX - 0.5) * 2.5; 
            const amplifiedY = 0.5 + (noseY - 0.5) * 2.5;
            // Mirror X by default for natural feeling if uncalibrated
            targetX = 1 - Math.max(0, Math.min(1, amplifiedX)); 
            targetY = Math.max(0, Math.min(1, amplifiedY));
        }

        // Clamp to screen
        targetX = Math.max(0, Math.min(1, targetX));
        targetY = Math.max(0, Math.min(1, targetY));

        // 3. Adaptive Smoothing & Jitter Reduction
        const dx = targetX - this.cursorX;
        const dy = targetY - this.cursorY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        let alpha = this.ACTIVE_SMOOTHING;

        if (distance < this.JITTER_THRESHOLD) {
          // Soft deadzone: very heavy smoothing to hold position steady
          // But allow slight movement so it doesn't feel completely dead
          alpha = this.IDLE_SMOOTHING;
        } else {
          // Dynamic response: Move faster if the distance is larger (catch up)
          // Increased multiplier to 5 for better tracking of fast movements
          alpha = this.ACTIVE_SMOOTHING + (distance * 5); 
          alpha = Math.min(alpha, this.MAX_SMOOTHING);
        }

        this.cursorX += dx * alpha;
        this.cursorY += dy * alpha;

        // 4. Calculate Blink (EAR)
        const leftEAR = this.calculateEAR(landmarks, [33, 160, 158, 133, 153, 144]);
        const rightEAR = this.calculateEAR(landmarks, [362, 385, 387, 263, 373, 380]);
        const avgEAR = (leftEAR + rightEAR) / 2;
        
        const isBlinking = avgEAR < BLINK_THRESHOLD;
        let didBlink = false;

        if (isBlinking) {
          if (this.blinkStartTime === -1) {
            this.blinkStartTime = performance.now();
          }
        } else {
          if (this.blinkStartTime !== -1) {
            const duration = performance.now() - this.blinkStartTime;
            if (duration >= BLINK_MIN_DURATION && duration <= BLINK_MAX_DURATION) {
              didBlink = true;
            }
            this.blinkStartTime = -1;
          }
        }

        // 5. Dwell Detection
        // Calculate distance from current dwell anchor
        const dwellDist = Math.sqrt(
          Math.pow(this.cursorX - this.dwellAnchor.x, 2) + 
          Math.pow(this.cursorY - this.dwellAnchor.y, 2)
        );

        let dwellProgress = 0;
        let didDwell = false;

        if (dwellDist > this.DWELL_RADIUS) {
          // Moved outside radius: reset anchor and timer
          this.dwellAnchor = { x: this.cursorX, y: this.cursorY };
          this.dwellStartTime = performance.now();
          this.hasTriggeredDwell = false;
        } else {
          // Inside radius
          if (!this.hasTriggeredDwell) {
            const elapsed = performance.now() - this.dwellStartTime;
            dwellProgress = Math.min(1, elapsed / this.DWELL_DURATION);
            
            if (elapsed >= this.DWELL_DURATION) {
              didDwell = true;
              this.hasTriggeredDwell = true;
              dwellProgress = 0; // Reset progress visual on trigger
            }
          }
        }

        this.onResult({
          cursor: { x: this.cursorX, y: this.cursorY },
          rawHead: { x: noseX, y: noseY }, // Pass raw data for calibration UI
          isBlinking,
          ear: avgEAR,
          didBlink,
          dwellProgress,
          didDwell
        });
      }
    }

    this.requestRef = requestAnimationFrame(this.predictWebcam);
  };

  private dist(p1: {x:number, y:number}, p2: {x:number, y:number}) {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
  }

  private calculateEAR(landmarks: any[], indices: number[]) {
    const v1 = this.dist(landmarks[indices[1]], landmarks[indices[5]]);
    const v2 = this.dist(landmarks[indices[2]], landmarks[indices[4]]);
    const h = this.dist(landmarks[indices[0]], landmarks[indices[3]]);
    return (v1 + v2) / (2.0 * h);
  }
}

export const visionService = (callback: any) => new VisionService(callback);
