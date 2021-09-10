import { EventEmitter } from "eventemitter3";
import type { DataConnection } from "peerjs";
import type { PeerError } from "./PeerError";
import { AutoReconnectingPeerEvent, AutoReconnectingPeer } from "./AutoReconnectingPeer";
import { IMessage } from "./Message";
export declare enum InternalRoomMessageType {
    Data = "data",
    Peers = "peers",
    PeerConnect = "peer-connect",
    PeerDisconnect = "peer-disconnect"
}
export declare type IRoomDataMessage<D = any> = IMessage<InternalRoomMessageType.Data, D>;
export declare type IRoomPeersMessage = IMessage<InternalRoomMessageType.Peers, string[]>;
export declare type IRoomPeerConnectMessage = IMessage<InternalRoomMessageType.PeerConnect, string>;
export declare type IRoomPeerDisconnectMessage = IMessage<InternalRoomMessageType.PeerDisconnect, string>;
export declare type IInternalRoomMessage<D = any> = IRoomDataMessage<D> | IRoomPeersMessage | IRoomPeerConnectMessage | IRoomPeerDisconnectMessage;
export declare const ROOM_MESSAGE_TYPE = "internal-room-message";
export declare type IRoomMessage<D = any> = IMessage<typeof ROOM_MESSAGE_TYPE, IInternalRoomMessage<D>>;
export declare function createRoomMessage<D>(from: string, roomId: string, type: IInternalRoomMessage["type"], payload: IInternalRoomMessage["payload"]): IRoomMessage<D>;
export declare enum RoomEvent {
    StatusChange = "status-change"
}
export interface IRoomOptions {
    reconnectTimeoutMS?: number;
    syncMS?: number;
}
export interface RoomEvents<D = any> {
    [RoomEvent.StatusChange]: (this: Room<D>, status: "server" | "client") => void;
    [AutoReconnectingPeerEvent.Close]: (this: Room<D>) => void;
    [AutoReconnectingPeerEvent.Error]: (this: Room<D>, error: PeerError) => void;
    [AutoReconnectingPeerEvent.Connection]: (this: Room<D>, id: string) => void;
    [AutoReconnectingPeerEvent.Disconnection]: (this: Room<D>, id: string) => void;
    [AutoReconnectingPeerEvent.Data]: (this: Room<D>, from: string, message: D) => void;
}
export declare class Room<D = any> extends EventEmitter<RoomEvents<D>> {
    protected roomId: string;
    protected peer: AutoReconnectingPeer<D>;
    protected server: AutoReconnectingPeer<IRoomMessage> | undefined;
    protected client: DataConnection | undefined;
    protected peers: Record<string, number>;
    protected reconnectTimeoutMS: number;
    protected syncMS: number;
    protected closed: boolean;
    constructor(peer: AutoReconnectingPeer<D>, roomId: string, options?: IRoomOptions);
    isOpen(): boolean | undefined;
    connect(): Promise<this>;
    getRoomId(): string;
    getPeer(): AutoReconnectingPeer<D>;
    close: () => this;
    getPeers(): string[];
    send(message: D): this;
    private onPeerData;
    private internalConnect;
    private internalDisconnect;
    private onJoinError;
    private onJoinClose;
    private join;
    private onServeError;
    private onServeClose;
    private serve;
}
