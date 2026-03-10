import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';

import { LoadingState, ScreenContainer } from '@/components/app-ui';
import { useAuth } from '@/lib/auth/auth-context';
import { useAppTheme } from '@/lib/theme/theme-context';

export default function TabLayout() {
  const { isAuthenticated, isHydrating } = useAuth();
  const { theme } = useAppTheme();

  if (isHydrating) {
    return (
      <ScreenContainer>
        <LoadingState message="Preparing the mobile workspace..." />
      </ScreenContainer>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href={'/sign-in' as never} />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.mutedText,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          height: 72,
          paddingBottom: 12,
          paddingTop: 10,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '700',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => <Ionicons color={color} name="grid-outline" size={size} />,
        }}
      />
      <Tabs.Screen
        name="patients"
        options={{
          title: 'Patients',
          tabBarIcon: ({ color, size }) => <Ionicons color={color} name="people-outline" size={size} />,
        }}
      />
      <Tabs.Screen
        name="encounters"
        options={{
          title: 'Encounters',
          tabBarIcon: ({ color, size }) => <Ionicons color={color} name="pulse-outline" size={size} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color, size }) => <Ionicons color={color} name="ellipsis-horizontal" size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
