import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  startListening(languageCode: string): Promise<string>;
  stopListening(): void;
  cancel(): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('VoiceRecognizer');