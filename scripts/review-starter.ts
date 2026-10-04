// Reproducible source checks for the first release. Never rerun the seed over
// extraction progress: refine only the explicitly identified starter records.
import { join } from "node:path";
import { DatasetSchema } from "../src/data/schema";
import {
  readJSON,
  writeJSON,
  corpusPath,
  datasetPath,
  digest,
  locateExcerpt,
  normalize,
  sectionAt,
  type Corpus,
  exists,
} from "./io";
import { mergeBatch } from "./pipeline";
import { validateDataset } from "./validate";
import type { Extraction, Reconciliation } from "./extraction-schema";
const epic = "mahabharata";
if (await exists(join(corpusPath(epic), "runner.lock")))
  throw new Error("Stop extraction before reviewing starter records.");
const corpus = await readJSON<Corpus>(join(corpusPath(epic), "source.json"));
let data = DatasetSchema.parse(await readJSON(datasetPath(epic)));
if (data.sources[0].sha256 !== corpus.sourceHash)
  throw new Error("Source mismatch.");
// Replaying a completed batch is idempotent and imports its open review notes.
for (const batchId of data.coverage.reviewedBatchIds) {
  const audit = await readJSON<{
    extraction: Extraction;
    reconciliation: Reconciliation;
  }>(join("data/audit", epic, `${batchId}.json`));
  const batch = await readJSON<import("./io").Batch>(
    join(corpusPath(epic), "batches", `${batchId}.json`),
  );
  data = mergeBatch(
    data,
    corpus,
    batch,
    audit.extraction,
    audit.reconciliation,
  );
}
function evidence(pageNumber: number, excerpt: string) {
  const page = corpus.pages[pageNumber - 1];
  const location = locateExcerpt(page.text, excerpt);
  const id = `${epic}:e:${digest(`${corpus.sourceHash}:${pageNumber}:${location.start}:${location.end}`).slice(0, 20)}`;
  if (!data.evidence.some((e) => e.id === id))
    data.evidence.push({
      id,
      sourceId: corpus.sourceId,
      page: pageNumber,
      book: page.book,
      parva: page.parva,
      section: sectionAt(page, location.start),
      excerpt: normalize(excerpt),
      ...location,
    });
  return id;
}
function addEvidence(key: string, id: string) {
  const character = data.characters.find(
    (c) => c.id === `${epic}:seed:${key}`,
  )!;
  character.evidenceIds = [...new Set([...character.evidenceIds, id])];
}
addEvidence(
  "yudhishthira",
  evidence(128, "The eldest of Kunti's children was called Yudhishthira"),
);
addEvidence(
  "krishna",
  evidence(
    2134,
    "Know that this Krishna is Vishnu. Know that He is the soul of the universe.",
  ),
);
for (const key of [
  "hidimva-wife-bhima",
  "ugrasrava-sauti",
  "lomaharshana",
  "saunaka",
])
  data.characters.find((c) => c.id === `${epic}:seed:${key}`)!.kind = "unknown";
data.characters.find(
  (c) => c.id === `${epic}:seed:parikshit-son-abhimanyu`,
)!.description =
  "Child of Abhimanyu and Uttara, born dead in the cited account.";
const from = `${epic}:seed:ambika`;
const to = `${epic}:seed:dhritarashtra`;
const id = `${epic}:r:${digest(`${from}:${to}:parent_of:unspecified`).slice(0, 20)}`;
if (!data.relationships.some((r) => r.id === id))
  data.relationships.push({
    id,
    from,
    to,
    type: "parent_of",
    parenthood: "unspecified",
    evidenceIds: [evidence(1162, "Ambika's son Dhritarashtra")],
    status: "supported",
    derived: false,
    supportingRelationshipIds: [],
  });
// The first omission pass explicitly reported these siblings as deductions.
// Label them as derived and retain the supporting common-parent claims.
for (const relation of data.relationships.filter(
  (r) => r.type === "sibling_of" && !r.derived && r.status === "provisional",
)) {
  const parents = data.relationships.filter((r) => r.type === "parent_of");
  const a = parents.find(
    (a) =>
      a.to === relation.from &&
      parents.some((b) => b.from === a.from && b.to === relation.to),
  );
  const b = a && parents.find((b) => b.from === a.from && b.to === relation.to);
  if (a && b) {
    relation.derived = true;
    relation.supportingRelationshipIds = [a.id, b.id];
    relation.evidenceIds = [
      ...new Set([...relation.evidenceIds, ...a.evidenceIds, ...b.evidenceIds]),
    ];
  }
}
for (const relation of data.relationships)
  for (const id of [relation.from, relation.to]) {
    const person = data.characters.find((c) => c.id === id)!;
    person.evidenceIds = [
      ...new Set([...person.evidenceIds, ...relation.evidenceIds]),
    ];
  }
data.coverage.unresolvedCount =
  data.characters.filter((c) => c.status !== "supported").length +
  data.relationships.filter((r) => r.status !== "supported").length +
  data.issues.filter((i) => i.status === "open").length;
data.coverage.updatedAt = new Date().toISOString();
validateDataset(data);
await writeJSON(datasetPath(epic), data);
console.log(
  `Source checks saved: ${data.characters.length} characters, ${data.relationships.length} relationships, ${data.evidence.length} excerpts, ${data.coverage.unresolvedCount} records/issues to review.`,
);
