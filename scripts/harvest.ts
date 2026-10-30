// Builds data/snapshot.json.gz, the index committed with the code so a fresh
// deploy works before its first scheduled harvest. Run with `npm run harvest`.
import { harvest, writeIndex } from "../lib/harvest";
import { SNAPSHOT_FILE } from "../lib/store";

async function main() {
  const started = Date.now();
  const file = await harvest(({ step, done, total }) => {
    process.stdout.write(`[${done}/${total}] ${step}\n`);
  });
  await writeIndex(file, SNAPSHOT_FILE);
  const secs = Math.round((Date.now() - started) / 1000);
  console.log(`${file.entries.length} entrées en ${secs} s -> ${SNAPSHOT_FILE}`);
  for (const [lane, s] of Object.entries(file.lanes)) console.log(`  ${lane}: ${s.count}${s.error ? ` (erreurs : ${s.error})` : ""}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
