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
    const ws = new WebSocket("ws://127.0.0.1:8000/ws/telemetry");
    ws.onopen = () => {
      console.log("Telemetry websocket connected");
    };
  
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      const now = formatTime(new Date());
  
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
  
    ws.onerror = (error) => {
      console.error("Telemetry websocket error:", error);
    };
  
    ws.onclose = () => {
      console.log("Telemetry websocket disconnected");
    };
  
    return () => {
      ws.close();
    };
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
