import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import notifee, { AndroidImportance } from '@notifee/react-native';
import ttsService, { speakAndWait } from '../services/ttsService';
import { listenOnce as listenOnceNative, isVoiceAvailable, type VoiceResult } from '../services/voiceService';
import { collection, onSnapshot, orderBy, query, getFirestoreInstance } from '../services/firebase';
import { COLLECTIONS } from '../services/firebase';
import Tts from 'react-native-tts';

interface Announcement {
  id: string;
  title: string;
  date: string;
  content: string;
  priority?: 'normal' | 'urgent';
  author?: string;
  createdAt?: any;
}

const AnnouncementsScreen: React.FC = () => {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentlyReading, setCurrentlyReading] = useState<string | null>(null);
  const processedAnnouncementIdsRef = useRef<Set<string>>(new Set());
  const isInitialLoad = useRef(true);
  const currentIndexRef = useRef(0);
  const cancelledRef = useRef(false);
  const hasStartedRef = useRef(false);

  // Function to show the notification buzz
  const showNotification = async (title: string, body: string) => {
    try {
      // 1. Request permission (Android 13+)
      await notifee.requestPermission();

      // 2. Create a channel (required for Android 8+)
      const channelId = await notifee.createChannel({
        id: 'announcements',
        name: 'MUB Announcements',
        importance: AndroidImportance.HIGH,
        vibration: true,
        sound: 'default',
      });

      // 3. Display the notification
      await notifee.displayNotification({
        title: title,
        body: body,
        android: {
          channelId,
          smallIcon: 'ic_launcher', // Uses your MUB logo
          sound: 'default',
          pressAction: {
            id: 'default',
          },
        },
      });
    } catch (error) {
      console.warn('Notification error:', error);
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

  const readAnnouncement = async (index: number) => {
    const a = announcements[index];
    if (!a) return;
    await speakAndWait(`Announcement ${index + 1} of ${announcements.length}. ${a.title}. ${a.content}`);
  };

  const startAnnouncementLoop = async () => {
    if (announcements.length === 0) {
      await speakAndWait('You have no announcements.');
      return;
    }
    currentIndexRef.current = 0;
    await speakAndWait(`You have ${announcements.length} announcements.`);
    await readAnnouncement(0);
    await speakAndWait('Say next for the next one, previous for the previous one, or done to exit.');

    while (!cancelledRef.current) {
      try { Tts.stop(); } catch (e) {}
      await new Promise<void>(r => setTimeout(r, 500));
      const result = await listenOnceNative();
      if (result.error) {
        console.warn('[Announcements] Recognition error:', result.error.code, result.error.message);
        continue;
      }
      const text = result.text;
      if (!text) continue;
      const t = text.toLowerCase();
      if (t.includes('done') || t.includes('exit') || t.includes('stop')) {
        await speakAndWait('Closing announcements.');
        return;
      }
      if (t.includes('next')) {
        if (currentIndexRef.current < announcements.length - 1) {
          currentIndexRef.current++;
          await readAnnouncement(currentIndexRef.current);
        } else {
          await speakAndWait('That was the last announcement.');
        }
      } else if (t.includes('previous') || t.includes('back')) {
        if (currentIndexRef.current > 0) {
          currentIndexRef.current--;
          await readAnnouncement(currentIndexRef.current);
        } else {
          await speakAndWait('This is the first announcement.');
        }
      } else if (t.includes('repeat') || t.includes('again')) {
        await readAnnouncement(currentIndexRef.current);
      } else {
        await speakAndWait('Say next, previous, repeat, or done.');
      }
    }
  };

  useEffect(() => {
    // Initialize shared TTS service
    ttsService.init();

    // Create the notification channel immediately on load
    notifee.createChannel({
      id: 'announcements',
      name: 'MUB Announcements',
      importance: AndroidImportance.HIGH,
      vibration: true,
      sound: 'default',
    });

    // Real-time Firestore listener for announcements
    const firestore = getFirestoreInstance();
    const announcementsQuery = query(
      collection(firestore, COLLECTIONS.ANNOUNCEMENTS),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(announcementsQuery, (snapshot) => {
      const announcementsList: Announcement[] = [];
      const newAnnouncements: Announcement[] = [];
      
      snapshot.forEach((doc) => {
        const data = doc.data();
        const announcement: Announcement = {
          id: doc.id,
          title: data.title || '',
          date: data.date || '',
          content: data.content || '',
          priority: data.priority || 'normal',
          author: data.author || 'MUB Admin',
          createdAt: data.createdAt,
        };
        announcementsList.push(announcement);
        
        // Check if this is a new announcement
        if (!processedAnnouncementIdsRef.current.has(doc.id)) {
          newAnnouncements.push(announcement);
          // Add to processed list so we don't notify again
          processedAnnouncementIdsRef.current.add(doc.id);
        }
      });
      
      setAnnouncements(announcementsList);
      setLoading(false);

      // Start auto-read on first load
      if (!hasStartedRef.current && announcementsList.length > 0) {
        hasStartedRef.current = true;
        // Small delay to ensure UI is ready
        setTimeout(async () => {
          if (await ensureMicPermission()) {
            startAnnouncementLoop();
          }
        }, 500);
      }

      // If this is the very first load, do not buzz for old announcements
      if (isInitialLoad.current) {
        isInitialLoad.current = false;
        return;
      }

      // Process new announcements for audio alerts and notifications
      if (newAnnouncements.length > 0) {
        newAnnouncements.forEach((announcement) => {
          
          // 1. Show the phone notification buzz
          showNotification(
            announcement.priority === 'urgent' 
              ? '🚨 URGENT MUB Announcement' 
              : '📢 New MUB Announcement',
            announcement.title
          );

          // 2. Trigger audio alert for new announcements
          if (announcement.priority === 'urgent') {
            // Urgent announcements get immediate audio alert
            ttsService.speak('🔔 Urgent announcement!');
            setTimeout(() => {
              ttsService.speak(`New announcement: ${announcement.title}. ${announcement.content}`);
            }, 500);
          } else {
            // Normal announcements get a gentle chime
            ttsService.speak(`🔔 New announcement: ${announcement.title}.`);
          }
        });
      }
    }, (error) => {
      console.error('Error fetching announcements:', error);
      setLoading(false);
    });

    return () => {
      cancelledRef.current = true;
      unsubscribe();
      ttsService.stop();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const announce = async () => {
      await new Promise<void>(r => setTimeout(r, 600));
      if (cancelled) return;
      await speakAndWait('Announcements. Listen to the latest news from MUB.');
    };
    announce();
    return () => { cancelled = true; };
  }, []);

  const handleReadAloud = async (a: Announcement) => {
    if (currentlyReading === a.id) {
      await ttsService.stop();
      setCurrentlyReading(null);
      return;
    }

    // Service handles stop internally — prevents stacking
    setCurrentlyReading(a.id);
    const fullText = `${a.title}. ${a.content}`;
    await ttsService.speak(fullText);
  };

  const handleReadAll = async () => {
    if (currentlyReading === 'all') {
      await ttsService.stop();
      setCurrentlyReading(null);
      return;
    }

    setCurrentlyReading('all');

    const allText = announcements
      .map((a) => `${a.title}. ${a.content}`)
      .join('. End of announcement. ');

    await ttsService.speak(allText);
  };

  if (loading) {
    return (
      <View style={styles.loadingBox}>
        <ActivityIndicator size="large" color="#0A2540" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title} accessible accessibilityRole="header">
        Announcements
      </Text>

      <TouchableOpacity
        style={[styles.readAllButton, currentlyReading === 'all' && styles.stopButton]}
        onPress={handleReadAll}
        accessible
        accessibilityRole="button"
        accessibilityLabel={
          currentlyReading === 'all' ? 'Stop reading all' : 'Read all announcements'
        }
      >
        <Text style={styles.readAllText}>
          {currentlyReading === 'all' ? '⏹️ Stop' : '🔊 Read All Aloud'}
        </Text>
      </TouchableOpacity>

      <ScrollView style={styles.scrollView} importantForAccessibility="no">
        {announcements.map((a) => (
          <View
            key={a.id}
            style={[styles.card, a.priority === 'urgent' && styles.cardUrgent]}
            accessible
          >
            <Text style={styles.cardTitle} accessible accessibilityRole="header">
              {a.title}
            </Text>
            <Text style={styles.cardDate} accessible>
              {a.date}
            </Text>
            <Text style={styles.cardContent} accessible>
              {a.content}
            </Text>
            <TouchableOpacity
              style={[
                styles.readButton,
                currentlyReading === a.id && styles.readButtonActive,
              ]}
              onPress={() => handleReadAloud(a)}
              accessible
              accessibilityRole="button"
              accessibilityLabel={
                currentlyReading === a.id
                  ? `Stop reading ${a.title}`
                  : `Read aloud: ${a.title}`
              }
            >
              <Text style={styles.readButtonText}>
                {currentlyReading === a.id ? '⏹️ Stop' : '🔊 Read Aloud'}
              </Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  loadingBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  loadingText: { marginTop: 15, fontSize: 16, color: '#333' },
  title: { fontSize: 26, fontWeight: 'bold', padding: 20, color: '#0A2540' },
  readAllButton: {
    backgroundColor: '#0A2540',
    marginHorizontal: 20,
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 15,
  },
  stopButton: { backgroundColor: '#C1121F' },
  readAllText: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold' },
  scrollView: { flex: 1, paddingHorizontal: 20, marginBottom: 20 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 15,
    elevation: 2,
  },
  cardUrgent: { borderLeftWidth: 6, borderLeftColor: '#C1121F' },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0A2540',
    marginBottom: 5,
  },
  cardDate: { fontSize: 12, color: '#999', marginBottom: 10 },
  cardContent: {
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
    marginBottom: 15,
  },
  readButton: {
    backgroundColor: '#0A2540',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  readButtonActive: { backgroundColor: '#C1121F' },
  readButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
});

export default AnnouncementsScreen;