export function createTargetShooterAudio(options = {}) {
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

  async function playShot() {
    try {
      const context = getAudioContext();
      if (!context) return;
      if (context.state === 'suspended') await context.resume();
      if (disposed || context.state !== 'running') return;
      const now = context.currentTime;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'square';
      oscillator.frequency.setValueAtTime(190, now);
      oscillator.frequency.exponentialRampToValueAtTime(70, now + 0.09);
      gain.gain.setValueAtTime(0.055, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.addEventListener('ended', () => {
        oscillator.disconnect();
        gain.disconnect();
      }, { once: true });
      oscillator.start(now);
      oscillator.stop(now + 0.11);
    } catch {
      // Shooting remains functional when Web Audio is unavailable or blocked.
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    const context = audioContext;
    audioContext = null;
    if (context && context.state !== 'closed') void context.close().catch(() => {});
  }

  return { playShot, dispose };
}