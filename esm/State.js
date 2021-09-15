import { EventEmitter } from "eventemitter3";
import { isMessageOfType } from "./Message";
import { AutoReconnectingPeerEvent } from "./AutoReconnectingPeer";
import Automerge from "automerge";
export var StateType;
(function (StateType) {
    StateType["Init"] = "init";
    StateType["Get"] = "get";
    StateType["Changes"] = "changes";
})(StateType || (StateType = {}));
export class State extends EventEmitter {
    state;
    room;
    opened = false;
    initted = false;
    changeFns = [];
    changes = [];
    constructor(room, initialState) {
        super();
        this.room = room;
        this.state = Automerge.from(initialState);
        if (room.isOpen()) {
            this.onOpen();
        }
        else {
            this.room.on(AutoReconnectingPeerEvent.Open, this.onOpen);
        }
    }
    onOpen = () => {
        if (!this.opened) {
            this.opened = true;
            this.initted = false;
            this.room.on(AutoReconnectingPeerEvent.Message, this.onData);
            this.room.on(AutoReconnectingPeerEvent.Close, this.onClose);
            if (this.room.isServer()) {
                this.room.broadcast(StateType.Init, toJSON(Automerge.save(this.state)));
            }
            else {
                this.room.broadcast(StateType.Get, undefined);
            }
        }
    };
    onClose = () => {
        if (this.opened) {
            this.opened = false;
            this.room.off(AutoReconnectingPeerEvent.Message, this.onData);
            this.room.off(AutoReconnectingPeerEvent.Close, this.onClose);
        }
    };
    onData = (from, data) => {
        if (isMessageOfType(data, StateType.Changes)) {
            if (this.initted) {
                const [state] = Automerge.applyChanges(this.state, this.changes.concat(data.payload.map(toBinaryChange)));
                this.changes.length = 0;
                this.state = state;
                this.emit("update", state);
            }
            else {
                this.changes.push(...data.payload.map(toBinaryChange));
            }
        }
        else if (isMessageOfType(data, StateType.Init)) {
            const initialState = Automerge.load(toBinaryDocument(data.payload));
            let state = initialState;
            if (this.changeFns.length) {
                state = [...this.changeFns].reduce(Automerge.change, state);
                this.changeFns.length = 0;
            }
            this.initted = true;
            this.state = state;
            this.emit("update", state);
            const changes = Automerge.getChanges(initialState, state).map(toJSON);
            if (changes.length) {
                this.room.broadcast(StateType.Changes, changes);
            }
        }
        else if (this.room.isServer() &&
            from !== this.room.getPeer().getId() &&
            isMessageOfType(data, StateType.Get)) {
            this.room.send(from, StateType.Init, toJSON(Automerge.save(this.state)));
        }
    };
    change(changeFn) {
        if (this.initted) {
            const initialState = this.state, state = Automerge.change(initialState, changeFn), changes = Automerge.getChanges(initialState, state).map(toJSON);
            this.state = state;
            if (changes.length) {
                this.room.broadcast(StateType.Changes, changes);
            }
        }
        else {
            this.changeFns.push(changeFn);
        }
        return this;
    }
}
function toJSON(binary) {
    const array = new Array(binary.length);
    for (let i = 0, il = binary.length; i < il; i++) {
        array[i] = binary[i];
    }
    return array;
}
function toBinaryChange(array) {
    const binarChange = new Uint8Array(array);
    binarChange.__binaryChange = true;
    return binarChange;
}
function toBinaryDocument(array) {
    const binaryDocument = new Uint8Array(array);
    binaryDocument.__binaryDocument = true;
    return binaryDocument;
}
