import { EventEmitter } from "eventemitter3";
import type { DataConnection } from "peerjs";
import type PeerJS from "peerjs";
import type { PeerError } from "./PeerError";
import {
  AutoReconnectingPeerEvent,
  AutoReconnectingPeer,
} from "./AutoReconnectingPeer";
import { createMessage, IMessage, isMessageOfType } from "./Message";
import { closeEventEmitter } from "./onClose";

export enum InternalRoomMessageType {
  Data = "data",
  Peers = "peers",
  PeerConnect = "peer-connect",
  PeerDisconnect = "peer-disconnect",
}

export type IRoomDataMessage<D = any> = IMessage<
  InternalRoomMessageType.Data,
  D
>;
export type IRoomPeersMessage = IMessage<
  InternalRoomMessageType.Peers,
  string[]
>;
export type IRoomPeerConnectMessage = IMessage<
  InternalRoomMessageType.PeerConnect,
  string
>;
export type IRoomPeerDisconnectMessage = IMessage<
  InternalRoomMessageType.PeerDisconnect,
  string
>;

export type IInternalRoomMessage<D = any> =
  | IRoomDataMessage<D>
  | IRoomPeersMessage
  | IRoomPeerConnectMessage
  | IRoomPeerDisconnectMessage;

export const ROOM_MESSAGE_TYPE = "internal-room-message";
export type IRoomMessage<D = any> = IMessage<
  typeof ROOM_MESSAGE_TYPE,
  IInternalRoomMessage<D>
>;

export function createRoomMessage<D>(
  from: string,
  roomId: string,
  type: IInternalRoomMessage["type"],
  payload: IInternalRoomMessage["payload"]
) {
  return createMessage<IRoomMessage<D>>(
    roomId,
    ROOM_MESSAGE_TYPE,
    createMessage(from, type, payload)
  );
}

export enum RoomEvent {
  StatusChange = "status-change",
}

export interface IRoomOptions {
  reconnectTimeoutMS?: number;
  syncMS?: number;
}

export interface RoomEvents<D = any> {
  [RoomEvent.StatusChange]: (
    this: Room<D>,
    status: "server" | "client"
  ) => void;
  [AutoReconnectingPeerEvent.Close]: (this: Room<D>) => void;
  [AutoReconnectingPeerEvent.Error]: (this: Room<D>, error: PeerError) => void;
  [AutoReconnectingPeerEvent.Connection]: (this: Room<D>, id: string) => void;
  [AutoReconnectingPeerEvent.Disconnection]: (
    this: Room<D>,
    id: string
  ) => void;
  [AutoReconnectingPeerEvent.Data]: (
    this: Room<D>,
    from: string,
    message: D
  ) => void;
}

export class Room<D = any> extends EventEmitter<RoomEvents<D>> {
  protected roomId: string;
  protected peer: AutoReconnectingPeer<D>;
  protected server: AutoReconnectingPeer<IRoomMessage> | undefined;
  protected client: DataConnection | undefined;
  protected peers: Record<string, number> = {};
  protected reconnectTimeoutMS = 100;
  protected syncMS = 1000;
  protected closed = false;

  constructor(
    peer: AutoReconnectingPeer<D>,
    roomId: string,
    options: IRoomOptions = {}
  ) {
    super();
    this.roomId = roomId;
    this.peer = peer;
    this.peer.on(AutoReconnectingPeerEvent.Data, this.onPeerData);
    if (options) {
      if (
        typeof options.reconnectTimeoutMS === "number" &&
        options.reconnectTimeoutMS >= 0
      ) {
        this.reconnectTimeoutMS = options.reconnectTimeoutMS;
      }
      if (typeof options.syncMS === "number" && options.syncMS >= 0) {
        this.syncMS = options.syncMS;
      }
    }
    closeEventEmitter.once("close", this.close);
  }

  isOpen() {
    return this.peer.getPeer(this.roomId)?.open;
  }

  async connect() {
    this.closed = false;
    return this.serve();
  }

  getRoomId() {
    return this.roomId;
  }
  getPeer() {
    return this.peer;
  }

  close = () => {
    this.closed = true;
    closeEventEmitter.off("close", this.close);
    this.onServeClose();
    this.onJoinClose();
    this.peer.off(AutoReconnectingPeerEvent.Data, this.onPeerData);
    this.emit(AutoReconnectingPeerEvent.Close);
    return this;
  };

  getPeers() {
    return Object.keys(this.peers);
  }

  send(message: D) {
    this.client?.send(
      createRoomMessage(
        this.peer.getId(),
        this.roomId,
        InternalRoomMessageType.Data,
        message
      )
    );
    return this;
  }

  private onPeerData = async (from: string, message: IRoomMessage | D) => {
    if (isMessageOfType<IRoomMessage>(message, ROOM_MESSAGE_TYPE)) {
      const roomMessage = message.payload;

      if (
        isMessageOfType<IRoomDataMessage>(
          roomMessage,
          InternalRoomMessageType.Data
        )
      ) {
        this.peer.emit(
          AutoReconnectingPeerEvent.Data,
          roomMessage.from,
          roomMessage.payload
        );
        this.emit(
          AutoReconnectingPeerEvent.Data,
          roomMessage.from,
          roomMessage.payload
        );
      } else if (
        isMessageOfType<IRoomPeersMessage>(
          roomMessage,
          InternalRoomMessageType.Peers
        )
      ) {
        for (const peerId of roomMessage.payload) {
          this.internalConnect(peerId);
        }
      } else if (
        isMessageOfType<IRoomPeerConnectMessage>(
          roomMessage,
          InternalRoomMessageType.PeerConnect
        )
      ) {
        this.internalConnect(roomMessage.payload);
      } else if (
        isMessageOfType<IRoomPeerDisconnectMessage>(
          roomMessage,
          InternalRoomMessageType.PeerDisconnect
        )
      ) {
        this.internalDisconnect(roomMessage.payload);
      }
    }
  };

  private internalConnect(peerId: string) {
    this.peers[peerId] = Date.now();
    this.emit(AutoReconnectingPeerEvent.Connection, peerId);
  }
  private internalDisconnect(peerId: string) {
    this.emit(AutoReconnectingPeerEvent.Disconnection, peerId);
    delete this.peers[peerId];
  }

  private onJoinError = (error: PeerError) => {
    this.onJoinClose();
    switch (error.type) {
      case "network":
      case "server-error":
      case "socket-closed":
      case "socket-error":
        setTimeout(this.join, this.reconnectTimeoutMS);
        break;
      case "peer-unvailable":
        this.serve();
        break;
    }
    this.emit(AutoReconnectingPeerEvent.Error, error);
  };

  private onJoinClose = () => {
    this.peer.disconnect(this.roomId);
    this.client = undefined;
    for (const peerId of this.getPeers()) {
      this.internalDisconnect(peerId);
    }
    this.peers = {};
    if (!this.closed) {
      this.serve();
    }
    return this;
  };

  private async join(emit = true) {
    if (!this.client) {
      try {
        const client = this.peer.getInternal().connect(this.roomId);
        client.on("error", this.onJoinError);
        client.on("close", this.onJoinClose);
        await this.peer.waitForDataConnection(client);
        this.client = client;
        if (emit) {
          this.emit(RoomEvent.StatusChange, "client");
        }
      } catch (error) {
        this.onJoinError(error as PeerError);
      }
    }
    return this;
  }

  private onServeError = (error: PeerError) => {
    this.onServeClose();
    switch (error.type) {
      case "network":
      case "server-error":
      case "socket-closed":
      case "socket-error":
        setTimeout(this.serve, this.reconnectTimeoutMS);
        break;
      case "unavailable-id":
        this.join();
        break;
    }
    this.emit(AutoReconnectingPeerEvent.Error, error);
  };

  private onServeClose = () => {
    this.server?.close();
    this.server = undefined;
    for (const peerId of this.getPeers()) {
      this.internalDisconnect(peerId);
    }
    this.peers = {};
    return this;
  };

  private serve = async () => {
    if (!this.server) {
      try {
        const PeerJSConstructor: typeof PeerJS = Object.getPrototypeOf(
          this.peer.getInternal() as any
        ).constructor;
        const peer = new PeerJSConstructor(
          this.roomId,
          (this.peer.getInternal() as any).options
        );
        const server = new AutoReconnectingPeer<IRoomMessage>(peer, {
          reconnectTimeoutMS: this.peer.getReconnectTimeoutMS(),
        });
        server.on(AutoReconnectingPeerEvent.Connection, async (peerId) => {
          this.internalConnect(peerId);
          server.send(
            peerId,
            createRoomMessage(
              this.peer.getId(),
              this.roomId,
              InternalRoomMessageType.Peers,
              server.getPeerIds()
            )
          );
          server.broadcast(
            createRoomMessage(
              this.peer.getId(),
              this.roomId,
              InternalRoomMessageType.PeerConnect,
              peerId
            ),
            [peerId]
          );
        });
        server.on(AutoReconnectingPeerEvent.Disconnection, (peerId) => {
          server.broadcast(
            createRoomMessage(
              this.peer.getId(),
              this.roomId,
              InternalRoomMessageType.PeerDisconnect,
              peerId
            )
          );
          this.internalDisconnect(peerId);
        });
        server.on(AutoReconnectingPeerEvent.Data, (from, message) => {
          if (isMessageOfType<IRoomMessage>(message, ROOM_MESSAGE_TYPE)) {
            const roomMessage = message.payload;
            if (
              isMessageOfType<IRoomDataMessage>(
                roomMessage,
                InternalRoomMessageType.Data
              )
            ) {
              server.broadcast(message);
            }
          }
        });
        server.on(AutoReconnectingPeerEvent.Error, this.onServeError);
        await AutoReconnectingPeer.waitForPeer(peer);
        this.server = server;
        await this.join(false);
        this.emit(RoomEvent.StatusChange, "server");
      } catch (error) {
        this.onServeError(error as PeerError);
      }
    }
    return this;
  };
}
