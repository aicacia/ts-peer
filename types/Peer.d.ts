import { EventEmitter, type EventEmitter as EventEmitterTypes } from "eventemitter3";
export interface PeerOptions {
    id?: string;
    trickle?: boolean;
    sdpTransform?: (sdp?: string) => string;
    channelName?: string;
    channelConfig?: RTCDataChannelInit;
    config?: RTCConfiguration;
    offerConfig?: RTCOfferOptions;
    answerConfig?: RTCAnswerOptions;
    maxChannelMessageSize?: number;
    webrtc?: PeerWebRTC;
}
export interface PeerWebRTC {
    RTCPeerConnection: typeof RTCPeerConnection;
    RTCSessionDescription: typeof RTCSessionDescription;
    RTCIceCandidate: typeof RTCIceCandidate;
}
interface PeerEvents {
    signal(message: never): void;
    connect(): void;
    data(event: string | Blob | ArrayBuffer | Uint8Array): void;
    error(error: Error): void;
    close(): void;
    transceiver(transceiver: RTCRtpTransceiver): void;
    track(track: RTCTrackEvent): void;
}
type PeerEventNames = EventEmitterTypes.EventNames<PeerEvents>;
type EventEmitterReturnType<T> = T extends [] ? void : T extends [infer R] ? R : T;
export declare class Peer extends EventEmitter<PeerEvents> {
    private id;
    private initiator;
    private channelName;
    private channelConfig?;
    private channel?;
    private maxChannelMessageSize;
    private trickle;
    private sdpTransform;
    private config;
    private connection?;
    private offerConfig?;
    private answerConfig?;
    private pendingCandidates;
    private webrtc;
    constructor(options: PeerOptions);
    getId(): string;
    getConnection(): RTCPeerConnection | undefined;
    getChannel(): RTCDataChannel | undefined;
    isReady(): boolean | undefined;
    isClosed(): boolean;
    ready(): Promise<void>;
    isInitiator(): boolean;
    init(): Promise<this>;
    close(): this;
    send(chunk: string | Blob | ArrayBuffer | ArrayBufferView): this;
    write(chunk: string | Blob | ArrayBuffer | ArrayBufferView): void;
    writableStream(): WritableStream<string | Blob | ArrayBuffer | ArrayBufferView>;
    readableStream(): ReadableStream<string | Blob | ArrayBuffer>;
    signal(message: any): Promise<this>;
    waitOnce<K extends PeerEventNames>(event: K): Promise<EventEmitterReturnType<EventEmitter.ArgumentMap<PeerEvents>[K]>>;
    addTransceiverFromKind(kind: string, init?: RTCRtpTransceiverInit): RTCRtpTransceiver | null;
    addTrack(track: MediaStreamTrack): RTCRtpSender;
    removeTrack(sender: RTCRtpSender): this;
    private internalSignal;
    private runningNegotiation;
    private needsNegotiation;
    private negotiate;
    private createOffer;
    private createAnswer;
    private createPeer;
    private internalClose;
    private onConnectionStateChange;
    private onICECandidate;
    private onTrackRemote;
    private onDataChannel;
    private onDataChannelOpen;
    private onDataChannelMessage;
    private onDataChannelError;
}
export declare function writableStreamFromChannel(channel: RTCDataChannel, maxChannelMessageSize: number): WritableStream<string | Blob | ArrayBuffer | ArrayBufferView>;
export declare function readableStreamFromChannel(channel: RTCDataChannel): ReadableStream<string | Blob | ArrayBuffer>;
export {};
