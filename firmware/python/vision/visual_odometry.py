"""
Visual Odometry Module — Lucas-Kanade Optical Flow
Tracks Shi-Tomasi corners with LK, estimates affine motion (tx/ty/yaw).
Replaces ORB+BFMatch that failed on flat/low-texture surfaces.
"""
import cv2
import numpy as np
import logging
from typing import Optional, Tuple
from dataclasses import dataclass
import time

logger = logging.getLogger(__name__)


@dataclass
class Pose:
    """Position and orientation estimate"""
    x: float = 0.0
    y: float = 0.0
    z: float = 0.0
    yaw: float = 0.0
    pitch: float = 0.0
    roll: float = 0.0
    timestamp: float = 0.0
    confidence: float = 0.0


@dataclass
class Velocity:
    """Velocity estimate"""
    vx: float = 0.0
    vy: float = 0.0
    vz: float = 0.0
    timestamp: float = 0.0


class VisualOdometry:
    """
    Visual Odometry using Lucas-Kanade optical flow.
    Works on flat/uniform surfaces where ORB descriptor matching fails.
    """

    def __init__(
        self,
        n_features: int = 500,
        min_displacement: float = 0.1,
        camera_matrix: np.ndarray = None,
        altitude_source: str = "barometer"
    ):
        # Cap feature count — LK is fast enough with 200, more is diminishing returns
        self.n_features = min(n_features, 200)
        self.min_displacement = min_displacement
        self.altitude_source = altitude_source

        if camera_matrix is None:
            # Pi Camera v2/v3 at 640×480
            self.camera_matrix = np.array([
                [500, 0, 320],
                [0, 500, 240],
                [0, 0, 1]
            ], dtype=np.float32)
        else:
            self.camera_matrix = camera_matrix

        self._lk_params = dict(
            winSize=(21, 21),
            maxLevel=3,
            criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 30, 0.01)
        )
        self._gftt_params = dict(
            maxCorners=self.n_features,
            qualityLevel=0.01,
            minDistance=10,
            blockSize=7
        )
        # Minimum live tracks to compute a valid pose estimate
        self._min_tracks = 20

        # State
        self._prev_gray: Optional[np.ndarray] = None
        self._prev_pts: Optional[np.ndarray] = None
        self._prev_timestamp: float = 0.0
        self._pose = Pose()
        self._velocity = Velocity()
        self._current_altitude: float = 1.0

    def set_altitude(self, altitude: float):
        """Set current altitude (m) from barometer or rangefinder."""
        self._current_altitude = max(0.5, altitude)

    def process_frame(
        self,
        frame: np.ndarray,
        timestamp: float = None
    ) -> Tuple[Optional[Pose], Optional[Velocity]]:
        """
        Process new frame and estimate motion.
        Returns (Pose, Velocity) or (None, None) when tracking is unavailable.
        """
        if timestamp is None:
            timestamp = time.time()

        try:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY) if len(frame.shape) == 3 else frame.copy()

            # (Re)initialize when there are no previous tracks
            if self._prev_gray is None or self._prev_pts is None or len(self._prev_pts) < self._min_tracks:
                pts = cv2.goodFeaturesToTrack(gray, **self._gftt_params)
                if pts is not None and len(pts) >= self._min_tracks:
                    self._prev_gray = gray
                    self._prev_pts = pts
                    self._prev_timestamp = timestamp
                    logger.info(f"LK: init, features={len(pts)}")
                else:
                    n = len(pts) if pts is not None else 0
                    logger.info(f"LK: init failed, features={n} — too few")
                return None, None

            # Track corners from previous frame to current
            curr_pts, status, _ = cv2.calcOpticalFlowPyrLK(
                self._prev_gray, gray, self._prev_pts, None, **self._lk_params
            )

            if curr_pts is None or status is None:
                logger.info("LK: tracking failed — reset")
                self._reset(gray, timestamp)
                return None, None

            good_prev = self._prev_pts[status == 1]
            good_curr = curr_pts[status == 1]
            n_tracked = len(good_prev)

            if n_tracked < self._min_tracks:
                logger.info(f"LK: tracked={n_tracked} — too few, reset")
                self._reset(gray, timestamp)
                return None, None

            # Estimate affine transform (4DOF: tx, ty, rotation, scale)
            M, inlier_mask = cv2.estimateAffinePartial2D(
                good_prev, good_curr,
                method=cv2.RANSAC,
                ransacReprojThreshold=3.0,
                confidence=0.99
            )

            if M is None:
                logger.info(f"LK: tracked={n_tracked}, affine failed — reset")
                self._reset(gray, timestamp)
                return None, None

            n_inliers = int(np.sum(inlier_mask)) if inlier_mask is not None else n_tracked
            logger.info(f"LK: tracked={n_tracked}, inliers={n_inliers}")

            if n_inliers < self._min_tracks // 2:
                logger.info(f"LK: inliers={n_inliers} — too few, reset")
                self._reset(gray, timestamp)
                return None, None

            # Decompose partial affine: M = [[cosθ, -sinθ, tx], [sinθ, cosθ, ty]]
            tx_px = M[0, 2]
            ty_px = M[1, 2]
            dyaw = np.arctan2(M[1, 0], M[0, 0])

            # Convert pixel displacement → meters using altitude and focal length
            fx = self.camera_matrix[0, 0]
            fy = self.camera_matrix[1, 1]
            dx = tx_px * self._current_altitude / fx
            dy = ty_px * self._current_altitude / fy

            # Dead-band filter — suppress noise below sensor resolution
            if abs(dx) < 0.005:
                dx = 0.0
            if abs(dy) < 0.005:
                dy = 0.0
            if abs(dyaw) < 0.001:
                dyaw = 0.0

            dt = timestamp - self._prev_timestamp
            if dt <= 0:
                dt = 0.033

            # Update integrated pose
            self._pose.x += dx
            self._pose.y += dy
            self._pose.yaw += dyaw
            self._pose.z = self._current_altitude
            self._pose.timestamp = timestamp
            self._pose.confidence = n_inliers / n_tracked

            self._velocity.vx = dx / dt
            self._velocity.vy = dy / dt
            self._velocity.timestamp = timestamp

            # Carry forward inlier tracks; redetect when count drops
            if inlier_mask is not None:
                self._prev_pts = good_curr[inlier_mask.ravel() == 1].reshape(-1, 1, 2)
            else:
                self._prev_pts = good_curr.reshape(-1, 1, 2)
            self._prev_gray = gray
            self._prev_timestamp = timestamp

            if len(self._prev_pts) < self.n_features // 2:
                new_pts = cv2.goodFeaturesToTrack(gray, **self._gftt_params)
                if new_pts is not None:
                    self._prev_pts = new_pts

            return self._pose, self._velocity

        except Exception as e:
            logger.error(f"Visual odometry error: {e}")
            return None, None

    def _reset(self, gray: np.ndarray, timestamp: float):
        """Re-initialize tracking from current frame."""
        pts = cv2.goodFeaturesToTrack(gray, **self._gftt_params)
        if pts is not None and len(pts) >= self._min_tracks:
            self._prev_gray = gray
            self._prev_pts = pts
            self._prev_timestamp = timestamp
        else:
            self._prev_gray = None
            self._prev_pts = None

    def reset(self):
        """Reset full odometry state (position + tracking)."""
        self._prev_gray = None
        self._prev_pts = None
        self._prev_timestamp = 0.0
        self._pose = Pose()
        self._velocity = Velocity()

    @property
    def pose(self) -> Pose:
        return self._pose

    @property
    def velocity(self) -> Velocity:
        return self._velocity
