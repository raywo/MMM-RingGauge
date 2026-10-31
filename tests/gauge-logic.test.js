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
			assert.equal(logic.bandIndex(gauge.bands, value), expected);
		});
	}

	it("returns -1 without bands", () => {
		assert.equal(logic.bandIndex([], 50), -1);
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

describe("isStale", () => {
	const reported = 1_000_000;
	const minute = 60 * 1000;

	it("is fresh while younger than staleAfter", () => {
		assert.equal(logic.isStale(reported, 10 * minute, reported + 5 * minute), false);
	});

	it("is fresh exactly at staleAfter", () => {
		assert.equal(logic.isStale(reported, 10 * minute, reported + 10 * minute), false);
	});

	it("is stale once older than staleAfter", () => {
		assert.equal(logic.isStale(reported, 10 * minute, reported + 10 * minute + 1), true);
	});

	it("never turns stale without staleAfter", () => {
		const hours = 24 * 60 * minute;
		assert.equal(logic.isStale(reported, undefined, reported + hours), false);
		assert.equal(logic.isStale(reported, null, reported + hours), false);
	});
});
