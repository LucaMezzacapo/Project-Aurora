# Setup

Ground control dashboard fed by a local MAVLink sim.
Flow: **sim → backend → websocket → frontend dashboard**.

## Prerequisites
- Python 3.10+
- Node.js 18+ (with npm)

## Install (one-time)

```bash
git clone https://github.com/LucaMezzacapo/Project-Aurora.git
cd Project-Aurora

# Backend + sim
cd Backend
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Frontend
cd ../frontend
npm install
```

## Run (three terminals, in order)

Start the sim **first** — the backend waits ~15s for its heartbeat, then gives up.

**1. Sim** — from `Project-Aurora/Backend`
```bash
source .venv/bin/activate
python sim.py
```

**2. Backend** — from `Project-Aurora/Backend`
```bash
source .venv/bin/activate
uvicorn mavlink:app --reload
```

**3. Frontend** — from `Project-Aurora/frontend`
```bash
npm run dev
```

Open **http://localhost:5173** — you should see the plane flying circles over Burnaby.

## Optional: simulated traffic (Task 1 keep-out zones)

Adds other aircraft with keep-out zones from a mock competition server. Without these steps nothing changes.

**4. Mock competition server** — from `Project-Aurora/Backend`, in a fourth terminal
```bash
source .venv/bin/activate
python mock_comp_server.py                          # scripted: a keep-out entry every lap
python mock_comp_server.py --scenario random        # or random traffic
```

Then start the **backend** (step 2) with the traffic URL instead:
```bash
AURORA_TRAFFIC_URL=ws://127.0.0.1:8765 uvicorn mavlink:app --reload
# Windows PowerShell: $env:AURORA_TRAFFIC_URL="ws://127.0.0.1:8765"; uvicorn mavlink:app --reload
```

Details, flags and what to expect: [docs/traffic-sim.md](docs/traffic-sim.md).

## Notes
- Ports: **5760** sim, **8000** backend, **5173** frontend, **8765** mock traffic server (optional) — keep them free.
- Restart the sim → restart the backend (it only connects once, at startup).
- Backend reads the local sim (`tcp:127.0.0.1:5760` in `Backend/mavlink.py`), not the remote drone.
