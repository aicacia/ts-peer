"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isMessage = exports.createMessage = void 0;
function createMessage(from, type, payload, room) {
    return {
        type,
        payload,
        from,
        room,
    };
}
exports.createMessage = createMessage;
function isMessage(value) {
    return value !== null && typeof value === "object" && "type" in value;
}
exports.isMessage = isMessage;
