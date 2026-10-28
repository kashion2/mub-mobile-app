export type RootStackParamList = {
  SplashScreen: undefined;
  LoginScreen: undefined;
  RegisterScreen: undefined;
  ForgotPasswordScreen: undefined;
  HomeScreen: { userName?: string; userEmail?: string };
  AnnouncementsScreen: undefined;
  TTSScreen: undefined;
  VoiceCommandsScreen: undefined;
  OCRScannerScreen: undefined;
  EmergencySOSScreen: undefined;
  GPSScreen: undefined;
  ProfileScreen: undefined;
  MyActivityScreen: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}