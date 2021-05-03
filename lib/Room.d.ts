/// <reference types="node" />
import { EventEmitter } from "events";
import { DataConnection } from "peerjs";
import { Option } from "@aicacia/core";
import { PeerError } from "./PeerError";
import { AutoReconnectingPeerEvent, AutoReconnectingPeer } from "./AutoReconnectingPeer";
import { IMessage } from "./Message";
export declare enum InternalRoomMessageType {
    Peers = "peers",
    PeerConnect = "peer-connect",
    PeerDisconnect = "peer-disconnect"
}
export declare type IRoomPeersMessage = IMessage<InternalRoomMessageType.Peers, string[]>;
export declare type IRoomPeerConnectMessage = IMessage<InternalRoomMessageType.PeerConnect, string>;
export declare type IRoomPeerDisconnectMessage = IMessage<InternalRoomMessageType.PeerDisconnect, string>;
export declare type IInternalRoomMessage = IRoomPeersMessage | IRoomPeerConnectMessage | IRoomPeerDisconnectMessage;
export declare const ROOM_MESSAGE_TYPE = "internal-room-message";
export declare type IRoomMessage = IMessage<typeof ROOM_MESSAGE_TYPE, IInternalRoomMessage>;
export declare function createRoomMessage(roomId: string, type: IInternalRoomMessage["type"], payload: IInternalRoomMessage["payload"]): IRoomMessage;
export declare enum RoomEvent {
    StatusChange = "status-change"
}
export interface Room<M extends IMessage = IMessage> {
    on(event: RoomEvent.StatusChange, listener: (this: Room<M>, status: "server" | "client") => void): this;
    on(event: AutoReconnectingPeerEvent.Open, listener: (this: Room<M>) => void): this;
    on(event: AutoReconnectingPeerEvent.Error, listener: (this: Room<M>, error: PeerError) => void): this;
    on(event: AutoReconnectingPeerEvent.Connection, listener: (this: Room<M>, id: string) => void): this;
    on(event: AutoReconnectingPeerEvent.Disconnection, listener: (this: Room<M>, id: string) => void): this;
    on(event: AutoReconnectingPeerEvent.InvalidMessage, listener: (this: Room<M>, message: any, from: string) => void): this;
    on(event: AutoReconnectingPeerEvent.Message, listener: (this: Room<M>, message: M) => void): this;
    off(event: RoomEvent.StatusChange, listener: (this: Room<M>, status: "server" | "client") => void): this;
    off(event: AutoReconnectingPeerEvent.Open, listener: (this: Room<M>) => void): this;
    off(event: AutoReconnectingPeerEvent.Error, listener: (this: Room<M>, error: PeerError) => void): this;
    off(event: AutoReconnectingPeerEvent.Connection, listener: (this: Room<M>, id: string) => void): this;
    off(event: AutoReconnectingPeerEvent.Disconnection, listener: (this: Room<M>, id: string) => void): this;
    off(event: AutoReconnectingPeerEvent.InvalidMessage, listener: (this: Room<M>, message: any, from: string) => void): this;
    off(event: AutoReconnectingPeerEvent.Message, listener: (this: Room<M>, message: M) => void): this;
}
export declare class Room<M extends IMessage = IMessage> extends EventEmitter {
    protected roomId: string;
    protected peer: AutoReconnectingPeer<M>;
    protected server: Option<AutoReconnectingPeer<IRoomMessage>>;
    protected client: Option<DataConnection>;
    protected peers: Set<string>;
    constructor(peer: AutoReconnectingPeer<M>, roomId: string);
    static create<M extends IMessage>(peer: AutoReconnectingPeer<M>, roomId: string): Promise<Room<M>>;
    private onDisconnection;
    private onMessage;
    private onInvalidMessage;
    getRoomId(): string;
    getPeer(): AutoReconnectingPeer<M>;
    close: () => this;
    sendMessage(to: string, message: M): this;
    send(to: string, type: M["type"], payload: M["payload"]): this;
    broadcastMessage(message: M, exclude?: string[]): this;
    broadcast(type: M["type"], payload: M["payload"], exclude?: string[]): this;
    getPeers(): Set<string>;
    private connect;
    private disconnect;
    private onJoinError;
    private onJoinClose;
    private join;
    private onServeError;
    private serve;
}
