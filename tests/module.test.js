const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const REPO_ROOT = path.join(__dirname, "..");
const MODULE_NAME = "MMM-RingGauge";

function read(file) {
	return fs.readFileSync(path.join(REPO_ROOT, file), "utf8");
}

/**
 * Loads the browser side the way MagicMirror² loads it into the page and
 * returns the definitions passed to `Module.register`, by name.
 */
function loadModule() {
	const modules = {};
	const context = vm.createContext({
		Module: {
			register: (name, definition) => {
				modules[name] = definition;
			}
		}
	});
	vm.runInContext(read(`${MODULE_NAME}.js`), context, {filename: `${MODULE_NAME}.js`});
	return modules;
}

/**
 * The part of the DOM the module uses: enough to build the gauge and read
 * back what it shows, without a browser.
 */
class FakeElement {
	constructor(name) {
		this.name = name;
		this.attributes = {};
		this.children = [];
		this.classes = new Set();
		this.style = {};
		this.textContent = "";
		this.innerHTML = "";
		this.classList = {
			add: (name) => this.classes.add(name),
			toggle: (name, force) => (force ? this.classes.add(name) : this.classes.delete(name))
		};
	}

	set className(value) {
		this.classes = new Set(value.split(" ").filter(Boolean));
	}

	get className() {
		return [...this.classes].join(" ");
	}

	setAttribute(key, value) {
		if (key === "class") {
			this.className = value;
		}
		this.attributes[key] = String(value);
	}

	appendChild(child) {
		this.children.push(child);
	}

	insertBefore(child, reference) {
		const index = this.children.indexOf(reference);
		this.children.splice(index === -1 ? this.children.length : index, 0, child);
	}

	removeChild(child) {
		this.children.splice(this.children.indexOf(child), 1);
	}

	append(...children) {
		this.children.push(...children);
	}

	find(className) {
		if (this.classes.has(className)) {
			return this;
		}
		for (const child of this.children) {
			const found = child.find(className);
			if (found) {
				return found;
			}
		}
		return null;
	}
}

// The mapping the tests use unless they pass their own.
const READING = {notification: "TEST_READING", match: {id: "x"}, fields: {value: "value"}};
// The mapping with a scale, for tests of a reading without a preset.
const BY_PATHS = {...READING, min: 0, max: 100};

/**
 * Starts one instance in the browser side with the module's defaults and
 * the given config, on a clock the test moves with `advance()`; returns
 * it, every message it logged and the clock. `mirror` holds the global
 * config.js options `units` and `language`; without `language`, texts
 * show as their translation keys.
 */
function startInstance(instanceConfig, mirror = {}) {
	const {language, ...globals} = mirror;
	const translations = language === undefined ? {} : JSON.parse(read(`translations/${language}.json`));
	const logged = [];
	const record = (level) => (message) => logged.push({level, message});
	const clock = {now: Date.UTC(2026, 0, 15, 12, 0, 0), timers: new Map(), nextId: 1};
	const context = vm.createContext({
		Module: {
			register: (_name, definition) => {
				context.definition = definition;
			}
		},
		Log: {error: record("error"), warn: record("warn"), info: record("info"), log: record("log")},
		config: {locale: "en", units: "metric", ...globals},
		Date: {now: () => clock.now},
		document: {
			createElement: (name) => new FakeElement(name),
			createElementNS: (_namespace, name) => new FakeElement(name)
		},
		setTimeout: (callback, delay) => {
			const id = clock.nextId++;
			clock.timers.set(id, {callback, at: clock.now + delay});
			return id;
		},
		clearTimeout: (id) => clock.timers.delete(id),
		requestAnimationFrame: () => 0,
		cancelAnimationFrame: () => {},
		performance: {now: () => 0}
	});
	vm.runInContext(read("gauge-logic.js"), context, {filename: "gauge-logic.js"});
	vm.runInContext(read("source-mapping.js"), context, {filename: "source-mapping.js"});
	vm.runInContext(read("presets.js"), context, {filename: "presets.js"});
	vm.runInContext(read(`${MODULE_NAME}.js`), context, {filename: `${MODULE_NAME}.js`});
	const {definition} = context;
	const instance = Object.assign(Object.create(definition), {
		name: MODULE_NAME,
		identifier: "module_0_MMM-RingGauge",
		config: {...definition.defaults, ...instanceConfig},
		// MagicMirror² returns the key itself for a key without a text.
		translate: (key) => translations[key] ?? key
	});
	instance.start();
	instance.getDom();
	return {instance, logged, clock};
}

// Moves the clock and runs the timers that fall due, as the browser would.
function advance(clock, ms) {
	const until = clock.now + ms;
	for (;;) {
		const due = [...clock.timers.entries()].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at);
		if (due.length === 0) {
			break;
		}
		const [id, timer] = due[0];
		clock.timers.delete(id);
		clock.now = timer.at;
		timer.callback();
	}
	clock.now = until;
}

function receive(instance, value) {
	instance.notificationReceived("TEST_READING", {id: "x", value});
}

// What the gauge shows: value, unit, status word, the lost-connection
// symbol and whether it is dimmed.
function shown(instance) {
	const root = instance.dom.root;
	return {
		value: root.find("ring-gauge-value").textContent,
		unit: root.find("ring-gauge-unit").textContent,
		status: root.find("ring-gauge-status").style.display === "none" ? null : root.find("ring-gauge-status").textContent,
		symbol: root.find("ring-gauge-unavailable-icon").style.display !== "none",
		dimmed: root.classes.has("ring-gauge-unavailable"),
		marker: root.find("ring-gauge-marker").style.display !== "none"
	};
}

describe(MODULE_NAME, () => {
	it("registers under the name of its directory", () => {
		assert.deepEqual(Object.keys(loadModule()), [MODULE_NAME]);
	});

	it("loads its logic file through getScripts()", () => {
		const definition = loadModule()[MODULE_NAME];
		const scripts = definition.getScripts.call({file: (name) => name});
		// Copied: an array from the vm context has another prototype.
		assert.deepEqual([...scripts], ["gauge-logic.js", "source-mapping.js", "presets.js"]);
		for (const script of scripts) {
			assert.ok(fs.existsSync(path.join(REPO_ROOT, script)));
		}
	});

	it("has no node_helper", () => {
		assert.equal(fs.existsSync(path.join(REPO_ROOT, "node_helper.js")), false);
	});

	it("has no dependencies", () => {
		const pkg = JSON.parse(read("package.json"));
		assert.equal(pkg.dependencies, undefined);
		assert.equal(pkg.devDependencies, undefined);
	});

	describe("with missing or invalid bands", () => {
		it("shows value and marker without bands and logs one error", () => {
			const {instance, logged} = startInstance({...BY_PATHS, label: "CO₂"});
			receive(instance, 42);
			receive(instance, 43);
			const root = instance.getDom();
			assert.equal(root.find("ring-gauge-value").textContent, "43");
			assert.equal(root.find("ring-gauge-marker").style.display, "");
			assert.ok(root.find("ring-gauge-marker").attributes.cx);
			assert.equal(root.find("ring-gauge-status").textContent, "");
			assert.deepEqual(logged, [{level: "error", message: `${MODULE_NAME} (CO₂): no bands configured`}]);
		});

		it("names the instance by its notification without a label", () => {
			const {logged} = startInstance({...BY_PATHS, bands: undefined});
			assert.deepEqual(logged, [{level: "error", message: `${MODULE_NAME} (TEST_READING): no bands configured`}]);
		});

		it("logs each problem once, however many readings arrive", () => {
			const bands = [
				{to: 60, level: "good", text: "Fine"},
				{to: 40, level: "critical", text: "Odd"}
			];
			const {instance, logged} = startInstance({...BY_PATHS, label: "X", bands});
			for (const value of [10, 50, 90]) {
				receive(instance, value);
			}
			assert.deepEqual(
				logged.map((entry) => entry.message),
				[
					`${MODULE_NAME} (X): band 1: \`to\` 40 does not ascend from 60`,
					`${MODULE_NAME} (X): band 1: unknown level "critical", expected one of good, warn, bad`,
					`${MODULE_NAME} (X): bands end at 40, before max 100`
				]
			);
		});

		it("shows the text of a band with an unknown level without its color", () => {
			const bands = [{to: 100, level: "critical", text: "Odd"}];
			const {instance} = startInstance({...BY_PATHS, bands});
			receive(instance, 50);
			const status = instance.getDom().find("ring-gauge-status");
			assert.equal(status.textContent, "Odd");
			assert.equal(status.className, "ring-gauge-status");
		});

		it("draws a band narrower than the gap with length 0", () => {
			const bands = [
				{to: 1, level: "good", text: "A"},
				{to: 100, level: "bad", text: "B"}
			];
			const {instance} = startInstance({...BY_PATHS, bands});
			const segment = instance.getDom().find("ring-gauge-segment");
			assert.equal(segment.attributes["stroke-dasharray"], "0 1000");
		});

		it("leaves out a band whose `to` is not a number", () => {
			const bands = [
				{to: 50, level: "good", text: "A"},
				{To: 70, level: "warn", text: "B"},
				{to: 100, level: "bad", text: "C"}
			];
			const {instance} = startInstance({...BY_PATHS, bands});
			const svg = instance.getDom().find("ring-gauge-scale");
			const segments = svg.children.filter((child) => child.classes.has("ring-gauge-segment"));
			assert.equal(segments.length, 2);
			for (const segment of segments) {
				assert.doesNotMatch(segment.attributes["stroke-dasharray"], /NaN/);
				assert.doesNotMatch(segment.attributes["stroke-dashoffset"], /NaN/);
			}
		});

		it("shows no band beyond a dropped last band", () => {
			const bands = [
				{to: 50, level: "good", text: "Good"},
				{To: 100, level: "bad", text: "Bad"}
			];
			const {instance, logged} = startInstance({...BY_PATHS, label: "X", bands});
			receive(instance, 90);
			const root = instance.getDom();
			const status = root.find("ring-gauge-status");
			assert.equal(status.textContent, "");
			assert.equal(status.className, "ring-gauge-status");
			assert.equal(root.find("ring-gauge-segment").classes.has("ring-gauge-active"), false);
			assert.equal(root.find("ring-gauge-value").textContent, "90");
			assert.deepEqual(
				logged.map((entry) => entry.message),
				[`${MODULE_NAME} (X): band 1: \`to\` is not a number`, `${MODULE_NAME} (X): bands end at 50, before max 100`]
			);
		});

		it("logs nothing for valid bands", () => {
			const bands = [
				{to: 50, level: "good", text: "Good"},
				{to: 100, level: "bad", text: "Bad"}
			];
			const {instance, logged} = startInstance({...BY_PATHS, bands});
			receive(instance, 70);
			assert.equal(instance.getDom().find("ring-gauge-status").textContent, "Bad");
			assert.deepEqual(logged, []);
		});
	});

	it("requires MagicMirror² 2.36.0, as README and CLAUDE.md state", () => {
		const {requiresVersion} = loadModule()[MODULE_NAME];
		assert.equal(requiresVersion, "2.36.0");
		assert.match(read("README.md"), /MagicMirror² 2\.36\.0 or newer/);
		assert.match(read("CLAUDE.md"), /MagicMirror² 2\.36\.0/);
	});

	it("names no source in its code or defaults", () => {
		for (const file of [`${MODULE_NAME}.js`, "source-mapping.js", "gauge-logic.js", "presets.js"]) {
			assert.doesNotMatch(read(file), /home.?assistant|HOME_ASSISTANT|entity_id|sensor\./i, file);
		}
		const {defaults} = loadModule()[MODULE_NAME];
		assert.equal(defaults.notification, "");
		assert.deepEqual({...defaults.fields}, {});
		assert.equal(defaults.match, null);
		assert.equal(defaults.connection, null);
		assert.equal(defaults.staleAfter, null);
		for (const removed of ["host", "port", "useTLS", "token", "entity", "updateInterval"]) {
			assert.equal(removed in defaults, false, removed);
		}
	});

	describe("mapping", () => {
		it("shows the reading of its notification", () => {
			const {instance} = startInstance({...BY_PATHS, fields: {value: "value", unit: "u"}, unit: "%"});
			instance.notificationReceived("TEST_READING", {id: "x", value: "812", u: "ppm"});
			assert.deepEqual(shown(instance), {
				value: "812",
				unit: "ppm",
				status: "",
				symbol: false,
				dimmed: false,
				marker: true
			});
		});

		it("ignores another notification and a non-matching payload", () => {
			const {instance} = startInstance(BY_PATHS);
			instance.notificationReceived("OTHER_READING", {id: "x", value: 5});
			instance.notificationReceived("TEST_READING", {id: "y", value: 5});
			assert.equal(shown(instance).value, "—");
		});

		it("shows the reading a transform returns", () => {
			const {instance} = startInstance({
				notification: "TEST_READING",
				transform: (payload) => (payload.id === "x" ? {value: payload.value * 2} : null),
				unit: "ppm"
			});
			instance.notificationReceived("TEST_READING", {id: "y", value: 1});
			assert.equal(shown(instance).value, "—");
			instance.notificationReceived("TEST_READING", {id: "x", value: 21});
			assert.deepEqual([shown(instance).value, shown(instance).unit], ["42", "ppm"]);
		});

		it("keeps going when a transform throws and logs it once", () => {
			const {instance, logged} = startInstance({
				notification: "TEST_READING",
				label: "CO₂",
				min: 0,
				max: 100,
				bands: [{to: 100, level: "good", text: "Gut"}],
				transform: (payload) => {
					if (payload.value === "bad") {
						throw new Error("cannot read");
					}
					return {value: payload.value};
				}
			});
			instance.notificationReceived("TEST_READING", {value: 7});
			instance.notificationReceived("TEST_READING", {value: "bad"});
			instance.notificationReceived("TEST_READING", {value: "bad"});
			assert.deepEqual(shown(instance), {
				value: "7",
				unit: "",
				status: "Gut",
				symbol: false,
				dimmed: false,
				marker: true
			});
			assert.deepEqual(logged, [{level: "error", message: `${MODULE_NAME} (CO₂): \`transform\` threw: Error: cannot read`}]);
		});

		it("logs missing required options once at start, naming the instance", () => {
			const {instance, logged} = startInstance({label: "CO₂", min: 0, max: 100, bands: [{to: 100, level: "good", text: "Gut"}]});
			instance.notificationReceived("", {});
			assert.deepEqual(
				logged.map((entry) => entry.message),
				[`${MODULE_NAME} (CO₂): \`notification\` is missing`, `${MODULE_NAME} (CO₂): neither \`fields.value\` nor \`transform\` is set`]
			);
		});

		it("logs a missing path once, naming the instance and the path", () => {
			const {instance, logged} = startInstance({
				...BY_PATHS,
				label: "CO₂",
				bands: [{to: 100, level: "good", text: "Gut"}],
				fields: {value: "value", reportedAt: "time"}
			});
			receive(instance, 1);
			receive(instance, 2);
			assert.equal(shown(instance).value, "2");
			assert.deepEqual(logged, [
				{level: "error", message: `${MODULE_NAME} (CO₂): path "time" of \`fields.reportedAt\` not found in TEST_READING`}
			]);
		});
	});

	describe("availability", () => {
		const minute = 60 * 1000;
		const bands = [
			{to: 50, level: "good", text: "Good"},
			{to: 100, level: "bad", text: "Bad"}
		];
		const LOST = {value: "42", unit: "ppm", status: null, symbol: true, dimmed: true, marker: true};
		const SHOWN = {value: "42", unit: "ppm", status: "Good", symbol: false, dimmed: false, marker: true};
		const CONNECTION = {notification: "TEST_LINK", match: {hub: "a"}, connected: "up", graceAfter: 30000};

		function link(instance, up) {
			instance.notificationReceived("TEST_LINK", {hub: "a", up});
		}

		function gauge(extra = {}) {
			return startInstance({
				...BY_PATHS,
				fields: {value: "value", available: "ok", reportedAt: "at"},
				unit: "ppm",
				bands,
				connection: CONNECTION,
				...extra
			});
		}

		it("dims the last value once the connection is lost for graceAfter", () => {
			const {instance, clock} = gauge();
			receive(instance, 42);
			link(instance, false);
			advance(clock, 29999);
			assert.deepEqual(shown(instance), SHOWN);
			advance(clock, 1);
			assert.deepEqual(shown(instance), LOST);
			const active = instance.dom.segments[0];
			assert.equal(active.classes.has("ring-gauge-active"), true);
		});

		it("changes nothing for a lost connection shorter than graceAfter", () => {
			const {instance, clock} = gauge();
			receive(instance, 42);
			link(instance, false);
			advance(clock, 20000);
			link(instance, true);
			advance(clock, 60000);
			assert.deepEqual(shown(instance), SHOWN);
		});

		it("dims the last value for `available: false` and keeps it", () => {
			const {instance} = gauge();
			receive(instance, 42);
			instance.notificationReceived("TEST_READING", {id: "x", value: 99, ok: false});
			assert.deepEqual(shown(instance), LOST);
		});

		it("dims the last value for a value that is not a number and keeps it", () => {
			const {instance} = gauge();
			receive(instance, 42);
			receive(instance, "unavailable");
			assert.deepEqual(shown(instance), LOST);
		});

		it("dims the last value once older than staleAfter", () => {
			const {instance, clock} = gauge({staleAfter: 10 * minute});
			receive(instance, 42);
			advance(clock, 10 * minute);
			assert.deepEqual(shown(instance), SHOWN);
			advance(clock, 1);
			assert.deepEqual(shown(instance), LOST);
		});

		it("measures the age from the report time the source sends", () => {
			const {instance, clock} = gauge({staleAfter: 10 * minute});
			instance.notificationReceived("TEST_READING", {id: "x", value: 42, at: clock.now - 9 * minute});
			assert.deepEqual(shown(instance), SHOWN);
			advance(clock, minute + 1);
			assert.deepEqual(shown(instance), LOST);
		});

		it("never sets a timer beyond what setTimeout can hold", () => {
			// A longer delay overflows and fires at once: the gauge would
			// recheck in a busy loop.
			const maxDelay = 2 ** 31 - 1;
			const {instance, clock} = gauge({staleAfter: 60 * 24 * 60 * minute});
			receive(instance, 42);
			for (const timer of clock.timers.values()) {
				assert.ok(timer.at - clock.now <= maxDelay);
			}
			advance(clock, 60 * 24 * 60 * minute);
			assert.deepEqual(shown(instance), SHOWN);
			advance(clock, 1);
			assert.deepEqual(shown(instance), LOST);
		});

		it("keeps a value that stays the same valid for hours without staleAfter", () => {
			const {instance, clock} = gauge();
			receive(instance, 42);
			advance(clock, 12 * 60 * minute);
			assert.deepEqual(shown(instance), SHOWN);
			assert.equal(clock.timers.size, 0);
		});

		it("ends the state with the next valid reading", () => {
			const {instance, clock} = gauge();
			receive(instance, 42);
			link(instance, false);
			advance(clock, 30000);
			assert.deepEqual(shown(instance), LOST);
			receive(instance, 60);
			assert.deepEqual(shown(instance), {...SHOWN, value: "60", status: "Bad"});
		});

		it("ends the state with `connected: true` unless the reading says unavailable", () => {
			const {instance, clock} = gauge();
			receive(instance, 42);
			link(instance, false);
			advance(clock, 30000);
			link(instance, true);
			assert.deepEqual(shown(instance), SHOWN);

			instance.notificationReceived("TEST_READING", {id: "x", value: 42, ok: false});
			link(instance, true);
			assert.deepEqual(shown(instance), LOST);
		});

		it("does not end staleness with `connected: true`", () => {
			const {instance, clock} = gauge({staleAfter: minute});
			receive(instance, 42);
			advance(clock, minute + 1);
			link(instance, true);
			assert.deepEqual(shown(instance), LOST);
		});

		it("shows — without a symbol before any valid value", () => {
			const {instance, clock} = gauge();
			link(instance, false);
			advance(clock, 60000);
			receive(instance, "unavailable");
			assert.deepEqual(shown(instance), {
				value: "—",
				unit: "ppm",
				status: "",
				symbol: false,
				dimmed: false,
				marker: false
			});
		});
	});

	describe("presets and units", () => {
		const TEMPERATURE = {...READING, quantity: "temperature", unit: "°C"};
		const segments = (instance) => instance.dom.segments.length;
		const label = (instance) => instance.dom.label.textContent;
		const icon = (instance) => (instance.dom.icon.style.display === "none" ? "" : instance.dom.icon.innerHTML);
		const marker = (instance) => {
			const {attributes} = instance.dom.marker;
			return [attributes.cx, attributes.cy];
		};

		it("takes scale, bands, icon and label from the preset of the `quantity` option", () => {
			const {instance, logged} = startInstance({...READING, quantity: "carbon_dioxide", unit: "ppm"}, {language: "en"});
			receive(instance, 1200);
			assert.deepEqual([label(instance), segments(instance), shown(instance).status], ["CO₂", 3, "Ventilate"]);
			assert.match(icon(instance), /circle/);
			assert.deepEqual([instance.settings.min, instance.settings.max], [400, 2500]);
			assert.deepEqual(logged, []);
		});

		it("assesses the value it shows: rounded to `decimals`, the marker stays exact", () => {
			// 59.6 % shows as "60", which belongs to the band from 60 on.
			const {instance} = startInstance({...READING, quantity: "humidity", unit: "%"}, {language: "en"});
			receive(instance, 59.6);
			assert.deepEqual([shown(instance).value, shown(instance).status], ["60", "Too humid"]);
			assert.equal(instance.markerAngle, 135 + ((59.6 - 20) / (80 - 20)) * 270);
			receive(instance, 59.4);
			assert.deepEqual([shown(instance).value, shown(instance).status], ["59", "Optimal"]);
		});

		it("takes the preset of a quantity from the payload once a reading brings it", () => {
			const {instance, logged} = startInstance(
				{...READING, fields: {value: "value", quantity: "kind", unit: "unit"}},
				{language: "en"}
			);
			assert.deepEqual(logged, []);
			instance.notificationReceived("TEST_READING", {id: "x", value: 45, kind: "humidity", unit: "%"});
			assert.deepEqual([label(instance), segments(instance), shown(instance).status], ["Humidity", 4, "Optimal"]);
			assert.equal(instance.dom.root.find("ring-gauge-scale").children.at(-1), instance.dom.marker);
			assert.deepEqual(logged, []);
		});

		it("keeps the settings of the last valid reading while an unavailable one lacks quantity and unit", () => {
			const {instance, logged} = startInstance(
				{...READING, fields: {value: "value", quantity: "kind", unit: "unit"}},
				{units: "metric", language: "en"}
			);
			instance.notificationReceived("TEST_READING", {id: "x", value: 70, kind: "temperature", unit: "°F"});
			instance.notificationReceived("TEST_READING", {id: "x", value: "unavailable", kind: "", unit: ""});
			assert.deepEqual([shown(instance).value, shown(instance).unit, shown(instance).dimmed], ["21", "°C", true]);
			assert.deepEqual([label(instance), segments(instance)], ["Temperature", 5]);
			assert.deepEqual(logged, []);
		});

		it("logs a missing `min` or `max` without a preset and shows the value without a marker", () => {
			const bands = [{to: 100, level: "good", text: "Fine"}];
			const {instance, logged} = startInstance({...READING, label: "X", max: 100, bands});
			receive(instance, 50);
			assert.deepEqual([shown(instance).value, shown(instance).marker, shown(instance).status], ["50", false, ""]);
			assert.deepEqual(logged, [{level: "error", message: `${MODULE_NAME} (X): \`min\` is not set, and without a quantity`}]);

			const other = startInstance({...READING, label: "X", quantity: "pressure", min: 0, bands});
			assert.deepEqual(other.logged.map((entry) => entry.message), [
				`${MODULE_NAME} (X): \`max\` is not set, and quantity "pressure" has no preset`
			]);
		});

		for (const [name, quantity] of [["an unknown", "pressure"], ["a missing", ""]]) {
			it(`needs min, max and bands from the config for ${name} quantity`, () => {
				const {instance, logged} = startInstance({...READING, label: "X", quantity});
				receive(instance, 50);
				assert.deepEqual([shown(instance).value, segments(instance), label(instance)], ["50", 0, "X"]);
				const without = quantity === "" ? "without a quantity" : `quantity "${quantity}" has no preset`;
				assert.deepEqual(logged.map((entry) => entry.message), [
					`${MODULE_NAME} (X): \`min\` is not set, and ${without}`,
					`${MODULE_NAME} (X): \`max\` is not set, and ${without}`,
					`${MODULE_NAME} (X): no bands configured`
				]);
			});
		}

		it("lets each option of the config override its part of the preset", () => {
			const {instance, logged} = startInstance(
				{...READING, quantity: "humidity", label: "Bath", icon: "co2", min: 30, max: 70, bands: [{to: 70, level: "good"}]},
				{language: "en"}
			);
			receive(instance, 50);
			assert.equal(label(instance), "Bath");
			assert.match(icon(instance), /circle/);
			assert.deepEqual([instance.settings.min, instance.settings.max], [30, 70]);
			// Halfway along the arc: straight up.
			assert.deepEqual(marker(instance), ["105.00", "27.00"]);
			assert.deepEqual(logged, []);

			const hidden = startInstance({...READING, quantity: "humidity", label: "", icon: ""}, {language: "en"}).instance;
			assert.deepEqual([label(hidden), icon(hidden), segments(hidden)], ["", "", 4]);
		});

		it("replaces the preset's bands as a whole with bands from the config", () => {
			const bands = [
				{to: 1500, level: "good", text: "Fine"},
				{to: 2500, level: "bad"}
			];
			const {instance} = startInstance({...READING, quantity: "carbon_dioxide", bands}, {language: "en"});
			receive(instance, 1000);
			assert.deepEqual([segments(instance), shown(instance).status], [2, "Fine"]);
			// A band from the config without `text` shows no status word.
			receive(instance, 2000);
			assert.equal(shown(instance).status, "");
		});

		it("shows a °C reading in °F on an imperial mirror", () => {
			const {instance, logged} = startInstance(TEMPERATURE, {units: "imperial", language: "en"});
			receive(instance, 20);
			assert.deepEqual([shown(instance).value, shown(instance).unit, shown(instance).status], ["68", "°F", "Comfortable"]);
			assert.deepEqual([instance.settings.min, instance.settings.max], [50, 86]);
			assert.deepEqual(logged, []);
		});

		it("shows a °F reading in °C on a metric mirror", () => {
			const {instance} = startInstance({...TEMPERATURE, unit: "°F"}, {units: "metric", language: "en"});
			receive(instance, 50);
			assert.deepEqual([shown(instance).value, shown(instance).unit, shown(instance).status], ["10", "°C", "Too cold"]);
		});

		it("shows °C before the first reading on a metric mirror", () => {
			const {instance} = startInstance({...TEMPERATURE, unit: "°F"});
			assert.deepEqual([shown(instance).value, shown(instance).unit], ["—", "°C"]);
		});

		it("puts the marker at the same place with the same status on a metric and an imperial mirror", () => {
			for (const reading of [9, 15.9, 16, 21.5, 26.99, 27, 31]) {
				const metric = startInstance(TEMPERATURE, {units: "metric", language: "en"}).instance;
				const imperial = startInstance(TEMPERATURE, {units: "imperial", language: "en"}).instance;
				receive(metric, reading);
				receive(imperial, reading);
				assert.deepEqual(marker(imperial), marker(metric), String(reading));
				assert.equal(shown(imperial).status, shown(metric).status, String(reading));
			}
		});

		it("gives a °F reading at a band limit the same status on a metric and an imperial mirror", () => {
			for (const [reading, status] of [[60.8, "Cool"], [80.6, "Too warm"]]) {
				const metric = startInstance({...TEMPERATURE, unit: "°F"}, {units: "metric", language: "en"}).instance;
				const imperial = startInstance({...TEMPERATURE, unit: "°F"}, {units: "imperial", language: "en"}).instance;
				receive(metric, reading);
				receive(imperial, reading);
				assert.equal(shown(metric).status, status, String(reading));
				assert.equal(shown(imperial).status, status, String(reading));
			}
		});

		it("follows the `units` option over the mirror's `units`", () => {
			const {instance} = startInstance({...TEMPERATURE, units: "imperial"}, {units: "metric"});
			receive(instance, 20);
			assert.deepEqual([shown(instance).value, shown(instance).unit], ["68", "°F"]);
		});

		it("logs `units` that are neither metric nor imperial and shows metric", () => {
			const {instance, logged} = startInstance({...TEMPERATURE, label: "X", units: "kelvin"});
			receive(instance, 20);
			assert.deepEqual([shown(instance).value, shown(instance).unit], ["20", "°C"]);
			assert.deepEqual(logged, [
				{level: "error", message: `${MODULE_NAME} (X): \`units\` "kelvin" is neither "metric" nor "imperial"; showing metric`}
			]);
		});

		it("takes `min`, `max` and `bands` from the config in the displayed unit", () => {
			const bands = [
				{to: 70, level: "good", text: "Below"},
				{to: 90, level: "bad", text: "Above"}
			];
			const {instance, logged} = startInstance({...TEMPERATURE, min: 50, max: 90, bands, decimals: 1}, {units: "imperial"});
			// 21 °C is 69.8 °F, 22 °C is 71.6 °F; one decimal keeps 69.8 below 70.
			receive(instance, 21);
			assert.equal(shown(instance).status, "Below");
			receive(instance, 22);
			assert.equal(shown(instance).status, "Above");
			assert.deepEqual(logged, []);
		});

		it("shows a temperature in an unknown unit as reported, without preset, and names the unit", () => {
			const {instance, logged} = startInstance({...TEMPERATURE, label: "X", unit: "K"}, {units: "imperial"});
			receive(instance, 293);
			assert.deepEqual([shown(instance).value, shown(instance).unit, segments(instance)], ["293", "K", 0]);
			assert.deepEqual(logged[0], {
				level: "warn",
				message: `${MODULE_NAME} (X): temperature in unit "K" is shown as reported, without conversion and without preset`
			});
		});

		it("leaves quantities with the same unit in both systems as they are", () => {
			const {instance} = startInstance({...READING, quantity: "humidity", unit: "%"}, {units: "imperial"});
			receive(instance, 45);
			assert.deepEqual([shown(instance).value, shown(instance).unit], ["45", "%"]);
			assert.deepEqual([instance.settings.min, instance.settings.max], [20, 80]);
		});

		for (const [language, expected] of [
			["en", ["Temperature", "Comfortable"]],
			["de", ["Temperatur", "Angenehm"]]
		]) {
			it(`shows the preset texts in the mirror's language: ${language}`, () => {
				const {instance} = startInstance(TEMPERATURE, {language});
				receive(instance, 21);
				assert.deepEqual([label(instance), shown(instance).status], expected);
			});
		}

		it("has every preset text in every translation file", () => {
			const {PRESETS} = require("../presets.js");
			const keys = Object.values(PRESETS).flatMap((preset) => [preset.label, ...preset.bands.map((band) => band.text)]);
			const languages = fs.readdirSync(path.join(REPO_ROOT, "translations"));
			const translate = loadModule()[MODULE_NAME].getTranslations();
			assert.deepEqual(Object.keys(translate).map((language) => `${language}.json`).sort(), [...languages].sort());
			for (const file of languages) {
				const texts = JSON.parse(read(`translations/${file}`));
				assert.deepEqual(Object.keys(texts).sort(), [...keys].sort(), file);
				for (const key of keys) {
					assert.ok(texts[key].trim() !== "", `${file}: ${key}`);
				}
			}
		});
	});

	describe("README, Advanced: mapping function", () => {
		const section = read("README.md").split("## Advanced: mapping function")[1].split("\n## ")[0];
		const blocks = (language) =>
			[...section.matchAll(new RegExp("```" + language + "\\n([\\s\\S]*?)```", "g"))].map((match) => match[1]);
		const payloads = blocks("json").map((block) => JSON.parse(block));

		// MagicMirror² 2.36 sends functions to the browser as their source
		// text and rebuilds them there (js/server.js, js/main.js): nothing of
		// config.js but the function itself survives.
		function viaMagicMirror(value) {
			const json = JSON.stringify(value, (_key, item) => (typeof item === "function" ? {__mmFunction: item.toString()} : item));
			return JSON.parse(json, (_key, item) => {
				if (item && typeof item === "object" && typeof item.__mmFunction === "string") {
					return vm.runInNewContext('new Function("return (" + source + ")")()', {source: item.__mmFunction});
				}
				return item;
			});
		}

		// The module entries of the section's examples, as config.js holds them.
		const entries = blocks("js").map((block) =>
			block.includes("let config")
				? vm.runInNewContext(`${block}\nconfig.modules[0]`)
				: vm.runInNewContext(`(${block})`)
		);

		it("has the examples this test checks", () => {
			assert.equal(entries.length, 3);
			assert.equal(payloads.length, 3);
		});

		it("maps a value given as text with its unit", () => {
			const {instance, logged} = startInstance(viaMagicMirror(entries[0]).config);
			instance.notificationReceived("MQTT_MESSAGE", {...payloads[0], topic: "home/kitchen/co2"});
			assert.equal(shown(instance).value, "—");
			instance.notificationReceived("MQTT_MESSAGE", payloads[0]);
			assert.deepEqual([shown(instance).value, shown(instance).unit, shown(instance).status], ["812", "ppm", "Gut"]);
			assert.deepEqual(logged, []);
		});

		it("maps a reading from a list and the connection by a function", () => {
			const {instance, logged, clock} = startInstance(viaMagicMirror(entries[1]).config);
			instance.notificationReceived("WEATHER_STATION", payloads[1]);
			assert.deepEqual([shown(instance).value, shown(instance).unit, shown(instance).status], ["81", "%", "Viel zu feucht"]);
			instance.notificationReceived("WEATHER_STATION_STATUS", {...payloads[2], status: "connecting"});
			instance.notificationReceived("WEATHER_STATION_STATUS", payloads[2]);
			advance(clock, 60000);
			assert.deepEqual([shown(instance).value, shown(instance).dimmed, shown(instance).symbol], ["81", true, true]);
			instance.notificationReceived("WEATHER_STATION_STATUS", {...payloads[2], status: "online"});
			assert.equal(shown(instance).dimmed, false);
			assert.deepEqual(logged, []);
		});

		it("fails as described with a helper from elsewhere in config.js", () => {
			// Without MagicMirror² in between, the helper is still in reach.
			assert.equal(entries[2].config.transform(payloads[0]).value, 812);
			const {instance, logged} = startInstance(viaMagicMirror(entries[2]).config);
			instance.notificationReceived("MQTT_MESSAGE", payloads[0]);
			instance.notificationReceived("MQTT_MESSAGE", payloads[0]);
			assert.equal(shown(instance).value, "—");
			const message = `${MODULE_NAME} (CO₂): \`transform\` threw: ReferenceError: parsePpm is not defined`;
			assert.deepEqual(
				logged.filter((entry) => entry.message.includes("transform")),
				[{level: "error", message}]
			);
			assert.ok(section.includes(message), "the README quotes the message");
		});
	});
});
