import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface AltitudeChartProps {
  data: Array<{ time: string; altitude: number | null }>;
  live: boolean;
}

export function AltitudeChart({ data, live }: AltitudeChartProps) {
  return (
    <div className="chart-panel">
      <div className="panel-header">
        <span className="panel-title">
          <span style={{ color: 'var(--accent-cyan)' }}>📈</span>
          Altitude vs Time
        </span>
        <span className="panel-badge">
          <span className={`dot ${live ? 'dot-cyan' : 'dot-dim'}`}></span>
          {live ? 'Continuously Updating' : 'Stale'}
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
            stroke="#3d5472"
            tick={{ fill: '#6b84a8', fontSize: 10, fontFamily: 'JetBrains Mono' }}
            label={{ value: 'm', angle: -90, position: 'insideLeft', fill: '#6b84a8', fontSize: 11 }}
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
          <Line
            type="monotone"
            dataKey="altitude"
            stroke="#00d4ff"
            strokeWidth={2}
            name="Altitude (m)"
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="panel-footer">Real-time altitude tracking</div>
    </div>
  );
}
