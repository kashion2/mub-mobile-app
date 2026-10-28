import Tts from 'react-native-tts';

let activeResolve: (() => void) | null = null;
let listenersInstalled = false;

const installTtsListeners = () => {
  if (listenersInstalled) return;
  listenersInstalled = true;
  try {
    Tts.addEventListener('tts-finish', () => {
      if (activeResolve) {
        const r = activeResolve;
        activeResolve = null;
        r();
      }
    });
    Tts.addEventListener('tts-cancel', () => {
      if (activeResolve) {
        const r = activeResolve;
        activeResolve = null;
        r();
      }
    });
  } catch (e) {
    console.warn('TTS events unavailable:', e);
  }
};

export const speakAndWait = (text: string): Promise<void> => {
  installTtsListeners();
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      if (activeResolve === finish) activeResolve = null;
      // Reduced buffer to ensure audio focus releases before mic opens
      setTimeout(resolve, 500);
    };
    activeResolve = finish;
    try { Tts.stop(); } catch (e) {}
    setTimeout(() => { try { Tts.speak(text); } catch (e) {} }, 200);
    const estimatedMs = Math.max(2500, Math.min(15000, (text.length / 14) * 1000 + 800));
    setTimeout(finish, estimatedMs);
  });
};

export const waitForTtsSilence = async (): Promise<void> => {
  try { Tts.stop(); } catch (e) {}
  await new Promise<void>(r => setTimeout(r, 500));
  const start = Date.now();
  while (Date.now() - start < 2000) {
    try {
      // @ts-ignore - isSpeaking exists in react-native-tts but not in type definitions
      const speaking = await Tts.isSpeaking();
      if (!speaking) break;
    } catch (e) { break; }
    await new Promise<void>(r => setTimeout(r, 100));
  }
  // Reduced buffer for Android to release audio focus
  await new Promise<void>(r => setTimeout(r, 300));
};

class TTSService {
  private initialized = false;
  private initializing: Promise<void> | null = null;
  private speaking = false;
  private ttsAvailable = true;

  async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initializing) return this.initializing;

    this.initializing = (async () => {
      try {
        // Check if TTS is even available
        const engines = await Tts.engines();
        if (!engines || engines.length === 0) {
          this.ttsAvailable = false;
          this.initialized = true;
          return;
        }
      } catch {
        // TTS not available at all
        this.ttsAvailable = false;
        this.initialized = true;
        return;
      }

      // Try to initialize 3 times with delays
      for (let i = 0; i < 3; i++) {
        try {
          await new Promise<void>((r) => setTimeout(r, 500));
          const voices = await Tts.voices();
          if (voices && voices.length > 0) {
            Tts.setDefaultLanguage('en-GB');
            Tts.setDefaultRate(0.5);
            Tts.setDefaultPitch(1.0);
            Tts.setIgnoreSilentSwitch('ignore');
            Tts.setDucking(true);

            Tts.addEventListener('tts-finish', () => {
              this.speaking = false;
            });
            Tts.addEventListener('tts-cancel', () => {
              this.speaking = false;
            });

            this.ttsAvailable = true;
            this.initialized = true;
            return;
          }
        } catch {
          // retry
        }
      }

      this.ttsAvailable = false;
      this.initialized = true;
    })();

    return this.initializing;
  }

  async speak(text: string): Promise<void> {
    if (!text || !text.trim()) return;

    await this.init();

    // If TTS is not available, silently skip (don't crash, don't stack)
    if (!this.ttsAvailable) {
      console.warn('[TTS] Not available on this device');
      return;
    }

    try {
      // Always stop first to prevent stacking
      await Tts.stop();
      await new Promise<void>((r) => setTimeout(r, 200));
      Tts.speak(text.trim());
      this.speaking = true;
    } catch (e) {
      console.warn('[TTS] Speak error:', e);
    }
  }

  stop(): void {
    if (!this.ttsAvailable) return;
    try {
      Tts.stop();
      this.speaking = false;
    } catch {}
  }

  isAvailable(): boolean {
    return this.ttsAvailable;
  }
}

export default new TTSService();