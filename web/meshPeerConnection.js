export const PeerState = Object.freeze({
  DISCOVERING: "DISCOVERING",
  CONNECTING: "CONNECTING",
  CONNECTED: "CONNECTED",
  DISCONNECTED: "DISCONNECTED",
  FAILED: "FAILED",
});

export const CONNECT_TIMEOUT_MS = 20_000;
const CHANNEL_LABEL = "meshnet";

export class MeshPeerConnection {
  #remotePeerId;
  #isInitiator;
  #sendSignal;
  #onStateChange;
  #onMessage;
  #connectTimeoutMs;
  #pc;
  #channel = null;
  #state = PeerState.DISCOVERING;
  #timer = null;
  #closed = false;
  #remoteDescriptionSet = false;
  #pendingCandidates = [];

  constructor({
    remotePeerId,
    isInitiator,
    sendSignal,
    onStateChange,
    onMessage,
    rtcConfig = {},
    connectTimeoutMs = CONNECT_TIMEOUT_MS,
    createPeerConnection = (config) => new RTCPeerConnection(config),
  }) {
    this.#remotePeerId = remotePeerId;
    this.#isInitiator = isInitiator;
    this.#sendSignal = sendSignal;
    this.#onStateChange = onStateChange;
    this.#onMessage = onMessage;
    this.#connectTimeoutMs = connectTimeoutMs;
    this.#pc = createPeerConnection(rtcConfig);

    this.#pc.onicecandidate = ({ candidate }) => {
      if (candidate && !this.#closed) {
        this.#sendSignal({ type: "ice", to: remotePeerId, candidate: candidate.toJSON() });
      }
    };
    this.#pc.onconnectionstatechange = () => this.#handleConnectionState();
    this.#pc.ondatachannel = ({ channel }) => this.#attachChannel(channel);
  }

  get state() {
    return this.#state;
  }

  async start() {
    this.#setState(PeerState.CONNECTING);
    this.#startTimer();
    if (!this.#isInitiator) return;
    try {
      this.#attachChannel(this.#pc.createDataChannel(CHANNEL_LABEL, { ordered: true }));
      const offer = await this.#pc.createOffer();
      await this.#pc.setLocalDescription(offer);
      this.#sendSignal({
        type: "offer",
        to: this.#remotePeerId,
        description: { type: offer.type, sdp: offer.sdp },
      });
    } catch (error) {
      this.#fail(error);
    }
  }

  async handleSignal(signal) {
    if (this.#closed) return;
    try {
      if (signal.type === "ice") {
        if (signal.candidate === null) return;
        if (this.#remoteDescriptionSet) {
          await this.#pc.addIceCandidate(signal.candidate);
        } else {
          this.#pendingCandidates.push(signal.candidate);
        }
        return;
      }

      await this.#pc.setRemoteDescription(signal.description);
      this.#remoteDescriptionSet = true;
      await this.#flushPendingCandidates();

      if (signal.type === "offer") {
        const answer = await this.#pc.createAnswer();
        await this.#pc.setLocalDescription(answer);
        this.#sendSignal({
          type: "answer",
          to: this.#remotePeerId,
          description: { type: answer.type, sdp: answer.sdp },
        });
      }
    } catch (error) {
      this.#fail(error);
    }
  }

  send(data) {
    if (this.#channel?.readyState !== "open") return false;
    this.#channel.send(data);
    return true;
  }

  close() {
    if (this.#closed) return;
    this.#closed = true;
    this.#clearTimer();
    this.#channel?.close();
    this.#pc.close();
    this.#setState(PeerState.DISCONNECTED);
  }

  async #flushPendingCandidates() {
    const pending = this.#pendingCandidates.splice(0);
    for (const candidate of pending) {
      await this.#pc.addIceCandidate(candidate);
    }
  }

  #attachChannel(channel) {
    this.#channel = channel;
    channel.onopen = () => {
      this.#clearTimer();
      this.#setState(PeerState.CONNECTED);
    };
    channel.onclose = () => {
      if (!this.#closed) this.#setState(PeerState.DISCONNECTED);
    };
    channel.onmessage = ({ data }) => this.#onMessage(data);
  }

  #handleConnectionState() {
    const connectionState = this.#pc.connectionState;
    if (connectionState === "failed") {
      this.#fail(new Error("The direct connection to this device failed"));
    } else if (connectionState === "disconnected" && this.#state === PeerState.CONNECTED) {
      this.#setState(PeerState.DISCONNECTED);
    }
  }

  #startTimer() {
    this.#timer = setTimeout(() => {
      this.#fail(`The connection did not open within ${this.#connectTimeoutMs / 1000} seconds`);
    }, this.#connectTimeoutMs);
  }

  #clearTimer() {
    clearTimeout(this.#timer);
    this.#timer = null;
  }

  #fail(error) {
    if (this.#closed || this.#state === PeerState.FAILED) return;
    const reason = error instanceof Error ? error.message : String(error);
    this.#clearTimer();
    this.#setState(PeerState.FAILED, reason);
    this.close();
  }

  #setState(state, reason = null) {
    if (this.#state === PeerState.FAILED && state !== PeerState.FAILED) return;
    this.#state = state;
    this.#onStateChange({ state, reason });
  }
}
