import { Redirect } from 'expo-router';

import { LoadingState, ScreenContainer } from '@/components/app-ui';
import { useAuth } from '@/lib/auth/auth-context';
import { useSessionTimeout } from '@/lib/auth/session-timeout';

export default function IndexScreen() {
  const { isHydrating, isAuthenticated } = useAuth();
  const { isLocked } = useSessionTimeout();

  if (isHydrating) {
    return (
      <ScreenContainer scroll={false}>
        <LoadingState message="Restoring your Vitora session..." fullScreen />
      </ScreenContainer>
    );
  }

  if (isAuthenticated && !isLocked) {
    return <Redirect href={'/(tabs)' as never} />;
  }

  return <Redirect href={'/sign-in' as never} />;
}