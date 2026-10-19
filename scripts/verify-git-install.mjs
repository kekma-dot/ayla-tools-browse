#!/usr/bin/env node
// Release gate: emulate a fresh public Git install of this package (production dependencies
// only, no build step) and prove the packaged extension still registers in Pi 1.3.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, symlinkSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repo = resolve(new URL("..", import.meta.url).pathname);
const pkg = JSON.parse(readFileSync(join(repo, "package.json"), "utf8"));
const work = await mkdtemp(join(tmpdir(), "ayla-tools-browse-git-install-"));

try {
	execFileSync("npm", ["pack", "--pack-destination", work, "--silent"], { cwd: repo, stdio: ["ignore", "ignore", "inherit"] });
	const tarball = join(work, `${pkg.name}-${pkg.version}.tgz`);
	assert.ok(existsSync(tarball), tarball);

	const app = join(work, "app");
	mkdirSync(app, { recursive: true });
	execFileSync("npm", ["init", "-y"], { cwd: app, stdio: "ignore" });
	execFileSync("npm", ["install", "--omit=dev", "--omit=peer", "--ignore-scripts", "--no-audit", "--no-fund", tarball], {
		cwd: app,
		stdio: ["ignore", "ignore", "inherit"],
	});

	const installed = join(app, "node_modules", pkg.name);
	for (const file of ["index.ts", "README.md", "README.ru.md", "LICENSE", "assets/banner.png", "provenance.json"]) {
		assert.ok(existsSync(join(installed, file)), `${file} must ship in the package`);
	}
	assert.ok(!existsSync(join(installed, "node_modules")), "the package must not ship its own dependency tree");

	// The Pi host provides the peer packages; mirror that with the qualified 1.3.0 install.
	for (const name of ["@earendil-works/pi-ai", "@earendil-works/pi-coding-agent"]) {
		const link = join(app, "node_modules", name);
		mkdirSync(join(link, ".."), { recursive: true });
		if (!existsSync(link)) symlinkSync(join(repo, "node_modules", name), link, "dir");
	}

	const loaded = spawnSync(process.execPath, ["--input-type=module"], {
		cwd: app,
		encoding: "utf8",
		env: { ...process.env, PI_CODING_AGENT_DIR: app, FAUX_API_KEY: "test" },
		input: `
			import { createModels, fauxProvider, getCurrentTools } from "@earendil-works/pi-ai";
			import { createAgentSession, DefaultResourceLoader, SessionManager } from "@earendil-works/pi-coding-agent";
			const faux = fauxProvider({});
			const models = createModels();
			models.setProvider(faux.provider);
			const modelRuntime = new Proxy(models, { get(t, p) { if (p === "hasConfiguredAuth") return () => true; if (p === "checkAuth") return async () => ({ type: "api_key", key: "test" }); if (p === "isUsingOAuth" || p === "isUsingSubscription") return () => false; const v = Reflect.get(t, p, t); return typeof v === "function" ? v.bind(t) : v; } });
			const loader = new DefaultResourceLoader({ cwd: process.cwd(), agentDir: process.cwd(), additionalExtensionPaths: [${JSON.stringify(join(installed, "index.ts"))}] });
			await loader.reload();
			const { session, extensionsResult } = await createAgentSession({ cwd: process.cwd(), agentDir: process.cwd(), model: faux.getModel(), modelRuntime, resourceLoader: loader, sessionManager: SessionManager.inMemory(process.cwd()), sessionStartEvent: { type: "session_start", reason: "startup" }, noTools: "builtin" });
			await session.bindExtensions({});
			console.log(JSON.stringify({ errors: extensionsResult.errors.map(String) }));
			session.dispose();
		`,
	});
	assert.equal(loaded.status, 0, loaded.stderr);
	assert.deepEqual(JSON.parse(loaded.stdout).errors, []);
	console.log("browse loads through Pi 1.3 loader from a production-only install: ok");
} finally {
	await rm(work, { recursive: true, force: true });
}
