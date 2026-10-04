import { describe, it, expect } from "vitest";
import sample from "../data/epics/mahabharata/graph.json";
import {
  DatasetSchema,
  defaultFilters,
  type Dataset,
  type Relationship,
} from "../src/data/schema";
import {
  neighborhood,
  searchCharacters,
  hasParentCycle,
  makeGraph,
  parseHash,
  serializeHash,
} from "../src/data/graph";
const data = DatasetSchema.parse(sample);
const id = (name: string) => data.characters.find((c) => c.name === name)!.id;
const claim = (
  from: string,
  to: string,
  type: Relationship["type"] = "parent_of",
  status: Relationship["status"] = "supported",
): Relationship => ({
  id: `${from}-${to}-${type}`,
  from,
  to,
  type,
  status,
  parenthood: type === "parent_of" ? "biological" : null,
  evidenceIds: [data.evidence[0].id],
  derived: false,
  supportingRelationshipIds: [],
});
describe("family traversal", () => {
  const relations = [
    claim("a", "b"),
    claim("b", "c"),
    claim("c", "d"),
    claim("a", "spouse", "spouse_of"),
    claim("a", "sibling", "sibling_of"),
    claim("a", "uncertain", "parent_of", "provisional"),
  ];
  it("two descendant hops includes children and grandchildren, not spouses/siblings", () => {
    expect([
      ...neighborhood(relations, "a", "descendants", 2, defaultFilters).nodes,
    ]).toEqual(["a", "b", "c"]);
  });
  it("ancestor traversal reverses parent edges only", () =>
    expect([
      ...neighborhood(relations, "c", "ancestors", 2, defaultFilters).nodes,
    ]).toEqual(["c", "b", "a"]));
  it("all-family connections traverses symmetric links", () =>
    expect(
      neighborhood(
        relations,
        "spouse",
        "connections",
        1,
        defaultFilters,
      ).nodes.has("a"),
    ).toBe(true));
  it("zero hops preserves the selected character", () =>
    expect([
      ...neighborhood(relations, "a", "descendants", 0, defaultFilters).nodes,
    ]).toEqual(["a"]));
  it("provisional claims are excluded unless explicitly included", () => {
    expect(
      neighborhood(relations, "a", "descendants", 1, defaultFilters).nodes.has(
        "uncertain",
      ),
    ).toBe(false);
    expect(
      neighborhood(relations, "a", "descendants", 1, {
        ...defaultFilters,
        uncertain: true,
      }).nodes.has("uncertain"),
    ).toBe(true);
  });
  it("parenthood and relationship filters affect traversal", () => {
    expect(
      neighborhood(relations, "a", "descendants", 2, {
        ...defaultFilters,
        parenthood: ["divine"],
      }).nodes.size,
    ).toBe(1);
    expect(
      neighborhood(relations, "a", "connections", 1, {
        ...defaultFilters,
        relationships: ["spouse_of"],
      }).nodes.size,
    ).toBe(2);
  });
  it("cycles terminate and remain detectable, including disconnected cycles", () => {
    const cyclic = [
      ...relations,
      claim("c", "a"),
      claim("x", "y"),
      claim("y", "x"),
    ];
    expect(
      neighborhood(cyclic, "a", "descendants", 6, defaultFilters).nodes.size,
    ).toBe(4);
    expect(hasParentCycle(cyclic)).toBe(true);
    expect(hasParentCycle(relations)).toBe(false);
    expect(hasParentCycle(cyclic, new Set(["spouse"]))).toBe(false);
  });
  it("Pandu uses social parenthood; the divine fathers remain distinct", () => {
    const sons = neighborhood(
      data.relationships,
      id("Pandu"),
      "descendants",
      1,
      defaultFilters,
    ).nodes;
    expect(sons.has(id("Arjuna"))).toBe(true);
    expect(
      neighborhood(data.relationships, id("Pandu"), "descendants", 1, {
        ...defaultFilters,
        parenthood: ["biological"],
      }).nodes.size,
    ).toBe(1);
  });
});
describe("search, identities, graph model and URLs", () => {
  it("searches source-supported aliases and misspellings", () => {
    expect(searchCharacters(data.characters, "Pritha")[0].name).toBe("Kunti");
    expect(searchCharacters(data.characters, "Arjun")[0].name).toBe("Arjuna");
  });
  it("keeps the two Janamejayas and two Satanikas distinct", () => {
    for (const name of ["Janamejaya", "Satanika"]) {
      const found = searchCharacters(data.characters, name).filter(
        (c) => c.name === name,
      );
      expect(found.length).toBeGreaterThanOrEqual(2);
      expect(new Set(found.map((c) => c.id)).size).toBe(found.length);
    }
  });
  it("includes identifiable unnamed people and animals", () =>
    expect(
      searchCharacters(data.characters, "unnamed").length,
    ).toBeGreaterThanOrEqual(2));
  it("preserves isolates and mixed multiple edges", () => {
    const graph = makeGraph(data, defaultFilters);
    expect(graph.order).toBe(data.characters.length);
    expect(graph.hasNode(id("Saunaka"))).toBe(true);
    expect(graph.degree(id("Saunaka"))).toBe(0);
    expect(graph.type).toBe("mixed");
    expect(graph.multi).toBe(true);
    expect(
      graph.isDirected(
        data.relationships.find((r) => r.type === "parent_of")!.id,
      ),
    ).toBe(true);
    expect(
      graph.isUndirected(
        data.relationships.find((r) => r.type === "spouse_of")!.id,
      ),
    ).toBe(true);
  });
  it("round trips every view/filter option including empty filters", () => {
    const view = {
      ...parseHash(""),
      selected: id("Kunti"),
      view: "family" as const,
      mode: "ancestors" as const,
      hops: 4,
      filters: { relationships: [], parenthood: ["social"], uncertain: true },
    };
    expect(parseHash(serializeHash(view))).toEqual(view);
  });
  it("sanitizes invalid modes and depths from shared links", () => {
    expect(parseHash("#mode=bad&hops=Infinity").hops).toBe(2);
    expect(parseHash("#hops=99").hops).toBe(6);
    expect(parseHash("#hops=-5").hops).toBe(0);
  });
});
it("handles a 10,000-node / 30,000-edge multigraph and bounded traversal", () => {
  const large: Dataset = {
    ...data,
    characters: Array.from({ length: 10000 }, (_, i) => ({
      ...data.characters[0],
      id: `mahabharata:stress:${i}`,
      name: `Character ${i}`,
    })),
    relationships: [],
  };
  for (let i = 0; i < 30000; i++)
    large.relationships.push({
      ...claim(
        `mahabharata:stress:${i % 10000}`,
        `mahabharata:stress:${(i + 1 + Math.floor(i / 10000)) % 10000}`,
      ),
      id: `stress-edge-${i}`,
    });
  const graph = makeGraph(large, defaultFilters);
  expect(graph.order).toBe(10000);
  expect(graph.size).toBe(30000);
  const focus = neighborhood(
    large.relationships,
    "mahabharata:stress:0",
    "descendants",
    6,
    defaultFilters,
  );
  expect(focus.nodes.size).toBeGreaterThan(6);
  expect(focus.nodes.size).toBeLessThan(30);
});
