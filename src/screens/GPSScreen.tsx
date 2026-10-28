import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Linking,
  Platform,
  PermissionsAndroid,
  ActivityIndicator,
} from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import ttsService from '../services/ttsService';
import { speakAndWait } from '../services/ttsService';

const GPSScreen: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [coords, setCoords] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const announce = async () => {
      await new Promise<void>(r => setTimeout(r, 600));
      if (cancelled) return;
      await speakAndWait('GPS Assistant. Say or tap Read My Location to hear where you are.');
    };
    announce();

    requestLocationPermission().then((ok) => {
      if (ok) {
        fetchLocation();
      } else {
        setError('Location permission denied');
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      ttsService.stop();
    };
  }, []);

  const requestLocationPermission = async (): Promise<boolean> => {
    if (Platform.OS === 'android') {
      try {
        const alreadyGranted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
        if (alreadyGranted) return true;

        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Location Permission',
            message: 'MUB Accessibility needs your location for GPS assistant.',
            buttonPositive: 'Allow',
            buttonNegative: 'Deny',
          }
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } catch {
        return false;
      }
    }
    return true;
  };

  const fetchLocation = () => {
    setLoading(true);
    setError(null);
    Geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setLoading(false);
        ttsService.speak(
          `Location found. Latitude ${pos.coords.latitude.toFixed(4)}. Longitude ${pos.coords.longitude.toFixed(4)}. Accuracy ${Math.round(pos.coords.accuracy)} meters.`,
        );
      },
      (err) => {
        let errorMessage = 'Could not get location';
        if (err.code === 1) {
          errorMessage = 'Location permission denied. Please enable in Settings.';
        } else if (err.code === 2) {
          errorMessage = 'Location services are turned off. Please turn on GPS.';
        } else if (err.code === 3) {
          errorMessage = 'Timed out. Please try again.';
        }
        setError(errorMessage);
        setLoading(false);
        ttsService.speak(errorMessage);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    );
  };

  const readLocation = () => {
    if (!coords) {
      ttsService.speak('Location not available yet. Please wait.');
      return;
    }
    ttsService.speak(
      `Your location. Latitude ${coords.latitude.toFixed(
        4,
      )}. Longitude ${coords.longitude.toFixed(4)}. Accuracy ${Math.round(
        coords.accuracy,
      )} meters.`,
    );
  };

  useEffect(() => {
    let watchId: number | null = null;

    if (coords) {
      watchId = Geolocation.watchPosition(
        (pos) => {
          setCoords({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          });
        },
        (err) => {
          console.warn('Watch position error:', err);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
      );
    }

    return () => {
      if (watchId !== null) {
        Geolocation.clearWatch(watchId);
      }
    };
  }, [coords]);

  const shareLocation = () => {
    if (!coords) {
      ttsService.speak('Location not available yet.');
      return;
    }
    const url = `https://www.google.com/maps?q=${coords.latitude},${coords.longitude}`;
    ttsService.speak('Opening Google Maps with your location.');
    Linking.openURL(url);
  };

  return (
    <ScrollView contentContainerStyle={styles.container} importantForAccessibility="no">
      <Text style={styles.title} accessible accessibilityRole="header">
        GPS Assistant
      </Text>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#0A2540" />
          <Text style={styles.loadingText}>Getting your location...</Text>
        </View>
      ) : error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>⚠️ {error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={fetchLocation}
            accessible
            accessibilityRole="button"
            accessibilityLabel="Try again"
            accessibilityHint="Retry getting your location"
          >
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.locationBox}>
          <Text style={styles.locationLabel}>📍 Your Current Location</Text>
          <Text style={styles.coordText} accessible>
            Latitude: {coords?.latitude.toFixed(6)}
          </Text>
          <Text style={styles.coordText} accessible>
            Longitude: {coords?.longitude.toFixed(6)}
          </Text>
          <Text style={styles.coordText} accessible>
            Accuracy: {Math.round(coords?.accuracy || 0)} m
          </Text>
        </View>
      )}

      <TouchableOpacity
        style={[styles.button, styles.readButton]}
        onPress={readLocation}
        accessible
        accessibilityRole="button"
        accessibilityLabel="Read my location aloud"
      >
        <Text style={styles.buttonText}>🔊 Read My Location</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, styles.shareButton]}
        onPress={shareLocation}
        accessible
        accessibilityRole="button"
        accessibilityLabel="Share location via Google Maps"
      >
        <Text style={styles.buttonText}>📤 Share Location</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, styles.refreshButton]}
        onPress={fetchLocation}
        accessible
        accessibilityRole="button"
        accessibilityLabel="Refresh location"
      >
        <Text style={styles.buttonText}>🔄 Refresh</Text>
      </TouchableOpacity>

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle} accessible accessibilityRole="header">
          About GPS Assistant
        </Text>
        <Text style={styles.infoText} accessible>
          This screen shows your current GPS coordinates. Use "Read My Location"
          to hear them aloud, or "Share Location" to open Google Maps.
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: '#F5F5F5',
    flexGrow: 1,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#0A2540',
  },
  loadingBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 30,
    alignItems: 'center',
    marginBottom: 20,
  },
  loadingText: { marginTop: 15, fontSize: 16, color: '#333' },
  errorBox: {
    backgroundColor: '#FFEBEE',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 15,
    color: '#C1121F',
    marginBottom: 10,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#C1121F',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: { color: '#FFFFFF', fontWeight: 'bold' },
  locationBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    elevation: 2,
  },
  locationLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0A2540',
    marginBottom: 15,
  },
  coordText: {
    fontSize: 16,
    color: '#333',
    marginBottom: 8,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  button: {
    width: '100%',
    minHeight: 60,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  readButton: { backgroundColor: '#0A2540' },
  shareButton: { backgroundColor: '#1E6091' },
  refreshButton: { backgroundColor: '#666' },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  infoBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginTop: 10,
    elevation: 2,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0A2540',
    marginBottom: 10,
  },
  infoText: { fontSize: 14, color: '#333', lineHeight: 20 },
});

export default GPSScreen;