'use client';

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from 'recharts';
import type { TooltipProps } from 'recharts';
import type { RevenueData } from '@/lib/types/dashboard';

interface RevenueBreakdownChartProps {
  data: RevenueData[];
  showLegend?: boolean;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

export function RevenueBreakdownChart({ data, showLegend = true }: RevenueBreakdownChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="h-[250px] flex items-center justify-center text-muted-foreground">
        No revenue data available
      </div>
    );
  }

  const formattedData = data.map((item, index) => ({
    ...item,
    color: item.color || COLORS[index % COLORS.length],
  }));

  const formatCurrency: NonNullable<TooltipProps<number, string>['formatter']> = (value) => {
    const numericValue = typeof value === 'number' ? value : Number(value);

    if (!Number.isFinite(numericValue)) return ['N/A', 'Revenue'];
    return [`KES ${numericValue.toLocaleString()}`, 'Revenue'];
  };

  return (
    <div className="h-[250px] w-full min-h-[250px] min-w-0">
      <ResponsiveContainer width="100%" height="100%" minHeight={250}>
        <PieChart>
          <Pie
            data={formattedData}
            cx="50%"
            cy="50%"
            labelLine={false}
            outerRadius={80}
            innerRadius={40}
            fill="#8884d8"
            dataKey="amount"
            nameKey="department"
          >
            {formattedData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip<number, string>
            contentStyle={{
              backgroundColor: 'hsl(var(--popover))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
            }}
            formatter={formatCurrency}
          />
          {showLegend && (
            <Legend
              wrapperStyle={{ fontSize: '12px' }}
              iconType="circle"
              iconSize={8}
              layout="vertical"
              verticalAlign="middle"
              align="right"
            />
          )}
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export default RevenueBreakdownChart;
