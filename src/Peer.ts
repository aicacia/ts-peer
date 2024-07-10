import { v4 as uuidv4 } from "uuid";
import {
	EventEmitter,
	type EventEmitter as EventEmitterTypes,
} from "eventemitter3";

const defaultMaxChannelMessageSize = 16384;

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

const DEFAULT_WEBRTC: PeerWebRTC = {
	RTCPeerConnection:
		typeof RTCPeerConnection === "undefined"
			? (null as never)
			: (RTCPeerConnection as never),
	RTCSessionDescription:
		typeof RTCSessionDescription === "undefined"
			? (null as never)
			: (RTCSessionDescription as never),
	RTCIceCandidate:
		typeof RTCIceCandidate === "undefined"
			? (null as never)
			: (RTCIceCandidate as never),
};

interface PeerEvents {
	signal(message: never): void;
	connect(): void;
	data(event: string | Blob | ArrayBuffer | Uint8Array): void;
	error(error: Error): void;
	close(): void;
	transceiver(transceiver: RTCRtpTransceiver): void;
	track(track: RTCTrackEvent): void;
	negotiated(): void;
}

type PeerEventNames = EventEmitterTypes.EventNames<PeerEvents>;
type PeerEventArguments = EventEmitterTypes.ArgumentMap<PeerEvents>;
type EventEmitterReturnType<T> = T extends []
	? // biome-ignore lint/suspicious/noConfusingVoidType: <explanation>
		void
	: T extends [infer R]
		? R
		: T;

export class Peer extends EventEmitter<PeerEvents> {
	private id: string;
	private initiator = false;
	private channelName: string;
	private channelConfig?: RTCDataChannelInit;
	private channel?: RTCDataChannel;
	private maxChannelMessageSize = defaultMaxChannelMessageSize;
	private trickle = true;
	private sdpTransform = sdpTransform;
	private config: RTCConfiguration = { iceServers: [] };
	private connection?: RTCPeerConnection;
	private offerConfig?: RTCOfferOptions;
	private answerConfig?: RTCAnswerOptions;
	private pendingCandidates: RTCIceCandidateInit[] = [];
	private webrtc: PeerWebRTC = DEFAULT_WEBRTC;

	constructor(options: PeerOptions) {
		super();
		this.id = options.id || uuidv4();
		this.channelName = options.channelName || uuidv4();
		if (options.channelConfig) {
			this.channelConfig = options.channelConfig;
		}
		if (options.trickle === false) {
			this.trickle = false;
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

	ready(): Promise<void> {
		if (this.isReady()) {
			return Promise.resolve();
		}
		return this.waitOnce("connect");
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

	send(chunk: string | Blob | ArrayBuffer | ArrayBufferView) {
		if (!this.channel) {
			throw new Error("Channel not initialized");
		}
		this.channel.send(chunk as never);
		return this;
	}

	write(chunk: string | Blob | ArrayBuffer | ArrayBufferView) {
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
	async signal(message: any) {
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
				await this.addTransceiverFromKind(
					transceiverRequest.kind,
					transceiverRequest.init,
				);
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
				} else {
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
				if (this.connection?.remoteDescription?.type === "offer") {
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

	waitOnce<K extends PeerEventNames>(event: K) {
		return new Promise<EventEmitterReturnType<PeerEventArguments[K]>>(
			(resolve) => {
				this.once(event, (...args) => {
					switch (args.length) {
						case 0:
							resolve(undefined as never);
							break;
						case 1:
							resolve(args[0]);
							break;
						default:
							resolve(args as never);
							break;
					}
				});
			},
		);
	}

	addTransceiverFromKind(kind: string, init?: RTCRtpTransceiverInit) {
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

	addTrack(track: MediaStreamTrack) {
		if (!this.connection) {
			throw new Error("Connection not initialized");
		}
		const sender = this.connection.addTrack(track);
		return sender;
	}

	removeTrack(sender: RTCRtpSender) {
		if (!this.connection) {
			throw new Error("Connection not initialized");
		}
		this.connection.removeTrack(sender);
		return this;
	}

	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	private internalSignal(message: any) {
		this.emit("signal", message);
		return this;
	}

	public async negotiate() {
		if (this.initiator) {
			await this.createOffer();
		} else {
			this.internalSignal({ type: "renegotiate", renegotiate: true });
		}
		return this;
	}

	private async createOffer() {
		if (!this.connection) {
			throw new Error("Connection not initialized");
		}

		const offer = await this.connection.createOffer(this.offerConfig);
		if (!this.trickle) {
			offer.sdp = filterTrickle(offer.sdp);
		}
		offer.sdp = this.sdpTransform(offer.sdp);
		await this.connection.setLocalDescription(offer);
		this.internalSignal({ type: offer.type, sdp: offer.sdp });
		return this;
	}

	private async createAnswer() {
		if (!this.connection) {
			throw new Error("Connection not initialized");
		}

		const answer = await this.connection.createAnswer(this.answerConfig);
		if (!this.trickle) {
			answer.sdp = filterTrickle(answer.sdp);
		}
		answer.sdp = this.sdpTransform(answer.sdp);
		await this.connection.setLocalDescription(answer);
		this.internalSignal({ type: answer.type, sdp: answer.sdp });
		return this;
	}

	private createPeer() {
		this.internalClose(false);

		this.connection = new this.webrtc.RTCPeerConnection(this.config);
		this.connection.addEventListener(
			"negotiationneeded",
			this.onNegotiationNeeded.bind(this),
		);
		this.connection.addEventListener(
			"iceconnectionstatechange",
			this.onICEConnectionStateChange.bind(this),
		);
		this.connection.addEventListener(
			"icegatheringstatechange",
			this.onICEGatheringStateChange.bind(this),
		);
		this.connection.addEventListener(
			"connectionstatechange",
			this.onConnectionStateChange.bind(this),
		);
		this.connection.addEventListener(
			"icecandidate",
			this.onICECandidate.bind(this),
		);
		this.connection.addEventListener(
			"signalingstatechange",
			this.onSignalingStateChange.bind(this),
		);
		this.connection.addEventListener("track", this.onTrackRemote.bind(this));

		if (this.initiator) {
			const channel = this.connection.createDataChannel(
				this.channelName,
				this.channelConfig,
			);
			channel.addEventListener("open", this.onDataChannelOpen.bind(this));
			channel.addEventListener("message", this.onDataChannelMessage.bind(this));
			channel.addEventListener("error", this.onDataChannelError.bind(this));
			this.channel = channel;
		} else {
			this.connection.addEventListener(
				"datachannel",
				this.onDataChannel.bind(this),
			);
		}
		return this;
	}

	private internalClose(triggerCallbacks = true) {
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

	private onConnectionStateChange() {
		if (!this.connection) {
			return;
		}

		console.debug(
			`${this.id}: connection state ${this.connection.connectionState}`,
		);
		switch (this.connection.connectionState) {
			case "failed":
			case "disconnected":
			case "closed":
				this.internalClose(true);
				break;
		}
	}

	private onNegotiationNeeded() {
		if (!this.connection) {
			return;
		}
		return this.negotiate();
	}

	private onICEConnectionStateChange() {
		if (!this.connection) {
			return;
		}

		console.debug(
			`${this.id}: ice connection state ${this.connection.iceConnectionState}`,
		);
	}

	private onICEGatheringStateChange() {
		if (!this.connection) {
			return;
		}

		console.debug(
			`${this.id}: ice gathering state ${this.connection.iceGatheringState}`,
		);
	}

	private onSignalingStateChange() {
		if (!this.connection) {
			return;
		}
		console.debug(
			`${this.id}: signaling state ${this.connection.signalingState}`,
		);
	}

	private onICECandidate(event: RTCPeerConnectionIceEvent) {
		if (event.candidate) {
			this.internalSignal({
				type: "candidate",
				candidate: event.candidate,
			});
		}
	}

	private onTrackRemote(event: RTCTrackEvent) {
		this.emit("track", event);
	}

	private onDataChannel(event: RTCDataChannelEvent) {
		const channel = event.channel;
		this.channel = channel;
		this.channel.onopen = this.onDataChannelOpen.bind(this);
		this.channel.onmessage = this.onDataChannelMessage.bind(this);
		this.channel.onerror = this.onDataChannelError.bind(this);
	}

	private onDataChannelOpen() {
		console.debug(`${this.id}: data channel open`);
		this.emit("connect");
	}

	private onDataChannelMessage(
		event: MessageEvent<string | Blob | ArrayBuffer | Uint8Array>,
	) {
		this.emit("data", event.data);
	}

	private onDataChannelError(event: Event) {
		this.emit("error", new Error("DataChannel error", { cause: event }));
	}
}

function filterTrickle(sdp?: string) {
	return sdp?.replace(/a=ice-options:trickle\s\n/g, "");
}
function sdpTransform(sdp?: string) {
	return sdp;
}
function asap() {
	return new Promise<void>((resolve) => resolve());
}
function waitMS(ms: number) {
	return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function write(
	channel: RTCDataChannel,
	chunk: string | Blob | ArrayBuffer | ArrayBufferView,
	maxChannelMessageSize: number,
) {
	if (typeof chunk === "string") {
		if (chunk.length < maxChannelMessageSize) {
			channel.send(chunk);
		} else {
			let offset = 0;
			while (offset < chunk.length) {
				const length = Math.min(maxChannelMessageSize, chunk.length - offset);
				channel.send(chunk.substring(offset, offset + length));
				offset += length;
			}
		}
	} else if (chunk instanceof Blob) {
		if (chunk.size < maxChannelMessageSize) {
			channel.send(chunk);
		} else {
			let offset = 0;
			while (offset < chunk.size) {
				const length = Math.min(maxChannelMessageSize, chunk.size - offset);
				channel.send(chunk.slice(offset, offset + length));
				offset += length;
			}
		}
	} else {
		let buffer: ArrayBuffer;
		if (chunk instanceof ArrayBuffer) {
			buffer = chunk;
		} else {
			buffer = chunk.buffer;
		}
		if (buffer.byteLength < maxChannelMessageSize) {
			channel.send(buffer);
		} else {
			let offset = 0;
			while (offset < buffer.byteLength) {
				const length = Math.min(
					maxChannelMessageSize,
					buffer.byteLength - offset,
				);
				channel.send(buffer.slice(offset, offset + length));
				offset += length;
			}
		}
	}
}

export function writableStreamFromChannel(
	channel: RTCDataChannel,
	maxChannelMessageSize: number,
) {
	return new WritableStream({
		write(chunk: string | Blob | ArrayBuffer | ArrayBufferView) {
			write(channel, chunk, maxChannelMessageSize);
		},
	});
}

export function readableStreamFromChannel(channel: RTCDataChannel) {
	let closed = false;
	let closedController = false;
	const queue: Array<string | Blob | ArrayBuffer> = [];
	const pullQueue: Array<
		[
			resolve: (data: string | Blob | ArrayBuffer) => void,
			reject: (error?: Error) => void,
		]
	> = [];
	function pull() {
		return new Promise<string | Blob | ArrayBuffer>((resolve, reject) =>
			pullQueue.push([resolve, reject]),
		);
	}
	function onMessage(event: MessageEvent<string | Blob | ArrayBuffer>) {
		if (pullQueue.length) {
			// biome-ignore lint/style/noNonNullAssertion: checked above
			const [resolve, _reject] = pullQueue.shift()!;
			resolve(event.data);
		} else {
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
	return new ReadableStream<string | Blob | ArrayBuffer>({
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
			} else {
				controller.enqueue(await pull());
			}
		},
		cancel: onClose,
	});
}
