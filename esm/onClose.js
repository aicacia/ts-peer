import { EventEmitter } from "eventemitter3";
class CloseEventEmitter extends EventEmitter {
}
export const closeEventEmitter = new CloseEventEmitter();
if (typeof window === "object") {
    window.addEventListener("beforeunload", () => closeEventEmitter.emit("close"));
}
else if (typeof process === "object") {
    process.once("SIGINT", () => {
        process.exit(130);
    });
    process.once("SIGTERM", () => {
        process.exit(143);
    });
    process.on("exit", () => {
        closeEventEmitter.emit("close");
    });
}
