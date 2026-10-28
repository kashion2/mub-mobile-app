import { useEffect } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { announce } from './announce';

export function useScreenAnnouncement(message: string) {
  const isFocused = useIsFocused();

  useEffect(() => {
    if (!isFocused) {
      return;
    }
    const timer = setTimeout(() => announce(message), 400);
    return () => clearTimeout(timer);
  }, [isFocused, message]);
}
