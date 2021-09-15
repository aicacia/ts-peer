import { EventEmitter } from "eventemitter3";
import type PeerJS from "peerjs";
import type { DataConnection } from "peerjs";
import type { PeerError } from "./PeerError";
import type { IMessage } from "./Message";
export declare enum AutoReconnectingPeerEvent {
    Open = "open",
    Close = "close",
    Error = "error",
    ConnectionError = "connection-error",
    Connection = "connection",
    Disconnection = "disconnection",
    Message = "data"
}
export interface AutoReconnectingPeerEvents<M extends IMessage = IMessage> {
    [AutoReconnectingPeerEvent.Open]: (this: AutoReconnectingPeer<M>) => void;
    [AutoReconnectingPeerEvent.Close]: (this: AutoReconnectingPeer<M>) => void;
    [AutoReconnectingPeerEvent.Error]: (this: AutoReconnectingPeer<M>, error: PeerError) => void;
    [AutoReconnectingPeerEvent.ConnectionError]: (this: AutoReconnectingPeer<M>, error: PeerError, from: string) => void;
    [AutoReconnectingPeerEvent.Connection]: (this: AutoReconnectingPeer<M>, id: string) => void;
    [AutoReconnectingPeerEvent.Disconnection]: (this: AutoReconnectingPeer<M>, id: string) => void;
    [AutoReconnectingPeerEvent.Message]: (this: AutoReconnectingPeer<M>, from: string, message: M) => void;
}
export interface IAutoReconnectingPeerOptions {
    reconnectTimeoutMS?: number;
}
export declare class AutoReconnectingPeer<M extends IMessage = IMessage> extends EventEmitter<AutoReconnectingPeerEvents<M>> {
    protected peer: PeerJS;
    protected peers: Record<string, DataConnection>;
    protected reconnectTimeoutMS: number;
    constructor(peer: PeerJS, options?: IAutoReconnectingPeerOptions);
    private onError;
    private onDataConnection;
    static waitForPeer(peer: PeerJS): Promise<PeerJS>;
    static create<M extends IMessage = IMessage>(peer: PeerJS, options?: IAutoReconnectingPeerOptions): Promise<AutoReconnectingPeer<M>>;
    open(): Promise<this>;
    getId(): string;
    isOpen(): boolean;
    getInternal(): PeerJS;
    getReconnectTimeoutMS(): number;
    waitForDataConnection: (dataConnection: DataConnection) => Promise<PeerJS.DataConnection>;
    connect(id: string): Promise<PeerJS.DataConnection>;
    disconnect(id: string): this;
    isConnected(id: string): any;
    getPeer(id: string): DataConnection | undefined;
    getPeerIds(): string[];
    getPeers(): PeerJS.DataConnection[];
    send(to: string, data: M): this;
    broadcast(message: M, exclude?: string[]): this;
    close: () => this;
}
