import type PeerJS from "peerjs";
import {
  AutoReconnectingPeer,
  IAutoReconnectingPeerOptions,
} from "./AutoReconnectingPeer";
import type { IMessage } from "./Message";
import { Room } from "./Room";

export type IPeerOption = IAutoReconnectingPeerOptions;

export class Peer<
  M extends IMessage = IMessage
> extends AutoReconnectingPeer<M> {
  protected rooms: Record<string, Room> = {};

  static async create<M extends IMessage = IMessage>(
    peer: PeerJS,
    options: IAutoReconnectingPeerOptions = {}
  ) {
    return new Peer<M>(await AutoReconnectingPeer.waitForPeer(peer), options);
  }

  getRoom<M extends IMessage = IMessage>(roomId: string) {
    const room: Room<M> = this.rooms[roomId] as any;

    if (room) {
      return room;
    } else {
      const room = new Room<M>(this as any, roomId);
      this.rooms[roomId] = room as any;
      return room;
    }
  }

  async connectToRoom<M extends IMessage = IMessage>(roomId: string) {
    const room = this.getRoom<M>(roomId);

    if (room.isOpen()) {
      return room;
    } else {
      return room.connect();
    }
  }

  disconnectFromRoom<M extends IMessage = IMessage>(roomId: string) {
    const room = this.getRoom<M>(roomId);
    if (room) {
      room.close();
      delete this.rooms[roomId];
    }
    return this;
  }
}
