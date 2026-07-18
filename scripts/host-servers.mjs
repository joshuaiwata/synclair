#!/usr/bin/env node
/**
 * Boot / check the project's local dev servers so Synclair's host route
 * previews go live. Config is data/dev-servers.json (same file the hub reads).
 *
 *   node scripts/host-servers.mjs status        probe each server, print live/down
 *   node scripts/host-servers.mjs up            boot every DOWN server (detached)
 *   node scripts/host-servers.mjs up <id...>    boot only these
 *
 * `up` spawns each server's `command` in its `cwd`, detached, with output to
 * .host-servers/<id>.log, so it keeps running after this process exits — then
 * the hub detects it live and previews start rendering the real routes.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const configPath = path.join(root, "data", "dev-servers.json");
const [cmd = "status", ...ids] = process.argv.slice(2);

function loadServers() {
  if (!existsSync(configPath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf8"));
    return Array.isArray(parsed.servers) ? parsed.servers.filter((s) => s && s.id && s.url) : [];
  } catch (e) {
    console.error(`data/dev-servers.json is not valid JSON (${e.message}).`);
    process.exit(1);
  }
}

async function isLive(url) {
  for (const method of ["HEAD", "GET"]) {
    try {
      const res = await fetch(url, {
        method,
        redirect: "manual",
        signal: AbortSignal.timeout(700),
        cache: "no-store",
      });
      if (res.status > 0) return true;
    } catch {
      // try next method / fall through to false
    }
  }
  return false;
}

const servers = loadServers();
if (servers.length === 0) {
  console.log(
    "No dev servers configured — add them to data/dev-servers.json " +
      "({ servers: [{ id, label, url, command, cwd, host }] }). Blank in a fresh clone."
  );
  process.exit(0);
}

const selected = ids.length ? servers.filter((s) => ids.includes(s.id)) : servers;

if (cmd === "status") {
  for (const s of servers) {
    const live = await isLive(s.url);
    console.log(`${live ? "● live" : "○ down"}  ${s.id.padEnd(14)} ${s.url}  ${s.label ?? ""}`);
  }
  process.exit(0);
}

if (cmd === "up") {
  const logDir = path.join(root, ".host-servers");
  mkdirSync(logDir, { recursive: true });
  let booted = 0;
  for (const s of selected) {
    if (await isLive(s.url)) {
      console.log(`● ${s.id} already live at ${s.url} — skipping.`);
      continue;
    }
    if (!s.command) {
      console.log(`○ ${s.id} is down and has no "command" — boot it yourself at ${s.url}.`);
      continue;
    }
    const cwd = s.cwd ? path.resolve(root, s.cwd) : root;
    if (!existsSync(cwd)) {
      console.log(`○ ${s.id}: cwd ${s.cwd} not found — skipping.`);
      continue;
    }
    const logFile = path.join(logDir, `${s.id}.log`);
    const out = openSync(logFile, "a");
    const child = spawn(s.command, {
      cwd,
      shell: true,
      detached: true,
      stdio: ["ignore", out, out],
    });
    child.unref();
    booted += 1;
    console.log(`▲ ${s.id}: booting \`${s.command}\` in ${s.cwd ?? "."} → ${s.url}`);
    console.log(`   pid ${child.pid} · log ${path.relative(root, logFile)}`);
  }
  if (booted > 0) {
    console.log(
      `\nStarted ${booted} server(s) detached. Give them a few seconds, then reload ` +
        "/synclair/pages — previews light up once they answer. Stop them by killing their pids."
    );
  }
  process.exit(0);
}

console.error(`Unknown command "${cmd}". Use: status | up [id...]`);
process.exit(1);
