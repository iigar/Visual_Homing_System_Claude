"""
Visual Odometry Module
Візуальна одометрія для оцінки руху
"""
import cv2
import numpy as np
import logging
from typing import Optional, Tuple
from dataclasses import dataclass
import time

from .feature_detector import FeatureDetector, Features
from .matcher import FeatureMatcher, MatchResult

logger = logging.getLogger(__name__)


@dataclass
class Pose:
    """Position and orientation estimate"""
    x: float = 0.0
    y: float = 0.0
    z: float = 0.0
    yaw: float = 0.0    # radians
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
    Visual Odometry for drone navigation
    Estimates motion from sequential images
    """
    
    def __init__(
        self,
        n_features: int = 500,
        min_displacement: float = 0.1,
        camera_matrix: np.ndarray = None,
        altitude_source: str = "barometer"  # barometer or rangefinder
    ):
        self.min_displacement = min_displacement
        self.altitude_source = altitude_source
        
        # Default camera matrix (will be calibrated)
        if camera_matrix is None:
            self.camera_matrix = np.array([
                [500, 0, 360],
                [0, 500, 288],
                [0, 0, 1]
            ], dtype=np.float32)
        else:
            self.camera_matrix = camera_matrix
        
        self.detector = FeatureDetector(n_features=n_features)
        self.matcher = FeatureMatcher()
        
        # State
        self._prev_frame: Optional[np.ndarray] = None
        self._prev_features: Optional[Features] = None
        self._prev_timestamp: float = 0.0
        self._pose = Pose()
        self._velocity = Velocity()
        self._current_altitude: float = 1.0  # meters
    
    def set_altitude(self, altitude: float):
        """
        Set current altitude from external source (barometer/rangefinder)
        Required for proper scale estimation
        """
        self._current_altitude = max(0.5, altitude)  # minimum 0.5m
    
    def process_frame(
        self,
        frame: np.ndarray,
        timestamp: float = None
    ) -> Tuple[Optional[Pose], Optional[Velocity]]:
        """
        Process new frame and estimate motion
        
        Returns:
            Tuple of (Pose, Velocity) or (None, None) if estimation failed
        """
        if timestamp is None:
            timestamp = time.time()
        
        try:
            # Detect features in current frame
            current_features = self.detector.detect(frame)
            
            if current_features is None or current_features.count < 10:
                logger.debug("Not enough features detected")
                self._update_prev(frame, current_features, timestamp)
                return None, None
            
            # First frame - just store
            if self._prev_features is None:
                self._update_prev(frame, current_features, timestamp)
                return self._pose, self._velocity
            
            # Match features with previous frame
            match_result = self.matcher.match(
                self._prev_features,
                current_features,
                compute_homography=True
            )
            
            if match_result is None or match_result.inlier_count < 8:
                logger.debug("Not enough matches")
                self._update_prev(frame, current_features, timestamp)
                return None, None
            
            # Estimate motion from matches
            dt = timestamp - self._prev_timestamp
            if dt <= 0:
                dt = 0.033  # assume 30fps
            
            # Calculate displacement from homography
            if match_result.homography is not None:
                dx, dy, dyaw = self._decompose_homography(
                    match_result.homography,
                    self._current_altitude
                )
                
                # Apply drift filter - ignore very small movements (noise)
                # Threshold: 0.005m (~5mm) for position, 0.001 rad (~0.06°) for yaw
                if abs(dx) < 0.005:
                    dx = 0.0
                if abs(dy) < 0.005:
                    dy = 0.0
                if abs(dyaw) < 0.001:
                    dyaw = 0.0
                
                # Update pose only if there's meaningful movement
                if abs(dx) > 0 or abs(dy) > 0 or abs(dyaw) > 0:
                    self._pose.x += dx
                    self._pose.y += dy
                    self._pose.yaw += dyaw
                    
                self._pose.z = self._current_altitude
                self._pose.timestamp = timestamp
                self._pose.confidence = match_result.inlier_count / match_result.count
                
                # Update velocity
                self._velocity.vx = dx / dt
                self._velocity.vy = dy / dt
                self._velocity.timestamp = timestamp
            
            # Update previous frame
            self._update_prev(frame, current_features, timestamp)
            
            return self._pose, self._velocity
            
        except Exception as e:
            logger.error(f"Visual odometry error: {e}")
            return None, None
    
    def _decompose_homography(
        self,
        H: np.ndarray,
        altitude: float
    ) -> Tuple[float, float, float]:
        """
        Decompose homography to get translation and rotation
        Simplified method for downward-facing camera
        """
        try:
            # Extract translation (simplified for planar motion)
            # Scale by altitude for metric units
            fx = self.camera_matrix[0, 0]
            fy = self.camera_matrix[1, 1]
            
            # Translation in pixels
            tx_px = H[0, 2]
            ty_px = H[1, 2]
            
            # Convert to meters using altitude and focal length
            dx = tx_px * altitude / fx
            dy = ty_px * altitude / fy
            
            # Rotation (simplified)
            dyaw = np.arctan2(H[1, 0], H[0, 0])
            
            return dx, dy, dyaw
            
        except Exception as e:
            logger.error(f"Homography decomposition error: {e}")
            return 0.0, 0.0, 0.0
    
    def _update_prev(
        self,
        frame: np.ndarray,
        features: Features,
        timestamp: float
    ):
        """Update previous frame data"""
        self._prev_frame = frame.copy()
        self._prev_features = features
        self._prev_timestamp = timestamp
    
    def reset(self):
        """Reset odometry state"""
        self._prev_frame = None
        self._prev_features = None
        self._prev_timestamp = 0.0
        self._pose = Pose()
        self._velocity = Velocity()
    
    @property
    def pose(self) -> Pose:
        return self._pose
    
    @property
    def velocity(self) -> Velocity:
        return self._velocity
