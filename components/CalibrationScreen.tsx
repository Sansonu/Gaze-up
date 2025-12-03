import React, { useState, useEffect, useRef } from 'react';
import { Point, CalibrationConfig } from '../types';
import { Target, CheckCircle2 } from 'lucide-react';

interface CalibrationScreenProps {
  rawHead: Point | null;
  onComplete: (config: CalibrationConfig) => void;
  onCancel: () => void;
}

const POINTS = [
  { x: 0.1, y: 0.1, label: "Top Left" },
  { x: 0.9, y: 0.1, label: "Top Right" },
  { x: 0.9, y: 0.9, label: "Bottom Right" },
  { x: 0.1, y: 0.9, label: "Bottom Left" }
];

const CAPTURE_DURATION = 1000; // ms to hold gaze
const SETTLE_DELAY = 1000; // ms to wait before capturing

export const CalibrationScreen: React.FC<CalibrationScreenProps> = ({ rawHead, onComplete, onCancel }) => {
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isCapturing, setIsCapturing] = useState(false);
  const [measurements, setMeasurements] = useState<Point[]>([]);
  
  // Refs for logic to avoid effect closures
  const stepRef = useRef(0);
  const progressRef = useRef(0);
  const samplesRef = useRef<Point[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    // Start sequence for a step
    const startStep = () => {
      setProgress(0);
      progressRef.current = 0;
      samplesRef.current = [];
      setIsCapturing(false);

      // Wait for user to look at dot, then start capturing
      setTimeout(() => {
        setIsCapturing(true);
      }, SETTLE_DELAY);
    };

    startStep();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [step]);

  // Game Loop for capturing data
  useEffect(() => {
    if (!isCapturing || !rawHead) return;

    // Collect samples
    samplesRef.current.push(rawHead);
    
    // Update progress
    const increment = 100 / (CAPTURE_DURATION / 16); // assuming ~60fps
    const nextProgress = Math.min(100, progressRef.current + increment);
    progressRef.current = nextProgress;
    setProgress(nextProgress);

    if (nextProgress >= 100) {
      setIsCapturing(false);
      finishStep();
    }
  }, [rawHead, isCapturing]);

  const finishStep = () => {
    // Calculate average point for this step
    const samples = samplesRef.current;
    if (samples.length === 0) return;

    const avgX = samples.reduce((sum, p) => sum + p.x, 0) / samples.length;
    const avgY = samples.reduce((sum, p) => sum + p.y, 0) / samples.length;
    
    const newMeasurements = [...measurements, { x: avgX, y: avgY }];
    setMeasurements(newMeasurements);

    if (step < POINTS.length - 1) {
      setStep(s => s + 1);
    } else {
      computeCalibration(newMeasurements);
    }
  };

  const computeCalibration = (points: Point[]) => {
    // We have 4 points: TL, TR, BR, BL
    // Corresponding to Screen: (0.1, 0.1), (0.9, 0.1), (0.9, 0.9), (0.1, 0.9)
    
    const pTL = points[0];
    const pTR = points[1];
    const pBR = points[2];
    const pBL = points[3];

    // Average Raw X values for Left (Screen 0.1) and Right (Screen 0.9)
    const rawXLeft = (pTL.x + pBL.x) / 2;
    const rawXRight = (pTR.x + pBR.x) / 2;

    // Average Raw Y values for Top (Screen 0.1) and Bottom (Screen 0.9)
    const rawYTop = (pTL.y + pTR.y) / 2;
    const rawYBottom = (pBL.y + pBR.y) / 2;

    // Extrapolate to Screen 0.0 and 1.0
    // rangeX represents 0.8 of the screen width (0.9 - 0.1)
    const rangeX = rawXRight - rawXLeft;
    const startX = rawXLeft - (rangeX / 0.8) * 0.1;
    const endX = rawXRight + (rangeX / 0.8) * 0.1;

    const rangeY = rawYBottom - rawYTop;
    const startY = rawYTop - (rangeY / 0.8) * 0.1;
    const endY = rawYBottom + (rangeY / 0.8) * 0.1;

    const config: CalibrationConfig = {
      x: { start: startX, end: endX },
      y: { start: startY, end: endY }
    };

    onComplete(config);
  };

  // Helper to map raw head to screen for visual feedback (uncalibrated preview)
  const getPreviewPosition = (raw: Point) => {
    // Default amplification matching uncalibrated behavior logic
    const SENSITIVITY = 2.5;
    
    // Raw X logic: Nose Left -> X increases (if camera mirrored image). 
    // We want Screen Cursor Left.
    // Uncalibrated logic in VisionService: targetX = 1 - (0.5 + (noseX - 0.5) * 2.5)
    
    let x = 1 - (0.5 + (raw.x - 0.5) * SENSITIVITY);
    let y = 0.5 + (raw.y - 0.5) * SENSITIVITY;

    // Clamp
    x = Math.max(0, Math.min(1, x));
    y = Math.max(0, Math.min(1, y));

    return { x: x * 100, y: y * 100 };
  };

  const currentPoint = POINTS[step];
  const previewPos = rawHead ? getPreviewPosition(rawHead) : { x: 50, y: 50 };

  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col items-center justify-center text-white cursor-none">
      <div className="absolute top-8 text-center animate-pulse">
        <h2 className="text-2xl font-light tracking-[0.2em] mb-2">SYSTEM CALIBRATION</h2>
        <p className="text-white/50 text-sm">Follow the target with your head.</p>
      </div>

      {/* Cancel Button */}
      <button 
        onClick={onCancel}
        className="absolute bottom-8 text-white/30 hover:text-white/80 uppercase text-xs tracking-widest transition-colors z-50"
      >
        Cancel Calibration
      </button>

      {/* Connecting Line (Visual Guide) */}
      {rawHead && (
        <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20">
          <line 
            x1={`${previewPos.x}%`} 
            y1={`${previewPos.y}%`} 
            x2={`${currentPoint.x * 100}%`} 
            y2={`${currentPoint.y * 100}%`} 
            stroke="#22d3ee" 
            strokeWidth="1" 
            strokeDasharray="4 4"
          />
        </svg>
      )}

      {/* Raw Head Input Indicator */}
      {rawHead && (
        <div 
          className="absolute w-6 h-6 rounded-full border border-red-500/50 flex items-center justify-center transition-all duration-75 ease-out z-40 pointer-events-none"
          style={{
            left: `${previewPos.x}%`,
            top: `${previewPos.y}%`,
            transform: 'translate(-50%, -50%)'
          }}
        >
          <div className="w-1.5 h-1.5 bg-red-500 rounded-full"></div>
          <div className="absolute -top-5 text-[10px] text-red-500/70 font-mono tracking-wider whitespace-nowrap">INPUT</div>
        </div>
      )}

      {/* Target */}
      <div 
        className="absolute w-16 h-16 flex items-center justify-center transition-all duration-700 ease-in-out"
        style={{
          left: `${currentPoint.x * 100}%`,
          top: `${currentPoint.y * 100}%`,
          transform: 'translate(-50%, -50%)'
        }}
      >
        {/* Progress Ring */}
        <svg className="absolute w-20 h-20 -rotate-90">
           <circle 
             cx="40" cy="40" r="36" 
             fill="none" 
             stroke="#333" 
             strokeWidth="4"
           />
           <circle 
             cx="40" cy="40" r="36" 
             fill="none" 
             stroke="#22d3ee" 
             strokeWidth="4"
             strokeDasharray="226"
             strokeDashoffset={226 - (226 * (progress / 100))}
             className="transition-all duration-100 ease-linear"
           />
        </svg>

        <div className="w-4 h-4 bg-cyan-400 rounded-full shadow-[0_0_20px_#22d3ee] animate-ping opacity-75 absolute"></div>
        <div className="w-3 h-3 bg-white rounded-full relative z-10"></div>
      </div>
      
      {/* Raw Head Position Debug */}
      {rawHead && (
          <div className="absolute bottom-4 right-4 text-[10px] font-mono text-white/20">
              RAW: {rawHead.x.toFixed(3)}, {rawHead.y.toFixed(3)}
          </div>
      )}
    </div>
  );
};
