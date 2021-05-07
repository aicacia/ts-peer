import { EventEmitter } from "eventemitter3";
import PeerJS, { DataConnection } from "peerjs";
import { PeerError } from "./PeerError";
import {
  AutoReconnectingPeerEvent,
  AutoReconnectingPeer,
} from "./AutoReconnectingPeer";
import { createMessage, IMessage, isMessage } from "./Message";
import { closeEventEmitter } from "./onClose";

export enum InternalRoomMessageType {
  Peers = "peers",
  PeerConnect = "peer-connect",
  PeerDisconnect = "peer-disconnect",
}

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

export type IInternalRoomMessage =
  | IRoomPeersMessage
  | IRoomPeerConnectMessage
  | IRoomPeerDisconnectMessage;

export const ROOM_MESSAGE_TYPE = "internal-room-message";
export type IRoomMessage = IMessage<
  typeof ROOM_MESSAGE_TYPE,
  IInternalRoomMessage
>;

export function createRoomMessage(
  roomId: string,
  type: IInternalRoomMessage["type"],
  payload: IInternalRoomMessage["payload"]
) {
  return createMessage<IRoomMessage>(
    roomId,
    ROOM_MESSAGE_TYPE,
    createMessage(roomId, type, payload, roomId)
  );
}

export enum RoomEvent {
  StatusChange = "status-change",
}

// tslint:disable-next-line: interface-name
export interface Room<M extends IMessage = IMessage> {
  on(
    event: RoomEvent.StatusChange,
    listener: (this: Room<M>, status: "server" | "client") => void
  ): this;
  on(
    event: AutoReconnectingPeerEvent.Open,
    listener: (this: Room<M>) => void
  ): this;
  on(
    event: AutoReconnectingPeerEvent.Error,
    listener: (this: Room<M>, error: PeerError) => void
  ): this;
  on(
    event: AutoReconnectingPeerEvent.Connection,
    listener: (this: Room<M>, id: string) => void
  ): this;
  on(
    event: AutoReconnectingPeerEvent.Disconnection,
    listener: (this: Room<M>, id: string) => void
  ): this;
  on(
    event: AutoReconnectingPeerEvent.InvalidMessage,
    listener: (this: Room<M>, message: any, from: string) => void
  ): this;
  on(
    event: AutoReconnectingPeerEvent.Message,
    listener: (this: Room<M>, message: M) => void
  ): this;
  off(
    event: RoomEvent.StatusChange,
    listener: (this: Room<M>, status: "server" | "client") => void
  ): this;
  off(
    event: AutoReconnectingPeerEvent.Open,
    listener: (this: Room<M>) => void
  ): this;
  off(
    event: AutoReconnectingPeerEvent.Error,
    listener: (this: Room<M>, error: PeerError) => void
  ): this;
  off(
    event: AutoReconnectingPeerEvent.Connection,
    listener: (this: Room<M>, id: string) => void
  ): this;
  off(
    event: AutoReconnectingPeerEvent.Disconnection,
    listener: (this: Room<M>, id: string) => void
  ): this;
  off(
    event: AutoReconnectingPeerEvent.InvalidMessage,
    listener: (this: Room<M>, message: any, from: string) => void
  ): this;
  off(
    event: AutoReconnectingPeerEvent.Message,
    listener: (this: Room<M>, message: M) => void
  ): this;
}

export class Room<M extends IMessage = IMessage> extends EventEmitter {
  protected roomId: string;
  protected peer: AutoReconnectingPeer<M>;
  protected server: AutoReconnectingPeer<IRoomMessage> | undefined;
  protected client: DataConnection | undefined;
  protected peers: Set<string> = new Set();

  constructor(peer: AutoReconnectingPeer<M>, roomId: string) {
    super();
    this.peer = peer;
    this.roomId = roomId;
    closeEventEmitter.once("close", this.close);
  }

  static async create<M extends IMessage>(
    peer: AutoReconnectingPeer<M>,
    roomId: string
  ) {
    const room = new Room<M>(peer, roomId);
    room.peer.on(AutoReconnectingPeerEvent.Disconnection, room.onDisconnection);
    room.peer.on(AutoReconnectingPeerEvent.Message, room.onMessage);
    room.peer.on(
      AutoReconnectingPeerEvent.InvalidMessage,
      room.onInvalidMessage
    );
    await room.serve();
    room.emit(AutoReconnectingPeerEvent.Open);
    return room;
  }

  private onDisconnection = (id: string) => {
    if (this.peers.has(id)) {
      this.disconnect(id);
    }
  };

  private onMessage = (message: IInternalRoomMessage | M) => {
    if (message.room === this.roomId) {
      this.emit(AutoReconnectingPeerEvent.Message, message);
    }
  };
  private onInvalidMessage = (message: any, from: string) => {
    if (this.peers.has(from)) {
      this.emit(AutoReconnectingPeerEvent.InvalidMessage, message, from);
    }
  };

  getRoomId() {
    return this.roomId;
  }
  getPeer() {
    return this.peer;
  }

  close = () => {
    closeEventEmitter.off("close", this.close);
    this.server?.close();
    if (this.client) {
      this.peer.disconnect(this.roomId);
      this.client = undefined;
    }
    this.peer.off(
      AutoReconnectingPeerEvent.Disconnection,
      this.onDisconnection
    );
    this.peer.off(AutoReconnectingPeerEvent.Message, this.onMessage);
    this.peer.off(
      AutoReconnectingPeerEvent.InvalidMessage,
      this.onInvalidMessage
    );
    this.emit(AutoReconnectingPeerEvent.Close);
    return this;
  };

  sendMessage(to: string, message: M) {
    if (this.peers.has(to) && message.room === this.roomId) {
      this.peer.sendMessage(to, message);
    }
    return this;
  }
  send(to: string, type: M["type"], payload: M["payload"]) {
    return this.sendMessage(
      to,
      createMessage(this.peer.getId(), type, payload, this.roomId)
    );
  }

  broadcastMessage(message: M, exclude: string[] = []) {
    if (message.room === this.roomId) {
      for (const peerId of this.getPeers()) {
        if (!exclude.includes(peerId)) {
          this.peer.sendMessage(peerId, message);
        }
      }
    }
    return this;
  }
  broadcast(type: M["type"], payload: M["payload"], exclude: string[] = []) {
    return this.broadcastMessage(
      createMessage(this.peer.getId(), type, payload, this.roomId),
      exclude
    );
  }

  getPeers() {
    return this.peers;
  }

  private async connect(id: string) {
    await this.peer.connect(id);
    this.peers.add(id);
    this.emit(AutoReconnectingPeerEvent.Connection, id);
    return this;
  }
  private async disconnect(id: string) {
    this.peers.delete(id);
    this.emit(AutoReconnectingPeerEvent.Disconnection, id);
    await this.peer.disconnect(id);
    return this;
  }

  private onJoinError = (error: PeerError) => {
    this.client = undefined;
    switch (error.type) {
      case "network":
      case "server-error":
      case "socket-closed":
      case "socket-error":
        this.join();
        break;
      case "peer-unvailable":
        this.serve();
        break;
    }
    return this;
  };

  private onJoinClose = () => {
    if (this.client) {
      this.serve();
      this.client = undefined;
    }
    return this;
  };

  private async join() {
    try {
      const client = await this.peer.connect(this.roomId);
      client.on("data", (message) => {
        if (
          isMessage<IRoomMessage>(message) &&
          message.type === ROOM_MESSAGE_TYPE
        ) {
          const internalMessage = message.payload;

          switch (internalMessage.type) {
            case InternalRoomMessageType.Peers:
              internalMessage.payload.forEach((peerId) => this.connect(peerId));
              return;
            case InternalRoomMessageType.PeerConnect:
              this.connect(internalMessage.payload);
              return;
            case InternalRoomMessageType.PeerDisconnect:
              this.disconnect(internalMessage.payload);
              return;
          }
        }
      });
      client.on("error", this.onJoinError);
      client.on("close", this.onJoinClose);
      this.client = client;
      this.emit(RoomEvent.StatusChange, "client");
    } catch (error) {
      this.onJoinError(error);
    }
    return this;
  }

  private onServeError = (error: PeerError) => {
    this.server = undefined;
    switch (error.type) {
      case "network":
      case "server-error":
      case "socket-closed":
      case "socket-error":
        this.serve();
        break;
      case "unavailable-id":
        this.join();
        break;
    }
    return this;
  };

  private async serve() {
    try {
      const server = await AutoReconnectingPeer.create<IRoomMessage>(
        new PeerJS(this.roomId),
        { reconnectTimeoutMS: this.peer.getReconnectTimeoutMS() }
      );
      server.on(AutoReconnectingPeerEvent.Error, this.onServeError);
      server.on(AutoReconnectingPeerEvent.Connection, async (id) => {
        await this.connect(id);
        const peers = new Set(this.peers.keys());
        peers.add(this.peer.getId());
        peers.delete(id);
        server.sendMessage(
          id,
          createRoomMessage(
            this.roomId,
            InternalRoomMessageType.Peers,
            Array.from(peers)
          )
        );
        server.broadcastMessage(
          createRoomMessage(
            this.roomId,
            InternalRoomMessageType.PeerConnect,
            id
          ),
          [id]
        );
      });
      server.on(AutoReconnectingPeerEvent.Disconnection, async (id) => {
        server.broadcastMessage(
          createRoomMessage(
            this.roomId,
            InternalRoomMessageType.PeerDisconnect,
            id
          ),
          [id]
        );
        await this.disconnect(id);
      });
      this.server = server;
      this.emit(RoomEvent.StatusChange, "server");
    } catch (error) {
      this.onServeError(error);
    }
    return this;
  }
}
