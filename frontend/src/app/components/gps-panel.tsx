import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap, useMapEvents } from 'react-leaflet';
import { divIcon } from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Simulator currently flies at UK coordinates; used until the first fix arrives
const DEFAULT_CENTER: [number, number] = [51.5074, -0.1278];
const DEFAULT_ZOOM = 16;

const FIX_LABELS: Record<number, string> = {
  0: 'No GPS',
  1: 'No Fix',
  2: '2D Fix',
  3: '3D Fix',
  4: 'DGPS',
  5: 'RTK Float',
  6: 'RTK Fixed',
};

interface GpsPanelProps {
  latitude: number | null;
  longitude: number | null;
  heading: number | null;
  trail: Array<[number, number]>;
  fixType: number | null;
  satellites: number | null;
  hdop: number | null;
  live: boolean;
}

function FollowDrone({ position, paused, onPause }: { position: [number, number] | null; paused: boolean; onPause: () => void }) {
  const map = useMap();
  useMapEvents({ dragstart: onPause });

  useEffect(() => {
    if (position && !paused) map.setView(position, map.getZoom());
  }, [position, paused, map]);

  return null;
}

export function GpsPanel({ latitude, longitude, heading, trail, fixType, satellites, hdop, live }: GpsPanelProps) {
  const [paused, setPaused] = useState(false);

  const position: [number, number] | null = latitude != null && longitude != null ? [latitude, longitude] : null;

  const icon = useMemo(() => divIcon({
    className: 'drone-icon',
    html: `<svg width="28" height="28" viewBox="0 0 24 24" style="transform: rotate(${heading ?? 0}deg)">
      <path d="M12 2 L19 20 L12 16 L5 20 Z" fill="var(--accent-green)" stroke="#04140c" stroke-width="1" />
    </svg>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  }), [heading]);

  const fixLabel = !live || fixType == null ? 'No Signal' : FIX_LABELS[fixType] ?? `Fix ${fixType}`;
  const fixColor = live && fixType != null && fixType >= 3
    ? 'var(--accent-green)'
    : live && fixType === 2
      ? 'var(--accent-amber)'
      : 'var(--text-dim)';

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">
          <span style={{ color: 'var(--accent-blue)' }}>📍</span>
          GPS Tracking
        </span>
        <span className="panel-badge">
          <span style={{ color: fixColor, fontSize: '12px' }}>🛰</span>
          <span style={{ color: fixColor }}>{fixLabel}</span>
        </span>
      </div>

      <div className="gps-map-wrap">
        <MapContainer center={position ?? DEFAULT_CENTER} zoom={DEFAULT_ZOOM} className="gps-map" zoomControl={false}>
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          />
          {trail.length > 1 && <Polyline positions={trail} pathOptions={{ color: 'var(--accent-green)', weight: 2, opacity: 0.7 }} />}
          {position && <Marker position={position} icon={icon} />}
          <FollowDrone position={position} paused={paused} onPause={() => setPaused(true)} />
        </MapContainer>
        {paused && (
          <button className="gps-recenter" onClick={() => setPaused(false)}>Recenter</button>
        )}
      </div>

      <div className="gps-coords">
        <div className="coord-box">
          <div className="coord-label">Latitude</div>
          <div className="coord-value">{latitude == null ? '—' : `${latitude.toFixed(6)}°`}</div>
        </div>
        <div className="coord-box">
          <div className="coord-label">Longitude</div>
          <div className="coord-value">{longitude == null ? '—' : `${longitude.toFixed(6)}°`}</div>
        </div>
        <div className="coord-box">
          <div className="coord-label">Satellites</div>
          <div className="coord-value">{satellites ?? '—'}</div>
        </div>
        <div className="coord-box">
          <div className="coord-label">HDOP</div>
          <div className="coord-value">{hdop == null ? '—' : hdop.toFixed(2)}</div>
        </div>
      </div>

      <div className="panel-footer" style={{ marginTop: '12px' }}>Real-time GPS coordinates</div>
    </div>
  );
}
