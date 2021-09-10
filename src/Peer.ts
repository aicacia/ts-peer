import type PeerJS from "peerjs";
import {
  AutoReconnectingPeer,
  IAutoReconnectingPeerOptions,
} from "./AutoReconnectingPeer";
import type { IMessage } from "./Message";
import { Room } from "./Room";

export type IPeerOption = IAutoReconnectingPeerOptions;

export class Peer<D = any> extends AutoReconnectingPeer<D> {
  protected rooms: Record<string, Room> = {};

  static async create<D = any>(
    peer: PeerJS,
    options: IAutoReconnectingPeerOptions = {}
  ) {
    return new Peer<D>(await AutoReconnectingPeer.waitForPeer(peer), options);
  }

  getRoom<D = any>(roomId: string) {
    const room: Room<D> = this.rooms[roomId] as any;

    if (room) {
      return room;
    } else {
      const room = new Room<D>(this as any, roomId);
      this.rooms[roomId] = room as any;
      return room;
    }
  }

  async connectToRoom<D = any>(roomId: string) {
    const room = this.getRoom<D>(roomId);

    if (room.isOpen()) {
      return room;
    } else {
      return room.connect();
    }
  }

  disconnectFromRoom<D extends IMessage = IMessage>(roomId: string) {
    const room = this.getRoom<D>(roomId);
    if (room) {
      room.close();
      delete this.rooms[roomId];
    }
    return this;
  }
}
