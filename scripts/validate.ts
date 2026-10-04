import { join } from "node:path";
import {
  DatasetSchema,
  ManifestSchema,
  type Dataset,
} from "../src/data/schema";
import {
  root,
  readJSON,
  exists,
  corpusPath,
  locateExcerpt,
  normalize,
  type Corpus,
} from "./io";
import { hasParentCycle } from "../src/data/graph";

export function validateDataset(data: Dataset) {
  const dataset = DatasetSchema.parse(data);
  const unique = (items: { id: string }[], label: string) => {
    if (new Set(items.map((i) => i.id)).size !== items.length)
      throw new Error(`Duplicate ${label} IDs.`);
  };
  unique(dataset.characters, "character");
  unique(dataset.relationships, "relationship");
  unique(dataset.evidence, "evidence");
  unique(dataset.sources, "source");
  unique(dataset.issues, "issue");
  const characters = new Set(dataset.characters.map((c) => c.id));
  const evidence = new Set(dataset.evidence.map((e) => e.id));
  const sources = new Map(dataset.sources.map((s) => [s.id, s]));
  const relationships = new Map(dataset.relationships.map((r) => [r.id, r]));
  const refs = (ids: string[]) => {
    if (ids.some((id) => !evidence.has(id)))
      throw new Error("Missing evidence reference.");
  };
  for (const c of dataset.characters) {
    if (!c.id.startsWith(`${dataset.epicId}:`))
      throw new Error("Character ID must be epic-scoped.");
    refs(c.evidenceIds);
    c.aliases.forEach((a) => refs(a.evidenceIds));
    c.gender.forEach((g) => refs(g.evidenceIds));
  }
  for (const e of dataset.evidence) {
    const source = sources.get(e.sourceId);
    if (!source || e.page > source.totalPages || e.end <= e.start)
      throw new Error(`Invalid source location ${e.id}`);
  }
  for (const r of dataset.relationships) {
    if (!characters.has(r.from) || !characters.has(r.to) || r.from === r.to)
      throw new Error("Invalid relationship endpoints.");
    if (r.type !== "parent_of" && r.parenthood !== null)
      throw new Error("Only parent_of has a parenthood subtype.");
    refs(r.evidenceIds);
    if (
      r.derived &&
      (r.type !== "sibling_of" ||
        r.supportingRelationshipIds.length < 2 ||
        r.supportingRelationshipIds.some(
          (id) => relationships.get(id)?.type !== "parent_of",
        ))
    )
      throw new Error("Derived siblings need supporting parent claims.");
    if (r.derived) {
      const parents = r.supportingRelationshipIds.map((id) =>
        relationships.get(id)!,
      );
      if (
        !parents.some(
          (a) =>
            a.to === r.from &&
            parents.some((b) => b.to === r.to && b.from === a.from),
        )
      )
        throw new Error("Derived siblings must share a supported parent.");
      if (
        parents.some((p) => p.status !== "supported") &&
        r.status === "supported"
      )
        throw new Error(
          "Derived claims cannot outrank uncertain supporting claims.",
        );
      if (
        parents.some((p) =>
          p.evidenceIds.some((id) => !r.evidenceIds.includes(id)),
        )
      )
        throw new Error("Derived siblings must retain supporting evidence.");
    }
  }
  for (const k of [
    "processedBatchIds",
    "reviewedBatchIds",
    "processedPages",
    "reviewedPages",
    "reviewedBooks",
  ] as const)
    if (
      new Set<string | number>(dataset.coverage[k]).size !==
      dataset.coverage[k].length
    )
      throw new Error("Duplicate coverage entries.");
  if (
    dataset.coverage.reviewedBatchIds.some(
      (id) => !dataset.coverage.processedBatchIds.includes(id),
    ) ||
    dataset.coverage.processedBatchIds.length > dataset.coverage.totalBatches
  )
    throw new Error("Invalid batch coverage.");
  return {
    cycles: hasParentCycle(
      dataset.relationships.filter((r) => r.status === "supported"),
    ),
  };
}
export async function validateAll() {
  const manifest = ManifestSchema.parse(
    await readJSON(join(root, "data/manifest.json")),
  );
  for (const epic of manifest.epics.filter((e) => e.dataset)) {
    const data = DatasetSchema.parse(
      await readJSON(join(root, "data", epic.dataset!)),
    );
    if (data.epicId !== epic.id)
      throw new Error("Manifest/dataset epic mismatch.");
    const result = validateDataset(data);
    if (await exists(join(corpusPath(epic.id), "source.json"))) {
      const corpus = await readJSON<Corpus>(
        join(corpusPath(epic.id), "source.json"),
      );
      for (const e of data.evidence) {
        const page = corpus.pages[e.page - 1];
        const location = locateExcerpt(page.text, e.excerpt);
        if (
          location.start !== e.start ||
          location.end !== e.end ||
          normalize(page.text.slice(e.start, e.end)) !== normalize(e.excerpt)
        )
          throw new Error(`Evidence location mismatch ${e.id}`);
      }
    }
    console.log(
      `${epic.id}: ${data.characters.length} characters, ${data.relationships.length} relationships, ${data.evidence.length} evidence excerpts. ${result.cycles ? "WARNING: supported parent cycle retained." : "Valid."}`,
    );
  }
  return manifest;
}
if (process.argv[1]?.endsWith("/validate.ts"))
  validateAll().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
