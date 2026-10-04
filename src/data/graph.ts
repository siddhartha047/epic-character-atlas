import Graph from "graphology";
import Fuse from "fuse.js";
import type { Character, Dataset, Filters, Mode, Relationship } from "./schema";

export const palette: Record<string, string> = {
  human: "#3a7669",
  deity: "#c28b39",
  sage: "#8c76a4",
  demon: "#b6644f",
  animal: "#60859e",
  other: "#bd986b",
  unknown: "#929690",
};
export function eligible(r: Relationship, f: Filters) {
  return (
    (f.uncertain || r.status === "supported") &&
    f.relationships.includes(r.type) &&
    (r.type !== "parent_of" ||
      f.parenthood.includes(r.parenthood ?? "unspecified"))
  );
}
export function indexRelations(
  relationships: Relationship[],
  filters: Filters,
  mode: Mode,
) {
  const adjacent = new Map<string, { id: string; edge: string }[]>();
  const add = (a: string, b: string, edge: string) => {
    const rows = adjacent.get(a) ?? [];
    rows.push({ id: b, edge });
    adjacent.set(a, rows);
  };
  for (const r of relationships) {
    if (
      !eligible(r, filters) ||
      (mode !== "connections" && r.type !== "parent_of")
    )
      continue;
    if (mode === "ancestors") add(r.to, r.from, r.id);
    else add(r.from, r.to, r.id);
    if (mode === "connections") add(r.to, r.from, r.id);
  }
  return adjacent;
}
export function neighborhood(
  relationships: Relationship[],
  selected: string | null,
  mode: Mode,
  hops: number,
  filters: Filters,
) {
  const nodes = new Set<string>();
  const edges = new Set<string>();
  const depths = new Map<string, number>();
  if (!selected) return { nodes, edges, depths };
  const adjacent = indexRelations(relationships, filters, mode);
  nodes.add(selected);
  depths.set(selected, 0);
  const queue = [selected];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const current = queue[cursor];
    const depth = depths.get(current)!;
    if (depth >= Math.max(0, Math.min(6, hops))) continue;
    for (const next of adjacent.get(current) ?? []) {
      edges.add(next.edge);
      if (!nodes.has(next.id)) {
        nodes.add(next.id);
        depths.set(next.id, depth + 1);
        queue.push(next.id);
      }
    }
  }
  return { nodes, edges, depths };
}
export function hasParentCycle(
  relationships: Relationship[],
  nodes?: Set<string>,
) {
  const indegree = new Map<string, number>();
  const next = new Map<string, string[]>();
  for (const r of relationships) {
    if (
      r.type !== "parent_of" ||
      (nodes && (!nodes.has(r.from) || !nodes.has(r.to)))
    )
      continue;
    indegree.set(r.from, indegree.get(r.from) ?? 0);
    indegree.set(r.to, (indegree.get(r.to) ?? 0) + 1);
    next.set(r.from, [...(next.get(r.from) ?? []), r.to]);
  }
  const queue = [...indegree.keys()].filter((id) => indegree.get(id) === 0);
  let removed = 0;
  for (let i = 0; i < queue.length; i++) {
    removed++;
    for (const to of next.get(queue[i]) ?? []) {
      indegree.set(to, indegree.get(to)! - 1);
      if (!indegree.get(to)) queue.push(to);
    }
  }
  return removed < indegree.size;
}
export function makeGraph(
  dataset: Dataset,
  filters: Filters,
  visible?: Set<string>,
) {
  const graph = new Graph({
    type: "mixed",
    multi: true,
    allowSelfLoops: false,
  });
  const characters = visible
    ? dataset.characters.filter((c) => visible.has(c.id))
    : dataset.characters;
  characters.forEach((c, index) => {
    const angle = index * Math.PI * (3 - Math.sqrt(5));
    const radius = Math.sqrt(index + 1) * 12;
    graph.addNode(c.id, {
      label: c.name,
      x: radius * Math.cos(angle),
      y: radius * Math.sin(angle),
      color: palette[c.kind],
      size: 6,
      status: c.status,
    });
  });
  for (const r of dataset.relationships) {
    if (
      !eligible(r, filters) ||
      !graph.hasNode(r.from) ||
      !graph.hasNode(r.to) ||
      r.from === r.to
    )
      continue;
    const attributes = {
      type: r.type === "parent_of" ? "arrow" : "line",
      size: 1.5,
      color:
        r.status !== "supported"
          ? "#b075ac"
          : r.type === "spouse_of"
            ? "#769aaa"
            : r.type === "sibling_of"
              ? "#bd9664"
              : "#9cafa0",
      label: `${r.type.replace("_of", "").replace("_", " ")}${r.parenthood ? ` · ${r.parenthood}` : ""}`,
      status: r.status,
    };
    if (r.type === "parent_of")
      graph.addDirectedEdgeWithKey(r.id, r.from, r.to, attributes);
    else graph.addUndirectedEdgeWithKey(r.id, r.from, r.to, attributes);
  }
  return graph;
}
export function searchCharacters(characters: Character[], query: string) {
  if (!query.trim())
    return characters.slice().sort((a, b) => a.name.localeCompare(b.name));
  const normalized = query
    .trim()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  const exact = characters.filter((c) =>
    [c.name, ...c.aliases.map((a) => a.label)].some(
      (n) =>
        n.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase() === normalized,
    ),
  );
  const fuse = new Fuse(characters, {
    keys: ["name", "aliases.label"],
    threshold: 0.35,
    ignoreLocation: true,
    ignoreDiacritics: true,
  });
  const ids = new Set(exact.map((c) => c.id));
  return [
    ...exact,
    ...fuse
      .search(query)
      .map((r) => r.item)
      .filter((c) => !ids.has(c.id)),
  ];
}
export type ViewState = {
  epic: string;
  selected: string | null;
  view: "overview" | "family";
  mode: Mode;
  hops: number;
  filters: Filters;
};
export function parseHash(hash: string): ViewState {
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  const mode = p.get("mode");
  const rawHops = Number(p.get("hops") ?? 2);
  return {
    epic: p.get("epic") || "mahabharata",
    selected: p.get("character"),
    view: p.get("view") === "family" ? "family" : "overview",
    mode: mode === "ancestors" || mode === "connections" ? mode : "descendants",
    hops: Number.isFinite(rawHops)
      ? Math.min(6, Math.max(0, Math.round(rawHops)))
      : 2,
    filters: {
      relationships: p.has("relations")
        ? (p.get("relations") || "")
            .split(",")
            .filter((t) => ["parent_of", "spouse_of", "sibling_of"].includes(t))
        : ["parent_of", "spouse_of", "sibling_of"],
      parenthood: p.has("parenthood")
        ? (p.get("parenthood") || "")
            .split(",")
            .filter((t) =>
              [
                "biological",
                "divine",
                "adoptive",
                "social",
                "unspecified",
              ].includes(t),
            )
        : ["biological", "divine", "adoptive", "social", "unspecified"],
      uncertain: p.get("uncertain") === "1",
    },
  };
}
export function serializeHash(s: ViewState) {
  const p = new URLSearchParams({
    epic: s.epic,
    view: s.view,
    mode: s.mode,
    hops: String(s.hops),
    relations: s.filters.relationships.join(","),
    parenthood: s.filters.parenthood.join(","),
    uncertain: s.filters.uncertain ? "1" : "0",
  });
  if (s.selected) p.set("character", s.selected);
  return `#${p}`;
}
