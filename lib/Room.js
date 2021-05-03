"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Room = exports.RoomEvent = exports.createRoomMessage = exports.ROOM_MESSAGE_TYPE = exports.InternalRoomMessageType = void 0;
const tslib_1 = require("tslib");
const events_1 = require("events");
const peerjs_1 = tslib_1.__importDefault(require("peerjs"));
const core_1 = require("@aicacia/core");
const AutoReconnectingPeer_1 = require("./AutoReconnectingPeer");
const Message_1 = require("./Message");
const onClose_1 = require("./onClose");
var InternalRoomMessageType;
(function (InternalRoomMessageType) {
    InternalRoomMessageType["Peers"] = "peers";
    InternalRoomMessageType["PeerConnect"] = "peer-connect";
    InternalRoomMessageType["PeerDisconnect"] = "peer-disconnect";
})(InternalRoomMessageType = exports.InternalRoomMessageType || (exports.InternalRoomMessageType = {}));
exports.ROOM_MESSAGE_TYPE = "internal-room-message";
function createRoomMessage(roomId, type, payload) {
    return Message_1.createMessage(roomId, exports.ROOM_MESSAGE_TYPE, Message_1.createMessage(roomId, type, payload, roomId));
}
exports.createRoomMessage = createRoomMessage;
var RoomEvent;
(function (RoomEvent) {
    RoomEvent["StatusChange"] = "status-change";
})(RoomEvent = exports.RoomEvent || (exports.RoomEvent = {}));
class Room extends events_1.EventEmitter {
    constructor(peer, roomId) {
        super();
        this.server = core_1.none();
        this.client = core_1.none();
        this.peers = new Set();
        this.onDisconnection = (id) => {
            if (this.peers.has(id)) {
                this.disconnect(id);
            }
        };
        this.onMessage = (message) => {
            if (message.room === this.roomId) {
                this.emit(AutoReconnectingPeer_1.AutoReconnectingPeerEvent.Message, message);
            }
        };
        this.onInvalidMessage = (message, from) => {
            if (this.peers.has(from)) {
                this.emit(AutoReconnectingPeer_1.AutoReconnectingPeerEvent.InvalidMessage, message, from);
            }
        };
        this.close = () => {
            onClose_1.closeEventEmitter.off("close", this.close);
            this.server.take().ifSome((server) => {
                server.close();
            });
            this.client.take().ifSome(() => {
                this.peer.disconnect(this.roomId);
            });
            this.peer.off(AutoReconnectingPeer_1.AutoReconnectingPeerEvent.Disconnection, this.onDisconnection);
            this.peer.off(AutoReconnectingPeer_1.AutoReconnectingPeerEvent.Message, this.onMessage);
            this.peer.off(AutoReconnectingPeer_1.AutoReconnectingPeerEvent.InvalidMessage, this.onInvalidMessage);
            this.emit(AutoReconnectingPeer_1.AutoReconnectingPeerEvent.Close);
            return this;
        };
        this.onJoinError = (error) => {
            this.client.clear();
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
        this.onJoinClose = () => {
            this.client.take().ifSome(() => {
                this.serve();
            });
            return this;
        };
        this.onServeError = (error) => {
            this.server.clear();
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
        this.peer = peer;
        this.roomId = roomId;
        onClose_1.closeEventEmitter.once("close", this.close);
    }
    static create(peer, roomId) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const room = new Room(peer, roomId);
            room.peer.on(AutoReconnectingPeer_1.AutoReconnectingPeerEvent.Disconnection, room.onDisconnection);
            room.peer.on(AutoReconnectingPeer_1.AutoReconnectingPeerEvent.Message, room.onMessage);
            room.peer.on(AutoReconnectingPeer_1.AutoReconnectingPeerEvent.InvalidMessage, room.onInvalidMessage);
            yield room.serve();
            room.emit(AutoReconnectingPeer_1.AutoReconnectingPeerEvent.Open);
            return room;
        });
    }
    getRoomId() {
        return this.roomId;
    }
    getPeer() {
        return this.peer;
    }
    sendMessage(to, message) {
        if (this.peers.has(to) && message.room === this.roomId) {
            this.peer.sendMessage(to, message);
        }
        return this;
    }
    send(to, type, payload) {
        return this.sendMessage(to, Message_1.createMessage(this.peer.getId(), type, payload, this.roomId));
    }
    broadcastMessage(message, exclude = []) {
        if (message.room === this.roomId) {
            for (const peerId of this.getPeers()) {
                if (!exclude.includes(peerId)) {
                    this.peer.sendMessage(peerId, message);
                }
            }
        }
        return this;
    }
    broadcast(type, payload, exclude = []) {
        return this.broadcastMessage(Message_1.createMessage(this.peer.getId(), type, payload, this.roomId), exclude);
    }
    getPeers() {
        return this.peers;
    }
    connect(id) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            yield this.peer.connect(id);
            this.peers.add(id);
            this.emit(AutoReconnectingPeer_1.AutoReconnectingPeerEvent.Connection, id);
            return this;
        });
    }
    disconnect(id) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            this.peers.delete(id);
            this.emit(AutoReconnectingPeer_1.AutoReconnectingPeerEvent.Disconnection, id);
            yield this.peer.disconnect(id);
            return this;
        });
    }
    join() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            try {
                const client = yield this.peer.connect(this.roomId);
                client.on("data", (message) => {
                    if (Message_1.isMessage(message) &&
                        message.type === exports.ROOM_MESSAGE_TYPE) {
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
                this.client.replace(client);
                this.emit(RoomEvent.StatusChange, "client");
            }
            catch (error) {
                this.onJoinError(error);
            }
            return this;
        });
    }
    serve() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            try {
                const server = yield AutoReconnectingPeer_1.AutoReconnectingPeer.create(new peerjs_1.default(this.roomId), { reconnectTimeoutMS: this.peer.getReconnectTimeoutMS() });
                server.on(AutoReconnectingPeer_1.AutoReconnectingPeerEvent.Error, this.onServeError);
                server.on(AutoReconnectingPeer_1.AutoReconnectingPeerEvent.Connection, (id) => tslib_1.__awaiter(this, void 0, void 0, function* () {
                    yield this.connect(id);
                    const peers = new Set(this.peers.keys());
                    peers.add(this.peer.getId());
                    peers.delete(id);
                    server.sendMessage(id, createRoomMessage(this.roomId, InternalRoomMessageType.Peers, Array.from(peers)));
                    server.broadcastMessage(createRoomMessage(this.roomId, InternalRoomMessageType.PeerConnect, id), [id]);
                }));
                server.on(AutoReconnectingPeer_1.AutoReconnectingPeerEvent.Disconnection, (id) => tslib_1.__awaiter(this, void 0, void 0, function* () {
                    server.broadcastMessage(createRoomMessage(this.roomId, InternalRoomMessageType.PeerDisconnect, id), [id]);
                    yield this.disconnect(id);
                }));
                this.server.replace(server);
                this.emit(RoomEvent.StatusChange, "server");
            }
            catch (error) {
                this.onServeError(error);
            }
            return this;
        });
    }
}
exports.Room = Room;
