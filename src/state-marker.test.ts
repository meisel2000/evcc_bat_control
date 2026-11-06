import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFileStateMarker } from "./state-marker.ts";

async function tempPath(): Promise<string> {
  return join(await mkdtemp(join(tmpdir(), "marker-test-")), "state.json");
}

test("reads null when no marker file exists", async () => {
  const marker = createFileStateMarker(await tempPath());
  assert.equal(await marker.read(), null);
});

test("reads back the start time that was written", async () => {
  const marker = createFileStateMarker(await tempPath());
  await marker.write("2026-01-10T01:00:00.000Z");
  assert.deepEqual(await marker.read(), { startedAt: "2026-01-10T01:00:00.000Z" });
});

test("reads null when the marker file is not valid JSON", async () => {
  const path = await tempPath();
  await writeFile(path, "{not json");
  assert.equal(await createFileStateMarker(path).read(), null);
});

test("reads null when the marker file has no startedAt", async () => {
  const path = await tempPath();
  await writeFile(path, JSON.stringify({ other: 1 }));
  assert.equal(await createFileStateMarker(path).read(), null);
});

test("rejects writing when the marker directory is unavailable", async () => {
  const path = join(await mkdtemp(join(tmpdir(), "marker-test-")), "missing", "state.json");
  await assert.rejects(createFileStateMarker(path).write("2026-01-10T01:00:00.000Z"));
});

test("removes the marker file on clear", async () => {
  const path = await tempPath();
  const marker = createFileStateMarker(path);
  await marker.write("2026-01-10T01:00:00.000Z");
  await marker.clear();
  assert.equal(await marker.read(), null);
});

test("clear succeeds when no marker file exists", async () => {
  await createFileStateMarker(await tempPath()).clear();
});
