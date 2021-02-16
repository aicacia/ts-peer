/// <reference types="node" />
import { Option } from "@aicacia/core";
import { EventEmitter } from "events";
import PeerJS, { PeerJSOption } from "peerjs";
import { PeerError } from "./PeerError";
import { IMessage } from "./Message";
export interface Peer<T = any> {
    on(event: "open", listener: (this: Peer) => void): this;
    on(event: "error", listener: (this: Peer, error: PeerError) => void): this;
    on(event: "connection", listener: (this: Peer, id: string) => void): this;
    on(event: "disconnection", listener: (this: Peer, id: string) => void): this;
    on(event: "message", listener: (this: Peer, message: T, from: string) => void): this;
    off(event: "open", listener: (this: Peer) => void): this;
    off(event: "error", listener: (this: Peer, error: PeerError) => void): this;
    off(event: "connection", listener: (this: Peer, id: string) => void): this;
    off(event: "disconnection", listener: (this: Peer, id: string) => void): this;
    off(event: "message", listener: (this: Peer, message: T, from: string) => void): this;
}
export declare class Peer<T = any> extends EventEmitter {
    private peer;
    private peers;
    constructor(peer: PeerJS);
    private onError;
    private onDataConnection;
    onMessage: (message: IMessage<T>) => void;
    static create<T = any>(id?: string, options?: PeerJSOption): Promise<Peer<T>>;
    getId(): string;
    connect(id: string): Promise<PeerJS.DataConnection>;
    getPeer(id: string): Option<PeerJS.DataConnection>;
    getPeerIds(): string[];
    getPeers(): PeerJS.DataConnection[];
    send(to: string, payload: T): this;
    broadcast(payload: T): this;
}
