import { EventEmitter } from "eventemitter3";
import type { IMessage } from "./Message";
import { isMessageOfType } from "./Message";
import { AutoReconnectingPeerEvent } from "./AutoReconnectingPeer";
import Automerge, { BinaryChange, BinaryDocument } from "automerge";
import type { ChangeFn, FreezeObject } from "automerge";
import type { Room } from "./Room";

export type IStateMessageInit = IMessage<
  StateType.Init,
  { name: string; raw: number[] }
>;
export type IStateMessageGet = IMessage<StateType.Get, { name: string }>;
export type IStateMessageUpdate = IMessage<
  StateType.Changes,
  { name: string; changes: number[][] }
>;
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
  private name: string;
  private state: FreezeObject<T> = undefined as any;
  private room: Room;
  private opened = false;
  private initted = false;
  private changeFns: ChangeFn<T>[] = [];
  private changes: BinaryChange[] = [];

  constructor(name: string, room: Room, initialState: T | Promise<T>) {
    super();
    this.name = name;
    this.room = room;

    if (room.isOpen()) {
      this.onOpen(initialState);
    } else {
      this.room.on(AutoReconnectingPeerEvent.Open, () =>
        this.onOpen(initialState)
      );
    }
  }

  private onOpen = async (initialState: T | Promise<T>) => {
    this.state = Automerge.from(await initialState);

    if (!this.opened) {
      this.opened = true;
      this.initted = false;
      this.room.on(AutoReconnectingPeerEvent.Message, this.onData);
      this.room.on(AutoReconnectingPeerEvent.Close, this.onClose);

      if (this.room.isServer()) {
        this.room.broadcast(StateType.Init, {
          name: this.name,
          raw: toJSON(Automerge.save(this.state)),
        });
      } else {
        this.room.broadcast(StateType.Get, { name: this.name });
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
    if (
      isMessageOfType<IStateMessageUpdate>(data, StateType.Changes) &&
      data.payload.name === this.name
    ) {
      if (this.initted) {
        const [state] = Automerge.applyChanges(
          this.state,
          this.changes.concat(data.payload.changes.map(toBinaryChange))
        );
        this.changes.length = 0;
        this.state = state;
        this.emit("update", state);
      } else {
        this.changes.push(...data.payload.changes.map(toBinaryChange));
      }
    } else if (
      isMessageOfType<IStateMessageInit>(data, StateType.Init) &&
      data.payload.name === this.name
    ) {
      const initialState = Automerge.load<T>(
        toBinaryDocument(data.payload.raw)
      );
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
        this.room.broadcast(StateType.Changes, { name: this.name, changes });
      }
    } else if (
      this.room.isServer() &&
      from !== this.room.getPeer().getId() &&
      isMessageOfType<IStateMessageGet>(data, StateType.Get) &&
      data.payload.name === this.name
    ) {
      this.room.send(from, StateType.Init, {
        name: this.name,
        raw: toJSON(Automerge.save(this.state)),
      });
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
        this.room.broadcast(StateType.Changes, { name: this.name, changes });
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
