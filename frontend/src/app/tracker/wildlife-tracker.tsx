import { useEffect, useReducer, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Activity,
  ArrowDownToLine,
  Check,
  Clock3,
  Crosshair,
  FileCheck2,
  FileSpreadsheet,
  ListChecks,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Satellite,
  ShieldAlert,
  ShieldCheck,
  WifiOff,
} from "lucide-react";
import TrackerMap from "./tracker-map";
import {
  createDemo,
  currentSeparation,
  isFresh,
  recordingGaps,
  trackerReducer,
  trackingCSV,
  TRAJECTORY_MS,
} from "./tracker-model";
import type { Scenario } from "./tracker-model";
const timer = (ms: number) => {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
};
const utc = (ms: number) => new Date(ms).toISOString().slice(11, 19) + "Z";
function Badge({
  children,
  tone = "cyan",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`wt-badge ${tone}`}>{children}</span>;
}
function Metric({
  label,
  badge,
  value,
  unit,
  children,
  tone = "",
}: {
  label: string;
  badge: ReactNode;
  value: string;
  unit?: string;
  children: ReactNode;
  tone?: string;
}) {
  return (
    <article className="wt-metric">
      <div className="wt-metric-label">
        <h2>{label}</h2>
        {badge}
      </div>
      <div className={`wt-metric-value ${tone}`}>
        {value}
        <span>{unit}</span>
      </div>
      <div className="wt-metric-detail">{children}</div>
    </article>
  );
}
function Field({
  label,
  children,
  tone = "",
}: {
  label: string;
  children: ReactNode;
  tone?: string;
}) {
  return (
    <div className="wt-field">
      <span>{label}</span>
      <strong className={tone}>{children}</strong>
    </div>
  );
}
function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function ResetDialog({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="wt-modal"
      aria-labelledby="wt-reset-title"
      onCancel={onCancel}
    >
      <h2 id="wt-reset-title">Start a new demo session?</h2>
      <p>
        This clears the current demo trail, workflow and event log. Export the
        CSV first if you want to keep it.
      </p>
      <div>
        <button autoFocus className="wt-button" onClick={onCancel}>
          Cancel
        </button>
        <button className="wt-button primary" onClick={onConfirm}>
          Start new demo
        </button>
      </div>
    </dialog>
  );
}
export default function WildlifeTracker({ visible }: { visible: boolean }) {
  const [state, dispatch] = useReducer(trackerReducer, undefined, () =>
    createDemo(),
  );
  const [resetOpen, setResetOpen] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const id = setInterval(() => dispatch({ type: "tick" }), 1000);
    return () => clearInterval(id);
  }, []);
  const latest = state.fixes.at(-1);
  const latestTime = latest ? Date.parse(latest.timestamp) : null;
  const tagFresh = isFresh(latestTime, state.now);
  const uavFresh = isFresh(state.uavUpdatedAt, state.now);
  const separation = currentSeparation(state);
  const safe = separation !== null && separation >= 100;
  const end = Math.min(
    (state.trajectoryStartedAt ?? state.now) + TRAJECTORY_MS,
    state.windowEndsAt,
  );
  const complete = state.trajectoryStartedAt !== null && state.now >= end;
  const windowOver = state.now >= state.windowEndsAt;
  const gaps = recordingGaps(state.fixes);
  const status =
    separation === null
      ? "SEPARATION UNKNOWN"
      : !safe
        ? "SEPARATION WARNING"
        : windowOver
          ? "FLIGHT WINDOW ENDED"
          : complete
            ? "TRAJECTORY COMPLETE"
            : state.trajectoryStartedAt === null
              ? "READY FOR TRACKING"
              : "SAFE TRACKING · ACTIVE";
  const statusTone =
    separation === null || windowOver ? "amber" : safe ? "green" : "red";
  const firstTime = state.fixes[0]
    ? Date.parse(state.fixes[0].timestamp)
    : null;
  const age =
    latestTime === null ? "—" : ((state.now - latestTime) / 1000).toFixed(1);
  const startEnabled =
    state.attached && safe && !windowOver && state.trajectoryStartedAt === null;
  const stage =
    state.trajectoryStartedAt !== null && !complete
      ? 4
      : complete
        ? state.exported
          ? 6
          : 5
        : state.attached
          ? 3
          : state.targetConfirmed
            ? 2
            : 1;

  const steps = [
    {
      title: "Locate target",
      detail: state.targetConfirmed
        ? "Target verified"
        : "Check bands on all four legs",
      done: state.targetConfirmed,
    },
    {
      title: "Confirm attachment",
      detail: state.attached
        ? "Hook-and-loop · operator verified"
        : "One tag · visual confirmation",
      done: state.attached,
    },
    {
      title: "Reach safe UAV offset (≥100 m)",
      detail:
        separation === null
          ? "Position unavailable"
          : `${separation.toFixed(1)} m horizontal`,
      done: safe && state.attached,
    },
    {
      title: "Five-minute trajectory",
      detail: complete
        ? "Complete · maintain offset"
        : state.trajectoryStartedAt !== null
          ? `${timer(end - state.now)} remaining`
          : "Starts at safe offset",
      done: complete,
    },
    {
      title: "Export tracking CSV",
      detail: state.exported
        ? "Exported locally"
        : `${state.fixes.length} fixes recorded`,
      done: state.exported,
    },
    {
      title: "Confirm submission",
      detail: state.submitted
        ? "Marked submitted by operator"
        : "Separate from file export",
      done: state.submitted,
    },
  ];
  const exportCSV = () => {
    download(
      "aurora-demo-tracking.csv",
      trackingCSV(state.fixes),
      "text/csv;charset=utf-8",
    );
    dispatch({ type: "export" });
    setNotice(
      "Demo CSV downloaded. Export does not submit a file to the judges.",
    );
  };
  return (
    <main className="wt-dashboard">
      <div className="wt-demo-bar">
        <div>
          <span className="wt-demo-label">DEMO MODE</span>
          <span>Simulated tag + UAV telemetry. Backend not connected.</span>
        </div>
        <div className="wt-demo-controls">
          <label htmlFor="wt-scenario">Preview state</label>
          <select
            id="wt-scenario"
            value={state.scenario}
            onChange={(e) =>
              dispatch({ type: "scenario", value: e.target.value as Scenario })
            }
          >
            <option value="tracking">Safe tracking</option>
            <option value="unsafe">Separation warning</option>
            <option value="tag-lost">Tag link lost</option>
            <option value="uav-lost">UAV link lost</option>
            <option value="no-data">Both links lost</option>
          </select>
          <button onClick={() => dispatch({ type: "pause" })}>
            {state.paused ? <Play size={13} /> : <Pause size={13} />}
            {state.paused ? "Resume demo" : "Pause demo"}
          </button>
          <button onClick={() => setResetOpen(true)}>
            <RotateCcw size={13} />
            New session
          </button>
        </div>
      </div>
      <header className="wt-header">
        <div className="wt-brand">
          <div className="wt-logo">A</div>
          <div>
            <div className="wt-brand-title">
              PROJECT AURORA <Badge>WILDLIFE OPS</Badge>
            </div>
            <p>
              Ground Control Station <span>/ Wildlife Tracker (WL-TAG-74)</span>
            </p>
          </div>
        </div>
        <div className="wt-global-status">
          <Badge tone={tagFresh ? "green" : "amber"}>
            {tagFresh ? <Radio size={13} /> : <WifiOff size={13} />}
            {tagFresh ? "TAG-74 LINKED · DEMO" : "TAG-74 STALE"}
          </Badge>
          <span className="wt-status-chip">
            RSSI <b>{tagFresh ? "−78 dBm" : "—"}</b>
            <span>
              SNR <b>{tagFresh ? "+9.2 dB" : "—"}</b>
            </span>
          </span>
          <span className="wt-status-chip">
            Last fix <b className={tagFresh ? "cyan" : "amber"}>{age} s ago</b>
          </span>
          <Badge tone="amber">
            <Clock3 size={13} />
            FLIGHT WINDOW {timer(state.windowEndsAt - state.now)}
          </Badge>
          <span className="wt-status-chip">
            UAV <b>{uavFresh ? "24.8 V" : "—"}</b> SAT{" "}
            <b className="cyan">{uavFresh ? "16" : "—"}</b>
          </span>
          <Badge tone={statusTone}>
            {safe ? <ShieldCheck size={13} /> : <ShieldAlert size={13} />}
            {status}
          </Badge>
        </div>
      </header>
      {state.paused && (
        <div className="wt-message amber">
          Demo paused — telemetry and demo timers are frozen.
        </div>
      )}
      <section className="wt-metrics" aria-label="Tracking metrics">
        <Metric
          label="UAV-to-animal separation"
          badge={<Badge>GPS DISTANCE</Badge>}
          value={separation === null ? "—" : separation.toFixed(1)}
          unit="m"
          tone={separation === null ? "amber" : safe ? "cyan" : "red"}
        >
          <div className="wt-spread">
            <span>Minimum: 100 m</span>
            <span className={safe ? "green" : "amber"}>
              {separation === null
                ? "UNKNOWN · STALE DATA"
                : safe
                  ? `✓ OFFSET +${(separation - 100).toFixed(1)} m`
                  : "BELOW MINIMUM"}
            </span>
          </div>
          <div className="wt-gauge">
            <span
              style={{
                width: `${Math.min(100, (separation ?? 0) / 2)}%`,
                background: safe ? "var(--accent-green)" : "var(--accent-red)",
              }}
            />
          </div>
        </Metric>
        <Metric
          label="Trajectory time remaining"
          badge={
            <Badge tone="amber">
              {complete
                ? "DONE"
                : state.trajectoryStartedAt === null
                  ? "READY"
                  : "REC"}
            </Badge>
          }
          value={
            state.trajectoryStartedAt === null
              ? "05:00"
              : timer(end - state.now)
          }
          unit="/ 05:00"
        >
          <div className="wt-spread">
            <span>{complete ? "Trajectory ended" : `Stage ${stage} of 6`}</span>
            <span>
              {state.trajectoryStartedAt === null
                ? "Awaiting safe offset"
                : `Start ${utc(state.trajectoryStartedAt)}`}
            </span>
          </div>
        </Metric>
        <Metric
          label="Estimated GNSS accuracy"
          badge={
            <Badge tone={tagFresh ? "green" : "amber"}>
              {tagFresh ? "DEMO RTK" : "STALE"}
            </Badge>
          }
          value={tagFresh ? "±0.65" : "—"}
          unit="m"
          tone={tagFresh ? "green" : "amber"}
        >
          <div className="wt-spread">
            <span>{tagFresh ? "14 satellites" : "Fix unavailable"}</span>
            <span>{tagFresh ? "HDOP 0.85" : "HDOP —"}</span>
          </div>
          <span className="wt-microcopy">
            Receiver estimate · not true-path scoring accuracy
          </span>
        </Metric>
        <Metric
          label="Latest tracker fix age"
          badge={<Badge>{tagFresh ? "1.0 Hz DEMO" : "NO UPDATES"}</Badge>}
          value={age}
          unit="s"
          tone={tagFresh ? "" : "amber"}
        >
          <div className="wt-spread">
            <span>Freshness limit: 3 s</span>
            <span className={tagFresh ? "green" : "amber"}>
              {tagFresh ? "● Receiving" : "● Stale position"}
            </span>
          </div>
        </Metric>
      </section>
      <section className="wt-workspace">
        <TrackerMap
          fixes={state.fixes}
          uav={state.uav}
          fresh={tagFresh}
          uavFresh={uavFresh}
          separation={separation}
          visible={visible}
        />
        <aside className="wt-sidebar">
          <section className="wt-panel">
            <div className="wt-panel-heading">
              <h2>
                <Satellite size={16} />
                Tracker Telemetry & Status
              </h2>
              <Badge>WL-TAG-74</Badge>
            </div>
            <div className="wt-panel-body">
              <div className="wt-field-grid">
                <Field
                  label="GNSS fix status"
                  tone={tagFresh ? "green" : "amber"}
                >
                  {tagFresh ? "● RTK fixed (demo)" : "● Stale / unavailable"}
                </Field>
                <Field label="Tag battery">
                  {tagFresh ? (
                    <>
                      3.92 V <small className="green">84%</small>
                    </>
                  ) : (
                    "—"
                  )}
                </Field>
                <Field label="Latitude">
                  {tagFresh && latest ? `${latest.latitude.toFixed(7)}°` : "—"}
                </Field>
                <Field label="Longitude">
                  {tagFresh && latest ? `${latest.longitude.toFixed(7)}°` : "—"}
                </Field>
                <Field label="Satellites / HDOP">
                  {tagFresh ? "14 sats / 0.85" : "—"}
                </Field>
                <Field label="RF link (demo)">
                  {tagFresh ? "−78 dBm / +9.2 dB" : "—"}
                </Field>
              </div>
              <div className="wt-timestamp">
                <span>FIX TIME · UTC</span>
                <b>{latest?.timestamp ?? "—"}</b>
              </div>
              <p className="wt-helper">
                All measurements are illustrative. Missing live fields will
                display —.
              </p>
            </div>
          </section>
          <section className="wt-panel wt-workflow">
            <div className="wt-panel-heading">
              <h2>
                <ListChecks size={16} />
                Mission Workflow
              </h2>
              <Badge tone="green">STAGE {stage} OF 6</Badge>
            </div>
            <div className="wt-panel-body">
              <ol className="wt-steps">
                {steps.map((step, i) => (
                  <li
                    key={step.title}
                    className={
                      stage === i + 1 && !step.done
                        ? "active"
                        : step.done
                          ? "done"
                          : ""
                    }
                  >
                    <span className="wt-step-icon">
                      {step.done ? <Check size={12} /> : i + 1}
                    </span>
                    <div>
                      <span>{step.title}</span>
                      <small>{step.detail}</small>
                    </div>
                    {stage === i + 1 && !step.done && (
                      <span className="wt-dot cyan" />
                    )}
                  </li>
                ))}
              </ol>
              <div className="wt-workflow-actions">
                {!state.targetConfirmed && (
                  <button
                    className="wt-button primary"
                    onClick={() => dispatch({ type: "confirm-target" })}
                  >
                    <Crosshair size={14} />
                    Confirm target identified
                  </button>
                )}
                {state.targetConfirmed && !state.attached && (
                  <button
                    className="wt-button primary"
                    onClick={() => dispatch({ type: "attach" })}
                  >
                    <Check size={14} />
                    Confirm one tag attached
                  </button>
                )}
                {state.attached && state.trajectoryStartedAt === null && (
                  <button
                    className="wt-button primary"
                    disabled={!startEnabled}
                    onClick={() => dispatch({ type: "start" })}
                  >
                    <Play size={14} />
                    Start trajectory at safe offset
                  </button>
                )}
                <p
                  className={
                    safe ? "wt-offset-note green" : "wt-offset-note amber"
                  }
                >
                  {safe ? <ShieldCheck size={15} /> : <ShieldAlert size={15} />}
                  {separation === null
                    ? "Separation unknown. Fresh UAV and tag fixes required."
                    : safe
                      ? "Maintain ≥100 m offset for the rest of the flight window."
                      : "UAV is inside the 100 m minimum offset."}
                </p>
              </div>
            </div>
          </section>
        </aside>
      </section>
      <section className="wt-bottom-grid">
        <section className="wt-panel wt-recording">
          <div className="wt-panel-heading">
            <h2>
              <FileSpreadsheet size={17} />
              Telemetry Recording & CSV Export
            </h2>
            <Badge tone={tagFresh ? "green" : "amber"}>
              {state.fixes.length} FIXES ·{" "}
              {tagFresh ? "RECORDING" : "WAITING FOR LINK"}
            </Badge>
          </div>
          <div className="wt-panel-body">
            <div className="wt-recording-stats">
              <span>
                Duration{" "}
                <b>
                  {firstTime !== null && latestTime !== null
                    ? timer(latestTime - firstTime)
                    : "—"}
                </b>
              </span>
              <span>
                Coverage{" "}
                <b>
                  {firstTime === null ? "—" : utc(firstTime)} —{" "}
                  {latestTime === null ? "—" : utc(latestTime)}
                </b>
              </span>
              <span className={gaps ? "amber" : "green"}>
                Update gaps: {gaps}
                {!tagFresh ? " + ongoing outage" : ""}
              </span>
            </div>
            <div className="wt-csv-wrap">
              <div className="wt-csv-header">timestamp,latitude,longitude</div>
              <table className="wt-csv">
                <thead>
                  <tr>
                    <th>Timestamp (UTC)</th>
                    <th>Latitude</th>
                    <th>Longitude</th>
                  </tr>
                </thead>
                <tbody>
                  {state.fixes.slice(-5).map((f) => (
                    <tr key={f.timestamp}>
                      <td>{f.timestamp}</td>
                      <td>{f.latitude.toFixed(7)}</td>
                      <td>{f.longitude.toFixed(7)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="wt-export-actions">
              <button
                className="wt-button primary"
                disabled={!state.fixes.length}
                onClick={exportCSV}
              >
                <ArrowDownToLine size={15} />
                Export Tracking CSV
              </button>
              <button
                className="wt-button"
                disabled={!state.exported || state.submitted}
                onClick={() => {
                  dispatch({ type: "submit" });
                  setNotice(
                    "Demo submission marked by operator. No file was sent.",
                  );
                }}
              >
                <FileCheck2 size={15} />
                {state.submitted
                  ? "Marked submitted"
                  : "Mark as submitted (demo)"}
              </button>
            </div>
            <p className="wt-helper">
              ISO 8601 UTC · Decimal degrees · Chronological order · 3-column
              submission format
            </p>
            {!complete && (
              <p className="wt-helper">
                Export available now. Full five-minute trajectory is not yet
                complete.
              </p>
            )}
            <p className="wt-helper">
              Demo download only. Submission to judges is a separate operator
              action.
            </p>
            <div className="wt-notice" role="status">
              {notice}
            </div>
          </div>
        </section>
        <section className="wt-panel wt-log">
          <div className="wt-panel-heading">
            <h2>
              <Activity size={16} />
              Mission Event Log
            </h2>
            <Badge>DEMO SESSION</Badge>
          </div>
          <div className="wt-panel-body">
            <div
              className="wt-event-list"
              role="log"
              aria-label="Mission events"
              aria-live="off"
            >
              {state.events.map((event, i) => (
                <div className="wt-event" key={`${event.timestamp}-${i}`}>
                  <time>{utc(Date.parse(event.timestamp))}</time>
                  <b
                    className={
                      event.kind === "WARN"
                        ? "amber"
                        : event.kind === "OPR"
                          ? "green"
                          : "cyan"
                    }
                  >
                    [{event.kind}]
                  </b>
                  <span>{event.message}</span>
                </div>
              ))}
            </div>
            <button
              className="wt-text-button"
              onClick={() =>
                download(
                  "aurora-demo-events.log",
                  [...state.events]
                    .reverse()
                    .map((e) => `${e.timestamp} [${e.kind}] ${e.message}`)
                    .join("\n"),
                  "text/plain;charset=utf-8",
                )
              }
            >
              <ArrowDownToLine size={13} />
              Download event log
            </button>
          </div>
        </section>
      </section>
      <footer className="wt-footer">
        <span>PROJECT AURORA / WILDLIFE TRACKER</span>
        <span>UI PROTOTYPE · SIMULATED DATA · NO AIRCRAFT COMMANDS</span>
      </footer>
      {resetOpen && (
        <ResetDialog
          onCancel={() => setResetOpen(false)}
          onConfirm={() => {
            dispatch({ type: "reset", now: Date.now() });
            setNotice("");
            setResetOpen(false);
          }}
        />
      )}
    </main>
  );
}
