import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  StatusBar,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import ttsService from '../services/ttsService';

const SplashScreen: React.FC = () => {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList, 'SplashScreen'>>();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const titleFadeAnim = useRef(new Animated.Value(0)).current;
  const hasSpoken = useRef(false);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
    ]).start(() => {
      Animated.timing(titleFadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }).start();
    });

    const speakWelcome = async () => {
      if (hasSpoken.current) return;
      hasSpoken.current = true;
      try {
        await ttsService.init();
        await new Promise<void>((r) => setTimeout(r, 1000));
        ttsService.speak('Welcome to Malawi Union of the Blind.');
      } catch (e) {
        console.warn('Splash TTS error:', e);
      }
    };

    const speakTimer = setTimeout(speakWelcome, 1200);
    const navTimer = setTimeout(() => {
      navigation.replace('LoginScreen');
    }, 5000);

    return () => {
      clearTimeout(speakTimer);
      clearTimeout(navTimer);
      ttsService.stop();
    };
  }, [navigation, fadeAnim, scaleAnim, titleFadeAnim]);

  return (
    <View style={styles.container} importantForAccessibility="no">
      <StatusBar barStyle="light-content" />
      <Animated.View
        style={[
          styles.logoContainer,
          { opacity: fadeAnim, transform: [{ scale: scaleAnim }] },
        ]}
      >
        <Text style={styles.logoImage} accessible accessibilityLabel="Malawi Union of the Blind logo">👁️</Text>
      </Animated.View>

      <Animated.Text
        style={[styles.title, { opacity: titleFadeAnim }]}
        accessible
        accessibilityRole="header"
      >
        Welcome to Malawi Union of the Blind
      </Animated.Text>

      <Animated.Text
        style={[styles.loading, { opacity: titleFadeAnim }]}
        accessible
      >
        Loading...
      </Animated.Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0A2540',
    padding: 20,
  },
  logoContainer: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#FFFFFF',
    marginBottom: 40,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 10,
    elevation: 10,
  },
  logoImage: { fontSize: 150, textAlign: 'center' },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 20,
    textAlign: 'center',
  },
  loading: {
    fontSize: 14,
    color: '#FFFFFF80',
    fontWeight: '500',
  },
});

export default SplashScreen;