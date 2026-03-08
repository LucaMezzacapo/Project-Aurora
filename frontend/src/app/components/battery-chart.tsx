import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface BatteryChartProps {
  data: Array<{ time: string; voltage: number; current: number }>;
}

export function BatteryChart({ data }: BatteryChartProps) {
  return (
    <div className="chart-panel">
      <div className="panel-header">
        <span className="panel-title">
          <span style={{ color: 'var(--accent-green)' }}>⚡</span>
          Battery Monitoring
        </span>
        <span className="panel-badge">
          <span className="dot dot-green"></span>
          Live Data
        </span>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1d2f4a" />
          <XAxis
            dataKey="time"
            stroke="#3d5472"
            tick={{ fill: '#6b84a8', fontSize: 10, fontFamily: 'JetBrains Mono' }}
          />
          <YAxis
            yAxisId="left"
            stroke="#3d5472"
            tick={{ fill: '#6b84a8', fontSize: 10, fontFamily: 'JetBrains Mono' }}
            label={{ value: 'V', angle: -90, position: 'insideLeft', fill: '#6b84a8', fontSize: 11 }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            stroke="#3d5472"
            tick={{ fill: '#6b84a8', fontSize: 10, fontFamily: 'JetBrains Mono' }}
            label={{ value: 'A', angle: 90, position: 'insideRight', fill: '#6b84a8', fontSize: 11 }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#0d1626',
              border: '1px solid #25405f',
              borderRadius: '8px',
              fontSize: '11px',
              fontFamily: 'JetBrains Mono',
            }}
            labelStyle={{ color: '#e8f0ff' }}
          />
          <Legend
            wrapperStyle={{ fontSize: '11px', color: '#6b84a8' }}
            iconType="line"
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="voltage"
            stroke="#10e88a"
            strokeWidth={2}
            name="Voltage (V)"
            dot={false}
            isAnimationActive={false}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="current"
            stroke="#f59e0b"
            strokeWidth={2}
            name="Current (A)"
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="panel-footer">Voltage and current over time</div>
    </div>
  );
}
