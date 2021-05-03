import PeerJS from "peerjs";
import { IMessage, Peer, Room } from "../src";
import { AutoReconnectingPeerEvent } from "../src/AutoReconnectingPeer";

const APP_ID = "example-peers-aicacia-com-";

function getAppPeerId(id: string) {
  return `${APP_ID}${id}`;
}

function getPeerIdFromAppPeerId(appPeerId: string) {
  return appPeerId.slice(APP_ID.length);
}

async function main() {
  let peer: Peer | undefined;
  let room: Room | undefined;

  const peerId = document.getElementById("peer-id") as HTMLHeadingElement,
    peerDiv = document.getElementById("peer") as HTMLDivElement,
    peerInput = document.getElementById("peer-input") as HTMLInputElement,
    peerBtn = document.getElementById("peer-btn") as HTMLButtonElement,
    roomId = document.getElementById("room-id") as HTMLHeadingElement,
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
    (window as any).peer = peer;

    peerDiv.style.display = "none";
    message.style.display = "none";
    join.style.display = "";

    peerId.textContent = `Peer Id: ${getPeerIdFromAppPeerId(peer.getId())}`;
  });

  joinBtn.addEventListener("click", async () => {
    if (peer) {
      room = await peer.connectToRoom(getAppPeerId(joinInput.value));
      roomId.textContent = `Room Id: ${getPeerIdFromAppPeerId(
        room.getRoomId()
      )}`;
      (window as any).room = room;

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
      room.on(AutoReconnectingPeerEvent.Disconnection, (id) =>
        document.getElementById(`peer-${id}`)?.remove()
      );
      room.on(AutoReconnectingPeerEvent.Message, onMessage);

      message.style.display = "";
      join.style.display = "none";
    }
  });

  messageBtn.addEventListener("click", () => {
    const payload = messageInput.value;

    if (room && payload) {
      addMessage(room.getPeer().getId(), payload);
      room.broadcast("message", payload);
    }
  });

  function onMessage(message: IMessage<string, any>) {
    addMessage(message.from, message.payload);
  }

  function addMessage(from: string, message: string) {
    const li = document.createElement("li");
    li.textContent = `${getPeerIdFromAppPeerId(from)}: ${message}`;
    messages.appendChild(li);
  }
}

window.addEventListener("load", main);
