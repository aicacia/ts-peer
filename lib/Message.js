"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isMessage = exports.MessageType = void 0;
var MessageType;
(function (MessageType) {
    MessageType[MessageType["Peers"] = 0] = "Peers";
    MessageType[MessageType["Data"] = 1] = "Data";
})(MessageType = exports.MessageType || (exports.MessageType = {}));
function isMessage(value) {
    return (value != null && typeof value === "object" && typeof value.type === "number");
}
exports.isMessage = isMessage;
