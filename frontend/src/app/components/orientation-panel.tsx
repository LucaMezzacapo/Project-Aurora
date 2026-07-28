interface OrientationPanelProps {
  pitch: number | null;
  roll: number | null;
  yaw: number | null;
  live: boolean;
}

export function OrientationPanel({ pitch, roll, yaw, live }: OrientationPanelProps) {
  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">
          <span style={{ color: '#fb923c' }}>✈</span>
          Advanced Orientation
        </span>
        <span className="panel-badge">
          <span className={`dot ${live ? 'dot-orange' : 'dot-dim'}`}></span>
          {live ? 'IMU Active' : 'IMU Offline'}
        </span>
      </div>

      <div className="orient-grid">
        {/* Pitch */}
        <div className="orient-box">
          <div className="orient-label">Pitch</div>
          <div className="orient-bar-container">
            <div className="orient-center-ref" />
            <div
              className="orient-horizon pitch-line"
              style={{ top: `${50 - ((pitch ?? 0) / 60) * 100}%` }}
            />
            <span style={{ position: 'absolute', top: 2, left: 4, fontSize: 9, color: 'var(--text-dim)' }}>+30°</span>
            <span style={{ position: 'absolute', bottom: 2, left: 4, fontSize: 9, color: 'var(--text-dim)' }}>-30°</span>
          </div>
          <div className="orient-value">{pitch == null ? '—' : `${pitch.toFixed(1)}°`}</div>
        </div>

        {/* Roll */}
        <div className="orient-box">
          <div className="orient-label">Roll</div>
          <div className="orient-bar-container">
            <div className="orient-center-ref" />
            <div
              className="orient-horizon roll-line"
              style={{ transform: `rotate(${roll ?? 0}deg)` }}
            />
            <span style={{ position: 'absolute', top: 2, left: 4, fontSize: 9, color: 'var(--text-dim)' }}>L 30°</span>
            <span style={{ position: 'absolute', top: 2, right: 4, fontSize: 9, color: 'var(--text-dim)' }}>R 30°</span>
          </div>
          <div className="orient-value">{roll == null ? '—' : `${roll.toFixed(1)}°`}</div>
        </div>

        {/* Yaw */}
        <div className="orient-box">
          <div className="orient-label">Yaw</div>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0' }}>
            <div className="yaw-circle">
              <div className="yaw-ring" />
              <span className="yaw-deg-label yaw-deg-0">0°</span>
              <span className="yaw-deg-label yaw-deg-180">180°</span>
              <span className="yaw-deg-label yaw-deg-90">90°</span>
              <span className="yaw-deg-label yaw-deg-270">270°</span>
              <div
                className="yaw-indicator-wrap"
                style={{ transform: `rotate(${yaw ?? 0}deg)` }}
              >
                <div className="yaw-bar" />
              </div>
              <div className="yaw-center-dot" />
            </div>
          </div>
          <div className="orient-value">{yaw == null ? '—' : `${yaw.toFixed(1)}°`}</div>
        </div>
      </div>

      {/* Artificial Horizon */}
      <div className="ah-wrap">
        <div className="ah">
          <div
            className="ah-inner"
            style={{
              transform: `translateY(${Math.max(-60, Math.min(60, (pitch ?? 0) * 2))}px) rotate(${roll ?? 0}deg)`,
            }}
          >
            <div className="ah-sky" />
            <div className="ah-ground" />
            <div className="ah-horizon" />
          </div>
          <div className="ah-aircraft">
            <div className="ah-wings">
              <div className="ah-wing" />
              <div className="ah-body" />
              <div className="ah-wing" />
            </div>
          </div>
        </div>
      </div>

      <div className="panel-footer" style={{ textAlign: 'center' }}>
        Real-time orientation data from IMU sensors
      </div>
    </div>
  );
}
