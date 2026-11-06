import { Activity, Radio, ShieldAlert } from "lucide-react";
import { useAeacTelemetry } from "./use-aeac-telemetry";
import "./aeac-telemetry.css";

const display = (value: number | undefined, digits = 2, unit = "") =>
  value === undefined ? "—" : `${value.toFixed(digits)}${unit}`;
const STATUS = {
  connecting: "Connecting", disconnected: "Disconnected · retrying",
  waiting: "Waiting for telemetry", stale: "Stream stale", receiving: "Receiving",
};

export default function AeacTelemetryPanel() {
  const feed = useAeacTelemetry();
  const readings = feed.frame?.readings ?? {};
  const current = feed.status === "receiving" && !feed.error;
  const complete = current && feed.frame?.packet !== null && feed.frame !== null;
  const simulation = feed.frame?.simulation;
  const fields = [
    ["UAV identifier", readings.uav_id ?? "—"],
    ["Unix timestamp · seconds", display(readings.timestamp, 3)],
    ["Latitude · decimal degrees", display(readings.latitude, 7, "°")],
    ["Longitude · decimal degrees", display(readings.longitude, 7, "°")],
    ["Altitude AGL", display(readings.altitude_agl_m, 1, " m")],
    ["Horizontal position accuracy", display(readings.horizontal_accuracy_m, 2, " m")],
    ["Vertical position accuracy", display(readings.vertical_accuracy_m, 2, " m")],
    ["Aircraft battery", display(readings.battery_percentage, 1, "%")],
    ["Aircraft flight mode", readings.flight_mode ?? "—"],
    ["RC-link quality · 0–1", display(readings.rc_link_status, 3)],
    ["Telemetry-link quality · 0–1", display(readings.telemetry_link_status, 3)],
  ];
  const issues = feed.frame?.issues ?? [];
  return (
    <section className="wt-panel aeac-panel" aria-labelledby="aeac-panel-title">
      <div className="wt-panel-heading">
        <h2 id="aeac-panel-title"><Radio size={16} /> AEAC Packet Telemetry</h2>
        <div className="aeac-badges">
          <span className={`wt-badge ${current ? "cyan" : "amber"}`} role="status">{STATUS[feed.status]}</span>
          <span className={`wt-badge ${complete ? "green" : "amber"}`}>
            {complete ? "Packet valid" : !current ? "Packet not current" : "Packet incomplete / invalid"}
          </span>
        </div>
      </div>
      <div className="wt-panel-body">
        <div className="aeac-summary">
          <span className={simulation === true ? "amber" : "cyan"}>
            {simulation === true ? "Backend: sim.py data" : simulation === false ? "MAVLink backend · flight source unverified" : "Backend source not yet identified"}
          </span>
          <span><Activity size={13} /> Observed stream: {feed.rate === null ? "—" : `${feed.rate.toFixed(2)} Hz`} </span>
          <span>Last backend message: {feed.ageSeconds === null ? "—" : `${feed.ageSeconds.toFixed(1)} s ago`}</span>
        </div>
        {!current && feed.frame && <p className="aeac-note amber">Last received values below are historical; the stream is not current.</p>}
        {feed.error && <p className="aeac-note amber" role="alert">{feed.error}</p>}
        <dl className={`aeac-fields ${!current ? "aeac-historical" : ""}`}>
          {fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>
        {issues.length > 0 && (
          <div className="aeac-issues">
            <strong><ShieldAlert size={14} /> Packet validation issues</strong>
            <ul>{issues.map((issue, index) => <li key={`${index}-${issue}`}>{issue}</li>)}</ul>
          </div>
        )}
      </div>
    </section>
  );
}
