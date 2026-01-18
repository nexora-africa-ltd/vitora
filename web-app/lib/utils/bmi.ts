/**
 * BMI Calculator with Age-Aware Classifications
 *
 * - Under 2 years: BMI not calculated (use weight-for-length charts)
 * - 2-19 years: Use CDC BMI-for-age percentiles
 * - 20+ years: Use standard adult BMI cutoffs
 */

export interface BMIResult {
  bmi: number | null;
  classification: string;
  percentile?: number;
  isAgeAppropriate: boolean;
  message?: string;
}

/**
 * CDC BMI-for-age percentile cutoffs (simplified)
 * In production, you would use the full CDC LMS tables
 * These are approximations based on CDC guidelines
 */
const BMI_PERCENTILE_CUTOFFS = {
  underweight: 5,    // Below 5th percentile
  healthy: 85,       // 5th to 84th percentile
  overweight: 95,    // 85th to 94th percentile
  obese: 100,        // 95th percentile and above
};

/**
 * Simplified BMI-for-age reference values by age and gender
 * These are median (50th percentile) values from CDC growth charts
 * In a production system, you'd use the full LMS tables for precise percentile calculations
 */
const BMI_REFERENCE_BY_AGE: Record<number, { male: { p5: number; p50: number; p85: number; p95: number }; female: { p5: number; p50: number; p85: number; p95: number } }> = {
  2: { male: { p5: 14.7, p50: 16.4, p85: 18.2, p95: 19.4 }, female: { p5: 14.4, p50: 16.0, p85: 17.8, p95: 18.9 } },
  3: { male: { p5: 14.3, p50: 15.8, p85: 17.4, p95: 18.4 }, female: { p5: 14.0, p50: 15.5, p85: 17.2, p95: 18.3 } },
  4: { male: { p5: 14.0, p50: 15.5, p85: 17.0, p95: 17.9 }, female: { p5: 13.7, p50: 15.2, p85: 16.9, p95: 18.0 } },
  5: { male: { p5: 13.8, p50: 15.3, p85: 16.8, p95: 17.9 }, female: { p5: 13.5, p50: 15.0, p85: 16.8, p95: 18.0 } },
  6: { male: { p5: 13.7, p50: 15.3, p85: 17.0, p95: 18.2 }, female: { p5: 13.4, p50: 15.1, p85: 17.0, p95: 18.4 } },
  7: { male: { p5: 13.7, p50: 15.5, p85: 17.4, p95: 18.9 }, female: { p5: 13.4, p50: 15.4, p85: 17.5, p95: 19.1 } },
  8: { male: { p5: 13.8, p50: 15.8, p85: 18.0, p95: 19.7 }, female: { p5: 13.5, p50: 15.8, p85: 18.2, p95: 20.1 } },
  9: { male: { p5: 14.0, p50: 16.2, p85: 18.7, p95: 20.7 }, female: { p5: 13.7, p50: 16.3, p85: 19.1, p95: 21.2 } },
  10: { male: { p5: 14.2, p50: 16.6, p85: 19.5, p95: 21.7 }, female: { p5: 14.0, p50: 16.9, p85: 20.0, p95: 22.4 } },
  11: { male: { p5: 14.5, p50: 17.2, p85: 20.3, p95: 22.8 }, female: { p5: 14.4, p50: 17.6, p85: 21.0, p95: 23.6 } },
  12: { male: { p5: 14.9, p50: 17.8, p85: 21.2, p95: 24.0 }, female: { p5: 14.8, p50: 18.4, p85: 22.0, p95: 24.8 } },
  13: { male: { p5: 15.4, p50: 18.5, p85: 22.1, p95: 25.1 }, female: { p5: 15.3, p50: 19.1, p85: 22.9, p95: 25.8 } },
  14: { male: { p5: 15.9, p50: 19.2, p85: 23.0, p95: 26.2 }, female: { p5: 15.8, p50: 19.8, p85: 23.7, p95: 26.7 } },
  15: { male: { p5: 16.5, p50: 19.9, p85: 23.8, p95: 27.2 }, female: { p5: 16.3, p50: 20.4, p85: 24.3, p95: 27.4 } },
  16: { male: { p5: 17.0, p50: 20.5, p85: 24.5, p95: 28.0 }, female: { p5: 16.7, p50: 20.9, p85: 24.8, p95: 27.9 } },
  17: { male: { p5: 17.5, p50: 21.1, p85: 25.2, p95: 28.8 }, female: { p5: 17.1, p50: 21.3, p85: 25.2, p95: 28.2 } },
  18: { male: { p5: 18.0, p50: 21.7, p85: 25.8, p95: 29.4 }, female: { p5: 17.5, p50: 21.6, p85: 25.5, p95: 28.5 } },
  19: { male: { p5: 18.4, p50: 22.3, p85: 26.4, p95: 30.0 }, female: { p5: 17.8, p50: 21.9, p85: 25.7, p95: 28.7 } },
};

/**
 * Calculate age in years from date of birth
 */
export function calculateAgeInYears(dateOfBirth: string | Date): number {
  const dob = typeof dateOfBirth === 'string' ? new Date(dateOfBirth) : dateOfBirth;
  const today = new Date();

  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }

  return age;
}

/**
 * Calculate age in months (for children under 2)
 */
export function calculateAgeInMonths(dateOfBirth: string | Date): number {
  const dob = typeof dateOfBirth === 'string' ? new Date(dateOfBirth) : dateOfBirth;
  const today = new Date();

  const months = (today.getFullYear() - dob.getFullYear()) * 12 +
                 (today.getMonth() - dob.getMonth());

  return months;
}

/**
 * Estimate BMI percentile for children 2-19 years
 * This is a simplified estimation - production systems should use full CDC LMS tables
 */
function estimateBMIPercentile(bmi: number, age: number, gender: 'M' | 'F' | 'O'): number {
  // Default to male for 'Other' gender
  const genderKey = gender === 'F' ? 'female' : 'male';

  // Clamp age to available range
  const clampedAge = Math.max(2, Math.min(19, Math.floor(age)));

  const reference = BMI_REFERENCE_BY_AGE[clampedAge]?.[genderKey];
  if (!reference) return 50; // Default to 50th percentile if no data

  // Simple linear interpolation between percentile points
  if (bmi < reference.p5) {
    // Below 5th percentile
    return Math.max(1, (bmi / reference.p5) * 5);
  } else if (bmi < reference.p50) {
    // Between 5th and 50th percentile
    return 5 + ((bmi - reference.p5) / (reference.p50 - reference.p5)) * 45;
  } else if (bmi < reference.p85) {
    // Between 50th and 85th percentile
    return 50 + ((bmi - reference.p50) / (reference.p85 - reference.p50)) * 35;
  } else if (bmi < reference.p95) {
    // Between 85th and 95th percentile
    return 85 + ((bmi - reference.p85) / (reference.p95 - reference.p85)) * 10;
  } else {
    // Above 95th percentile
    return Math.min(99, 95 + ((bmi - reference.p95) / reference.p95) * 4);
  }
}

/**
 * Get BMI classification for children based on percentile
 */
function getChildBMIClassification(percentile: number): string {
  if (percentile < BMI_PERCENTILE_CUTOFFS.underweight) {
    return 'Underweight';
  } else if (percentile < BMI_PERCENTILE_CUTOFFS.healthy) {
    return 'Healthy Weight';
  } else if (percentile < BMI_PERCENTILE_CUTOFFS.overweight) {
    return 'Overweight';
  } else {
    return 'Obese';
  }
}

/**
 * Get BMI classification for adults (20+)
 */
function getAdultBMIClassification(bmi: number): string {
  if (bmi < 18.5) return 'Underweight';
  if (bmi < 25) return 'Normal';
  if (bmi < 30) return 'Overweight';
  if (bmi < 35) return 'Obese Class I';
  if (bmi < 40) return 'Obese Class II';
  return 'Obese Class III';
}

/**
 * Main BMI calculation function with age-aware logic
 *
 * @param weight - Weight in kg
 * @param height - Height in cm
 * @param dateOfBirth - Patient's date of birth
 * @param gender - Patient's gender ('M', 'F', or 'O')
 */
export function calculateBMI(
  weight: number | null,
  height: number | null,
  dateOfBirth?: string | Date | null,
  gender?: 'M' | 'F' | 'O'
): BMIResult {
  // Check for valid weight and height
  if (!weight || !height || height <= 0 || weight <= 0) {
    return {
      bmi: null,
      classification: '',
      isAgeAppropriate: true
    };
  }

  // Calculate BMI
  const heightM = height / 100;
  const bmi = weight / (heightM * heightM);
  const roundedBMI = Math.round(bmi * 10) / 10;

  // If no date of birth provided, use adult classification
  if (!dateOfBirth) {
    return {
      bmi: roundedBMI,
      classification: getAdultBMIClassification(bmi),
      isAgeAppropriate: true,
    };
  }

  const ageInYears = calculateAgeInYears(dateOfBirth);
  const ageInMonths = calculateAgeInMonths(dateOfBirth);

  // Under 2 years: BMI not appropriate
  if (ageInYears < 2 || ageInMonths < 24) {
    return {
      bmi: null,
      classification: '',
      isAgeAppropriate: false,
      message: 'BMI is not calculated for children under 2 years. Use weight-for-length charts instead.',
    };
  }

  // 2-19 years: Use BMI-for-age percentiles
  if (ageInYears >= 2 && ageInYears < 20) {
    const percentile = estimateBMIPercentile(bmi, ageInYears, gender || 'M');
    const classification = getChildBMIClassification(percentile);

    return {
      bmi: roundedBMI,
      classification,
      percentile: Math.round(percentile),
      isAgeAppropriate: true,
      message: `${Math.round(percentile)}th percentile for age`,
    };
  }

  // 20+ years: Use adult BMI classification
  return {
    bmi: roundedBMI,
    classification: getAdultBMIClassification(bmi),
    isAgeAppropriate: true,
  };
}

/**
 * Get BMI color class based on classification
 */
export function getBMIColorClass(classification: string): string {
  switch (classification.toLowerCase()) {
    case 'underweight':
      return 'text-amber-600 dark:text-amber-500';
    case 'normal':
    case 'healthy weight':
      return 'text-green-600 dark:text-green-500';
    case 'overweight':
      return 'text-amber-600 dark:text-amber-500';
    case 'obese':
    case 'obese class i':
    case 'obese class ii':
    case 'obese class iii':
      return 'text-red-600 dark:text-red-500';
    default:
      return 'text-muted-foreground';
  }
}
