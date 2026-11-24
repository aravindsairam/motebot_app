// The main screen: the status strip, the map and the camera (one large, one in the corner; tap
// the corner to swap), the joystick while the phone drives, and the buttons. While a clean runs,
// its numbers under the strip; while the robot explores, the exploration's.

import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useActions } from '../robot/actionsStore';
import { CleaningPanel } from '../ui/CleaningPanel';
import { ExploringPanel } from '../ui/ExploringPanel';
import { RobotActionBar, useRobotActions } from '../ui/RobotActions';
import { Stage } from '../ui/Stage';
import { StatusStrip } from '../ui/StatusStrip';
import { colors } from '../ui/theme';

export function MapScreen() {
  const { controls, cleaning } = useRobotActions();
  const starting = useActions((s) => s.busy === 'clean');
  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right']}>
      <StatusStrip />
      {cleaning.running || starting ? <CleaningPanel starting={starting} /> : <ExploringPanel />}
      <Stage joystick={controls.joystick} />
      <RobotActionBar main />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
});
