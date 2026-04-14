import {
  aggregateByPeriod,
  calculateMovingAverage,
  calculatePercentageChange,
  calculateSummary,
  fillMissingDates,
  formatChartNumber,
  generateDateLabels,
  generatePieData,
  getColorForValue,
  getTrendDirection,
  normalizeToPercentage,
} from '@/lib/chart-utils';

describe('chart-utils', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-15T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('formats numbers across supported display types', () => {
    expect(formatChartNumber(1234.56, { decimals: 1 })).toBe('1,234.6');
    expect(formatChartNumber(1234, { type: 'currency', decimals: 2 })).toContain('1,234.00');
    expect(formatChartNumber(12.345, { type: 'percent', decimals: 1 })).toBe('12.3%');
    expect(formatChartNumber(1500, { type: 'compact' })).toBeTruthy();
  });

  it('calculates percentage change and trend direction edge cases', () => {
    expect(calculatePercentageChange(10, 0)).toBe(100);
    expect(calculatePercentageChange(0, 0)).toBe(0);
    expect(calculatePercentageChange(80, 100)).toBe(-20);

    expect(getTrendDirection(100.01, 100, 0.1)).toBe('neutral');
    expect(getTrendDirection(120, 100)).toBe('up');
    expect(getTrendDirection(80, 100)).toBe('down');
  });

  it('generates date labels for built-in and custom ranges', () => {
    expect(generateDateLabels('7d')).toHaveLength(7);
    expect(generateDateLabels('30d')).toHaveLength(30);
    expect(generateDateLabels('90d')).toHaveLength(13);
    expect(generateDateLabels('12m')).toHaveLength(12);
    expect(
      generateDateLabels('custom', {
        start: new Date('2026-03-01'),
        end: new Date('2026-03-03'),
        format: 'yyyy-MM-dd',
      })
    ).toEqual(['2026-03-01', '2026-03-02', '2026-03-03']);
    expect(() => generateDateLabels('custom')).toThrow('Custom range requires start and end dates');
  });

  it('aggregates data by day, week, and month with different reducers', () => {
    const data = [
      { date: '2026-03-01', value: 10 },
      { date: '2026-03-01', value: 20 },
      { date: '2026-03-08', value: 5 },
      { date: '2026-04-01', value: 30 },
    ];

    expect(aggregateByPeriod(data, 'date', 'value', 'day', 'sum')).toEqual([
      { period: '2026-03-01', value: 30 },
      { period: '2026-03-08', value: 5 },
      { period: '2026-04-01', value: 30 },
    ]);
    expect(aggregateByPeriod(data, 'date', 'value', 'day', 'average')[0]?.value).toBe(15);
    expect(aggregateByPeriod(data, 'date', 'value', 'day', 'count')[0]?.value).toBe(2);
    expect(aggregateByPeriod(data, 'date', 'value', 'day', 'min')[0]?.value).toBe(10);
    expect(aggregateByPeriod(data, 'date', 'value', 'day', 'max')[0]?.value).toBe(20);
    expect(aggregateByPeriod(data, 'date', 'value', 'week', 'sum')).toHaveLength(3);
    expect(aggregateByPeriod(data, 'date', 'value', 'month', 'sum')).toEqual([
      { period: '2026-03', value: 35 },
      { period: '2026-04', value: 30 },
    ]);
  });

  it('fills missing dates and calculates moving averages', () => {
    const filled = fillMissingDates(
      [{ date: '2026-03-01', count: 2 }, { date: '2026-03-03', count: 4 }],
      'date',
      new Date('2026-03-01'),
      new Date('2026-03-03'),
      { count: 0 }
    );

    expect(filled).toEqual([
      { date: '2026-03-01', count: 2 },
      { count: 0, date: '2026-03-02' },
      { date: '2026-03-03', count: 4 },
    ]);

    expect(calculateMovingAverage([10, 20, 30, 40], 2)).toEqual([10, 15, 25, 35]);
    expect(calculateMovingAverage([10, 20, 30], 0)).toEqual([10, 20, 30]);
    expect(calculateMovingAverage([10, 20], 5)).toEqual([10, 20]);
  });

  it('normalizes percentages, colorizes values, and builds pie data', () => {
    const normalized = normalizeToPercentage(
      [{ male: 30, female: 70 }, { male: 0, female: 0 }],
      ['male', 'female']
    );

    expect(normalized[0]?._total).toBe(100);
    expect((normalized[0] as Record<string, number>).male_pct).toBe(30);
    expect((normalized[1] as Record<string, number>).female_pct).toBe(0);

    expect(getColorForValue(39, { warning: 38, critical: 40 })).toBe('warning');
    expect(getColorForValue(41, { warning: 38, critical: 40 })).toBe('critical');
    expect(getColorForValue(92, { warning: 95, critical: 90 }, { invertScale: true })).toBe('warning');
    expect(getColorForValue(88, { warning: 95, critical: 90 }, { invertScale: true })).toBe('critical');

    expect(generatePieData({ RED: 2, GREEN: 5 }, { RED: 'Critical' })).toEqual([
      { name: 'RED', value: 2, label: 'Critical' },
      { name: 'GREEN', value: 5, label: 'GREEN' },
    ]);
  });

  it('calculates summary statistics including empty and non-empty datasets', () => {
    expect(calculateSummary([])).toEqual({
      count: 0,
      sum: 0,
      mean: 0,
      median: 0,
      min: 0,
      max: 0,
      stdDev: 0,
    });

    const summary = calculateSummary([1, 2, 3, 4]);
    expect(summary.count).toBe(4);
    expect(summary.sum).toBe(10);
    expect(summary.mean).toBe(2.5);
    expect(summary.median).toBe(2.5);
    expect(summary.min).toBe(1);
    expect(summary.max).toBe(4);
    expect(summary.stdDev).toBeGreaterThan(1);
  });
});
