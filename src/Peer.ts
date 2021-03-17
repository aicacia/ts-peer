import { EventEmitter } from "events";
import PeerJS, { DataConnection } from "peerjs";
import { PeerError } from "./PeerError";
import { IMessage, isMessage, MessageType } from "./Message";

// tslint:disable-next-line: interface-name
export interface Peer<T = any> {
  on(event: "open", listener: (this: Peer) => void): this;
  on(event: "error", listener: (this: Peer, error: PeerError) => void): this;
  on(
    event: "connection-error",
    listener: (this: Peer, error: PeerError, from: string) => void
  ): this;
  on(event: "connection", listener: (this: Peer, id: string) => void): this;
  on(event: "disconnection", listener: (this: Peer, id: string) => void): this;
  on(
    event: "message",
    listener: (this: Peer, message: T, from: string) => void
  ): this;
  on(
    event: "invalid-message",
    listener: (this: Peer, message: any, from: string) => void
  ): this;
  off(event: "open", listener: (this: Peer) => void): this;
  off(event: "error", listener: (this: Peer, error: PeerError) => void): this;
  off(
    event: "connection-error",
    listener: (this: Peer, error: PeerError, from: string) => void
  ): this;
  off(event: "connection", listener: (this: Peer, id: string) => void): this;
  off(event: "disconnection", listener: (this: Peer, id: string) => void): this;
  off(
    event: "message",
    listener: (this: Peer, message: T, from: string) => void
  ): this;
}

export interface IPeerOptions {
  reconnectTimeoutMS?: number;
}

export class Peer<T = any> extends EventEmitter {
  private peer: PeerJS;
  private peers: Record<string, DataConnection> = {};
  private reconnectTimeoutMS = 60_000;

  constructor(peer: PeerJS, options: IPeerOptions = {}) {
    super();
    this.peer = peer;
    if (options.reconnectTimeoutMS) {
      this.reconnectTimeoutMS = options.reconnectTimeoutMS;
    }
    this.peer.on("error", this.onError);
    this.peer.on("connection", (dataConnection) => {
      if (dataConnection.open) {
        this.onDataConnection(dataConnection);
      } else {
        const onOpen = () => {
          dataConnection.send({
            type: MessageType.Peers,
            payload: this.getPeerIds(),
          });
          dataConnection.off("open", onOpen);
          this.onDataConnection(dataConnection);
        };
        dataConnection.on("open", onOpen);
      }
    });
  }

  private onError = (error: PeerError) => {
    this.emit("error", error);
  };

  private onDataConnection = (dataConnection: DataConnection) => {
    const id = dataConnection.peer;

    dataConnection.on("data", (data: any) => {
      if (isMessage(data)) {
        this.onMessage(data);
      } else {
        this.emit("invalid-message", data, id);
      }
    });

    const onClose = () => {
      delete this.peers[id];
      this.emit("disconnection", id);
    };

    dataConnection.on("close", () => {
      onClose();

      let timeout = 1000;
      const reconnect = () => {
        this.connect(id).catch(() => {
          if (timeout > this.reconnectTimeoutMS) {
            timeout *= 2;
            setTimeout(reconnect, timeout);
          }
        });
      };
      setTimeout(reconnect, timeout);
    });

    dataConnection.on("error", (error: PeerError) => {
      onClose();
      this.emit("connection-error", error, id);
    });

    this.peers[id] = dataConnection;
    this.emit("connection", id);
  };

  private onMessage = (message: IMessage<T>) => {
    if (message.type === MessageType.Peers) {
      for (const peerId of message.payload as any) {
        if (peerId !== this.getId()) {
          this.connect(peerId);
        }
      }
    } else {
      this.emit("message", message.payload, message.from);
    }
  };

  static create<T = any>(peer: PeerJS) {
    return new Promise<Peer<T>>((resolve, reject) => {
      const onOpen = () => {
        peer.off("open", onOpen);
        peer.off("error", onError);
        resolve(new Peer(peer));
      };
      const onError = (error: PeerError) => {
        peer.off("error", onError);
        reject(error);
      };
      peer.on("open", onOpen);
      peer.on("error", onError);
    });
  }

  getId() {
    return this.peer.id;
  }

  connect(id: string) {
    const dataConnection = this.peers[id];

    if (dataConnection) {
      return Promise.resolve(dataConnection);
    } else {
      const dataConnection = this.peer.connect(id);

      return new Promise<DataConnection>((resolve, reject) => {
        const onOpen = () => {
          dataConnection.off("open", onOpen);
          dataConnection.off("error", onError);
          this.onDataConnection(dataConnection);
          resolve(dataConnection);
        };
        const onError = (error: Error) => {
          dataConnection.off("error", onError);
          reject(error);
        };
        dataConnection.on("open", onOpen);
        dataConnection.on("error", onError);
      });
    }
  }

  getPeer(id: string): DataConnection | undefined {
    return this.peers[id];
  }
  getPeerIds() {
    return Object.keys(this.peers);
  }
  getPeers() {
    return Object.values(this.peers);
  }

  send(to: string, payload: T) {
    this.getPeer(to)?.send({
      type: MessageType.Data,
      from: this.getId(),
      payload,
    });
    return this;
  }

  broadcast(payload: T) {
    const message = { type: MessageType.Data, from: this.getId(), payload };

    for (const dataConnection of this.getPeers()) {
      dataConnection.send(message);
    }

    return this;
  }
}
