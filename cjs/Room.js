"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Room = exports.RoomEvent = exports.createRoomMessage = exports.ROOM_MESSAGE_TYPE = exports.InternalRoomMessageType = void 0;
const tslib_1 = require("tslib");
const eventemitter3_1 = require("eventemitter3");
const peerjs_1 = tslib_1.__importDefault(require("peerjs"));
const AutoReconnectingPeer_1 = require("./AutoReconnectingPeer");
const Message_1 = require("./Message");
const onClose_1 = require("./onClose");
var InternalRoomMessageType;
(function (InternalRoomMessageType) {
    InternalRoomMessageType["Data"] = "data";
    InternalRoomMessageType["Peers"] = "peers";
    InternalRoomMessageType["PeerConnect"] = "peer-connect";
    InternalRoomMessageType["PeerDisconnect"] = "peer-disconnect";
})(InternalRoomMessageType = exports.InternalRoomMessageType || (exports.InternalRoomMessageType = {}));
exports.ROOM_MESSAGE_TYPE = "internal-room-message";
function createRoomMessage(from, roomId, type, payload) {
    return Message_1.createMessage(roomId, exports.ROOM_MESSAGE_TYPE, Message_1.createMessage(from, type, payload));
}
exports.createRoomMessage = createRoomMessage;
var RoomEvent;
(function (RoomEvent) {
    RoomEvent["StatusChange"] = "status-change";
})(RoomEvent = exports.RoomEvent || (exports.RoomEvent = {}));
class Room extends eventemitter3_1.EventEmitter {
    constructor(peer, roomId, options = {}) {
        super();
        this.peers = {};
        this.reconnectTimeoutMS = 100;
        this.syncMS = 1000;
        this.closed = false;
        this.close = () => {
            this.closed = true;
            onClose_1.closeEventEmitter.off("close", this.close);
            this.onServeClose();
            this.onJoinClose();
            this.peer.off(AutoReconnectingPeer_1.AutoReconnectingPeerEvent.Data, this.onPeerData);
            this.emit(AutoReconnectingPeer_1.AutoReconnectingPeerEvent.Close);
            return this;
        };
        this.onPeerData = (from, message) => tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (Message_1.isMessageOfType(message, exports.ROOM_MESSAGE_TYPE)) {
                const roomMessage = message.payload;
                if (Message_1.isMessageOfType(roomMessage, InternalRoomMessageType.Data)) {
                    this.peer.emit(AutoReconnectingPeer_1.AutoReconnectingPeerEvent.Data, roomMessage.from, roomMessage.payload);
                    this.emit(AutoReconnectingPeer_1.AutoReconnectingPeerEvent.Data, roomMessage.from, roomMessage.payload);
                }
                else if (Message_1.isMessageOfType(roomMessage, InternalRoomMessageType.Peers)) {
                    for (const peerId of roomMessage.payload) {
                        this.internalConnect(peerId);
                    }
                }
                else if (Message_1.isMessageOfType(roomMessage, InternalRoomMessageType.PeerConnect)) {
                    this.internalConnect(roomMessage.payload);
                }
                else if (Message_1.isMessageOfType(roomMessage, InternalRoomMessageType.PeerDisconnect)) {
                    this.internalDisconnect(roomMessage.payload);
                }
            }
        });
        this.onJoinError = (error) => {
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
            this.emit(AutoReconnectingPeer_1.AutoReconnectingPeerEvent.Error, error);
        };
        this.onJoinClose = () => {
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
        this.onServeError = (error) => {
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
            this.emit(AutoReconnectingPeer_1.AutoReconnectingPeerEvent.Error, error);
        };
        this.onServeClose = () => {
            var _a;
            (_a = this.server) === null || _a === void 0 ? void 0 : _a.close();
            this.server = undefined;
            for (const peerId of this.getPeers()) {
                this.internalDisconnect(peerId);
            }
            this.peers = {};
            return this;
        };
        this.serve = () => tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (!this.server) {
                try {
                    const peer = new peerjs_1.default(this.roomId, this.peer.getInternal().options);
                    const server = new AutoReconnectingPeer_1.AutoReconnectingPeer(peer, {
                        reconnectTimeoutMS: this.peer.getReconnectTimeoutMS(),
                    });
                    server.on(AutoReconnectingPeer_1.AutoReconnectingPeerEvent.Connection, (peerId) => tslib_1.__awaiter(this, void 0, void 0, function* () {
                        this.internalConnect(peerId);
                        server.send(peerId, createRoomMessage(this.peer.getId(), this.roomId, InternalRoomMessageType.Peers, server.getPeerIds()));
                        server.broadcast(createRoomMessage(this.peer.getId(), this.roomId, InternalRoomMessageType.PeerConnect, peerId), [peerId]);
                    }));
                    server.on(AutoReconnectingPeer_1.AutoReconnectingPeerEvent.Disconnection, (peerId) => {
                        server.broadcast(createRoomMessage(this.peer.getId(), this.roomId, InternalRoomMessageType.PeerDisconnect, peerId));
                        this.internalDisconnect(peerId);
                    });
                    server.on(AutoReconnectingPeer_1.AutoReconnectingPeerEvent.Data, (from, message) => {
                        if (Message_1.isMessageOfType(message, exports.ROOM_MESSAGE_TYPE)) {
                            const roomMessage = message.payload;
                            if (Message_1.isMessageOfType(roomMessage, InternalRoomMessageType.Data)) {
                                server.broadcast(message);
                            }
                        }
                    });
                    server.on(AutoReconnectingPeer_1.AutoReconnectingPeerEvent.Error, this.onServeError);
                    yield AutoReconnectingPeer_1.AutoReconnectingPeer.waitForPeer(peer);
                    this.server = server;
                    yield this.join(false);
                    this.emit(RoomEvent.StatusChange, "server");
                }
                catch (error) {
                    this.onServeError(error);
                }
            }
            return this;
        });
        this.roomId = roomId;
        this.peer = peer;
        this.peer.on(AutoReconnectingPeer_1.AutoReconnectingPeerEvent.Data, this.onPeerData);
        if (options) {
            if (typeof options.reconnectTimeoutMS === "number" &&
                options.reconnectTimeoutMS >= 0) {
                this.reconnectTimeoutMS = options.reconnectTimeoutMS;
            }
            if (typeof options.syncMS === "number" && options.syncMS >= 0) {
                this.syncMS = options.syncMS;
            }
        }
        onClose_1.closeEventEmitter.once("close", this.close);
    }
    isOpen() {
        var _a;
        return (_a = this.peer.getPeer(this.roomId)) === null || _a === void 0 ? void 0 : _a.open;
    }
    connect() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            this.closed = false;
            return this.serve();
        });
    }
    getRoomId() {
        return this.roomId;
    }
    getPeer() {
        return this.peer;
    }
    getPeers() {
        return Object.keys(this.peers);
    }
    send(message) {
        var _a;
        (_a = this.client) === null || _a === void 0 ? void 0 : _a.send(createRoomMessage(this.peer.getId(), this.roomId, InternalRoomMessageType.Data, message));
        return this;
    }
    internalConnect(peerId) {
        this.peers[peerId] = Date.now();
        this.emit(AutoReconnectingPeer_1.AutoReconnectingPeerEvent.Connection, peerId);
    }
    internalDisconnect(peerId) {
        this.emit(AutoReconnectingPeer_1.AutoReconnectingPeerEvent.Disconnection, peerId);
        delete this.peers[peerId];
    }
    join(emit = true) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (!this.client) {
                try {
                    const client = this.peer.getInternal().connect(this.roomId);
                    client.on("error", this.onJoinError);
                    client.on("close", this.onJoinClose);
                    yield this.peer.waitForDataConnection(client);
                    this.client = client;
                    if (emit) {
                        this.emit(RoomEvent.StatusChange, "client");
                    }
                }
                catch (error) {
                    this.onJoinError(error);
                }
            }
            return this;
        });
    }
}
exports.Room = Room;
