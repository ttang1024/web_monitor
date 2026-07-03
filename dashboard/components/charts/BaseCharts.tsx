import React from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { MOCK_COLORS } from '../../constants';

interface ChartProps {
  data: any[];
  color?: string;
  theme?: 'light' | 'dark';
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2 rounded shadow-xl text-xs">
        <p className="text-slate-500 dark:text-slate-400 mb-1">{label}</p>
        <p className="text-slate-900 dark:text-white font-mono font-medium">
          {payload[0].value.toLocaleString()}
        </p>
      </div>
    );
  }
  return null;
};

const getChartColors = (theme: 'light' | 'dark' = 'dark') => ({
  grid: theme === 'dark' ? MOCK_COLORS.grid : '#e2e8f0', // slate-200 for light
  axis: theme === 'dark' ? MOCK_COLORS.neutral : '#64748b', // slate-500 for light
});

export const SimpleLineChart: React.FC<ChartProps> = ({ data, color = MOCK_COLORS.primary, theme }) => {
  const colors = getChartColors(theme);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
        <XAxis 
          dataKey="time" 
          stroke={colors.axis} 
          fontSize={10} 
          tickLine={false} 
          axisLine={false} 
          minTickGap={30}
        />
        <YAxis 
          stroke={colors.axis} 
          fontSize={10} 
          tickLine={false} 
          axisLine={false} 
        />
        <Tooltip content={<CustomTooltip />} cursor={{ stroke: colors.axis }} />
        <Line 
          type="monotone" 
          dataKey="value" 
          stroke={color} 
          strokeWidth={2} 
          dot={false} 
          activeDot={{ r: 4, fill: '#fff' }} 
        />
      </LineChart>
    </ResponsiveContainer>
  );
};

export const SparkLineChart: React.FC<ChartProps> = ({ data, color = MOCK_COLORS.primary, theme }) => {
  const colors = getChartColors(theme);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 2, right: 5, left: 5, bottom: 2 }}>
        <Tooltip content={<CustomTooltip />} cursor={{ stroke: colors.axis }} />
        <Line 
          type="monotone" 
          dataKey="value" 
          stroke={color} 
          strokeWidth={2} 
          dot={false} 
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
};

export const SimpleAreaChart: React.FC<ChartProps> = ({ data, color = MOCK_COLORS.primary, theme }) => {
  const colors = getChartColors(theme);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id={`gradient-${color}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
        <XAxis 
          dataKey="time" 
          stroke={colors.axis} 
          fontSize={10} 
          tickLine={false} 
          axisLine={false}
          minTickGap={30}
        />
        <YAxis 
          stroke={colors.axis} 
          fontSize={10} 
          tickLine={false} 
          axisLine={false} 
        />
        <Tooltip content={<CustomTooltip />} cursor={{ stroke: colors.axis }} />
        <Area 
          type="monotone" 
          dataKey="value" 
          stroke={color} 
          fillOpacity={1} 
          fill={`url(#gradient-${color})`} 
        />
      </AreaChart>
    </ResponsiveContainer>
  );
};

export const SimpleBarChart: React.FC<ChartProps> = ({ data, color = MOCK_COLORS.primary, theme }) => {
  const colors = getChartColors(theme);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
         <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} horizontal={false} />
        <XAxis type="number" hide />
        <YAxis 
          dataKey="name" 
          type="category" 
          stroke={colors.axis} 
          fontSize={11} 
          width={80}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip cursor={{fill: theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}} content={<CustomTooltip />} />
        <Bar dataKey="value" fill={color} radius={[0, 4, 4, 0]} barSize={20} />
      </BarChart>
    </ResponsiveContainer>
  );
};

export const SimplePieChart: React.FC<ChartProps> = ({ data }) => {
  const COLORS = [MOCK_COLORS.primary, MOCK_COLORS.secondary, MOCK_COLORS.success, MOCK_COLORS.warning];

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={40}
          outerRadius={70}
          paddingAngle={5}
          dataKey="value"
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="rgba(0,0,0,0)" />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
      </PieChart>
    </ResponsiveContainer>
  );
};