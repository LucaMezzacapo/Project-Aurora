import { trafficAlert, trafficLive, type TrafficState, type TrafficStatus } from '../traffic';

const DASH = '—';

const STATUS_LABEL: Record<TrafficStatus, string> = {
  clear: 'Clear',
  near: 'Near',
  inside: 'INSIDE ZONE',
  unknown: 'Unknown',
};

function metres(value: number | null) {
  return value == null ? DASH : `${Math.round(value)} m`;
}

function clock(unixSeconds: number | null) {
  return unixSeconds == null
    ? DASH
    : new Date(unixSeconds * 1000).toLocaleTimeString('en-US', { hour12: false });
}

/** Banner shown above the dashboard while traffic needs the operator's attention. */
export function TrafficAlertBanner({ traffic }: { traffic: TrafficState | null }) {
  const alert = trafficAlert(traffic);
  if (!alert) return null;
  if (alert.kind === 'feed-down') {
    return (
      <div className="traffic-alert traffic-alert-near" role="status">
        Traffic feed offline or stale: other aircraft positions are unknown.
      </div>
    );
  }
  if (alert.kind === 'own-unknown') {
    return (
      <div className="traffic-alert traffic-alert-near" role="status">
        Own position unknown: keep-out check paused until our drone's position updates.
      </div>
    );
  }
  if (alert.kind === 'inside') {
    return (
      <div className="traffic-alert traffic-alert-inside" role="alert">
        Inside keep-out zone of {alert.ids.join(', ')}. Change altitude or turn away now.
      </div>
    );
  }
  return (
    <div className="traffic-alert traffic-alert-near" role="status">
      Traffic nearby: {alert.ids.join(', ')}. Approaching a keep-out zone.
    </div>
  );
}

/** Other aircraft, their separation from us, and the keep-out penalty tally (CONOPS Task 1). */
export function TrafficPanel({ traffic }: { traffic: TrafficState }) {
  const live = trafficLive(traffic);
  const feed = live ? 'LIVE' : traffic.connected ? 'STALE' : 'OFFLINE';
  const feedClass = live ? 'traffic-feed-live' : traffic.connected ? 'traffic-feed-stale' : 'traffic-feed-offline';
  const recent = [...traffic.log].reverse().slice(0, 5);

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">
          <span style={{ color: 'var(--accent-cyan)' }}>✈</span>
          Airspace Traffic
        </span>
        <span className={`panel-badge ${feedClass}`}>{feed}</span>
      </div>

      <div className="traffic-summary">
        <div className="coord-box">
          <div className="coord-label">Keep-out entries</div>
          <div className="coord-value">{traffic.violations}</div>
        </div>
        <div className="coord-box">
          <div className="coord-label">Penalised</div>
          <div className="coord-value">{traffic.penalisedViolations} / 5</div>
        </div>
        <div className="coord-box">
          <div className="coord-label">Keep-out pts lost</div>
          <div className={`coord-value ${traffic.pointsLost > 0 ? 'traffic-text-inside' : ''}`}>
            {traffic.pointsLost > 0 ? `−${traffic.pointsLost}` : '0'} / {traffic.maxPointsLost}
          </div>
        </div>
        <div className="coord-box">
          <div className="coord-label">Last update</div>
          <div className="coord-value">{clock(traffic.receivedAt)}</div>
        </div>
      </div>

      <table className={`traffic-table ${live ? '' : 'traffic-table-stale'}`}>
        <thead>
          <tr>
            <th>Aircraft</th>
            <th>Altitude</th>
            <th>Horizontal</th>
            <th>Vertical</th>
            <th>Zone (r / h)</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {traffic.aircraft.length === 0 && (
            <tr><td colSpan={6} className="traffic-empty">No other aircraft reported.</td></tr>
          )}
          {traffic.aircraft.map(a => (
            <tr key={a.id}>
              <td>{a.id}</td>
              <td>{metres(a.altitudeM)}</td>
              <td>{metres(a.horizontalM)}</td>
              <td>{metres(a.verticalM)}</td>
              <td>{Math.round(a.keepoutRadiusM)} / ±{Math.round(a.keepoutHeightM)} m</td>
              {/* When the feed isn't live these statuses are old: show them dimmed, not in alert colours. */}
              <td className={live ? `traffic-text-${a.status}` : 'traffic-text-stale'}>{STATUS_LABEL[a.status]}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="traffic-log">
        <div className="coord-label">Recent keep-out entries</div>
        {recent.length === 0
          ? <div className="traffic-empty">None</div>
          : recent.map((entry, i) => (
              <div key={`${entry.timestamp}-${entry.id}-${i}`} className="traffic-log-row">
                <span>{clock(entry.timestamp)}</span>
                <span className="traffic-text-inside">{entry.id}</span>
              </div>
            ))}
      </div>

      <div className="panel-footer" style={{ marginTop: '12px' }}>
        Other aircraft from the competition traffic feed. Each entry into a keep-out zone counts once; −5 pts each, first 5 only. The 25 pts are shared with telemetry penalties, which aren't shown here.
      </div>
    </div>
  );
}
