import { readFile, mkdir, rename } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  arg,
  epicArg,
  corpusPath,
  datasetPath,
  root,
  digest,
  exists,
  writeJSON,
  readJSON,
  normalize,
  sectionAt,
  tool,
  type SourcePage,
  type Batch,
  type Corpus,
  type SourceConfig,
} from "./io";

export function createBatches(
  pages: SourcePage[],
  targetWords = 4000,
  overlapWords = 250,
) {
  const units: { text: string; page: SourcePage; words: number }[] = [];
  for (const page of pages) {
    // Prefer paragraphs. A pathological long paragraph is split at line boundaries.
    for (const paragraph of page.text
      .split(/\n\s*\n/)
      .filter((p) => p.trim())) {
      const words = normalize(paragraph).split(" ").length;
      const pieces = words > targetWords ? paragraph.split("\n") : [paragraph];
      for (const text of pieces)
        if (text.trim())
          units.push({
            text,
            page: {
              ...page,
              section: sectionAt(page, page.text.indexOf(text)),
            },
            words: normalize(text).split(" ").length,
          });
    }
  }
  const batches: Batch[] = [];
  let start = 0;
  while (start < units.length) {
    let end = start;
    let words = 0;
    while (
      end < units.length &&
      (words === 0 || words + units[end].words <= targetWords)
    ) {
      if (end > start && units[end].page.book !== units[start].page.book) break;
      words += units[end++].words;
    }
    const slice = units.slice(start, end);
    const text = slice
      .map(
        (u) =>
          `[PDF PAGE ${u.page.page} | BOOK ${u.page.book} ${u.page.parva} | SECTION ${u.page.section}]\n${u.text}`,
      )
      .join("\n\n");
    batches.push({
      id: `b${String(batches.length + 1).padStart(4, "0")}`,
      digest: digest(text),
      pages: [...new Set(slice.map((u) => u.page.page))],
      book: slice[0].page.book,
      section: slice[0].page.section,
      text,
    });
    if (end === units.length) break;
    let next = end;
    let overlap = 0;
    while (
      next > start + 1 &&
      overlap < overlapWords &&
      units[next - 1].page.book === units[end].page.book
    )
      overlap += units[--next].words;
    start = Math.max(start + 1, next);
  }
  return batches;
}
export async function prepare(epic: string, pdf: string) {
  const pdfPath = resolve(pdf);
  const bytes = await readFile(pdfPath);
  const sourceHash = digest(bytes);
  const config = await readJSON<SourceConfig>(
    resolve(arg("config", join(root, "data/sources", `${epic}.json`))!),
  );
  const dir = corpusPath(epic);
  const lock = join(dir, "runner.lock");
  if (await exists(lock)) {
    const pid = Number(await readFile(lock, "utf8"));
    let running = true;
    try {
      process.kill(pid, 0);
    } catch {
      running = false;
    }
    if (running)
      throw new Error(
        `Stop extraction runner PID ${pid} before preparing the source.`,
      );
  }
  const existing = join(dir, "source.json");
  if (await exists(existing)) {
    const prior = await readJSON<Corpus>(existing);
    if (
      prior.sourceHash === sourceHash &&
      prior.version === 2 &&
      digest(JSON.stringify(prior.config)) === digest(JSON.stringify(config))
    ) {
      console.log(
        `Source unchanged: ${prior.pages.length} pages, ${prior.batches.length} batches. Checkpoints retained.`,
      );
      return prior;
    }
    // Do not mix annotations from two editions; archive the local corpus and require explicit dataset migration.
    if (prior.sourceHash !== sourceHash)
      throw new Error(
        "PDF checksum changed. Use a new epic/source dataset ID or migrate existing annotations explicitly; old checkpoints cannot be reused.",
      );
    if (await exists(datasetPath(epic))) {
      const data = await readJSON<{
        coverage: { processedBatchIds: string[] };
      }>(datasetPath(epic));
      if (data.coverage.processedBatchIds.length)
        throw new Error(
          "Parser/config changed. Existing batch checkpoints are invalid; migrate annotations before re-preparing.",
        );
    }
    const runs = join(dir, "runs");
    if (await exists(runs))
      await rename(runs, join(dir, `invalidated-runs-${Date.now()}`));
  }
  await mkdir(dir, { recursive: true });
  const textFile = join(dir, "source.txt");
  const result = spawnSync(
    tool("pdftotext"),
    ["-layout", "-enc", "UTF-8", pdfPath, textFile],
    { encoding: "utf8" },
  );
  if (result.status !== 0)
    throw new Error(`pdftotext failed: ${result.stderr}`);
  const raw = (await readFile(textFile, "utf8")).split("\f");
  if (!raw.at(-1)?.trim()) raw.pop();
  let book = 1;
  let section = "front matter";
  const pages = raw.map((text, i): SourcePage => {
    const heading = text.match(new RegExp(config.bookHeadingPattern, "m"));
    if (heading) {
      book = config.bookNumbers[heading[1]];
      if (!book) throw new Error(`Unmapped book heading ${heading[1]}`);
      section = "front matter";
    }
    const sections = [
      ...text.matchAll(new RegExp(config.sectionHeadingPattern, "gm")),
    ];
    if (sections.length && !text.slice(0, sections[0].index).trim())
      section = sections[0][1];
    const labelKey = Object.keys(config.bookNumbers).find(
      (k) => config.bookNumbers[k] === book,
    )!;
    const page: SourcePage = {
      page: i + 1,
      text,
      book,
      parva: config.bookLabels[labelKey],
      section,
      sectionPattern: config.sectionHeadingPattern,
    };
    if (sections.length) section = sections.at(-1)![1];
    return page;
  });
  if (pages.some((p) => !p.text.trim()))
    throw new Error(
      "Some pages have no extractable text. OCR and a source quality review are required before batching.",
    );
  const batches = createBatches(pages);
  for (const batch of batches)
    await writeJSON(join(dir, "batches", `${batch.id}.json`), batch);
  const corpus: Corpus = {
    version: 2,
    config,
    epicId: epic,
    sourceId: config.id,
    sourceHash,
    pdfPath,
    totalWords: pages.reduce(
      (n, p) => n + normalize(p.text).split(" ").length,
      0,
    ),
    pages,
    batches: batches.map(({ text: _text, ...rest }) => rest),
  };
  await writeJSON(existing, corpus);
  if (!(await exists(datasetPath(epic))))
    await writeJSON(datasetPath(epic), {
      schemaVersion: 1,
      epicId: epic,
      title: epic[0].toUpperCase() + epic.slice(1),
      sources: [
        {
          id: config.id,
          title: config.title,
          translator: config.translator,
          sha256: sourceHash,
          totalPages: pages.length,
        },
      ],
      characters: [],
      relationships: [],
      evidence: [],
      coverage: {
        totalPages: pages.length,
        totalBooks: new Set(pages.map((p) => p.book)).size,
        totalWords: corpus.totalWords,
        totalBatches: batches.length,
        processedBatchIds: [],
        reviewedBatchIds: [],
        processedPages: [],
        reviewedPages: [],
        reviewedBooks: [],
        unresolvedCount: 0,
        phase: "starter",
        message: "Source prepared. Character extraction has not started.",
        updatedAt: new Date().toISOString(),
      },
    });
  console.log(
    `Prepared ${pages.length} pages, ${corpus.totalWords.toLocaleString()} words, ${batches.length} batches.`,
  );
  return corpus;
}
if (process.argv[1]?.endsWith("/prepare.ts")) {
  prepare(
    epicArg(),
    arg("pdf", "Books/Mahabharata (Unabridged in English).pdf")!,
  ).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
