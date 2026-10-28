import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Geolocation from '@react-native-community/geolocation';
import ttsService from '../services/ttsService';
import { speakAndWait } from '../services/ttsService';
import { Colors } from '../constants/colors';
import { auth, firestore, collection, doc, getDoc, setDoc } from '../services/firebase';
import type { GeolocationResponse } from '@react-native-community/geolocation';

interface WeeklyData {
  day: string;
  minutes: number;
}

const MyActivityScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const [todayDistance, setTodayDistance] = useState(0);
  const [todayMinutes, setTodayMinutes] = useState(0);
  const [weeklyData, setWeeklyData] = useState<WeeklyData[]>([]);
  const [isWalking, setIsWalking] = useState(false);
  const [watchId, setWatchId] = useState<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const lastPositionRef = useRef<{ lat: number; lon: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const announce = async () => {
      await new Promise<void>(r => setTimeout(r, 600));
      if (cancelled) return;
      await speakAndWait('My Activity. Your walking minutes and distance for today and this week.');
    };
    announce();

    loadActivityData();
    
    return () => {
      cancelled = true;
      ttsService.stop();
      if (timerRef.current) clearInterval(timerRef.current);
      if (watchId !== null) {
        Geolocation.clearWatch(watchId);
      }
    };
  }, []);

  const loadActivityData = async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      const today = new Date().toISOString().split('T')[0];
      const docRef = doc(firestore, 'users', currentUser.uid, 'activity', today);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        setTodayDistance(data.distance || 0);
        setTodayMinutes(data.minutes || 0);
      }

      // Load weekly data (last 7 days)
      const weekData: WeeklyData[] = [];
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        const dayDocRef = doc(firestore, 'users', currentUser.uid, 'activity', dateStr);
        const dayDocSnap = await getDoc(dayDocRef);
        
        weekData.push({
          day: days[date.getDay()],
          minutes: dayDocSnap.exists() ? (dayDocSnap.data()?.minutes || 0) : 0,
        });
      }
      setWeeklyData(weekData);
    } catch (e) {
      console.warn('Failed to load activity:', e);
    }
  };

  const startWalk = () => {
    setIsWalking(true);
    startTimeRef.current = Date.now();
    lastPositionRef.current = null;
    ttsService.speak('Walk tracking started. I will record your distance and time.');

    const id = Geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        
        if (lastPositionRef.current) {
          const distance = calculateDistance(
            lastPositionRef.current.lat,
            lastPositionRef.current.lon,
            latitude,
            longitude,
          );
          setTodayDistance(prev => prev + distance);
        }
        
        lastPositionRef.current = { lat: latitude, lon: longitude };
      },
      (error: any) => {
        console.warn('Geolocation error:', error);
      },
      {
        enableHighAccuracy: true,
        distanceFilter: 5,
        timeout: 15000,
        maximumAge: 10000,
      }
    );
    
    setWatchId(id);

    // Announce progress every 60 seconds
    timerRef.current = setInterval(() => {
      const elapsed = startTimeRef.current ? Math.floor((Date.now() - startTimeRef.current) / 60000) : 0;
      const distanceKm = (todayDistance / 1000).toFixed(1);
      ttsService.speak(`You have walked ${distanceKm} kilometers in ${elapsed} minutes.`);
    }, 60000);
  };

  const stopWalk = async () => {
    if (watchId !== null) {
      Geolocation.clearWatch(watchId);
      setWatchId(null);
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const elapsed = startTimeRef.current ? Math.floor((Date.now() - startTimeRef.current) / 60000) : 0;
    const distanceKm = (todayDistance / 1000).toFixed(1);
    
    setIsWalking(false);
    ttsService.speak(`Walk ended. You walked ${distanceKm} kilometers in ${elapsed} minutes. Well done.`);

    // Save to Firestore
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      const today = new Date().toISOString().split('T')[0];
      const docRef = doc(firestore, 'users', currentUser.uid, 'activity', today);
      await setDoc(docRef, {
        distance: todayDistance,
        minutes: elapsed,
        date: today,
      }, { merge: true });

      setTodayMinutes(elapsed);
    } catch (e) {
      console.warn('Failed to save activity:', e);
    }
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  };

  const handleReadActivity = () => {
    const distanceKm = (todayDistance / 1000).toFixed(1);
    const message = `Today you walked ${distanceKm} kilometers in ${todayMinutes} minutes. This week, you walked ${weeklyData.reduce((sum, day) => sum + day.minutes, 0)} minutes total.`;
    ttsService.speak(message);
  };

  const formatDayMinutes = (minutes: number) => {
    if (minutes === 0) return 'No walk recorded';
    return `${minutes} min`;
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 60 }]}
        importantForAccessibility="no"
      >
        {/* Screen Title */}
        <Text style={styles.screenTitle} accessible accessibilityRole="header">
          My Activity
        </Text>
        <Text style={styles.screenSubtitle} accessible>
          Your walking today and this week
        </Text>

        {/* Read Activity Button - MOVED TO TOP */}
        <TouchableOpacity
          style={styles.readButton}
          onPress={handleReadActivity}
          accessible
          accessibilityRole="button"
          accessibilityLabel="Read my activity"
          accessibilityHint="Double tap to hear a summary of your walking activity."
          activeOpacity={0.85}
        >
          <Text style={styles.readButtonText}>🎤 Read my activity</Text>
        </TouchableOpacity>

        {/* Walk Toggle Button */}
        <TouchableOpacity
          style={[styles.walkButton, isWalking && styles.walkButtonActive]}
          onPress={isWalking ? stopWalk : startWalk}
          accessible
          accessibilityRole="button"
          accessibilityLabel={isWalking ? 'Stop walk' : 'Start walk'}
          accessibilityHint={isWalking ? 'Double tap to stop tracking your walk' : 'Double tap to start tracking your walk'}
          activeOpacity={0.85}
        >
          <Text style={styles.walkButtonText}>
            {isWalking ? '⏹️ Stop Walk' : '🚶 Start Walk'}
          </Text>
        </TouchableOpacity>

        {/* Today Card */}
        <View style={styles.card} importantForAccessibility="no-hide-descendants">
          <Text style={styles.cardTitle} accessible accessibilityRole="header">
            Today's Walk
          </Text>
          <View style={styles.todayContainer}>
            <Text style={styles.todayNumber} accessible accessibilityRole="text" accessibilityLabel={`${(todayDistance / 1000).toFixed(1)} kilometers`}>
              {(todayDistance / 1000).toFixed(1)}
            </Text>
            <Text style={styles.todayUnit} accessible accessibilityRole="text">
              kilometers
            </Text>
          </View>
          <Text style={styles.todayTime} accessible accessibilityRole="text" accessibilityLabel={`${todayMinutes} minutes`}>
            {todayMinutes} minutes
          </Text>
        </View>

        {/* This Week Card */}
        <View style={styles.card} importantForAccessibility="no-hide-descendants">
          <Text style={styles.cardTitle} accessible accessibilityRole="header">
            This Week
          </Text>
          {weeklyData.map((item, index) => (
            <View
              key={index}
              style={styles.weekRow}
              accessible
              accessibilityRole="text"
              accessibilityLabel={`${item.day}, ${formatDayMinutes(item.minutes)}`}
            >
              <Text style={styles.weekDay}>{item.day}</Text>
              <Text style={styles.weekMinutes}>{formatDayMinutes(item.minutes)}</Text>
            </View>
          ))}
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

  scrollView: {
    flex: 1,
  },

  scrollContent: {
    padding: 20,
  },

  // Screen Title
  screenTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.textWhite,
    marginBottom: 5,
  },
  screenSubtitle: {
    fontSize: 15,
    color: Colors.textMuted,
    marginBottom: 20,
  },

  // Read Button
  readButton: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 15,
    minHeight: 60,
    elevation: 3,
  },
  readButtonText: {
    color: Colors.textPrimary,
    fontSize: 20,
    fontWeight: 'bold',
  },

  // Walk Button
  walkButton: {
    backgroundColor: '#2E7D32',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
    minHeight: 60,
    elevation: 3,
  },
  walkButtonActive: {
    backgroundColor: '#D32F2F',
  },
  walkButtonText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
  },

  // Cards
  card: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 20,
    marginBottom: 14,
    elevation: 3,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 15,
  },

  // Today Card
  todayContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 10,
  },
  todayNumber: {
    fontSize: 48,
    fontWeight: 'bold',
    color: Colors.textPrimary,
  },
  todayUnit: {
    fontSize: 18,
    color: Colors.textPrimary,
    marginLeft: 8,
  },
  todayTime: {
    fontSize: 18,
    color: Colors.textMuted,
  },

  // Week Rows
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  weekDay: {
    fontSize: 16,
    color: Colors.textPrimary,
  },
  weekMinutes: {
    fontSize: 16,
    color: Colors.textPrimary,
    fontWeight: 'bold',
  },
});

export default MyActivityScreen;
