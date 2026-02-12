
import React, { useState, useEffect, useRef, useCallback } from 'react';
import RadarUI from './components/RadarUI';
import { fetchNearestWithMaps, generateSpeech, decodeAudioData, decodeBase64, generateReconImage } from './services/geminiService';
import { playTacticalScanSound, playLockOnSound, playDataStreamSound } from './services/soundService';
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

  const isStale = !!(locationTimestamp && Date.now() - locationTimestamp > 60000);

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

  const handleSearch = async (query: string) => {
    if (!location) return;
    setIsProcessing(true);
    setCurrentSlideIndex(0);
    setIsExpanded(false);
    setResult({ text: 'Analyzing deep establishment metrics...', sources: [], isThinking: true });

    playTacticalScanSound();
    setTimeout(() => playDataStreamSound(), 1200);

    const searchData = await fetchNearestWithMaps(query, location, radius);
    const blips = generateBlips(searchData);
    
    setResult({ ...searchData, blips, images: [] });
    setIsProcessing(false);

    const speechText = searchData.profile 
      ? `Establishment identified: ${searchData.profile.name}. Personnel: ${searchData.profile.owner || 'not listed'}. Analysis complete.`
      : searchData.text;
    
    generateSpeech(speechText).then(audio => audio && playAudio(audio));

    const topSources = searchData.sources.slice(0, 3);
    const imagePromises = topSources.map(s => generateReconImage(s.title, query));
    
    Promise.all(imagePromises).then(images => {
      const validImages = images.filter((img): img is ReconImage => !!img);
      setResult(prev => prev ? { ...prev, images: validImages } : prev);
      if (validImages.length > 0) playLockOnSound();
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
      {isStale && !isLocating && (
        <div className="absolute top-0 left-0 right-0 z-[100] bg-yellow-600/90 text-yellow-100 text-[10px] py-1 text-center font-bold tracking-[0.3em] uppercase border-b border-yellow-400 animate-pulse">
          SIGNAL DEGRADED
        </div>
      )}

      <header className={`flex justify-end z-50 transition-opacity ${isStale ? 'mt-8' : 'mt-2'}`}>
        <button 
          onClick={fetchLocation}
          disabled={isLocating}
          className={`w-11 h-11 flex items-center justify-center rounded-full border transition-all active:scale-90 ${isStale ? 'bg-yellow-900/20 border-yellow-500 text-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.4)]' : 'bg-green-900/20 border-green-500/30 text-green-400 shadow-[0_0_15px_rgba(34,197,94,0.1)]'}`}
        >
          <i className={`fa-solid fa-arrows-rotate text-lg ${isLocating ? 'animate-spin' : ''}`}></i>
        </button>
      </header>

      <div className="relative flex-1 flex flex-col items-center justify-center">
        {result?.images && result.images.length > 0 && (
          <div className="absolute top-0 left-0 right-0 z-40 px-2 animate-in fade-in zoom-in-95 duration-700">
            <div className="bg-black/90 border border-green-500/30 rounded-2xl overflow-hidden shadow-[0_0_40px_rgba(0,0,0,0.8)]">
              <div className="relative aspect-video">
                <img src={result.images[currentSlideIndex].url} alt="Recon" className="w-full h-full object-cover opacity-70" />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/20"></div>
                <div className="absolute bottom-3 left-3 flex flex-col gap-1">
                  <span className="text-[7px] text-green-700 uppercase font-black tracking-widest">{result.images[currentSlideIndex].caption}</span>
                  <div className="flex gap-2">
                    <div className="bg-green-500/10 border border-green-500/30 px-2 py-0.5 rounded text-[10px] text-green-400 font-mono">
                      ETA: {result.profile?.eta || '--'}
                    </div>
                    <div className="bg-green-500/10 border border-green-500/30 px-2 py-0.5 rounded text-[10px] text-green-400 font-mono">
                      BRG: {result.profile?.heading || '--'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <RadarUI 
          isScanning={isProcessing || voiceState.isListening} 
          radius={radius} 
          hasResults={!!result && !result.isThinking}
          isLocating={isLocating}
          isStale={isStale}
          showRipple={showRipple}
          isSpeaking={isSpeaking}
          blips={result?.blips}
          activeIndex={currentSlideIndex}
        />
        
        {voiceState.isListening && (
          <div className="absolute bottom-4 left-0 right-0 text-center z-40 px-4">
            <div className="inline-block bg-black/95 px-8 py-5 rounded-3xl border border-red-500/40 text-red-400 shadow-[0_0_50px_rgba(239,68,68,0.2)] animate-pulse">
              <div className="text-[8px] font-black tracking-widest uppercase mb-1 opacity-50">Transmitting Command</div>
              <p className="text-xl font-black uppercase tracking-tight">{voiceState.transcript || "..."}</p>
            </div>
          </div>
        )}
      </div>

      {result && (
        <div className={`bg-black/90 border border-green-900/50 p-5 rounded-[2.5rem] backdrop-blur-2xl transition-all duration-700 shadow-[0_0_60px_rgba(0,0,0,0.6)] flex flex-col ${isExpanded ? 'h-[440px]' : 'h-[170px]'}`}>
          <div className="flex items-center justify-between mb-4">
             <div className="flex items-center gap-2">
               <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
               <div className="text-[9px] font-mono text-green-700 uppercase font-black tracking-[0.2em]">Personnel Dossier // Level 1</div>
             </div>
             <button onClick={() => setIsExpanded(!isExpanded)} className="w-8 h-8 flex items-center justify-center bg-green-500/5 rounded-full border border-green-500/10 text-green-500">
               <i className={`fa-solid ${isExpanded ? 'fa-chevron-down' : 'fa-chevron-up'} text-xs`}></i>
             </button>
          </div>

          <div className="flex-1 overflow-y-auto pr-2 space-y-5">
            {result.profile && (
              <div className="animate-in fade-in duration-500 slide-in-from-bottom-2">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h2 className="text-xl font-black text-green-100 uppercase tracking-tight leading-none mb-1">{result.profile.name}</h2>
                    <div className="flex items-center gap-2">
                       <span className="text-[10px] text-green-500/80 font-mono font-bold">STAFF:</span>
                       <span className="text-[10px] text-green-400 font-mono italic">{result.profile.owner || 'Unknown'}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {result.profile.phone && result.profile.phone !== "N/A" && (
                      <a href={`tel:${result.profile.phone}`} className="w-10 h-10 flex items-center justify-center bg-green-400 text-green-950 rounded-xl shadow-[0_0_15px_rgba(34,197,94,0.4)] active:scale-90 transition-all">
                        <i className="fa-solid fa-phone"></i>
                      </a>
                    )}
                    {result.profile.fastestRouteUrl && (
                      <a href={result.profile.fastestRouteUrl} target="_blank" rel="noreferrer" className="w-10 h-10 flex items-center justify-center bg-green-400 text-green-950 rounded-xl shadow-[0_0_15px_rgba(34,197,94,0.4)] active:scale-90 transition-all">
                        <i className="fa-solid fa-route"></i>
                      </a>
                    )}
                  </div>
                </div>

                <div className="bg-green-500/5 border border-green-500/20 p-3 rounded-2xl mb-4">
                   <span className="text-[8px] text-green-700 font-black uppercase block mb-1.5">Lead Personnel Biography</span>
                   <p className="text-[11px] text-green-200/90 leading-relaxed font-mono italic">
                      {result.profile.bio || "No professional biography currently available in public records."}
                   </p>
                </div>

                {result.profile.credentials && result.profile.credentials.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    {result.profile.credentials.map((cred, i) => (
                      <div key={i} className="bg-black/40 border border-green-900/40 p-2 rounded-xl flex items-center gap-2">
                        <i className="fa-solid fa-certificate text-[8px] text-green-500"></i>
                        <span className="text-[9px] text-green-400 font-mono truncate">{cred}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-2">
                   <span className="text-[8px] text-green-700 font-black uppercase block">Intelligence Grounding</span>
                   <div className="grid grid-cols-1 gap-1.5">
                      {result.groundingLinks?.slice(0, 5).map((link, i) => (
                        <a key={i} href={link.uri} target="_blank" rel="noreferrer" className="flex items-center justify-between bg-black/40 border border-green-900/30 p-2 rounded-xl hover:bg-green-500/5 transition-colors">
                           <span className="text-[9px] text-green-400/80 font-mono truncate pr-4">{link.title}</span>
                           <i className="fa-solid fa-link text-[8px] text-green-900"></i>
                        </a>
                      ))}
                   </div>
                </div>
              </div>
            )}
            {!result.profile && (
              <p className="text-xs text-green-100 font-mono leading-relaxed px-1">
                {result.isThinking ? "Aggregating deep factual records..." : result.text}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="space-y-4 bg-green-950/20 p-5 rounded-[2.5rem] border border-green-500/5">
        <div className="flex-1 space-y-2">
           <div className="flex justify-between text-[10px] font-mono text-green-700 uppercase font-black tracking-widest">
             <span>Search Radius</span> <span className="text-green-400">{radius}km</span>
           </div>
           <input type="range" min="1" max="50" value={radius} onChange={(e) => setRadius(parseInt(e.target.value))} className="w-full h-1.5 bg-green-950 rounded-full appearance-none cursor-pointer accent-green-400" />
        </div>

        <button
          onMouseDown={startListening} onMouseUp={stopListening} onTouchStart={startListening} onTouchEnd={stopListening}
          disabled={isProcessing || isLocating}
          className={`w-full py-8 rounded-[2rem] font-black text-xl transition-all active:scale-[0.97] flex flex-col items-center justify-center relative overflow-hidden group shadow-2xl ${voiceState.isListening ? 'bg-red-600 shadow-[0_0_30px_rgba(220,38,38,0.4)]' : isSpeaking ? 'bg-green-800' : 'bg-green-400 text-green-950 shadow-[0_0_30px_rgba(34,197,94,0.3)]'}`}
        >
          <div className="flex items-center gap-4 z-10 font-black italic uppercase tracking-tighter">
             <i className={`fa-solid ${voiceState.isListening ? 'fa-bolt-lightning animate-bounce' : isSpeaking ? 'fa-tower-broadcast animate-pulse' : 'fa-microphone-lines text-2xl'}`}></i>
             <span className="text-2xl">{voiceState.isListening ? 'RECEIVING' : isSpeaking ? 'OUTPUT' : 'UPLINK'}</span>
          </div>
        </button>
      </div>

      <footer className="text-[7px] text-center text-green-900/60 uppercase tracking-[0.5em] font-mono pb-2 italic">
        S-05 // BIOMETRIC & PLACEMENT ANALYSIS ACTIVE
      </footer>
    </div>
  );
};

export default App;
