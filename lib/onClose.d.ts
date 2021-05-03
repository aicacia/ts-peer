/// <reference types="node" />
import { EventEmitter } from "events";
interface CloseEventEmitter {
    on(event: "close", listener: (this: CloseEventEmitter) => void): this;
    once(event: "close", listener: (this: CloseEventEmitter) => void): this;
    off(event: "close", listener: (this: CloseEventEmitter) => void): this;
}
declare class CloseEventEmitter extends EventEmitter {
}
export declare const closeEventEmitter: CloseEventEmitter;
export {};
