"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Peer = void 0;
const events_1 = require("events");
const Message_1 = require("./Message");
class Peer extends events_1.EventEmitter {
    constructor(peer, options = {}) {
        super();
        this.peers = {};
        this.reconnectTimeoutMS = 60000;
        this.onError = (error) => {
            this.emit("error", error);
        };
        this.onDataConnection = (dataConnection) => {
            const id = dataConnection.peer;
            dataConnection.on("data", (data) => {
                if (Message_1.isMessage(data)) {
                    this.onMessage(data);
                }
                else {
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
            dataConnection.on("error", (error) => {
                onClose();
                this.emit("connection-error", error, id);
            });
            this.peers[id] = dataConnection;
            this.emit("connection", id);
        };
        this.onMessage = (message) => {
            if (message.type === Message_1.MessageType.Peers) {
                for (const peerId of message.payload) {
                    if (peerId !== this.getId()) {
                        this.connect(peerId);
                    }
                }
            }
            else {
                this.emit("message", message.payload, message.from);
            }
        };
        this.peer = peer;
        if (options.reconnectTimeoutMS) {
            this.reconnectTimeoutMS = options.reconnectTimeoutMS;
        }
        this.peer.on("error", this.onError);
        this.peer.on("connection", (dataConnection) => {
            if (dataConnection.open) {
                this.onDataConnection(dataConnection);
            }
            else {
                const onOpen = () => {
                    dataConnection.send({
                        type: Message_1.MessageType.Peers,
                        payload: this.getPeerIds(),
                    });
                    dataConnection.off("open", onOpen);
                    this.onDataConnection(dataConnection);
                };
                dataConnection.on("open", onOpen);
            }
        });
    }
    static create(peer) {
        return new Promise((resolve, reject) => {
            const onOpen = () => {
                peer.off("open", onOpen);
                peer.off("error", onError);
                resolve(new Peer(peer));
            };
            const onError = (error) => {
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
                dataConnection.on("open", onOpen);
                dataConnection.on("error", onError);
            });
        }
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
    send(to, payload) {
        const dataConnection = this.getPeer(to);
        if (dataConnection) {
            dataConnection.send({
                type: Message_1.MessageType.Data,
                from: this.getId(),
                payload,
            });
        }
        return this;
    }
    broadcast(payload) {
        const message = { type: Message_1.MessageType.Data, from: this.getId(), payload };
        for (const dataConnection of this.getPeers()) {
            dataConnection.send(message);
        }
        return this;
    }
}
exports.Peer = Peer;
