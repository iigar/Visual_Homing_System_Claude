# Android App Specification — Visual Homing

**Goal:** Native Android app to control the Visual Homing system on Raspberry Pi via mobile hotspot.

---

## 1. Functional Requirements

### 1.1 Hotspot Management
- Button to open hotspot settings (Android doesn't allow programmatic enable)
- Auto-detect hotspot state (on/off)
- Display SSID and password
- QR code for quick Pi connection to hotspot
- Pi setup instructions for auto-connect to phone hotspot

### 1.2 Auto-Connect to Pi
- mDNS/NSD discovery for `visual-homing.local`
- Fallback: scan `192.168.43.x` range (standard Android hotspot subnet)
- Connection status indicator: searching / connected / offline
- Persist last known Pi IP address
- Auto-reconnect on connection loss

### 1.3 Dashboard (Main Screen)
- MJPEG video stream from Pi camera (`/video_feed`)
- Real-time telemetry:
  - Position X, Y, Z (meters)
  - Roll, Pitch, Yaw (degrees)
  - Altitude (barometer)
  - Keyframes recorded
  - MAVLink status (connected / disconnected)
  - VisOdom status (healthy / not healthy)
- Control buttons:
  - `START RECORDING` — begin route recording
  - `STOP` — stop current operation
  - `RETURN HOME` — trigger route playback RTL
- 3D mini-map of recorded route (Three.js WebView or native Canvas)

### 1.4 Local Storage
```
/VisualHoming/
├── routes/              # Saved routes (JSON)
│   ├── route_001.json
│   └── route_002.json
├── config/
│   ├── pi_settings.json # IP, port, camera settings
│   └── ardupilot.param  # ArduPilot parameter backup
├── scripts/
│   └── install.sh       # Pi setup script
├── docs/                # Offline documentation
│   ├── setup_guide.md
│   ├── wiring_diagram.png
│   └── troubleshooting.md
└── logs/
    └── flight_001.log
```

### 1.5 Route Sync with Pi
- Download routes from Pi → phone
- Upload routes from phone → Pi
- Backup Pi configuration
- OTA firmware update from phone

### 1.6 Offline Documentation
- Wiring diagrams (UART, camera, sensors)
- ArduPilot parameter reference
- Setup guide and FAQ
- Full offline access — no internet required

---

## 2. Technical Stack

```
Language:      Kotlin
Min Android:   8.0 (API 26)
UI:            Jetpack Compose + Material 3
Architecture:  MVVM + Clean Architecture

Libraries:
- Retrofit2 + OkHttp      — HTTP to Pi API (port 8001)
- Kotlin Coroutines + Flow — async
- Coil                    — MJPEG stream rendering
- Room                    — local SQLite for routes
- DataStore               — preferences
- NSD (Network Service Discovery) — mDNS
- CameraX                 — QR code scanner (optional)
- Accompanist             — permissions handling
```

---

## 3. Pi API Endpoints (port 8001)

```
GET  /api/routes              # List saved routes
POST /api/routes              # Save route
GET  /api/routes/{id}         # Route details
DELETE /api/routes/{id}       # Delete route
POST /api/routes/upload       # Upload route from phone

GET  /api/status              # System status JSON
POST /api/recording/start     # Start recording
POST /api/recording/stop      # Stop recording
POST /api/return/start        # Start return (RTL)

GET  /video_feed              # MJPEG stream
WebSocket /ws                 # Real-time telemetry
```

---

## 4. Screens

```
1. SplashScreen
   └── logo + permission check

2. HomeScreen
   ├── Hotspot status (on/off)
   ├── Pi connection status
   ├── [Connect] button
   └── Quick docs link

3. DashboardScreen
   ├── Camera stream (MJPEG)
   ├── Telemetry cards (6)
   ├── Control buttons (RECORD / STOP / RTL)
   └── 3D route mini-map

4. RoutesScreen
   ├── Saved routes list
   ├── Map preview per route
   └── Sync with Pi

5. SettingsScreen
   ├── Pi IP / port
   ├── Camera settings
   ├── ArduPilot params
   └── Export/import config

6. DocsScreen
   ├── Offline markdown docs
   ├── Search
   └── Wiring diagrams

7. HotspotScreen
   ├── Setup instructions
   ├── QR code for Pi
   └── Connected devices list
```

---

## 5. Android Permissions

```xml
<uses-permission android:name="android.permission.INTERNET"/>
<uses-permission android:name="android.permission.ACCESS_WIFI_STATE"/>
<uses-permission android:name="android.permission.CHANGE_WIFI_STATE"/>
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE"/>
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>
<uses-permission android:name="android.permission.NEARBY_WIFI_DEVICES"/>
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE"/>
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE"/>
```

---

## 6. Implementation Notes

### Hotspot — Android Limitation
```kotlin
// Android does not allow programmatic hotspot enable
// Must open system settings:
val intent = Intent(Settings.ACTION_WIRELESS_SETTINGS)
startActivity(intent)

// Android 10+:
val intent = Intent(Settings.ACTION_TETHERING_SETTINGS)
startActivity(intent)
```

### mDNS Discovery
```kotlin
val nsdManager = getSystemService(Context.NSD_SERVICE) as NsdManager
nsdManager.discoverServices("_http._tcp", NsdManager.PROTOCOL_DNS_SD, listener)
```

### MJPEG Stream
```kotlin
// Use Coil with custom ImageLoader or custom decoder
// URL: http://<pi-ip>:8001/video_feed
// Content-Type: multipart/x-mixed-replace
```

---

## 7. Design

```
Theme:      Dark mode (primary)
Colors:
  Primary:    #1A237E  (dark blue)
  Secondary:  #00BCD4  (cyan)
  Background: #121212
  Surface:    #1E1E1E
  Error:      #CF6679

Fonts:  Roboto
Icons:  Material Icons
```

---

## 8. User Flow

```
1. Launch app
   ↓
2. Check permissions (Location, WiFi, Storage)
   ↓
3. HomeScreen → "Enable hotspot" prompt
   ↓
4. User enables hotspot via system settings
   ↓
5. App detects hotspot active
   ↓
6. Auto-scan for Pi via mDNS → fallback 192.168.43.x
   ↓
7. Pi found → connect → DashboardScreen
   ↓
8. Real-time telemetry via WebSocket
   ↓
9. User controls: RECORD / STOP / RETURN HOME
```

---

## 9. Status

- [ ] Not started
- [ ] Spec complete (this document)
- [ ] Backend API compatible (port 8001, see `/api/` endpoints above)
