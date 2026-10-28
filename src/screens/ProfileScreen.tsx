import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import ttsService from '../services/ttsService';
import { speakAndWait } from '../services/ttsService';
import { Colors } from '../constants/colors';
import { auth, firestore, collection, doc, getDoc } from '../services/firebase';
import { listenOnce as listenOnceNative, isVoiceAvailable, type VoiceResult } from '../services/voiceService';
import { hasBiometricCredentials, removeBiometricCredentials } from '../services/biometricService';
import Tts from 'react-native-tts';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'ProfileScreen'>;

const ProfileScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const insets = useSafeAreaInsets();
  
  const [profile, setProfile] = useState({ name: '', email: '', branch: '' });
  const [voiceSpeed, setVoiceSpeed] = useState<'Slow' | 'Normal' | 'Fast'>('Normal');
  const [voiceLanguage, setVoiceLanguage] = useState<'English UK' | 'English US' | 'Chichewa'>('English UK');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [hasBiometricLogin, setHasBiometricLogin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const announce = async () => {
      await new Promise<void>(r => setTimeout(r, 600));
      if (cancelled) return;
      if (hasBiometricLogin) {
        await speakAndWait('Settings. Choose Profile, Voice Speed, Voice Language, Notifications, About MUB, Remove Fingerprint Login, or Log Out.');
      } else {
        await speakAndWait('Settings. Choose Profile, Voice Speed, Voice Language, Notifications, About MUB, or Log Out.');
      }
    };
    announce();

    loadProfile();

    return () => {
      cancelled = true;
      ttsService.stop();
    };
  }, [hasBiometricLogin]);

  const loadProfile = async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      const docRef = doc(firestore, 'users', currentUser.uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setProfile({
          name: data.displayName || currentUser.displayName || 'Friend',
          email: currentUser.email || '',
          branch: data.branch || 'Lilongwe',
        });
      }

      // Check if biometric credentials are saved
      const hasBio = await hasBiometricCredentials();
      setHasBiometricLogin(hasBio);
    } catch (e) {
      console.warn('Failed to load profile:', e);
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

  const cycleVoiceSpeed = () => {
    const speeds: Array<'Slow' | 'Normal' | 'Fast'> = ['Slow', 'Normal', 'Fast'];
    const currentIndex = speeds.indexOf(voiceSpeed);
    const next = speeds[(currentIndex + 1) % speeds.length];
    setVoiceSpeed(next);
    ttsService.speak(`Voice speed set to ${next}`);
    
    // Apply to TTS
    const rate = next === 'Slow' ? 0.5 : next === 'Fast' ? 1.5 : 1.0;
    Tts.setDefaultRate(rate);
  };

  const cycleVoiceLanguage = () => {
    const languages: Array<'English UK' | 'English US' | 'Chichewa'> = ['English UK', 'English US', 'Chichewa'];
    const currentIndex = languages.indexOf(voiceLanguage);
    const next = languages[(currentIndex + 1) % languages.length];
    setVoiceLanguage(next);
    ttsService.speak(`Voice language set to ${next}`);
    
    // Apply to TTS
    const langCode = next === 'English UK' ? 'en-GB' : next === 'English US' ? 'en-US' : 'ny';
    Tts.setDefaultLanguage(langCode);
  };

  const toggleNotifications = () => {
    const newState = !notificationsEnabled;
    setNotificationsEnabled(newState);
    ttsService.speak(`Announcements notifications ${newState ? 'enabled' : 'disabled'}`);
  };

  const readAboutMUB = () => {
    const info = 'Malawi Union of the Blind. Contact: email at mub at malawi dot net. Phone: plus 265 1 777 777. Lilongwe branch hours: Monday to Friday, 8 AM to 5 PM. Saturday, 9 AM to 12 PM.';
    ttsService.speak(info);
  };

  const TTS_ECHO_PHRASES = [
    'are you sure',
    'logging out',
    'logout cancelled',
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
        console.warn('[ProfileScreen] Recognition error:', result.error.code, result.error.message);
        return null;
      }
      const cleaned = (result.text || '').trim();
      // No echo filtering - rely on proper timing
      return cleaned.length > 0 ? cleaned : null;
    } catch (e) {
      return null;
    }
  };

  const handleLogout = async () => {
    if (!(await ensureMicPermission())) {
      ttsService.speak('Microphone permission is required. Please allow it in Settings.');
      return;
    }
    ttsService.speak('Are you sure you want to log out? Say yes or no.');
    const response = await listenOnce();
    if (response?.toLowerCase().includes('yes')) {
      console.log('[ProfileScreen] User confirmed logout');
      ttsService.speak('Logging out.');
      console.log('[ProfileScreen] Calling auth.signOut()');
      await auth.signOut();
      console.log('[ProfileScreen] auth.signOut() completed');
      console.log('[ProfileScreen] Manual navigation reset to LoginScreen');
      navigation.reset({ index: 0, routes: [{ name: 'LoginScreen' }] });
      console.log('[ProfileScreen] Manual navigation reset completed');
    } else {
      ttsService.speak('Logout cancelled.');
    }
  };

  const handleRemoveBiometricLogin = async () => {
    if (!(await ensureMicPermission())) {
      ttsService.speak('Microphone permission is required. Please allow it in Settings.');
      return;
    }
    ttsService.speak('Are you sure you want to remove fingerprint login? Say yes or no.');
    const response = await listenOnce();
    if (response?.toLowerCase().includes('yes')) {
      console.log('[ProfileScreen] User confirmed biometric removal');
      const removed = await removeBiometricCredentials();
      if (removed) {
        setHasBiometricLogin(false);
        ttsService.speak('Fingerprint login removed. You can still log in with voice or password.');
      } else {
        ttsService.speak('Could not remove fingerprint login. Please try again.');
      }
    } else {
      ttsService.speak('Removal cancelled.');
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 24 + insets.bottom }]}
        importantForAccessibility="no"
      >
        <Text style={styles.title} accessible accessibilityRole="header">
          Settings
        </Text>

        {/* Profile Card */}
        <TouchableOpacity
          style={styles.card}
          accessible
          accessibilityRole="button"
          accessibilityLabel={`Profile. Name: ${profile.name}. Email: ${profile.email}. Branch: ${profile.branch}`}
          accessibilityHint="Your account information"
          activeOpacity={0.85}
        >
          <Text style={styles.cardTitle}>👤 Profile</Text>
          <Text style={styles.cardText} accessible accessibilityRole="text">Name: {profile.name}</Text>
          <Text style={styles.cardText} accessible accessibilityRole="text">Email: {profile.email}</Text>
          <Text style={styles.cardText} accessible accessibilityRole="text">Branch: {profile.branch}</Text>
        </TouchableOpacity>

        {/* Voice Speed */}
        <TouchableOpacity
          style={styles.card}
          onPress={cycleVoiceSpeed}
          accessible
          accessibilityRole="button"
          accessibilityLabel={`Voice Speed: ${voiceSpeed}`}
          accessibilityHint="Double tap to cycle between Slow, Normal, and Fast"
          activeOpacity={0.85}
        >
          <Text style={styles.cardTitle}>🔊 Voice Speed</Text>
          <Text style={styles.cardText} accessible accessibilityRole="text">Current: {voiceSpeed}</Text>
        </TouchableOpacity>

        {/* Voice Language */}
        <TouchableOpacity
          style={styles.card}
          onPress={cycleVoiceLanguage}
          accessible
          accessibilityRole="button"
          accessibilityLabel={`Voice Language: ${voiceLanguage}`}
          accessibilityHint="Double tap to cycle between English UK, English US, and Chichewa"
          activeOpacity={0.85}
        >
          <Text style={styles.cardTitle}>🌐 Voice Language</Text>
          <Text style={styles.cardText} accessible accessibilityRole="text">Current: {voiceLanguage}</Text>
        </TouchableOpacity>

        {/* Notifications */}
        <TouchableOpacity
          style={styles.card}
          onPress={toggleNotifications}
          accessible
          accessibilityRole="button"
          accessibilityLabel={`Announcements Notifications: ${notificationsEnabled ? 'On' : 'Off'}`}
          accessibilityHint="Double tap to toggle announcements notifications"
          activeOpacity={0.85}
        >
          <Text style={styles.cardTitle}>🔔 Announcements Notifications</Text>
          <Text style={styles.cardText} accessible accessibilityRole="text">Current: {notificationsEnabled ? 'On' : 'Off'}</Text>
        </TouchableOpacity>

        {/* About MUB */}
        <TouchableOpacity
          style={styles.card}
          onPress={readAboutMUB}
          accessible
          accessibilityRole="button"
          accessibilityLabel="About MUB"
          accessibilityHint="Double tap to hear MUB contact information and branch hours"
          activeOpacity={0.85}
        >
          <Text style={styles.cardTitle}>ℹ️ About MUB</Text>
          <Text style={styles.cardText} accessible accessibilityRole="text">Tap to hear contact info and hours</Text>
        </TouchableOpacity>

        {/* Remove Fingerprint Login */}
        {hasBiometricLogin && (
          <TouchableOpacity
            style={styles.card}
            onPress={handleRemoveBiometricLogin}
            accessible
            accessibilityRole="button"
            accessibilityLabel="Remove Fingerprint Login"
            accessibilityHint="Double tap to remove saved fingerprint login. You will still be able to log in with voice or password."
            activeOpacity={0.85}
          >
            <Text style={styles.cardTitle}>🔐 Remove Fingerprint Login</Text>
            <Text style={styles.cardText} accessible accessibilityRole="text">Tap to remove saved fingerprint</Text>
          </TouchableOpacity>
        )}

        {/* Log Out */}
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          accessible
          accessibilityRole="button"
          accessibilityLabel="Log Out"
          accessibilityHint="Double tap to log out. You will be asked to confirm."
          activeOpacity={0.85}
        >
          <Text style={styles.logoutButtonText}>🚪 Log Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollView: { flex: 1 },
  scrollContent: { padding: 20 },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.textWhite,
    marginBottom: 20,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 20,
    marginBottom: 14,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 10,
  },
  cardText: {
    fontSize: 16,
    color: Colors.textPrimary,
    marginBottom: 5,
  },
  logoutButton: {
    backgroundColor: '#D32F2F',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginTop: 10,
    elevation: 3,
  },
  logoutButtonText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
});

export default ProfileScreen;
