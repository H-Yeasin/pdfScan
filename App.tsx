import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CaptureScreen } from './src/screens/CaptureScreen';

export default function App() {
  return (
    <SafeAreaProvider>
      <CaptureScreen />
    </SafeAreaProvider>
  );
}
