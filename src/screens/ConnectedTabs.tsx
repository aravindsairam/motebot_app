// Once connected: the tabs. Home is the robot's map and camera with the buttons; Ask is a chat
// with the robot; History has the past cleans; Robot has the details.

import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '../ui/icons';
import { colors } from '../ui/theme';
import { AskScreen } from './AskScreen';
import { HistoryScreen } from './HistoryScreen';
import { MapScreen } from './MapScreen';
import { RobotScreen } from './RobotScreen';

const Tab = createBottomTabNavigator();

/** A tab's icon; the open tab's sits on a light teal pill. */
function TabIcon({ name, focused, color }: { name: IconName; focused: boolean; color: string }) {
  return (
    <View style={[styles.pill, focused && styles.pillOn]}>
      <Icon name={name} size={20} color={color} strokeWidth={1.9} />
    </View>
  );
}

const icon = (name: IconName) => ({ focused, color }: { focused: boolean; color: string }) => <TabIcon name={name} focused={focused} color={color} />;

export function ConnectedTabs() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.muted,
          tabBarLabelPosition: 'below-icon',
          // No margin around the label: with four tabs on a 360 wide phone and large text,
          // "History" needs the whole width of its tab.
          tabBarLabelStyle: { fontSize: 12, fontWeight: '700', marginTop: 2 },
          tabBarItemStyle: { paddingHorizontal: 0, paddingTop: 6 },
          tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.line },
        }}
      >
        <Tab.Screen name="Home" component={MapScreen} options={{ tabBarIcon: icon('home') }} />
        {/* The tab bar makes way for the keyboard, so the chat keeps its room. */}
        <Tab.Screen name="Ask" component={AskScreen} options={{ tabBarHideOnKeyboard: true, tabBarIcon: icon('ask') }} />
        <Tab.Screen name="History" component={HistoryScreen} options={{ tabBarIcon: icon('history') }} />
        <Tab.Screen name="Robot" component={RobotScreen} options={{ tabBarIcon: icon('robot') }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  pill: { width: 56, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  pillOn: { backgroundColor: colors.primarySoft },
});
