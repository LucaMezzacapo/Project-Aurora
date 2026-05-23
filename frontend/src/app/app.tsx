import { useState, useEffect, useRef } from 'react';
import { BatteryChart } from './components/battery-chart';
import { AltitudeChart } from './components/altitude-chart';
import { GpsPanel } from './components/gps-panel';
import { MetricCard } from './components/metric-card';
import { NavigationPanel } from './components/navigation-panel';
import { OrientationPanel } from './components/orientation-panel';

const MAX_HISTORY = 30;
const DASH = '—';
const WS_URL = "ws://127.0.0.1:8000/ws/telemetry";
const RECONNECT_DELAY = 2000;
const STALE_MS = 3000;

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
};

function formatTime(date: Date) {
  return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function fmt(value: number | null, digits: number) {
  return value == null ? DASH : value.toFixed(digits);
}

export default function App() {
  const [batteryHistory, setBatteryHistory] = useState<Array<{ time: string; voltage: number | null; current: number | null }>>([]);

  const [altitudeHistory, setAltitudeHistory] = useState<Array<{ time: string; altitude: number | null }>>([]);

  const [tele, setTele] = useState<Telemetry>({
    latitude: null,
    longitude: null,
    groundSpeed: null,
    heading: null,
    pitch: null,
    roll: null,
    yaw: null,
    altitude: null,
    voltage: null,
    current: null,
    rssi: null,
    satellites: null,
  });

  const [status, setStatus] = useState<ConnectionStatus>('connecting');

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastUpdateRef = useRef<number | null>(null);
  const lastChangeRef = useRef(0);
  const seenRef = useRef(false);

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
        seenRef.current = true;
        lastUpdateRef.current = lu;
        setStatus(lu !== null && Date.now() - lastChangeRef.current < STALE_MS ? 'connected' : 'stale');

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
          satellites: prev.satellites,
        };
  
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

  const batteryStatus = tele.voltage == null ? 'good' : tele.voltage > 11.5 ? 'good' : tele.voltage > 10.8 ? 'warning' : 'critical';
  const connected = status === 'connected';

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
          <span>SAT: {tele.satellites ?? DASH}</span>
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
            trend={tele.altitude == null ? undefined : 'up'}
            status="good"
          />
          <MetricCard
            label="Battery Voltage"
            value={fmt(tele.voltage, 2)}
            unit="V"
            trend={tele.voltage == null ? undefined : tele.voltage > 11.8 ? 'up' : 'down'}
            status={batteryStatus}
          />
          <MetricCard
            label="Battery Current"
            value={fmt(tele.current, 2)}
            unit="A"
            trend={tele.current == null ? undefined : 'up'}
            status={tele.current != null && tele.current > 4.0 ? 'warning' : 'good'}
          />
          <MetricCard
            label="Ground Speed"
            value={fmt(tele.groundSpeed, 1)}
            unit="km/h"
            trend={tele.groundSpeed == null ? undefined : tele.groundSpeed > 10 ? 'up' : 'down'}
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
          <GpsPanel latitude={tele.latitude} longitude={tele.longitude} live={connected && tele.latitude != null && tele.longitude != null} />
          <NavigationPanel groundSpeed={tele.groundSpeed} heading={tele.heading} live={connected && tele.groundSpeed != null && tele.heading != null} />
          <OrientationPanel pitch={tele.pitch} roll={tele.roll} yaw={tele.yaw} live={connected && tele.pitch != null && tele.roll != null && tele.yaw != null} />
        </div>

      </main>
    </div>
  );
}
