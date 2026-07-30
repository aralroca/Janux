/** @jsxImportSource react */
import { CartesianGrid, Legend, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';

export interface Point {
  month: string;
  revenue: number;
  users: number;
}

export interface RevenueChartProps {
  points: Point[];
  hidden: string[];
  selected: number;
  onPointClick?: (data: unknown, index: number, event: unknown) => void;
  onLegendClick?: (entry: { dataKey?: unknown }) => void;
}

const SERIES = [
  { key: 'revenue', color: '#7c3aed' },
  { key: 'users', color: '#0ea5e9' },
];

/**
 * A plain Recharts chart. Fixed pixel dimensions rather than
 * `<ResponsiveContainer width="100%">`: a percentage container has to measure
 * the DOM, which the server does not have — with numbers the whole SVG renders
 * server-side.
 */
export function RevenueChart({ points, hidden, selected, onPointClick, onLegendClick }: RevenueChartProps) {
  return (
    <LineChart width={520} height={260} data={points} className="revenue-chart">
      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
      <XAxis dataKey="month" />
      <YAxis />
      <Tooltip />
      <Legend onClick={onLegendClick} />
      {SERIES.map((series) => (
        <Line
          key={series.key}
          type="monotone"
          dataKey={series.key}
          stroke={series.color}
          hide={hidden.includes(series.key)}
          // Off on purpose: an animating chart has no stable DOM to click, and
          // the point of this example is that the click lands as an intent.
          isAnimationActive={false}
          onClick={onPointClick}
          activeDot={{ r: 6 }}
          dot={{ r: selected >= 0 ? 4 : 3 }}
        />
      ))}
    </LineChart>
  );
}
