import { EventEmitter } from "events";

// tslint:disable-next-line: interface-name
interface CloseEventEmitter {
  on(event: "close", listener: (this: CloseEventEmitter) => void): this;
  once(event: "close", listener: (this: CloseEventEmitter) => void): this;
  off(event: "close", listener: (this: CloseEventEmitter) => void): this;
}

class CloseEventEmitter extends EventEmitter {}

export const closeEventEmitter = new CloseEventEmitter();

if (typeof window === "object") {
  window.addEventListener("beforeunload", () =>
    closeEventEmitter.emit("close")
  );
} else if (typeof process === "object") {
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
