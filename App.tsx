// The app's root. Until the robot has answered once, the Connect screen; after that the tabs
// (Map, Robot), which stay up through a lost connection (they show the loss and keep reconnecting).

import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useRobot } from './src/robot/store';
import { ConnectedTabs } from './src/screens/ConnectedTabs';
import { ConnectScreen } from './src/screens/ConnectScreen';

export default function App() {
  const everConnected = useRobot((s) => s.everConnected);
  const kind = useRobot((s) => s.connection.kind);
  const showRobot = everConnected && kind !== 'stopped' && kind !== 'incompatible';

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {showRobot ? <ConnectedTabs /> : <ConnectScreen />}
        <StatusBar style="dark" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
