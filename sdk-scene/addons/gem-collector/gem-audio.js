export function createGemCollectionAudio(options = {}) {
  const enabled = options.enabled !== false;
  let audioContext = null;
  let disposed = false;

  function getAudioContext() {
    if (!enabled || disposed) return null;
    if (audioContext) return audioContext;
    const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextClass) return null;
    audioContext = new AudioContextClass();
    return audioContext;
  }

  async function play({ completed = false } = {}) {
    try {
      const context = getAudioContext();
      if (!context) return;
      if (context.state === 'suspended') await context.resume();
      if (disposed || context.state !== 'running') return;

      const now = context.currentTime;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(completed ? 880 : 660, now);
      oscillator.frequency.exponentialRampToValueAtTime(completed ? 1174 : 880, now + 0.12);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.075, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.addEventListener('ended', () => {
        oscillator.disconnect();
        gain.disconnect();
      }, { once: true });
      oscillator.start(now);
      oscillator.stop(now + 0.19);
    } catch {
      // Collection remains functional when audio is unavailable or blocked.
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    const context = audioContext;
    audioContext = null;
    if (context && context.state !== 'closed') void context.close().catch(() => {});
  }

  return { play, dispose };
}
