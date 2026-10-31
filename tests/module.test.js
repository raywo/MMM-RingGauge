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
 * Loads the node_helper with stubs of MagicMirror²'s `node_helper` and
 * `logger` modules; returns what it exports and the helpers it created.
 */
function loadNodeHelper() {
	const module = {exports: {}};
	const created = [];
	const stubs = {
		node_helper: {
			create: (definition) => {
				const helper = {definition};
				created.push(helper);
				return helper;
			}
		},
		logger: {}
	};
	const require = (id) => {
		assert.ok(id in stubs, `node_helper requires ${id}, which the test does not stub`);
		return stubs[id];
	};
	vm.runInNewContext(read("node_helper.js"), {module, exports: module.exports, require}, {filename: "node_helper.js"});
	return {exports: module.exports, created};
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

/**
 * Starts one instance in the browser side with the module's defaults and
 * the given config; returns it and every message it logged.
 */
function startInstance(instanceConfig) {
	const logged = [];
	const record = (level) => (message) => logged.push({level, message});
	const context = vm.createContext({
		Module: {
			register: (_name, definition) => {
				context.definition = definition;
			}
		},
		Log: {error: record("error"), warn: record("warn"), info: record("info"), log: record("log")},
		config: {locale: "en"},
		document: {
			createElement: (name) => new FakeElement(name),
			createElementNS: (_namespace, name) => new FakeElement(name)
		},
		setInterval: () => 0,
		requestAnimationFrame: () => 0,
		cancelAnimationFrame: () => {},
		performance: {now: () => 0}
	});
	vm.runInContext(read("gauge-logic.js"), context, {filename: "gauge-logic.js"});
	vm.runInContext(read(`${MODULE_NAME}.js`), context, {filename: `${MODULE_NAME}.js`});
	const {definition} = context;
	const instance = Object.assign(Object.create(definition), {
		name: MODULE_NAME,
		config: {...definition.defaults, ...instanceConfig},
		sendSocketNotification: () => {},
		translate: (key) => key
	});
	instance.start();
	return {instance, logged};
}

function receive(instance, value) {
	instance.socketNotificationReceived("RING_GAUGE_READING", {
		entity: instance.config.entity,
		value,
		reportedAt: Date.now()
	});
}

describe(MODULE_NAME, () => {
	it("registers under the name of its directory", () => {
		assert.deepEqual(Object.keys(loadModule()), [MODULE_NAME]);
	});

	it("loads its logic file through getScripts()", () => {
		const definition = loadModule()[MODULE_NAME];
		const scripts = definition.getScripts.call({file: (name) => name});
		// Copied: an array from the vm context has another prototype.
		assert.deepEqual([...scripts], ["gauge-logic.js"]);
		assert.ok(fs.existsSync(path.join(REPO_ROOT, scripts[0])));
	});

	it("has a node_helper created through MagicMirror²'s NodeHelper", () => {
		const {exports, created} = loadNodeHelper();
		assert.equal(created.length, 1);
		assert.equal(exports, created[0]);
	});

	it("has no dependencies", () => {
		const pkg = JSON.parse(read("package.json"));
		assert.equal(pkg.dependencies, undefined);
		assert.equal(pkg.devDependencies, undefined);
	});

	describe("with missing or invalid bands", () => {
		it("shows value and marker without bands and logs one error", () => {
			const {instance, logged} = startInstance({entity: "sensor.co2", label: "CO₂"});
			receive(instance, 42);
			receive(instance, 43);
			const root = instance.getDom();
			assert.equal(root.find("ring-gauge-value").textContent, "43");
			assert.equal(root.find("ring-gauge-marker").style.display, "");
			assert.ok(root.find("ring-gauge-marker").attributes.cx);
			assert.equal(root.find("ring-gauge-status").textContent, "");
			assert.deepEqual(logged, [{level: "error", message: `${MODULE_NAME} (CO₂): no bands configured`}]);
		});

		it("names the instance by its reading without a label", () => {
			const {logged} = startInstance({entity: "sensor.co2", bands: undefined});
			assert.deepEqual(logged, [{level: "error", message: `${MODULE_NAME} (sensor.co2): no bands configured`}]);
		});

		it("logs each problem once, however many readings arrive", () => {
			const bands = [
				{to: 60, level: "good", text: "Fine"},
				{to: 40, level: "critical", text: "Odd"}
			];
			const {instance, logged} = startInstance({entity: "sensor.x", label: "X", bands});
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
			const {instance} = startInstance({entity: "sensor.x", bands});
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
			const {instance} = startInstance({entity: "sensor.x", bands});
			const segment = instance.getDom().find("ring-gauge-segment");
			assert.equal(segment.attributes["stroke-dasharray"], "0 1000");
		});

		it("leaves out a band whose `to` is not a number", () => {
			const bands = [
				{to: 50, level: "good", text: "A"},
				{To: 70, level: "warn", text: "B"},
				{to: 100, level: "bad", text: "C"}
			];
			const {instance} = startInstance({entity: "sensor.x", bands});
			const svg = instance.getDom().find("ring-gauge-scale");
			const segments = svg.children.filter((child) => child.classes.has("ring-gauge-segment"));
			assert.equal(segments.length, 2);
			for (const segment of segments) {
				assert.doesNotMatch(segment.attributes["stroke-dasharray"], /NaN/);
				assert.doesNotMatch(segment.attributes["stroke-dashoffset"], /NaN/);
			}
		});

		it("logs nothing for valid bands", () => {
			const bands = [
				{to: 50, level: "good", text: "Good"},
				{to: 100, level: "bad", text: "Bad"}
			];
			const {instance, logged} = startInstance({entity: "sensor.x", bands});
			receive(instance, 70);
			assert.equal(instance.getDom().find("ring-gauge-status").textContent, "Bad");
			assert.deepEqual(logged, []);
		});
	});
});
