import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { test } from "node:test"
import vm from "node:vm"

// Exercise the installer's actual block builder without writing user config.
const source = readFileSync(new URL("./mcp-install.mjs", import.meta.url), "utf8")
const builder = source.slice(source.indexOf("function codexBlock()"), source.indexOf('\nif (has("--print"))'))

for (const [name, paths, hub] of [
  ["Windows backslashes", path.win32, String.raw`C:\new\test\synclair`],
  ["Windows spaces and apostrophe", path.win32, String.raw`C:\Users\O'Brien\My Project`],
  ["Unix double quotes", path.posix, '/tmp/project "quoted"'],
  ["Unicode", path.posix, "/tmp/projet-é"],
]) {
  test(`Codex TOML escapes ${name}`, () => {
    const server = paths.join("node_modules", "@synclair", "core", "scripts", "mcp-server.mjs")
    const block = vm.runInNewContext(`${builder}; codexBlock()`, {
      path: paths,
      HUB_ROOT: hub,
      SERVER_REL: server,
      CODEX_START: "# >>> synclair >>>",
      CODEX_END: "# <<< synclair <<<",
    })
    const expected = paths.join(hub, server)
    // JSON basic-string escaping is valid TOML for these path characters.
    const args = block.split("\n").find((line) => line.startsWith("args = ")).slice(7)
    assert.deepEqual(JSON.parse(args), [expected])
    assert.equal(block.split("\n")[0], "# >>> synclair >>>")
    assert.equal(block.split("\n").at(-1), "# <<< synclair <<<")
    assert.ok(block.includes('[mcp_servers.synclair]\ncommand = "node"'))
  })
}
