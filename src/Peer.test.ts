import tape from "tape";
import { Peer } from "./Peer";
import wrtc from "@roamhq/wrtc";

tape("basic", async (assert: tape.Test) => {
	const peer1 = new Peer({
		id: "peer1",
		webrtc: wrtc,
	});
	const peer2 = new Peer({
		id: "peer2",
		webrtc: wrtc,
	});
	peer1.on("signal", (message) => {
		peer2.signal(message);
	});
	peer2.on("signal", (message) => {
		peer1.signal(message);
	});

	assert.equal(peer1.getId(), "peer1");
	assert.equal(peer2.getId(), "peer2");

	const peer1ConnectPromise = peer1.waitOnce("connect");
	const peer2ConnectPromise = peer2.waitOnce("connect");

	await peer1.init();
	assert.true(peer1.isInitiator());
	assert.false(peer2.isInitiator());

	await peer1ConnectPromise;
	await peer2ConnectPromise;

	assert.notEqual(
		peer1.getConnection(),
		undefined,
		"peer1 should be connected",
	);
	assert.notEqual(
		peer2.getConnection(),
		undefined,
		"peer2 should be connected",
	);

	assert.notEqual(peer1.getChannel(), undefined, "peer1 should have a channel");
	assert.notEqual(peer2.getChannel(), undefined, "peer2 should have a channel");

	const peer1DataPromise = peer1.waitOnce("data");
	const peer2DataPromise = peer2.waitOnce("data");

	peer1.send("Hello");
	peer2.send("World");

	assert.equal(
		await peer1DataPromise,
		"World",
		"peer2 should send `World` to peer1",
	);
	assert.equal(
		await peer2DataPromise,
		"Hello",
		"peer1 should send `Hello` to peer2",
	);

	const peer1ClosePromise = peer1.waitOnce("close");
	const peer2ClosePromise = peer2.waitOnce("close");

	peer1.close();
	peer2.close();

	await peer1ClosePromise;
	await peer2ClosePromise;

	assert.end();
});

tape("streams", async (assert: tape.Test) => {
	const peer1 = new Peer({
		id: "peer1",
		webrtc: wrtc,
		channelConfig: {
			ordered: true,
		},
	});
	const peer2 = new Peer({
		id: "peer2",
		webrtc: wrtc,
		channelConfig: {
			ordered: true,
		},
	});
	peer1.on("signal", (message) => {
		peer2.signal(message);
	});
	peer2.on("signal", (message) => {
		peer1.signal(message);
	});

	const peer1ConnectPromise = peer1.waitOnce("connect");
	const peer2ConnectPromise = peer2.waitOnce("connect");

	await peer1.init();

	await peer1ConnectPromise;
	await peer2ConnectPromise;

	const source = new wrtc.nonstandard.RTCVideoSource();
	const track = source.createTrack();
	const sink = new wrtc.nonstandard.RTCVideoSink(track);

	const width = 320;
	const height = 240;
	const data = new Uint8ClampedArray(
		width * height * 1.5,
	) as unknown as Uint8Array;
	const frame = { width, height, data };

	const peer2TrackPromise = peer2.waitOnce("track");
	await peer1.addTrack(track);
	await peer2TrackPromise;

	const count = 100;
	const receiverPromise = new Promise<number>((resolve) => {
		let received = 0;
		sink.addEventListener("frame", () => {
			received += 1;
			if (received >= count) {
				resolve(received);
			}
		});
	});
	const senderPromise = new Promise<number>((resolve) => {
		let sent = 0;
		const interval = setInterval(() => {
			source.onFrame(frame);
			sent += 1;
			if (sent >= count) {
				clearInterval(interval);
				resolve(sent);
			}
		});
	});

	assert.equal(await receiverPromise, await senderPromise, "frames match");
	track.stop();
	sink.stop();

	const peer1ClosePromise = peer1.waitOnce("close");
	const peer2ClosePromise = peer2.waitOnce("close");

	peer1.close();
	peer2.close();

	await peer1ClosePromise;
	await peer2ClosePromise;

	assert.end();
});

tape("streams api", async (assert: tape.Test) => {
	const peer1 = new Peer({
		id: "peer1",
		webrtc: wrtc,
		maxChannelMessageSize: 1,
	});
	const peer2 = new Peer({
		id: "peer2",
		webrtc: wrtc,
		maxChannelMessageSize: 1,
	});
	peer1.on("signal", (message) => {
		peer2.signal(message);
	});
	peer2.on("signal", (message) => {
		peer1.signal(message);
	});

	const peer1ConnectPromise = peer1.waitOnce("connect");
	const peer2ConnectPromise = peer2.waitOnce("connect");

	await peer1.init();

	await peer1ConnectPromise;
	await peer2ConnectPromise;

	const writableStream = peer1.writableStream();
	const readableStream = peer2.readableStream();

	const writer = writableStream.getWriter();
	const messageToSend = "Hello, world!";
	const wrotePromise = writer.write(messageToSend);

	const reader = readableStream.getReader();
	await wrotePromise;

	let message = "";
	let next = await reader.read();
	while (!next.done) {
		message += next.value;
		if (message.length === messageToSend.length) {
			reader.cancel();
			break;
		}
		next = await reader.read();
	}
	assert.equal(message, "Hello, world!");

	const peer1ClosePromise = peer1.waitOnce("close");
	const peer2ClosePromise = peer2.waitOnce("close");

	peer1.close();
	peer2.close();

	await peer1ClosePromise;
	await peer2ClosePromise;

	assert.end();
});
