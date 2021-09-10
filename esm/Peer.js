import { AutoReconnectingPeer, } from "./AutoReconnectingPeer";
import { Room } from "./Room";
export class Peer extends AutoReconnectingPeer {
    rooms = {};
    static async create(peer, options = {}) {
        return new Peer(await AutoReconnectingPeer.waitForPeer(peer), options);
    }
    getRoom(roomId) {
        const room = this.rooms[roomId];
        if (room) {
            return room;
        }
        else {
            const room = new Room(this, roomId);
            this.rooms[roomId] = room;
            return room;
        }
    }
    async connectToRoom(roomId) {
        const room = this.getRoom(roomId);
        if (room.isOpen()) {
            return room;
        }
        else {
            return room.connect();
        }
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
