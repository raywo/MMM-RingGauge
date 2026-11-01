const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {PRESETS} = require("../presets.js");
const {bandIndex} = require("../gauge-logic.js");

const MOCK_FILE = path.join(__dirname, "..", "dev", "MMM-FakeReadings", "MMM-FakeReadings.js");

/**
 * Loads the mock the way MagicMirror² loads it and returns an instance
 * with its defaults as config, together with what it sends.
 */
function loadMock(config = {}) {
	let definition = null;
	const context = vm.createContext({
		setInterval,
		Module: {
			register: (_name, value) => {
				definition = value;
			}
		}
	});
	vm.runInContext(fs.readFileSync(MOCK_FILE, "utf8"), context, {filename: "MMM-FakeReadings.js"});
	const sent = [];
	const instance = Object.assign(Object.create(definition), {
		config: {...definition.defaults, ...config},
		sendNotification: (notification, payload) => sent.push({notification, payload})
	});
	instance.start();
	return {instance, sent};
}

// Differences between consecutive valid values.
function steps(values) {
	return values.slice(1).map((value, index) => Math.abs(value - values[index]));
}

describe("MMM-FakeReadings scenarios", () => {
	const {instance} = loadMock();

	for (const scenario of instance.scenarios) {
		const preset = PRESETS[scenario.quantity];
		const values = scenario.values.filter((value) => value !== null);

		it(`${scenario.sensor} has a preset`, () => {
			assert.ok(preset);
		});

		it(`${scenario.sensor} crosses every band of its preset`, () => {
			const reached = new Set(values.map((value) => bandIndex(preset.bands, value, preset.max)));
			assert.deepEqual([...reached].sort(), preset.bands.map((_band, index) => index));
		});

		it(`${scenario.sensor} jumps from one end of the arc to the other`, () => {
			assert.ok(steps(values).includes(preset.max - preset.min));
		});

		it(`${scenario.sensor} takes small steps`, () => {
			const span = preset.max - preset.min;
			assert.ok(steps(values).some((step) => step > 0 && step <= span * 0.02));
		});

		it(`${scenario.sensor} is unavailable at times`, () => {
			assert.ok(scenario.values.includes(null));
		});
	}
});

describe("MMM-FakeReadings readingsAt", () => {
	it("sends value, unit, quantity and availability per sensor", () => {
		const {instance} = loadMock();
		const readings = instance.readingsAt(0);
		assert.deepEqual(Array.from(readings, (reading) => reading.sensor), ["co2", "humidity", "temperature"]);
		assert.deepEqual({...readings[0]}, {sensor: "co2", quantity: "carbon_dioxide", unit: "ppm", value: 520, available: true});
	});

	it("marks a missing value as unavailable", () => {
		const {instance} = loadMock();
		const index = instance.scenarios[0].values.indexOf(null);
		assert.equal(instance.readingsAt(index)[0].available, false);
	});

	it("sends a fixed value for every sensor named in fixed, at every tick", () => {
		const {instance} = loadMock({fixed: {co2: 900, humidity: 63}});
		for (const index of [0, 5, instance.scenarios[0].values.indexOf(null)]) {
			const [co2, humidity, temperature] = instance.readingsAt(index);
			assert.equal(co2.value, 900);
			assert.equal(co2.available, true);
			assert.equal(humidity.value, 63);
			assert.equal(temperature.value, instance.scenarios[2].values[index]);
		}
	});

	it("repeats the values from the start", () => {
		const {instance} = loadMock();
		const length = instance.scenarios[0].values.length;
		assert.equal(JSON.stringify(instance.readingsAt(length)), JSON.stringify(instance.readingsAt(0)));
	});
});

describe("MMM-FakeReadings ticks", () => {
	// What each tick sends, as "reading" or "connected:<state>".
	function run(config, ticks) {
		const {instance, sent} = loadMock(config);
		const perTick = [];
		for (let tick = 0; tick < ticks; tick += 1) {
			const before = sent.length;
			instance.sendTick();
			perTick.push(sent.slice(before));
		}
		return perTick;
	}

	function kinds(messages) {
		return messages.map((message) => (message.notification === "FAKE_CONNECTION" ? `connected:${message.payload.connected}` : "reading"));
	}

	it("drops the connection for the last ticks of each cycle and sends no readings meanwhile", () => {
		const perTick = run({dropEvery: 6, dropFor: 2}, 13).map(kinds);
		assert.deepEqual(perTick[0], ["reading", "reading", "reading"]);
		assert.deepEqual(perTick[3], ["reading", "reading", "reading"]);
		assert.deepEqual(perTick[4], ["connected:false"]);
		assert.deepEqual(perTick[5], []);
		assert.deepEqual(perTick[6], ["connected:true", "reading", "reading", "reading"]);
		assert.deepEqual(perTick[10], ["connected:false"]);
		assert.equal(perTick[12][0], "connected:true");
	});

	it("continues the readings where they stopped after a drop", () => {
		const values = run({dropEvery: 6, dropFor: 2}, 7)
			.flat()
			.filter((message) => message.payload.sensor === "co2")
			.map((message) => message.payload.value);
		assert.deepEqual(values, [520, 540, 560, 580, 950]);
	});

	it("never drops the connection with dropEvery 0", () => {
		const messages = run({dropEvery: 0}, 30).flat();
		assert.equal(messages.length, 90);
		assert.ok(messages.every((message) => message.notification === "FAKE_READING"));
	});

	it("uses the configured notification names", () => {
		const messages = run({readingNotification: "R", connectionNotification: "C", dropEvery: 2, dropFor: 1}, 3).flat();
		assert.deepEqual(messages.map((message) => message.notification), ["R", "R", "R", "C", "C", "R", "R", "R"]);
	});
});

describe("MMM-FakeReadings start", () => {
	it("starts sending once the DOM exists, and only once", () => {
		const {instance, sent} = loadMock({interval: 60000});
		instance.notificationReceived("ALL_MODULES_STARTED");
		assert.equal(sent.length, 0);
		instance.notificationReceived("DOM_OBJECTS_CREATED");
		instance.notificationReceived("DOM_OBJECTS_CREATED");
		assert.equal(sent.length, 3);
		clearInterval(instance.timer);
	});
});
