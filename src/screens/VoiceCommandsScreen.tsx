import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  PermissionsAndroid,
  Platform,
  Alert,
  ScrollView,
  Linking,
  Animated,
  Easing,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { listenOnce as listenOnceNative, isVoiceAvailable, type VoiceResult } from '../services/voiceService';
import ttsService, { speakAndWait } from '../services/ttsService';
import Tts from 'react-native-tts';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'VoiceCommandsScreen'>;

const VoiceCommandsScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [status, setStatus] = useState('Listening...');
  const pulseAnim = new Animated.Value(1);
  const cancelledRef = useRef(false);

  const TTS_ECHO_PHRASES = [
    'say another command',
    'say a command',
    'closing voice commands',
    'i did not hear',
    'opening',
    'going home',
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
        console.warn('[VoiceCommands] Recognition error:', result.error.code, result.error.message);
        return null;
      }
      const cleaned = (result.text || '').trim();
      // No echo filtering - rely on proper timing
      return cleaned.length > 0 ? cleaned : null;
    } catch (e) {
      return null;
    }
  };

  const processVoiceCommand = useCallback(
    async (text: string) => {
      const t = text.toLowerCase().trim();
      if (!t) return;

      if (t.includes('logout') || t.includes('log out')) {
        await speakAndWait('Logging out. Returning to login screen.');
        navigation.reset({ index: 0, routes: [{ name: 'LoginScreen' }] });
      } else if (t.includes('announcement')) {
        await speakAndWait('Opening announcements');
        navigation.navigate('AnnouncementsScreen');
      } else if (t.includes('sos') || t.includes('emergency') || t.includes('help')) {
        await speakAndWait('Opening emergency SOS');
        navigation.navigate('EmergencySOSScreen');
      } else if (t.includes('ocr') || t.includes('scan') || t.includes('read') || t.includes('document')) {
        await speakAndWait('Opening text reader');
        navigation.navigate('OCRScannerScreen');
      } else if (t.includes('gps') || t.includes('location') || t.includes('where') || t.includes('navigate')) {
        await speakAndWait('Opening GPS');
        navigation.navigate('GPSScreen');
      } else if (t.includes('tts') || t.includes('speak') || t.includes('text to speech')) {
        await speakAndWait('Opening text to speech');
        navigation.navigate('TTSScreen');
      } else if (t.includes('profile') || t.includes('settings')) {
        await speakAndWait('Opening settings');
        navigation.navigate('ProfileScreen');
      } else if (t.includes('home') || t.includes('back')) {
        await speakAndWait('Going home');
        navigation.navigate('HomeScreen' as never);
      } else if (t.includes('activity') || t.includes('my activity')) {
        await speakAndWait('Opening my activity');
        navigation.navigate('MyActivityScreen');
      } else {
        await speakAndWait('Command not recognized. Please try again.');
      }
    },
    [navigation],
  );

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

  useEffect(() => {
    ttsService.init();
    const cancelled = cancelledRef;
    const runLoop = async () => {
      if (!(await ensureMicPermission())) {
        await speakAndWait('Microphone permission is required. Please allow it in Settings.');
        return;
      }
      await speakAndWait('Voice Commands. Say a command like SOS, Announcements, GPS, or Home.');
      // Only run ONE command then exit - don't loop
      try {
        try { Tts.stop(); } catch (e) {}
        await new Promise<void>(r => setTimeout(r, 700));
        setIsListening(true);
        setStatus('Listening...');
        startPulse();
        const result = await listenOnce();
        stopPulse();
        setIsListening(false);
        const text = (result || '').trim();
        if (text.length > 0) {
          setTranscript(text);
          if (text.toLowerCase().includes('done') || text.toLowerCase().includes('exit')) {
            await speakAndWait('Closing voice commands.');
            navigation.goBack();
            return;
          }
          await processVoiceCommand(text.toLowerCase());
          // Don't ask for another command - just close after executing
          await new Promise<void>(r => setTimeout(r, 500));
        } else {
          await speakAndWait('I did not hear you. Please try again.');
        }
      } catch (e) {
        setIsListening(false);
        stopPulse();
        console.warn('Voice error:', e);
        await speakAndWait('I did not hear you. Please try again.');
      }
    };
    runLoop();
    return () => {
      cancelled.current = true;
      ttsService.stop();
      stopPulse();
    };
  }, [navigation, processVoiceCommand]);

  const handleListen = async () => {
    ttsService.speak('Listening.');
    try { Tts.stop(); } catch (e) {}
    await new Promise<void>(r => setTimeout(r, 500));
    const text = await listenOnce();
    if (!text) {
      ttsService.speak('I did not hear you.');
      setStatus('Tap to try again');
      return;
    }
    setTranscript(text);
    setStatus(`✓ Recognized: "${text}"`);
    processVoiceCommand(text.toLowerCase());
  };

  const startPulse = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    ).start();
  };

  const stopPulse = () => {
    pulseAnim.stopAnimation();
    pulseAnim.setValue(1);
  };

  const handleMicPress = async () => {
    if (!(await ensureMicPermission())) {
      await speakAndWait('Microphone permission is required. Please allow it in Settings.');
      Alert.alert(
        'Microphone Permission',
        'Please enable microphone access in Settings to use voice commands.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ],
      );
      return;
    }

    await handleListen();
  };

  return (
    <ScrollView contentContainerStyle={styles.container} importantForAccessibility="no">
      <Text style={styles.title} accessible accessibilityRole="header">
        Voice Commands
      </Text>

      {/* Status banner */}
      <View style={[styles.statusBanner, isListening && styles.statusBannerActive]}>
        <Text style={styles.statusBannerText}>
          {isListening ? '🔴 RECORDING' : '🎤 READY'}
        </Text>
      </View>

      {/* Status text */}
      <Text style={styles.status} accessible>
        {status}
      </Text>

      {/* Info text */}
      <Text style={styles.info} accessible>
        Voice is always listening. Say: SOS, read document, announcements, location, home, logout, or activity. Say done to exit.
      </Text>

      {transcript ? (
        <View style={styles.transcriptBox}>
          <Text style={styles.transcriptLabel} accessible>
            {isListening ? 'Hearing now:' : 'You said:'}
          </Text>
          <Text style={styles.transcriptText} accessible>
            "{transcript}"
          </Text>
        </View>
      ) : null}

      <View style={styles.commandsBox} importantForAccessibility="no-hide-descendants">
        <Text style={styles.commandsTitle} accessible accessibilityRole="header">
          Available Commands
        </Text>
        <Text style={styles.commandText} accessible accessibilityRole="text">• "Announcements"</Text>
        <Text style={styles.commandText} accessible accessibilityRole="text">• "Emergency" or "SOS"</Text>
        <Text style={styles.commandText} accessible accessibilityRole="text">• "Read" or "OCR"</Text>
        <Text style={styles.commandText} accessible accessibilityRole="text">• "GPS" or "Navigate"</Text>
        <Text style={styles.commandText} accessible accessibilityRole="text">• "Speak" or "TTS"</Text>
        <Text style={styles.commandText} accessible accessibilityRole="text">• "Profile"</Text>
        <Text style={styles.commandText} accessible accessibilityRole="text">• "Home"</Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: '#F5F5F5',
    flexGrow: 1,
    alignItems: 'center',
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#0A2540',
  },
  statusBanner: {
    backgroundColor: '#0A2540',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 25,
  },
  statusBannerActive: {
    backgroundColor: '#C1121F',
  },
  statusBannerText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
    letterSpacing: 1,
  },
  micButton: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: '#0A2540',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 25,
    elevation: 12,
    borderWidth: 6,
    borderColor: '#FFFFFF',
  },
  micActive: {
    backgroundColor: '#C1121F',
  },
  micText: { fontSize: 64 },
  status: {
    fontSize: 17,
    fontWeight: '600',
    color: '#333',
    marginBottom: 20,
    textAlign: 'center',
    minHeight: 44,
  },
  info: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  transcriptBox: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 15,
    marginBottom: 20,
    width: '100%',
    borderWidth: 3,
    borderColor: '#0A2540',
  },
  transcriptLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0A2540',
    marginBottom: 5,
  },
  transcriptText: {
    fontSize: 18,
    color: '#333',
    fontStyle: 'italic',
    fontWeight: '600',
  },
  commandsBox: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    elevation: 3,
  },
  commandsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0A2540',
    marginBottom: 15,
  },
  commandText: { fontSize: 15, color: '#333', marginBottom: 8 },
});

export default VoiceCommandsScreen;