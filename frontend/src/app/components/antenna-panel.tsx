import { useEffect, useRef, useState } from 'react';
import { getCardinalDirection } from './navigation-panel';
import Button from './button';

export type TrackingStatus = 'active' | 'paused' | 'disabled';
export type GroundStation = { latitude: number; longitude: number };

const STATUS_META: Record<TrackingStatus, { dot: string; label: string }> = {
  active: { dot: 'dot-green', label: 'Tracking Active' },
  paused: { dot: 'dot-amber', label: 'Tracking Paused' },
  disabled: { dot: 'dot-dim', label: 'Tracking Disabled' },
};

interface AntennaPanelProps {
  aircraftLat: number | null;
  aircraftLon: number | null;
  groundStation: GroundStation | null;
  trackingStatus: TrackingStatus;
  azimuth: number | null;
  onSaveGroundStation: (latitude: number, longitude: number) => void;
  onEnable: () => void;
  onPause: () => void;
  onDisable: () => void;
  saving: boolean;
  updating: boolean;
  msg: { kind: 'success' | 'error'; text: string } | null;
}

export function AntennaPanel({
  aircraftLat,
  aircraftLon,
  groundStation,
  trackingStatus,
  azimuth,
  onSaveGroundStation,
  onEnable,
  onPause,
  onDisable,
  saving,
  updating,
  msg,
}: AntennaPanelProps) {
  const [latInput, setLatInput] = useState('');
  const [lonInput, setLonInput] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const seededRef = useRef(false);

  // Pre-fill the inputs from the server-saved position once, without
  // clobbering anything the user is actively typing.
  useEffect(() => {
    if (groundStation && !seededRef.current) {
      setLatInput(String(groundStation.latitude));
      setLonInput(String(groundStation.longitude));
      seededRef.current = true;
    }
  }, [groundStation]);

  const handleSave = () => {
    const lat = Number(latInput);
    const lon = Number(lonInput);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      setValidationError('Latitude must be a number between -90 and 90.');
      return;
    }
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
      setValidationError('Longitude must be a number between -180 and 180.');
      return;
    }
    setValidationError(null);
    onSaveGroundStation(lat, lon);
  };

  const handleUseAircraftPosition = () => {
    if (aircraftLat == null || aircraftLon == null) return;
    setLatInput(aircraftLat.toFixed(6));
    setLonInput(aircraftLon.toFixed(6));
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">
          <span style={{ color: 'var(--accent-cyan)' }}>📡</span>
          Antenna Tracking
        </span>
        <span className="panel-badge">
          <span className={`dot ${STATUS_META[trackingStatus].dot}`}></span>
          {STATUS_META[trackingStatus].label}
        </span>
      </div>

      <div className="gps-coords" style={{ marginBottom: '12px' }}>
        <div className="coord-box">
          <div className="coord-label">Aircraft Latitude</div>
          <div className="coord-value">{aircraftLat == null ? '—' : `${aircraftLat.toFixed(6)}°`}</div>
        </div>
        <div className="coord-box">
          <div className="coord-label">Aircraft Longitude</div>
          <div className="coord-value">{aircraftLon == null ? '—' : `${aircraftLon.toFixed(6)}°`}</div>
        </div>
        <div className="coord-box">
          <div className="coord-label">Ground Station Lat</div>
          <div className="coord-value">{groundStation == null ? '—' : `${groundStation.latitude.toFixed(6)}°`}</div>
        </div>
        <div className="coord-box">
          <div className="coord-label">Ground Station Lon</div>
          <div className="coord-value">{groundStation == null ? '—' : `${groundStation.longitude.toFixed(6)}°`}</div>
        </div>
      </div>

      <div className="nav-box" style={{ marginBottom: '12px' }}>
        <div className="nav-box-label">Target Azimuth</div>
        <div className="nav-box-value">{azimuth == null ? '—' : `${azimuth.toFixed(0)}°`}</div>
        <div className="nav-box-unit">{getCardinalDirection(azimuth)}</div>
      </div>

      <div className="antenna-controls">
        <div className="antenna-inputs">
          <input
            type="text"
            inputMode="decimal"
            placeholder="Ground station latitude"
            value={latInput}
            onChange={(e) => setLatInput(e.target.value)}
            className="antenna-input"
          />
          <input
            type="text"
            inputMode="decimal"
            placeholder="Ground station longitude"
            value={lonInput}
            onChange={(e) => setLonInput(e.target.value)}
            className="antenna-input"
          />
        </div>

        <div className="antenna-buttons">
          <Button
            title="Use Aircraft Position"
            onClick={handleUseAircraftPosition}
            disabled={aircraftLat == null || aircraftLon == null}
            className="button-panel button-upload"
          />
          <Button
            title="Save Ground Station"
            onClick={handleSave}
            loading={saving}
            className="button-panel button-upload"
          />
        </div>

        <div className="antenna-buttons">
          <Button
            title="Enable Tracking"
            onClick={onEnable}
            loading={updating}
            disabled={groundStation == null || trackingStatus === 'active'}
            className="button-panel button-start"
          />
          <Button
            title="Pause Tracking"
            onClick={onPause}
            loading={updating}
            disabled={trackingStatus !== 'active'}
            className="button-panel button-pause"
          />
          <Button
            title="Disable Tracking"
            onClick={onDisable}
            loading={updating}
            disabled={trackingStatus === 'disabled'}
            className="button-panel button-disable"
          />
        </div>

        {validationError && <div className="mission-msg mission-msg-error">{validationError}</div>}
        {msg && <div className={`mission-msg mission-msg-${msg.kind}`}>{msg.text}</div>}
      </div>

      <div className="panel-footer" style={{ marginTop: '12px' }}>Ground-to-air pointing angle for the directional antenna</div>
    </div>
  );
}
