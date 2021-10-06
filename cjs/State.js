"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.State = exports.StateType = void 0;
const tslib_1 = require("tslib");
const eventemitter3_1 = require("eventemitter3");
const Message_1 = require("./Message");
const AutoReconnectingPeer_1 = require("./AutoReconnectingPeer");
const automerge_1 = tslib_1.__importDefault(require("automerge"));
var StateType;
(function (StateType) {
    StateType["Init"] = "init";
    StateType["Get"] = "get";
    StateType["Changes"] = "changes";
})(StateType = exports.StateType || (exports.StateType = {}));
class State extends eventemitter3_1.EventEmitter {
    constructor(name, room, initialState) {
        super();
        this.state = undefined;
        this.opened = false;
        this.initted = false;
        this.changeFns = [];
        this.changes = [];
        this.onOpen = (initialState) => tslib_1.__awaiter(this, void 0, void 0, function* () {
            this.state = automerge_1.default.from(yield initialState);
            if (!this.opened) {
                this.opened = true;
                this.initted = false;
                this.room.on(AutoReconnectingPeer_1.AutoReconnectingPeerEvent.Message, this.onData);
                this.room.on(AutoReconnectingPeer_1.AutoReconnectingPeerEvent.Close, this.onClose);
                if (this.room.isServer()) {
                    this.room.broadcast(StateType.Init, {
                        name: this.name,
                        raw: toJSON(automerge_1.default.save(this.state)),
                    });
                }
                else {
                    this.room.broadcast(StateType.Get, { name: this.name });
                }
            }
        });
        this.onClose = () => {
            if (this.opened) {
                this.opened = false;
                this.room.off(AutoReconnectingPeer_1.AutoReconnectingPeerEvent.Message, this.onData);
                this.room.off(AutoReconnectingPeer_1.AutoReconnectingPeerEvent.Close, this.onClose);
            }
        };
        this.onData = (from, data) => {
            if (Message_1.isMessageOfType(data, StateType.Changes) &&
                data.payload.name === this.name) {
                if (this.initted) {
                    const [state] = automerge_1.default.applyChanges(this.state, this.changes.concat(data.payload.changes.map(toBinaryChange)));
                    this.changes.length = 0;
                    this.state = state;
                    this.emit("update", state);
                }
                else {
                    this.changes.push(...data.payload.changes.map(toBinaryChange));
                }
            }
            else if (Message_1.isMessageOfType(data, StateType.Init) &&
                data.payload.name === this.name) {
                const initialState = automerge_1.default.load(toBinaryDocument(data.payload.raw));
                let state = initialState;
                if (this.changeFns.length) {
                    state = [...this.changeFns].reduce((state, changeFn) => automerge_1.default.change(state, changeFn), state);
                    this.changeFns.length = 0;
                }
                this.initted = true;
                this.state = state;
                this.emit("update", state);
                const changes = automerge_1.default.getChanges(initialState, state).map(toJSON);
                if (changes.length) {
                    this.room.broadcast(StateType.Changes, { name: this.name, changes });
                }
            }
            else if (this.room.isServer() &&
                from !== this.room.getPeer().getId() &&
                Message_1.isMessageOfType(data, StateType.Get) &&
                data.payload.name === this.name) {
                this.room.send(from, StateType.Init, {
                    name: this.name,
                    raw: toJSON(automerge_1.default.save(this.state)),
                });
            }
        };
        this.name = name;
        this.room = room;
        if (room.isOpen()) {
            this.onOpen(initialState);
        }
        else {
            this.room.on(AutoReconnectingPeer_1.AutoReconnectingPeerEvent.Open, () => this.onOpen(initialState));
        }
    }
    get() {
        return this.state;
    }
    change(changeFn) {
        if (this.initted) {
            const initialState = this.state, state = automerge_1.default.change(initialState, changeFn), changes = automerge_1.default.getChanges(initialState, state).map(toJSON);
            this.state = state;
            if (changes.length) {
                this.room.broadcast(StateType.Changes, { name: this.name, changes });
            }
        }
        else {
            this.changeFns.push(changeFn);
        }
        return this;
    }
}
exports.State = State;
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
