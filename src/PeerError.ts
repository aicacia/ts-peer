export interface PeerError extends Error {
  type:
    | "browser-incompatible"
    | "disconnected"
    | "invalid-id"
    | "invalid-key"
    | "network"
    | "peer-unvailable"
    | "ssl-unavailable"
    | "server-error"
    | "socket-error"
    | "socket-closed"
    | "unavailable-id"
    | "webrtc";
}
