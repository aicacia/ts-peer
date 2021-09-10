import type PeerJS from "peerjs";
import { AutoReconnectingPeer, IAutoReconnectingPeerOptions } from "./AutoReconnectingPeer";
import type { IMessage } from "./Message";
import { Room } from "./Room";
export declare type IPeerOption = IAutoReconnectingPeerOptions;
export declare class Peer<D = any> extends AutoReconnectingPeer<D> {
    protected rooms: Record<string, Room>;
    static create<D = any>(peer: PeerJS, options?: IAutoReconnectingPeerOptions): Promise<Peer<D>>;
    getRoom<D = any>(roomId: string): Room<D>;
    connectToRoom<D = any>(roomId: string): Promise<Room<D>>;
    disconnectFromRoom<D extends IMessage = IMessage>(roomId: string): this;
}
