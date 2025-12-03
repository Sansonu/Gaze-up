
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { visionService } from './services/visionService';
import { AppStatus, Point, Gesture, CalibrationConfig } from './types';
import { Cursor } from './components/Cursor';
import { CalibrationScreen } from './components/CalibrationScreen';
import { generateAppContent } from './services/geminiService';
import { 
  ScanEye, 
  Monitor, 
  Mail, 
  CloudSun, 
  Bot, 
  X, 
  Cpu,
  Settings
} from 'lucide-react';

// --- Constants ---
const DOUBLE_BLINK_WINDOW = 600; // ms

// --- Components (Inline for single-file structure requirement) ---

const AppIcon = ({ icon: Icon, label, isHovered, isActive }: any) => (
  <div className={`flex flex-col items-center justify-center p-6 rounded-2xl transition-all duration-300 ${
    isActive ? 'bg-cyan-500/20 border-cyan-400 scale-110 shadow-[0_0_30px_rgba(34,211,238,0.3)]' :
    isHovered ? 'bg-white/10 scale-105 border-white/30' : 
    'glass-panel border-transparent'
  } border-2 w-32 h-32 backdrop-blur-md`}>
    <Icon className={`w-10 h-10 mb-3 ${isActive ? 'text-cyan-400' : 'text-white'}`} />
    <span className="text-sm font-medium tracking-wide">{label}</span>
  </div>
);

const Window = ({ app, onClose, content, visible, onExitComplete }: any) => {
  if (!app) return null;
  
  return (
    <div 
      className={`fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm p-10 transition-opacity duration-300 ease-out ${visible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      onTransitionEnd={() => {
        if (!visible && onExitComplete) onExitComplete();
      }}
    >
      <div className={`glass-panel w-full max-w-4xl h-[80vh] rounded-3xl overflow-hidden flex flex-col relative border border-cyan-500/30 shadow-[0_0_50px_rgba(34,211,238,0.1)] transition-all duration-300 ease-out transform ${visible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}>
        
        {/* Header */}
        <div className="h-16 border-b border-white/10 flex items-center justify-center px-8 bg-white/5 relative">
          <div className="flex items-center gap-3">
            <app.icon className="w-5 h-5 text-cyan-400" />
            <h2 className="text-xl font-bold tracking-widest uppercase">{app.name}</h2>
          </div>
          <div className="absolute right-8 flex items-center gap-4 text-xs text-white/50 uppercase tracking-widest">
            <span>Double Blink to Close</span>
            <div className="w-8 h-8 rounded-full border border-white/20 flex items-center justify-center">
              <X className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-8 overflow-auto">
          {content ? (
             app.id === 'mail' || app.id === 'weather' ? (
              <div className="grid gap-4">
                 <pre className="whitespace-pre-wrap font-mono text-sm text-cyan-100/80 bg-black/20 p-6 rounded-xl border border-white/5">
                   {JSON.stringify(JSON.parse(content), null, 2)}
                 </pre>
              </div>
             ) : (
               <div className="text-2xl font-light leading-relaxed text-center mt-20 max-w-2xl mx-auto">
                 "{content.replace(/"/g, '')}"
               </div>
             )
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-cyan-400 animate-pulse">
               <Cpu className="w-12 h-12 mb-4 animate-spin-slow" />
               <span className="tracking-widest uppercase text-sm">Gemini AI Processing...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [status, setStatus] = useState<AppStatus>(AppStatus.LOADING_MODEL);
  const [cursor, setCursor] = useState<Point>({ x: 0.5, y: 0.5 });
  const [rawHead, setRawHead] = useState<Point | null>(null);
  const [isBlinking, setIsBlinking] = useState(false);
  const [gestureProgress, setGestureProgress] = useState(0); 
  
  // App Management
  const [activeApp, setActiveApp] = useState<string | null>(null); // Logic state
  const [displayedAppId, setDisplayedAppId] = useState<string | null>(null); // Visual state
  const [isWindowVisible, setIsWindowVisible] = useState(false); // Animation state

  const [appContent, setAppContent] = useState<string | null>(null);
  const [hoveredAppId, setHoveredAppId] = useState<string | null>(null);

  // Refs for State (to avoid stale closures in vision callback)
  const activeAppRef = useRef<string | null>(null);
  const statusRef = useRef<AppStatus>(status);
  const firstBlinkHitRef = useRef<string | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const visionRef = useRef<any>(null);
  
  // Gesture Refs
  const blinkCount = useRef<number>(0);
  const doubleBlinkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync Refs
  useEffect(() => { activeAppRef.current = activeApp; }, [activeApp]);
  useEffect(() => { statusRef.current = status; }, [status]);

  // Sync ActiveApp Logic to Visuals with Animation
  useEffect(() => {
    if (activeApp) {
      setDisplayedAppId(activeApp);
      // Short timeout to ensure render happens before class change for transition
      requestAnimationFrame(() => setIsWindowVisible(true));
    } else {
      setIsWindowVisible(false);
    }
  }, [activeApp]);

  const handleWindowExitComplete = () => {
    setDisplayedAppId(null);
    setAppContent(null);
  };

  // Define Apps
  const apps = [
    { id: 'mail', name: 'Comms', icon: Mail },
    { id: 'weather', name: 'Environment', icon: CloudSun },
    { id: 'assistant', name: 'Assistant', icon: Bot },
    { id: 'system', name: 'System', icon: Monitor },
  ];

  // --- Logic ---

  const loadAppContent = async (appId: string) => {
    setAppContent(null);
    const content = await generateAppContent("User opened app", appId);
    setAppContent(content || "No data received.");
  };

  // Stable callback for VisionService
  // We use Refs inside here to access latest state without needing to recreate the callback
  const processVisionResult = useCallback(({ cursor, rawHead, isBlinking: blinkingNow, didBlink, dwellProgress, didDwell }: any) => {
    setCursor(cursor);
    setRawHead(rawHead);
    setIsBlinking(blinkingNow); 
    setGestureProgress(dwellProgress); // Visualize dwell progress

    // 1. Hit Testing (Immediate)
    let hit = null;
    if (statusRef.current === AppStatus.ACTIVE && !activeAppRef.current) {
      const centerX = 0.5;
      const centerY = 0.5;
      
      // Hit boxes for apps
      if (Math.abs(cursor.x - (centerX - 0.1)) < 0.08 && Math.abs(cursor.y - centerY) < 0.1) hit = 'mail';
      if (Math.abs(cursor.x - (centerX + 0.1)) < 0.08 && Math.abs(cursor.y - centerY) < 0.1) hit = 'weather';
      if (Math.abs(cursor.x - (centerX - 0.1)) < 0.08 && Math.abs(cursor.y - (centerY + 0.2)) < 0.1) hit = 'assistant';
      if (Math.abs(cursor.x - (centerX + 0.1)) < 0.08 && Math.abs(cursor.y - (centerY + 0.2)) < 0.1) hit = 'system';
    }
    setHoveredAppId(hit);

    // 2. Dwell Gesture (Select)
    if (didDwell && statusRef.current !== AppStatus.CALIBRATING) {
        if (!activeAppRef.current && hit) {
            setActiveApp(hit);
            loadAppContent(hit);
        }
    }

    // 3. Blink Gesture Logic
    if (didBlink && statusRef.current !== AppStatus.CALIBRATING) {
      blinkCount.current += 1;

      // Capture the hit target of the FIRST blink
      if (blinkCount.current === 1) {
        firstBlinkHitRef.current = hit;
      }

      if (doubleBlinkTimer.current) clearTimeout(doubleBlinkTimer.current);

      doubleBlinkTimer.current = setTimeout(() => {
        const count = blinkCount.current;
        blinkCount.current = 0; // Reset
        
        console.log(`Blink Sequence Finished. Count: ${count}`);

        if (count === 2) {
          // Double Blink: Close Active App
          if (activeAppRef.current) {
             setActiveApp(null);
             // Note: content clearing handled in onExitComplete
          }
        } else if (count === 1) {
          // Single Blink: Open App (if not already open)
          if (!activeAppRef.current && firstBlinkHitRef.current) {
            setActiveApp(firstBlinkHitRef.current);
            loadAppContent(firstBlinkHitRef.current);
          }
        }

      }, DOUBLE_BLINK_WINDOW);
    }
  }, []); // Empty dependencies ensures this function identity never changes

  useEffect(() => {
    const initVision = async () => {
      try {
        visionRef.current = visionService(processVisionResult);
        await visionRef.current.initialize();
        setStatus(AppStatus.IDLE);
      } catch (e) {
        console.error("Failed to load models", e);
        setStatus(AppStatus.ERROR);
      }
    };
    initVision();

    return () => {
      if (visionRef.current) visionRef.current.stop();
    };
  }, [processVisionResult]);

  const startExperience = async () => {
    if (videoRef.current && visionRef.current) {
      await visionRef.current.startCamera(videoRef.current);
      
      // Check for calibration
      const hasCalibration = localStorage.getItem('gazeos-calibration');
      if (hasCalibration) {
        setStatus(AppStatus.ACTIVE);
      } else {
        setStatus(AppStatus.CALIBRATING);
      }
    }
  };

  const handleCalibrationComplete = (config: CalibrationConfig) => {
    if (visionRef.current) {
      visionRef.current.setCalibration(config);
    }
    setStatus(AppStatus.ACTIVE);
  };

  const startCalibration = () => {
    setStatus(AppStatus.CALIBRATING);
  };

  // Helper for Status Dot
  const getStatusColor = (s: AppStatus) => {
    switch(s) {
      case AppStatus.ACTIVE: return 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]';
      case AppStatus.CALIBRATING: return 'bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.6)]';
      default: return 'bg-white/20';
    }
  };

  // --- Render ---

  if (status === AppStatus.ERROR) {
    return <div className="h-screen w-screen flex items-center justify-center text-red-500">System Failure. Check Camera Permissions.</div>;
  }

  if (status === AppStatus.LOADING_MODEL) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-black text-cyan-400">
        <ScanEye className="w-16 h-16 animate-pulse mb-4" />
        <p className="tracking-widest uppercase text-sm">Initializing Neural Optical Systems...</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full min-h-screen bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-gray-900 via-black to-black overflow-hidden selection:bg-cyan-500/30">
      
      {/* Background Grid */}
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none"></div>
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'linear-gradient(rgba(34, 211, 238, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(34, 211, 238, 0.03) 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>

      {/* Camera Feed */}
      <div className="fixed top-6 right-6 z-50 glass-panel rounded-xl overflow-hidden p-1 border-white/20">
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          muted 
          className={`w-32 h-24 object-cover rounded-lg transform scale-x-[-1] ${status === AppStatus.IDLE ? 'hidden' : 'block'}`} 
        />
        {status === AppStatus.IDLE && (
          <button 
            onClick={startExperience}
            className="w-full h-24 flex items-center justify-center bg-cyan-600 hover:bg-cyan-500 text-white font-bold tracking-wider uppercase text-xs transition-colors"
          >
            Start OS
          </button>
        )}
      </div>

      {/* Calibration Screen Overlay */}
      {status === AppStatus.CALIBRATING && (
        <CalibrationScreen 
          rawHead={rawHead} 
          onComplete={handleCalibrationComplete}
          onCancel={() => setStatus(AppStatus.ACTIVE)}
        />
      )}

      {/* Main UI */}
      {status === AppStatus.ACTIVE && (
        <>
          {/* HUD Info */}
          <div className="fixed top-6 left-6 z-0 text-white/40 font-mono text-xs tracking-widest pointer-events-none">
            <div className="flex items-center gap-2 mb-1">
               <div className={`w-2 h-2 rounded-full ${getStatusColor(status)} transition-colors duration-500`}></div>
               <span className="font-bold">GAZE_OS v1.0</span>
            </div>
            <div>GEMINI_LINK: {process.env.API_KEY ? "CONNECTED" : "OFFLINE"}</div>
            <div className="mt-2">GESTURES:</div>
            <div>• DWELL/BLINK: SELECT</div>
            <div>• DOUBLE BLINK: BACK</div>
          </div>

          {/* Recalibrate Button */}
          <button 
            onClick={startCalibration}
            className="fixed bottom-6 left-6 z-50 text-white/20 hover:text-white/80 transition-colors p-2"
            title="Recalibrate"
          >
            <Settings className="w-5 h-5" />
          </button>

          <Cursor position={cursor} isClicking={isBlinking} progress={gestureProgress} />
          
          <main className={`flex items-center justify-center h-screen w-full transition-all duration-500 ${displayedAppId ? 'blur-sm scale-95 opacity-50' : ''}`}>
             <div className="grid grid-cols-2 gap-12 p-12">
                {apps.map((app) => (
                  <div key={app.id} className={`transition-transform duration-300 ${hoveredAppId === app.id ? 'scale-105' : ''}`}>
                    <AppIcon 
                      {...app} 
                      isActive={activeApp === app.id} 
                      isHovered={hoveredAppId === app.id} 
                    />
                  </div>
                ))}
             </div>
          </main>

          {/* Active Window Overlay */}
          <Window 
            app={apps.find(a => a.id === displayedAppId)} 
            content={appContent} 
            visible={isWindowVisible}
            onClose={() => setActiveApp(null)}
            onExitComplete={handleWindowExitComplete}
          />
        </>
      )}
    </div>
  );
}
