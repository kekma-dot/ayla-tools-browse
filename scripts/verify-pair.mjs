#!/usr/bin/env node
// Release gate for the ayla-tools-browse + ayla-tools-web pair.
//
// Loads both extensions from disk through the real Pi 1.3 resource loader, lets a faux model
// call `browse`, and checks that the nested web tools produce a real snapshot read from a local
// HTTP server. Run it with the engine checkout available:
//
//   AYLA_TOOLS_WEB_PATH=/path/to/ayla-tools-web node scripts/verify-pair.mjs
//
// Exits non-zero when the engine is missing or any step of the pair fails.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
	createAgentSession,
	DefaultResourceLoader,
	SessionManager,
} from "@earendil-works/pi-coding-agent";
import {
	createModels,
	fauxAssistantMessage,
	fauxProvider,
	fauxToolCall,
	getCurrentTools,
} from "@earendil-works/pi-ai";

const browseIndex = resolve(new URL("../index.ts", import.meta.url).pathname);
const engineRoot = resolve(process.env.AYLA_TOOLS_WEB_PATH ?? "../ayla-tools-web");
const engineIndex = join(engineRoot, "index.ts");
if (!existsSync(engineIndex)) {
	console.error(`Engine not found at ${engineIndex}. Set AYLA_TOOLS_WEB_PATH to an ayla-tools-web checkout.`);
	process.exit(1);
}

const root = await mkdtemp(join(tmpdir(), "ayla-tools-pair-"));
const server = createServer((req, res) => {
	res.writeHead(200, { "content-type": "text/html" }).end(
		`<html><head><title>Pair fixture</title></head><body><article><p>${req.url?.startsWith("/second") ? "SECOND946" : "PAIRLINE946"} page body.</p></article></body></html>`,
	);
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;

const cleanup = async () => {
	await new Promise((done) => server.close(done));
	await rm(root, { recursive: true, force: true });
};

try {
	await writeFile(join(root, "web-search.json"), JSON.stringify({
		toolActivation: "dynamic",
		documentSnapshots: true,
		fetchRouting: { providers: ["http"] },
		ssrf: { allowRanges: ["127.0.0.1/32"] },
		proxy: "",
	}));
	process.env.PI_CODING_AGENT_DIR = root;
	process.env.FAUX_API_KEY = "test";

	const faux = fauxProvider({});
	const models = createModels();
	models.setProvider(faux.provider);
	const modelRuntime = new Proxy(models, {
		get(target, property) {
			if (property === "hasConfiguredAuth") return () => true;
			if (property === "checkAuth") return async () => ({ type: "api_key", key: "test" });
			if (property === "isUsingOAuth" || property === "isUsingSubscription") return () => false;
			const value = Reflect.get(target, property, target);
			return typeof value === "function" ? value.bind(target) : value;
		},
	});

	const loader = new DefaultResourceLoader({ cwd: root, agentDir: root, additionalExtensionPaths: [engineIndex, browseIndex] });
	await loader.reload();
	const { session, extensionsResult } = await createAgentSession({
		cwd: root,
		agentDir: root,
		model: faux.getModel(),
		modelRuntime,
		resourceLoader: loader,
		sessionManager: SessionManager.inMemory(root),
		sessionStartEvent: { type: "session_start", reason: "startup" },
		noTools: "builtin",
	});
	assert.deepEqual(extensionsResult.errors, [], "both extensions must load through the Pi 1.3 loader");

	const seen = [];
	const capture = (context) => seen.push(context);
	faux.setResponses([
		(context) => {
			capture(context);
			return fauxAssistantMessage(fauxToolCall("browse", { open: [{ ref_id: `${origin}/first` }] }), { stopReason: "toolUse" });
		},
		(context) => {
			capture(context);
			return fauxAssistantMessage("done");
		},
	]);
	await session.bindExtensions({});
	await session.prompt("Open the fixture page");

	const toolNames = getCurrentTools(seen[0].messages).map((tool) => tool.name);
	// Dynamic activation keeps the engine's web tools behind web_enable; browse must open the
	// surface itself through the nested tool API.
	for (const name of ["browse", "web_enable"]) {
		assert.ok(toolNames.includes(name), `${name} must be registered for the pair; saw ${toolNames.join(", ")}`);
	}

	const resultText = seen[1].messages
		.filter((message) => message.role === "toolResult")
		.map((message) => message.content.map((part) => part.text ?? "").join(""))
		.join("\n");
	assert.match(resultText, /PAIRLINE946/, "browse must read the snapshot through the engine");
	assert.match(resultText, /ref d:/, "browse must return the immutable document ref");
	assert.match(resultText, /Untrusted web content follows/);
	session.dispose();
	console.log(JSON.stringify({ ok: true, engine: engineRoot, toolNames, resultChars: resultText.length }, null, 2));
} finally {
	await cleanup();
}
