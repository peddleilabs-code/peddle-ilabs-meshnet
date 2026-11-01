const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const WORLD_VIEW = { center: [20, 0], zoom: 2 };
const FIT_MAX_ZOOM = 14;
const MARKER_STYLE = {
  self: { radius: 9, color: "#14532d", fillColor: "#22c55e", fillOpacity: 0.9, weight: 2 },
  peer: { radius: 8, color: "#17202a", fillColor: "#1f5f8b", fillOpacity: 0.9, weight: 2 },
};

function labelElement(text) {
  const node = document.createElement("span");
  node.textContent = text;
  return node;
}

export function createLocationMap(container) {
  if (!window.L) {
    container.textContent = "The map could not be loaded. Check your internet connection and reload.";
    return null;
  }

  const map = window.L.map(container).setView(WORLD_VIEW.center, WORLD_VIEW.zoom);
  window.L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(map);

  const markers = new Map();
  let fittedKey = "";

  function fitToDevices(devices) {
    const key = devices.map((device) => device.id).sort().join("|");
    if (key === fittedKey) return;
    fittedKey = key;
    if (devices.length === 0) {
      map.setView(WORLD_VIEW.center, WORLD_VIEW.zoom);
      return;
    }
    const points = devices.map((device) => [device.latitude, device.longitude]);
    map.fitBounds(points, { padding: [40, 40], maxZoom: FIT_MAX_ZOOM });
  }

  return {
    update(devices) {
      const seen = new Set();
      for (const device of devices) {
        seen.add(device.id);
        const latLng = [device.latitude, device.longitude];
        const existing = markers.get(device.id);
        if (existing) {
          existing.setLatLng(latLng);
          continue;
        }
        const marker = window.L.circleMarker(latLng, device.isSelf ? MARKER_STYLE.self : MARKER_STYLE.peer);
        marker.bindTooltip(labelElement(device.label));
        marker.addTo(map);
        markers.set(device.id, marker);
      }

      for (const [id, marker] of markers) {
        if (seen.has(id)) continue;
        marker.remove();
        markers.delete(id);
      }

      fitToDevices(devices);
    },
  };
}
