import { EventEmitter } from "eventemitter3";
import type { IMessage } from "./Message";
import Automerge from "automerge";
import type { ChangeFn, FreezeObject } from "automerge";
import type { Room } from "./Room";
export declare type IStateMessageInit = IMessage<StateType.Init, {
    name: string;
    raw: number[];
}>;
export declare type IStateMessageGet = IMessage<StateType.Get, {
    name: string;
}>;
export declare type IStateMessageUpdate = IMessage<StateType.Changes, {
    name: string;
    changes: number[][];
}>;
export declare type IStateMessage = IStateMessageInit | IStateMessageGet | IStateMessageUpdate;
export declare enum StateType {
    Init = "init",
    Get = "get",
    Changes = "changes"
}
export interface StateEvents<T> {
    update: (this: State<T>, state: FreezeObject<T>) => void;
}
export declare class State<T> extends EventEmitter<StateEvents<T>> {
    private name;
    private state;
    private room;
    private opened;
    private initted;
    private changeFns;
    private changes;
    constructor(name: string, room: Room, initialState: T | Promise<T>);
    private onOpen;
    private onClose;
    private onData;
    get(): Automerge.FreezeObject<T>;
    change(changeFn: ChangeFn<T>): this;
}
