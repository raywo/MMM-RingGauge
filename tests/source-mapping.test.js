const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = require("../source-mapping.js");

const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);

// A source that names its readings in the payload.
const BY_PATHS = {
	notification: "SENSOR_READING",
	match: {name: "co2"},
	fields: {
		value: "reading.value",
		unit: "reading.unit",
		quantity: "kind",
		reportedAt: "reading.at",
		available: "reading.ok"
	}
};

function read(options, payload, notification = options.notification) {
	return source.readNotification(options, notification, payload, NOW);
}

describe("source-mapping.js", () => {
	it("runs without MagicMirror and without a DOM", () => {
		const context = vm.createContext({});
		const file = path.join(__dirname, "..", "source-mapping.js");
		vm.runInContext(fs.readFileSync(file, "utf8"), context, {filename: "source-mapping.js"});
		assert.deepEqual(Object.keys(context.RingGaugeSource).sort(), Object.keys(source).sort());
	});
});

describe("readNotification by paths", () => {
	const payload = {name: "co2", kind: "co2", reading: {value: 812, unit: "ppm", at: NOW - 5000, ok: true}};

	it("maps nested paths onto the gauge's fields", () => {
		const {reading, problems} = read(BY_PATHS, payload);
		assert.deepEqual(reading, {value: 812, unit: "ppm", quantity: "co2", reportedAt: NOW - 5000, valid: true});
		assert.deepEqual(problems, []);
	});

	it("ignores another notification name", () => {
		assert.deepEqual(read(BY_PATHS, payload, "OTHER_READING"), {reading: null, problems: []});
	});

	it("ignores a payload that does not match", () => {
		assert.deepEqual(read(BY_PATHS, {...payload, name: "humidity"}), {reading: null, problems: []});
	});

	it("ignores a payload that lacks a path of `match`", () => {
		assert.deepEqual(read(BY_PATHS, {reading: payload.reading}), {reading: null, problems: []});
	});

	it("takes every notification of the name without `match`", () => {
		const {reading} = read({notification: "N", fields: {value: "v"}}, {v: 3});
		assert.equal(reading.value, 3);
	});

	it("follows array indexes in paths", () => {
		const {reading} = read({notification: "N", fields: {value: "readings.1.v"}}, {readings: [{v: 1}, {v: 2}]});
		assert.equal(reading.value, 2);
	});

	it("converts a numeric string to a number", () => {
		const {reading} = read({notification: "N", fields: {value: "v"}}, {v: " 21.5 "});
		assert.equal(reading.value, 21.5);
		assert.equal(reading.valid, true);
	});

	it("takes a non-numeric value as invalid", () => {
		for (const v of ["unavailable", "", null, true, Number.NaN, {}]) {
			const {reading} = read({notification: "N", fields: {value: "v"}}, {v});
			assert.equal(reading.value, null, JSON.stringify(v));
			assert.equal(reading.valid, false, JSON.stringify(v));
		}
	});

	it("takes `available: false` as invalid", () => {
		const {reading} = read(BY_PATHS, {...payload, reading: {...payload.reading, ok: false}});
		assert.equal(reading.value, 812);
		assert.equal(reading.valid, false);
	});

	describe("report time", () => {
		const at = Date.UTC(2026, 0, 15, 11, 59, 30);
		const options = {notification: "N", fields: {value: "v", reportedAt: "t"}};
		const cases = [
			["epoch ms", at],
			["epoch s", at / 1000],
			["epoch s as string", String(at / 1000)],
			["ISO string", new Date(at).toISOString()],
			["ISO string with offset", "2026-01-15T12:59:30+01:00"]
		];
		for (const [name, t] of cases) {
			it(`accepts ${name}`, () => {
				assert.equal(read(options, {v: 1, t}).reading.reportedAt, at);
			});
		}

		it("takes the time of receipt without one", () => {
			assert.equal(read({notification: "N", fields: {value: "v"}}, {v: 1}).reading.reportedAt, NOW);
		});

		it("takes the time of receipt for one it cannot read", () => {
			assert.equal(read(options, {v: 1, t: "yesterday"}).reading.reportedAt, NOW);
		});
	});

	it("takes `unit` and `quantity` from the options when the mapping yields none", () => {
		const options = {notification: "N", fields: {value: "v"}, unit: "%", quantity: "humidity"};
		const {reading} = read(options, {v: 40});
		assert.equal(reading.unit, "%");
		assert.equal(reading.quantity, "humidity");
	});

	it("prefers the unit of the reading over the option", () => {
		const options = {notification: "N", fields: {value: "v", unit: "u"}, unit: "%"};
		assert.equal(read(options, {v: 40, u: "ppm"}).reading.unit, "ppm");
	});

	it("names a path it does not find, with a stable key", () => {
		const {reading, problems} = read(BY_PATHS, {name: "co2", reading: {value: 812}});
		assert.equal(reading.value, 812);
		assert.deepEqual(problems, [
			{key: "path:unit", message: 'path "reading.unit" of `fields.unit` not found in SENSOR_READING'},
			{key: "path:quantity", message: 'path "kind" of `fields.quantity` not found in SENSOR_READING'},
			{key: "path:reportedAt", message: 'path "reading.at" of `fields.reportedAt` not found in SENSOR_READING'},
			{key: "path:available", message: 'path "reading.ok" of `fields.available` not found in SENSOR_READING'}
		]);
	});

	it("takes a reading whose `fields.value` path is missing as invalid", () => {
		const {reading, problems} = read({notification: "N", fields: {value: "v"}}, {battery: 80});
		assert.equal(reading.valid, false);
		assert.deepEqual(problems, [{key: "path:value", message: 'path "v" of `fields.value` not found in N'}]);
	});
});

describe("readNotification with transform", () => {
	it("maps the reading the function returns", () => {
		const options = {
			notification: "N",
			transform: (payload) => ({value: payload.text.split(" ")[0], unit: payload.text.split(" ")[1]})
		};
		const {reading, problems} = read(options, {text: "812 ppm"});
		assert.equal(reading.value, 812);
		assert.equal(reading.unit, "ppm");
		assert.deepEqual(problems, []);
	});

	it("ignores the notification when the function returns null", () => {
		assert.deepEqual(read({notification: "N", transform: () => null}, {}), {reading: null, problems: []});
	});

	it("ignores the notification and reports when the function throws", () => {
		const options = {
			notification: "N",
			transform: () => {
				throw new TypeError("boom");
			}
		};
		assert.deepEqual(read(options, {}), {
			reading: null,
			problems: [{key: "transform-threw", message: "`transform` threw: TypeError: boom"}]
		});
	});

	it("ignores the notification and reports when the function returns no object", () => {
		for (const [result, described] of [[42, "42"], [undefined, "undefined"], [[], "an array"]]) {
			const {reading, problems} = read({notification: "N", transform: () => result}, {});
			assert.equal(reading, null);
			assert.deepEqual(problems, [
				{key: "transform-result", message: `\`transform\` returned ${described} instead of an object or null`}
			]);
		}
	});

	it("never calls the function for another notification", () => {
		let calls = 0;
		read({notification: "N", transform: () => calls++}, {}, "OTHER");
		assert.equal(calls, 0);
	});
});

describe("readConnection", () => {
	const connection = {notification: "LINK", match: {source: "hub"}, connected: "state.up"};

	it("reads the boolean at the `connected` path", () => {
		assert.deepEqual(source.readConnection(connection, "LINK", {source: "hub", state: {up: false}}), {
			connected: false,
			problems: []
		});
		assert.equal(source.readConnection(connection, "LINK", {source: "hub", state: {up: true}}).connected, true);
	});

	it("ignores another notification and a payload that does not match", () => {
		assert.equal(source.readConnection(connection, "OTHER", {source: "hub", state: {up: false}}).connected, null);
		assert.equal(source.readConnection(connection, "LINK", {source: "x", state: {up: false}}).connected, null);
	});

	it("ignores a value that is not a boolean", () => {
		assert.equal(source.readConnection(connection, "LINK", {source: "hub", state: {up: "no"}}).connected, null);
	});

	it("names the `connected` path it does not find", () => {
		assert.deepEqual(source.readConnection(connection, "LINK", {source: "hub"}), {
			connected: null,
			problems: [{key: "connection-path", message: 'path "state.up" of `connection.connected` not found in LINK'}]
		});
	});

	it("takes true, false or null from a transform", () => {
		const byTransform = {notification: "LINK", transform: (payload) => payload.status === "online"};
		assert.equal(source.readConnection(byTransform, "LINK", {status: "offline"}).connected, false);
		assert.equal(source.readConnection({notification: "LINK", transform: () => null}, "LINK", {}).connected, null);
	});

	it("reports a transform that throws or returns something else", () => {
		const throwing = {
			notification: "LINK",
			transform: () => {
				throw new Error("x");
			}
		};
		assert.equal(source.readConnection(throwing, "LINK", {}).problems[0].key, "connection-transform-threw");
		const odd = source.readConnection({notification: "LINK", transform: () => "up"}, "LINK", {});
		assert.deepEqual(odd, {
			connected: null,
			problems: [
				{
					key: "connection-transform-result",
					message: '`connection.transform` returned "up" instead of true, false or null'
				}
			]
		});
	});

	it("says nothing without a connection option", () => {
		assert.deepEqual(source.readConnection(null, "LINK", {}), {connected: null, problems: []});
	});
});

describe("configProblems", () => {
	it("accepts paths or a transform", () => {
		assert.deepEqual(source.configProblems({notification: "N", fields: {value: "v"}}), []);
		assert.deepEqual(source.configProblems({notification: "N", transform: () => null}), []);
	});

	it("names a missing notification and a missing mapping", () => {
		assert.deepEqual(source.configProblems({notification: "", fields: {}, transform: null}), [
			"`notification` is missing",
			"neither `fields.value` nor `transform` is set"
		]);
	});

	it("names a transform that did not arrive as a function", () => {
		// What MagicMirror² leaves when it cannot revive a function.
		const options = {notification: "N", transform: {__mmFunction: "transform (p) { return p; }"}};
		assert.deepEqual(source.configProblems(options), [
			"`transform` is not a function; it needs MagicMirror² 2.36 or newer"
		]);
	});

	it("names problems of the connection option", () => {
		assert.deepEqual(source.configProblems({notification: "N", fields: {value: "v"}, connection: {}}), [
			"`connection.notification` is missing",
			"neither `connection.connected` nor `connection.transform` is set"
		]);
		assert.deepEqual(source.configProblems({notification: "N", fields: {value: "v"}, connection: "LINK"}), [
			"`connection` is not an object"
		]);
	});
});

describe("availability", () => {
	const minute = 60 * 1000;
	const fresh = {lastValid: {value: 1, reportedAt: NOW}, readingUnavailable: false, disconnectedSince: null};

	it("is available with a valid reading and no other signal", () => {
		assert.deepEqual(source.availability(fresh, {}, NOW + 24 * 60 * minute), {unavailable: false, nextCheck: null});
	});

	it("is unavailable after an invalid reading", () => {
		assert.equal(source.availability({...fresh, readingUnavailable: true}, {}, NOW).unavailable, true);
	});

	it("waits graceAfter after a lost connection", () => {
		const state = {...fresh, disconnectedSince: NOW};
		assert.deepEqual(source.availability(state, {graceAfter: 30000}, NOW + 29999), {
			unavailable: false,
			nextCheck: NOW + 30000
		});
		assert.equal(source.availability(state, {graceAfter: 30000}, NOW + 30000).unavailable, true);
	});

	it("counts a lost connection at once without graceAfter", () => {
		assert.equal(source.availability({...fresh, disconnectedSince: NOW}, {}, NOW).unavailable, true);
	});

	it("turns stale once older than staleAfter", () => {
		const options = {staleAfter: 10 * minute};
		assert.deepEqual(source.availability(fresh, options, NOW + 10 * minute), {
			unavailable: false,
			nextCheck: NOW + 10 * minute + 1
		});
		assert.equal(source.availability(fresh, options, NOW + 10 * minute + 1).unavailable, true);
	});

	it("never turns stale without staleAfter", () => {
		for (const staleAfter of [undefined, null]) {
			assert.equal(source.availability(fresh, {staleAfter}, NOW + 24 * 60 * minute).unavailable, false);
		}
	});

	it("checks again at the earliest deadline", () => {
		const state = {...fresh, disconnectedSince: NOW};
		const {nextCheck} = source.availability(state, {graceAfter: 5 * minute, staleAfter: 2 * minute}, NOW);
		assert.equal(nextCheck, NOW + 2 * minute + 1);
	});
});
