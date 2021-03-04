import PeerJS from "peerjs";
import { Peer } from "../src";

const APP_ID = "example-peers-aicacia-com-";

function getAppPeerId(id: string) {
  return `${APP_ID}${id}`;
}

function getPeerIdFromAppPeerId(appPeerId: string) {
  return appPeerId.slice(APP_ID.length);
}

async function main() {
  let peer: Peer<string> | undefined;

  const peerId = document.getElementById("peer-id") as Element,
    peerDiv = document.getElementById("peer") as HTMLDivElement,
    peerInput = document.getElementById("peer-input") as HTMLInputElement,
    peerBtn = document.getElementById("peer-btn") as HTMLButtonElement,
    join = document.getElementById("join") as HTMLDivElement,
    joinInput = document.getElementById("join-input") as HTMLInputElement,
    joinBtn = document.getElementById("join-btn") as HTMLButtonElement,
    peers = document.getElementById("peers") as HTMLUListElement,
    messages = document.getElementById("messages") as HTMLUListElement,
    message = document.getElementById("message") as HTMLDivElement,
    messageInput = document.getElementById("message-input") as HTMLInputElement,
    messageBtn = document.getElementById("message-btn") as HTMLButtonElement;

  peerBtn.addEventListener("click", async () => {
    peer = await Peer.create(new PeerJS(getAppPeerId(peerInput.value)));

    peer.on("connection", (peerId) => {
      const id = `peer-${peerId}`;
      if (!document.getElementById(id)) {
        const li = document.createElement("li");
        li.id = id;
        li.textContent = getPeerIdFromAppPeerId(peerId);
        peers.appendChild(li);
      }
      message.style.display = "";
    });
    peer.on("disconnection", (id) =>
      document.getElementById(`peer-${id}`)?.remove()
    );
    peer.on("message", addMessage);

    peerDiv.style.display = "none";
    message.style.display = "none";
    join.style.display = "";

    peerId.textContent = getPeerIdFromAppPeerId(peer.getId());
  });

  joinBtn.addEventListener("click", async () => {
    if (peer) {
      await peer.connect(getAppPeerId(joinInput.value));
      message.style.display = "";
      joinInput.value = "";
    }
  });

  messageBtn.addEventListener("click", () => {
    const payload = messageInput.value;

    if (payload) {
      addMessage(payload, peer.getId());
      peer.broadcast(payload);
    }
  });

  function addMessage(message: string, from: string) {
    const li = document.createElement("li");
    li.textContent = `${getPeerIdFromAppPeerId(from)}: ${message}`;
    messages.appendChild(li);
  }
}

window.addEventListener("load", main);
