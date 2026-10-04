import { z } from "zod";

export const ReviewStatus = z.enum(["supported", "provisional", "disputed"]);
export const EntityKind = z.enum([
  "human",
  "deity",
  "sage",
  "demon",
  "animal",
  "other",
  "unknown",
]);
export const Parenthood = z.enum([
  "biological",
  "divine",
  "adoptive",
  "social",
  "unspecified",
]);
export const RelationType = z.enum(["parent_of", "spouse_of", "sibling_of"]);
export const EvidenceSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  page: z.number().int().positive(),
  book: z.number().int().min(1),
  parva: z.string(),
  section: z.string(),
  excerpt: z.string().min(1),
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
});
export const CharacterSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  aliases: z.array(
    z.object({
      label: z.string().min(1),
      evidenceIds: z.array(z.string()).min(1),
    }),
  ),
  kind: EntityKind,
  gender: z.array(
    z.object({
      label: z.string(),
      context: z.string(),
      evidenceIds: z.array(z.string()).min(1),
    }),
  ),
  description: z.string(),
  evidenceIds: z.array(z.string()).min(1),
  status: ReviewStatus,
});
export const RelationshipSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  type: RelationType,
  parenthood: Parenthood.nullable(),
  evidenceIds: z.array(z.string()).min(1),
  status: ReviewStatus,
  derived: z.boolean(),
  supportingRelationshipIds: z.array(z.string()),
});
export const CoverageSchema = z.object({
  totalPages: z.number().int(),
  totalBooks: z.number().int(),
  totalWords: z.number().int(),
  totalBatches: z.number().int(),
  processedBatchIds: z.array(z.string()),
  reviewedBatchIds: z.array(z.string()),
  processedPages: z.array(z.number().int()),
  reviewedPages: z.array(z.number().int()),
  reviewedBooks: z.array(z.number().int()),
  unresolvedCount: z.number().int(),
  phase: z.enum(["starter", "extracting", "paused", "edition-processed"]),
  message: z.string(),
  updatedAt: z.string(),
});
export const DatasetSchema = z.object({
  schemaVersion: z.literal(1),
  epicId: z.string(),
  title: z.string(),
  sources: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      translator: z.string(),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
      totalPages: z.number().int().positive(),
    }),
  ),
  characters: z.array(CharacterSchema),
  relationships: z.array(RelationshipSchema),
  evidence: z.array(EvidenceSchema),
  coverage: CoverageSchema,
  issues: z
    .array(
      z.object({
        id: z.string(),
        batchId: z.string(),
        category: z.enum(["extraction", "identity"]),
        description: z.string(),
        status: z.enum(["open", "resolved"]),
      }),
    )
    .default([]),
});
export const ManifestSchema = z.object({
  schemaVersion: z.literal(1),
  epics: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      subtitle: z.string(),
      dataset: z.string().nullable(),
      status: z.enum(["available", "planned"]),
    }),
  ),
});
export type Dataset = z.infer<typeof DatasetSchema>;
export type Character = z.infer<typeof CharacterSchema>;
export type Relationship = z.infer<typeof RelationshipSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;
export type Manifest = z.infer<typeof ManifestSchema>;
export type Mode = "descendants" | "ancestors" | "connections";
export type Filters = {
  relationships: string[];
  parenthood: string[];
  uncertain: boolean;
};
export const defaultFilters: Filters = {
  relationships: ["parent_of", "spouse_of", "sibling_of"],
  parenthood: ["biological", "divine", "adoptive", "social", "unspecified"],
  uncertain: false,
};
