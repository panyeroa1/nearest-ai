
import React, { useState, useEffect, useRef, useCallback } from 'react';
import RadarUI from './components/RadarUI';
import { fetchNearestWithMaps, generateSpeech, decodeAudioData, decodeBase64, generateReconImage } from './services/geminiService';
import { playTacticalScanSound, playLockOnSound } from './services/soundService';
import { Location, SearchResult, VoiceState, Blip, ReconImage } from './types';

const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

const App: React.FC = () => {
  const [radius, setRadius] = useState<number>(5);
  const [location, setLocation] = useState<Location | null>(null);
  const [locationTimestamp, setLocationTimestamp] = useState<number | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [showRipple, setShowRipple] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [voiceState, setVoiceState] = useState<VoiceState>({ isListening: false, transcript: '' });
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  
  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const isStale = !!(locationTimestamp && Date.now() - locationTimestamp > 60000); // 1 minute stale

  const initAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
  }, []);

  const fetchLocation = useCallback(() => {
    if (navigator.geolocation) {
      setIsLocating(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setLocationTimestamp(Date.now());
          setIsLocating(false);
          setShowRipple(true);
          setTimeout(() => setShowRipple(false), 1500);
        },
        (error) => {
          console.error("Geolocation failed", error);
          setIsLocating(false);
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    }
  }, []);

  useEffect(() => {
    fetchLocation();
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = ''; 
      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => (result as any)[0])
          .map((result: any) => result.transcript)
          .join('');
        setVoiceState(prev => ({ ...prev, transcript }));
      };
      recognition.onend = () => setVoiceState(prev => ({ ...prev, isListening: false }));
      recognitionRef.current = recognition;
    }
  }, [fetchLocation]);

  const generateBlips = (searchResult: SearchResult): Blip[] => {
    return searchResult.sources.map((source, index) => {
      const hash = source.title.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      return {
        id: `blip-${index}`,
        title: source.title,
        distanceFactor: 0.2 + ((index * 0.15 + (hash % 20) / 100) % 0.7), 
        angle: (hash * 137.5) % 360,
      };
    });
  };

  const nextSlide = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (result?.images && result.images.length > 0) {
      setCurrentSlideIndex((prev) => (prev + 1) % result.images.length);
      playLockOnSound();
    }
  };

  const prevSlide = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (result?.images && result.images.length > 0) {
      setCurrentSlideIndex((prev) => (prev - 1 + result.images.length) % result.images.length);
      playLockOnSound();
    }
  };

  const handleSearch = async (query: string) => {
    if (!location) {
      setResult({ text: "GPS signal lost. Reset coordinates.", sources: [], isThinking: false });
      return;
    }
    setIsProcessing(true);
    setCurrentSlideIndex(0);
    setIsExpanded(false);
    setResult({ text: 'Acquiring localized target signals...', sources: [], isThinking: true });

    // Sound effect for starting scan
    playTacticalScanSound();

    const searchData = await fetchNearestWithMaps(query, location, radius);
    const blips = generateBlips(searchData);
    
    const initialResult = { ...searchData, blips, images: [] };
    setResult(initialResult);
    setIsProcessing(false);

    // AI Briefing Speech
    const speechText = initialResult.profile 
      ? `${initialResult.profile.name}. ${initialResult.text}`
      : initialResult.text;
    const audioBase64Promise = generateSpeech(speechText);
    audioBase64Promise.then(audio => audio && playAudio(audio));

    const topSources = searchData.sources.slice(0, 3);
    const imagePromises = topSources.map(s => generateReconImage(s.title, query));
    
    Promise.all(imagePromises).then(images => {
      const validImages = images.filter((img): img is ReconImage => !!img);
      setResult(prev => prev ? { ...prev, images: validImages } : prev);
      if (validImages.length > 0) {
        // Sound for "Lock On"
        playLockOnSound();
      }
    });
  };

  const playAudio = async (base64: string) => {
    try {
      initAudioContext();
      const ctx = audioContextRef.current!;
      const buffer = await decodeAudioData(decodeBase64(base64), ctx);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      setIsSpeaking(true);
      source.onended = () => setIsSpeaking(false);
      source.start();
    } catch (e) {
      console.error("Audio playback error:", e);
      setIsSpeaking(false);
    }
  };

  const startListening = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    initAudioContext();
    if (recognitionRef.current && !isProcessing && !isLocating) {
      setVoiceState({ isListening: true, transcript: '' });
      recognitionRef.current.start();
    }
  };

  const stopListening = () => {
    if (recognitionRef.current && voiceState.isListening) {
      recognitionRef.current.stop();
      setTimeout(() => {
        setVoiceState(prev => {
          if (prev.transcript) handleSearch(prev.transcript);
          return { ...prev, isListening: false };
        });
      }, 500);
    }
  };

  return (
    <div className="max-w-md mx-auto h-screen flex flex-col p-6 space-y-4 select-none overflow-hidden relative">
      {/* Stale Signal Banner */}
      {isStale && !isLocating && (
        <div className="absolute top-0 left-0 right-0 z-[100] bg-yellow-600/90 text-yellow-100 text-[10px] py-1 text-center font-bold tracking-[0.3em] uppercase border-b border-yellow-400 animate-pulse">
          <i className="fa-solid fa-triangle-exclamation mr-2"></i>
          Warning: Position Data Stale - Recenter Required
        </div>
      )}

      {/* Header */}
      <header className={`flex justify-between items-start z-50 transition-opacity ${isStale ? 'mt-6' : 'mt-0'}`}>
        <div>
          <h1 className="text-2xl font-black tracking-tighter text-green-400 italic">NEAREST AI</h1>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            <p className="text-[9px] text-green-600 uppercase font-mono tracking-widest flex items-center gap-1">
              Satellite Link: Online 
              <span className="text-[7px] bg-green-900/40 px-1 rounded ml-1 border border-green-700/50">SIG-INT SYNC</span>
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end space-y-1">
          <button 
            onClick={fetchLocation}
            disabled={isLocating}
            className={`text-[9px] ${isStale ? 'bg-yellow-900/40 border-yellow-700 text-yellow-500' : 'bg-green-900/40 border-green-700/50 text-green-400'} border px-3 py-1 rounded uppercase font-mono transition-all active:scale-95 flex items-center gap-1 ${isLocating ? 'opacity-50' : ''}`}
          >
            <i className={`fa-solid fa-satellite-dish ${isLocating ? 'animate-spin' : ''}`}></i>
            {isLocating ? 'Syncing...' : 'Reset GPS'}
          </button>
        </div>
      </header>

      {/* Radar Visualization Area */}
      <div className="relative flex-1 flex flex-col items-center justify-center">
        {/* Recon Image Slideshow */}
        {result?.images && result.images.length > 0 && (
          <div className="absolute top-0 left-0 right-0 z-40 px-2 animate-in fade-in zoom-in-95 duration-700">
            <div className="bg-black/80 border border-green-500/30 rounded-xl overflow-hidden shadow-2xl group/slides">
              <div className="relative aspect-video">
                <img 
                  src={result.images[currentSlideIndex].url} 
                  alt="Recon" 
                  className="w-full h-full object-cover opacity-80"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/30"></div>
                
                {/* Triangulation HUD on Image */}
                <div className="absolute top-3 left-3 flex flex-col gap-1 pointer-events-none">
                  <div className="bg-black/60 border-l-2 border-green-500 px-2 py-1 flex flex-col">
                    <span className="text-[7px] text-green-700 uppercase font-bold">Vector Heading</span>
                    <span className="text-[10px] text-green-400 font-mono">{result.profile?.heading || '---'}</span>
                  </div>
                  <div className="bg-black/60 border-l-2 border-green-500 px-2 py-1 flex flex-col">
                    <span className="text-[7px] text-green-700 uppercase font-bold">Fastest Route ETA</span>
                    <span className="text-[10px] text-green-400 font-mono">{result.profile?.eta || '---'}</span>
                  </div>
                </div>

                {result.images.length > 1 && (
                  <>
                    <button 
                      onClick={prevSlide}
                      className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-black/50 border border-green-500/20 rounded-full text-green-400 hover:bg-green-500/20 transition-all active:scale-90 z-50"
                    >
                      <i className="fa-solid fa-chevron-left"></i>
                    </button>
                    <button 
                      onClick={nextSlide}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-black/50 border border-green-500/20 rounded-full text-green-400 hover:bg-green-500/20 transition-all active:scale-90 z-50"
                    >
                      <i className="fa-solid fa-chevron-right"></i>
                    </button>
                  </>
                )}

                <div className="absolute bottom-2 left-3 right-3 flex justify-between items-end">
                  <span className="text-[10px] font-mono text-green-400 uppercase tracking-tighter bg-black/40 px-2 py-0.5 rounded border border-green-500/10">
                    {result.images[currentSlideIndex].caption}
                  </span>
                  <div className="flex gap-1">
                    {result.images.map((_, idx) => (
                      <div 
                        key={idx} 
                        className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${idx === currentSlideIndex ? 'bg-green-400 scale-125' : 'bg-green-900'}`}
                      ></div>
                    ))}
                  </div>
                </div>
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-green-500/30 shadow-[0_0_10px_rgba(34,197,94,0.5)] animate-[scan_3s_linear_infinite] pointer-events-none"></div>
              </div>
            </div>
          </div>
        )}

        <RadarUI 
          isScanning={isProcessing || voiceState.isListening} 
          isLocating={isLocating}
          isStale={isStale}
          showRipple={showRipple}
          isSpeaking={isSpeaking}
          radius={radius} 
          hasResults={!!result && !result.isThinking}
          blips={result?.blips}
          activeIndex={currentSlideIndex}
        />
        
        {voiceState.isListening && (
          <div className="absolute bottom-2 left-0 right-0 text-center z-40 px-4">
            <div className="inline-block bg-black/95 px-6 py-4 rounded-2xl border border-red-500/40 text-red-400 shadow-[0_0_40px_rgba(220,38,38,0.2)] font-mono animate-pulse">
              <div className="text-[9px] opacity-70 mb-1 uppercase tracking-[0.3em] font-black italic">Voice Uplink Active</div>
              <p className="text-lg font-black uppercase tracking-tight">
                {voiceState.transcript || "Awaiting Audio..."}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Detailed Results Display */}
      {result && (
        <div className={`bg-black/80 border border-green-800/40 p-4 rounded-3xl backdrop-blur-xl transition-all duration-500 shadow-2xl relative overflow-hidden flex flex-col ${isExpanded ? 'h-[320px]' : 'h-[160px]'}`}>
          <div className="flex items-center justify-between mb-2">
             <div className="text-[8px] font-mono text-green-700 uppercase tracking-[0.2em] font-black">Tactical Signal Analysis</div>
             <button 
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-[10px] text-green-500/50 hover:text-green-400 uppercase font-mono italic"
             >
                {isExpanded ? '[COLLAPSE]' : '[MORE INFO]'}
             </button>
          </div>

          <div className="flex-1 overflow-y-auto pr-2 space-y-4">
            {/* Primary Target Profile */}
            {result.profile && (
              <div className="bg-green-500/5 border border-green-500/20 p-3 rounded-xl space-y-2 animate-in fade-in duration-500">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-[9px] text-green-500 uppercase font-black tracking-widest mb-0.5">Primary Target</div>
                    <h2 className="text-lg font-black text-green-100 tracking-tight leading-none uppercase">{result.profile.name}</h2>
                  </div>
                  {result.profile.phone && result.profile.phone !== "N/A" && (
                    <a href={`tel:${result.profile.phone}`} className="bg-green-400 text-green-950 px-3 py-1.5 rounded-lg text-[10px] font-black flex items-center gap-2 active:scale-95 transition-transform">
                      <i className="fa-solid fa-phone"></i>
                      COMM-LINK
                    </a>
                  )}
                </div>
                
                <div className="grid grid-cols-3 gap-2 border-t border-green-500/10 pt-2">
                   <div className="space-y-0.5">
                      <span className="text-[8px] text-green-700 uppercase block">ETA</span>
                      <span className="text-[10px] text-green-400 font-mono uppercase font-bold">{result.profile.eta || '---'}</span>
                   </div>
                   <div className="space-y-0.5">
                      <span className="text-[8px] text-green-700 uppercase block">Heading</span>
                      <span className="text-[10px] text-green-400 font-mono uppercase font-bold">{result.profile.heading || '---'}</span>
                   </div>
                   <div className="space-y-0.5">
                      <span className="text-[8px] text-green-700 uppercase block">Contact</span>
                      <span className="text-[10px] text-green-400 font-mono">{result.profile.phone || 'N/A'}</span>
                   </div>
                </div>

                <div className="bg-black/40 p-2 rounded border border-green-900/30">
                  <span className="text-[8px] text-green-700 uppercase block mb-1">Intelligence Summary</span>
                  <p className="text-[11px] text-green-200/80 leading-snug font-mono italic">
                    "{result.profile.summary}"
                  </p>
                </div>
              </div>
            )}

            {/* General Briefing */}
            <div className="space-y-2">
              <p className="text-xs text-green-100 leading-relaxed font-mono pr-4" dir="auto">
                {result.isThinking ? (
                  <span className="flex items-center gap-2">
                    <i className="fa-solid fa-sync animate-spin opacity-50"></i>
                    <span className="animate-pulse tracking-widest text-[10px]">Triangulating Local Signature...</span>
                  </span>
                ) : result.text}
              </p>
              
              <div className="grid grid-cols-1 gap-1.5">
                {result.sources.map((s, i) => (
                  <a 
                    key={i} 
                    href={s.uri} 
                    target="_blank" 
                    rel="noreferrer"
                    onMouseEnter={() => result.images?.[i] && setCurrentSlideIndex(i)}
                    className={`text-[10px] px-3 py-2 rounded-xl transition-all border font-mono flex items-center justify-between group active:scale-95 ${i === currentSlideIndex ? 'bg-green-500/20 border-green-500/30 text-green-200 shadow-[0_0_15px_rgba(34,197,94,0.1)]' : 'bg-green-500/5 border-green-500/10 text-green-400 hover:bg-green-500/15'}`}
                  >
                    <span className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${i === currentSlideIndex ? 'bg-green-400 animate-ping' : 'bg-green-500'} group-hover:shadow-[0_0_10px_#4ade80]`}></span>
                      {s.title}
                    </span>
                    <i className="fa-solid fa-location-arrow opacity-30 group-hover:opacity-100"></i>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Controls Container */}
      <div className="space-y-4 bg-green-950/20 p-4 rounded-3xl border border-green-500/5">
        <div className="flex items-center space-x-4">
          <div className="bg-green-900/40 p-2.5 rounded-xl border border-green-800/50">
             <i className="fa-solid fa-expand text-green-500 text-sm"></i>
          </div>
          <div className="flex-1 space-y-1">
             <div className="flex justify-between text-[10px] uppercase font-mono text-green-700 tracking-widest font-black">
               <span>Search Grid Radius</span>
               <span className="text-green-400">{radius}km</span>
             </div>
             <input 
              type="range" 
              min="1" 
              max="50" 
              value={radius} 
              onChange={(e) => setRadius(parseInt(e.target.value))}
              className="w-full h-1.5 bg-green-950 rounded-lg appearance-none cursor-pointer accent-green-400"
            />
          </div>
        </div>

        <button
          onMouseDown={startListening}
          onMouseUp={stopListening}
          onTouchStart={startListening}
          onTouchEnd={stopListening}
          disabled={isProcessing || isLocating}
          className={`w-full py-6 rounded-2xl font-black text-xl transition-all active:scale-[0.97] flex flex-col items-center justify-center space-y-1 shadow-2xl relative overflow-hidden group
            ${voiceState.isListening 
              ? 'bg-red-600 text-white shadow-[0_0_50px_rgba(220,38,38,0.3)]' 
              : isSpeaking ? 'bg-green-800 text-green-200' : 'bg-green-400 text-green-950'
            }
            ${(isProcessing || isLocating) ? 'opacity-20 grayscale' : ''}
          `}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
          
          <div className="flex items-center gap-4 z-10">
             <i className={`fa-solid ${voiceState.isListening ? 'fa-bolt animate-bounce' : isSpeaking ? 'fa-tower-broadcast animate-pulse' : 'fa-microphone-lines'}`}></i>
             <span className="tracking-tighter italic font-black">
                {voiceState.isListening ? 'TRANSMITTING...' : isSpeaking ? 'VOICE OUTPUT' : 'COMMAND UPLINK'}
             </span>
          </div>
          <span className="text-[10px] opacity-60 font-mono font-normal tracking-[0.4em] z-10 uppercase">
            {voiceState.isListening ? 'Listening for signature' : 'Hold to Initiate Search'}
          </span>
        </button>
      </div>

      <footer className="text-[7px] text-center text-green-900/60 uppercase tracking-[0.4em] font-mono pb-2 italic">
        Neural Proximity Engine // Sig-Int Grade S-05
      </footer>
    </div>
  );
};

export default App;
