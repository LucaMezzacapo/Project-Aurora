import { useState, useEffect } from 'react';
import { BatteryChart } from './components/battery-chart';
import { AltitudeChart } from './components/altitude-chart';
import { GpsPanel } from './components/gps-panel';
import { MetricCard } from './components/metric-card';
import { NavigationPanel } from './components/navigation-panel';
import { OrientationPanel } from './components/orientation-panel';

const MAX_HISTORY = 30;

function formatTime(date: Date) {
  return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function genHistory<T>(gen: (i: number) => T, n: number): T[] {
  return Array.from({ length: n }, (_, i) => gen(i));
}

export default function App() {
  const [batteryHistory, setBatteryHistory] = useState(() =>
    genHistory((i) => ({
      time: formatTime(new Date(Date.now() - (MAX_HISTORY - i) * 1000)),
      voltage: 11.8 + Math.random() * 0.4,
      current: 2.2 + Math.random() * 0.6,
    }), MAX_HISTORY)
  );

  const [altitudeHistory, setAltitudeHistory] = useState(() =>
    genHistory((i) => ({
      time: formatTime(new Date(Date.now() - (MAX_HISTORY - i) * 1000)),
      altitude: 100 + Math.sin(i / 5) * 20 + Math.random() * 5,
    }), MAX_HISTORY)
  );

  const [tele, setTele] = useState({
    latitude: 37.7749,
    longitude: -122.4194,
    groundSpeed: 12.4,
    heading: 45,
    pitch: 2.1,
    roll: -1.3,
    yaw: 45,
    altitude: 115.2,
    voltage: 12.1,
    current: 2.4,
    rssi: -68,
    satellites: 9,
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const now = formatTime(new Date());

      setTele(prev => {
        const voltage    = Math.max(10.5, Math.min(12.6, prev.voltage + (Math.random() - 0.5) * 0.05));
        const current    = Math.max(0.5,  Math.min(5.0,  prev.current + (Math.random() - 0.5) * 0.1));
        const altitude   = Math.max(0,    prev.altitude + (Math.random() - 0.48) * 1.5);
        const heading    = (prev.heading + (Math.random() - 0.5) * 2 + 360) % 360;
        const groundSpeed= Math.max(0, Math.min(50, prev.groundSpeed + (Math.random() - 0.5) * 0.5));
        const pitch      = Math.max(-30, Math.min(30, prev.pitch + (Math.random() - 0.5) * 0.5));
        const roll       = Math.max(-30, Math.min(30, prev.roll  + (Math.random() - 0.5) * 0.5));
        const yaw        = (prev.yaw + (Math.random() - 0.5) * 1.5 + 360) % 360;
        const latitude   = prev.latitude  + (Math.random() - 0.5) * 0.0001;
        const longitude  = prev.longitude + (Math.random() - 0.5) * 0.0001;

        setBatteryHistory(h => [...h.slice(-(MAX_HISTORY - 1)), { time: now, voltage, current }]);
        setAltitudeHistory(h => [...h.slice(-(MAX_HISTORY - 1)), { time: now, altitude }]);

        return { ...prev, voltage, current, altitude, heading, groundSpeed, pitch, roll, yaw, latitude, longitude };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const batteryStatus = tele.voltage > 11.5 ? 'good' : tele.voltage > 10.8 ? 'warning' : 'critical';

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
            <div className="dot dot-green" />
            CONNECTED
          </div>
          <span className="header-sep">|</span>
          <span>RSSI: {tele.rssi} dBm</span>
          <span className="header-sep">|</span>
          <span>SAT: {tele.satellites}</span>
        </div>
      </header>

      {/* Main */}
      <main className="main">

        {/* Row 1: 4 metric cards side by side */}
        <div className="row-4">
          <MetricCard
            label="Altitude"
            value={tele.altitude.toFixed(1)}
            unit="m"
            trend="up"
            status="good"
          />
          <MetricCard
            label="Battery Voltage"
            value={tele.voltage.toFixed(2)}
            unit="V"
            trend={tele.voltage > 11.8 ? 'up' : 'down'}
            status={batteryStatus}
          />
          <MetricCard
            label="Battery Current"
            value={tele.current.toFixed(2)}
            unit="A"
            trend="up"
            status={tele.current > 4.0 ? 'warning' : 'good'}
          />
          <MetricCard
            label="Ground Speed"
            value={tele.groundSpeed.toFixed(1)}
            unit="km/h"
            trend={tele.groundSpeed > 10 ? 'up' : 'down'}
            status="good"
          />
        </div>

        {/* Row 2: Battery chart | Altitude chart */}
        <div className="row-2">
          <BatteryChart data={batteryHistory} />
          <AltitudeChart data={altitudeHistory} />
        </div>

        {/* Row 3: GPS | Navigation | Orientation */}
        <div className="row-3">
          <GpsPanel latitude={tele.latitude} longitude={tele.longitude} />
          <NavigationPanel groundSpeed={tele.groundSpeed} heading={tele.heading} />
          <OrientationPanel pitch={tele.pitch} roll={tele.roll} yaw={tele.yaw} />
        </div>

      </main>
    </div>
  );
}
