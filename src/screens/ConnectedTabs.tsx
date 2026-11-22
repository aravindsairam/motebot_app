// Once connected: the tabs. Home is the robot's map and camera with the buttons; Ask is a chat
// with the robot; History has the past cleans; Robot has the details.

import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';

import { colors } from '../ui/theme';
import { AskScreen } from './AskScreen';
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
          // No margin after the label: with four tabs on a 360 wide phone and large text, "History"
          // needs the whole width of its tab.
          tabBarLabelStyle: { fontSize: 15, fontWeight: '600', marginEnd: 0 },
          tabBarItemStyle: { paddingHorizontal: 0 },
          tabBarLabelPosition: 'beside-icon',
        }}
      >
        <Tab.Screen name="Home" component={MapScreen} />
        {/* The tab bar makes way for the keyboard, so the chat keeps its room. */}
        <Tab.Screen name="Ask" component={AskScreen} options={{ tabBarHideOnKeyboard: true }} />
        <Tab.Screen name="History" component={HistoryScreen} />
        <Tab.Screen name="Robot" component={RobotScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
