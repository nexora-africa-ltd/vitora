import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Text } from 'react-native';

import { AppButton, ScreenContainer, SectionCard } from '@/components/app-ui';
import { captureAppException } from '@/lib/monitoring/sentry';

type Props = {
  children: ReactNode;
};

type State = {
  errorMessage: string | null;
};

export class AppErrorBoundary extends Component<Props, State> {
  state: State = {
    errorMessage: null,
  };

  static getDerivedStateFromError(error: Error): State {
    return {
      errorMessage: error.message || 'Unexpected mobile application error.',
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    captureAppException(error, { componentStack: errorInfo.componentStack });
  }

  private handleReset = () => {
    this.setState({ errorMessage: null });
  };

  render() {
    if (!this.state.errorMessage) {
      return this.props.children;
    }

    return (
      <ScreenContainer>
        <SectionCard
          title="Something went wrong"
          subtitle="The error was captured for diagnostics when Sentry is configured for this build."
        >
          <Text>{this.state.errorMessage}</Text>
          <AppButton label="Try again" onPress={this.handleReset} />
        </SectionCard>
      </ScreenContainer>
    );
  }
}
