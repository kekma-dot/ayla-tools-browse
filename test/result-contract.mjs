// Actual SDK loader; stub only the public document-tool boundary for this leaf test.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
// Default to the SDK installed as a dev dependency; override to test another
// Pi build with AYLA_BROWSE_SDK_ROOT=/path/to/pi-coding-agent.
const sdkRoot = process.env.AYLA_BROWSE_SDK_ROOT ?? resolve(fileURLToPath(new URL('../node_modules/@earendil-works/pi-coding-agent', import.meta.url)));
const sdk = await import(pathToFileURL(join(sdkRoot, 'dist/index.js')));
const root = mkdtempSync(join(tmpdir(), 'browse-result-contract-'));
const agentDir = join(root, 'agent'); mkdirSync(agentDir);
const source = process.env.AYLA_BROWSE_LEAF_SOURCE || resolve(fileURLToPath(new URL('..', import.meta.url)));
try {
  const loader = new sdk.DefaultResourceLoader({ cwd: root, agentDir, noExtensions: true, noSkills: true, noThemes: true, noContextFiles: true, noPromptTemplates: true, additionalExtensionPaths: [source], settingsManager: sdk.SettingsManager.inMemory(), agentsFilesOverride: () => ({ agentsFiles: [] }) });
  await loader.reload(); assert.deepEqual(loader.getExtensions().errors, []);
  const tool = loader.getExtensions().extensions.flatMap(e => [...e.tools.values()].map(t => t.definition)).find(t => t.name === 'browse'); assert.ok(tool);
  const text = 'Untrusted snapshot\nL1 [chars 0-8]: MATCH946\nContinue ref d:stored:0 at lineno 1, offset 8.';
  const view = { contractVersion: 1, ref: 'd:stored:0', lines: [{ number: 1, start: 0, end: 8, text: 'MATCH946' }], links: [], nextLine: 1, nextOffset: 8, outputTruncated: true };
  const ctx = { tools: [{ name: 'web_document' }], sessionManager: { getBranch: () => [{ type: 'custom', customType: 'ayla-browse-refs-v1', data: [{ ref: view.ref, responseId: 'stored', index: 0 }] }] }, executeTool: async name => {
    assert.equal(name, 'web_document'); return { isError: false, result: { content: [{ type: 'text', text }], structuredContent: view } };
  } };
  const result = await tool.execute('contract', { open: [{ ref_id: view.ref }] }, undefined, undefined, ctx);
  assert.ok(!result.isError);
  assert.equal(result.structuredContent.results[0].text, text, 'programmatic callers receive the same bounded page evidence, not refs alone');
  assert.ok(result.content[0].text.includes(text));
  assert.equal(result.structuredContent.results[0].continuation.offset, 8);
  assert.equal(result.details.results[0].text, undefined, 'do not duplicate bodies in renderer metadata');
  console.log(JSON.stringify({ passed: true, sdk: JSON.parse(readFileSync(join(sdkRoot, 'package.json'))).version, node: process.version, scope: 'actual SDK loader; stubbed document boundary; bounded model/programmatic result parity' }));
} finally { rmSync(root, { recursive: true, force: true }); }
