interface GpsPanelProps {
  latitude: number;
  longitude: number;
}

export function GpsPanel({ latitude, longitude }: GpsPanelProps) {
  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">
          <span style={{ color: 'var(--accent-blue)' }}>📍</span>
          GPS Tracking
        </span>
        <span className="panel-badge">
          <span style={{ color: 'var(--accent-green)', fontSize: '12px' }}>🛰</span>
          <span style={{ color: 'var(--accent-green)' }}>Signal Lock</span>
        </span>
      </div>

      <div className="gps-map">
        <div className="gps-grid" />
        <div className="gps-label">Live Position</div>
        <div className="gps-marker">
          <div style={{ position: 'relative' }}>
            <div className="gps-ping" />
            <div className="gps-dot" />
          </div>
        </div>
      </div>

      <div className="gps-coords">
        <div className="coord-box">
          <div className="coord-label">Latitude</div>
          <div className="coord-value">{latitude.toFixed(6)}°</div>
        </div>
        <div className="coord-box">
          <div className="coord-label">Longitude</div>
          <div className="coord-value">{longitude.toFixed(6)}°</div>
        </div>
      </div>

      <div className="panel-footer" style={{ marginTop: '12px' }}>Real-time GPS coordinates</div>
    </div>
  );
}
