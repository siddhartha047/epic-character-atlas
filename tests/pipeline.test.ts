import { it, expect } from "vitest";
import sample from "../data/epics/mahabharata/graph.json";
import { DatasetSchema } from "../src/data/schema";
import { validateDataset } from "../scripts/validate";
import { locateExcerpt, digest, type Corpus, type Batch } from "../scripts/io";
import { createBatches } from "../scripts/prepare";
import { validateExtraction, mergeBatch } from "../scripts/pipeline";
import type { Extraction } from "../scripts/extraction-schema";
const text = "  A king\n named A had a son B.\n\nB married C.\n";
const page = { page: 1, text, book: 1, parva: "Test", section: "I" };
const batch: Batch = {
  id: "b0001",
  digest: digest(text),
  pages: [1],
  book: 1,
  section: "I",
  text,
};
const base = DatasetSchema.parse(sample);
const corpus: Corpus = {
  version: 2,
  epicId: "mahabharata",
  sourceId: base.sources[0].id,
  sourceHash: base.sources[0].sha256,
  pdfPath: "/unused",
  config: {
    id: base.sources[0].id,
    title: "Test",
    translator: "Test",
    bookHeadingPattern: "",
    sectionHeadingPattern: "",
    bookLabels: { "1": "Test" },
    bookNumbers: { "1": 1 },
  },
  totalWords: 14,
  pages: [page],
  batches: [batch],
};
const extraction: Extraction = {
  entities: ["A", "B"].map((key) => ({
    key,
    name: key,
    kind: "human",
    description: "",
    status: "supported",
    aliases: [],
    gender: [],
    evidenceKeys: ["e1"],
  })),
  relationships: [
    {
      fromKey: "A",
      toKey: "B",
      type: "parent_of",
      parenthood: "biological",
      status: "supported",
      evidenceKeys: ["e1"],
    },
  ],
  evidence: [{ key: "e1", page: 1, excerpt: "A had a son B." }],
  unresolved: [],
};
const empty = {
  ...base,
  issues: [],
  characters: [],
  relationships: [],
  evidence: [],
  coverage: {
    ...base.coverage,
    totalPages: 1,
    totalBooks: 1,
    processedBatchIds: [],
    reviewedBatchIds: [],
    processedPages: [],
    reviewedPages: [],
    reviewedBooks: [],
  },
};
it("maps normalized quotes back to exact page offsets", () => {
  const pos = locateExcerpt(text, "A king named A");
  expect(text.slice(pos.start, pos.end).replace(/\s+/g, " ")).toBe(
    "A king named A",
  );
});
it("rejects fabricated quotes and out-of-batch evidence", () => {
  const bad = structuredClone(extraction);
  bad.evidence[0].excerpt = "A had a daughter Z.";
  expect(() => validateExtraction(bad, corpus, batch)).toThrow("not found");
  bad.evidence[0].page = 2;
  expect(() => validateExtraction(bad, corpus, batch)).toThrow("outside");
});
it("rejects missing references, invalid endpoints, and missing source locations", () => {
  const bad = structuredClone(extraction);
  bad.relationships[0].toKey = "absent";
  expect(() => validateExtraction(bad, corpus, batch)).toThrow("endpoints");
  const dataset = structuredClone(base);
  dataset.relationships[0].evidenceIds = ["missing"];
  expect(() => validateDataset(dataset)).toThrow("Missing evidence");
});
it("batch merge is idempotent, without merging namesakes", () => {
  const once = mergeBatch(empty, corpus, batch, extraction, {
    matches: [],
    unresolved: [],
  });
  const twice = mergeBatch(once, corpus, batch, extraction, {
    matches: [],
    unresolved: [],
  });
  expect(twice.characters.length).toBe(2);
  expect(twice.relationships.length).toBe(1);
  expect(twice.evidence.length).toBe(1);
  expect(twice.coverage.reviewedBatchIds).toEqual(["b0001"]);
  const other = { ...batch, id: "b0002" };
  const next = mergeBatch(
    once,
    { ...corpus, batches: [batch, other] },
    other,
    extraction,
    { matches: [], unresolved: [] },
  );
  expect(next.characters.length).toBe(4);
  expect(new Set(next.characters.map((c) => c.id)).size).toBe(4);
});
it("uses explicit evidence-backed reconciliation rather than name equality", () => {
  const once = mergeBatch(empty, corpus, batch, extraction, {
    matches: [],
    unresolved: [],
  });
  const other = { ...batch, id: "b0002" };
  const next = mergeBatch(
    once,
    { ...corpus, batches: [batch, other] },
    other,
    extraction,
    {
      matches: once.characters.map((c) => ({
        localKey: c.name,
        existingId: c.id,
        reason: "same source context",
        evidenceKeys: ["e1"],
      })),
      unresolved: [],
    },
  );
  expect(next.characters.length).toBe(2);
});
it("preserves every source page when batching, with forward progress and bounded overlap", () => {
  const pages = Array.from({ length: 8 }, (_, i) => ({
    ...page,
    page: i + 1,
    text: `PAGE${i} ` + "word ".repeat(70),
  }));
  const batches = createBatches(pages, 150, 20);
  expect(new Set(batches.flatMap((b) => b.pages)).size).toBe(8);
  expect(batches.length).toBeLessThan(10);
  expect(new Set(batches.map((b) => b.id)).size).toBe(batches.length);
});
it("supports zero-family-link characters and flags cycles rather than discarding them", () => {
  expect(() => validateDataset(base)).not.toThrow();
  const cyclic = structuredClone(base);
  const first = cyclic.relationships.find((r) => r.type === "parent_of")!;
  cyclic.relationships.push({
    ...first,
    id: "reverse-test",
    from: first.to,
    to: first.from,
  });
  expect(validateDataset(cyclic).cycles).toBe(true);
});

it("retains unresolved extraction and identity notes idempotently", () => {
  const annotated = {
    ...extraction,
    unresolved: ["A source claim needs review."],
  };
  const first = mergeBatch(empty, corpus, batch, annotated, {
    matches: [],
    unresolved: ["Namesake identity is uncertain."],
  });
  const again = mergeBatch(first, corpus, batch, annotated, {
    matches: [],
    unresolved: ["Namesake identity is uncertain."],
  });
  expect(again.issues).toHaveLength(2);
  expect(again.coverage.unresolvedCount).toBe(2);
});
it("rejects derived siblings supported by unrelated parent claims", () => {
  const data = structuredClone(base);
  const derived = data.relationships.find((r) => r.derived)!;
  const unrelated = data.relationships.find(
    (r) =>
      r.type === "parent_of" && r.to !== derived.from && r.to !== derived.to,
  )!;
  derived.supportingRelationshipIds = [unrelated.id, unrelated.id];
  expect(() => validateDataset(data)).toThrow("share");
});
