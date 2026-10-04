# Epic Character Atlas

A searchable, source-grounded graph of Indian epic characters. Mahabharata is the first edition; the application accepts additional epic datasets, including a future Ramayana atlas.

**Public site:** https://siddhartha047.github.io/epic-character-atlas/

## What the graph shows

The overview includes every published character, including isolates. Select a name or alias to center it and highlight descendants, ancestors, or all family connections up to 6 hops. Family view arranges parent claims from top to bottom. Parent arrows point to children. Spouses and siblings never count as descendants. Biological, divine, adoptive, social, and unspecified parenthood can be filtered separately. Provisional/disputed relationships are excluded by default.

Profiles and relationship details include cited source excerpts with **physical PDF page numbers**. Shared names remain separate identities; unnamed individuals have descriptive labels. Derived siblings retain their parent claims and do not assert full versus half siblinghood.

## Coverage and honesty

The supplied Kisari Mohan Ganguli PDF has 2,328 pages and 18 books. The initial release is a curated family dataset, **not an exhaustive inventory**. The coverage panel reports complete extraction/omission-check batches separately from characters and selected source passages. Pages count as checked only when every batch touching that page has completed. Codex checks are not a complete human review. Processing 100% of pages does not prove that every character was identified.

Current counts and progress are in `data/epics/mahabharata/graph.json`. Batch audit records live in `data/audit/mahabharata/` when extraction completes. Full source PDFs, extracted full text, model prompts/logs, and credentials are not published.

## Run locally

Requires Node 24 and npm. The current working machine also has a portable Node installation in `.tools/node/bin`.

```bash
# On this working machine, if node/npm are absent from your terminal PATH:
export PATH="$PWD/.tools/node/bin:$PATH"
npm ci
npm run dev
```

Open http://127.0.0.1:5173/epic-character-atlas/.

```bash
npm run data:validate
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Browser checks cover desktop/mobile, aliases, namesakes, isolates, source passages, shared links, and a synthetic 10,000-node/30,000-edge graph. Graph layouts run ForceAtlas2 in a worker or Dagre on the local family graph. Cycles are retained, warned about, and rendered with the network layout. If WebGL is unavailable, the character directory and source details remain usable.

## Prepare the source and continue extraction

Install Poppler (`brew install poppler` on a working Homebrew installation) and the official Codex CLI. Sign in to Codex with your existing ChatGPT account. This repository never requests a separately billed model API key. The current machine has portable Poppler under `.tools/poppler/bin`; scripts discover it automatically.

```bash
npm run corpus:prepare -- --epic mahabharata --pdf "Books/Mahabharata (Unabridged in English).pdf"
npm run corpus:extract -- --epic mahabharata --max-batches 5
# Continue all remaining batches:
npm run corpus:extract -- --epic mahabharata --all
npm run data:build
```

The local `.corpus/mahabharata/` directory holds page-preserving text, paragraph-aware ~4,000-word batches with ~250-word overlap, and stage checkpoints. Long paragraph units may produce smaller batches. Each batch uses three sequential `codex exec` calls: extraction, an independent omission audit, and evidence-based identity reconciliation. Exact quote matching and schema/reference validation run before a batch is marked complete. A maximum of two attempts per stage prevents indefinite retries. Authentication/usage failures stop safely; completed stages resume without repeating successful work. A process lock prevents simultaneous writers. Source/parser changes are rejected once annotations exist, requiring a deliberate source migration instead of mixing editions.

The initial curated source passages can be regenerated with `npx tsx scripts/seed.ts` **only before full-book batches have been committed**; the script refuses to overwrite extraction progress.

After reviewing new annotations, validate and deploy updated coverage:

```bash
npm run data:validate
npm run data:build
npm test
npm run build
git add data public/data
git commit -m "Expand source-supported character inventory"
git push
```

If a runner is paused, inspect its `.corpus/mahabharata/runs/` logs locally. Do not publish them. Uncertain identities stay separate; source excerpts are verified mechanically but still require semantic review. The identity pass retrieves exact-name/alias candidates and requires corroborating context to merge. Remaining spelling variants and indirect aliases are intentionally conservative and need review. Open omission/identity notes are retained in the dataset and shown in the coverage panel alongside provisional and disputed records.

## Add Ramayana or another epic

1. Add `data/sources/<epic>.json` with source title, translator, source ID, heading regular expressions (first capture identifies the heading), book-number mapping, and book labels. See Mahabharata's configuration.
2. Prepare its PDF using `--epic <epic> --pdf <file>`. This creates an empty dataset if absent. IDs are scoped to the epic; matching names across epics do not merge.
3. Extract/review its character dataset through the same commands.
4. Set that epic's manifest entry to `status: "available"` and `dataset: "epics/<epic>/graph.json"`, then run `npm run data:build`.

The UI reads the manifest and the versioned JSON interface, so no application logic needs to change. Planned epics remain disabled until their dataset is available.

## Deployment

GitHub Pages must use **GitHub Actions** as its source. `.github/workflows/deploy.yml` validates, tests, builds, and deploys on pushes to main or manual dispatch. Vite uses `/epic-character-atlas/` as its base; navigation state uses URL hashes so shared links work on static hosting. CI only reads the checked-in annotations and never runs source extraction or authenticates to Codex.

MIT license for application code. Source attribution and PDF checksums are recorded in each dataset. The original PDFs are not redistributed.
