interface NavigationPanelProps {
  groundSpeed: number | null;
  heading: number | null;
  live: boolean;
}

export function getCardinalDirection(heading: number | null): string {
  if (heading == null) return '—';
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(heading / 22.5) % 16;
  return directions[index];
}

export function NavigationPanel({ groundSpeed, heading, live }: NavigationPanelProps) {
  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">
          <span style={{ color: 'var(--accent-purple)' }}>🧭</span>
          Navigation
        </span>
        <span className="panel-badge">
          <span className={`dot ${live ? 'dot-purple' : 'dot-dim'}`}></span>
          {live ? 'Active' : 'Inactive'}
        </span>
      </div>

      <div className="nav-grid">
        <div className="nav-box">
          <div className="nav-box-label">Ground Speed</div>
          <div className="nav-box-value">{groundSpeed == null ? '—' : groundSpeed.toFixed(1)}</div>
          <div className="nav-box-unit">m/s</div>
          <div className="speed-bar-bg">
            <div
              className="speed-bar-fill"
              style={{ width: `${Math.min(((groundSpeed ?? 0) / 50) * 100, 100)}%` }}
            />
          </div>
        </div>
        <div className="nav-box">
          <div className="nav-box-label">Heading</div>
          <div className="nav-box-value">{heading == null ? '—' : `${heading.toFixed(0)}°`}</div>
          <div className="nav-box-unit">{getCardinalDirection(heading)}</div>
        </div>
      </div>

      <div className="compass-wrap">
        <div className="compass">
          <div className="compass-ring" />
          <span className="compass-label compass-N">N</span>
          <span className="compass-label compass-E">E</span>
          <span className="compass-label compass-S">S</span>
          <span className="compass-label compass-W">W</span>
          <div
            className="compass-needle-wrap"
            style={{ transform: `rotate(${heading ?? 0}deg)` }}
          >
            <div className="compass-needle">
              <div className="needle-north" />
              <div className="needle-south" />
            </div>
          </div>
          <div className="compass-center" />
        </div>
      </div>

      <div className="panel-footer" style={{ marginTop: '12px', textAlign: 'center' }}>
        Heading compass (0–360°)
      </div>
    </div>
  );
}
