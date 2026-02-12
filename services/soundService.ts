
export const playTacticalScanSound = () => {
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  
  const playPulse = (time: number) => {
    // Noise buffer for the 'tsh' sound
    const bufferSize = audioCtx.sampleRate * 0.1;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 5000;

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.1, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.08);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);

    noise.start(time);
    noise.stop(time + 0.1);
  };

  // Play a sequence: tsh tsh tsh tsh
  const now = audioCtx.currentTime;
  for (let i = 0; i < 4; i++) {
    playPulse(now + (i * 0.12));
  }
};

export const playLockOnSound = () => {
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const now = audioCtx.currentTime;

  const osc = audioCtx.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(880, now);
  osc.frequency.exponentialRampToValueAtTime(1760, now + 0.1);

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.05, now);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start(now);
  osc.stop(now + 0.2);
};
