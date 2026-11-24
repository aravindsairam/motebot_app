// The exploration under way, in the same white strip under the status strip as a clean's: three
// numbers, the floor on the map so far, the places still to look at, and the time spent. Shown
// while the robot's exploration status says it runs: once a copy has come in time, and while the
// robot is still exploring. An old copy is greyed, like everything else that is not current.

import { Text, View } from 'react-native';

import { areaText, clockText } from '../robot/cleaningText';
import { useExploring } from '../robot/exploringStore';
import { RUNNING_EXPLORATION } from '../robot/exploringText';
import { isFresh, useRobot } from '../robot/store';
import { panelStyles as styles } from './CleaningPanel';
import { useNow } from './parts';
import { colors } from './theme';

export function ExploringPanel() {
  const now = useNow(500);
  const status = useExploring((s) => s.status);
  const robotState = useRobot((s) => s.robotState);
  if (status === null || !RUNNING_EXPLORATION.includes(status.value.state)) return null;
  const live = isFresh(status, now);
  const stillExploring = isFresh(robotState, now) && robotState?.value.state === 'exploring';
  if (!live && !stillExploring) return null;

  const s = status.value;
  if (s.state === 'starting') {
    return (
      <View style={styles.panel}>
        <Text style={styles.waiting}>Getting ready to explore…</Text>
      </View>
    );
  }
  const items = [
    { id: 'area', value: areaText(s.mappedArea), label: 'mapped', color: colors.exploreText },
    { id: 'places', value: String(s.placesLeft), label: s.placesLeft === 1 ? 'place left' : 'places left', color: colors.text },
    { id: 'time', value: clockText(s.exploringTime), label: 'time', color: colors.text },
  ];
  return (
    <View style={[styles.panel, !live && styles.old]} accessibilityLabel="Exploring">
      <View style={styles.numbers}>
        {items.map((item) => (
          <View key={item.id} style={styles.item}>
            <Text style={[styles.value, { color: item.color }]} numberOfLines={1}>
              {item.value}
            </Text>
            <Text style={styles.label}>{item.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
