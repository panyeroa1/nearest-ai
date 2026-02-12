import React from 'react';
import { Blip } from '../types';

interface RadarUIProps {
  isScanning: boolean;
  radius: number;
  hasResults: boolean;
  isLocating: boolean;
  isStale: boolean;
  showRipple: boolean;
  isSpeaking?: boolean;
  blips?: Blip[];
}

const RadarUI: React.FC<RadarUIProps> = ({ 
  isScanning, 
  radius, 
  hasResults, 
  isLocating, 
  isStale, 
  showRipple,
  isSpeaking,
  blips = [] 
}) => {
  return (
    <div className="relative w-full aspect-square max-w-[400px] mx-auto flex items-center justify-center p-4">
      {/* Outer Glow */}
      <div className={`absolute inset-0 rounded-full border border-green-900/50 shadow-[0_0_50px_rgba(20,83,45,0.3)] transition-colors duration-1000 ${isStale && !isLocating ? 'border-yellow-900/50 shadow-[0_0_50px_rgba(113,63,18,0.2)]' : ''}`}></div>
      
      {/* Radar Circles */}
      {[0.2, 0.4, 0.6, 0.8, 1].map((scale, i) => (
        <div 
          key={i}
          className={`absolute border rounded-full transition-colors duration-1000 ${isStale && !isLocating ? 'border-yellow-500/10' : 'border-green-500/20'}`}
          style={{ width: `${scale * 100}%`, height: `${scale * 100}%` }}
        >
          <span className="absolute top-1/2 left-2 text-[8px] opacity-30 select-none font-mono">
            {Math.round((radius * scale) * 10) / 10}km
          </span>
        </div>
      ))}

      {/* Crosshairs */}
      <div className={`absolute w-[1px] h-full transition-colors duration-1000 ${isStale && !isLocating ? 'bg-yellow-500/5' : 'bg-green-500/10'}`}></div>
      <div className={`absolute h-[1px] w-full transition-colors duration-1000 ${isStale && !isLocating ? 'bg-yellow-500/5' : 'bg-green-500/10'}`}></div>

      {/* Sweep Animation */}
      <div className={`absolute w-full h-full rounded-full pointer-events-none transition-all duration-1000 ${(isScanning || isLocating) ? 'opacity-100' : 'opacity-20'} ${isStale && !isLocating ? 'radar-sweep-yellow' : 'radar-sweep'}`}></div>

      {/* Result Blips */}
      {hasResults && !isLocating && blips.map((blip) => {
        const radiusPx = 50; 
        const angleRad = (blip.angle - 90) * (Math.PI / 180);
        const x = 50 + (blip.distanceFactor * radiusPx * Math.cos(angleRad));
        const y = 50 + (blip.distanceFactor * radiusPx * Math.sin(angleRad));

        return (
          <div 
            key={blip.id}
            className="absolute w-3 h-3 z-20 group"
            style={{ 
              left: `${x}%`, 
              top: `${y}%`,
              transform: 'translate(-50%, -50%)'
            }}
          >
            <div className="w-2 h-2 bg-green-300 rounded-full blip animate-blip"></div>
            <div className="absolute inset-0 w-full h-full border border-green-400 rounded-full animate-ping opacity-20"></div>
            <div className="absolute top-4 left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-0.5 bg-black/80 border border-green-500/30 rounded text-[7px] text-green-400 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none font-mono uppercase tracking-tighter">
              {blip.title}
            </div>
          </div>
        );
      })}

      {/* Center Blip (User Location) */}
      <div className="relative flex items-center justify-center scale-125">
         {/* Success Ripple Effect */}
         {showRipple && (
           <div className="absolute w-full h-full flex items-center justify-center pointer-events-none">
             <div className="absolute w-20 h-20 border-4 border-green-400 rounded-full animate-ripple"></div>
           </div>
         )}

         {/* Locating / Syncing Ring */}
         {isLocating && (
           <div className="absolute w-8 h-8 border-2 border-dashed border-cyan-400/60 rounded-full animate-spin"></div>
         )}
         
         {/* Warning Aura for Stale Data */}
         {isStale && !isLocating && (
           <div className="absolute w-10 h-10 border border-yellow-500/30 rounded-full animate-ping"></div>
         )}

         {/* Speaking Ripple */}
         {isSpeaking && (
           <div className="absolute w-12 h-12 bg-green-400/30 rounded-full animate-ping"></div>
         )}

         {/* Core Blip with smooth color transition */}
         <div 
          className={`w-3.5 h-3.5 rounded-full z-10 transition-all duration-1000 ease-in-out
            ${isLocating ? 'animate-pulse bg-cyan-400 shadow-[0_0_20px_#22d3ee]' : 
              isStale ? 'bg-yellow-500 shadow-[0_0_20px_#eab308] animate-pulse' : 
              'bg-green-400 shadow-[0_0_20px_rgba(34,197,94,0.8)]'
            }`}
          ></div>
          
          {isLocating && (
            <div className="absolute w-6 h-6 bg-cyan-400/20 rounded-full animate-pulse"></div>
          )}
      </div>

      {/* Locating Overlay */}
      {isLocating && (
        <div className="absolute inset-0 flex items-center justify-center z-[60]">
          <div className="bg-black/80 px-4 py-2 rounded border border-cyan-500/50 animate-pulse text-[10px] tracking-widest text-cyan-400 font-mono font-black italic">
            <i className="fa-solid fa-satellite mr-2"></i>
            SYNCING ORBITAL LINK...
          </div>
        </div>
      )}

      {/* Status Overlay */}
      <div className="absolute top-4 left-4 text-[9px] uppercase tracking-widest font-black font-mono transition-colors duration-1000">
        <span className={isStale && !isLocating ? 'text-yellow-600' : 'text-green-500/50'}>
          {isScanning ? 'Scan Mode: Active' : isLocating ? 'GPS: Syncing' : isSpeaking ? 'Uplink: Transmitting' : 'Grid: Standby'}
        </span>
        <br />
        <span className="opacity-40">Identified: {blips.length} Targets</span>
        {isStale && !isLocating && (
          <div className="text-yellow-500 mt-1 animate-pulse italic">
            <i className="fa-solid fa-triangle-exclamation mr-1"></i>
            SIGNAL DEGRADED
          </div>
        )}
      </div>
    </div>
  );
};

export default RadarUI;