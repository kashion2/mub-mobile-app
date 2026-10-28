import React, { useEffect } from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PermissionsAndroid, Platform } from 'react-native';
import type { RootStackParamList } from './src/navigation/types';
import SplashScreen from './src/screens/SplashScreen';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';
import HomeScreen from './src/screens/HomeScreen';
import AnnouncementsScreen from './src/screens/AnnouncementsScreen';
import TTSScreen from './src/screens/TTSScreen';
import VoiceCommandsScreen from './src/screens/VoiceCommandsScreen';
import OCRScannerScreen from './src/screens/OCRScannerScreen';
import EmergencySOSScreen from './src/screens/EmergencySOSScreen';
import GPSScreen from './src/screens/GPSScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import MyActivityScreen from './src/screens/MyActivityScreen';
import { getAuth, onAuthStateChanged } from '@react-native-firebase/auth';

const Stack = createNativeStackNavigator<RootStackParamList>();

export const navigationRef = createNavigationContainerRef<any>();

const featureHeader = {
  headerStyle: { backgroundColor: '#0A2540' },
  headerTintColor: '#FFFFFF',
  headerTitleStyle: { fontWeight: 'bold' as const, color: '#FFFFFF', fontSize: 18 },
  headerShadowVisible: false,
  headerBackButtonDisplayMode: 'minimal' as const,
  headerBackButtonMenuEnabled: false,
  headerBackTitle: 'Back',
  contentStyle: { backgroundColor: '#0A2540' },
};

export default function App() {
  useEffect(() => {
    if (Platform.OS === 'android') {
      PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: 'Location Permission',
          message: 'MUB Accessibility needs your location for SOS and walking tracking.',
          buttonPositive: 'Allow',
          buttonNegative: 'Deny',
        },
      ).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const authInstance = getAuth();
    const unsubscribe = onAuthStateChanged(authInstance, (user) => {
      console.log('[App] Auth state changed - user:', user ? 'SIGNED_IN' : 'SIGNED_OUT');
      console.log('[App] Navigation ref ready:', navigationRef.current?.isReady?.());
      if (user) {
        // User is signed in — navigate to HomeScreen
        console.log('[App] Attempting navigation to HomeScreen');
        if (navigationRef.current?.isReady?.()) {
          console.log('[App] Navigation ref is ready, resetting to HomeScreen');
          navigationRef.current.reset({
            index: 0,
            routes: [{ name: 'HomeScreen' }],
          });
        } else {
          console.log('[App] Navigation ref is NOT ready, cannot navigate');
        }
      } else {
        // User signed out — navigate to LoginScreen
        console.log('[App] Attempting navigation to LoginScreen');
        if (navigationRef.current?.isReady?.()) {
          console.log('[App] Navigation ref is ready, resetting to LoginScreen');
          navigationRef.current.reset({
            index: 0,
            routes: [{ name: 'LoginScreen' }],
          });
        } else {
          console.log('[App] Navigation ref is NOT ready, cannot navigate');
        }
      }
    });

    return unsubscribe;
  }, []);

  return (
    <SafeAreaProvider>
      <NavigationContainer ref={navigationRef}>
        <Stack.Navigator
          initialRouteName="SplashScreen"
          screenOptions={featureHeader}
        >
          <Stack.Screen
            name="SplashScreen"
            component={SplashScreen}
            options={{ headerShown: false, gestureEnabled: false }}
          />
          <Stack.Screen
            name="LoginScreen"
            component={LoginScreen}
            options={{ headerShown: false, gestureEnabled: false }}
          />
          <Stack.Screen
            name="RegisterScreen"
            component={RegisterScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="ForgotPasswordScreen"
            component={ForgotPasswordScreen}
            options={{ title: 'Reset Password' }}
          />
          <Stack.Screen
            name="HomeScreen"
            component={HomeScreen}
            options={{ headerShown: false, gestureEnabled: false }}
          />
          <Stack.Screen
            name="AnnouncementsScreen"
            component={AnnouncementsScreen}
            options={{ title: 'Announcements', headerShown: true }}
          />
          <Stack.Screen
            name="TTSScreen"
            component={TTSScreen}
            options={{ title: 'Text to Speech', headerShown: true }}
          />
          <Stack.Screen
            name="VoiceCommandsScreen"
            component={VoiceCommandsScreen}
            options={{ title: 'Voice Commands', headerShown: true }}
          />
          <Stack.Screen
            name="OCRScannerScreen"
            component={OCRScannerScreen}
            options={{ title: 'OCR Scanner', headerShown: true }}
          />
          <Stack.Screen
            name="EmergencySOSScreen"
            component={EmergencySOSScreen}
            options={{ title: 'Emergency SOS', headerShown: true }}
          />
          <Stack.Screen
            name="GPSScreen"
            component={GPSScreen}
            options={{ title: 'GPS Navigation', headerShown: true }}
          />
          <Stack.Screen
            name="ProfileScreen"
            component={ProfileScreen}
            options={{ title: 'Settings', headerShown: true }}
          />
          <Stack.Screen
            name="MyActivityScreen"
            component={MyActivityScreen}
            options={{ title: 'My Activity', headerShown: true }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}