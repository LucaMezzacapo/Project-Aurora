import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap, useMapEvents } from 'react-leaflet';
import { divIcon, type Map as LeafletMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { ReactNode } from 'react';

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
  missionControls?: ReactNode;
  missionWaypoints?: Array<{ latitude: number; longitude: number; altitude: number; order: number }>;
  guidedControls?: ReactNode;
  guidedTarget?: { latitude: number; longitude: number; altitude: number } | null;
}


function FollowDrone({ position, missionPath, paused, onPause }: { position: [number, number] | null; missionPath: Array<[number, number]>; paused: boolean; onPause: () => void }) {
  const map = useMap();
  useMapEvents({ dragstart: onPause });

  useEffect(() => {
    if (paused) return;
    // Follow the live drone when we have a fix; otherwise frame the mission.
    if (position) {
      map.setView(position, map.getZoom());
      return;
    }
    if (missionPath.length === 1) {
      map.setView(missionPath[0], map.getZoom());
      return;
    }
    if (missionPath.length > 1) {
      map.fitBounds(missionPath, { padding: [40, 40] });
    }
  }, [position, missionPath, paused, map]);

  return null;
}

export function GpsPanel({ latitude, longitude, heading, trail, fixType, satellites, hdop, live, missionControls, missionWaypoints, guidedControls, guidedTarget }: GpsPanelProps) {
  const [paused, setPaused] = useState(false);
  const [map, setMap] = useState<LeafletMap | null>(null);

  const position: [number, number] | null = latitude != null && longitude != null ? [latitude, longitude] : null;

  // Mission waypoints drawn in travel order: a dashed path + numbered markers.
  const missionPath = useMemo<Array<[number, number]>>(() => {
    if (!missionWaypoints?.length) return [];
    return [...missionWaypoints]
      .sort((a, b) => a.order - b.order)
      .map(w => [w.latitude, w.longitude]);
  }, [missionWaypoints]);

  const waypointIcon = (order: number) => divIcon({
    className: 'waypoint-icon',
    html: `<div class="waypoint-marker">${order}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });

  const guidedIcon = useMemo(() => divIcon({
    className: 'guided-icon',
    html: `<svg width="22" height="22" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="7" fill="none" stroke="var(--accent-blue)" stroke-width="3" />
      <circle cx="12" cy="12" r="2.5" fill="var(--accent-blue)" />
    </svg>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  }), []);

  const icon = useMemo(() => divIcon({
    className: 'drone-icon',
    html: `<svg width="28" height="28" viewBox="0 0 24 24" style="transform: rotate(${heading ?? 0}deg)">
      <path d="M12 2 L19 20 L12 16 L5 20 Z" fill="var(--accent-green)" stroke="#04140c" stroke-width="1" />
    </svg>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  }), [heading]);

  // Recenter: resume following and frame the drone + its trail on screen.
  const handleRecenter = () => {
    setPaused(false);
    if (!map) return;
    const pts: Array<[number, number]> = position ? [position, ...trail] : [...trail];
    if (pts.length === 1) {
      map.setView(pts[0], DEFAULT_ZOOM);
      return;
    }
    if (pts.length > 1) map.fitBounds(pts, { padding: [40, 40] });
  };

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
        <MapContainer ref={setMap} center={position ?? DEFAULT_CENTER} zoom={DEFAULT_ZOOM} className="gps-map" zoomControl={false}>
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          />
          {missionPath.length > 1 && <Polyline positions={missionPath} pathOptions={{ color: 'var(--accent-amber)', weight: 2, opacity: 0.85, dashArray: '6 6' }} />}
          {missionWaypoints?.map(w => (
            <Marker key={w.order} position={[w.latitude, w.longitude]} icon={waypointIcon(w.order)} />
          ))}
          {trail.length > 1 && <Polyline positions={trail} pathOptions={{ color: 'var(--accent-green)', weight: 2, opacity: 0.7 }} />}
          {position && <Marker position={position} icon={icon} />}
          {guidedTarget && <Marker position={[guidedTarget.latitude, guidedTarget.longitude]} icon={guidedIcon} />}
          <FollowDrone position={position} missionPath={missionPath} paused={paused} onPause={() => setPaused(true)} />
        </MapContainer>
        {paused && (
          <button className="gps-recenter" onClick={handleRecenter}>Recenter</button>
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

      {missionControls}
      {guidedControls}

      <div className="panel-footer" style={{ marginTop: '12px' }}>Real-time GPS coordinates</div>
    </div>
  );
}
