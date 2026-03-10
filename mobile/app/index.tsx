import { Redirect } from 'expo-router';

import { LoadingState, ScreenContainer } from '@/components/app-ui';
import { useAuth } from '@/lib/auth/auth-context';

export default function IndexScreen() {
  const { isHydrating, isAuthenticated } = useAuth();

  if (isHydrating) {
    return (
      <ScreenContainer>
        <LoadingState message="Restoring your Vitora session..." />
      </ScreenContainer>
    );
  }

  if (isAuthenticated) {
    return <Redirect href={'/(tabs)' as never} />;
  }

  return <Redirect href={'/sign-in' as never} />;
}