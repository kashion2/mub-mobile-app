import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  AccessibilityInfo,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import ttsService from '../services/ttsService';
import { speakAndWait } from '../services/ttsService';
import { listenOnce as listenOnceNative, isVoiceAvailable, type VoiceResult } from '../services/voiceService';
import { auth, firestore, collection, doc, getDoc, query, orderBy, limit, getDocs } from '../services/firebase';
import Tts from 'react-native-tts';

const TTSScreen: React.FC = () => {
  const navigation = useNavigation();
  const [isListening, setIsListening] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const announce = async () => {
      await new Promise<void>(r => setTimeout(r, 600));
      if (cancelled) return;
      await speakAndWait('Text to Speech. Tap the microphone and speak any text, or choose an option below.');
    };
    announce();
    return () => {
      cancelled = true;
      ttsService.stop();
    };
  }, []);

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

  const handleSpeakText = async () => {
    if (!(await ensureMicPermission())) {
      ttsService.speak('Microphone permission is required. Please allow it in Settings.');
      return;
    }
    ttsService.speak('I am listening.');
    try { Tts.stop(); } catch (e) {}
    await new Promise<void>(r => setTimeout(r, 800));
    const result = await listenOnceNative();
    if (result.error) {
      console.warn('[TTSScreen] Recognition error:', result.error.code, result.error.message);
      ttsService.speak('Voice recognition failed. Please try again.');
      return;
    }
    const text = result.text;
    if (text && text.trim().length > 0) {
      await speakAndWait(`You said: ${text}`);
      await new Promise<void>(r => setTimeout(r, 500));
      ttsService.speak(text);
    } else {
      ttsService.speak('I did not hear anything. Please try again.');
    }
  };

  const handleReadClipboard = async () => {
    // Note: React Native doesn't have built-in clipboard access without a library
    // This would require react-native-clipboard or similar
    ttsService.speak('Reading clipboard is not available in this version. Please use speak text or read last announcement.');
  };

  const handleReadScreen = async () => {
    ttsService.speak('Reading the current screen is not available. Please use Read Clipboard or speak the text.');
  };

  const handleReadLastAnnouncement = async () => {
    try {
      const q = query(collection(firestore, 'announcements'), orderBy('createdAt', 'desc'), limit(1));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        ttsService.speak('No announcements found.');
        return;
      }

      const doc = snapshot.docs[0];
      const data = doc.data();
      const text = `${data.title}. ${data.message}`;
      ttsService.speak(text);
    } catch (e) {
      console.warn('Failed to fetch announcement:', e);
      ttsService.speak('Could not fetch announcements. Please try again.');
    }
  };

  const handleReadMyActivity = async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        ttsService.speak('You must be logged in to view your activity.');
        return;
      }

      const today = new Date().toISOString().split('T')[0];
      const docRef = doc(firestore, 'users', currentUser.uid, 'activity', today);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        const distance = data.distance || 0;
        const minutes = data.minutes || 0;
        ttsService.speak(`Today you walked ${distance} meters in ${minutes} minutes.`);
      } else {
        ttsService.speak('No activity recorded today.');
      }
    } catch (e) {
      console.warn('Failed to fetch activity:', e);
      ttsService.speak('Could not fetch your activity. Please try again.');
    }
  };

  const handleReadDateTime = () => {
    const now = new Date();
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    
    const dayName = days[now.getDay()];
    const monthName = months[now.getMonth()];
    const date = now.getDate();
    const year = now.getFullYear();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    
    const timeStr = hours > 12 ? `${hours - 12} ${minutes} PM` : `${hours} ${minutes} AM`;
    
    ttsService.speak(`Today is ${dayName}, ${monthName} ${date}, ${year}. The time is ${timeStr}.`);
  };

  return (
    <ScrollView contentContainerStyle={styles.container} importantForAccessibility="no">
      <Text style={styles.title} accessible accessibilityRole="header">
        Text to Speech
      </Text>

      <Text style={styles.subtitle} accessible>
        Tap the microphone and speak any text, or choose an option below.
      </Text>

      {/* HUGE MIC BUTTON */}
      <TouchableOpacity
        style={styles.micButton}
        onPress={handleSpeakText}
        disabled={isListening}
        accessible
        accessibilityRole="button"
        accessibilityLabel="Speak text to read"
        accessibilityHint="Double tap, then speak. I will read it back."
        activeOpacity={0.85}
      >
        <Text style={styles.micIcon}>🎤</Text>
        <Text style={styles.micButtonText}>
          {isListening ? 'Listening...' : 'Speak text to read'}
        </Text>
      </TouchableOpacity>

      {/* PRESET BUTTONS */}
      <TouchableOpacity
        style={styles.presetButton}
        onPress={handleReadClipboard}
        accessible
        accessibilityRole="button"
        accessibilityLabel="Read Clipboard"
        accessibilityHint="Reads whatever text is on the clipboard"
        activeOpacity={0.85}
      >
        <Text style={styles.presetButtonText}>📋 Read Clipboard</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.presetButton}
        onPress={handleReadScreen}
        accessible
        accessibilityRole="button"
        accessibilityLabel="Read Screen"
        accessibilityHint="Reads the current screen content"
        activeOpacity={0.85}
      >
        <Text style={styles.presetButtonText}>📱 Read Screen</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.presetButton}
        onPress={handleReadLastAnnouncement}
        accessible
        accessibilityRole="button"
        accessibilityLabel="Read Last Announcement"
        accessibilityHint="Reads the latest announcement from MUB"
        activeOpacity={0.85}
      >
        <Text style={styles.presetButtonText}>📢 Read Last Announcement</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.presetButton}
        onPress={handleReadMyActivity}
        accessible
        accessibilityRole="button"
        accessibilityLabel="Read My Activity"
        accessibilityHint="Reads today's walking minutes and distance"
        activeOpacity={0.85}
      >
        <Text style={styles.presetButtonText}>🚶 Read My Activity</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.presetButton}
        onPress={handleReadDateTime}
        accessible
        accessibilityRole="button"
        accessibilityLabel="Read Today's Date and Time"
        accessibilityHint="Speaks the current date and time"
        activeOpacity={0.85}
      >
        <Text style={styles.presetButtonText}>🕐 Read Today's Date and Time</Text>
      </TouchableOpacity>

      {/* BACK BUTTON */}
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => navigation.goBack()}
        accessible
        accessibilityRole="button"
        accessibilityLabel="Back to Dashboard"
        accessibilityHint="Return to the home screen"
        activeOpacity={0.85}
      >
        <Text style={styles.backButtonText}>Back to Dashboard</Text>
      </TouchableOpacity>
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
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#0A2540',
  },
  subtitle: {
    fontSize: 15,
    color: '#666',
    marginBottom: 25,
  },
  micButton: {
    width: '100%',
    height: 100,
    backgroundColor: '#FFC107',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    elevation: 4,
  },
  micIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  micButtonText: {
    color: '#0A2540',
    fontSize: 20,
    fontWeight: 'bold',
  },
  presetButton: {
    width: '100%',
    height: 70,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#DDD',
  },
  presetButtonText: {
    color: '#0A2540',
    fontSize: 18,
    fontWeight: '600',
  },
  backButton: {
    width: '100%',
    height: 60,
    backgroundColor: '#0A2540',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    elevation: 3,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default TTSScreen;
