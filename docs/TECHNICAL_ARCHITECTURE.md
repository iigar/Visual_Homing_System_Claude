# Technical Architecture — Visual Homing System

## 1. System Overview

```
┌────────────────────────────────────────────────────────────────────────┐
│                        VISUAL HOMING SYSTEM                            │
│                    Optical Navigation for ArduPilot                    │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌──────────────┐    MAVLink/UART    ┌──────────────────┐             │
│  │   ArduPilot  │◄──────────────────►│  Raspberry Pi    │             │
│  │    (FC)      │   VISION_POSITION  │  Zero 2W         │             │
│  │  Matek H743  │   ESTIMATE         │                  │             │
│  └──────────────┘                    │  ┌────────────┐  │             │
│         │                            │  │   Camera   │  │             │
│         ▼                            │  └─────┬──────┘  │             │
│  ┌──────────────┐                    │        │          │             │
│  │  EKF3        │                    │  ┌─────▼──────┐  │             │
│  │  ExternalNav │                    │  │   Visual   │  │             │
│  └──────────────┘                    │  │  Odometry  │  │             │
│                                      │  └─────┬──────┘  │             │
│                                      │        │          │             │
│                                      │  ┌─────▼──────┐  │             │
│                                      │  │   Route    │  │             │
│                                      │  │  Recorder  │  │             │
│                                      │  └────────────┘  │             │
│                                      └──────────────────┘             │
│                                              │ HTTP/WebSocket          │
│                                      ┌───────▼──────────┐             │
│                                      │   Web Interface  │             │
│                                      │  React+Three.js  │             │
│                                      └──────────────────┘             │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Visual Odometry (firmware/python/vision/visual_odometry.py)

**Goal:** Estimate drone displacement from sequential camera frames.

**Algorithm:**
```
1. Capture frame from camera
2. Detect features — ORB (Oriented FAST and Rotated BRIEF), 500 features
3. Match with previous frame — Brute-Force Matcher + Hamming distance
4. Compute homography — RANSAC to filter outliers (min 8 inliers)
5. Decompose homography → dx, dy, dyaw
6. Scale by altitude (from barometer/rangefinder) via focal length
7. Update pose accumulator
8. Compute velocity = displacement / dt
```

**Key implementation detail:**
```python
# Convert pixel displacement to meters using altitude + focal length
dx = tx_px * altitude / fx   # tx_px from H[0,2]
dy = ty_px * altitude / fy   # ty_px from H[1,2]
dyaw = np.arctan2(H[1,0], H[0,0])
```

**Why ORB:**
- Fast on Raspberry Pi Zero 2W (no GPU)
- Rotation and scale invariant
- Binary descriptors → fast Hamming matching
- Free (no patent unlike SIFT/SURF)

**Failure conditions:**
- `features.count < 10` → return None (not enough texture)
- `match_result.inlier_count < 8` → return None (scene changed too much)

---

## 3. Route Recorder (firmware/python/navigation/route_recorder.py)

**Goal:** Record flight path as sequence of keyframes for playback.

**Keyframe structure:**
```python
@dataclass
class Keyframe:
    id: int
    timestamp: float
    pose: Dict          # {x, y, z, yaw}
    features_count: int
    altitude: float
    # ORB descriptors saved as .npy binary alongside
```

**When to add keyframe:**
```python
# Add keyframe if:
distance > 2.0m   # moved more than 2 meters
OR
angle_diff > 15°  # turned more than 15 degrees
```

**Saved per keyframe:**
- `kf_{id}_thumb.jpg` — 160×120 thumbnail
- `kf_{id}_desc.npy` — ORB descriptors (binary)
- `kf_{id}_kp.npy` — keypoints (pt, size, angle, response)

**Route metadata** (`route.json`):
```json
{
  "id": "route_1700000000",
  "name": "route_1700000000",
  "created_at": 1700000000.0,
  "keyframes": [...],
  "start_position": {"x": 0, "y": 0, "z": 0, "yaw": 0},
  "end_position": {"x": 15.3, "y": -2.1, "z": 0, "yaw": 0.3},
  "total_distance": 42.7
}
```

---

## 4. MAVLink Interface (firmware/python/mavlink/ardupilot.py)

**Protocol:** MAVLink 2.0 over UART at 115200 baud

**Sent messages:**
```python
# VISION_POSITION_ESTIMATE (msg_id = 102) — main VO output
connection.mav.vision_position_estimate_send(
    int(time.time() * 1e6),  # timestamp μs
    x, y, z,                  # NED frame, meters
    roll, pitch, yaw          # radians
)
```

**Received messages:**
- `HEARTBEAT` → armed state, flight mode
- `ATTITUDE` → roll, pitch, yaw from IMU
- `GLOBAL_POSITION_INT` → GPS coords + altitude
- `VFR_HUD` → airspeed, groundspeed, altitude

**Data stream request:**
```python
connection.mav.request_data_stream_send(
    target_system, target_component,
    MAV_DATA_STREAM_EXTRA1,  # ATTITUDE @ 10Hz
    10, 1  # 10Hz, start
)
```

---

## 5. Data Flow

```
Camera (30 FPS)
    │
    ▼
┌───────────────┐
│ Frame Capture │
│ (grayscale)   │
└───────┬───────┘
        │
        ▼
┌───────────────┐
│  ORB Feature  │──────────────────────┐
│  Detection    │                      │
│  (500 feats)  │                      │
└───────┬───────┘                      │
        │                              │
        ▼                              │
┌───────────────┐                      │
│  BF Matching  │                      │
│ (Hamming)     │                      │
└───────┬───────┘                      │
        │                              │
        ▼                              │
┌───────────────┐                      │
│  Homography   │                      │
│  (RANSAC)     │                      │
└───────┬───────┘                      │
        │                              │
        ▼                              │
┌───────────────┐   ┌──────────────┐   │
│Pose Estimate  │◄──│  Altitude    │   │
│ dx, dy, dyaw  │   │ (barometer)  │   │
└───────┬───────┘   └──────────────┘   │
        │                              │
        ├──────────────────────────────┤
        │                              │
        ▼                              ▼
┌───────────────┐            ┌──────────────────┐
│  MAVLink TX   │            │  Route Recorder  │
│ VISION_POS    │            │  (keyframes)     │
│ ESTIMATE      │            └──────────────────┘
└───────┬───────┘
        │
        ▼
┌───────────────┐
│ ArduPilot     │
│ EKF3          │
│ ExternalNav   │
└───────┬───────┘
        │
        ▼
┌───────────────┐
│ Flight Control│
│ (PID loops)   │
└───────────────┘
```

---

## 6. Backend API (backend/server.py)

**Stack:** FastAPI + MongoDB (motor async driver) — port **8001**

**Models:**
```python
class Route(BaseModel):
    id: str
    name: str
    created_at: datetime
    keyframes: List[dict]
    total_distance: float
```

**Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/routes` | List all saved routes from MongoDB |
| POST | `/api/routes` | Save new route |
| DELETE | `/api/routes/{id}` | Delete route |
| GET | `/api/routes/demo/generate` | **MOCK** route for testing |
| GET | `/api/docs/list` | List markdown docs in `/docs/` |
| GET | `/api/docs/{filename}` | Return doc as HTML (markdown rendered) |
| GET | `/api/firmware/structure` | File tree of `/firmware/` |

---

## 7. Frontend (frontend/src/)

**Stack:** React 18 + Three.js (vanilla, no @react-three/drei) + shadcn/ui + Tailwind

**Key components:**
- `App.js` — tabs: Map | History | Docs | Firmware | About
- `SimpleMap3D.js` — Three.js 3D route visualization with flight simulation
- `RouteMap3D.js` — alternative 3D map component

**Route selection fix (2026-05-08):**
```js
// App.js — selectedRoute flows: History → App state → MapPanel prop → useEffect
const [selectedRoute, setSelectedRoute] = useState(null);

// In RouteHistory onSelect:
onSelect={(route) => { setSelectedRoute(route); setActiveTab('map'); }}

// In MapPanel:
useEffect(() => {
    if (selectedRoute) {
        setRoute(selectedRoute);
        setStats({ keyframes: selectedRoute.keyframes?.length || 0, ... });
    }
}, [selectedRoute]);
```

---

## 8. ArduPilot Configuration

**File:** `firmware/config/visual_homing.param`

```ini
# Visual Odometry source
VISO_TYPE = 1              # 1 = MAVLink
VISO_ORIENT = 0            # Forward-facing
VISO_DELAY_MS = 50         # Compensation delay

# EKF3 Navigation Sources
EK3_SRC1_POSXY = 6         # ExternalNav (VO)
EK3_SRC1_VELXY = 6         # ExternalNav (VO)
EK3_SRC1_POSZ = 1          # Barometer
EK3_SRC1_YAW = 1           # Compass (or visual if no compass)

# UART for MAVLink (SERIAL3 = TX3/RX3 on Matek H743)
SERIAL3_PROTOCOL = 2       # MAVLink2
SERIAL3_BAUD = 115         # 115200 baud
```

---

## 9. Systemd Autostart

```ini
# /etc/systemd/system/visual-homing.service
[Unit]
Description=Visual Homing Navigation System
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/visual_homing
Environment=PATH=/home/pi/venv/bin
ExecStart=/home/pi/venv/bin/python3 main.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
# UART setup — free serial0 from Bluetooth
# /boot/firmware/config.txt
enable_uart=1
dtoverlay=disable-bt
```

---

## 10. Known Issues and Limitations

| Issue | Cause | Status |
|-------|-------|--------|
| VO drift at hover | Camera noise | 5mm threshold filter in place |
| Low texture scenes | ORB needs features | Falls back to previous pose |
| `msg_id 271` warning | MAVLink v1/v2 mismatch | Ignore — EKF still receives data |
| No Smart RTL at altitude | Not implemented | Planned — use IMU+baro above 50m |

---

## 11. Python Dependencies (Raspberry Pi)

```
opencv-python-headless==4.8.0  # Computer vision (ORB, BFMatcher, RANSAC)
numpy==1.24.0                   # Matrix math
pymavlink==2.4.40               # MAVLink protocol
picamera2==0.3.12               # Pi Camera driver
pyserial==3.5                   # UART communication
```

**Backend (server only):**
```
fastapi==0.110.0
motor==3.3.0                    # Async MongoDB driver
uvicorn==0.27.0
python-dotenv==1.0.0
markdown==3.5.0
```
