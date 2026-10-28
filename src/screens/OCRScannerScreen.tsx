import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  PermissionsAndroid,
  Platform,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import { listenOnce as listenOnceNative, isVoiceAvailable, type VoiceResult } from '../services/voiceService';
import ttsService, { speakAndWait } from '../services/ttsService';
import { useNavigation } from '@react-navigation/native';
import Tts from 'react-native-tts';

const OCRScannerScreen: React.FC = () => {
  const navigation = useNavigation();
  const [capturedText, setCapturedText] = useState('');
  const [loading, setLoading] = useState(false);
  const captureFiredRef = useRef(false);

  const TTS_ECHO_PHRASES = [
    'would you like',
    'say yes or no',
    'returning to',
    'microphone permission',
  ];

  const looksLikeTts = (text: string): boolean => {
    const lower = text.toLowerCase();
    return TTS_ECHO_PHRASES.some(p => lower.includes(p));
  };

  const listenOnce = async (): Promise<string | null> => {
    try {
      try { Tts.stop(); } catch (e) {}
      await new Promise<void>(r => setTimeout(r, 700));
      const result = await Promise.race([
        listenOnceNative(),
        new Promise<VoiceResult>((_, rej) => setTimeout(() => rej({ text: null, error: { code: 'TIMEOUT', message: 'Timeout' } }), 10000)),
      ]);
      if (result.error) {
        console.warn('[OCRScanner] Recognition error:', result.error.code, result.error.message);
        return null;
      }
      const cleaned = (result.text || '').trim();
      // No echo filtering - rely on proper timing
      return cleaned.length > 0 ? cleaned : null;
    } catch (e) {
      return null;
    }
  };

  const ensureMicPermission = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: 'Microphone Permission',
          message: 'MUB Accessibility needs microphone access for voice commands.',
          buttonPositive: 'Allow',
          buttonNegative: 'Deny',
        }
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch (e) {
      return false;
    }
  };

  const requestCameraPermission = async (): Promise<boolean> => {
    if (Platform.OS === 'android') {
      try {
        const alreadyGranted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
        if (alreadyGranted) return true;

        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
          {
            title: 'Camera Permission',
            message: 'MUB Accessibility needs camera access to read documents.',
            buttonPositive: 'Allow',
            buttonNegative: 'Deny',
          }
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } catch {
        return false;
      }
    }
    return true;
  };

  const processImage = async (uri: string) => {
    await speakAndWait('Reading the document. Please wait.');
    await new Promise<void>(r => setTimeout(r, 700));
    try {
      const result = await TextRecognition.recognize(uri);
      const raw = result?.text || '';
      const cleaned = raw
        .replace(/[^\x20-\x7E\u00A0-\u024F\n]/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      if (cleaned.length < 10) {
        await speakAndWait('I could not read this document clearly. Move the phone closer and try again.');
        captureFiredRef.current = false;
        setTimeout(captureDocument, 3000);
        return;
      }

      setCapturedText(cleaned);
      await speakAndWait(cleaned);
      await speakAndWait('Would you like to scan another document? Say yes or no.');
      if (!(await ensureMicPermission())) {
        await speakAndWait('Microphone permission is required. Please allow it in Settings.');
        return;
      }
      try { Tts.stop(); } catch (e) {}
      await new Promise<void>(r => setTimeout(r, 500));
      const again = await listenOnce();
      if (again && again.toLowerCase().includes('yes')) {
        captureFiredRef.current = false;
        await new Promise<void>(r => setTimeout(r, 500));
        captureDocument();
      } else {
        await speakAndWait('Returning to the dashboard.');
        navigation.goBack();
      }
    } catch (e) {
      console.warn('OCR error:', e);
      await speakAndWait('Something went wrong reading the document. Let us try again.');
      captureFiredRef.current = false;
      setTimeout(captureDocument, 3000);
    }
  };

  const captureDocument = async () => {
    if (captureFiredRef.current) return;
    captureFiredRef.current = true;
    try {
      const ok = await requestCameraPermission();
      if (!ok) {
        Alert.alert('Camera permission needed', 'Please allow camera access to read printed text.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() }
        ]);
        captureFiredRef.current = false;
        return;
      }

      console.log('[OCR] Launching camera...');
      const image = await launchCamera({
        mediaType: 'photo',
        quality: 1.0,
        maxWidth: 2000,
        maxHeight: 2000,
        saveToPhotos: false,
        includeBase64: false,
        cameraType: 'back',
      });

      console.log('[OCR] Camera result:', image);

      if (!image?.assets?.[0]?.uri) {
        console.log('[OCR] No image captured');
        captureFiredRef.current = false;
        await speakAndWait('Capture was cancelled. Tap scan again.');
        return;
      }

      await processImage(image.assets[0].uri);
    } catch (e) {
      console.warn('[OCR] Capture error:', e);
      captureFiredRef.current = false;
      await speakAndWait('Could not capture. Please try again.');
    }
  };

  useEffect(() => {
    let cancelled = false;
    const announce = async () => {
      await new Promise<void>(r => setTimeout(r, 400));
      if (cancelled) return;
      await speakAndWait('Document Reader. Point your camera at a document and I will read it aloud.');
    };
    announce();

    // Camera opens after longer delay to ensure permissions are ready
    const t = setTimeout(() => {
      if (!cancelled && !captureFiredRef.current) {
        captureDocument();
      }
    }, 1500);

    return () => {
      cancelled = true;
      clearTimeout(t);
      captureFiredRef.current = true;
      ttsService.stop();
    };
  }, []);

  const handleScanAgain = () => {
    captureFiredRef.current = false;
    // Small delay to ensure UI is ready
    setTimeout(() => captureDocument(), 200);
  };

  const handleReadText = () => {
    if (!capturedText.trim()) {
      Alert.alert('No text', 'Capture text first');
      ttsService.speak('Please capture text first.');
      return;
    }
    ttsService.speak(capturedText);
  };

  const handleStop = () => {
    ttsService.stop();
    ttsService.speak('Stopped.');
  };

  const handleClear = () => {
    setCapturedText('');
    ttsService.speak('Text cleared.');
  };



  return (
    <ScrollView contentContainerStyle={styles.container} importantForAccessibility="no">
      <Text style={styles.title} accessible accessibilityRole="header">
        Text Reader
      </Text>

      <Text style={styles.subtitle} accessible>
        Camera will open automatically. Point your phone at the document.
      </Text>

      {loading && (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#0A2540" />
          <Text style={styles.loadingText}>Processing...</Text>
        </View>
      )}

      {capturedText && (
        <View style={styles.capturedTextBox}>
          <Text style={styles.capturedTextLabel}>Recognized Text:</Text>
          <Text style={styles.resultText} accessible>
            {capturedText}
          </Text>
          <Text style={styles.charCount}>{capturedText.length} characters</Text>
        </View>
      )}

      <TouchableOpacity
        style={styles.scanAgainButton}
        onPress={handleScanAgain}
        accessible
        accessibilityRole="button"
        accessibilityLabel="Scan again"
        accessibilityHint="Double tap to capture a new document."
      >
        <Text style={styles.scanAgainText}>📷 Scan Again</Text>
      </TouchableOpacity>

      {capturedText && (
        <>
          <TouchableOpacity
            style={[styles.button, styles.readButton]}
            onPress={handleReadText}
            accessible
            accessibilityRole="button"
            accessibilityLabel="Read text aloud"
          >
            <Text style={styles.buttonText}>🔊 Read Text Aloud</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.stopButton]}
            onPress={handleStop}
            accessible
            accessibilityRole="button"
            accessibilityLabel="Stop reading"
          >
            <Text style={styles.buttonText}>⏹️ Stop</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.clearButton]}
            onPress={handleClear}
            accessible
            accessibilityRole="button"
            accessibilityLabel="Clear text"
          >
            <Text style={styles.buttonText}>🗑️ Clear</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: '#F5F5F5',
    flexGrow: 1,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#0A2540',
  },
  subtitle: {
    fontSize: 15,
    color: '#666',
    marginBottom: 20,
  },
  loadingBox: {
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#333',
  },
  capturedTextBox: {
    width: '100%',
    marginBottom: 15,
  },
  capturedTextLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0A2540',
    marginBottom: 8,
  },
  resultText: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 15,
    borderWidth: 2,
    borderColor: '#DDD',
    fontSize: 16,
    color: '#333',
    lineHeight: 22,
    minHeight: 100,
  },
  charCount: {
    fontSize: 13,
    color: '#666',
    textAlign: 'right',
    marginBottom: 15,
  },
  scanAgainButton: {
    width: '100%',
    minHeight: 60,
    backgroundColor: '#FFB84D',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
    elevation: 3,
  },
  scanAgainText: {
    color: '#0A2540',
    fontSize: 18,
    fontWeight: 'bold',
  },
  button: {
    width: '100%',
    minHeight: 55,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  readButton: { backgroundColor: '#0A2540' },
  stopButton: { backgroundColor: '#C1121F' },
  clearButton: { backgroundColor: '#666' },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: 'bold',
  },
});

export default OCRScannerScreen;