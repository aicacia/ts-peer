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
  Message = "message",
  Boardcast = "boardcast",
  Peers = "peers",
  PeerConnect = "peer-connect",
  PeerDisconnect = "peer-disconnect",
}

export type IInternalRoomMessageMessage<M extends IMessage = IMessage> =
  IMessage<InternalRoomMessageType.Message, { to: string; message: M }>;
export type IInternalRoomMessageBoardcast<M extends IMessage = IMessage> =
  IMessage<InternalRoomMessageType.Boardcast, M>;
export type IInternalRoomMessagePeers = IMessage<
  InternalRoomMessageType.Peers,
  string[]
>;
export type IInternalRoomMessageConnection = IMessage<
  InternalRoomMessageType.PeerConnect,
  string
>;
export type IInternalRoomMessageDisconnect = IMessage<
  InternalRoomMessageType.PeerDisconnect,
  string
>;

export type IInternalRoomMessage<M extends IMessage = IMessage> =
  | IInternalRoomMessageMessage<M>
  | IInternalRoomMessageBoardcast<M>
  | IInternalRoomMessagePeers
  | IInternalRoomMessageConnection
  | IInternalRoomMessageDisconnect;

export const ROOM_MESSAGE_TYPE = "internal-room-message";
export type IRoomMessage<M extends IMessage = IMessage> = IMessage<
  typeof ROOM_MESSAGE_TYPE,
  IInternalRoomMessage<M>
>;

export function createRoomMessage<M extends IMessage = IMessage>(
  from: string,
  roomId: string,
  type: IInternalRoomMessage<M>["type"],
  payload: IInternalRoomMessage<M>["payload"]
) {
  return createMessage<IRoomMessage<M>>(
    roomId,
    ROOM_MESSAGE_TYPE,
    createMessage<IInternalRoomMessage<M>>(from, type, payload)
  );
}

export enum RoomEvent {
  StatusChange = "status-change",
}

export interface IRoomOptions {
  reconnectTimeoutMS?: number;
  syncMS?: number;
}

export interface RoomEvents<M extends IMessage = IMessage> {
  [RoomEvent.StatusChange]: (
    this: Room<M>,
    status: "server" | "client"
  ) => void;
  [AutoReconnectingPeerEvent.Open]: (this: Room<M>) => void;
  [AutoReconnectingPeerEvent.Close]: (this: Room<M>) => void;
  [AutoReconnectingPeerEvent.Error]: (this: Room<M>, error: PeerError) => void;
  [AutoReconnectingPeerEvent.Connection]: (this: Room<M>, id: string) => void;
  [AutoReconnectingPeerEvent.Disconnection]: (
    this: Room<M>,
    id: string
  ) => void;
  [AutoReconnectingPeerEvent.Message]: (
    this: Room<M>,
    from: string,
    message: M
  ) => void;
}

export class Room<M extends IMessage = IMessage> extends EventEmitter<
  RoomEvents<M>
> {
  protected roomId: string;
  protected peer: AutoReconnectingPeer<M>;
  protected server: AutoReconnectingPeer<IRoomMessage> | undefined;
  protected client: DataConnection | undefined;
  protected peers: Record<string, number> = {};
  protected reconnectTimeoutMS = 100;
  protected syncMS = 1000;
  protected closed = false;

  constructor(
    peer: AutoReconnectingPeer<M>,
    roomId: string,
    options: IRoomOptions = {}
  ) {
    super();
    this.roomId = roomId;
    this.peer = peer;
    this.peer.on(AutoReconnectingPeerEvent.Message, this.onPeerData);
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
  isServer() {
    return !!this.server;
  }
  isClient() {
    return !this.isServer();
  }

  async connect() {
    if (this.closed) {
      this.closed = false;
    }
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
    this.peer.off(AutoReconnectingPeerEvent.Message, this.onPeerData);
    this.emit(AutoReconnectingPeerEvent.Close);
    return this;
  };

  getPeers() {
    return Object.keys(this.peers);
  }

  send(to: string, type: M["type"], payload: M["payload"]) {
    this.client?.send(
      createRoomMessage(
        this.peer.getId(),
        this.roomId,
        InternalRoomMessageType.Message,
        { to, message: { from: this.peer.getId(), type, payload } }
      )
    );
    return this;
  }
  broadcast(type: M["type"], payload: M["payload"]) {
    this.client?.send(
      createRoomMessage(
        this.peer.getId(),
        this.roomId,
        InternalRoomMessageType.Boardcast,
        { from: this.peer.getId(), type, payload }
      )
    );
    return this;
  }

  private onPeerData = (_from: string, message: IRoomMessage | M) => {
    if (isMessageOfType<IRoomMessage<M>>(message, ROOM_MESSAGE_TYPE)) {
      const roomMessage = message.payload;

      if (
        isMessageOfType<IInternalRoomMessageMessage>(
          roomMessage,
          InternalRoomMessageType.Message
        ) &&
        roomMessage.payload.to === this.peer.getId()
      ) {
        this.peer.emit(
          AutoReconnectingPeerEvent.Message,
          roomMessage.from,
          roomMessage.payload.message
        );
        this.emit(
          AutoReconnectingPeerEvent.Message,
          roomMessage.from,
          roomMessage.payload.message
        );
      } else if (
        isMessageOfType<IInternalRoomMessageBoardcast>(
          roomMessage,
          InternalRoomMessageType.Boardcast
        )
      ) {
        this.peer.emit(
          AutoReconnectingPeerEvent.Message,
          roomMessage.from,
          roomMessage.payload
        );
        this.emit(
          AutoReconnectingPeerEvent.Message,
          roomMessage.from,
          roomMessage.payload
        );
      } else if (
        isMessageOfType<IInternalRoomMessagePeers>(
          roomMessage,
          InternalRoomMessageType.Peers
        )
      ) {
        for (const peerId of roomMessage.payload) {
          this.internalConnect(peerId);
        }
      } else if (
        isMessageOfType<IInternalRoomMessageConnection>(
          roomMessage,
          InternalRoomMessageType.PeerConnect
        )
      ) {
        this.internalConnect(roomMessage.payload);
      } else if (
        isMessageOfType<IInternalRoomMessageDisconnect>(
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
          this.emit(AutoReconnectingPeerEvent.Open);
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
        const server = new AutoReconnectingPeer<IRoomMessage<M>>(peer, {
          reconnectTimeoutMS: this.peer.getReconnectTimeoutMS(),
        });
        server.on(AutoReconnectingPeerEvent.Connection, async (peerId) => {
          this.internalConnect(peerId);
          server.send(
            peerId,
            createRoomMessage<M>(
              this.peer.getId(),
              this.roomId,
              InternalRoomMessageType.Peers,
              server.getPeerIds()
            )
          );
          server.broadcast(
            createRoomMessage<M>(
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
            createRoomMessage<M>(
              this.peer.getId(),
              this.roomId,
              InternalRoomMessageType.PeerDisconnect,
              peerId
            )
          );
          this.internalDisconnect(peerId);
        });
        server.on(AutoReconnectingPeerEvent.Message, (_from, message) => {
          if (isMessageOfType<IRoomMessage>(message, ROOM_MESSAGE_TYPE)) {
            const roomMessage = message.payload;

            if (
              isMessageOfType<IInternalRoomMessageMessage>(
                roomMessage,
                InternalRoomMessageType.Message
              )
            ) {
              server.send(roomMessage.payload.to, message);
            } else if (
              isMessageOfType<IInternalRoomMessageBoardcast>(
                roomMessage,
                InternalRoomMessageType.Boardcast
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
        this.emit(AutoReconnectingPeerEvent.Open);
      } catch (error) {
        this.onServeError(error as PeerError);
      }
    }
    return this;
  };
}
