import { EventEmitter } from "eventemitter3";
import type PeerJS from "peerjs";
import type { DataConnection } from "peerjs";
import type { PeerError } from "./PeerError";
export declare enum AutoReconnectingPeerEvent {
    Open = "open",
    Close = "close",
    Error = "error",
    ConnectionError = "connection-error",
    Connection = "connection",
    Disconnection = "disconnection",
    Data = "data"
}
export interface AutoReconnectingPeerEvents<D = any> {
    [AutoReconnectingPeerEvent.Open]: (this: AutoReconnectingPeer<D>) => void;
    [AutoReconnectingPeerEvent.Close]: (this: AutoReconnectingPeer<D>) => void;
    [AutoReconnectingPeerEvent.Error]: (this: AutoReconnectingPeer<D>, error: PeerError) => void;
    [AutoReconnectingPeerEvent.ConnectionError]: (this: AutoReconnectingPeer<D>, error: PeerError, from: string) => void;
    [AutoReconnectingPeerEvent.Connection]: (this: AutoReconnectingPeer<D>, id: string) => void;
    [AutoReconnectingPeerEvent.Disconnection]: (this: AutoReconnectingPeer<D>, id: string) => void;
    [AutoReconnectingPeerEvent.Data]: (this: AutoReconnectingPeer<D>, from: string, message: D) => void;
}
export interface IAutoReconnectingPeerOptions {
    reconnectTimeoutMS?: number;
}
export declare class AutoReconnectingPeer<D = any> extends EventEmitter<AutoReconnectingPeerEvents<D>> {
    protected peer: PeerJS;
    protected peers: Record<string, DataConnection>;
    protected reconnectTimeoutMS: number;
    constructor(peer: PeerJS, options?: IAutoReconnectingPeerOptions);
    private onError;
    private onDataConnection;
    static waitForPeer(peer: PeerJS): Promise<PeerJS>;
    static create<D = any>(peer: PeerJS, options?: IAutoReconnectingPeerOptions): Promise<AutoReconnectingPeer<D>>;
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
    send(to: string, data: D): this;
    broadcast(message: D, exclude?: string[]): this;
    close: () => this;
}
