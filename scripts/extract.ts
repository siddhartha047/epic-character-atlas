import { mkdir, open, unlink, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  arg,
  epicArg,
  corpusPath,
  datasetPath,
  root,
  readJSON,
  writeJSON,
  digest,
  type Corpus,
  type Batch,
} from "./io";
import { DatasetSchema, type Dataset } from "../src/data/schema";
import { processBatch } from "./pipeline";

async function main() {
  const epic = epicArg();
  const all = process.argv.includes("--all");
  const limit = all ? Infinity : Number(arg("max-batches", "5"));
  if (!(limit > 0) || (!all && !Number.isInteger(limit)))
    throw new Error("--max-batches must be a positive integer.");
  const corpus = await readJSON<Corpus>(join(corpusPath(epic), "source.json"));
  if (digest(await readFile(corpus.pdfPath)) !== corpus.sourceHash)
    throw new Error(
      "Source PDF changed. Prepare a new source before extracting; checkpoints cannot be reused.",
    );
  let dataset = DatasetSchema.parse(await readJSON(datasetPath(epic)));
  if (
    !dataset.sources.some(
      (s) => s.sha256 === corpus.sourceHash && s.id === corpus.sourceId,
    )
  )
    throw new Error("Dataset source does not match prepared corpus.");
  await mkdir(corpusPath(epic), { recursive: true });
  const lock = join(corpusPath(epic), "runner.lock");
  try {
    const handle = await open(lock, "wx");
    await handle.writeFile(String(process.pid));
    await handle.close();
  } catch {
    const pid = Number(await readFile(lock, "utf8"));
    let running = true;
    try {
      process.kill(pid, 0);
    } catch {
      running = false;
    }
    if (running)
      throw new Error(`An extraction runner is already active (PID ${pid}).`);
    await unlink(lock);
    const handle = await open(lock, "wx");
    await handle.writeFile(String(process.pid));
    await handle.close();
  }
  let count = 0;
  try {
    if (dataset.coverage.reviewedBatchIds.length < corpus.batches.length) {
      dataset.coverage.phase = "extracting";
      dataset.coverage.message =
        "Extraction and omission checks are in progress. Characters and families are still being added.";
      dataset.coverage.updatedAt = new Date().toISOString();
      await writeJSON(datasetPath(epic), dataset);
      await writeJSON(join(root, "public/data", epic, "graph.json"), dataset);
    }
    for (const metadata of corpus.batches) {
      if (dataset.coverage.reviewedBatchIds.includes(metadata.id)) continue;
      if (count >= limit) break;
      const batch = await readJSON<Batch>(
        join(corpusPath(epic), "batches", `${metadata.id}.json`),
      );
      if (digest(batch.text) !== metadata.digest)
        throw new Error(`Batch ${metadata.id} changed; checkpoint invalid.`);
      console.log(
        `[${metadata.id}/${corpus.batches.length}] pages ${batch.pages.join(", ")}: extraction → omission check → identities`,
      );
      const result = await processBatch(dataset, corpus, batch);
      dataset = result.dataset;
      await writeJSON(join(root, "data/audit", epic, `${batch.id}.json`), {
        sourceHash: corpus.sourceHash,
        batchDigest: batch.digest,
        batchId: batch.id,
        pages: batch.pages,
        reviewedAt: new Date().toISOString(),
        reviewer:
          "Codex extraction + omission + identity passes; not human review",
        extraction: result.reviewed,
        reconciliation: result.reconciliation,
      });
      await writeJSON(datasetPath(epic), dataset);
      // Every successful batch updates public data; a later build/deploy publishes it.
      await writeJSON(join(root, "public/data", epic, "graph.json"), dataset);
      count++;
      console.log(
        `Saved: ${dataset.characters.length} characters, ${dataset.relationships.length} relationships. ${dataset.coverage.reviewedBatchIds.length}/${corpus.batches.length} batches checked.`,
      );
    }
    if (dataset.coverage.reviewedBatchIds.length < corpus.batches.length) {
      dataset.coverage.phase = "paused";
      dataset.coverage.message =
        "Batch run finished. Completed batches are saved; resume from the next pending batch when ready.";
      dataset.coverage.updatedAt = new Date().toISOString();
      await writeJSON(datasetPath(epic), dataset);
      await writeJSON(join(root, "public/data", epic, "graph.json"), dataset);
    }
    console.log(
      `Finished ${count} new batch(es). ${dataset.coverage.reviewedBatchIds.length}/${corpus.batches.length} checked. Resume: npm run corpus:extract -- --epic ${epic} --all`,
    );
  } catch (error) {
    dataset.coverage.phase = "paused";
    dataset.coverage.message =
      "Extraction paused. Completed batches are saved; the character inventory is still partial.";
    dataset.coverage.updatedAt = new Date().toISOString();
    await writeJSON(datasetPath(epic), dataset);
    await writeJSON(join(root, "public/data", epic, "graph.json"), dataset);
    throw error;
  } finally {
    await unlink(lock);
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
