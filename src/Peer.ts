import PeerJS from "peerjs";
import {
  AutoReconnectingPeer,
  IAutoReconnectingPeerOptions,
} from "./AutoReconnectingPeer";
import { IMessage } from "./Message";
import { Room } from "./Room";

export type IPeerOption = IAutoReconnectingPeerOptions;

export class Peer<
  M extends IMessage = IMessage
> extends AutoReconnectingPeer<M> {
  protected rooms: Record<string, Room> = {};

  static async create<M extends IMessage>(
    peer: PeerJS,
    options: IAutoReconnectingPeerOptions = {}
  ) {
    return new Peer<M>(
      await AutoReconnectingPeer.connectToPeerJS(peer),
      options
    );
  }

  getRoom<M extends IMessage = IMessage>(roomId: string): Room<M> | undefined {
    return this.rooms[roomId] as any;
  }

  async connectToRoom<M extends IMessage = IMessage>(roomId: string) {
    const room = this.getRoom<M>(roomId);

    if (room) {
      return room;
    } else {
      const room = await Room.create<M>(this as any, roomId);
      this.rooms[roomId] = room as any;
      return room;
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
