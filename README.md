<p>
  <img src="assets/banner.png" alt="ayla-tools-browse" width="1100">
</p>

# ayla-tools-browse

A bounded `browse` tool for the Pi coding agent. It searches and reads untrusted
web documents through [ayla-tools-web](https://github.com/kekma-dot/ayla-tools-web)
and returns short, line-addressable snapshots instead of whole pages.

[Русский](README.ru.md) · [Ayla tools family](https://github.com/kekma-dot/ayla-tools) · [MIT](LICENSE)

## Install

Requirements: Pi 1.3.0, Node.js >= 22.19, and the `ayla-tools-web` engine in the
same Pi profile.

```bash
pi install git:github.com/kekma-dot/ayla-tools-web
pi install git:github.com/kekma-dot/ayla-tools-browse
```

`browse` reads documents through the engine's `web_document` tool, which the
engine registers only when snapshots are on. Merge this key into
`~/.pi/agent/web-search.json` (or `$PI_CODING_AGENT_DIR/web-search.json`) without
replacing your existing settings, then reload:

```json
{
  "documentSnapshots": true
}
```

```
/reload
```

After the reload `browse` is registered. It reaches the engine tools
(`web_search`, `fetch_content`, `web_document`) through the nested tool API and
activates them itself. This package has no provider keys of its own: search and
fetching use the engine's configuration. Direct page retrieval needs no search
API key; search providers have their own requirements. Start with the
[engine README](https://github.com/kekma-dot/ayla-tools-web#search-backends) when
you want a different provider.

Remove the package on its own; the engine stays installed:

```bash
pi remove git:github.com/kekma-dot/ayla-tools-browse
```

Pi 1.3.0 is the tested baseline; newer Pi releases need re-verification.

## Tool surface

| Parameter | Meaning |
| --- | --- |
| `search_query` | 1-4 queries: links only, each result gets a stable `s:` ref |
| `open` | 1-4 refs or URLs: bounded line window, optional `lineno`/`offset`/`refresh` |
| `find` | 1-4 exact-text searches over a stored snapshot |
| `click` | 1-4 numbered links from an opened snapshot |
| `screenshot` | accepted by the schema, always returns the unsupported error |
| `response_length` | `short` (6000 chars), `medium` (12000), `long` (24000) |

The tool enforces these rules:

- At most 8 operations per call. Each operation gets a window sized from the
  chosen budget, and a call that cannot give every operation a readable window
  fails instead of returning fragments.
- Refs are immutable: reading a ref never refetches. `refresh` asks the engine for
  a new snapshot, which produces a new ref.
- `d:` refs are durable engine snapshots; `s:` refs are search links bound to a
  stored search result. An unknown ref fails instead of silently refetching, so a
  model cannot re-read content it was not given.
- Refs are recorded in the session branch (custom entry `ayla-browse-refs-v1`),
  so a forked session keeps the refs it inherited. At most 1024 refs per branch.
- URLs must be absolute HTTP(S), at most 4096 characters, without embedded
  credentials.

Output starts with a warning that page content is untrusted data, not
instructions. There is no browser window and no page automation: pages arrive as
HTML or text over HTTP, a `click` follows a numbered link inside an existing
snapshot, and this package itself runs no page JavaScript (a configured reader
backend may render the page on its own server). `screenshot` returns the
unsupported error because no native canvas renderer is shipped; PDF text is
available through `open` and `find`.

## Security and privacy

This package is a thin read-only layer with no network code of its own: every
search, fetch and document view runs as an `ayla-tools-web` tool through the
public nested-tool API. Provider credentials, SSRF validation, immutable snapshot
storage and output bounds stay in the engine, including loopback, private-network
and redirect checks.

## Compatibility

- Pi 1.3.0 public extension API (`registerTool`, `outputSchema`,
  `ctx.executeTool`, `ctx.sessionManager`).
- `web_document` contract v1 (`contractVersion: 1`, `lines`/`links`/`ref`). A
  different contract version fails instead of guessing.
- Host-provided packages are peers only; the package ships no copy of
  `@earendil-works/*`.

## Development

```bash
npm install
npm run typecheck
npm test
```

`npm test` runs the contract test against a stubbed nested-tool boundary, so it
needs no network and no engine. `npm run verify:pair` loads both extensions
through the real Pi 1.3 loader against a local HTTP server; it needs the engine
checkout at `AYLA_TOOLS_WEB_PATH`.

## License

MIT. Copyright (c) 2026 kekma-dot.

This package is original code. Its engine `ayla-tools-web` is a maintained fork of
[pi-web-access](https://github.com/nicobailon/pi-web-access) by Nico Bailon; that
attribution lives in the engine repository and license.
