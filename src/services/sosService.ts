import { getFirestoreInstance, collection, addDoc, serverTimestamp, COLLECTIONS } from './firebase';
import Geolocation from '@react-native-community/geolocation';
import { Linking, Platform } from 'react-native';
import * as messaging from '@react-native-firebase/messaging';

export interface SOSRequest {
  userId: string;
  userName: string;
  email: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  status: 'pending' | 'responded' | 'resolved';
  message: string;
  createdAt: any;
}

export const getCurrentLocation = (): Promise<{
  latitude: number;
  longitude: number;
  accuracy: number;
}> => {
  return new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      (error) => reject(error),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    );
  });
};

export const sendEmergencySMS = async (
  phoneNumber: string,
  message: string,
): Promise<void> => {
  try {
    const url = `sms:${phoneNumber}?body=${encodeURIComponent(message)}`;
    const canOpen = await Linking.canOpenURL(url);
    
    if (canOpen) {
      await Linking.openURL(url);
      console.log('[SOS] SMS sent successfully');
    } else {
      console.warn('[SOS] Cannot open SMS app');
    }
  } catch (error) {
    console.error('[SOS] SMS error:', error);
    throw error;
  }
};

export const sendEmergencyEmail = async (
  email: string,
  subject: string,
  body: string,
): Promise<void> => {
  try {
    const url = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    const canOpen = await Linking.canOpenURL(url);
    
    if (canOpen) {
      await Linking.openURL(url);
      console.log('[SOS] Email client opened successfully');
    } else {
      console.warn('[SOS] Cannot open email client');
    }
  } catch (error) {
    console.error('[SOS] Email error:', error);
    throw error;
  }
};

export const sendBulkEmergencyNotifications = async (
  contacts: Array<{ type: 'sms' | 'email'; value: string }>,
  message: string,
  subject?: string,
): Promise<void> => {
  const notifications = contacts.map(async (contact) => {
    if (contact.type === 'sms') {
      await sendEmergencySMS(contact.value, message);
    } else if (contact.type === 'email' && subject) {
      await sendEmergencyEmail(contact.value, subject, message);
    }
  });

  await Promise.allSettled(notifications);
  console.log('[SOS] Bulk notifications sent');
};

export const sendSOSToFirestore = async (
  userId: string,
  userName: string,
  email: string,
  message: string = 'Emergency assistance needed',
  emergencyContact?: string,
  adminContacts?: Array<{ type: 'sms' | 'email'; value: string }>,
): Promise<string> => {
  try {
    const location = await getCurrentLocation();

    const db = getFirestoreInstance();
    const sosData = {
      userId,
      userName,
      email,
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy,
      status: 'pending',
      message,
      createdAt: serverTimestamp(),
    };

    const docRef = await addDoc(collection(db, COLLECTIONS.SOS_REQUESTS), sosData);

    console.log('[SOS] Saved to Firestore. ID:', docRef.id);

    // Send SMS fallback if emergency contact is provided
    if (emergencyContact) {
      const smsMessage = `SOS ALERT: ${userName} (${email}) needs emergency assistance. Location: ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}. Message: ${message}`;
      await sendEmergencySMS(emergencyContact, smsMessage);
    }

    // Send notifications to admin contacts for off-hours alert
    if (adminContacts && adminContacts.length > 0) {
      const notificationMessage = `🚨 URGENT SOS ALERT 🚨\n\nUser: ${userName} (${email})\nLocation: ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}\nMessage: ${message}\n\nReference ID: ${docRef.id}\n\nPlease respond immediately!`;
      await sendBulkEmergencyNotifications(adminContacts, notificationMessage, `URGENT SOS: ${userName}`);
    }

    return docRef.id;
  } catch (error) {
    console.error('[SOS] Firestore error:', error);
    throw error;
  }
};