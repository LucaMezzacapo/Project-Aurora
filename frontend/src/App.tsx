import { lazy, Suspense, useState } from "react";
import WildlifeTracker from "./app/tracker/wildlife-tracker";
import "./app/tracker/tracker.css";

const FlightDashboard = lazy(() => import("./app/app"));

export default function App() {
  const [screen, setScreen] = useState<"flight" | "tracker">("tracker");
  const [flightVisited, setFlightVisited] = useState(false);
  return (
    <>
      <nav className="aurora-screen-nav" aria-label="Dashboard navigation">
        <span className="aurora-nav-brand">
          AURORA <span>/ WORKSPACE</span>
        </span>
        <div>
          <button
            aria-current={screen === "flight" ? "page" : undefined}
            onClick={() => {
              setFlightVisited(true);
              setScreen("flight");
            }}
          >
            Flight Dashboard
          </button>
          <button
            aria-current={screen === "tracker" ? "page" : undefined}
            onClick={() => setScreen("tracker")}
          >
            Wildlife Tracker
          </button>
        </div>
        <span className="aurora-nav-note">GROUND CONTROL</span>
      </nav>
      <div hidden={screen !== "tracker"}>
        <WildlifeTracker visible={screen === "tracker"} />
      </div>
      <div hidden={screen !== "flight"}>
        {flightVisited && (
          <Suspense
            fallback={
              <p className="aurora-loading">Loading flight dashboard…</p>
            }
          >
            <FlightDashboard />
          </Suspense>
        )}
      </div>
    </>
  );
}
