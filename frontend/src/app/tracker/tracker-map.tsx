import { useEffect, useMemo, useRef, useState } from "react";
import {
  Circle,
  MapContainer,
  Marker,
  Polygon,
  Polyline,
  ScaleControl,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import { divIcon, type Map as LeafletMap } from "leaflet";
import {
  Crosshair,
  LocateFixed,
  Map as MapIcon,
  Minus,
  Plus,
} from "lucide-react";
import type { Position, TrackerFix } from "./tracker-model";
import { offset, SEARCH_CENTER } from "./tracker-model";
import "leaflet/dist/leaflet.css";
const pair = (p: Position): [number, number] => [p.latitude, p.longitude];
const BOUNDARY = [
  offset(SEARCH_CENTER, -160, -170),
  offset(SEARCH_CENTER, 300, -170),
  offset(SEARCH_CENTER, 300, 310),
  offset(SEARCH_CENTER, -160, 310),
].map(pair);
const animalIcon = divIcon({
  className: "wt-marker",
  html: '<span class="wt-animal-dot"><span></span></span>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});
const uavIcon = divIcon({
  className: "wt-marker",
  html: '<span class="wt-uav-dot">➤</span>',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});
function ResizeMap({
  visible,
  points,
}: {
  visible: boolean;
  points: [number, number][];
}) {
  const map = useMap();
  const latestPoints = useRef(points);
  useEffect(() => {
    latestPoints.current = points;
  }, [points]);
  useEffect(() => {
    if (!visible) return;
    const fit = () => {
      map.invalidateSize();
      if (latestPoints.current.length)
        map.fitBounds(latestPoints.current, { padding: [45, 45], maxZoom: 17 });
    };
    const observer = new ResizeObserver(fit);
    observer.observe(map.getContainer());
    fit();
    return () => observer.disconnect();
  }, [map, visible]);
  return null;
}
export default function TrackerMap({
  fixes,
  uav,
  fresh,
  uavFresh,
  separation,
  visible,
}: {
  fixes: TrackerFix[];
  uav: Position | null;
  fresh: boolean;
  uavFresh: boolean;
  separation: number | null;
  visible: boolean;
}) {
  const [map, setMap] = useState<LeafletMap | null>(null);
  const [layer, setLayer] = useState<"grid" | "street">("grid");
  const [tileError, setTileError] = useState(false);
  const last = fixes.at(-1);
  const trailSegments = useMemo(() => {
    const segments: [number, number][][] = [];
    fixes.forEach((fix, i) => {
      if (
        i === 0 ||
        Date.parse(fix.timestamp) - Date.parse(fixes[i - 1].timestamp) > 2000
      )
        segments.push([]);
      segments.at(-1)!.push(pair(fix));
    });
    return segments;
  }, [fixes]);
  const focusPoints = [
    pair(SEARCH_CENTER),
    ...(last
      ? [
          pair(offset(last, 110, 0)),
          pair(offset(last, -110, 0)),
          pair(offset(last, 0, 110)),
          pair(offset(last, 0, -110)),
        ]
      : []),
    ...(uav ? [pair(uav)] : []),
  ];
  const fit = () => {
    const points = [
      ...fixes.map(pair),
      ...focusPoints,
      ...(uav ? [pair(uav)] : []),
      pair(SEARCH_CENTER),
    ];
    map?.fitBounds(points, { padding: [85, 85], maxZoom: 18 });
  };
  return (
    <section className="wt-panel wt-map-panel" aria-label="Tracker map">
      <div className="wt-panel-heading">
        <h2>
          <MapIcon size={17} /> Geofence & Trajectory Map
        </h2>
        <div className="wt-map-tools">
          <div className="wt-segment" aria-label="Map layer">
            <button
              aria-pressed={layer === "grid"}
              onClick={() => setLayer("grid")}
            >
              Tactical grid
            </button>
            <button
              aria-pressed={layer === "street"}
              onClick={() => {
                setLayer("street");
                setTileError(false);
              }}
            >
              Street
            </button>
          </div>
          <button
            className="wt-icon-button"
            aria-label="Zoom in"
            onClick={() => map?.zoomIn()}
          >
            <Plus size={14} />
          </button>
          <button
            className="wt-icon-button"
            aria-label="Zoom out"
            onClick={() => map?.zoomOut()}
          >
            <Minus size={14} />
          </button>
          <button className="wt-small-button" onClick={fit}>
            <Crosshair size={13} /> Fit trail
          </button>
          <button
            className="wt-small-button"
            disabled={!uav}
            onClick={() => uav && map?.setView(pair(uav), 18)}
          >
            <LocateFixed size={13} /> UAV
          </button>
        </div>
      </div>
      <div className="wt-map-area">
        <MapContainer
          ref={setMap}
          center={pair(offset(SEARCH_CENTER, 65, 70))}
          zoom={17}
          zoomControl={false}
          className="wt-leaflet-map"
        >
          <ResizeMap visible={visible} points={focusPoints} />
          {layer === "street" && (
            <TileLayer
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              eventHandlers={{ tileerror: () => setTileError(true) }}
            />
          )}
          <Polygon
            positions={BOUNDARY}
            pathOptions={{
              color: "#f43f5e",
              weight: 1.5,
              dashArray: "7 7",
              fillOpacity: 0.015,
            }}
          >
            <Tooltip sticky>
              Illustrative demo boundary · replace with flight boundary
            </Tooltip>
          </Polygon>
          <Circle
            center={pair(SEARCH_CENTER)}
            radius={25}
            pathOptions={{
              color: "#00d4ff",
              weight: 1,
              dashArray: "4 5",
              fillOpacity: 0.07,
            }}
          >
            <Tooltip>25 m target search area · demo centre</Tooltip>
          </Circle>
          {last && (
            <Circle
              center={pair(last)}
              radius={100}
              pathOptions={{
                color:
                  separation === null
                    ? "#8fa3c2"
                    : separation < 100
                      ? "#f43f5e"
                      : "#f59e0b",
                weight: 1.5,
                dashArray: "8 6",
                fillOpacity: 0.025,
              }}
            >
              <Tooltip>
                100 m minimum horizontal offset
                {!fresh ? " · last known centre" : ""}
              </Tooltip>
            </Circle>
          )}
          {trailSegments.map((segment, i) => (
            <Polyline
              key={i}
              positions={segment}
              pathOptions={{
                color: "#00d4ff",
                weight: 3,
                opacity: fresh ? 0.95 : 0.4,
              }}
            />
          ))}
          {last && uav && (
            <Polyline
              positions={[pair(last), pair(uav)]}
              pathOptions={{
                color:
                  separation === null
                    ? "#8fa3c2"
                    : separation >= 100
                      ? "#10e88a"
                      : "#f43f5e",
                weight: 1,
                dashArray: "5 5",
              }}
            />
          )}
          {last && (
            <Marker
              position={pair(last)}
              icon={animalIcon}
              opacity={fresh ? 1 : 0.45}
            >
              <Tooltip permanent direction="top" offset={[0, -14]}>
                <b>● TAG-74</b> / Decoy deer{!fresh ? " · STALE" : ""}
              </Tooltip>
            </Marker>
          )}
          {uav && (
            <Marker
              position={pair(uav)}
              icon={uavIcon}
              opacity={uavFresh ? 1 : 0.45}
            >
              <Tooltip permanent direction="top" offset={[0, -14]}>
                <b>AURORA-1</b> / UAV{!uavFresh ? " · STALE" : ""}
              </Tooltip>
            </Marker>
          )}
          <ScaleControl position="bottomleft" imperial={false} />
        </MapContainer>
        <div className="wt-map-caption">
          <span>SIMULATED POSITIONS</span>
          <span>BOUNDARY FOR DEMONSTRATION ONLY</span>
        </div>
        {tileError && layer === "street" && (
          <button className="wt-map-error" onClick={() => setLayer("grid")}>
            Map tiles unavailable · use tactical grid
          </button>
        )}
      </div>
      <div className="wt-map-legend">
        <span>
          <i className="wt-line cyan" />
          Animal trail
        </span>
        <span>
          <i className="wt-line amber" />
          100 m offset
        </span>
        <span>
          <i className="wt-dot green" />
          UAV position
        </span>
        <span>
          <i className="wt-line red" />
          Demo boundary
        </span>
        <span>
          <i className="wt-line cyan dashed" />
          25 m target search
        </span>
      </div>
      <div className="wt-map-foot">
        Drag to pan · Scroll to zoom{" "}
        <span>Horizontal distance from GPS coordinates</span>
      </div>
    </section>
  );
}
