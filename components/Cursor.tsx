import React from 'react';
import { Point } from '../types';

interface CursorProps {
  position: Point;
  isClicking: boolean;
  progress: number; // For dwell or blink charging visualization
}

export const Cursor: React.FC<CursorProps> = ({ position, isClicking, progress }) => {
  const x = position.x * window.innerWidth;
  const y = position.y * window.innerHeight;

  return (
    <div 
      className="fixed pointer-events-none z-50 transition-transform duration-75 ease-out"
      style={{ 
        left: 0, 
        top: 0,
        transform: `translate(${x}px, ${y}px) translate(-50%, -50%)`
      }}
    >
      <div className="relative flex items-center justify-center">
        {/* Outer Ring */}
        <div className={`w-12 h-12 rounded-full border-2 transition-all duration-300 ${isClicking ? 'border-cyan-400 scale-75 bg-cyan-400/20' : 'border-white/50 scale-100'}`}></div>
        
        {/* Progress Ring (for long blink or dwell) */}
        <svg className="absolute w-12 h-12 rotate-[-90deg]">
           <circle 
             cx="24" cy="24" r="22" 
             fill="none" 
             stroke="#22d3ee" 
             strokeWidth="2"
             strokeDasharray="138"
             strokeDashoffset={138 - (138 * progress)}
             className="transition-all duration-100 ease-linear"
           />
        </svg>

        {/* Center Dot */}
        <div className="absolute w-1 h-1 bg-cyan-400 rounded-full shadow-[0_0_10px_#22d3ee]"></div>
      </div>
    </div>
  );
};