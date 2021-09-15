"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutoReconnectingPeer = exports.AutoReconnectingPeerEvent = void 0;
const tslib_1 = require("tslib");
const eventemitter3_1 = require("eventemitter3");
const onClose_1 = require("./onClose");
var AutoReconnectingPeerEvent;
(function (AutoReconnectingPeerEvent) {
    AutoReconnectingPeerEvent["Open"] = "open";
    AutoReconnectingPeerEvent["Close"] = "close";
    AutoReconnectingPeerEvent["Error"] = "error";
    AutoReconnectingPeerEvent["ConnectionError"] = "connection-error";
    AutoReconnectingPeerEvent["Connection"] = "connection";
    AutoReconnectingPeerEvent["Disconnection"] = "disconnection";
    AutoReconnectingPeerEvent["Message"] = "data";
})(AutoReconnectingPeerEvent = exports.AutoReconnectingPeerEvent || (exports.AutoReconnectingPeerEvent = {}));
class AutoReconnectingPeer extends eventemitter3_1.EventEmitter {
    constructor(peer, options = {}) {
        super();
        this.peers = {};
        this.reconnectTimeoutMS = 60000;
        this.onError = (error) => {
            this.emit(AutoReconnectingPeerEvent.Error, error);
        };
        this.onDataConnection = (dataConnection) => tslib_1.__awaiter(this, void 0, void 0, function* () {
            const id = dataConnection.peer;
            dataConnection.on("data", (message) => this.emit(AutoReconnectingPeerEvent.Message, id, message));
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
        });
        this.waitForDataConnection = (dataConnection) => tslib_1.__awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
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
        });
        this.close = () => {
            onClose_1.closeEventEmitter.off("close", this.close);
            this.peers = {};
            this.peer.destroy();
            this.emit(AutoReconnectingPeerEvent.Close);
            return this;
        };
        this.peer = peer;
        if (options &&
            typeof options.reconnectTimeoutMS === "number" &&
            options.reconnectTimeoutMS >= 0) {
            this.reconnectTimeoutMS = options.reconnectTimeoutMS;
        }
        this.peer.on("error", this.onError);
        this.peer.on("connection", this.waitForDataConnection);
        this.emit(AutoReconnectingPeerEvent.Open);
        onClose_1.closeEventEmitter.once("close", this.close);
    }
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
    static create(peer, options = {}) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            return new AutoReconnectingPeer(yield AutoReconnectingPeer.waitForPeer(peer), options);
        });
    }
    open() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            yield AutoReconnectingPeer.waitForPeer(this.peer);
            return this;
        });
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
        var _a;
        (_a = this.getPeer(id)) === null || _a === void 0 ? void 0 : _a.close();
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
        var _a;
        (_a = this.getPeer(to)) === null || _a === void 0 ? void 0 : _a.send(data);
        return this;
    }
    broadcast(message, exclude = []) {
        for (const dataConnection of this.getPeers().filter((dataConnection) => !exclude.includes(dataConnection.peer))) {
            dataConnection.send(message);
        }
        return this;
    }
}
exports.AutoReconnectingPeer = AutoReconnectingPeer;
