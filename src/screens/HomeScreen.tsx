import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import ttsService from '../services/ttsService';
import { speakAndWait } from '../services/ttsService';
import { Colors } from '../constants/colors';
import { auth, firestore, doc, getDoc } from '../services/firebase';

type HomeScreenRouteProp = RouteProp<RootStackParamList, 'HomeScreen'>;

type FeatureScreenName =
  | 'OCRScannerScreen'
  | 'VoiceCommandsScreen'
  | 'GPSScreen'
  | 'ProfileScreen'
  | 'AnnouncementsScreen'
  | 'TTSScreen'
  | 'EmergencySOSScreen'
  | 'MyActivityScreen';

const HomeScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'HomeScreen'>>();
  const route = useRoute<HomeScreenRouteProp>();
  const insets = useSafeAreaInsets();
  const { userName: routeUserName, userEmail } = route.params || {};
  const [userName, setUserName] = useState(routeUserName || 'User');

  useEffect(() => {
    const loadUser = async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      try {
        const docRef = doc(firestore, 'users', currentUser.uid);
        const docSnap = await getDoc(docRef);
        const name = docSnap.exists() ? docSnap.data()?.displayName : null;
        if (name) {
          setUserName(name);
          return;
        }
      } catch (e) {
        console.warn('Failed to fetch profile:', e);
      }

      if (currentUser.displayName) {
        setUserName(currentUser.displayName);
        return;
      }

      const emailPrefix = currentUser.email?.split('@')[0] || 'Friend';
      setUserName(emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1));
    };
    loadUser();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const announce = async () => {
      await new Promise<void>(r => setTimeout(r, 600));
      if (cancelled) return;
      await speakAndWait('Dashboard. Choose SOS, Read Document, Announcements, Voice Commands, GPS, Text to Speech, My Activity, or Settings.');
    };
    announce();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    ttsService.init();

    const getGreeting = () => {
      const hour = new Date().getHours();
      if (hour < 12) return 'Good Morning';
      if (hour < 18) return 'Good Afternoon';
      return 'Good Evening';
    };

    const greeting = getGreeting();
    const name = userName || 'User';

    const welcomeMessage = `${greeting}, ${name}. Welcome to MUB Accessibility. You have 8 options. One, Emergency SOS. Two, Read Document. Three, Announcements. Four, Voice Commands. Five, GPS Assistant. Six, Text to Speech. Seven, My Activity. Eight, Settings. Or say a command like SOS, Read Document, or Announcements.`;

    const timer = setTimeout(() => {
      ttsService.speak(welcomeMessage);
    }, 700);

    return () => {
      clearTimeout(timer);
      ttsService.stop();
    };
  }, [userName]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  const openScreen = (screenName: FeatureScreenName, label: string) => {
    ttsService.speak(`Opening ${label}`);
    navigation.navigate(screenName);
  };

  const handleLogout = () => {
    ttsService.speak('Logging out. Returning to login screen.');
    setTimeout(() => {
      navigation.reset({ index: 0, routes: [{ name: 'LoginScreen' }] });
    }, 900);
  };

  const handleVoiceCommand = () => {
    ttsService.speak('Opening voice commands');
    navigation.navigate('VoiceCommandsScreen');
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={true}
        importantForAccessibility="no"
      >
        {/* Greeting Header */}
        <View style={[styles.header, { paddingTop: 15 + insets.top }]}>
          <Text style={styles.greeting}>{getGreeting()}, {userName || 'User'}!</Text>
          <Text style={styles.welcome}>Welcome to MUB Accessibility</Text>
          <TouchableOpacity
            style={styles.settingsIcon}
            onPress={() => openScreen('ProfileScreen', 'Settings')}
            accessible
            accessibilityRole="button"
            accessibilityLabel="Settings"
            accessibilityHint="Double tap to open settings"
          >
            <Text style={styles.settingsIconText}>⚙️</Text>
          </TouchableOpacity>
        </View>

        {/* Voice Bar */}
        <TouchableOpacity
          style={styles.voiceBar}
          onPress={handleVoiceCommand}
          accessible
          accessibilityRole="button"
          accessibilityLabel="Voice command bar. Say a command like SOS, Read Document, or Announcements."
          accessibilityHint="Double tap to start listening."
          activeOpacity={0.85}
        >
          <Text style={styles.voiceBarIcon}>🎤</Text>
          <View style={styles.voiceBarTextContainer}>
            <Text style={styles.voiceBarTitle}>Say a command</Text>
            <Text style={styles.voiceBarSubtitle}>Try: SOS, Read Document, Announcements</Text>
          </View>
        </TouchableOpacity>

        {/* Action Cards */}
        <View style={styles.cardsContainer}>
          {/* Emergency SOS */}
          <TouchableOpacity
            style={styles.cardSOS}
            onPress={() => openScreen('EmergencySOSScreen', 'Emergency SOS')}
            accessible
            accessibilityRole="button"
            accessibilityLabel="Emergency SOS button. Sends an alert with your current location to MUB administrators."
            accessibilityHint="Double tap to send SOS immediately."
            activeOpacity={0.85}
          >
            <View style={styles.cardIconRow}>
              <Text style={styles.cardIconSOS}>🆘</Text>
            </View>
            <Text style={styles.cardTitleSOS}>Emergency SOS</Text>
            <Text style={styles.cardSubtitleSOS}>Send alert with your location</Text>
          </TouchableOpacity>

          {/* Read Document */}
          <TouchableOpacity
            style={styles.card}
            onPress={() => openScreen('OCRScannerScreen', 'Read Document')}
            accessible
            accessibilityRole="button"
            accessibilityLabel="Read Document"
            accessibilityHint="Double tap to open the camera. The document will be captured automatically."
            activeOpacity={0.85}
          >
            <View style={styles.cardIconRow}>
              <Text style={styles.cardIcon}>📖</Text>
            </View>
            <Text style={styles.cardTitle}>Read Document</Text>
            <Text style={styles.cardSubtitle}>Point camera at a page and I will read it</Text>
          </TouchableOpacity>

          {/* Announcements */}
          <TouchableOpacity
            style={styles.card}
            onPress={() => openScreen('AnnouncementsScreen', 'Announcements')}
            accessible
            accessibilityRole="button"
            accessibilityLabel="Announcements"
            accessibilityHint="Double tap to hear your announcements."
            activeOpacity={0.85}
          >
            <View style={styles.cardIconRow}>
              <Text style={styles.cardIcon}>📢</Text>
            </View>
            <Text style={styles.cardTitle}>Announcements</Text>
            <Text style={styles.cardSubtitle}>Listen to the latest news from MUB</Text>
          </TouchableOpacity>

          {/* Voice Commands */}
          <TouchableOpacity
            style={styles.card}
            onPress={() => openScreen('VoiceCommandsScreen', 'Voice Commands')}
            accessible
            accessibilityRole="button"
            accessibilityLabel="Voice Commands"
            accessibilityHint="Double tap to open the voice command screen."
            activeOpacity={0.85}
          >
            <View style={styles.cardIconRow}>
              <Text style={styles.cardIcon}>🎤</Text>
            </View>
            <Text style={styles.cardTitle}>Voice Commands</Text>
            <Text style={styles.cardSubtitle}>Control the app with your voice</Text>
          </TouchableOpacity>

          {/* GPS Assistant */}
          <TouchableOpacity
            style={styles.card}
            onPress={() => openScreen('GPSScreen', 'GPS Assistant')}
            accessible
            accessibilityRole="button"
            accessibilityLabel="GPS Assistant"
            accessibilityHint="Double tap to open GPS and activity tracking."
            activeOpacity={0.85}
          >
            <View style={styles.cardIconRow}>
              <Text style={styles.cardIcon}>📍</Text>
            </View>
            <Text style={styles.cardTitle}>GPS Assistant</Text>
            <Text style={styles.cardSubtitle}>Find your location and track your walk</Text>
          </TouchableOpacity>

          {/* Text to Speech */}
          <TouchableOpacity
            style={styles.card}
            onPress={() => openScreen('TTSScreen', 'Text to Speech')}
            accessible
            accessibilityRole="button"
            accessibilityLabel="Text to Speech"
            accessibilityHint="Double tap to open text to speech."
            activeOpacity={0.85}
          >
            <View style={styles.cardIconRow}>
              <Text style={styles.cardIcon}>🔊</Text>
            </View>
            <Text style={styles.cardTitle}>Text to Speech</Text>
            <Text style={styles.cardSubtitle}>Say any text and I will read it back</Text>
          </TouchableOpacity>

          {/* My Activity */}
          <TouchableOpacity
            style={styles.card}
            onPress={() => openScreen('MyActivityScreen', 'My Activity')}
            accessible
            accessibilityRole="button"
            accessibilityLabel="My Activity"
            accessibilityHint="Double tap to hear today's activity."
            activeOpacity={0.85}
          >
            <View style={styles.cardIconRow}>
              <Text style={styles.cardIcon}>🚶</Text>
            </View>
            <Text style={styles.cardTitle}>My Activity</Text>
            <Text style={styles.cardSubtitle}>Your walking minutes and distance today</Text>
          </TouchableOpacity>

          {/* Settings */}
          <TouchableOpacity
            style={styles.card}
            onPress={() => openScreen('ProfileScreen', 'Settings')}
            accessible
            accessibilityRole="button"
            accessibilityLabel="Settings"
            accessibilityHint="Double tap to open settings."
            activeOpacity={0.85}
          >
            <View style={styles.cardIconRow}>
              <Text style={styles.cardIcon}>⚙️</Text>
            </View>
            <Text style={styles.cardTitle}>Settings</Text>
            <Text style={styles.cardSubtitle}>Manage your account and preferences</Text>
          </TouchableOpacity>

          {/* Log Out */}
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogout}
            accessible
            accessibilityRole="button"
            accessibilityLabel="Log out of your account."
            accessibilityHint="Double tap to log out. You will be asked to confirm."
            activeOpacity={0.85}
          >
            <Text style={styles.logoutButtonText}>Log Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // Header
  header: {
    backgroundColor: Colors.background,
    paddingHorizontal: 20,
    paddingBottom: 20,
    minHeight: 110,
  },
  greeting: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.textWhite,
    marginBottom: 5,
  },
  welcome: {
    fontSize: 15,
    color: Colors.textMuted,
  },
  settingsIcon: {
    position: 'absolute',
    top: 15,
    right: 20,
    padding: 8,
  },
  settingsIconText: {
    fontSize: 24,
  },

  // Voice Bar
  voiceBar: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    marginHorizontal: 20,
    marginBottom: 14,
    borderRadius: 16,
    minHeight: 70,
    elevation: 3,
  },
  voiceBarIcon: {
    fontSize: 28,
    marginRight: 15,
  },
  voiceBarTextContainer: {
    flex: 1,
  },
  voiceBarTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.textPrimary,
  },
  voiceBarSubtitle: {
    fontSize: 13,
    color: Colors.textPrimary,
    opacity: 0.7,
  },

  // Cards Container
  cardsContainer: {
    paddingHorizontal: 20,
  },

  // Cards
  card: {
    width: '100%',
    backgroundColor: Colors.card,
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 20,
    marginBottom: 14,
    minHeight: 120,
    elevation: 3,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cardSOS: {
    width: '100%',
    backgroundColor: Colors.danger,
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 20,
    marginBottom: 14,
    minHeight: 120,
    elevation: 3,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cardIconRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  cardIcon: {
    fontSize: 40,
  },
  cardIconSOS: {
    fontSize: 40,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  cardTitleSOS: {
    fontSize: 22,
    fontWeight: 'bold',
    color: Colors.textWhite,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 15,
    lineHeight: 20,
    color: Colors.textMuted,
  },
  cardSubtitleSOS: {
    fontSize: 14,
    lineHeight: 18,
    color: Colors.textWhite,
    opacity: 0.85,
  },

  // Logout Button
  logoutButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: Colors.danger,
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    marginTop: 14,
    minHeight: 60,
  },
  logoutButtonText: {
    color: Colors.danger,
    fontSize: 20,
    fontWeight: 'bold',
  },
});

export default HomeScreen;
