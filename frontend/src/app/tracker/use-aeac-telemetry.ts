import { useEffect, useState } from "react";
import { decodeAeacFrame, observedRate, streamStatus } from "./aeac-telemetry";
import type { AeacFrame } from "./aeac-telemetry";

type Feed = {
  connection: "connecting" | "connected" | "disconnected";
  frame: AeacFrame | null;
  receivedAt: number | null;
  arrivals: number[];
  error: string | null;
};
const INITIAL_FEED: Feed = {
  connection: "connecting", frame: null, receivedAt: null, arrivals: [], error: null,
};
const WS_URL = import.meta.env.VITE_TELEMETRY_WS_URL ?? "ws://127.0.0.1:8000/ws/telemetry";

export async function startTask2Demo() {
  const url = new URL("/practice/task2/start", WS_URL);
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  const response = await fetch(url, { method: "POST" });
  if (!response.ok) throw new Error("Could not start the demo. Check the simulator connection and retry.");
}

export function useAeacTelemetry() {
  const [feed, setFeed] = useState<Feed>(INITIAL_FEED);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let disposed = false;
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      if (disposed) return;
      setFeed(previous => ({ ...previous, connection: "connecting", arrivals: [] }));
      const disconnected = () => {
        if (disposed) return;
        setFeed(previous => ({ ...previous, connection: "disconnected", arrivals: [] }));
        retry = setTimeout(connect, 2000);
      };
      try {
        const ws = new WebSocket(WS_URL);
        socket = ws;
        ws.onopen = () => {
          if (!disposed) setFeed(previous => ({ ...previous, connection: "connected", error: null }));
        };
        ws.onmessage = event => {
          if (disposed) return;
          try {
            const frame = decodeAeacFrame(JSON.parse(event.data));
            const receivedAt = Date.now();
            const arrival = performance.now();
            setFeed(previous => ({
              connection: "connected", frame, receivedAt,
              arrivals: [...previous.arrivals.slice(-9), arrival], error: null,
            }));
          } catch (error) {
            setFeed(previous => ({
              ...previous, error: error instanceof Error ? error.message : "Cannot read backend telemetry.",
            }));
          }
        };
        ws.onerror = () => ws.close();
        ws.onclose = disconnected;
      } catch (error) {
        setFeed(previous => ({ ...previous, error: error instanceof Error ? error.message : "Cannot connect." }));
        disconnected();
      }
    };
    connect();
    const clock = setInterval(() => setNow(Date.now()), 500);
    return () => {
      disposed = true;
      clearInterval(clock);
      clearTimeout(retry);
      socket?.close();
    };
  }, []);
  const status = streamStatus(feed.connection, feed.receivedAt, now);
  return {
    ...feed, status, now: Math.max(now, feed.receivedAt ?? 0),
    rate: status === "receiving" && !feed.error ? observedRate(feed.arrivals) : null,
    ageSeconds: feed.receivedAt === null ? null : Math.max(0, (now - feed.receivedAt) / 1000),
  };
}
