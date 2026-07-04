import { useState, useEffect, useRef } from 'react';
import { BatteryChart } from './components/battery-chart';
import { AltitudeChart } from './components/altitude-chart';
import { GpsPanel } from './components/gps-panel';
import { MetricCard } from './components/metric-card';
import { NavigationPanel } from './components/navigation-panel';
import { OrientationPanel } from './components/orientation-panel';
import Button from './components/button';
import { parseMissionFile, validateWaypoints, type Waypoint } from './mission';
import { validateGuided, type GuidedWaypoint } from './guided-waypoint';

const MAX_HISTORY = 30;
const MAX_TRAIL = 300;
const DASH = '—';
const WS_URL = "ws://127.0.0.1:8000/ws/telemetry";
const API_URL = "http://127.0.0.1:8000";
const RECONNECT_DELAY = 2000;
const STALE_MS = 3000;
const GUIDED_REACHED_M = 40; // clear the guided banner once within this many metres of the target

type MissionStatus = 'idle' | 'running' | 'paused' | 'emergency_stop';

const MISSION_LABEL: Record<MissionStatus, string> = {
  idle: 'Idle',
  running: 'Mission Running',
  paused: 'Mission Paused',
  emergency_stop: 'Emergency Stop Activated',
};

type ConnectionStatus = 'connecting' | 'connected' | 'stale' | 'disconnected';

const STATUS_META: Record<ConnectionStatus, { dot: string; label: string }> = {
  connecting: { dot: 'dot-amber', label: 'CONNECTING…' },
  connected: { dot: 'dot-green', label: 'CONNECTED' },
  stale: { dot: 'dot-amber', label: 'NO TELEMETRY' },
  disconnected: { dot: 'dot-red', label: 'DISCONNECTED' },
};

type Telemetry = {
  latitude: number | null;
  longitude: number | null;
  groundSpeed: number | null;
  heading: number | null;
  pitch: number | null;
  roll: number | null;
  yaw: number | null;
  altitude: number | null;
  voltage: number | null;
  current: number | null;
  rssi: number | null;
  satellites: number | null;
  fixType: number | null;
  hdop: number | null;
};

function formatTime(date: Date) {
  return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function fmt(value: number | null, digits: number) {
  return value == null ? DASH : value.toFixed(digits);
}

const TREND_WINDOW = 15; // ~3s of samples at 5 Hz

function trendOf(samples: number[], deadband: number): 'up' | 'down' | undefined {
  if (samples.length < TREND_WINDOW) return undefined;
  const delta = samples[samples.length - 1] - samples[0];
  if (Math.abs(delta) < deadband) return undefined;
  return delta > 0 ? 'up' : 'down';
}

function formatAgo(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s === 0) return 'Now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s ago`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ago`;
}

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const dn = (lat2 - lat1) * 111_111;
  const de = (lon2 - lon1) * 111_111 * Math.cos((lat1 * Math.PI) / 180);
  return Math.hypot(dn, de);
}

export default function App() {
  const [batteryHistory, setBatteryHistory] = useState<Array<{ time: string; voltage: number | null; current: number | null }>>([]);

  const [altitudeHistory, setAltitudeHistory] = useState<Array<{ time: string; altitude: number | null }>>([]);

  // Default to 0 so the dashboard reads 0 (not "—") when no sim is connected.
  // Real telemetry overwrites these once the sim is running.
  const [tele, setTele] = useState<Telemetry>({
    latitude: 0,
    longitude: 0,
    groundSpeed: 0,
    heading: 0,
    pitch: 0,
    roll: 0,
    yaw: 0,
    altitude: 0,
    voltage: 0,
    current: 0,
    rssi: 0,
    satellites: 0,
    fixType: 0,
    hdop: 0,
  });

  const [trail, setTrail] = useState<Array<[number, number]>>([]);

  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [lastContact, setLastContact] = useState<number | null>(null);
  const [nowTs, setNowTs] = useState(() => Date.now());

  // ─── Mission state ───
  const [missionStatus, setMissionStatus] = useState<MissionStatus>('idle');
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [missionFile, setMissionFile] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [missionMsg, setMissionMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ─── Send Guided Waypoint state ───
  const [guidedInput, setGuidedInput] = useState({ latitude: '', longitude: '', altitude: '' });
  const [guidedTarget, setGuidedTarget] = useState<GuidedWaypoint | null>(null);
  const [sendingGuided, setSendingGuided] = useState(false);
  const [guidedMsg, setGuidedMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const prevMissionStatusRef = useRef<MissionStatus>('idle');
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastUpdateRef = useRef<number | null>(null);
  const lastChangeRef = useRef(0);
  const seenRef = useRef(false);
  const trendRef = useRef<{ altitude: number[]; voltage: number[]; current: number[]; speed: number[] }>({
    altitude: [], voltage: [], current: [], speed: [],
  });

  useEffect(() => {
    let closed = false;

    const connect = () => {
      setStatus('connecting');
      const ws = new WebSocket(WS_URL);
      socketRef.current = ws;

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        const now = formatTime(new Date());

        const lu = typeof data.last_update === 'number' ? data.last_update : null;
        if (seenRef.current && lu !== null && lu !== lastUpdateRef.current) {
          lastChangeRef.current = Date.now();
        }
        if (lu !== null && lu !== lastUpdateRef.current) {
          setLastContact(Date.now());
        }
        seenRef.current = true;
        lastUpdateRef.current = lu;
        setStatus(lu !== null && Date.now() - lastChangeRef.current < STALE_MS ? 'connected' : 'stale');

        if (typeof data.mission_status === 'string') {
          setMissionStatus(data.mission_status as MissionStatus);
        }

      setTele(prev => {
        const nextTele = {
          ...prev,
          latitude: data.latitude ?? prev.latitude,
          longitude: data.longitude ?? prev.longitude,
          groundSpeed: data.groundspeed_km ?? prev.groundSpeed,
          heading: data.yaw ?? prev.heading,
          pitch: data.pitch ?? prev.pitch,
          roll: data.roll ?? prev.roll,
          yaw: data.yaw ?? prev.yaw,
          altitude: data.altitude ?? prev.altitude,
          voltage: data.battery_voltage ?? prev.voltage,
          current: data.battery_current ?? prev.current,
          rssi: prev.rssi,
          satellites: data.satellites ?? prev.satellites,
          fixType: data.fix_type ?? prev.fixType,
          hdop: data.hdop ?? prev.hdop,
        };

        const { latitude: lat, longitude: lon } = nextTele;
        if (lat != null && lon != null && (lat !== prev.latitude || lon !== prev.longitude)) {
          setTrail(t => [...t.slice(-(MAX_TRAIL - 1)), [lat, lon]]);
        }

        const s = trendRef.current;
        if (nextTele.altitude != null) s.altitude = [...s.altitude.slice(-(TREND_WINDOW - 1)), nextTele.altitude];
        if (nextTele.voltage != null) s.voltage = [...s.voltage.slice(-(TREND_WINDOW - 1)), nextTele.voltage];
        if (nextTele.current != null) s.current = [...s.current.slice(-(TREND_WINDOW - 1)), nextTele.current];
        if (nextTele.groundSpeed != null) s.speed = [...s.speed.slice(-(TREND_WINDOW - 1)), nextTele.groundSpeed];

        setBatteryHistory(h => [
          ...h.slice(-(MAX_HISTORY - 1)),
          {
            time: now,
            voltage: nextTele.voltage,
            current: nextTele.current,
          },
        ]);
  
        setAltitudeHistory(h => [
          ...h.slice(-(MAX_HISTORY - 1)),
          {
            time: now,
            altitude: nextTele.altitude,
          },
        ]);
  
        return nextTele;
      });
    };
  
      ws.onerror = () => {
        ws.close();
      };

      ws.onclose = () => {
        socketRef.current = null;
        if (closed) return;
        setStatus('disconnected');
        reconnectRef.current = setTimeout(connect, RECONNECT_DELAY);
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      socketRef.current?.close();
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Clear the mission banner once the route finishes (running -> idle).
  useEffect(() => {
    if (prevMissionStatusRef.current === 'running' && missionStatus === 'idle') {
      setMissionMsg(null);
    }
    prevMissionStatusRef.current = missionStatus;
  }, [missionStatus]);

  // Clear the guided banner once the drone reaches the target.
  useEffect(() => {
    if (guidedMsg?.kind !== 'success' || !guidedTarget) return;
    if (tele.latitude == null || tele.longitude == null) return;
    if (distanceMeters(tele.latitude, tele.longitude, guidedTarget.latitude, guidedTarget.longitude) <= GUIDED_REACHED_M) {
      setGuidedMsg(null);
    }
  }, [tele.latitude, tele.longitude, guidedMsg, guidedTarget]);

  const batteryStatus = tele.voltage == null ? 'good' : tele.voltage > 11.5 ? 'good' : tele.voltage > 10.8 ? 'warning' : 'critical';
  const trends = trendRef.current;
  const connected = status === 'connected';
  const lastContactLabel = lastContact == null ? DASH : formatAgo(nowTs - lastContact);

  const handleMissionFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    setMissionMsg(null);
    try {
      const text = await file.text();
      const parsed = parseMissionFile(file.name, text);
      const errors = validateWaypoints(parsed);
      if (errors.length > 0) {
        setWaypoints([]);
        setMissionFile(null);
        setMissionMsg({ kind: 'error', text: errors[0] });
        return;
      }
      const res = await fetch(`${API_URL}/mission/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ waypoints: parsed }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Upload failed.');
      }
      setWaypoints(parsed);
      setMissionFile(file.name);
      setMissionMsg({ kind: 'success', text: `Loaded ${parsed.length} waypoint(s) from ${file.name}.` });
    } catch (err) {
      setWaypoints([]);
      setMissionFile(null);
      setMissionMsg({ kind: 'error', text: err instanceof Error ? err.message : 'Could not read mission file.' });
    }
  };

  const handleStartMission = async () => {
    setStarting(true);
    setMissionMsg(null);
    try {
      const res = await fetch(`${API_URL}/mission/start`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to start mission.');
      setMissionStatus('running');
      setMissionMsg({ kind: 'success', text: 'Mission Running.' });
    } catch (err) {
      setMissionMsg({ kind: 'error', text: err instanceof Error ? err.message : 'Failed to start mission.' });
    } finally {
      setStarting(false);
    }
  };

  const handlePauseMission = async () => {
    setPausing(true);
    setMissionMsg(null);
    try {
      const res = await fetch(`${API_URL}/mission/pause`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to pause mission.');
      setMissionStatus('paused');
      setMissionMsg({ kind: 'success', text: 'Mission paused.' });
    } catch (err) {
      setMissionMsg({ kind: 'error', text: err instanceof Error ? err.message : 'Failed to pause mission.' });
    } finally {
      setPausing(false);
    }
  };

  const startDisabled = waypoints.length === 0 || missionStatus === 'running';
  const pauseDisabled = missionStatus !== 'running';

  const missionControls = (
    <div className="mission-controls">
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.json"
        onChange={handleMissionFile}
        style={{ display: 'none' }}
      />
      <div className="mission-buttons">
        <Button
          title="Upload Mission File"
          onClick={() => fileInputRef.current?.click()}
          className="button-panel button-upload"
        />
        <Button
          title="Start Mission"
          onClick={handleStartMission}
          loading={starting}
          disabled={startDisabled}
          className="button-panel button-start"
        />
        <Button
          title="Pause Mission"
          onClick={handlePauseMission}
          loading={pausing}
          disabled={pauseDisabled}
          className="button-panel button-pause"
        />
      </div>
      <div className="mission-info">
        <span className="mission-status-label">Mission status:</span>{' '}
        <span className={`mission-status-value mission-${missionStatus}`}>
          {MISSION_LABEL[missionStatus]}
        </span>
        {missionFile && (
          <span className="mission-file">
            {' '}· {missionFile} ({waypoints.length} waypoint{waypoints.length === 1 ? '' : 's'})
          </span>
        )}
      </div>
      {missionMsg && (
        <div className={`mission-msg mission-msg-${missionMsg.kind}`}>{missionMsg.text}</div>
      )}
    </div>
  );

  const handleSendGuided = async () => {
    if (guidedInput.latitude.trim() === '' || guidedInput.longitude.trim() === '' || guidedInput.altitude.trim() === '') {
      setGuidedMsg({ kind: 'error', text: 'Latitude, longitude, and altitude are all required.' });
      return;
    }
    const wp: GuidedWaypoint = {
      latitude: Number(guidedInput.latitude),
      longitude: Number(guidedInput.longitude),
      altitude: Number(guidedInput.altitude),
    };
    const error = validateGuided(wp);
    if (error) {
      setGuidedMsg({ kind: 'error', text: error });
      return;
    }
    setSendingGuided(true);
    setGuidedMsg(null);
    try {
      const res = await fetch(`${API_URL}/waypoint/guided`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(wp),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to send guided waypoint.');
      setGuidedTarget(wp);
      setGuidedMsg({ kind: 'success', text: 'Guided waypoint sent.' });
    } catch (err) {
      setGuidedMsg({ kind: 'error', text: err instanceof Error ? err.message : 'Failed to send guided waypoint.' });
    } finally {
      setSendingGuided(false);
    }
  };

  const guidedField = (key: 'latitude' | 'longitude' | 'altitude', placeholder: string) => (
    <input
      type="number"
      className="guided-input"
      placeholder={placeholder}
      value={guidedInput[key]}
      onChange={(e) => setGuidedInput(v => ({ ...v, [key]: e.target.value }))}
    />
  );

  const guidedControls = (
    <div className="guided-controls">
      <div className="guided-title">Guided Waypoint</div>
      <div className="guided-inputs">
        {guidedField('latitude', 'Latitude')}
        {guidedField('longitude', 'Longitude')}
        {guidedField('altitude', 'Altitude (m)')}
      </div>
      <Button
        title="Send Guided Waypoint"
        onClick={handleSendGuided}
        loading={sendingGuided}
        className="button-panel button-guided"
      />
      <div className="mission-info">
        <span className="mission-status-label">Selected waypoint:</span>{' '}
        <span className="mission-status-value">
          {guidedTarget ? `${guidedTarget.latitude}, ${guidedTarget.longitude}, ${guidedTarget.altitude}m` : '—'}
        </span>
      </div>
      {guidedMsg && (
        <div className={`mission-msg mission-msg-${guidedMsg.kind}`}>{guidedMsg.text}</div>
      )}
    </div>
  );

  return (
    <div className="dashboard">
      {/* Header */}
      <header className="header">
        <div className="header-logo">
          <div className="header-logo-icon">A</div>
          <div>
            <div className="header-title">Project Aurora</div>
            <div className="header-subtitle">Ground Control Station</div>
          </div>
        </div>
        <div className="header-status">
          <div className="status-dot">
            <div className={`dot ${STATUS_META[status].dot}`} />
            {STATUS_META[status].label}
          </div>
          <span className="header-sep">|</span>
          <span>RSSI: {tele.rssi ?? DASH} dBm</span>
          <span className="header-sep">|</span>
          <span>Last contact: {lastContactLabel}</span>
        </div>
      </header>

      {/* Main */}
      <main className="main">

        {/* Row 1: 4 metric cards side by side */}
        <div className="row-4">
          <MetricCard
            label="Altitude"
            value={fmt(tele.altitude, 1)}
            unit="m"
            trend={trendOf(trends.altitude, 0.5)}
            status="good"
          />
          <MetricCard
            label="Battery Voltage"
            value={fmt(tele.voltage, 2)}
            unit="V"
            trend={trendOf(trends.voltage, 0.05)}
            status={batteryStatus}
          />
          <MetricCard
            label="Battery Current"
            value={fmt(tele.current, 2)}
            unit="A"
            trend={trendOf(trends.current, 0.2)}
            status={tele.current != null && tele.current > 4.0 ? 'warning' : 'good'}
          />
          <MetricCard
            label="Ground Speed"
            value={fmt(tele.groundSpeed, 1)}
            unit="km/h"
            trend={trendOf(trends.speed, 1.0)}
            status="good"
          />
        </div>

        {/* Row 2: Battery chart | Altitude chart */}
        <div className="row-2">
          <BatteryChart data={batteryHistory} live={connected && tele.voltage != null} />
          <AltitudeChart data={altitudeHistory} live={connected && tele.altitude != null} />
        </div>

        {/* Row 3: GPS | Navigation | Orientation */}
        <div className="row-3">
          <GpsPanel
            latitude={tele.latitude}
            longitude={tele.longitude}
            heading={tele.heading}
            trail={trail}
            fixType={tele.fixType}
            satellites={tele.satellites}
            hdop={tele.hdop}
            live={connected && tele.latitude != null && tele.longitude != null}
            missionControls={missionControls}
            missionWaypoints={waypoints}
            guidedControls={guidedControls}
            guidedTarget={guidedTarget}
          />
          <NavigationPanel groundSpeed={tele.groundSpeed} heading={tele.heading} live={connected && tele.groundSpeed != null && tele.heading != null} />
          <OrientationPanel pitch={tele.pitch} roll={tele.roll} yaw={tele.yaw} live={connected && tele.pitch != null && tele.roll != null && tele.yaw != null} />
        </div>

      </main>
    </div>
  );
}
