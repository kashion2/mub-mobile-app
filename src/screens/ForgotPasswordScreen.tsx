import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  StatusBar,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import ttsService, { speakAndWait } from '../services/ttsService';
import { listenOnce as listenOnceNative, isVoiceAvailable, type VoiceResult } from '../services/voiceService';
import Tts from 'react-native-tts';

const ForgotPasswordScreen: React.FC = () => {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList, 'ForgotPasswordScreen'>>();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const announce = async () => {
      await new Promise<void>(r => setTimeout(r, 600));
      if (cancelled) return;
      await speakAndWait('Forgot Password. Contact MUB administrator to reset your password.');
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

  const TTS_ECHO_PHRASES = [
    'please say your',
    'i heard',
    'i did not hear',
    'tapping send',
  ];

  const looksLikeTts = (text: string): boolean => {
    const lower = text.toLowerCase();
    return TTS_ECHO_PHRASES.some(p => lower.includes(p));
  };

  const listenOnce = async (): Promise<string | null> => {
    try {
      try { Tts.stop(); } catch (e) {}
      await new Promise<void>(r => setTimeout(r, 500));
      const result = await Promise.race([
        listenOnceNative(),
        new Promise<VoiceResult>((_, rej) => setTimeout(() => rej({ text: null, error: { code: 'TIMEOUT', message: 'Timeout' } }), 8000)),
      ]);
      if (result.error) {
        console.warn('[ForgotPassword] Recognition error:', result.error.code, result.error.message);
        return null;
      }
      const cleaned = (result.text || '').trim();
      if (looksLikeTts(cleaned)) {
        return null;
      }
      return cleaned.length > 0 ? cleaned : null;
    } catch (e) {
      return null;
    }
  };

  const handleVoiceEmail = async () => {
    if (!(await ensureMicPermission())) {
      await speakAndWait('Microphone permission is required. Please allow it in Settings.');
      return;
    }
    setIsLoading(true);
    try {
      ttsService.speak('Please say your email address now.');
      const emailText = await listenOnce();
      if (!emailText) {
        ttsService.speak('I did not hear your email. Please try again.');
        setIsLoading(false);
        return;
      }
      const normalizedEmail = emailText
        .toLowerCase()
        .replace(/\s+at\s+/g, '@')
        .replace(/\s+dot\s+/g, '.')
        .replace(/\s/g, '');
      setEmail(normalizedEmail);
      ttsService.speak(`I heard ${normalizedEmail}. Tapping Send Reset now.`);
      setIsLoading(false);
      await handleSubmit();
    } catch (e: any) {
      ttsService.speak('Failed to process email. Please try again.');
      console.warn('Voice email error:', e);
      setIsLoading(false);
    }
  };

  const handleSubmit = () => {
    if (!email) {
      Alert.alert('Missing Email', 'Please enter your email address');
      ttsService.speak('Please enter your email address.');
      return;
    }
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      ttsService.speak(
        `A password reset link has been sent to ${email}. Check your email.`,
      );
      Alert.alert(
        'Reset Link Sent',
        `We sent a password reset link to ${email}. Check your inbox.`,
      );
      navigation.goBack();
    }, 1200);
  };

  const handleBack = () => {
    ttsService.speak('Going back.');
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('LoginScreen');
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" />
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        importantForAccessibility="no"
      >
        <TouchableOpacity
          style={styles.backArrow}
          onPress={handleBack}
          accessible
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Text style={styles.backArrowText}>←</Text>
        </TouchableOpacity>

        <View style={styles.logoContainer}>
          <Text style={styles.logo} accessible accessibilityLabel="MUB logo">👁️</Text>
        </View>

        <Text style={styles.title} accessible accessibilityRole="header">
          Reset Password
        </Text>

        <Text style={styles.subtitle} accessible>
          Enter your email and we'll send you a reset link
        </Text>

        <TouchableOpacity
          style={styles.voiceButton}
          onPress={handleVoiceEmail}
          disabled={isLoading}
          accessible
          accessibilityRole="button"
          accessibilityLabel="Voice Email"
          accessibilityHint="Double tap and then speak your email address."
          activeOpacity={0.85}
        >
          <Text style={styles.voiceButtonText}>
            {isLoading ? 'Listening...' : '🎤 Voice Email'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.orText}>— OR type your email —</Text>

        <View style={styles.fieldRow}>
          <TextInput
            style={styles.fieldInput}
            placeholder="Email address"
            placeholderTextColor="#FFFFFF80"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            accessible
            accessibilityLabel="Email input field"
            onFocus={() => ttsService.speak('Enter your email address')}
          />
        </View>

        <TouchableOpacity
          style={styles.button}
          onPress={handleSubmit}
          disabled={isLoading}
          accessible
          accessibilityRole="button"
          accessibilityLabel="Send reset link"
        >
          <Text style={styles.buttonText}>
            {isLoading ? 'Sending...' : 'Send Reset Link'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.backToLogin}
          onPress={handleBack}
          accessible
          accessibilityRole="button"
          accessibilityLabel="Back to login"
        >
          <Text style={styles.backToLoginText}>Back to Login</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#0A2540' },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 25,
    backgroundColor: '#0A2540',
  },
  backArrow: {
    position: 'absolute',
    top: 40,
    left: 20,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FFFFFF20',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  backArrowText: { fontSize: 28, color: '#FFFFFF', fontWeight: 'bold' },
  logoContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    marginBottom: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: { fontSize: 85, textAlign: 'center' },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#FFFFFF',
    marginBottom: 25,
    textAlign: 'center',
    opacity: 0.9,
  },
  voiceButton: {
    width: '100%',
    minHeight: 65,
    backgroundColor: '#F2B705',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  voiceButtonText: {
    color: '#0A2540',
    fontSize: 18,
    fontWeight: 'bold',
  },
  orText: {
    color: '#FFFFFF80',
    fontSize: 14,
    marginBottom: 15,
    textAlign: 'center',
  },
  fieldRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  fieldInput: {
    width: '100%',
    height: 58,
    backgroundColor: '#FFFFFF20',
    borderRadius: 12,
    paddingHorizontal: 18,
    borderWidth: 2,
    borderColor: '#FFFFFF40',
    color: '#FFFFFF',
    fontSize: 17,
  },
  button: {
    width: '100%',
    height: 58,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    elevation: 6,
  },
  buttonText: { color: '#0A2540', fontSize: 20, fontWeight: 'bold' },
  backToLogin: { marginTop: 20, padding: 10 },
  backToLoginText: {
    color: '#FFFFFF',
    fontSize: 15,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
});

export default ForgotPasswordScreen;