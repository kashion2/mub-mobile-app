import { AccessibilityInfo, Alert } from 'react-native';

export function announce(text: string) {
  AccessibilityInfo.announceForAccessibility(text);
}

export function notifyNotConnected(featureName: string) {
  const message = `${featureName} is not connected yet. This will be added later.`;
  announce(message);
  Alert.alert('Not connected yet', message);
}
