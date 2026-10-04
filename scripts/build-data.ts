import { join } from "node:path";
import { validateAll } from "./validate";
import { root, readJSON, writeJSON } from "./io";
const manifest = await validateAll();
await writeJSON(join(root, "public/data/manifest.json"), {
  ...manifest,
  epics: manifest.epics.map((e) => ({
    ...e,
    dataset: e.dataset ? `${e.id}/graph.json` : null,
  })),
});
for (const epic of manifest.epics.filter((e) => e.dataset))
  await writeJSON(
    join(root, "public/data", epic.id, "graph.json"),
    await readJSON(join(root, "data", epic.dataset!)),
  );
console.log(
  "Public datasets rebuilt. Source PDFs and full corpus text are excluded.",
);
