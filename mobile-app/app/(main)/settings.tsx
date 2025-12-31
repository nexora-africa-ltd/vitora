/**
 * Settings Screen
 *
 * App settings and user preferences.
 *
 * @module app/(main)/settings
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../lib/auth/context';
import { useTheme } from '../../lib/theme/context';
import { colors } from '../../constants/colors';
import { APP_VERSION } from '../../constants/config';

/**
 * Settings screen component
 */
export default function Settings(): React.JSX.Element {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { isDark, toggleTheme, themeColors } = useTheme();

  const [autoSync, setAutoSync] = React.useState(true);

  // Dynamic styles based on theme
  const dynamicStyles = {
    container: { backgroundColor: themeColors.background.primary },
    section: { backgroundColor: themeColors.card, borderColor: themeColors.border },
    sectionTitle: { color: themeColors.text.secondary },
    settingLabel: { color: themeColors.text.primary },
    settingValue: { color: themeColors.text.secondary },
    footerText: { color: themeColors.text.secondary },
  };

  const handleLogout = async () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  const SettingRow = ({
    label,
    value,
    onPress,
  }: {
    label: string;
    value?: string;
    onPress?: () => void;
  }) => (
    <TouchableOpacity
      style={[styles.settingRow, { borderBottomColor: themeColors.border }]}
      onPress={onPress}
      disabled={!onPress}
    >
      <Text style={[styles.settingLabel, dynamicStyles.settingLabel]}>{label}</Text>
      {value && <Text style={[styles.settingValue, dynamicStyles.settingValue]}>{value}</Text>}
    </TouchableOpacity>
  );

  const SettingToggle = ({
    label,
    value,
    onValueChange,
  }: {
    label: string;
    value: boolean;
    onValueChange: (value: boolean) => void;
  }) => (
    <View style={[styles.settingRow, { borderBottomColor: themeColors.border }]}>
      <Text style={[styles.settingLabel, dynamicStyles.settingLabel]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{
          false: colors.neutral[300],
          true: colors.primary[400],
        }}
        thumbColor={value ? colors.primary[600] : colors.neutral[50]}
      />
    </View>
  );

  return (
    <ScrollView style={[styles.container, dynamicStyles.container]}>
      {/* User Section */}
      <View style={[styles.section, dynamicStyles.section]}>
        <Text style={[styles.sectionTitle, dynamicStyles.sectionTitle]}>Account</Text>
        <SettingRow label="Username" value={user?.username || 'Unknown'} />
        <SettingRow label="User ID" value={user?.id?.toString() || '--'} />
      </View>

      {/* Sync Settings */}
      <View style={[styles.section, dynamicStyles.section]}>
        <Text style={[styles.sectionTitle, dynamicStyles.sectionTitle]}>Sync</Text>
        <SettingToggle
          label="Auto-sync when online"
          value={autoSync}
          onValueChange={setAutoSync}
        />
        <SettingRow
          label="Sync Now"
          onPress={() => {
            Alert.alert('Sync', 'Sync functionality coming soon');
          }}
        />
        <SettingRow label="Pending Changes" value="0" />
      </View>

      {/* Appearance */}
      <View style={[styles.section, dynamicStyles.section]}>
        <Text style={[styles.sectionTitle, dynamicStyles.sectionTitle]}>Appearance</Text>
        <SettingToggle
          label="Dark Mode"
          value={isDark}
          onValueChange={toggleTheme}
        />
      </View>

      {/* About */}
      <View style={[styles.section, dynamicStyles.section]}>
        <Text style={[styles.sectionTitle, dynamicStyles.sectionTitle]}>About</Text>
        <SettingRow label="App Version" value={APP_VERSION} />
        <SettingRow label="Build" value="Phase 1 - Mobile Foundation" />
      </View>

      {/* Logout */}
      <View style={[styles.section, dynamicStyles.section]}>
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          testID="settings-logout-button"
        >
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={[styles.footerText, dynamicStyles.footerText]}>Vitora HMIS</Text>
        <Text style={[styles.footerSubtext, dynamicStyles.footerText]}>
          Secure Healthcare for Kenya
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  section: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.tertiary,
    textTransform: 'uppercase',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  settingLabel: {
    fontSize: 16,
    color: colors.text.primary,
  },
  settingValue: {
    fontSize: 16,
    color: colors.text.secondary,
  },
  logoutButton: {
    backgroundColor: colors.semantic.error,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  logoutButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    padding: 24,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  footerSubtext: {
    fontSize: 12,
    color: colors.text.tertiary,
    marginTop: 4,
  },
});
