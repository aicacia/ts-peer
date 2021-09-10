import PeerJS from "peerjs";
import { Peer, RoomEvent } from "../src";
import { AutoReconnectingPeerEvent } from "../src/AutoReconnectingPeer";

const APP_ID = "example-peers-aicacia-com-";

function getAppPeerId(id: string) {
  return `${APP_ID}${id}`;
}

function getPeerIdFromAppPeerId(appPeerId: string) {
  return appPeerId.slice(APP_ID.length);
}

async function main() {
  const peerId = document.getElementById("peer-id") as HTMLHeadingElement,
    roomId = document.getElementById("room-id") as HTMLHeadingElement,
    roomStatus = document.getElementById("room-status") as HTMLHeadingElement,
    peers = document.getElementById("peers") as HTMLUListElement,
    messages = document.getElementById("messages") as HTMLUListElement,
    message = document.getElementById("message") as HTMLDivElement,
    messageInput = document.getElementById("message-input") as HTMLInputElement,
    messageBtn = document.getElementById("message-btn") as HTMLButtonElement;

  const peer = await Peer.create(
    new PeerJS(getAppPeerId(Math.random().toString(36).slice(2)), {
      host: "localhost",
      port: 8080,
    })
  );
  (window as any).peer = peer;

  peerId.textContent = `Peer Id: ${getPeerIdFromAppPeerId(peer.getId())}`;

  const room = peer.getRoom(getAppPeerId("room"));
  roomId.textContent = `Room Id: ${getPeerIdFromAppPeerId(room.getRoomId())}`;
  (window as any).room = room;

  room.on(AutoReconnectingPeerEvent.Disconnection, (peerId) => {
    document.getElementById(`peer-${peerId}`)?.remove();
  });
  room.on(AutoReconnectingPeerEvent.Connection, (peerId) => {
    const id = `peer-${peerId}`;
    if (!document.getElementById(id)) {
      const li = document.createElement("li");
      li.id = id;
      li.textContent = getPeerIdFromAppPeerId(peerId);
      peers.appendChild(li);
    }
    message.style.display = "";
  });
  room.on(AutoReconnectingPeerEvent.Data, onData);
  room.on(RoomEvent.StatusChange, onStatusChange);

  await room.connect();

  messageBtn.addEventListener("click", () => {
    const payload = messageInput.value;

    if (room && payload) {
      room.send(payload);
      messageInput.value = "";
    }
  });

  function onStatusChange(status: "server" | "client") {
    roomStatus.textContent = status;
  }

  function onData(from: string, payload: string) {
    addMessage(from, payload);
  }

  function addMessage(from: string, message: string) {
    const li = document.createElement("li");
    li.textContent = `${getPeerIdFromAppPeerId(from)}: ${message}`;
    messages.appendChild(li);
  }
}

window.addEventListener("load", main);
