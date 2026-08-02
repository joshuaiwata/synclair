/**
 * FLUSH, THEN EXIT — synchronously.
 *
 * `process.exit()` discards stdout writes that are still buffered. When stdout
 * is a pipe — which it is for every agent, harness and `| jq` — that buffer is
 * 8KB on macOS, so any larger reply is silently cut mid-sentence. The reader
 * gets a JSON parse error, or worse a truncated report that still looks whole.
 *
 * This repo has already paid for that lesson once: the MCP server's
 * `process.exit()` on stdin end cut large replies, the parse failure was
 * swallowed, and the harness scored it as a 100% token saving. The bug was
 * invisible precisely because the output still *looked* like output.
 *
 * The obvious fix — `process.stdout.write(text, () => process.exit())` — is
 * WRONG in a script with code after it: the callback is asynchronous, so
 * execution falls straight through and the human-readable report prints after
 * the JSON. That produced a payload that parsed for 21,928 characters and then
 * hit a report header.
 *
 * So write synchronously to fd 1 and exit on the next line. `writeSync` can
 * short-write or raise EAGAIN on a non-blocking pipe, so it loops.
 */

import { writeSync } from "node:fs"

function writeAllSync(fd, text) {
  const buf = Buffer.from(text, "utf8")
  let off = 0
  while (off < buf.length) {
    try {
      off += writeSync(fd, buf, off, buf.length - off)
    } catch (e) {
      // A non-blocking pipe that is momentarily full: retry rather than lose the tail.
      if (e && (e.code === "EAGAIN" || e.code === "EWOULDBLOCK")) continue
      // The reader hung up (`| head`). Nothing to flush to; exit quietly.
      if (e && (e.code === "EPIPE" || e.code === "ERR_STREAM_DESTROYED")) return
      throw e
    }
  }
}

/** Write everything, then exit. Safe at any payload size. */
export function emit(text, code = 0) {
  writeAllSync(1, text)
  process.exit(code)
}

/** `emit` for JSON payloads, which are the ones big enough to get cut. */
export function emitJson(value, code = 0) {
  emit(JSON.stringify(value, null, 2) + "\n", code)
}
