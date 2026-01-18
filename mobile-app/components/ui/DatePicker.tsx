/**
 * DatePicker Component
 *
 * Date input with calendar picker modal.
 *
 * @module components/ui/DatePicker
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
} from 'react-native';
import { colors } from '@/constants/colors';

interface DatePickerProps {
  /** Label text */
  label?: string;
  /** Current date value (YYYY-MM-DD format) */
  value: string;
  /** Called when date changes */
  onChange: (date: string) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Error message */
  error?: string;
  /** Minimum date (YYYY-MM-DD) */
  minDate?: string;
  /** Maximum date (YYYY-MM-DD) */
  maxDate?: string;
  /** Test ID */
  testID?: string;
}

interface CalendarDay {
  date: number;
  month: number;
  year: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  isDisabled: boolean;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function DatePicker({
  label,
  value,
  onChange,
  placeholder = 'YYYY-MM-DD',
  error,
  minDate,
  maxDate,
  testID,
}: DatePickerProps): React.JSX.Element {
  const [modalVisible, setModalVisible] = useState(false);
  const [viewDate, setViewDate] = useState(() => {
    if (value) {
      const [year, month] = value.split('-').map(Number);
      return { year, month: month - 1 };
    }
    const today = new Date();
    return { year: today.getFullYear(), month: today.getMonth() };
  });

  const today = new Date();
  const todayStr = formatDate(today);

  const minDateObj = minDate ? new Date(minDate) : null;
  const maxDateObj = maxDate ? new Date(maxDate) : new Date(); // Default max is today

  function formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function isDateDisabled(year: number, month: number, day: number): boolean {
    const date = new Date(year, month, day);
    if (maxDateObj && date > maxDateObj) return true;
    if (minDateObj && date < minDateObj) return true;
    return false;
  }

  function getCalendarDays(): CalendarDay[] {
    const { year, month } = viewDate;
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const days: CalendarDay[] = [];

    // Previous month days
    for (let i = firstDay - 1; i >= 0; i--) {
      const date = daysInPrevMonth - i;
      const prevMonth = month === 0 ? 11 : month - 1;
      const prevYear = month === 0 ? year - 1 : year;
      days.push({
        date,
        month: prevMonth,
        year: prevYear,
        isCurrentMonth: false,
        isToday: false,
        isSelected: false,
        isDisabled: true,
      });
    }

    // Current month days
    for (let date = 1; date <= daysInMonth; date++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
      days.push({
        date,
        month,
        year,
        isCurrentMonth: true,
        isToday: dateStr === todayStr,
        isSelected: dateStr === value,
        isDisabled: isDateDisabled(year, month, date),
      });
    }

    // Next month days (fill to 42 cells for 6 rows)
    const remaining = 42 - days.length;
    for (let date = 1; date <= remaining; date++) {
      days.push({
        date,
        month: month === 11 ? 0 : month + 1,
        year: month === 11 ? year + 1 : year,
        isCurrentMonth: false,
        isToday: false,
        isSelected: false,
        isDisabled: true,
      });
    }

    return days;
  }

  function handleDayPress(day: CalendarDay) {
    if (day.isDisabled) return;
    const dateStr = `${day.year}-${String(day.month + 1).padStart(2, '0')}-${String(day.date).padStart(2, '0')}`;
    onChange(dateStr);
    setModalVisible(false);
  }

  function goToPrevMonth() {
    setViewDate(prev => ({
      year: prev.month === 0 ? prev.year - 1 : prev.year,
      month: prev.month === 0 ? 11 : prev.month - 1,
    }));
  }

  function goToNextMonth() {
    setViewDate(prev => ({
      year: prev.month === 11 ? prev.year + 1 : prev.year,
      month: prev.month === 11 ? 0 : prev.month + 1,
    }));
  }

  function goToPrevYear() {
    setViewDate(prev => ({ ...prev, year: prev.year - 1 }));
  }

  function goToNextYear() {
    setViewDate(prev => ({ ...prev, year: prev.year + 1 }));
  }

  const calendarDays = getCalendarDays();

  return (
    <View style={styles.container} testID={testID}>
      {label && <Text style={styles.label}>{label}</Text>}

      <View style={styles.inputRow}>
        <TextInput
          style={[styles.input, error && styles.inputError]}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.text.tertiary}
          keyboardType="numbers-and-punctuation"
          testID={`${testID}-input`}
        />
        <TouchableOpacity
          style={styles.calendarButton}
          onPress={() => setModalVisible(true)}
          testID={`${testID}-calendar-button`}
        >
          <Text style={styles.calendarIcon}>📅</Text>
        </TouchableOpacity>
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Date</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Year Navigation */}
            <View style={styles.yearNav}>
              <TouchableOpacity onPress={goToPrevYear} style={styles.navButton}>
                <Text style={styles.navButtonText}>«</Text>
              </TouchableOpacity>
              <Text style={styles.yearText}>{viewDate.year}</Text>
              <TouchableOpacity onPress={goToNextYear} style={styles.navButton}>
                <Text style={styles.navButtonText}>»</Text>
              </TouchableOpacity>
            </View>

            {/* Month Navigation */}
            <View style={styles.monthNav}>
              <TouchableOpacity onPress={goToPrevMonth} style={styles.navButton}>
                <Text style={styles.navButtonText}>‹</Text>
              </TouchableOpacity>
              <Text style={styles.monthText}>{MONTHS[viewDate.month]}</Text>
              <TouchableOpacity onPress={goToNextMonth} style={styles.navButton}>
                <Text style={styles.navButtonText}>›</Text>
              </TouchableOpacity>
            </View>

            {/* Day Headers */}
            <View style={styles.dayHeaders}>
              {DAYS.map(day => (
                <Text key={day} style={styles.dayHeader}>{day}</Text>
              ))}
            </View>

            {/* Calendar Grid */}
            <View style={styles.calendarGrid}>
              {calendarDays.map((day, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.dayCell,
                    day.isToday && styles.todayCell,
                    day.isSelected && styles.selectedCell,
                    day.isDisabled && styles.disabledCell,
                  ]}
                  onPress={() => handleDayPress(day)}
                  disabled={day.isDisabled}
                >
                  <Text
                    style={[
                      styles.dayText,
                      !day.isCurrentMonth && styles.otherMonthText,
                      day.isToday && styles.todayText,
                      day.isSelected && styles.selectedText,
                      day.isDisabled && styles.disabledText,
                    ]}
                  >
                    {day.date}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Quick Actions */}
            <View style={styles.quickActions}>
              <TouchableOpacity
                style={styles.quickButton}
                onPress={() => {
                  onChange(todayStr);
                  setModalVisible(false);
                }}
              >
                <Text style={styles.quickButtonText}>Today</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quickButton}
                onPress={() => {
                  onChange('');
                  setModalVisible(false);
                }}
              >
                <Text style={styles.quickButtonText}>Clear</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.primary,
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: colors.background.secondary,
    borderWidth: 1,
    borderColor: colors.neutral[300],
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text.primary,
  },
  inputError: {
    borderColor: colors.semantic.error,
  },
  calendarButton: {
    marginLeft: 8,
    backgroundColor: colors.primary[500],
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarIcon: {
    fontSize: 20,
  },
  errorText: {
    fontSize: 12,
    color: colors.semantic.error,
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: colors.background.primary,
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 360,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.primary,
  },
  closeButton: {
    fontSize: 24,
    color: colors.text.secondary,
    padding: 4,
  },
  yearNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  yearText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.primary,
  },
  monthNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  monthText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text.primary,
  },
  navButton: {
    padding: 8,
  },
  navButtonText: {
    fontSize: 24,
    color: colors.primary[500],
    fontWeight: '600',
  },
  dayHeaders: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  dayHeader: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  todayCell: {
    backgroundColor: colors.primary[50],
  },
  selectedCell: {
    backgroundColor: colors.primary[500],
  },
  disabledCell: {
    opacity: 0.3,
  },
  dayText: {
    fontSize: 14,
    color: colors.text.primary,
  },
  otherMonthText: {
    color: colors.text.tertiary,
  },
  todayText: {
    color: colors.primary[700],
    fontWeight: '600',
  },
  selectedText: {
    color: colors.white,
    fontWeight: '600',
  },
  disabledText: {
    color: colors.text.tertiary,
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.neutral[200],
  },
  quickButton: {
    paddingVertical: 8,
    paddingHorizontal: 24,
  },
  quickButtonText: {
    fontSize: 14,
    color: colors.primary[500],
    fontWeight: '500',
  },
});

export default DatePicker;
