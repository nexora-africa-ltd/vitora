/**
 * Auth Group Layout
 *
 * Layout for authentication screens (login, register, etc.)
 * These screens are only accessible when NOT authenticated.
 *
 * @module app/(auth)/_layout
 */

import React from 'react';
import { Stack } from 'expo-router';
import { colors } from '../../constants/colors';

/**
 * Auth layout component for unauthenticated screens
 */
export default function AuthLayout(): React.JSX.Element {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: {
          backgroundColor: colors.background.primary,
        },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen
        name="login"
        options={{
          title: 'Login',
        }}
      />
    </Stack>
  );
}
