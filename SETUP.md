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

## Notes
- Ports: **5760** sim, **8000** backend, **5173** frontend — keep them free.
- Restart the sim → restart the backend (it only connects once, at startup).
- Backend reads the local sim (`tcp:127.0.0.1:5760` in `Backend/mavlink.py`), not the remote drone.
