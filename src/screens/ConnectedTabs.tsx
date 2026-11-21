// Once connected: the tabs. Home is the robot's map and camera with the buttons; History has the
// past cleans; Robot has the details.

import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';

import { colors } from '../ui/theme';
import { HistoryScreen } from './HistoryScreen';
import { MapScreen } from './MapScreen';
import { RobotScreen } from './RobotScreen';

const Tab = createBottomTabNavigator();

export function ConnectedTabs() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.muted,
          tabBarIconStyle: { display: 'none' },
          tabBarLabelStyle: { fontSize: 15, fontWeight: '600' },
          tabBarLabelPosition: 'beside-icon',
        }}
      >
        <Tab.Screen name="Home" component={MapScreen} />
        <Tab.Screen name="History" component={HistoryScreen} />
        <Tab.Screen name="Robot" component={RobotScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
