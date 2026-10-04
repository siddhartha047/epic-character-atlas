import { z } from "zod";
import {
  EntityKind,
  Parenthood,
  RelationType,
  ReviewStatus,
} from "../src/data/schema";
const key = z.string().regex(/^[a-zA-Z0-9_-]+$/);
const references = z.array(key).min(1);
export const ExtractionSchema = z.object({
  entities: z.array(
    z.object({
      key,
      name: z.string().min(1),
      kind: EntityKind,
      description: z.string(),
      status: ReviewStatus,
      aliases: z.array(
        z.object({ label: z.string(), evidenceKeys: references }),
      ),
      gender: z.array(
        z.object({
          label: z.string(),
          context: z.string(),
          evidenceKeys: references,
        }),
      ),
      evidenceKeys: references,
    }),
  ),
  relationships: z.array(
    z.object({
      fromKey: key,
      toKey: key,
      type: RelationType,
      parenthood: Parenthood.nullable(),
      evidenceKeys: references,
      status: ReviewStatus,
    }),
  ),
  evidence: z.array(
    z.object({
      key,
      page: z.number().int().positive(),
      excerpt: z.string().min(1),
    }),
  ),
  unresolved: z.array(z.string()),
});
export const ReconciliationSchema = z.object({
  matches: z.array(
    z.object({
      localKey: key,
      existingId: z.string(),
      reason: z.string().min(1),
      evidenceKeys: references,
    }),
  ),
  unresolved: z.array(z.string()),
});
export type Extraction = z.infer<typeof ExtractionSchema>;
export type Reconciliation = z.infer<typeof ReconciliationSchema>;
