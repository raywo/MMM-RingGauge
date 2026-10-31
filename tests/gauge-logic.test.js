const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const logic = require("../gauge-logic.js");

// Bands and ranges from docs/design.md, "Bands".
const CO2 = {
	min: 400,
	max: 2500,
	bands: [
		{to: 1000, level: "good", text: "Gut"},
		{to: 2000, level: "warn", text: "Lüften"},
		{to: 2500, level: "bad", text: "Jetzt lüften"}
	]
};
const HUMIDITY = {
	min: 20,
	max: 80,
	bands: [
		{to: 30, level: "warn", text: "Zu trocken"},
		{to: 60, level: "good", text: "Optimal"},
		{to: 70, level: "warn", text: "Zu feucht"},
		{to: 80, level: "bad", text: "Viel zu feucht"}
	]
};

// docs/design.md, "Scale geometry": L = 2π · 78 · 0.75.
const L = 2 * Math.PI * 78 * 0.75;

function assertClose(actual, expected, message) {
	assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: expected ${expected}, got ${actual}`);
}

describe("gauge-logic.js", () => {
	it("runs without MagicMirror and without a DOM", () => {
		const context = vm.createContext({});
		const file = path.join(__dirname, "..", "gauge-logic.js");
		vm.runInContext(fs.readFileSync(file, "utf8"), context, {filename: "gauge-logic.js"});
		assert.deepEqual(Object.keys(context.RingGaugeLogic).sort(), Object.keys(logic).sort());
	});

	it("sets the global even where the page has a CommonJS module", () => {
		// Electron with nodeIntegration exposes `module` to every page script.
		const context = vm.createContext({module: {exports: {}}});
		const file = path.join(__dirname, "..", "gauge-logic.js");
		vm.runInContext(fs.readFileSync(file, "utf8"), context, {filename: "gauge-logic.js"});
		assert.deepEqual(Object.keys(context.RingGaugeLogic).sort(), Object.keys(logic).sort());
	});

	it("has the arc length of the design", () => {
		assertClose(logic.ARC_LENGTH, L, "arc length");
	});
});

describe("bandIndex", () => {
	const cases = [
		["CO₂ below min", CO2, 300, 0],
		["CO₂ on min", CO2, 400, 0],
		["CO₂ inside the first band", CO2, 800, 0],
		["CO₂ on the edge of the first band", CO2, 1000, 1],
		["CO₂ inside the second band", CO2, 1500, 1],
		["CO₂ on the edge of the second band", CO2, 2000, 2],
		["CO₂ inside the last band", CO2, 2200, 2],
		["CO₂ on max", CO2, 2500, 2],
		["CO₂ above max", CO2, 5000, 2],
		["humidity below min", HUMIDITY, 5, 0],
		["humidity on min", HUMIDITY, 20, 0],
		["humidity on the edge of the first band", HUMIDITY, 30, 1],
		["humidity inside the good band", HUMIDITY, 45, 1],
		["humidity on the edge of the good band", HUMIDITY, 60, 2],
		["humidity inside the third band", HUMIDITY, 65, 2],
		["humidity on the edge of the third band", HUMIDITY, 70, 3],
		["humidity on max", HUMIDITY, 80, 3],
		["humidity above max", HUMIDITY, 95, 3]
	];
	for (const [name, gauge, value, expected] of cases) {
		it(`${name} (${value}) takes band ${expected}`, () => {
			assert.equal(logic.bandIndex(gauge.bands, value, gauge.max), expected);
		});
	}

	it("returns -1 without bands", () => {
		assert.equal(logic.bandIndex([], 50, 100), -1);
	});

	it("returns -1 beyond bands that end before max", () => {
		const bands = [{to: 1000, level: "good"}, {to: 2000, level: "warn"}];
		assert.equal(logic.bandIndex(bands, 1500, 2500), 1);
		assert.equal(logic.bandIndex(bands, 2000, 2500), -1);
		assert.equal(logic.bandIndex(bands, 3000, 2500), -1);
	});

	it("gives values beyond max to a last band beyond max", () => {
		const bands = [{to: 50, level: "good"}, {to: 120, level: "bad"}];
		assert.equal(logic.bandIndex(bands, 130, 100), 1);
	});
});

describe("segmentGeometry", () => {
	// f_i: share of the whole range, cum_i: sum of the shares before it.
	function expected(shares) {
		let cum = 0;
		return shares.map((share) => {
			const segment = {dashLength: share * L - 5, dashOffset: -(cum * L + 2.5)};
			cum += share;
			return segment;
		});
	}

	function assertSegments(actual, wanted) {
		assert.equal(actual.length, wanted.length);
		wanted.forEach((segment, index) => {
			assertClose(actual[index].dashLength, segment.dashLength, `dash length of segment ${index}`);
			assertClose(actual[index].dashOffset, segment.dashOffset, `dash offset of segment ${index}`);
		});
	}

	it("draws the CO₂ bands", () => {
		const actual = logic.segmentGeometry(CO2.bands, CO2.min, CO2.max);
		assertSegments(actual, expected([600 / 2100, 1000 / 2100, 500 / 2100]));
		// The first segment, rounded to four places.
		assert.ok(Math.abs(actual[0].dashLength - 100.0189) < 1e-4);
	});

	it("draws the humidity bands", () => {
		const actual = logic.segmentGeometry(HUMIDITY.bands, HUMIDITY.min, HUMIDITY.max);
		assertSegments(actual, expected([10 / 60, 30 / 60, 10 / 60, 10 / 60]));
	});

	it("starts the first segment on min and ends the last on max", () => {
		const actual = logic.segmentGeometry(HUMIDITY.bands, HUMIDITY.min, HUMIDITY.max);
		const last = actual[actual.length - 1];
		assertClose(actual[0].dashOffset, -2.5, "offset of the first segment");
		assertClose(-last.dashOffset - 2.5 + last.dashLength + 5, L, "end of the last segment");
	});

	it("cuts a band that reaches beyond max at max", () => {
		const bands = [{to: 1000}, {to: 3000}];
		const actual = logic.segmentGeometry(bands, 400, 2500);
		assertSegments(actual, expected([600 / 2100, 1500 / 2100]));
	});

	it("draws nothing without bands", () => {
		assert.deepEqual(logic.segmentGeometry([], 0, 100), []);
	});

	it("draws a band narrower than the gap with length 0", () => {
		// 1 of 1000 is 0.37 units of the arc, less than the 5 unit gap.
		const bands = [{to: 1}, {to: 1000}];
		const actual = logic.segmentGeometry(bands, 0, 1000);
		assert.equal(actual[0].dashLength, 0);
		assertClose(actual[1].dashLength, (999 / 1000) * L - 5, "dash length of the wide segment");
	});

	it("draws a band that does not ascend with length 0", () => {
		const bands = [{to: 60}, {to: 40}, {to: 100}];
		const actual = logic.segmentGeometry(bands, 0, 100);
		assert.equal(actual[1].dashLength, 0);
	});
});

describe("bandProblems", () => {
	it("finds none in the bands of the design", () => {
		assert.deepEqual(logic.bandProblems(CO2.bands, CO2.max), []);
		assert.deepEqual(logic.bandProblems(HUMIDITY.bands, HUMIDITY.max), []);
	});

	it("accepts a last band beyond max", () => {
		const bands = [{to: 50, level: "good"}, {to: 120, level: "bad"}];
		assert.deepEqual(logic.bandProblems(bands, 100), []);
	});

	it("reports missing bands once", () => {
		assert.deepEqual(logic.bandProblems([], 100), ["no bands configured"]);
		assert.deepEqual(logic.bandProblems(undefined, 100), ["no bands configured"]);
		assert.deepEqual(logic.bandProblems({to: 100}, 100), ["no bands configured"]);
	});

	it("reports bands that do not ascend", () => {
		const bands = [
			{to: 60, level: "good"},
			{to: 40, level: "warn"},
			{to: 100, level: "bad"}
		];
		assert.deepEqual(logic.bandProblems(bands, 100), ["band 1: `to` 40 does not ascend from 60"]);
	});

	it("reports a band equal to the one before", () => {
		const bands = [{to: 50, level: "good"}, {to: 50, level: "warn"}, {to: 100, level: "bad"}];
		assert.deepEqual(logic.bandProblems(bands, 100), ["band 1: `to` 50 does not ascend from 50"]);
	});

	it("reports bands that end before max", () => {
		const bands = [{to: 1000, level: "good"}, {to: 2000, level: "warn"}];
		assert.deepEqual(logic.bandProblems(bands, 2500), ["bands end at 2000, before max 2500"]);
	});

	it("reports an unknown level", () => {
		const bands = [{to: 50, level: "good"}, {to: 100, level: "critical"}];
		assert.deepEqual(logic.bandProblems(bands, 100), [
			'band 1: unknown level "critical", expected one of good, warn, bad'
		]);
	});

	it("reports a missing level", () => {
		const bands = [{to: 100}];
		assert.deepEqual(logic.bandProblems(bands, 100), [
			"band 0: unknown level undefined, expected one of good, warn, bad"
		]);
	});

	it("reports a `to` that is not a number", () => {
		const bands = [{to: "50", level: "good"}, {to: 100, level: "bad"}];
		assert.deepEqual(logic.bandProblems(bands, 100), ["band 0: `to` is not a number"]);
	});

	it("reports bands that end before max after a last `to` that is not a number", () => {
		const bands = [{to: 50, level: "good"}, {To: 100, level: "bad"}];
		assert.deepEqual(logic.bandProblems(bands, 100), [
			"band 1: `to` is not a number",
			"bands end at 50, before max 100"
		]);
	});

	it("reports a band that is not an object", () => {
		const bands = [null, {to: 100, level: "bad"}];
		assert.deepEqual(logic.bandProblems(bands, 100), ["band 0 is not an object"]);
	});

	it("reports every problem of one configuration", () => {
		const bands = [{to: 60, level: "good"}, {to: 40, level: "red"}];
		assert.deepEqual(logic.bandProblems(bands, 100), [
			"band 1: `to` 40 does not ascend from 60",
			'band 1: unknown level "red", expected one of good, warn, bad',
			"bands end at 40, before max 100"
		]);
	});
});

describe("roundToDecimals", () => {
	const cases = [
		["up to the next band limit", 59.6, 0, 60],
		["down", 59.4, 0, 59],
		["half away from zero", 23.5, 0, 24],
		["negative half away from zero", -0.5, 0, -1],
		["with decimals", 59.95, 1, 60],
		["unchanged with enough decimals", 21.25, 2, 21.25]
	];
	for (const [name, value, decimals, expected] of cases) {
		it(`${name}: ${value} with ${decimals} decimals is ${expected}`, () => {
			assert.equal(logic.roundToDecimals(value, decimals), expected);
		});
	}
});

describe("markerAngle", () => {
	const cases = [
		["CO₂ below min", CO2, 0, 135],
		["CO₂ on min", CO2, 400, 135],
		["CO₂ inside", CO2, 1450, 270],
		["CO₂ on max", CO2, 2500, 405],
		["CO₂ above max", CO2, 9999, 405],
		["humidity below min", HUMIDITY, -10, 135],
		["humidity on min", HUMIDITY, 20, 135],
		["humidity inside", HUMIDITY, 40, 225],
		["humidity on max", HUMIDITY, 80, 405],
		["humidity above max", HUMIDITY, 100, 405]
	];
	for (const [name, gauge, value, expected] of cases) {
		it(`${name} (${value}) sits at ${expected}°`, () => {
			assertClose(logic.markerAngle(value, gauge.min, gauge.max), expected, "angle");
		});
	}
});
