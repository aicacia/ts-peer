import { EventEmitter } from "eventemitter3";
import { AutoReconnectingPeerEvent, AutoReconnectingPeer, } from "./AutoReconnectingPeer";
import { createMessage, isMessageOfType } from "./Message";
import { closeEventEmitter } from "./onClose";
export var InternalRoomMessageType;
(function (InternalRoomMessageType) {
    InternalRoomMessageType["Message"] = "message";
    InternalRoomMessageType["Boardcast"] = "boardcast";
    InternalRoomMessageType["Peers"] = "peers";
    InternalRoomMessageType["PeerConnect"] = "peer-connect";
    InternalRoomMessageType["PeerDisconnect"] = "peer-disconnect";
})(InternalRoomMessageType || (InternalRoomMessageType = {}));
export const ROOM_MESSAGE_TYPE = "internal-room-message";
export function createRoomMessage(from, roomId, type, payload) {
    return createMessage(roomId, ROOM_MESSAGE_TYPE, createMessage(from, type, payload));
}
export var RoomEvent;
(function (RoomEvent) {
    RoomEvent["StatusChange"] = "status-change";
})(RoomEvent || (RoomEvent = {}));
export class Room extends EventEmitter {
    roomId;
    peer;
    server;
    client;
    peers = {};
    reconnectTimeoutMS = 100;
    syncMS = 1000;
    closed = false;
    constructor(peer, roomId, options = {}) {
        super();
        this.roomId = roomId;
        this.peer = peer;
        this.peer.on(AutoReconnectingPeerEvent.Message, this.onPeerData);
        if (options) {
            if (typeof options.reconnectTimeoutMS === "number" &&
                options.reconnectTimeoutMS >= 0) {
                this.reconnectTimeoutMS = options.reconnectTimeoutMS;
            }
            if (typeof options.syncMS === "number" && options.syncMS >= 0) {
                this.syncMS = options.syncMS;
            }
        }
        closeEventEmitter.once("close", this.close);
    }
    isOpen() {
        return this.peer.getPeer(this.roomId)?.open;
    }
    isServer() {
        return !!this.server;
    }
    isClient() {
        return !this.isServer();
    }
    async connect() {
        if (this.closed) {
            this.closed = false;
        }
        return this.serve();
    }
    getRoomId() {
        return this.roomId;
    }
    getPeer() {
        return this.peer;
    }
    close = () => {
        this.closed = true;
        closeEventEmitter.off("close", this.close);
        this.onServeClose();
        this.onJoinClose();
        this.peer.off(AutoReconnectingPeerEvent.Message, this.onPeerData);
        this.emit(AutoReconnectingPeerEvent.Close);
        return this;
    };
    getPeers() {
        return Object.keys(this.peers);
    }
    send(to, type, payload) {
        this.client?.send(createRoomMessage(this.peer.getId(), this.roomId, InternalRoomMessageType.Message, { to, message: { from: this.peer.getId(), type, payload } }));
        return this;
    }
    broadcast(type, payload) {
        this.client?.send(createRoomMessage(this.peer.getId(), this.roomId, InternalRoomMessageType.Boardcast, { from: this.peer.getId(), type, payload }));
        return this;
    }
    onPeerData = (_from, message) => {
        if (isMessageOfType(message, ROOM_MESSAGE_TYPE)) {
            const roomMessage = message.payload;
            if (isMessageOfType(roomMessage, InternalRoomMessageType.Message) &&
                roomMessage.payload.to === this.peer.getId()) {
                this.peer.emit(AutoReconnectingPeerEvent.Message, roomMessage.from, roomMessage.payload.message);
                this.emit(AutoReconnectingPeerEvent.Message, roomMessage.from, roomMessage.payload.message);
            }
            else if (isMessageOfType(roomMessage, InternalRoomMessageType.Boardcast)) {
                this.peer.emit(AutoReconnectingPeerEvent.Message, roomMessage.from, roomMessage.payload);
                this.emit(AutoReconnectingPeerEvent.Message, roomMessage.from, roomMessage.payload);
            }
            else if (isMessageOfType(roomMessage, InternalRoomMessageType.Peers)) {
                for (const peerId of roomMessage.payload) {
                    this.internalConnect(peerId);
                }
            }
            else if (isMessageOfType(roomMessage, InternalRoomMessageType.PeerConnect)) {
                this.internalConnect(roomMessage.payload);
            }
            else if (isMessageOfType(roomMessage, InternalRoomMessageType.PeerDisconnect)) {
                this.internalDisconnect(roomMessage.payload);
            }
        }
    };
    internalConnect(peerId) {
        this.peers[peerId] = Date.now();
        this.emit(AutoReconnectingPeerEvent.Connection, peerId);
    }
    internalDisconnect(peerId) {
        this.emit(AutoReconnectingPeerEvent.Disconnection, peerId);
        delete this.peers[peerId];
    }
    onJoinError = (error) => {
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
        this.emit(AutoReconnectingPeerEvent.Error, error);
    };
    onJoinClose = () => {
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
    async join(emit = true) {
        if (!this.client) {
            try {
                const client = this.peer.getInternal().connect(this.roomId);
                client.on("error", this.onJoinError);
                client.on("close", this.onJoinClose);
                await this.peer.waitForDataConnection(client);
                this.client = client;
                if (emit) {
                    this.emit(RoomEvent.StatusChange, "client");
                    this.emit(AutoReconnectingPeerEvent.Open);
                }
            }
            catch (error) {
                this.onJoinError(error);
            }
        }
        return this;
    }
    onServeError = (error) => {
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
        this.emit(AutoReconnectingPeerEvent.Error, error);
    };
    onServeClose = () => {
        this.server?.close();
        this.server = undefined;
        for (const peerId of this.getPeers()) {
            this.internalDisconnect(peerId);
        }
        this.peers = {};
        return this;
    };
    serve = async () => {
        if (!this.server) {
            try {
                const PeerJSConstructor = Object.getPrototypeOf(this.peer.getInternal()).constructor;
                const peer = new PeerJSConstructor(this.roomId, this.peer.getInternal().options);
                const server = new AutoReconnectingPeer(peer, {
                    reconnectTimeoutMS: this.peer.getReconnectTimeoutMS(),
                });
                server.on(AutoReconnectingPeerEvent.Connection, async (peerId) => {
                    this.internalConnect(peerId);
                    server.send(peerId, createRoomMessage(this.peer.getId(), this.roomId, InternalRoomMessageType.Peers, server.getPeerIds()));
                    server.broadcast(createRoomMessage(this.peer.getId(), this.roomId, InternalRoomMessageType.PeerConnect, peerId), [peerId]);
                });
                server.on(AutoReconnectingPeerEvent.Disconnection, (peerId) => {
                    server.broadcast(createRoomMessage(this.peer.getId(), this.roomId, InternalRoomMessageType.PeerDisconnect, peerId));
                    this.internalDisconnect(peerId);
                });
                server.on(AutoReconnectingPeerEvent.Message, (_from, message) => {
                    if (isMessageOfType(message, ROOM_MESSAGE_TYPE)) {
                        const roomMessage = message.payload;
                        if (isMessageOfType(roomMessage, InternalRoomMessageType.Message)) {
                            server.send(roomMessage.payload.to, message);
                        }
                        else if (isMessageOfType(roomMessage, InternalRoomMessageType.Boardcast)) {
                            server.broadcast(message);
                        }
                    }
                });
                server.on(AutoReconnectingPeerEvent.Error, this.onServeError);
                await AutoReconnectingPeer.waitForPeer(peer);
                this.server = server;
                await this.join(false);
                this.emit(RoomEvent.StatusChange, "server");
                this.emit(AutoReconnectingPeerEvent.Open);
            }
            catch (error) {
                this.onServeError(error);
            }
        }
        return this;
    };
}
