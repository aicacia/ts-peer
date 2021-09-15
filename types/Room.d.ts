import { EventEmitter } from "eventemitter3";
import type { DataConnection } from "peerjs";
import type { PeerError } from "./PeerError";
import { AutoReconnectingPeerEvent, AutoReconnectingPeer } from "./AutoReconnectingPeer";
import { IMessage } from "./Message";
export declare enum InternalRoomMessageType {
    Message = "message",
    Boardcast = "boardcast",
    Peers = "peers",
    PeerConnect = "peer-connect",
    PeerDisconnect = "peer-disconnect"
}
export declare type IInternalRoomMessageMessage<M extends IMessage = IMessage> = IMessage<InternalRoomMessageType.Message, {
    to: string;
    message: M;
}>;
export declare type IInternalRoomMessageBoardcast<M extends IMessage = IMessage> = IMessage<InternalRoomMessageType.Boardcast, M>;
export declare type IInternalRoomMessagePeers = IMessage<InternalRoomMessageType.Peers, string[]>;
export declare type IInternalRoomMessageConnection = IMessage<InternalRoomMessageType.PeerConnect, string>;
export declare type IInternalRoomMessageDisconnect = IMessage<InternalRoomMessageType.PeerDisconnect, string>;
export declare type IInternalRoomMessage<M extends IMessage = IMessage> = IInternalRoomMessageMessage<M> | IInternalRoomMessageBoardcast<M> | IInternalRoomMessagePeers | IInternalRoomMessageConnection | IInternalRoomMessageDisconnect;
export declare const ROOM_MESSAGE_TYPE = "internal-room-message";
export declare type IRoomMessage<M extends IMessage = IMessage> = IMessage<typeof ROOM_MESSAGE_TYPE, IInternalRoomMessage<M>>;
export declare function createRoomMessage<M extends IMessage = IMessage>(from: string, roomId: string, type: IInternalRoomMessage<M>["type"], payload: IInternalRoomMessage<M>["payload"]): IRoomMessage<M>;
export declare enum RoomEvent {
    StatusChange = "status-change"
}
export interface IRoomOptions {
    reconnectTimeoutMS?: number;
    syncMS?: number;
}
export interface RoomEvents<M extends IMessage = IMessage> {
    [RoomEvent.StatusChange]: (this: Room<M>, status: "server" | "client") => void;
    [AutoReconnectingPeerEvent.Open]: (this: Room<M>) => void;
    [AutoReconnectingPeerEvent.Close]: (this: Room<M>) => void;
    [AutoReconnectingPeerEvent.Error]: (this: Room<M>, error: PeerError) => void;
    [AutoReconnectingPeerEvent.Connection]: (this: Room<M>, id: string) => void;
    [AutoReconnectingPeerEvent.Disconnection]: (this: Room<M>, id: string) => void;
    [AutoReconnectingPeerEvent.Message]: (this: Room<M>, from: string, message: M) => void;
}
export declare class Room<M extends IMessage = IMessage> extends EventEmitter<RoomEvents<M>> {
    protected roomId: string;
    protected peer: AutoReconnectingPeer<M>;
    protected server: AutoReconnectingPeer<IRoomMessage> | undefined;
    protected client: DataConnection | undefined;
    protected peers: Record<string, number>;
    protected reconnectTimeoutMS: number;
    protected syncMS: number;
    protected closed: boolean;
    constructor(peer: AutoReconnectingPeer<M>, roomId: string, options?: IRoomOptions);
    isOpen(): boolean | undefined;
    isServer(): boolean;
    isClient(): boolean;
    connect(): Promise<this>;
    getRoomId(): string;
    getPeer(): AutoReconnectingPeer<M>;
    close: () => this;
    getPeers(): string[];
    send(to: string, type: M["type"], payload: M["payload"]): this;
    broadcast(type: M["type"], payload: M["payload"]): this;
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
