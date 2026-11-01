import express from "express";
import http from "http";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.PORT || 8080);
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "peddle-meshnet-signaling", version: "0.4.0" });
});

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
