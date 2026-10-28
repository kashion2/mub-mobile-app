import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
  PermissionsAndroid,
  Linking,
  TextInput,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ttsService from '../services/ttsService';
import { getAuth } from '../services/firebase';
import { sendSOSToFirestore } from '../services/sosService';

const MUB_EMERGENCY_NUMBER = '+265999999999';

interface SOSRecord {
  id: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
  status: 'pending';
}

const EmergencySOSScreen: React.FC = () => {
  const [countdown, setCountdown] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [lastSentId, setLastSentId] = useState<string | null>(null);
  const [emergencyContact, setEmergencyContact] = useState('');
  const [adminContacts, setAdminContacts] = useState<Array<{ type: 'sms' | 'email'; value: string }>>([]);

  useEffect(() => {
    let cancelled = false;
    const announce = async () => {
      await new Promise<void>(r => setTimeout(r, 600));
      if (cancelled) return;
      await speakAndWait('Emergency SOS. Say or tap Send to alert MUB administrators with your location.');
    };
    announce();

    // Load emergency contact from storage
    AsyncStorage.getItem('emergency_contact').then((value) => {
      if (value) setEmergencyContact(value);
    });
    
    // Load admin contacts from storage
    AsyncStorage.getItem('admin_contacts').then((contacts) => {
      if (contacts) {
        try {
          setAdminContacts(JSON.parse(contacts));
        } catch (error) {
          console.error('Error parsing admin contacts:', error);
        }
      }
    });

    return () => {
      cancelled = true;
      ttsService.stop();
    };
  }, []);

  const requestLocationPermission = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;
    try {
      const already = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      );
      if (already) return true;

      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: 'Location Permission Needed',
          message:
            'MUB Accessibility needs your location to send SOS to administrators.',
          buttonPositive: 'Allow',
          buttonNegative: 'Deny',
        },
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch {
      return false;
    }
  };

  const startCountdown = () => {
    setCountdown(5);
    let current = 5;
    ttsService.speak(
      'Emergency SOS will be sent in 5 seconds. Tap Cancel to abort.',
    );

    const interval = setInterval(() => {
      current -= 1;
      setCountdown(current);

      if (current > 0) {
        ttsService.speak(`${current}`);
      }

      if (current === 0) {
        clearInterval(interval);
        setCountdown(null);
        triggerSOS();
      }
    }, 1000);
  };

  const cancelCountdown = () => {
    setCountdown(null);
    ttsService.speak('SOS cancelled');
  };

  const triggerSOS = async () => {
    setSending(true);
    ttsService.speak('Sending emergency alert with your location.');

    try {
      const ok = await requestLocationPermission();
      if (!ok) {
        Alert.alert(
          'Location Permission Needed',
          'MUB Accessibility needs location access to send SOS.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Open Settings',
              onPress: () => Linking.openSettings(),
            },
          ],
        );
        ttsService.speak('Location permission needed.');
        setSending(false);
        return;
      }

      const authInstance = getAuth();
      const user = authInstance.currentUser;

      if (!user) {
        Alert.alert('Login Required', 'Please login first to use SOS.');
        ttsService.speak('Please login first.');
        setSending(false);
        return;
      }

      // Save emergency contact if provided
      if (emergencyContact && emergencyContact.trim()) {
        await AsyncStorage.setItem('emergency_contact', emergencyContact.trim());
      }

      // Save admin contacts if provided
      if (adminContacts.length > 0) {
        await AsyncStorage.setItem('admin_contacts', JSON.stringify(adminContacts));
      }

      // ✅ Save to Firestore (admin will see this) with SMS fallback and admin notifications
      const firestoreId = await sendSOSToFirestore(
        user.uid,
        user.displayName || 'MUB Member',
        user.email || 'unknown',
        'Emergency assistance needed',
        emergencyContact || undefined,
        adminContacts.length > 0 ? adminContacts : undefined,
      );

      // Save local reference too
      const localRecord: SOSRecord = {
        id: firestoreId,
        latitude: 0,
        longitude: 0,
        accuracy: 0,
        timestamp: Date.now(),
        status: 'pending',
      };

      const existing = await AsyncStorage.getItem('sos_requests');
      const list: SOSRecord[] = existing ? JSON.parse(existing) : [];
      list.push(localRecord);
      await AsyncStorage.setItem('sos_requests', JSON.stringify(list));

      setLastSentId(firestoreId);

      ttsService.speak(
        'Emergency alert sent to MUB administrators. Help is on the way.',
      );

      const alertMessage = emergencyContact
        ? `Your location has been sent to the MUB admin dashboard and emergency SMS sent to ${emergencyContact}.\n\nReference: ${firestoreId.slice(0, 8)}\n\nYou will be contacted shortly.`
        : `Your location has been sent to the MUB admin dashboard.\n\nReference: ${firestoreId.slice(0, 8)}\n\nYou will be contacted shortly.`;

      Alert.alert('🚨 SOS Sent to MUB Admin', alertMessage);
    } catch (error: any) {
      console.warn('SOS error:', error);
      const message = error?.message || 'Could not send SOS. Please try again.';
      Alert.alert('SOS Failed', message);
      ttsService.speak('Failed to send SOS. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container} importantForAccessibility="no">
      <Text style={styles.title} accessible accessibilityRole="header">
        Emergency SOS
      </Text>

      <Text style={styles.warning} accessible>
        Tap the button below to send your location to MUB administrators
      </Text>

      <View style={styles.contactBox}>
        <Text style={styles.contactLabel} accessible>
          Emergency Contact (Optional):
        </Text>
        <TextInput
          style={styles.contactInput}
          placeholder="+265999999999"
          placeholderTextColor="#999"
          value={emergencyContact}
          onChangeText={setEmergencyContact}
          keyboardType="phone-pad"
          accessible
          accessibilityLabel="Emergency contact phone number"
          accessibilityHint="Enter phone number to receive SMS alert along with Firestore notification"
        />
        <Text style={styles.contactHint} accessible>
          SMS will be sent to this number when SOS is triggered
        </Text>
      </View>

      <View style={styles.contactBox}>
        <Text style={styles.contactLabel} accessible>
          Admin Contacts for Off-Hours Alerts (Optional):
        </Text>
        <Text style={styles.contactHint} accessible>
          Add admin contacts to receive SMS/Email alerts when desktop dashboard is closed
        </Text>
        <TouchableOpacity
          style={styles.addContactButton}
          onPress={() => {
            // For simplicity, add a default admin contact
            const newContact = { type: 'sms' as const, value: '+265888888888' };
            setAdminContacts([...adminContacts, newContact]);
          }}
          accessible
          accessibilityRole="button"
          accessibilityLabel="Add admin contact"
        >
          <Text style={styles.addContactButtonText}>+ Add Admin Contact</Text>
        </TouchableOpacity>
        {adminContacts.length > 0 && (
          <View style={styles.contactsList}>
            {adminContacts.map((contact, index) => (
              <View key={index} style={styles.contactItem}>
                <Text style={styles.contactItemText}>
                  {contact.type.toUpperCase()}: {contact.value}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    const updated = adminContacts.filter((_, i) => i !== index);
                    setAdminContacts(updated);
                  }}
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${contact.type} contact`}
                >
                  <Text style={styles.removeContactText}>Remove</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </View>

      {countdown !== null ? (
        <View style={styles.countdownBox}>
          <Text style={styles.countdownText} accessible>
            Sending in {countdown}...
          </Text>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={cancelCountdown}
            accessible
            accessibilityRole="button"
            accessibilityLabel="Cancel SOS"
          >
            <Text style={styles.cancelText}>CANCEL</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.sosButton, sending && styles.sosButtonDisabled]}
          onPress={startCountdown}
          disabled={sending}
          accessible
          accessibilityRole="button"
          accessibilityLabel="Send emergency SOS"
          accessibilityHint="Sends your location to MUB administrators with a 5-second countdown"
        >
          {sending ? (
            <ActivityIndicator size="large" color="#FFFFFF" />
          ) : (
            <Text style={styles.sosText}>SOS</Text>
          )}
        </TouchableOpacity>
      )}

      {lastSentId && (
        <View style={styles.successBox}>
          <Text style={styles.successTitle} accessible>
            ✅ Last Alert Sent to Admin
          </Text>
          <Text style={styles.successText} accessible>
            Reference: {lastSentId.slice(0, 8)}
          </Text>
        </View>
      )}

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle} accessible accessibilityRole="header">
          What Happens When You Press SOS:
        </Text>
        <Text style={styles.infoText} accessible>
          1. A 5-second countdown gives you time to cancel
        </Text>
        <Text style={styles.infoText} accessible>
          2. Your current GPS location is captured
        </Text>
        <Text style={styles.infoText} accessible>
          3. Alert is sent to MUB admin dashboard (Firestore)
        </Text>
        <Text style={styles.infoText} accessible>
          4. SMS sent to emergency contact (if provided)
        </Text>
        <Text style={styles.infoText} accessible>
          5. MUB emergency contact: {MUB_EMERGENCY_NUMBER}
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#0A2540',
    marginBottom: 10,
  },
  warning: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 10,
  },
  contactBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 30,
    width: '100%',
    elevation: 2,
  },
  contactLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0A2540',
    marginBottom: 10,
  },
  contactInput: {
    width: '100%',
    height: 50,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    paddingHorizontal: 15,
    fontSize: 16,
    color: '#333',
    borderWidth: 1,
    borderColor: '#DDD',
  },
  contactHint: {
    fontSize: 13,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
  addContactButton: {
    backgroundColor: '#0A2540',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  addContactButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  contactsList: {
    marginTop: 15,
  },
  contactItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  contactItemText: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  removeContactText: {
    fontSize: 14,
    color: '#C1121F',
    fontWeight: 'bold',
  },
  sosButton: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#C1121F',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 10,
    marginBottom: 30,
  },
  sosButtonDisabled: { backgroundColor: '#7A0E15' },
  sosText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: 4,
  },
  countdownBox: {
    backgroundColor: '#C1121F',
    borderRadius: 20,
    padding: 30,
    alignItems: 'center',
    marginBottom: 30,
  },
  countdownText: {
    fontSize: 32,
    color: '#FFFFFF',
    fontWeight: 'bold',
    marginBottom: 20,
  },
  cancelButton: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 40,
    paddingVertical: 15,
    borderRadius: 10,
  },
  cancelText: { color: '#C1121F', fontSize: 20, fontWeight: 'bold' },
  successBox: {
    backgroundColor: '#D4EDDA',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    width: '100%',
    borderLeftWidth: 6,
    borderLeftColor: '#28A745',
  },
  successTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#155724',
    marginBottom: 5,
  },
  successText: { fontSize: 14, color: '#155724' },
  infoBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    elevation: 2,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0A2540',
    marginBottom: 15,
  },
  infoText: {
    fontSize: 15,
    color: '#333',
    marginBottom: 10,
    lineHeight: 22,
  },
});

export default EmergencySOSScreen;