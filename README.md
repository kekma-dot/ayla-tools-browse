<p>
  <img src="assets/banner.png" alt="ayla-tools-browse" width="1100">
</p>

# ayla-tools-browse

A bounded `browse` tool for the Pi coding agent. It searches and reads untrusted
web documents through [ayla-tools-web](https://github.com/kekma-dot/ayla-tools-web)
and hands the model short, line-addressable snapshots instead of whole pages.

[Русский](README.ru.md) · [Ayla tools family](https://github.com/kekma-dot/ayla-tools) · [MIT](LICENSE)

- **Not a UI browser.** There is no window, no page automation, no clicks in a
  real browser. `click` follows a numbered HTTP link inside an existing snapshot.
- **No screenshots.** The `screenshot` operation reports `PDF screenshot
  unsupported` because no qualified native canvas renderer is shipped. PDF *text*
  is available through `open` and `find`.
- **No personal profile.** The package reads nothing from the author's machine;
  configuration lives in the standard Pi config directory.

## Install

Requirements: Pi **1.3.0** — the tested baseline; newer Pi releases need
re-verification — Node.js **>= 22.19**, and the `ayla-tools-web` engine
installed in the same Pi profile.

```bash
pi install git:github.com/kekma-dot/ayla-tools-web
pi install git:github.com/kekma-dot/ayla-tools-browse
```

Then reload the session so Pi picks up the new package:

```
/reload
```

`browse` reads documents through the engine's `web_document` tool, which the
engine registers only when snapshots are enabled. Add the switch once to
`~/.pi/agent/web-search.json` (or `$PI_CODING_AGENT_DIR/web-search.json`) — if
the file already exists, merge the key into your current settings instead of
replacing the file — and reload again:

```json
{
  "documentSnapshots": true
}
```

Verify that the `browse` tool is available and that the engine tools it needs
(`web_search`, `fetch_content`, `web_document`) are present. `ayla-tools-browse`
contains no provider credentials: search and fetching use whatever
`ayla-tools-web` is configured with. A clean install needs **no keys to start**:
direct public-page retrieval is keyless, and the engine's zero-config search
uses Exa's keyless MCP endpoint — an external service whose availability and
rate limits are not live-qualified here. Add a provider key only if you choose
that provider. See the
[engine provider matrix](https://github.com/kekma-dot/ayla-tools-web#search-backends).

Uninstall: `pi remove git:github.com/kekma-dot/ayla-tools-browse`.

## Tool surface

| Parameter | Meaning |
| --- | --- |
| `search_query` | 1–4 queries: links only, each result gets a stable `s:` ref |
| `open` | 1–4 refs or URLs: bounded line window, optional `lineno`/`offset`/`refresh` |
| `find` | 1–4 exact-text searches over a stored snapshot |
| `click` | 1–4 numbered links from an opened snapshot |
| `screenshot` | accepted by the schema, always returns the unsupported error |
| `response_length` | `short` (6000 chars), `medium` (12000), `long` (24000) |

Rules the tool enforces:

- At most 8 operations per call; the per-operation window is derived from the
  chosen budget, and a call that cannot give each operation a readable window
  fails instead of returning fragments.
- Refs are immutable: reading a ref never refetches. `refresh` explicitly asks
  the engine for a new snapshot, which produces a new ref.
- `d:` refs are durable engine snapshots, `s:` refs are search links bound to a
  stored search result. An unknown `d:`/`s:` ref fails instead of silently
  refetching, so a model cannot re-read content it was not given.
- Refs are recorded in the session branch (custom entry `ayla-browse-refs-v1`),
  so a forked session keeps the refs it inherited. At most 1024 refs per branch.
- URLs must be absolute HTTP(S), at most 4096 characters, without embedded
  credentials. Loopback, private-network and redirect checks stay in the engine's
  SSRF guard; this package does not relax them.

Output is prefixed with an explicit warning that page content is untrusted data,
not instructions.

## Security model

`ayla-tools-browse` is a thin, read-only layer over the engine. It adds no
network code of its own: every fetch, search and document view is executed by an
`ayla-tools-web` tool through the public nested-tool API. The engine owns provider
credentials, SSRF validation, immutable snapshot storage and output bounds.

## Compatibility

- Pi `1.3.0` public extension API (`registerTool`, `outputSchema`,
  `ctx.executeTool`, `ctx.sessionManager`).
- `web_document` contract **v1** (`contractVersion: 1`, `lines`/`links`/`ref`).
  A different contract version fails loudly instead of guessing.
- Host-provided packages are declared as peers only; the package ships no copy
  of `@earendil-works/*`.

## Development

```bash
npm install
npm run typecheck
npm test
```

`npm test` runs the tool contract test: the real `browse` tool executes against a
stubbed nested-tool boundary, so it needs no network and no engine.

Behaviors that need the engine are release gates, run from this directory:

```bash
npm run verify:install                               # pack, production deps only, Pi 1.3 loader
AYLA_TOOLS_WEB_PATH=../ayla-tools-web npm run verify:pair
```

`verify:pair` loads **both** extensions through the real Pi 1.3 resource loader,
lets a faux model call `browse`, and checks that the nested engine call returns a
real snapshot read from a local HTTP server. It exits non-zero when the engine
checkout is missing, so it fails instead of passing vacuously.

## License

MIT. Copyright (c) 2026 kekma-dot.

This package is original code, not a fork of an upstream project. Its engine,
`ayla-tools-web`, is a maintained fork of
[pi-web-access](https://github.com/nicobailon/pi-web-access) by Nico Bailon (MIT);
that attribution is kept in the engine repository and license. No AGY or
Antigravity integration is included in either package.
