import * as Keychain from 'react-native-keychain';

const BIOMETRIC_SERVICE = 'mub_auth';

export interface BiometricCredentials {
  voiceId: string;
  password: string;
}

export const saveCredentialsWithBiometric = async (
  voiceId: string,
  password: string
): Promise<boolean> => {
  try {
    await Keychain.setGenericPassword(
      voiceId,
      password,
      {
        service: BIOMETRIC_SERVICE,
        // NOTE: BIOMETRY_CURRENT_SET invalidates credentials when new biometrics are enrolled on iOS.
        // On Android, this setting behaves like BIOMETRY_ANY due to a platform limitation.
        // New fingerprints added after saving can access the credentials on Android.
        // This is a known limitation of react-native-keychain on Android.
        // For higher security, consider implementing credential expiration or custom native module.
        accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET,
        accessGroup: undefined,
        authenticatePrompt: { title: 'Authenticate to save your login for quick access' },
      }
    );
    return true;
  } catch (error) {
    console.error('[Biometric] Failed to save credentials:', error);
    return false;
  }
};

export const getCredentialsWithBiometric = async (): Promise<BiometricCredentials | null> => {
  try {
    const credentials = await Keychain.getGenericPassword({
      service: BIOMETRIC_SERVICE,
      authenticationPrompt: { title: 'Authenticate to log in' },
    });
    if (credentials) {
      return {
        voiceId: credentials.username,
        password: credentials.password,
      };
    }
    return null;
  } catch (error) {
    console.error('[Biometric] Failed to get credentials:', error);
    return null;
  }
};

export const hasBiometricCredentials = async (): Promise<boolean> => {
  try {
    const credentials = await Keychain.getGenericPassword({ service: BIOMETRIC_SERVICE });
    return credentials !== false;
  } catch {
    return false;
  }
};

export const removeBiometricCredentials = async (): Promise<boolean> => {
  try {
    await Keychain.resetGenericPassword({ service: BIOMETRIC_SERVICE });
    return true;
  } catch (error) {
    console.error('[Biometric] Failed to remove credentials:', error);
    return false;
  }
};

export const isBiometricAvailable = async (): Promise<boolean> => {
  try {
    const biometryType = await Keychain.getSupportedBiometryType();
    return biometryType !== null;
  } catch {
    return false;
  }
};
