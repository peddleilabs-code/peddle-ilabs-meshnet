import { MAX_ACCURACY_METERS } from "./protocol.js";

const GEOLOCATION_OPTIONS = { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 };

function describeError(error) {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return "Location permission was denied. Allow it in your browser settings to share your location.";
    case error.POSITION_UNAVAILABLE:
      return "Your location is unavailable right now.";
    case error.TIMEOUT:
      return "Finding your location took too long. It will keep trying.";
    default:
      return "Your location could not be read.";
  }
}

export function watchDeviceLocation({ onPosition, onError }) {
  if (!navigator.geolocation) {
    onError("This browser cannot share location.");
    return () => {};
  }

  const watchId = navigator.geolocation.watchPosition(
    ({ coords, timestamp }) =>
      onPosition({
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy: Math.min(coords.accuracy, MAX_ACCURACY_METERS),
        capturedAt: new Date(timestamp).toISOString(),
      }),
    (error) => onError(describeError(error)),
    GEOLOCATION_OPTIONS,
  );

  return () => navigator.geolocation.clearWatch(watchId);
}
