# Validated local telemetry contract for AEAC reporting.
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, StringConstraints

FlightMode = Literal[
    "off", "idle", "link-lost", "failsafe", "armed-pilot", "armed-automatic"
]


class TelemetryPacket(BaseModel):
    model_config = ConfigDict(
        strict=True, extra="forbid", allow_inf_nan=False, frozen=True
    )

    uav_id: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1)
    ] = Field(description="Bidder-defined UAV identifier; must not be blank.")
    
    timestamp: float = Field(ge=0, 
        description="Sample timestamp in Unix seconds UTC; fractions allowed."
    )
    
    latitude: float = Field(ge=-90, le=90, 
                description="Latitude in decimal degrees."
    )
    
    longitude: float = Field(ge=-180, le=180, 
        description="Longitude in decimal degrees."
    )
    
    altitude_agl_m: float = Field(
        ge=0,
        description="Height above local terrain in meters, not MSL or home-relative altitude.",
    )
    
    horizontal_accuracy_m: float = Field(
        ge=0, description="Horizontal position accuracy in meters; not HDOP."
    )
    
    vertical_accuracy_m: float = Field(
        ge=0, description="Vertical position accuracy in meters; not VDOP."
    )
    
    battery_percentage: float = Field(ge=0, le=100, description="Battery percentage, 0 to 100.")
    
    flight_mode: FlightMode
    
    rc_link_status: float = Field(ge=0, le=1, 
        description="Bidder-defined RC-link quality; 1 is best."
    )
    
    telemetry_link_status: float = Field( ge=0, le=1, 
        description="Bidder-defined aircraft telemetry-link quality; 1 is best."
    )