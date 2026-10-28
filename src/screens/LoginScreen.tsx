import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  PermissionsAndroid, Platform, ScrollView, Vibration, Alert,
} from 'react-native';
import { getAuth, signInWithEmailAndPassword } from '@react-native-firebase/auth';
import Tts from 'react-native-tts';
import { listenOnce as listenOnceNative, type VoiceResult } from '../services/voiceService';
import { speakAndWait, waitForTtsSilence } from '../services/ttsService';
import ttsService from '../services/ttsService';

const TTS_ECHO = []; // Disabled - using proper timing instead

const looksLikeTts = (text: string): boolean => {
  // Disabled - using proper timing instead
  return false;
};

const ensureMic = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') return true;
  try {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: 'Microphone Needed',
        message: 'MUB Accessibility uses the microphone to help you log in with your voice.',
        buttonPositive: 'Allow',
        buttonNegative: 'Deny',
      }
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch (e) {
    return false;
  }
};

const beep = () => {
  Vibration.vibrate(200);  // short buzz = "speak now"
};

const listenOnce = async (): Promise<{ text: string | null; error: { code: string; message: string } | null }> => {
  try {
    console.log('[LoginVoice] Stopping TTS completely...');
    ttsService.stop();
    // Force stop all TTS instances
    try { Tts.stop(); } catch (e) {}
    console.log('[LoginVoice] Waiting 300ms for audio to clear...');
    await new Promise<void>(r => setTimeout(r, 300));
    // Beep to indicate listening started
    console.log('[LoginVoice] Beeping...');
    beep();
    console.log('[LoginVoice] Starting voice recognition...');
    const result = await Promise.race([
      listenOnceNative(),
      new Promise<VoiceResult>((_, rej) => setTimeout(() => {
        console.log('[LoginVoice] Voice recognition timeout');
        rej({ text: null, error: { code: 'TIMEOUT', message: 'No speech detected within 10 seconds' } });
      }, 10000)),
    ]);
    console.log('[LoginVoice] Voice result received - text:', result.text ? '[REDACTED]' : null, 'error:', result.error);
    return result;
  } catch (e: any) {
    console.error('[LoginVoice] Voice recognition error:', e);
    return { text: null, error: { code: 'UNKNOWN', message: 'Recognition failed' } };
  }
};

const loginVoiceLoop = async (setRecognizedText: (text: string) => void) => {
  console.log('[LoginVoice] Starting voice loop');

  // Request mic permission
  if (!(await ensureMic())) {
    await speakAndWait('Microphone permission is needed. Please allow it in Settings.');
    return { userId: null, password: null };
  }

  // Common filler words to remove from recognition
  const fillerWords = ['my', 'name', 'is', 'the', 'this', 'my name is', 'name is', 'i am', 'i\'m', 'it\'s', 'its', 'say', 'speak', 'tell', 'call'];

  const cleanVoiceText = (text: string): string => {
    let cleaned = text.toLowerCase().trim();
    // Remove filler words
    fillerWords.forEach(word => {
      cleaned = cleaned.replace(new RegExp(`\\b${word}\\b`, 'gi'), '');
    });
    // Remove special characters and extra spaces
    cleaned = cleaned.replace(/[^a-z0-9]/g, '').trim();
    return cleaned;
  };

  // VOICE ID
  let userId: string | null = null;
  for (let i = 0; i < 3 && !userId; i++) { // Reduced to 3 attempts
    console.log('[LoginVoice] Voice ID attempt', i + 1);
    await speakAndWait(i === 0 ? 'Please say your username.' : 'Please say your username again.');
    const result = await listenOnce();
    console.log('[LoginVoice] Raw voice ID result - has text:', !!result.text, 'has error:', !!result.error);

    // Handle error cases
    if (result.error) {
      const errorCode = result.error.code;
      const errorMessage = result.error.message;
      console.log('[LoginVoice] Voice ID error - code:', errorCode, 'message:', errorMessage);

      let userMessage = '';
      switch (errorCode) {
        case 'NOT_AVAILABLE':
          userMessage = 'Speech recognition is not available on this device. Please type your name and password below.';
          await speakAndWait(userMessage);
          return { userId: null, password: null };
        case 'ERROR_INSUFFICIENT_PERMISSIONS':
          userMessage = 'Microphone permission is not granted. Please allow it in Settings and try again.';
          await speakAndWait(userMessage);
          return { userId: null, password: null };
        case 'ERROR_NETWORK':
        case 'ERROR_NETWORK_TIMEOUT':
          userMessage = 'Network error. Please check your internet connection and try again.';
          await speakAndWait(userMessage);
          await new Promise<void>(r => setTimeout(r, 500));
          continue;
        case 'ERROR_RECOGNIZER_BUSY':
        case 'BUSY':
          userMessage = 'Voice recognizer is busy. Please wait a moment and try again.';
          await speakAndWait(userMessage);
          await new Promise<void>(r => setTimeout(r, 1000));
          continue;
        case 'TIMEOUT':
        case 'ERROR_SPEECH_TIMEOUT':
        case 'ERROR_NO_MATCH':
          // No speech detected - retry
          console.log('[LoginVoice] No speech detected, retrying');
          await new Promise<void>(r => setTimeout(r, 500));
          continue;
        default:
          userMessage = `Voice recognition error: ${errorMessage}. Please try again or type manually.`;
          await speakAndWait(userMessage);
          await new Promise<void>(r => setTimeout(r, 500));
          continue;
      }
    }

    const raw = result.text;
    // Update UI to show what was heard
    setRecognizedText(raw || '(nothing heard)');
    if (!raw) {
      console.log('[LoginVoice] Voice ID rejected: empty (no error, just no speech)');
      await new Promise<void>(r => setTimeout(r, 500));
      continue;
    }
    // Clean the voice text
    const voiceId = cleanVoiceText(raw);
    console.log('[LoginVoice] Cleaned voice ID:', voiceId);
    // Validate: 2-20 characters
    if (voiceId.length >= 2 && voiceId.length <= 20) {
      userId = voiceId;
      console.log('[LoginVoice] Voice ID captured:', userId);
      await speakAndWait(`I heard ${voiceId}. Is that correct? Say yes or no.`);
      
      // Confirmation loop - retry confirmation if it fails, don't restart username
      let confirmed = false;
      for (let c = 0; c < 3 && !confirmed; c++) {
        await waitForTtsSilence(); // Ensure TTS finishes before listening
        const confirmation = await listenOnce();
        console.log('[LoginVoice] Confirmation result - has text:', !!confirmation.text, 'has error:', !!confirmation.error);
        
        // Check for "no" - return to username entry
        const isNo = confirmation.text && confirmation.text.toLowerCase().includes('no');
        if (isNo && !confirmation.error) {
          console.log('[LoginVoice] User said no, restarting username');
          await speakAndWait('Okay, say your username again.');
          userId = null; // Reset and continue username loop
          confirmed = false;
          break; // Exit confirmation loop, continue username loop
        }
        
        // Check for confirmation - accept "yes", "yeah", "correct", "right"
        const isConfirmed = confirmation.text && (
          confirmation.text.toLowerCase().includes('yes') ||
          confirmation.text.toLowerCase().includes('yeah') ||
          confirmation.text.toLowerCase().includes('correct') ||
          confirmation.text.toLowerCase().includes('right')
        );
        
        if (isConfirmed && !confirmation.error) {
          console.log('[LoginVoice] Confirmed, proceeding to password');
          confirmed = true;
          break; // Exit confirmation loop, proceed to password
        } else if (confirmation.error) {
          console.log('[LoginVoice] Confirmation error:', confirmation.error.code);
          await speakAndWait('I did not hear you clearly. Please try again.');
          // Retry confirmation (don't reset userId)
        } else if (!confirmation.text) {
          console.log('[LoginVoice] Confirmation empty, retrying');
          await speakAndWait('I did not hear you. Please say yes or no.');
          // Retry confirmation (don't reset userId)
        } else {
          console.log('[LoginVoice] Confirmation not recognized, retrying');
          await speakAndWait('Please say yes or no.');
          // Retry confirmation (don't reset userId)
        }
      }
      
      // If confirmed, break out of username loop and proceed to password
      if (confirmed) {
        break;
      }
      // If not confirmed and userId was reset to null, continue username loop
    } else {
      console.log('[LoginVoice] Voice ID rejected: invalid length');
      await speakAndWait('I did not hear a valid name. Please try again.');
    }
  }
  // If voice failed after 3 attempts, stop and let user type manually
  if (!userId) {
    console.log('[LoginVoice] Voice failed after 3 attempts, showing manual input');
    await speakAndWait('Voice recognition is having trouble. Please type your name and password below.');
    return { userId: null, password: null };
  }

  // PASSWORD
  let password: string | null = null;
  for (let i = 0; i < 3 && !password; i++) { // Reduced to 3 attempts
    console.log('[LoginVoice] Password attempt', i + 1);
    await speakAndWait(i === 0 ? 'Please say your password.' : 'Please say your password again.');
    const result = await listenOnce();
    console.log('[LoginVoice] Raw password result - has text:', !!result.text, 'has error:', !!result.error);

    // Handle error cases for password
    if (result.error) {
      const errorCode = result.error.code;
      const errorMessage = result.error.message;
      console.log('[LoginVoice] Password error - code:', errorCode, 'message:', errorMessage);

      let userMessage = '';
      switch (errorCode) {
        case 'NOT_AVAILABLE':
          userMessage = 'Speech recognition is not available. Please type your password below.';
          await speakAndWait(userMessage);
          return { userId: userId, password: null };
        case 'ERROR_INSUFFICIENT_PERMISSIONS':
          userMessage = 'Microphone permission is not granted. Please allow it in Settings.';
          await speakAndWait(userMessage);
          return { userId: userId, password: null };
        case 'ERROR_NETWORK':
        case 'ERROR_NETWORK_TIMEOUT':
          userMessage = 'Network error. Please check your internet connection and try again.';
          await speakAndWait(userMessage);
          await new Promise<void>(r => setTimeout(r, 500));
          continue;
        case 'ERROR_RECOGNIZER_BUSY':
        case 'BUSY':
          userMessage = 'Voice recognizer is busy. Please wait a moment and try again.';
          await speakAndWait(userMessage);
          await new Promise<void>(r => setTimeout(r, 1000));
          continue;
        case 'TIMEOUT':
        case 'ERROR_SPEECH_TIMEOUT':
        case 'ERROR_NO_MATCH':
          // No speech detected - retry
          console.log('[LoginVoice] No speech detected for password, retrying');
          await new Promise<void>(r => setTimeout(r, 500));
          continue;
        default:
          userMessage = `Voice recognition error. Please try again or type your password.`;
          await speakAndWait(userMessage);
          await new Promise<void>(r => setTimeout(r, 500));
          continue;
      }
    }

    const raw = result.text;
    // Update UI to show what was heard (don't show actual password)
    setRecognizedText(raw ? '[password captured]' : '(nothing heard)');
    if (!raw) {
      console.log('[LoginVoice] Password rejected: empty (no error, just no speech)');
      await new Promise<void>(r => setTimeout(r, 500));
      continue;
    }
    const cleaned = raw.replace(/\s+/g, '');
    console.log('[LoginVoice] Cleaned password length:', cleaned.length);
    // Very permissive: just more permissive: just check for at least 1 character
    if (cleaned.length >= 1) {
      password = cleaned;
      console.log('[LoginVoice] Password captured');
    } else {
      console.log('[LoginVoice] Password rejected: empty');
      await speakAndWait('I did not hear a password. Please try again.');
    }
  }
  // If password failed after 3 attempts, stop and let user type manually
  if (!password) {
    console.log('[LoginVoice] Password failed after 3 attempts, showing manual input');
    await speakAndWait('Voice recognition is having trouble. Please type your name and password below.');
    return { userId: null, password: null };
  }
  console.log('[LoginVoice] Returning:', { userId, password: password ? '***' : null });
  return { userId, password };
};

const LoginScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [debugText, setDebugText] = useState('Initializing...');
  const [errorText, setErrorText] = useState('');
  const [recognizedText, setRecognizedText] = useState('');
  const startedRef = useRef(false);

  const handleManualLogin = async () => {
    if (!userId || !password) return;

    // Aggressively clean the User ID
    const rawId = userId.trim().toLowerCase(); // "Joshua" becomes "joshua"
    const cleanId = rawId.replace(/\s+/g, ''); // removes ANY accidental spaces

    // Safety check: if ID is empty, stop and show error
    if (!cleanId) {
      setErrorText('Please enter a User ID.');
      await speakAndWait('Please enter a User ID.');
      return;
    }

    setLoading(true);
    setDebugText('Signing in...');
    setErrorText('');

    try {
      // Build the email and log it
      const internalEmail = cleanId + '@mub.internal';
      console.log('[Login] Sending exactly:', internalEmail);

      // Sign in using the cleaned variables
      console.log('[LoginScreen] Calling signInWithEmailAndPassword for manual login');
      await signInWithEmailAndPassword(getAuth(), internalEmail, password.trim());
      console.log('[LoginScreen] Manual login successful - Firebase auth state should change');
      setDebugText('Login successful!');
      setLoading(false); // Clear loading state after successful authentication
    } catch (e: any) {
      console.error('[LoginScreen] Manual login error:', e?.code, e?.message);
      setDebugText('Login failed: ' + (e?.code || 'unknown'));
      setErrorText('Login failed: ' + (e?.code || 'unknown'));
      setLoading(false);
      await speakAndWait('Login failed. Wrong name or password.');
    }
  };

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const run = async () => {
      // Announce screen
      await ttsService.init();
      await new Promise<void>(r => setTimeout(r, 300));

      await speakAndWait('Say your name to log in.');

      // Reduced wait time - voice recognition is now faster
      await new Promise<void>(r => setTimeout(r, 200));
      console.log('[LoginScreen] Starting voice login');
      setDebugText('Starting voice login...');
      const result = await loginVoiceLoop(setRecognizedText);
      if (!result || !result.userId || !result.password) {
        console.log('[LoginScreen] Voice capture failed, showing manual input');
        setDebugText('Voice capture failed. Please type manually.');
        await speakAndWait('Could not capture. Please type your name and password.');
        return;
      }
      console.log('[LoginScreen] Voice capture successful, setting credentials');
      setDebugText('Voice captured. Signing in...');
      setUserId(result.userId);
      setPassword(result.password);
      setLoading(true);
      try {
        // Convert voice ID to internal email
        const internalEmail = result.userId.toLowerCase() + '@mub.internal';
        console.log('[LoginScreen] Authenticating with internal email:', internalEmail);
        // Add timeout to prevent indefinite loading
        const authPromise = signInWithEmailAndPassword(getAuth(), internalEmail, result.password);
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Authentication timeout')), 30000);
        });
        await Promise.race([authPromise, timeoutPromise]);
        console.log('[LoginScreen] Voice login successful - Firebase auth state should change');
        setDebugText('Login successful!');
        setLoading(false); // Clear loading state after successful authentication
        await speakAndWait('Login successful.');
      } catch (e: any) {
        console.error('[LoginScreen] Login error:', e?.code, e?.message);
        setDebugText('Login failed: ' + (e?.code || 'unknown'));
        setLoading(false);
        if (e?.message === 'Authentication timeout') {
          await speakAndWait('Login is taking too long. Please check your internet connection and try again.');
        } else {
          await speakAndWait('Login failed. Wrong name or password.');
        }
      }
    };
    run();
  }, [hasSavedCredentials, biometricAvailable]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>MUB Accessibility System</Text>
      <Text style={styles.subtitle}>Signing in automatically...</Text>

      {recognizedText && (
        <View style={styles.recognizedBox}>
          <Text style={styles.recognizedLabel}>I heard:</Text>
          <Text style={styles.recognizedText}>{recognizedText}</Text>
        </View>
      )}

      <TextInput
        style={styles.input}
        placeholder="Name (e.g., joshua)"
        value={userId}
        onChangeText={setUserId}
        autoCapitalize="none"
        accessibilityLabel="Name"
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        accessibilityLabel="Password"
      />
      <TouchableOpacity
        style={styles.button}
        onPress={handleManualLogin}
        accessibilityLabel="Login button"
        disabled={loading}
      >
        <Text style={styles.buttonText}>{loading ? 'Signing in...' : 'Login'}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => {
        console.log('[LoginScreen] Register button pressed - registration is admin-only');
        speakAndWait('Registration is done by the administrator. Please contact them for your user ID.');
      }}>
        <Text style={styles.link}>Need an account? Contact administrator</Text>
      </TouchableOpacity>

      {errorText && (
        <Text style={styles.error}>{errorText}</Text>
      )}

      <Text style={styles.debug}>{debugText}</Text>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, backgroundColor: '#0A2540', justifyContent: 'center' },
  title: { color: '#fff', fontSize: 26, fontWeight: 'bold', textAlign: 'center', marginBottom: 8 },
  subtitle: { color: '#FFC107', fontSize: 15, textAlign: 'center', marginBottom: 32 },
  recognizedBox: { backgroundColor: '#FFF9C4', borderRadius: 10, padding: 16, marginBottom: 16, borderWidth: 2, borderColor: '#FFC107' },
  recognizedLabel: { color: '#0A2540', fontSize: 14, fontWeight: 'bold', marginBottom: 4 },
  recognizedText: { color: '#0A2540', fontSize: 18, fontWeight: 'bold' },
  input: { backgroundColor: '#fff', borderRadius: 10, padding: 16, fontSize: 16, marginBottom: 14 },
  button: { backgroundColor: '#FFC107', borderRadius: 10, padding: 18, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#0A2540', fontSize: 18, fontWeight: 'bold' },
  link: { color: '#FFC107', textAlign: 'center', marginTop: 18, fontSize: 15 },
  error: { color: '#FF6B6B', fontSize: 14, textAlign: 'center', marginTop: 8, fontWeight: 'bold' },
  debug: { color: '#FF6B6B', fontSize: 12, textAlign: 'center', marginTop: 16, marginHorizontal: 8 },
});

export default LoginScreen;
