import { EventEmitter } from "eventemitter3";
import PeerJS, { DataConnection } from "peerjs";
import { PeerError } from "./PeerError";
import { IMessage } from "./Message";
export declare enum AutoReconnectingPeerEvent {
    Open = "open",
    Close = "close",
    Error = "error",
    ConnectionError = "connection-error",
    Connection = "connection",
    Disconnection = "disconnection",
    Message = "message",
    InvalidMessage = "invalid-message"
}
export interface AutoReconnectingPeer<M extends IMessage = IMessage> {
    on(event: AutoReconnectingPeerEvent.Open, listener: (this: AutoReconnectingPeer<M>) => void): this;
    on(event: AutoReconnectingPeerEvent.Error, listener: (this: AutoReconnectingPeer<M>, error: PeerError) => void): this;
    on(event: AutoReconnectingPeerEvent.ConnectionError, listener: (this: AutoReconnectingPeer<M>, error: PeerError, from: string) => void): this;
    on(event: AutoReconnectingPeerEvent.Connection, listener: (this: AutoReconnectingPeer<M>, id: string) => void): this;
    on(event: AutoReconnectingPeerEvent.Disconnection, listener: (this: AutoReconnectingPeer<M>, id: string) => void): this;
    on(event: AutoReconnectingPeerEvent.InvalidMessage, listener: (this: AutoReconnectingPeer<M>, message: any, from: string) => void): this;
    on(event: AutoReconnectingPeerEvent.Message, listener: (this: AutoReconnectingPeer<M>, message: M) => void): this;
    off(event: AutoReconnectingPeerEvent.Open, listener: (this: AutoReconnectingPeer<M>) => void): this;
    off(event: AutoReconnectingPeerEvent.Error, listener: (this: AutoReconnectingPeer<M>, error: PeerError) => void): this;
    off(event: AutoReconnectingPeerEvent.ConnectionError, listener: (this: AutoReconnectingPeer<M>, error: PeerError, from: string) => void): this;
    off(event: AutoReconnectingPeerEvent.Connection, listener: (this: AutoReconnectingPeer<M>, id: string) => void): this;
    off(event: AutoReconnectingPeerEvent.Disconnection, listener: (this: AutoReconnectingPeer<M>, id: string) => void): this;
    off(event: AutoReconnectingPeerEvent.InvalidMessage, listener: (this: AutoReconnectingPeer<M>, message: any, from: string) => void): this;
    off(event: AutoReconnectingPeerEvent.Message, listener: (this: AutoReconnectingPeer<M>, message: M) => void): this;
}
export interface IAutoReconnectingPeerOptions {
    reconnectTimeoutMS?: number;
}
export declare class AutoReconnectingPeer<M extends IMessage> extends EventEmitter {
    protected peer: PeerJS;
    protected peers: Record<string, DataConnection>;
    protected reconnectTimeoutMS: number;
    constructor(peer: PeerJS, options?: IAutoReconnectingPeerOptions);
    private onError;
    private onDataConnection;
    private onMessage;
    static connectToPeerJS(peer: PeerJS): PeerJS | Promise<PeerJS>;
    static create<M extends IMessage>(peer: PeerJS, options?: IAutoReconnectingPeerOptions): Promise<AutoReconnectingPeer<M>>;
    getId(): string;
    isOpen(): boolean;
    getInternal(): PeerJS;
    getReconnectTimeoutMS(): number;
    connect(id: string): Promise<PeerJS.DataConnection>;
    disconnect(id: string): this;
    getPeer(id: string): DataConnection | undefined;
    getPeerIds(): string[];
    getPeers(): PeerJS.DataConnection[];
    sendMessage(to: string, message: M): this;
    send(to: string, type: M["type"], payload: M["payload"]): this;
    broadcastMessage(message: M, exclude?: string[]): this;
    broadcast(type: M["type"], payload: M["payload"], exclude?: string[]): this;
    close: () => this;
}
