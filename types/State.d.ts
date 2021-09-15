import { EventEmitter } from "eventemitter3";
import type { IMessage } from "./Message";
import type { ChangeFn, FreezeObject } from "automerge";
import type { Room } from "./Room";
export declare type IStateMessageInit = IMessage<StateType.Init, number[]>;
export declare type IStateMessageGet = IMessage<StateType.Get, undefined>;
export declare type IStateMessageUpdate = IMessage<StateType.Changes, number[][]>;
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
    private state;
    private room;
    private opened;
    private initted;
    private changeFns;
    private changes;
    constructor(room: Room, initialState: T);
    private onOpen;
    private onClose;
    private onData;
    change(changeFn: ChangeFn<T>): this;
}
