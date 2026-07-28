interface MetricCardProps {
  label: string;
  value: string;
  unit: string;
  trend?: 'up' | 'down';
  status?: 'good' | 'warning' | 'critical';
}

export function MetricCard({ label, value, unit, trend, status = 'good' }: MetricCardProps) {
  return (
    <div className={`metric-card ${status}`}>
      {(status === 'warning' || status === 'critical') && (
        <span className="metric-alert">⚠</span>
      )}
      <div className="metric-label">{label}</div>
      <div className="metric-value-row">
        <span className="metric-value">{value}</span>
        <span className="metric-unit">{unit}</span>
        {trend && (
          <span className={`metric-trend ${trend}`}>
            {trend === 'up' ? '↑' : '↓'}
          </span>
        )}
      </div>
    </div>
  );
}
