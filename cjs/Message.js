"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isMessageOfTypes = exports.isMessageOfType = exports.isMessage = exports.createMessage = void 0;
function createMessage(from, type, payload) {
    return {
        type,
        payload,
        from,
    };
}
exports.createMessage = createMessage;
function isMessage(value) {
    return value !== null && typeof value === "object" && "type" in value;
}
exports.isMessage = isMessage;
function isMessageOfType(value, type) {
    return isMessage(value) && value.type === type;
}
exports.isMessageOfType = isMessageOfType;
function isMessageOfTypes(value, types) {
    return isMessage(value) && types.includes(value.type);
}
exports.isMessageOfTypes = isMessageOfTypes;
