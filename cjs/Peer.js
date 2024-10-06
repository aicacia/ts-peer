"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Peer = void 0;
exports.writableStreamFromChannel = writableStreamFromChannel;
exports.readableStreamFromChannel = readableStreamFromChannel;
const uuid_1 = require("uuid");
const eventemitter3_1 = require("eventemitter3");
const defaultMaxChannelMessageSize = 16384;
const DEFAULT_WEBRTC = {
    RTCPeerConnection: typeof RTCPeerConnection === "undefined"
        ? null
        : RTCPeerConnection,
    RTCSessionDescription: typeof RTCSessionDescription === "undefined"
        ? null
        : RTCSessionDescription,
    RTCIceCandidate: typeof RTCIceCandidate === "undefined"
        ? null
        : RTCIceCandidate,
};
class Peer extends eventemitter3_1.EventEmitter {
    constructor(options) {
        super();
        this.initiator = false;
        this.maxChannelMessageSize = defaultMaxChannelMessageSize;
        this.sdpTransform = sdpTransform;
        this.config = { iceServers: [] };
        this.pendingCandidates = [];
        this.webrtc = DEFAULT_WEBRTC;
        this.id = options.id || (0, uuid_1.v4)();
        this.channelName = options.channelName || (0, uuid_1.v4)();
        if (options.channelConfig) {
            this.channelConfig = options.channelConfig;
        }
        if (options.sdpTransform) {
            this.sdpTransform = options.sdpTransform;
        }
        if (options.config) {
            this.config = options.config;
        }
        if (options.offerConfig) {
            this.offerConfig = options.offerConfig;
        }
        if (options.answerConfig) {
            this.answerConfig = options.answerConfig;
        }
        if (options.maxChannelMessageSize && options.maxChannelMessageSize > 0) {
            this.maxChannelMessageSize = options.maxChannelMessageSize;
        }
        if (options.webrtc) {
            this.webrtc = options.webrtc;
        }
    }
    getId() {
        return this.id;
    }
    getConnection() {
        return this.connection;
    }
    getChannel() {
        return this.channel;
    }
    isReady() {
        return this.channel && this.channel.readyState === "open";
    }
    isClosed() {
        return !this.connection || this.connection.connectionState !== "connected";
    }
    ready() {
        if (this.isReady()) {
            return Promise.resolve();
        }
        return this.waitOnce("connect");
    }
    data() {
        return this.waitOnce("data");
    }
    closed() {
        return this.waitOnce("close");
    }
    isInitiator() {
        return this.initiator;
    }
    init() {
        this.initiator = true;
        return this.createPeer();
    }
    close() {
        return this.internalClose(true);
    }
    send(chunk) {
        if (!this.channel) {
            throw new Error("Channel not initialized");
        }
        this.channel.send(chunk);
        return this;
    }
    write(chunk) {
        if (!this.channel) {
            throw new Error("Channel not initialized");
        }
        return write(this.channel, chunk, this.maxChannelMessageSize);
    }
    writableStream() {
        if (!this.channel) {
            throw new Error("Channel not initialized");
        }
        return writableStreamFromChannel(this.channel, this.maxChannelMessageSize);
    }
    readableStream() {
        if (!this.channel) {
            throw new Error("Channel not initialized");
        }
        return readableStreamFromChannel(this.channel);
    }
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    async signal(message) {
        var _a, _b;
        if (!this.connection) {
            await this.createPeer();
        }
        console.debug(`${this.id}: received signal message=${message.type}`);
        switch (message.type) {
            case "renegotiate": {
                return this.negotiate();
            }
            case "transceiverRequest": {
                if (!this.initiator) {
                    throw new Error("Invalid signal state");
                }
                const transceiverRequest = message.transceiverRequest;
                if (!transceiverRequest) {
                    throw new Error("Invalid signal message");
                }
                await this.addTransceiverFromKind(transceiverRequest.kind, transceiverRequest.init);
                return this;
            }
            case "candidate": {
                if (!this.connection) {
                    throw new Error("Connection not initialized");
                }
                const candidateJSON = message.candidate;
                if (!candidateJSON) {
                    throw new Error("Invalid signal message");
                }
                const candidate = new this.webrtc.RTCIceCandidate(candidateJSON);
                if (this.connection.remoteDescription == null) {
                    this.pendingCandidates.push(candidate);
                }
                else {
                    await this.connection.addIceCandidate(candidate);
                }
                return this;
            }
            case "answer":
            case "offer":
            case "pranswer":
            case "rollback": {
                if (!this.connection) {
                    throw new Error("Connection not initialized");
                }
                const sdp = message.sdp;
                if (!sdp) {
                    throw new Error("Invalid signal message");
                }
                const sessionDescription = new this.webrtc.RTCSessionDescription({
                    type: message.type,
                    sdp,
                });
                await this.connection.setRemoteDescription(sessionDescription);
                for (const candidate of this.pendingCandidates) {
                    await this.connection.addIceCandidate(candidate);
                }
                this.pendingCandidates.length = 0;
                if (((_b = (_a = this.connection) === null || _a === void 0 ? void 0 : _a.remoteDescription) === null || _b === void 0 ? void 0 : _b.type) === "offer") {
                    await this.createAnswer();
                }
                this.emit("negotiated");
                console.debug(`${this.id}: set remote sdp`);
                return this;
            }
            default: {
                console.debug(`${this.id}: invalid signal type: ${message}`);
                throw new Error("Invalid signal message type");
            }
        }
    }
    waitOnce(event) {
        return new Promise((resolve) => {
            this.once(event, (...args) => {
                switch (args.length) {
                    case 0:
                        resolve(undefined);
                        break;
                    case 1:
                        resolve(args[0]);
                        break;
                    default:
                        resolve(args);
                        break;
                }
            });
        });
    }
    addTransceiverFromKind(kind, init) {
        if (!this.connection) {
            throw new Error("Connection not initialized");
        }
        if (this.initiator) {
            const transceiver = this.connection.addTransceiver(kind, init);
            this.emit("transceiver", transceiver);
            return transceiver;
        }
        this.internalSignal({
            type: "transceiverRequest",
            transceiverRequest: {
                kind,
                init,
            },
        });
        return null;
    }
    addTrack(track) {
        if (!this.connection) {
            throw new Error("Connection not initialized");
        }
        const sender = this.connection.addTrack(track);
        return sender;
    }
    removeTrack(sender) {
        if (!this.connection) {
            throw new Error("Connection not initialized");
        }
        this.connection.removeTrack(sender);
        return this;
    }
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    internalSignal(message) {
        this.emit("signal", message);
        return this;
    }
    async negotiate() {
        if (this.initiator) {
            await this.createOffer();
        }
        else {
            this.internalSignal({ type: "renegotiate", renegotiate: true });
        }
        return this;
    }
    async createOffer() {
        if (!this.connection) {
            throw new Error("Connection not initialized");
        }
        const offer = await this.connection.createOffer(this.offerConfig);
        offer.sdp = this.sdpTransform(offer.sdp);
        await this.connection.setLocalDescription(offer);
        this.internalSignal({ type: offer.type, sdp: offer.sdp });
        return this;
    }
    async createAnswer() {
        if (!this.connection) {
            throw new Error("Connection not initialized");
        }
        const answer = await this.connection.createAnswer(this.answerConfig);
        answer.sdp = this.sdpTransform(answer.sdp);
        await this.connection.setLocalDescription(answer);
        this.internalSignal({ type: answer.type, sdp: answer.sdp });
        return this;
    }
    createPeer() {
        this.internalClose(false);
        this.connection = new this.webrtc.RTCPeerConnection(this.config);
        this.connection.addEventListener("negotiationneeded", this.onNegotiationNeeded.bind(this));
        this.connection.addEventListener("iceconnectionstatechange", this.onICEConnectionStateChange.bind(this));
        this.connection.addEventListener("icegatheringstatechange", this.onICEGatheringStateChange.bind(this));
        this.connection.addEventListener("connectionstatechange", this.onConnectionStateChange.bind(this));
        this.connection.addEventListener("icecandidate", this.onICECandidate.bind(this));
        this.connection.addEventListener("signalingstatechange", this.onSignalingStateChange.bind(this));
        this.connection.addEventListener("track", this.onTrackRemote.bind(this));
        if (this.initiator) {
            const channel = this.connection.createDataChannel(this.channelName, this.channelConfig);
            channel.addEventListener("open", this.onDataChannelOpen.bind(this));
            channel.addEventListener("message", this.onDataChannelMessage.bind(this));
            channel.addEventListener("error", this.onDataChannelError.bind(this));
            this.channel = channel;
        }
        else {
            this.connection.addEventListener("datachannel", this.onDataChannel.bind(this));
        }
        return this;
    }
    internalClose(triggerCallbacks = true) {
        if (this.channel) {
            this.channel.close();
            this.channel = undefined;
        }
        if (this.connection) {
            this.connection.close();
            this.connection = undefined;
        }
        if (triggerCallbacks) {
            this.emit("close");
        }
        return this;
    }
    onConnectionStateChange() {
        if (!this.connection) {
            return;
        }
        console.debug(`${this.id}: connection state ${this.connection.connectionState}`);
        switch (this.connection.connectionState) {
            case "failed":
            case "disconnected":
            case "closed":
                this.internalClose(true);
                break;
        }
    }
    onNegotiationNeeded() {
        if (!this.connection) {
            return;
        }
        return this.negotiate();
    }
    onICEConnectionStateChange() {
        if (!this.connection) {
            return;
        }
        console.debug(`${this.id}: ice connection state ${this.connection.iceConnectionState}`);
    }
    onICEGatheringStateChange() {
        if (!this.connection) {
            return;
        }
        console.debug(`${this.id}: ice gathering state ${this.connection.iceGatheringState}`);
    }
    onSignalingStateChange() {
        if (!this.connection) {
            return;
        }
        console.debug(`${this.id}: signaling state ${this.connection.signalingState}`);
    }
    onICECandidate(event) {
        if (event.candidate) {
            this.internalSignal({
                type: "candidate",
                candidate: event.candidate,
            });
        }
    }
    onTrackRemote(event) {
        this.emit("track", event);
    }
    onDataChannel(event) {
        const channel = event.channel;
        this.channel = channel;
        this.channel.onopen = this.onDataChannelOpen.bind(this);
        this.channel.onmessage = this.onDataChannelMessage.bind(this);
        this.channel.onerror = this.onDataChannelError.bind(this);
    }
    onDataChannelOpen() {
        console.debug(`${this.id}: data channel open`);
        this.emit("connect");
    }
    onDataChannelMessage(event) {
        this.emit("data", event.data);
    }
    onDataChannelError(event) {
        this.emit("error", new Error("DataChannel error", { cause: event }));
    }
}
exports.Peer = Peer;
function sdpTransform(sdp) {
    return sdp;
}
function asap() {
    return new Promise((resolve) => resolve());
}
function waitMS(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function write(channel, chunk, maxChannelMessageSize) {
    if (typeof chunk === "string") {
        if (chunk.length < maxChannelMessageSize) {
            channel.send(chunk);
        }
        else {
            let offset = 0;
            while (offset < chunk.length) {
                const length = Math.min(maxChannelMessageSize, chunk.length - offset);
                channel.send(chunk.substring(offset, offset + length));
                offset += length;
            }
        }
    }
    else if (chunk instanceof Blob) {
        if (chunk.size < maxChannelMessageSize) {
            channel.send(chunk);
        }
        else {
            let offset = 0;
            while (offset < chunk.size) {
                const length = Math.min(maxChannelMessageSize, chunk.size - offset);
                channel.send(chunk.slice(offset, offset + length));
                offset += length;
            }
        }
    }
    else {
        let buffer;
        if (chunk instanceof ArrayBuffer) {
            buffer = chunk;
        }
        else {
            buffer = chunk.buffer;
        }
        if (buffer.byteLength < maxChannelMessageSize) {
            channel.send(buffer);
        }
        else {
            let offset = 0;
            while (offset < buffer.byteLength) {
                const length = Math.min(maxChannelMessageSize, buffer.byteLength - offset);
                channel.send(buffer.slice(offset, offset + length));
                offset += length;
            }
        }
    }
}
function writableStreamFromChannel(channel, maxChannelMessageSize) {
    return new WritableStream({
        write(chunk) {
            write(channel, chunk, maxChannelMessageSize);
        },
    });
}
function readableStreamFromChannel(channel) {
    let closed = false;
    let closedController = false;
    const queue = [];
    const pullQueue = [];
    function pull() {
        return new Promise((resolve, reject) => pullQueue.push([resolve, reject]));
    }
    function onMessage(event) {
        if (pullQueue.length) {
            // biome-ignore lint/style/noNonNullAssertion: checked above
            const [resolve, _reject] = pullQueue.shift();
            resolve(event.data);
        }
        else {
            queue.push(event.data);
        }
    }
    channel.addEventListener("message", onMessage);
    const onClose = () => {
        if (closed) {
            return;
        }
        channel.removeEventListener("message", onMessage);
        channel.removeEventListener("close", onClose);
        closed = true;
        for (const [_resolve, reject] of pullQueue) {
            reject(new Error("Stream closed"));
        }
        pullQueue.length = 0;
        queue.length = 0;
    };
    channel.addEventListener("close", onClose);
    return new ReadableStream({
        async pull(controller) {
            if (closed) {
                if (!closedController) {
                    closedController = true;
                    controller.close();
                }
                return;
            }
            if (queue.length) {
                controller.enqueue(queue.shift());
            }
            else {
                controller.enqueue(await pull());
            }
        },
        cancel: onClose,
    });
}
