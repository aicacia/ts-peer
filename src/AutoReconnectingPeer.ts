import { EventEmitter } from "events";
import PeerJS, { DataConnection } from "peerjs";
import { PeerError } from "./PeerError";
import { createMessage, IMessage, isMessage } from "./Message";
import { Option } from "@aicacia/core";
import { closeEventEmitter } from "./onClose";

export enum AutoReconnectingPeerEvent {
  Open = "open",
  Close = "close",
  Error = "error",
  ConnectionError = "connection-error",
  Connection = "connection",
  Disconnection = "disconnection",
  Message = "message",
  InvalidMessage = "invalid-message",
}

// tslint:disable-next-line: interface-name
export interface AutoReconnectingPeer<M extends IMessage = IMessage> {
  on(
    event: AutoReconnectingPeerEvent.Open,
    listener: (this: AutoReconnectingPeer<M>) => void
  ): this;
  on(
    event: AutoReconnectingPeerEvent.Error,
    listener: (this: AutoReconnectingPeer<M>, error: PeerError) => void
  ): this;
  on(
    event: AutoReconnectingPeerEvent.ConnectionError,
    listener: (
      this: AutoReconnectingPeer<M>,
      error: PeerError,
      from: string
    ) => void
  ): this;
  on(
    event: AutoReconnectingPeerEvent.Connection,
    listener: (this: AutoReconnectingPeer<M>, id: string) => void
  ): this;
  on(
    event: AutoReconnectingPeerEvent.Disconnection,
    listener: (this: AutoReconnectingPeer<M>, id: string) => void
  ): this;
  on(
    event: AutoReconnectingPeerEvent.InvalidMessage,
    listener: (
      this: AutoReconnectingPeer<M>,
      message: any,
      from: string
    ) => void
  ): this;
  on(
    event: AutoReconnectingPeerEvent.Message,
    listener: (this: AutoReconnectingPeer<M>, message: M) => void
  ): this;
  off(
    event: AutoReconnectingPeerEvent.Open,
    listener: (this: AutoReconnectingPeer<M>) => void
  ): this;
  off(
    event: AutoReconnectingPeerEvent.Error,
    listener: (this: AutoReconnectingPeer<M>, error: PeerError) => void
  ): this;
  off(
    event: AutoReconnectingPeerEvent.ConnectionError,
    listener: (
      this: AutoReconnectingPeer<M>,
      error: PeerError,
      from: string
    ) => void
  ): this;
  off(
    event: AutoReconnectingPeerEvent.Connection,
    listener: (this: AutoReconnectingPeer<M>, id: string) => void
  ): this;
  off(
    event: AutoReconnectingPeerEvent.Disconnection,
    listener: (this: AutoReconnectingPeer<M>, id: string) => void
  ): this;
  off(
    event: AutoReconnectingPeerEvent.InvalidMessage,
    listener: (
      this: AutoReconnectingPeer<M>,
      message: any,
      from: string
    ) => void
  ): this;
  off(
    event: AutoReconnectingPeerEvent.Message,
    listener: (this: AutoReconnectingPeer<M>, message: M) => void
  ): this;
}

export interface IAutoReconnectingPeerOptions {
  reconnectTimeoutMS?: number;
}

export class AutoReconnectingPeer<M extends IMessage> extends EventEmitter {
  protected peer: PeerJS;
  protected peers: Record<string, DataConnection> = {};
  protected reconnectTimeoutMS = 60_000;

  constructor(peer: PeerJS, options: IAutoReconnectingPeerOptions = {}) {
    super();
    this.peer = peer;
    if (options.reconnectTimeoutMS) {
      this.reconnectTimeoutMS = options.reconnectTimeoutMS;
    }
    this.peer.on("error", this.onError);
    this.peer.on("connection", this.onDataConnection);
    this.emit(AutoReconnectingPeerEvent.Open);
    closeEventEmitter.once("close", this.close);
  }

  private onError = (error: PeerError) => {
    this.emit(AutoReconnectingPeerEvent.Error, error);
  };

  private onDataConnection = (dataConnection: DataConnection) => {
    const id = dataConnection.peer;

    dataConnection.on("data", (data: any) => {
      if (isMessage<M>(data)) {
        this.onMessage(data);
      } else {
        this.emit(AutoReconnectingPeerEvent.InvalidMessage, data, id);
      }
    });

    const onClose = () => {
      delete this.peers[id];
      this.emit(AutoReconnectingPeerEvent.Disconnection, id);
    };

    dataConnection.on("close", onClose);
    dataConnection.on("error", (error: PeerError) => {
      onClose();
      this.emit(AutoReconnectingPeerEvent.ConnectionError, error, id);

      switch (error.type) {
        case "network":
        case "peer-unvailable":
        case "server-error":
        case "socket-closed":
        case "socket-error":
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
      }
    });

    this.peers[id] = dataConnection;
    this.emit(AutoReconnectingPeerEvent.Connection, id);
  };

  private onMessage = (message: M) => {
    this.emit(AutoReconnectingPeerEvent.Message, message);
  };

  static connectToPeerJS(peer: PeerJS) {
    if ((peer as any).open) {
      return peer;
    } else {
      return new Promise<PeerJS>((resolve, reject) => {
        const onOpen = () => {
          peer.off("open", onOpen);
          peer.off("error", onError);
          resolve(peer);
        };
        const onError = (error: PeerError) => {
          peer.off("error", onError);
          reject(error);
        };

        peer.on("open", onOpen);
        peer.on("error", onError);
        if (peer.destroyed || peer.disconnected) {
          peer.reconnect();
        }
      });
    }
  }

  static async create<M extends IMessage>(
    peer: PeerJS,
    options: IAutoReconnectingPeerOptions = {}
  ) {
    return new AutoReconnectingPeer<M>(
      await AutoReconnectingPeer.connectToPeerJS(peer),
      options
    );
  }

  getId() {
    return this.peer.id;
  }
  getInternal() {
    return this.peer;
  }
  getReconnectTimeoutMS() {
    return this.reconnectTimeoutMS;
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
        if (dataConnection.open) {
          this.onDataConnection(dataConnection);
          resolve(dataConnection);
        } else {
          dataConnection.on("open", onOpen);
          dataConnection.on("error", onError);
        }
      });
    }
  }
  disconnect(id: string) {
    this.getPeer(id).ifSome((peer) => peer.close());
    return this;
  }

  getPeer(id: string): Option<DataConnection> {
    return Option.from(this.peers[id]);
  }
  getPeerIds() {
    return Object.keys(this.peers);
  }
  getPeers() {
    return Object.values(this.peers);
  }

  sendMessage(to: string, message: M) {
    this.getPeer(to).ifSome((peer) => peer.send(message));
    return this;
  }
  send(to: string, type: M["type"], payload: M["payload"]) {
    return this.sendMessage(to, createMessage(this.getId(), type, payload));
  }

  broadcastMessage(message: M, exclude: string[] = []) {
    for (const dataConnection of this.getPeers()) {
      if (exclude.indexOf(dataConnection.peer) === -1) {
        dataConnection.send(message);
      }
    }
    return this;
  }
  broadcast(type: M["type"], payload: M["payload"], exclude: string[] = []) {
    return this.broadcastMessage(
      createMessage(this.getId(), type, payload),
      exclude
    );
  }

  close = () => {
    closeEventEmitter.off("close", this.close);
    this.peers = {};
    this.peer.destroy();
    this.emit(AutoReconnectingPeerEvent.Close);
    return this;
  };
}
