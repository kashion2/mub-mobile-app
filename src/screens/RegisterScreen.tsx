import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
} from 'react-native';
import Tts from 'react-native-tts';
import ttsService from '../services/ttsService';
import { speakAndWait } from '../services/ttsService';

const TTS_ECHO = [
  // Disabled - accept all input
];

const looksLikeTts = (text: string): boolean => {
  // Disabled - accept all input
  return false;
};

const RegisterScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [debugText, setDebugText] = useState('Admin-only registration');

  useEffect(() => {
    let cancelled = false;
    const announce = async () => {
      await new Promise<void>(r => setTimeout(r, 600));
      if (cancelled) return;
      await speakAndWait('Contact MUB administrator to create your account. Do not register here.');
    };
    announce();
    return () => { cancelled = true; };
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Registration</Text>
      <Text style={styles.subtitle}>Admin-Only Registration</Text>

      <Text style={styles.message}>
        Registration is handled by the administrator. Please contact the Malawi Union of the Blind administrator to get your user ID.
      </Text>

      <Text style={styles.message}>
        Your user ID will start with the letter B followed by four digits.
      </Text>

      <TouchableOpacity
        style={styles.button}
        onPress={() => navigation.goBack()}
        accessibilityLabel="Go back to login"
      >
        <Text style={styles.buttonText}>Back to Login</Text>
      </TouchableOpacity>

      <Text style={styles.debug}>{debugText}</Text>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, backgroundColor: '#0A2540', justifyContent: 'center' },
  title: { color: '#fff', fontSize: 26, fontWeight: 'bold', textAlign: 'center', marginBottom: 8 },
  subtitle: { color: '#FFC107', fontSize: 15, textAlign: 'center', marginBottom: 32 },
  message: { color: '#fff', fontSize: 16, textAlign: 'center', marginBottom: 16, lineHeight: 24 },
  button: { backgroundColor: '#FFC107', borderRadius: 10, padding: 18, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#0A2540', fontSize: 18, fontWeight: 'bold' },
  debug: { color: '#FF6B6B', fontSize: 12, textAlign: 'center', marginTop: 16, marginHorizontal: 8 },
});

export default RegisterScreen;
