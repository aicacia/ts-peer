/// <reference types="node" />
import { EventEmitter } from "events";
import PeerJS, { DataConnection } from "peerjs";
import { PeerError } from "./PeerError";
export interface Peer<T = any> {
    on(event: "open", listener: (this: Peer) => void): this;
    on(event: "error", listener: (this: Peer, error: PeerError) => void): this;
    on(event: "connection-error", listener: (this: Peer, error: PeerError, from: string) => void): this;
    on(event: "connection", listener: (this: Peer, id: string) => void): this;
    on(event: "disconnection", listener: (this: Peer, id: string) => void): this;
    on(event: "message", listener: (this: Peer, message: T, from: string) => void): this;
    on(event: "invalid-message", listener: (this: Peer, message: any, from: string) => void): this;
    off(event: "open", listener: (this: Peer) => void): this;
    off(event: "error", listener: (this: Peer, error: PeerError) => void): this;
    off(event: "connection-error", listener: (this: Peer, error: PeerError, from: string) => void): this;
    off(event: "connection", listener: (this: Peer, id: string) => void): this;
    off(event: "disconnection", listener: (this: Peer, id: string) => void): this;
    off(event: "message", listener: (this: Peer, message: T, from: string) => void): this;
}
export interface IPeerOptions {
    reconnectTimeoutMS?: number;
}
export declare class Peer<T = any> extends EventEmitter {
    private peer;
    private peers;
    private reconnectTimeoutMS;
    constructor(peer: PeerJS, options?: IPeerOptions);
    private onError;
    private onDataConnection;
    private onMessage;
    static create<T = any>(peer: PeerJS): Promise<Peer<T>>;
    getId(): string;
    connect(id: string): Promise<PeerJS.DataConnection>;
    getPeer(id: string): DataConnection | undefined;
    getPeerIds(): string[];
    getPeers(): PeerJS.DataConnection[];
    send(to: string, payload: T): this;
    broadcast(payload: T): this;
}
