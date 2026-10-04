import { readFile, writeFile, mkdir, rename, access } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

export const root = resolve(import.meta.dirname, "..");
export const digest = (text: string | Buffer) =>
  createHash("sha256").update(text).digest("hex");
export async function readJSON<T = unknown>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8"));
}
export async function exists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
export async function writeJSON(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2) + "\n");
  await rename(temp, path);
}
export function arg(name: string, fallback?: string) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const value = process.argv[i + 1];
  if (!value || value.startsWith("--"))
    throw new Error(`--${name} needs a value.`);
  return value;
}
export function epicArg() {
  const epic = arg("epic", "mahabharata")!;
  if (!/^[a-z0-9-]+$/.test(epic)) throw new Error("Invalid epic ID.");
  return epic;
}
export function tool(name: string) {
  const portable: Record<string, string> = {
    pdftotext: join(root, ".tools/poppler/bin/pdftotext"),
    pdfinfo: join(root, ".tools/poppler/bin/pdfinfo"),
  };
  const candidate = portable[name];
  if (
    candidate &&
    spawnSync(candidate, ["-v"], { stdio: "ignore" }).status === 0
  )
    return candidate;
  const result = spawnSync("which", [name], { encoding: "utf8" });
  if (result.status === 0) return result.stdout.trim();
  throw new Error(
    `${name} is missing. Install it and add it to PATH. See README.md.`,
  );
}
export type SourceConfig = {
  id: string;
  title: string;
  translator: string;
  bookHeadingPattern: string;
  sectionHeadingPattern: string;
  bookLabels: Record<string, string>;
  bookNumbers: Record<string, number>;
};
export type SourcePage = {
  page: number;
  text: string;
  book: number;
  parva: string;
  section: string;
  sectionPattern?: string;
};
export type Batch = {
  id: string;
  digest: string;
  pages: number[];
  book: number;
  section: string;
  text: string;
};
export type Corpus = {
  version: 2;
  epicId: string;
  sourceId: string;
  sourceHash: string;
  pdfPath: string;
  config: SourceConfig;
  totalWords: number;
  pages: SourcePage[];
  batches: Omit<Batch, "text">[];
};
export const corpusPath = (epic: string) => join(root, ".corpus", epic);
export const datasetPath = (epic: string) =>
  join(root, "data", "epics", epic, "graph.json");
export const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
export function sectionAt(page: SourcePage, offset: number) {
  return (
    [
      ...page.text
        .slice(0, offset)
        .matchAll(
          new RegExp(
            page.sectionPattern ?? "^\\s*SECTION\\s+([A-Z\\d.-]+)\\s*$",
            "gm",
          ),
        ),
    ].at(-1)?.[1] ?? page.section
  );
}
// PDF layout may put a line break after a compound-word hyphen. Preserve
// every letter and the hyphen; only fold the intervening whitespace.
export const normalizeEvidence = (text: string) =>
  normalize(text).replace(/([A-Za-z])-\s+(?=[a-z])/g, "$1-");
export function locateExcerpt(text: string, excerpt: string) {
  // Prefer the original whitespace-only match so existing annotations retain
  // their exact offsets, including when a page repeats a similar passage.
  for (const joinHyphenWhitespace of [false, true]) {
    const canonical = joinHyphenWhitespace ? normalizeEvidence : normalize;
    const target = canonical(excerpt);
    const normalizedStart = canonical(text).indexOf(target);
    if (normalizedStart < 0) continue;
    const mapping: number[] = [];
    let previousWhitespace = true;
    for (let i = 0; i < text.length; i++) {
      const whitespace = /\s/.test(text[i]);
      let folded = false;
      if (
        joinHyphenWhitespace &&
        whitespace &&
        !previousWhitespace &&
        text[i - 1] === "-" &&
        /[A-Za-z]/.test(text[i - 2] ?? "")
      ) {
        let next = i;
        while (next < text.length && /\s/.test(text[next])) next++;
        folded = /[a-z]/.test(text[next] ?? "");
      }
      if (!whitespace || (!previousWhitespace && !folded)) mapping.push(i);
      previousWhitespace = whitespace;
    }
    return {
      start: mapping[normalizedStart],
      end: mapping[normalizedStart + target.length - 1] + 1,
    };
  }
  throw new Error(
    `Evidence excerpt not found in its source page: ${normalize(excerpt).slice(0, 100)}`,
  );
}
