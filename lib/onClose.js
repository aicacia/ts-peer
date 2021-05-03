"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.closeEventEmitter = void 0;
const events_1 = require("events");
class CloseEventEmitter extends events_1.EventEmitter {
}
exports.closeEventEmitter = new CloseEventEmitter();
if (typeof window === "object") {
    window.addEventListener("beforeunload", () => exports.closeEventEmitter.emit("close"));
}
else if (typeof process === "object") {
    process.once("SIGINT", () => {
        process.exit(130);
    });
    process.once("SIGTERM", () => {
        process.exit(143);
    });
    process.on("exit", () => {
        exports.closeEventEmitter.emit("close");
    });
}
