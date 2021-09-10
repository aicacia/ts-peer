import { EventEmitter } from "eventemitter3";
import type PeerJS from "peerjs";
import type { DataConnection } from "peerjs";
import type { PeerError } from "./PeerError";
import { closeEventEmitter } from "./onClose";

export enum AutoReconnectingPeerEvent {
  Open = "open",
  Close = "close",
  Error = "error",
  ConnectionError = "connection-error",
  Connection = "connection",
  Disconnection = "disconnection",
  Data = "data",
}

export interface AutoReconnectingPeerEvents<D = any> {
  [AutoReconnectingPeerEvent.Open]: (this: AutoReconnectingPeer<D>) => void;
  [AutoReconnectingPeerEvent.Close]: (this: AutoReconnectingPeer<D>) => void;
  [AutoReconnectingPeerEvent.Error]: (
    this: AutoReconnectingPeer<D>,
    error: PeerError
  ) => void;
  [AutoReconnectingPeerEvent.ConnectionError]: (
    this: AutoReconnectingPeer<D>,
    error: PeerError,
    from: string
  ) => void;
  [AutoReconnectingPeerEvent.Connection]: (
    this: AutoReconnectingPeer<D>,
    id: string
  ) => void;
  [AutoReconnectingPeerEvent.Disconnection]: (
    this: AutoReconnectingPeer<D>,
    id: string
  ) => void;
  [AutoReconnectingPeerEvent.Data]: (
    this: AutoReconnectingPeer<D>,
    from: string,
    message: D
  ) => void;
}

export interface IAutoReconnectingPeerOptions {
  reconnectTimeoutMS?: number;
}

export class AutoReconnectingPeer<D = any> extends EventEmitter<
  AutoReconnectingPeerEvents<D>
> {
  protected peer: PeerJS;
  protected peers: Record<string, DataConnection> = {};
  protected reconnectTimeoutMS = 60_000;

  constructor(peer: PeerJS, options: IAutoReconnectingPeerOptions = {}) {
    super();
    this.peer = peer;
    if (
      options &&
      typeof options.reconnectTimeoutMS === "number" &&
      options.reconnectTimeoutMS >= 0
    ) {
      this.reconnectTimeoutMS = options.reconnectTimeoutMS;
    }
    this.peer.on("error", this.onError);
    this.peer.on("connection", this.waitForDataConnection);
    this.emit(AutoReconnectingPeerEvent.Open);
    closeEventEmitter.once("close", this.close);
  }

  private onError = (error: PeerError) => {
    this.emit(AutoReconnectingPeerEvent.Error, error);
  };

  private onDataConnection = async (dataConnection: DataConnection) => {
    const id = dataConnection.peer;

    dataConnection.on("data", (message: any) =>
      this.emit(AutoReconnectingPeerEvent.Data, id, message)
    );

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
              if (timeout < this.reconnectTimeoutMS) {
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

  static waitForPeer(peer: PeerJS) {
    return new Promise<PeerJS>((resolve, reject) => {
      if ((peer as any).open) {
        resolve(peer);
      } else {
        const onOpen = () => {
          peer.off("open", onOpen);
          peer.off("error", onError);
          resolve(peer);
        };
        const onError = (error: PeerError) => {
          peer.off("open", onOpen);
          peer.off("error", onError);
          reject(error);
        };

        peer.on("open", onOpen);
        peer.on("error", onError);

        if (peer.destroyed || peer.disconnected) {
          peer.reconnect();
        }
      }
    });
  }

  static async create<D = any>(
    peer: PeerJS,
    options: IAutoReconnectingPeerOptions = {}
  ) {
    return new AutoReconnectingPeer<D>(
      await AutoReconnectingPeer.waitForPeer(peer),
      options
    );
  }

  async open() {
    await AutoReconnectingPeer.waitForPeer(this.peer);
    return this;
  }

  getId() {
    return this.peer.id;
  }
  isOpen() {
    return !!(this.peer as any).open;
  }
  getInternal() {
    return this.peer;
  }
  getReconnectTimeoutMS() {
    return this.reconnectTimeoutMS;
  }

  waitForDataConnection = async (dataConnection: DataConnection) =>
    new Promise<DataConnection>((resolve, reject) => {
      if (dataConnection.open) {
        this.onDataConnection(dataConnection);
        resolve(dataConnection);
      } else {
        const onOpen = () => {
          dataConnection.off("open", onOpen);
          dataConnection.off("error", onError);
          this.onDataConnection(dataConnection);
          resolve(dataConnection);
        };
        const onError = (error: Error) => {
          dataConnection.off("open", onOpen);
          dataConnection.off("error", onError);
          reject(error);
        };
        dataConnection.on("open", onOpen);
        dataConnection.on("error", onError);
      }
    });

  connect(id: string) {
    const dataConnection = this.getPeer(id);

    if (dataConnection) {
      return Promise.resolve(dataConnection);
    } else {
      return this.waitForDataConnection(this.peer.connect(id));
    }
  }
  disconnect(id: string) {
    this.getPeer(id)?.close();
    delete this.peers[id];
    return this;
  }

  isConnected(id: string) {
    const dataConnections = this.peer.connections[id];
    return dataConnections && dataConnections.length > 0;
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

  send(to: string, data: D) {
    this.getPeer(to)?.send(data);
    return this;
  }

  broadcast(message: D, exclude: string[] = []) {
    for (const dataConnection of this.getPeers().filter(
      (dataConnection) => !exclude.includes(dataConnection.peer)
    )) {
      dataConnection.send(message);
    }
    return this;
  }

  close = () => {
    closeEventEmitter.off("close", this.close);
    this.peers = {};
    this.peer.destroy();
    this.emit(AutoReconnectingPeerEvent.Close);
    return this;
  };
}
