"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutoReconnectingPeer = exports.AutoReconnectingPeerEvent = void 0;
const tslib_1 = require("tslib");
const events_1 = require("events");
const Message_1 = require("./Message");
const core_1 = require("@aicacia/core");
const onClose_1 = require("./onClose");
var AutoReconnectingPeerEvent;
(function (AutoReconnectingPeerEvent) {
    AutoReconnectingPeerEvent["Open"] = "open";
    AutoReconnectingPeerEvent["Close"] = "close";
    AutoReconnectingPeerEvent["Error"] = "error";
    AutoReconnectingPeerEvent["ConnectionError"] = "connection-error";
    AutoReconnectingPeerEvent["Connection"] = "connection";
    AutoReconnectingPeerEvent["Disconnection"] = "disconnection";
    AutoReconnectingPeerEvent["Message"] = "message";
    AutoReconnectingPeerEvent["InvalidMessage"] = "invalid-message";
})(AutoReconnectingPeerEvent = exports.AutoReconnectingPeerEvent || (exports.AutoReconnectingPeerEvent = {}));
class AutoReconnectingPeer extends events_1.EventEmitter {
    constructor(peer, options = {}) {
        super();
        this.peers = {};
        this.reconnectTimeoutMS = 60000;
        this.onError = (error) => {
            this.emit(AutoReconnectingPeerEvent.Error, error);
        };
        this.onDataConnection = (dataConnection) => {
            const id = dataConnection.peer;
            dataConnection.on("data", (data) => {
                if (Message_1.isMessage(data)) {
                    this.onMessage(data);
                }
                else {
                    this.emit(AutoReconnectingPeerEvent.InvalidMessage, data, id);
                }
            });
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
        this.onMessage = (message) => {
            this.emit(AutoReconnectingPeerEvent.Message, message);
        };
        this.close = () => {
            onClose_1.closeEventEmitter.off("close", this.close);
            this.peers = {};
            this.peer.destroy();
            this.emit(AutoReconnectingPeerEvent.Close);
            return this;
        };
        this.peer = peer;
        if (options.reconnectTimeoutMS) {
            this.reconnectTimeoutMS = options.reconnectTimeoutMS;
        }
        this.peer.on("error", this.onError);
        this.peer.on("connection", this.onDataConnection);
        this.emit(AutoReconnectingPeerEvent.Open);
        onClose_1.closeEventEmitter.once("close", this.close);
    }
    static connectToPeerJS(peer) {
        if (peer.open) {
            return peer;
        }
        else {
            return new Promise((resolve, reject) => {
                const onOpen = () => {
                    peer.off("open", onOpen);
                    peer.off("error", onError);
                    resolve(peer);
                };
                const onError = (error) => {
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
    static create(peer, options = {}) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            return new AutoReconnectingPeer(yield AutoReconnectingPeer.connectToPeerJS(peer), options);
        });
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
    connect(id) {
        const dataConnection = this.peers[id];
        if (dataConnection) {
            return Promise.resolve(dataConnection);
        }
        else {
            const dataConnection = this.peer.connect(id);
            return new Promise((resolve, reject) => {
                const onOpen = () => {
                    dataConnection.off("open", onOpen);
                    dataConnection.off("error", onError);
                    this.onDataConnection(dataConnection);
                    resolve(dataConnection);
                };
                const onError = (error) => {
                    dataConnection.off("error", onError);
                    reject(error);
                };
                if (dataConnection.open) {
                    this.onDataConnection(dataConnection);
                    resolve(dataConnection);
                }
                else {
                    dataConnection.on("open", onOpen);
                    dataConnection.on("error", onError);
                }
            });
        }
    }
    disconnect(id) {
        this.getPeer(id).ifSome((peer) => peer.close());
        return this;
    }
    getPeer(id) {
        return core_1.Option.from(this.peers[id]);
    }
    getPeerIds() {
        return Object.keys(this.peers);
    }
    getPeers() {
        return Object.values(this.peers);
    }
    sendMessage(to, message) {
        this.getPeer(to).ifSome((peer) => peer.send(message));
        return this;
    }
    send(to, type, payload) {
        return this.sendMessage(to, Message_1.createMessage(this.getId(), type, payload));
    }
    broadcastMessage(message, exclude = []) {
        for (const dataConnection of this.getPeers()) {
            if (exclude.indexOf(dataConnection.peer) === -1) {
                dataConnection.send(message);
            }
        }
        return this;
    }
    broadcast(type, payload, exclude = []) {
        return this.broadcastMessage(Message_1.createMessage(this.getId(), type, payload), exclude);
    }
}
exports.AutoReconnectingPeer = AutoReconnectingPeer;
