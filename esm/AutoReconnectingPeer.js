import { EventEmitter } from "eventemitter3";
import { closeEventEmitter } from "./onClose";
export var AutoReconnectingPeerEvent;
(function (AutoReconnectingPeerEvent) {
    AutoReconnectingPeerEvent["Open"] = "open";
    AutoReconnectingPeerEvent["Close"] = "close";
    AutoReconnectingPeerEvent["Error"] = "error";
    AutoReconnectingPeerEvent["ConnectionError"] = "connection-error";
    AutoReconnectingPeerEvent["Connection"] = "connection";
    AutoReconnectingPeerEvent["Disconnection"] = "disconnection";
    AutoReconnectingPeerEvent["Data"] = "data";
})(AutoReconnectingPeerEvent || (AutoReconnectingPeerEvent = {}));
export class AutoReconnectingPeer extends EventEmitter {
    peer;
    peers = {};
    reconnectTimeoutMS = 60_000;
    constructor(peer, options = {}) {
        super();
        this.peer = peer;
        if (options &&
            typeof options.reconnectTimeoutMS === "number" &&
            options.reconnectTimeoutMS >= 0) {
            this.reconnectTimeoutMS = options.reconnectTimeoutMS;
        }
        this.peer.on("error", this.onError);
        this.peer.on("connection", this.waitForDataConnection);
        this.emit(AutoReconnectingPeerEvent.Open);
        closeEventEmitter.once("close", this.close);
    }
    onError = (error) => {
        this.emit(AutoReconnectingPeerEvent.Error, error);
    };
    onDataConnection = async (dataConnection) => {
        const id = dataConnection.peer;
        dataConnection.on("data", (message) => this.emit(AutoReconnectingPeerEvent.Data, id, message));
        const onClose = () => {
            delete this.peers[id];
            this.emit(AutoReconnectingPeerEvent.Disconnection, id);
        };
        dataConnection.on("close", onClose);
        dataConnection.on("error", (error) => {
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
    static waitForPeer(peer) {
        return new Promise((resolve, reject) => {
            if (peer.open) {
                resolve(peer);
            }
            else {
                const onOpen = () => {
                    peer.off("open", onOpen);
                    peer.off("error", onError);
                    resolve(peer);
                };
                const onError = (error) => {
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
    static async create(peer, options = {}) {
        return new AutoReconnectingPeer(await AutoReconnectingPeer.waitForPeer(peer), options);
    }
    async open() {
        await AutoReconnectingPeer.waitForPeer(this.peer);
        return this;
    }
    getId() {
        return this.peer.id;
    }
    isOpen() {
        return !!this.peer.open;
    }
    getInternal() {
        return this.peer;
    }
    getReconnectTimeoutMS() {
        return this.reconnectTimeoutMS;
    }
    waitForDataConnection = async (dataConnection) => new Promise((resolve, reject) => {
        if (dataConnection.open) {
            this.onDataConnection(dataConnection);
            resolve(dataConnection);
        }
        else {
            const onOpen = () => {
                dataConnection.off("open", onOpen);
                dataConnection.off("error", onError);
                this.onDataConnection(dataConnection);
                resolve(dataConnection);
            };
            const onError = (error) => {
                dataConnection.off("open", onOpen);
                dataConnection.off("error", onError);
                reject(error);
            };
            dataConnection.on("open", onOpen);
            dataConnection.on("error", onError);
        }
    });
    connect(id) {
        const dataConnection = this.getPeer(id);
        if (dataConnection) {
            return Promise.resolve(dataConnection);
        }
        else {
            return this.waitForDataConnection(this.peer.connect(id));
        }
    }
    disconnect(id) {
        this.getPeer(id)?.close();
        delete this.peers[id];
        return this;
    }
    isConnected(id) {
        const dataConnections = this.peer.connections[id];
        return dataConnections && dataConnections.length > 0;
    }
    getPeer(id) {
        return this.peers[id];
    }
    getPeerIds() {
        return Object.keys(this.peers);
    }
    getPeers() {
        return Object.values(this.peers);
    }
    send(to, data) {
        this.getPeer(to)?.send(data);
        return this;
    }
    broadcast(message, exclude = []) {
        for (const dataConnection of this.getPeers().filter((dataConnection) => !exclude.includes(dataConnection.peer))) {
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
