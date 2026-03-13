import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ScreenList } from '@/components/app-ui';
import { lightTheme } from '@/constants/theme';

const mockTheme = lightTheme;

jest.mock('@/lib/theme/theme-context', () => ({
  useAppTheme: () => ({
    theme: mockTheme,
    isDarkMode: false,
  }),
}));

describe('ScreenList', () => {
  it('renders header and empty state for empty datasets', () => {
    render(
      <ScreenList
        data={[] as Array<{ id: number; label: string }>}
        emptyDescription="Nothing is stored locally yet."
        emptyTitle="No records"
        header={<Text>Header block</Text>}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => <Text>{item.label}</Text>}
      />
    );

    expect(screen.getByText('Header block')).toBeTruthy();
    expect(screen.getByText('No records')).toBeTruthy();
    expect(screen.getByText('Nothing is stored locally yet.')).toBeTruthy();
  });
});