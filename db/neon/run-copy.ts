// Server-side runner: bun db/neon/run-copy.ts (env from the backend secrets).
import { runDataCopy } from "@/lib/neon/data-copy.server";
const r = await runDataCopy();
for (const c of r.counts) console.log(c.table, c.source, c.neon, c.source === c.neon ? "ok" : "DIFF", (r.copy[c.table]?.errors ?? []).join(" | ").slice(0, 200));
console.log("orphans:", r.integrity.filter((i) => i.orphans > 0).map((i) => `${i.check}=${i.orphans}`).join(", ") || "none", `(${r.integrity.length} checks)`);
