import { test } from "node:test";
import assert from "node:assert/strict";
import { MeshPeerConnection, PeerState } from "../web/meshPeerConnection.js";

class FakeChannel {
  readyState = "connecting";
  sent = [];
  onopen = null;
  onclose = null;
  onmessage = null;

  constructor(label) {
    this.label = label;
  }

  send(data) {
    this.sent.push(data);
  }

  close() {
    if (this.readyState === "closed") return;
    this.readyState = "closed";
    this.onclose?.();
  }

  open() {
    this.readyState = "open";
    this.onopen?.();
  }

  receive(data) {
    this.onmessage?.({ data });
  }
}

class FakePeerConnection {
  connectionState = "new";
  localDescription = null;
  remoteDescription = null;
  addedCandidates = [];
  channels = [];
  closed = false;
  onicecandidate = null;
  onconnectionstatechange = null;
  ondatachannel = null;

  createDataChannel(label) {
    const channel = new FakeChannel(label);
    this.channels.push(channel);
    return channel;
  }

  async createOffer() {
    return { type: "offer", sdp: "offer-sdp" };
  }

  async createAnswer() {
    return { type: "answer", sdp: "answer-sdp" };
  }

  async setLocalDescription(description) {
    this.localDescription = description;
  }

  async setRemoteDescription(description) {
    this.remoteDescription = description;
  }

  async addIceCandidate(candidate) {
    this.addedCandidates.push(candidate);
  }

  close() {
    this.closed = true;
  }
}

function setup({ isInitiator = true, connectTimeoutMs = 1000 } = {}) {
  const pc = new FakePeerConnection();
  const signals = [];
  const states = [];
  const messages = [];
  const connection = new MeshPeerConnection({
    remotePeerId: "remote-1",
    isInitiator,
    sendSignal: (signal) => signals.push(signal),
    onStateChange: ({ state, reason }) => states.push({ state, reason }),
    onMessage: (data) => messages.push(data),
    connectTimeoutMs,
    createPeerConnection: () => pc,
  });
  return { connection, pc, signals, states, messages };
}

const stateNames = (states) => states.map(({ state }) => state);

test("initiator sends an offer and reports CONNECTED only once the channel opens", async () => {
  const { connection, pc, signals, states } = setup();
  await connection.start();

  assert.equal(pc.channels[0].label, "meshnet");
  assert.deepEqual(signals, [
    { type: "offer", to: "remote-1", description: { type: "offer", sdp: "offer-sdp" } },
  ]);
  assert.equal(connection.state, PeerState.CONNECTING);

  pc.channels[0].open();
  assert.equal(connection.state, PeerState.CONNECTED);
  assert.deepEqual(stateNames(states), ["CONNECTING", "CONNECTED"]);
  connection.close();
});

test("send is refused until the channel is open", async () => {
  const { connection, pc } = setup();
  await connection.start();

  assert.equal(connection.send("early"), false);
  pc.channels[0].open();
  assert.equal(connection.send("hello"), true);
  assert.deepEqual(pc.channels[0].sent, ["hello"]);
  connection.close();
});

test("responder buffers ICE candidates that arrive before the offer and answers", async () => {
  const { connection, pc, signals } = setup({ isInitiator: false });
  await connection.start();

  await connection.handleSignal({
    type: "ice",
    from: "remote-1",
    candidate: { candidate: "c1", sdpMid: "0", sdpMLineIndex: 0 },
  });
  assert.equal(pc.addedCandidates.length, 0);

  await connection.handleSignal({ type: "offer", from: "remote-1", description: { type: "offer", sdp: "o" } });
  assert.deepEqual(pc.remoteDescription, { type: "offer", sdp: "o" });
  assert.equal(pc.addedCandidates.length, 1);
  assert.deepEqual(signals, [
    { type: "answer", to: "remote-1", description: { type: "answer", sdp: "answer-sdp" } },
  ]);

  const channel = new FakeChannel("meshnet");
  pc.ondatachannel({ channel });
  channel.open();
  assert.equal(connection.state, PeerState.CONNECTED);
  connection.close();
});

test("local ICE candidates are forwarded and end-of-candidates is not", async () => {
  const { connection, pc, signals } = setup();
  await connection.start();

  pc.onicecandidate({ candidate: { toJSON: () => ({ candidate: "c2", sdpMid: "0", sdpMLineIndex: 0 }) } });
  pc.onicecandidate({ candidate: null });

  assert.deepEqual(signals.at(-1), {
    type: "ice",
    to: "remote-1",
    candidate: { candidate: "c2", sdpMid: "0", sdpMLineIndex: 0 },
  });
  assert.equal(signals.length, 2);
  connection.close();
});

test("a connection that never opens fails after the timeout", async () => {
  const { connection, pc, states } = setup({ connectTimeoutMs: 10 });
  await connection.start();
  await new Promise((resolve) => setTimeout(resolve, 40));

  assert.equal(connection.state, PeerState.FAILED);
  assert.equal(pc.closed, true);
  assert.match(states.at(-1).reason, /did not open/);
});

test("a failed WebRTC connection is FAILED and stays FAILED after close", async () => {
  const { connection, pc } = setup();
  await connection.start();

  pc.connectionState = "failed";
  pc.onconnectionstatechange();
  assert.equal(connection.state, PeerState.FAILED);

  connection.close();
  assert.equal(connection.state, PeerState.FAILED);
});

test("a channel closing after it opened reports DISCONNECTED", async () => {
  const { connection, pc } = setup();
  await connection.start();
  pc.channels[0].open();

  pc.channels[0].close();
  assert.equal(connection.state, PeerState.DISCONNECTED);
  connection.close();
});

test("incoming channel data is passed to the message handler", async () => {
  const { connection, pc, messages } = setup({ isInitiator: false });
  await connection.start();
  const channel = new FakeChannel("meshnet");
  pc.ondatachannel({ channel });

  channel.receive("payload");
  assert.deepEqual(messages, ["payload"]);
  connection.close();
});
