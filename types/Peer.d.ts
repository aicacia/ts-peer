import type PeerJS from "peerjs";
import { AutoReconnectingPeer, IAutoReconnectingPeerOptions } from "./AutoReconnectingPeer";
import type { IMessage } from "./Message";
import { Room } from "./Room";
export declare type IPeerOption = IAutoReconnectingPeerOptions;
export declare class Peer<M extends IMessage = IMessage> extends AutoReconnectingPeer<M> {
    protected rooms: Record<string, Room>;
    static create<M extends IMessage = IMessage>(peer: PeerJS, options?: IAutoReconnectingPeerOptions): Promise<Peer<M>>;
    getRoom<M extends IMessage = IMessage>(roomId: string): Room<M>;
    connectToRoom<M extends IMessage = IMessage>(roomId: string): Promise<Room<M>>;
    disconnectFromRoom<M extends IMessage = IMessage>(roomId: string): this;
}
