import { readFile, writeFile, unlink } from "node:fs/promises";

/** Records that this job started the current battery charge. Lives on a PVC so it survives pod restarts. */
export interface StateMarker {
  read(): Promise<{ startedAt: string } | null>;
  write(startedAt: string): Promise<void>;
  clear(): Promise<void>;
}

/** File-backed marker. A missing or unparseable file reads as no marker. */
export function createFileStateMarker(path: string): StateMarker {
  return {
    async read() {
      let parsed: unknown;
      try {
        parsed = JSON.parse(await readFile(path, "utf8"));
      } catch {
        return null;
      }
      const startedAt = (parsed as { startedAt?: unknown } | null)?.startedAt;
      return typeof startedAt === "string" ? { startedAt } : null;
    },
    async write(startedAt) {
      await writeFile(path, JSON.stringify({ startedAt }));
    },
    async clear() {
      try {
        await unlink(path);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      }
    },
  };
}
