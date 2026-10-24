# Telemetry packet contract

`Backend/telemetry_packet.py` defines a local, validated AEAC telemetry sample.
Source: October 2 meeting overview and ConOps v1.0, page 20.
The names below are local application names. Confirm the competition server's
schema before implementing a wire-format adapter; this model is not yet a sender.

| Field | Type | Meaning / accepted range |
| --- | --- | --- |
| `uav_id` | string | Bidder-defined, nonblank; surrounding whitespace stripped |
| `timestamp` | float | Unix seconds UTC, fractional seconds allowed, >= 0 |
| `latitude` | float | Decimal degrees, -90 to 90 |
| `longitude` | float | Decimal degrees, -180 to 180 |
| `altitude_agl_m` | float | Metres above local terrain, >= 0 |
| `horizontal_accuracy_m` | float | Position accuracy in metres, >= 0 |
| `vertical_accuracy_m` | float | Position accuracy in metres, >= 0 |
| `battery_percentage` | float | 0 to 100 |
| `flight_mode` | string | off, idle, link-lost, failsafe, armed-pilot, armed-automatic |
| `rc_link_status` | float | 0 to 1; 1 is best |
| `telemetry_link_status` | float | 0 to 1; 1 is best |

All fields are mandatory and non-null. Numeric fields accept JSON numbers,
including integers, but reject numeric strings, booleans, NaN, and infinity.
Unexpected fields are rejected. Instances are immutable after validation.
Nonnegative timestamp/AGL/accuracy checks are local validation choices; the
source documents do not provide a full wire-level validation specification.

Unavailable measurements remain `None` in acquisition state. Do not substitute
zero, clip invalid inputs into range, or use MAVLink unknown sentinels as real
measurements. Zero is accepted where valid, so the producer must establish
measurement validity before constructing a packet. Battery voltage is not battery
percentage; HDOP is not accuracy in metres; home-relative and MSL altitude are
not automatically AGL. The dashboard mission status is not an aircraft flight mode,
and the browser WebSocket connection is not aircraft telemetry-link quality.

Example, using illustrative values only:

```python
from telemetry_packet import TelemetryPacket

packet = TelemetryPacket(
    uav_id="aurora-01",
    timestamp=1810405350.2,
    latitude=49.2488,
    longitude=-122.9805,
    altitude_agl_m=100.0,
    horizontal_accuracy_m=2.5,
    vertical_accuracy_m=4.0,
    battery_percentage=75.0,
    flight_mode="armed-automatic",
    rc_link_status=0.95,
    telemetry_link_status=0.9,
)
local_json = packet.model_dump_json()
```

Later work must define acquisition/mapping, per-field freshness thresholds,
timestamp provenance and clock synchronization, link-quality calculations,
AGL sourcing, and the server adapter and 1 Hz sender. Model validation alone
cannot prove freshness or measurement accuracy. The existing dashboard snapshot
and MAVLink reader are unchanged.

Run contract checks from the project root:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s Backend -p 'test_*.py' -v
```
