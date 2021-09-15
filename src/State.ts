import { EventEmitter } from "eventemitter3";
import type { IMessage } from "./Message";
import { isMessageOfType } from "./Message";
import { AutoReconnectingPeerEvent } from "./AutoReconnectingPeer";
import Automerge, { BinaryChange, BinaryDocument } from "automerge";
import type { ChangeFn, FreezeObject } from "automerge";
import type { Room } from "./Room";

export type IStateMessageInit = IMessage<StateType.Init, number[]>;
export type IStateMessageGet = IMessage<StateType.Get, undefined>;
export type IStateMessageUpdate = IMessage<StateType.Changes, number[][]>;
export type IStateMessage =
  | IStateMessageInit
  | IStateMessageGet
  | IStateMessageUpdate;

export enum StateType {
  Init = "init",
  Get = "get",
  Changes = "changes",
}

export interface StateEvents<T> {
  update: (this: State<T>, state: FreezeObject<T>) => void;
}

export class State<T> extends EventEmitter<StateEvents<T>> {
  private state: FreezeObject<T>;
  private room: Room;
  private opened = false;
  private initted = false;
  private changeFns: ChangeFn<T>[] = [];
  private changes: BinaryChange[] = [];

  constructor(room: Room, initialState: T) {
    super();
    this.room = room;
    this.state = Automerge.from(initialState);

    if (room.isOpen()) {
      this.onOpen();
    } else {
      this.room.on(AutoReconnectingPeerEvent.Open, this.onOpen);
    }
  }

  private onOpen = () => {
    if (!this.opened) {
      this.opened = true;
      this.initted = false;
      this.room.on(AutoReconnectingPeerEvent.Message, this.onData);
      this.room.on(AutoReconnectingPeerEvent.Close, this.onClose);

      if (this.room.isServer()) {
        this.room.broadcast(StateType.Init, toJSON(Automerge.save(this.state)));
      } else {
        this.room.broadcast(StateType.Get, undefined);
      }
    }
  };

  private onClose = () => {
    if (this.opened) {
      this.opened = false;
      this.room.off(AutoReconnectingPeerEvent.Message, this.onData);
      this.room.off(AutoReconnectingPeerEvent.Close, this.onClose);
    }
  };

  private onData = (from: string, data: unknown) => {
    if (isMessageOfType<IStateMessageUpdate>(data, StateType.Changes)) {
      if (this.initted) {
        const [state] = Automerge.applyChanges(
          this.state,
          this.changes.concat(data.payload.map(toBinaryChange))
        );
        this.changes.length = 0;
        this.state = state;
        this.emit("update", state);
      } else {
        this.changes.push(...data.payload.map(toBinaryChange));
      }
    } else if (isMessageOfType<IStateMessageInit>(data, StateType.Init)) {
      const initialState = Automerge.load<T>(toBinaryDocument(data.payload));
      let state = initialState;
      if (this.changeFns.length) {
        state = [...this.changeFns].reduce<FreezeObject<T>>(
          (state, changeFn) => Automerge.change(state, changeFn),
          state
        );
        this.changeFns.length = 0;
      }
      this.initted = true;
      this.state = state;
      this.emit("update", state);

      const changes = Automerge.getChanges(initialState, state).map(toJSON);
      if (changes.length) {
        this.room.broadcast(StateType.Changes, changes);
      }
    } else if (
      this.room.isServer() &&
      from !== this.room.getPeer().getId() &&
      isMessageOfType<IStateMessageGet>(data, StateType.Get)
    ) {
      this.room.send(from, StateType.Init, toJSON(Automerge.save(this.state)));
    }
  };

  get() {
    return this.state;
  }

  change(changeFn: ChangeFn<T>) {
    if (this.initted) {
      const initialState = this.state,
        state = Automerge.change(initialState, changeFn),
        changes = Automerge.getChanges(initialState, state).map(toJSON);

      this.state = state;

      if (changes.length) {
        this.room.broadcast(StateType.Changes, changes);
      }
    } else {
      this.changeFns.push(changeFn);
    }
    return this;
  }
}

function toJSON(binary: Uint8Array): number[] {
  const array = new Array<number>(binary.length);
  for (let i = 0, il = binary.length; i < il; i++) {
    array[i] = binary[i];
  }
  return array;
}

function toBinaryChange(array: number[]): BinaryChange {
  const binarChange = new Uint8Array(array) as BinaryChange;
  binarChange.__binaryChange = true;
  return binarChange;
}

function toBinaryDocument(array: number[]): BinaryDocument {
  const binaryDocument = new Uint8Array(array) as BinaryDocument;
  binaryDocument.__binaryDocument = true;
  return binaryDocument;
}
