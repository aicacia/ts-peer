"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Peer = void 0;
const tslib_1 = require("tslib");
const AutoReconnectingPeer_1 = require("./AutoReconnectingPeer");
const Room_1 = require("./Room");
class Peer extends AutoReconnectingPeer_1.AutoReconnectingPeer {
    constructor() {
        super(...arguments);
        this.rooms = {};
    }
    static create(peer, options = {}) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            return new Peer(yield AutoReconnectingPeer_1.AutoReconnectingPeer.connectToPeerJS(peer), options);
        });
    }
    getRoom(roomId) {
        return this.rooms[roomId];
    }
    connectToRoom(roomId) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const room = this.getRoom(roomId);
            if (room) {
                return room;
            }
            else {
                const room = yield Room_1.Room.create(this, roomId);
                this.rooms[roomId] = room;
                return room;
            }
        });
    }
    disconnectFromRoom(roomId) {
        const room = this.getRoom(roomId);
        if (room) {
            room.close();
            delete this.rooms[roomId];
        }
        return this;
    }
}
exports.Peer = Peer;
