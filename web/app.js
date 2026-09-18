const statusEl = document.querySelector("#status");
const peersEl = document.querySelector("#peers");
const roomEl = document.querySelector("#room");
const joinBtn = document.querySelector("#join");

let ws;
const peerId = crypto.randomUUID();

joinBtn.addEventListener("click", () => {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  const host = location.hostname || "localhost";
  ws = new WebSocket(`${protocol}://${host}:8080`);

  ws.onopen = () => {
    ws.send(JSON.stringify({
      type: "join",
      roomId: roomEl.value.trim() || "meshnet-demo",
      peerId
    }));
    statusEl.textContent = `Connected as ${peerId.slice(0, 8)}`;
  };

  ws.onmessage = ({ data }) => {
    const msg = JSON.parse(data);
    if (msg.type === "peer-present" || msg.type === "peer-joined") {
      const li = document.createElement("li");
      li.textContent = msg.peerId;
      peersEl.appendChild(li);
    }
    if (msg.type === "peer-left") {
      [...peersEl.children]
        .filter(el => el.textContent === msg.peerId)
        .forEach(el => el.remove());
    }
  };

  ws.onclose = () => statusEl.textContent = "Disconnected";
  ws.onerror = () => statusEl.textContent = "Connection error";
});
