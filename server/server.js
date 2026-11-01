import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import { createDeviceLocationStore, InvalidInputError } from "./deviceLocationStore.js";

const PORT = Number(process.env.PORT || 8080);
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const deviceLocations =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createDeviceLocationStore({
        supabaseUrl: process.env.SUPABASE_URL,
        serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      })
    : null;

const LOCATION_ROUTE = "/api/device-location";
const LOCATION_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "peddle-meshnet-signaling", version: "0.4.0" });
});

app.use(LOCATION_ROUTE, (req, res, next) => {
  res.set(LOCATION_CORS_HEADERS);
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use(LOCATION_ROUTE, express.json({ limit: "4kb" }));
app.use(LOCATION_ROUTE, (_error, _req, res, _next) => {
  res.status(400).json({ error: "Request body must be JSON." });
});

function locationRoute(action) {
  return async (req, res) => {
    if (!deviceLocations) {
      return res.status(503).json({ error: "Location storage is not configured." });
    }
    try {
      const result = await action(deviceLocations, req.body ?? {});
      res.json(result ?? { ok: true });
    } catch (error) {
      if (error instanceof InvalidInputError) {
        return res.status(400).json({ error: error.message });
      }
      console.error("Device location storage failed:", error.message);
      res.status(502).json({ error: "Location storage is unavailable right now." });
    }
  };
}

app.post(`${LOCATION_ROUTE}/save`, locationRoute((store, body) => store.save(body.deviceKey, body.location)));
app.post(`${LOCATION_ROUTE}/clear`, locationRoute((store, body) => store.clear(body.deviceKey)));
app.post(
  `${LOCATION_ROUTE}/load`,
  locationRoute(async (store, body) => ({ location: await store.load(body.deviceKey) })),
);

const rooms = new Map();

function send(ws, message) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
}

function leave(ws) {
  if (!ws.roomId || !ws.peerId) return;
  const room = rooms.get(ws.roomId);
  if (!room) return;
  room.delete(ws.peerId);
  for (const peer of room.values()) {
    send(peer, { type: "peer-left", peerId: ws.peerId });
  }
  if (room.size === 0) rooms.delete(ws.roomId);
  ws.roomId = null;
  ws.peerId = null;
}

wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); }
    catch { return send(ws, { type: "error", error: "Invalid JSON" }); }

    if (msg.type === "join") {
      leave(ws);
      const roomId = String(msg.roomId || "default");
      const peerId = String(msg.peerId || crypto.randomUUID());
      const room = rooms.get(roomId) || new Map();
      rooms.set(roomId, room);

      for (const [existingId, peer] of room.entries()) {
        send(peer, { type: "peer-joined", peerId });
        send(ws, { type: "peer-present", peerId: existingId });
      }

      room.set(peerId, ws);
      ws.roomId = roomId;
      ws.peerId = peerId;
      return send(ws, { type: "joined", roomId, peerId });
    }

    if (!ws.roomId || !ws.peerId) {
      return send(ws, { type: "error", error: "Join a room first" });
    }

    if (["offer", "answer", "ice"].includes(msg.type)) {
      const target = rooms.get(ws.roomId)?.get(String(msg.to));
      if (target) {
        send(target, { ...msg, from: ws.peerId });
      }
      return;
    }
  });

  ws.on("close", () => leave(ws));
});

server.listen(PORT, () => {
  console.log(`MeshNet signaling server listening on :${PORT}`);
});
