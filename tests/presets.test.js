const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {PRESETS, convertTemperature, temperatureSystem, settingsKey, settings} = require("../presets.js");
const {bandProblems} = require("../gauge-logic.js");

const translate = (key) => `t:${key}`;

describe("convertTemperature", () => {
	it("converts between °C and °F", () => {
		assert.equal(convertTemperature(20, "metric", "imperial"), 68);
		assert.equal(convertTemperature(50, "imperial", "metric"), 10);
		assert.equal(convertTemperature(21.5, "metric", "metric"), 21.5);
	});
});

describe("temperatureSystem", () => {
	it("knows °C and °F only", () => {
		assert.equal(temperatureSystem("°C"), "metric");
		assert.equal(temperatureSystem("°F"), "imperial");
		assert.equal(temperatureSystem("K"), null);
		assert.equal(temperatureSystem(""), null);
	});
});

describe("settingsKey", () => {
	it("depends on the unit for a temperature only", () => {
		assert.equal(settingsKey({quantity: "humidity", unit: "%"}), settingsKey({quantity: "humidity", unit: ""}));
		assert.notEqual(settingsKey({quantity: "temperature", unit: "°C"}), settingsKey({quantity: "temperature", unit: "°F"}));
	});
});

describe("settings", () => {
	it("defines every preset's bands contiguous up to its max", () => {
		for (const [quantity, preset] of Object.entries(PRESETS)) {
			assert.deepEqual(bandProblems(preset.bands, preset.max), [], quantity);
		}
	});

	it("converts the temperature preset for imperial without gaps", () => {
		const result = settings({}, {quantity: "temperature", unit: "°C"}, "imperial", translate);
		assert.deepEqual(result.problems, []);
		assert.deepEqual(bandProblems(result.bands, result.max), []);
		assert.equal(result.unit, "°F");
		assert.equal(result.bands[0].text, "t:TEMPERATURE_TOO_COLD");
		assert.equal(result.label, "t:TEMPERATURE_LABEL");
		assert.equal(result.convert(100), 212);
	});

	it("takes a preset's part only where the option is undefined or null", () => {
		const result = settings({label: "", icon: null, min: 0}, {quantity: "humidity", unit: "%"}, "metric", translate);
		assert.deepEqual([result.label, result.icon, result.min, result.max, result.unit], ["", "humidity", 0, 80, null]);
	});

	it("falls back to metric without `units`", () => {
		const result = settings({}, {quantity: "temperature", unit: "°F"}, undefined, translate);
		assert.deepEqual([result.unit, result.problems], ["°C", []]);
	});

	it("names a `min` that is not a number", () => {
		const result = settings({min: "low"}, {quantity: "humidity", unit: "%"}, "metric", translate);
		assert.deepEqual(result.problems.map((problem) => problem.message), ["`min` is not a number"]);
	});
});
