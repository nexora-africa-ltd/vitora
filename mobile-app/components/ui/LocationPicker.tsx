/**
 * LocationPicker Component
 *
 * Cascading dropdown for Kenya location hierarchy:
 * County → Sub-County → Ward (optional)
 *
 * @module components/ui/LocationPicker
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { colors } from '@/constants/colors';
import { locationsApi, County, SubCounty } from '@/lib/api/locations';

interface LocationPickerProps {
  /** Selected county ID */
  countyId: number | null;
  /** Selected sub-county ID */
  subCountyId: number | null;
  /** Called when county changes */
  onCountyChange: (countyId: number | null, countyName: string) => void;
  /** Called when sub-county changes */
  onSubCountyChange: (subCountyId: number | null, subCountyName: string) => void;
  /** County error message */
  countyError?: string;
  /** Sub-county error message */
  subCountyError?: string;
  /** Test ID prefix */
  testID?: string;
}

interface PickerModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  items: Array<{ id: number; name: string }>;
  onSelect: (item: { id: number; name: string }) => void;
  loading?: boolean;
  searchPlaceholder?: string;
}

function PickerModal({
  visible,
  onClose,
  title,
  items,
  onSelect,
  loading,
  searchPlaceholder = 'Search...',
}: PickerModalProps): React.JSX.Element {
  const [search, setSearch] = useState('');

  const filteredItems = items.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={modalStyles.overlay}>
        <View style={modalStyles.container}>
          <View style={modalStyles.header}>
            <Text style={modalStyles.title}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={modalStyles.closeButton}>
              <Text style={modalStyles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <TextInput
            style={modalStyles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder={searchPlaceholder}
            placeholderTextColor={colors.text.tertiary}
          />

          {loading ? (
            <View style={modalStyles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary[500]} />
            </View>
          ) : (
            <FlatList
              data={filteredItems}
              keyExtractor={(item) => item.id.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={modalStyles.item}
                  onPress={() => {
                    onSelect(item);
                    onClose();
                    setSearch('');
                  }}
                >
                  <Text style={modalStyles.itemText}>{item.name}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={modalStyles.emptyText}>No items found</Text>
              }
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

export function LocationPicker({
  countyId,
  subCountyId,
  onCountyChange,
  onSubCountyChange,
  countyError,
  subCountyError,
  testID,
}: LocationPickerProps): React.JSX.Element {
  const [counties, setCounties] = useState<County[]>([]);
  const [subCounties, setSubCounties] = useState<SubCounty[]>([]);
  const [loadingCounties, setLoadingCounties] = useState(true);
  const [loadingSubCounties, setLoadingSubCounties] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [countyModalVisible, setCountyModalVisible] = useState(false);
  const [subCountyModalVisible, setSubCountyModalVisible] = useState(false);
  const [selectedCountyName, setSelectedCountyName] = useState('');
  const [selectedSubCountyName, setSelectedSubCountyName] = useState('');

  // Load counties on mount
  useEffect(() => {
    const loadCounties = async () => {
      setLoadingCounties(true);
      setLoadError(null);
      try {
        const data = await locationsApi.getCounties();
        setCounties(data);
        // If county already selected, find name
        if (countyId) {
          const county = data.find((c) => c.id === countyId);
          if (county) setSelectedCountyName(county.name);
        }
      } catch (error: unknown) {
        console.error('Failed to load counties:', error);
        const errMsg = error instanceof Error ? error.message : 'Failed to load counties';
        setLoadError(errMsg);
      } finally {
        setLoadingCounties(false);
      }
    };
    loadCounties();
  }, []);

  // Load sub-counties when county changes
  useEffect(() => {
    if (!countyId) {
      setSubCounties([]);
      return;
    }

    const loadSubCounties = async () => {
      setLoadingSubCounties(true);
      try {
        const data = await locationsApi.getSubCounties(countyId);
        setSubCounties(data);
        // If sub-county already selected, find name
        if (subCountyId) {
          const subCounty = data.find((sc) => sc.id === subCountyId);
          if (subCounty) setSelectedSubCountyName(subCounty.name);
        }
      } catch (error) {
        console.error('Failed to load sub-counties:', error);
      } finally {
        setLoadingSubCounties(false);
      }
    };
    loadSubCounties();
  }, [countyId]);

  const handleCountySelect = (item: { id: number; name: string }) => {
    setSelectedCountyName(item.name);
    setSelectedSubCountyName('');
    onCountyChange(item.id, item.name);
    onSubCountyChange(null, ''); // Reset sub-county when county changes
  };

  const handleSubCountySelect = (item: { id: number; name: string }) => {
    setSelectedSubCountyName(item.name);
    onSubCountyChange(item.id, item.name);
  };

  return (
    <View style={styles.container} testID={testID}>
      {/* Error Banner */}
      {loadError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>⚠️ {loadError}</Text>
          <TouchableOpacity
            onPress={() => {
              setLoadError(null);
              setLoadingCounties(true);
              locationsApi.getCounties(true).then(setCounties).catch(() => {
                setLoadError('Failed to load counties. Check your connection.');
              }).finally(() => setLoadingCounties(false));
            }}
          >
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* County Picker */}
      <View style={styles.fieldContainer}>
        <Text style={styles.label}>County *</Text>
        <TouchableOpacity
          style={[styles.pickerButton, countyError && styles.pickerButtonError]}
          onPress={() => setCountyModalVisible(true)}
          testID={`${testID}-county-picker`}
          disabled={loadingCounties}
        >
          {loadingCounties ? (
            <Text style={styles.placeholderText}>Loading counties...</Text>
          ) : (
            <Text
              style={[
                styles.pickerButtonText,
                !selectedCountyName && styles.placeholderText,
              ]}
            >
              {selectedCountyName || 'Select County'}
            </Text>
          )}
          <Text style={styles.chevron}>▼</Text>
        </TouchableOpacity>
        {countyError && <Text style={styles.errorText}>{countyError}</Text>}
      </View>

      {/* Sub-County Picker */}
      <View style={styles.fieldContainer}>
        <Text style={styles.label}>Sub-County *</Text>
        <TouchableOpacity
          style={[
            styles.pickerButton,
            subCountyError && styles.pickerButtonError,
            !countyId && styles.pickerButtonDisabled,
          ]}
          onPress={() => countyId && setSubCountyModalVisible(true)}
          disabled={!countyId}
          testID={`${testID}-subcounty-picker`}
        >
          <Text
            style={[
              styles.pickerButtonText,
              !selectedSubCountyName && styles.placeholderText,
              !countyId && styles.disabledText,
            ]}
          >
            {selectedSubCountyName || (countyId ? 'Select Sub-County' : 'Select county first')}
          </Text>
          <Text style={styles.chevron}>▼</Text>
        </TouchableOpacity>
        {subCountyError && <Text style={styles.errorText}>{subCountyError}</Text>}
      </View>

      {/* County Modal */}
      <PickerModal
        visible={countyModalVisible}
        onClose={() => setCountyModalVisible(false)}
        title="Select County"
        items={counties}
        onSelect={handleCountySelect}
        loading={loadingCounties}
        searchPlaceholder="Search county..."
      />

      {/* Sub-County Modal */}
      <PickerModal
        visible={subCountyModalVisible}
        onClose={() => setSubCountyModalVisible(false)}
        title="Select Sub-County"
        items={subCounties}
        onSelect={handleSubCountySelect}
        loading={loadingSubCounties}
        searchPlaceholder="Search sub-county..."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 8,
  },
  fieldContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.primary,
    marginBottom: 6,
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background.secondary,
    borderWidth: 1,
    borderColor: colors.neutral[300],
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  pickerButtonError: {
    borderColor: colors.semantic.error,
  },
  pickerButtonDisabled: {
    backgroundColor: colors.neutral[100],
    borderColor: colors.neutral[200],
  },
  pickerButtonText: {
    fontSize: 16,
    color: colors.text.primary,
  },
  placeholderText: {
    color: colors.text.tertiary,
  },
  disabledText: {
    color: colors.text.tertiary,
  },
  chevron: {
    fontSize: 12,
    color: colors.text.secondary,
  },
  errorText: {
    fontSize: 12,
    color: colors.semantic.error,
    marginTop: 4,
  },
  errorBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.semantic.error,
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  errorBannerText: {
    flex: 1,
    color: colors.white,
    fontSize: 14,
  },
  retryText: {
    color: colors.white,
    fontWeight: '600',
    marginLeft: 12,
  },
});

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: colors.background.primary,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[200],
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.primary,
  },
  closeButton: {
    padding: 4,
  },
  closeButtonText: {
    fontSize: 20,
    color: colors.text.secondary,
  },
  searchInput: {
    margin: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.background.secondary,
    borderRadius: 8,
    fontSize: 16,
    color: colors.text.primary,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  item: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[100],
  },
  itemText: {
    fontSize: 16,
    color: colors.text.primary,
  },
  emptyText: {
    textAlign: 'center',
    padding: 20,
    color: colors.text.tertiary,
  },
});

export default LocationPicker;
