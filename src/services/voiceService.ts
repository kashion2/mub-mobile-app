import { NativeModules } from 'react-native';

const { VoiceRecognizer } = NativeModules;

export interface VoiceResult {
  text: string | null;
  error: { code: string; message: string } | null;
}

export const isVoiceAvailable = (): boolean => {
  return VoiceRecognizer != null && typeof VoiceRecognizer.startListening === 'function';
};

export const listenOnce = (languageCode: string = 'en-US'): Promise<VoiceResult> => {
  if (!isVoiceAvailable()) {
    console.warn('[VoiceRecognizer] VoiceRecognizer module not available');
    return Promise.resolve({ text: null, error: { code: 'NOT_AVAILABLE', message: 'Voice recognition module not available' } });
  }
  return new Promise<VoiceResult>((resolve) => {
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.warn('[VoiceRecognizer] timeout after 15s');
        resolve({ text: null, error: { code: 'TIMEOUT', message: 'No speech detected within 15 seconds' } });
      }
    }, 15000);

    VoiceRecognizer.startListening(languageCode)
      .then((text: string) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          const cleaned = (text || '').trim();
          console.log('[VoiceRecognizer] result received, length:', cleaned.length);
          if (cleaned.length > 0) {
            resolve({ text: cleaned, error: null });
          } else {
            console.log('[VoiceRecognizer] empty result treated as no speech');
            resolve({ text: null, error: null }); // Empty result = no speech, not an error
          }
        }
      })
      .catch((err: any) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          const errorCode = err?.code || 'UNKNOWN';
          const errorMessage = err?.message || 'Unknown recognition error';
          console.warn('[VoiceRecognizer] native error - code:', errorCode, 'message:', errorMessage);
          resolve({ text: null, error: { code: errorCode, message: errorMessage } });
        }
      });
  });
};

export const stopListening = (): void => {
  if (isVoiceAvailable()) {
    try { VoiceRecognizer.stopListening(); } catch (e) {}
  }
};

export const cancelListening = (): void => {
  if (isVoiceAvailable()) {
    try { VoiceRecognizer.cancel(); } catch (e) {}
  }
};
