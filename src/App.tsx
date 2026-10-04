import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Network,
  GitBranch,
  ZoomIn,
  ZoomOut,
  Maximize,
  RotateCcw,
  Share2,
  ArrowRight,
  BookOpen,
  ChevronRight,
  X,
  Users,
  Check,
  Info,
  Github,
  Menu,
} from "lucide-react";
import GraphPanel, { type GraphControls } from "./GraphPanel";
import {
  DatasetSchema,
  ManifestSchema,
  type Dataset,
  type Manifest,
  type Character,
  type Evidence,
  type Relationship,
  type Mode,
} from "./data/schema";
import {
  neighborhood,
  parseHash,
  serializeHash,
  searchCharacters,
  palette,
  eligible,
} from "./data/graph";

function EvidenceList({
  evidence,
  dataset,
}: {
  evidence: Evidence[];
  dataset: Dataset;
}) {
  return (
    <div className="evidence-list">
      {evidence.map((e) => (
        <details key={e.id}>
          <summary>
            <BookOpen size={13} />
            <span>
              {e.parva} · section {e.section}
            </span>
            <span className="page-ref">p. {e.page}</span>
          </summary>
          <blockquote>“{e.excerpt}”</blockquote>
          <p className="source-caption">
            {dataset.sources.find((s) => s.id === e.sourceId)?.translator}{" "}
            translation · PDF page {e.page} · source-supported excerpt
          </p>
        </details>
      ))}
    </div>
  );
}
const statusLabels = {
  supported: "Source-supported",
  provisional: "Provisional identity or claim",
  disputed: "Disputed claim",
};
export default function App() {
  const [state, setState] = useState(() => parseHash(window.location.hash));
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [gender, setGender] = useState("all");
  const [page, setPage] = useState(0);
  const [relationshipId, setRelationshipId] = useState<string | null>(null);
  const [shared, setShared] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<"graph" | "browse" | "detail">(
    "graph",
  );
  const [showCoverage, setShowCoverage] = useState(false);
  const graph = useRef<GraphControls>(null);
  const modal = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!showCoverage) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowCoverage(false);
        return;
      }
      if (event.key !== "Tab") return;
      const targets = [
        ...(modal.current?.querySelectorAll<HTMLElement>(
          'button, a[href], input, select, summary, [tabindex="0"]',
        ) ?? []),
      ];
      const first = targets[0];
      const last = targets.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [showCoverage]);
  useEffect(() => {
    const abort = new AbortController();
    fetch(`${import.meta.env.BASE_URL}data/manifest.json`, {
      signal: abort.signal,
    })
      .then((r) => {
        if (!r.ok) throw new Error("Could not load the epic catalog.");
        return r.json();
      })
      .then((d) => setManifest(ManifestSchema.parse(d)))
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => abort.abort();
  }, []);
  useEffect(() => {
    if (!manifest) return;
    const epic = manifest.epics.find((e) => e.id === state.epic);
    if (!epic?.dataset) {
      setDataset(null);
      setError(
        "This epic is not yet available. Choose Mahabharata to explore the current atlas.",
      );
      return;
    }
    const abort = new AbortController();
    setError("");
    setDataset(null);
    fetch(`${import.meta.env.BASE_URL}data/${epic.dataset}`, {
      signal: abort.signal,
    })
      .then((r) => {
        if (!r.ok) throw new Error("Could not load the character dataset.");
        return r.json();
      })
      .then((d) => {
        const parsed = DatasetSchema.parse(d);
        if (parsed.epicId !== state.epic)
          throw new Error("Dataset does not match the selected epic.");
        setDataset(parsed);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => abort.abort();
  }, [manifest, state.epic]);
  useEffect(() => {
    const onHash = () => {
      setState(parseHash(window.location.hash));
      setRelationshipId(null);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    const hash = serializeHash(state);
    if (window.location.hash !== hash)
      window.history.replaceState(null, "", hash);
  }, [state]);
  useEffect(() => setPage(0), [query, kind, gender]);
  const byId = useMemo(
    () => new Map(dataset?.characters.map((c) => [c.id, c]) ?? []),
    [dataset],
  );
  const selected = state.selected ? byId.get(state.selected) : undefined;
  const focus = useMemo(
    () =>
      neighborhood(
        dataset?.relationships ?? [],
        state.selected,
        state.mode,
        state.hops,
        state.filters,
      ),
    [dataset, state.selected, state.mode, state.hops, state.filters],
  );
  const results = useMemo(
    () =>
      searchCharacters(dataset?.characters ?? [], query).filter((c) => {
        if (kind !== "all" && c.kind !== kind) return false;
        if (gender === "all") return true;
        if (gender === "unspecified") return c.gender.length === 0;
        return c.gender.some((g) => g.label.toLowerCase() === gender);
      }),
    [dataset, query, kind, gender],
  );
  const relations = useMemo(
    () =>
      dataset?.relationships.filter(
        (r) =>
          (r.from === state.selected || r.to === state.selected) &&
          eligible(r, state.filters),
      ) ?? [],
    [dataset, state.selected, state.filters],
  );
  const inspectedRelationship = dataset?.relationships.find(
    (r) => r.id === relationshipId,
  );
  const evidence = (ids: string[]) =>
    dataset?.evidence.filter((e) => ids.includes(e.id)) ?? [];
  const choose = (id: string) => {
    setState((s) => ({ ...s, selected: id }));
    setRelationshipId(null);
    setMobilePanel("detail");
  };
  const reset = () => {
    setState((s) => ({ ...parseHash(""), epic: s.epic }));
    setRelationshipId(null);
    graph.current?.fit();
  };
  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    } catch {
      window.prompt("Copy this link", window.location.href);
    }
  };
  const toggle = (group: "relationships" | "parenthood", value: string) =>
    setState((s) => ({
      ...s,
      filters: {
        ...s.filters,
        [group]: s.filters[group].includes(value)
          ? s.filters[group].filter((x) => x !== value)
          : [...s.filters[group], value],
      },
    }));
  const labelRelation = (r: Relationship) =>
    r.type === "parent_of"
      ? r.from === state.selected
        ? "Child"
        : "Parent"
      : r.type === "spouse_of"
        ? "Spouse"
        : r.derived
          ? "Sibling · derived"
          : "Sibling";
  const coverage = dataset?.coverage;
  const percentage = coverage?.totalBatches
    ? (100 * coverage.reviewedBatchIds.length) / coverage.totalBatches
    : 0;
  const selectedEvidence = selected
    ? evidence([
        ...new Set([
          ...selected.evidenceIds,
          ...selected.aliases.flatMap((a) => a.evidenceIds),
          ...selected.gender.flatMap((g) => g.evidenceIds),
        ]),
      ])
    : [];
  const currentEpic = manifest?.epics.find((e) => e.id === state.epic);
  return (
    <div className="app">
      <header className="header">
        <a
          href={import.meta.env.BASE_URL}
          className="brand"
          aria-label="Epic Character Atlas home"
        >
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" />
          <span>
            Epic Character <strong>Atlas</strong>
            <small>THE STORIES THAT CONNECT US</small>
          </span>
        </a>
        <div className="header-divider" />
        <label className="epic-picker">
          <span className="sr-only">Choose epic</span>
          <select
            value={state.epic}
            onChange={(e) => {
              setState((s) => ({ ...s, epic: e.target.value, selected: null }));
              setQuery("");
            }}
          >
            {(
              manifest?.epics ?? [
                {
                  id: "mahabharata",
                  title: "Mahabharata",
                  status: "available",
                },
              ]
            ).map((e) => (
              <option
                key={e.id}
                value={e.id}
                disabled={e.status !== "available"}
              >
                {e.title}
                {e.status !== "available" ? " · coming later" : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="header-right">
          <button
            className="coverage-pill"
            onClick={() => setShowCoverage(true)}
          >
            <span className="dot" />
            Expanding atlas
            <Info size={13} />
          </button>
          <a
            className="icon-button github"
            href="https://github.com/siddhartha047/epic-character-atlas"
            aria-label="Public GitHub repository"
            target="_blank"
            rel="noreferrer"
          >
            <Github size={19} />
          </a>
        </div>
      </header>
      <nav className="mobile-tabs" aria-label="Atlas panels">
        <button
          className={mobilePanel === "browse" ? "active" : ""}
          onClick={() => setMobilePanel("browse")}
        >
          <Search size={15} />
          Browse
        </button>
        <button
          className={mobilePanel === "graph" ? "active" : ""}
          onClick={() => setMobilePanel("graph")}
        >
          <Network size={15} />
          Graph
        </button>
        <button
          className={mobilePanel === "detail" ? "active" : ""}
          onClick={() => setMobilePanel("detail")}
        >
          <Users size={15} />
          Character
        </button>
      </nav>
      <main className={`workspace mobile-${mobilePanel}`}>
        <aside className="browse-panel">
          <div className="browse-top">
            <p className="eyebrow">EXPLORE THE EPIC</p>
            <h1>{currentEpic?.title ?? "Mahabharata"}</h1>
            <p className="muted edition">
              {currentEpic?.subtitle ?? "An atlas of characters and kinship"}
            </p>
            <div className="search-box">
              <Search size={18} />
              <input
                aria-label="Search characters and aliases"
                placeholder="Search a name or an alias…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button onClick={() => setQuery("")} aria-label="Clear search">
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="browse-filters">
              <label>
                <span className="sr-only">Character type</span>
                <select value={kind} onChange={(e) => setKind(e.target.value)}>
                  <option value="all">All beings</option>
                  {Object.keys(palette).map((k) => (
                    <option key={k} value={k}>
                      {k[0].toUpperCase() + k.slice(1)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="sr-only">Gender claim</span>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                >
                  <option value="all">All genders</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="unspecified">Not stated</option>
                  {[
                    ...new Set(
                      dataset?.characters.flatMap((c) =>
                        c.gender.map((g) => g.label.toLowerCase()),
                      ) ?? [],
                    ),
                  ]
                    .filter((g) => !["female", "male"].includes(g))
                    .map((g) => (
                      <option key={g}>{g}</option>
                    ))}
                </select>
              </label>
            </div>
          </div>
          <div className="result-caption">
            <span>{query ? "SEARCH RESULTS" : "CHARACTER DIRECTORY"}</span>
            <span>{results.length.toLocaleString()}</span>
          </div>
          <div
            className="character-list"
            aria-label="Searchable character directory"
            aria-live="polite"
          >
            {results.slice(page * 50, (page + 1) * 50).map((c) => {
              const e = evidence(c.evidenceIds)[0];
              const namesake = results.some(
                (other) => other.id !== c.id && other.name === c.name,
              );
              return (
                <button
                  key={c.id}
                  className={`character-row ${state.selected === c.id ? "selected" : ""}`}
                  onClick={() => choose(c.id)}
                  aria-pressed={state.selected === c.id}
                >
                  <span
                    className="node-dot"
                    style={{ background: palette[c.kind] }}
                  />
                  <span>
                    <strong>{c.name}</strong>
                    <small>
                      {namesake
                        ? c.description ||
                          `${e?.parva ?? c.kind} · p. ${e?.page}`
                        : c.aliases.length
                          ? `Also ${c.aliases
                              .slice(0, 2)
                              .map((a) => a.label)
                              .join(", ")}`
                          : c.description || c.kind}
                      {c.status !== "supported" ? " · provisional" : ""}
                    </small>
                  </span>
                  <ChevronRight size={14} />
                </button>
              );
            })}
            {!results.length && dataset && (
              <div className="empty-results">
                <Search size={24} />
                <p>No matching characters yet.</p>
                <small>
                  This is a growing inventory. Try another spelling or clear the
                  filters.
                </small>
              </div>
            )}
          </div>
          {results.length > 50 && (
            <div className="pagination">
              <button
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <span>
                {page + 1} / {Math.ceil(results.length / 50)}
              </span>
              <button
                disabled={(page + 1) * 50 >= results.length}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          )}
          <button
            className="source-footer"
            onClick={() => setShowCoverage(true)}
          >
            <BookOpen size={16} />
            <span>
              Grounded in the original text
              <small>Source evidence · coverage · methodology</small>
            </span>
            <ArrowRight size={15} />
          </button>
        </aside>
        <section className="graph-region" aria-label="Graph explorer">
          <div className="graph-toolbar">
            <div className="segmented">
              <button
                className={state.view === "overview" ? "active" : ""}
                onClick={() => setState((s) => ({ ...s, view: "overview" }))}
              >
                <Network size={15} />
                Overview
              </button>
              <button
                className={state.view === "family" ? "active" : ""}
                onClick={() => setState((s) => ({ ...s, view: "family" }))}
              >
                <GitBranch size={15} />
                Family view
              </button>
            </div>
            <button className="share-button" onClick={share}>
              {shared ? <Check size={15} /> : <Share2 size={15} />}
              <span>{shared ? "Copied" : "Share view"}</span>
            </button>
          </div>
          <div className="graph-area">
            {dataset && (
              <GraphPanel
                ref={graph}
                dataset={dataset}
                selected={state.selected}
                view={state.view}
                mode={state.mode}
                hops={state.hops}
                filters={state.filters}
                onSelect={choose}
                onEdge={(id) => {
                  setRelationshipId(id);
                  setMobilePanel("detail");
                }}
              />
            )}
            {!dataset && (
              <div className="loading-state" role="status">
                <BookOpen size={32} />
                <h2>{error ? "Atlas unavailable" : "Opening the atlas…"}</h2>
                <p>{error || "Gathering characters and their connections."}</p>
                {error && (
                  <button
                    onClick={() => {
                      window.location.hash = "";
                      window.location.reload();
                    }}
                  >
                    Retry Mahabharata
                  </button>
                )}
              </div>
            )}
            <div className="map-heading">
              <p className="eyebrow">
                {state.view === "family"
                  ? "FAMILY EXPLORER"
                  : "THE CONNECTED WORLD"}
              </p>
              <h2>{selected ? selected.name : "Every family has a story."}</h2>
              <p>
                {selected
                  ? `${state.mode === "connections" ? "Family connections" : state.mode[0].toUpperCase() + state.mode.slice(1)} · ${state.hops} ${state.hops === 1 ? "hop" : "hops"} · ${focus.nodes.size} ${focus.nodes.size === 1 ? "character" : "characters"}`
                  : "Find a character. Follow the connections."}
              </p>
            </div>
            <div className="zoom-controls">
              <button
                aria-label="Zoom in"
                onClick={() => graph.current?.zoom(1)}
              >
                <ZoomIn size={18} />
              </button>
              <button
                aria-label="Zoom out"
                onClick={() => graph.current?.zoom(-1)}
              >
                <ZoomOut size={18} />
              </button>
              <button
                aria-label="Fit graph"
                onClick={() => graph.current?.fit()}
              >
                <Maximize size={17} />
              </button>
              <button aria-label="Reset view" onClick={reset}>
                <RotateCcw size={17} />
              </button>
            </div>
            <div className="legend">
              <span className="legend-title">CHARACTERS</span>
              {["human", "deity", "sage", "demon", "animal", "unknown"]
                .filter((k) => dataset?.characters.some((c) => c.kind === k))
                .map((k) => (
                  <span key={k}>
                    <i style={{ background: palette[k] }} />
                    {k === "unknown"
                      ? "Unclassified"
                      : k[0].toUpperCase() + k.slice(1)}
                  </span>
                ))}
              <span className="legend-edge">
                <i />
                Parent → child
              </span>
              <span className="legend-edge spouse">
                <i />
                Spouse
              </span>
              {(state.filters.uncertain ||
                dataset?.characters.some((c) => c.status !== "supported")) && (
                <span>
                  <i style={{ background: "#b075ac" }} />
                  Provisional / disputed
                </span>
              )}
            </div>
            <div className="graph-counts">
              {dataset?.characters.length.toLocaleString() ?? "—"} characters
              <span>·</span>
              {dataset?.relationships.length.toLocaleString() ?? "—"}{" "}
              connections
              <span className="count-hint">
                Scroll to zoom · drag to explore
              </span>
            </div>
          </div>
          <div className="traversal-controls">
            <label>
              <span>FOLLOW</span>
              <select
                aria-label="Traversal direction"
                value={state.mode}
                onChange={(e) =>
                  setState((s) => ({ ...s, mode: e.target.value as Mode }))
                }
              >
                <option value="descendants">Descendants</option>
                <option value="ancestors">Ancestors</option>
                <option value="connections">All family connections</option>
              </select>
            </label>
            <div className="hops-control">
              <label htmlFor="hops">
                DEPTH <strong>{state.hops} hops</strong>
              </label>
              <input
                id="hops"
                type="range"
                min="0"
                max="6"
                step="1"
                value={state.hops}
                onChange={(e) =>
                  setState((s) => ({ ...s, hops: Number(e.target.value) }))
                }
              />
              <span>0</span>
              <span>6</span>
            </div>
            <button
              className="clear-selection"
              onClick={() => {
                setState((s) => ({ ...s, selected: null }));
                setRelationshipId(null);
              }}
            >
              Clear selection
            </button>
          </div>
        </section>
        <aside className="details-panel">
          {inspectedRelationship && dataset ? (
            <div className="detail-content">
              <button
                className="back-link"
                onClick={() => setRelationshipId(null)}
              >
                ← Character details
              </button>
              <p className="eyebrow">RELATIONSHIP EVIDENCE</p>
              <h2>
                {byId.get(inspectedRelationship.from)?.name}
                <span className="relation-symbol">
                  {inspectedRelationship.type === "parent_of" ? "↓" : "↔"}
                </span>
                {byId.get(inspectedRelationship.to)?.name}
              </h2>
              <p className="muted">
                {inspectedRelationship.type.replaceAll("_", " ")}
                {inspectedRelationship.parenthood
                  ? ` · ${inspectedRelationship.parenthood}`
                  : ""}
              </p>
              <span className={`status-tag ${inspectedRelationship.status}`}>
                {statusLabels[inspectedRelationship.status]}
              </span>
              {inspectedRelationship.derived && (
                <p>
                  This sibling connection is derived from the cited parent
                  claims.
                </p>
              )}
              <h3>Source passages</h3>
              <EvidenceList
                evidence={evidence(inspectedRelationship.evidenceIds)}
                dataset={dataset}
              />
            </div>
          ) : selected && dataset ? (
            <div className="detail-content">
              <p className="eyebrow">CHARACTER PROFILE</p>
              <div
                className="profile-marker"
                style={{ background: palette[selected.kind] }}
              >
                <Users size={24} />
              </div>
              <h2>{selected.name}</h2>
              <div className="profile-tags">
                <span>{selected.kind}</span>
                {[...new Set(selected.gender.map((g) => g.label))].map((g) => (
                  <span key={g}>{g}</span>
                ))}
              </div>
              <p className="profile-description">
                {selected.description ||
                  "An individually identifiable character in the supplied text."}
              </p>
              <span className={`status-tag ${selected.status}`}>
                {statusLabels[selected.status]}
              </span>
              {selected.aliases.length > 0 && (
                <section className="alias-section">
                  <h3>Names in the text</h3>
                  <div>
                    {selected.aliases.map((a) => (
                      <span key={a.label}>{a.label}</span>
                    ))}
                  </div>
                </section>
              )}
              {selected.gender.some((g) => g.context) && (
                <p className="gender-context">
                  {selected.gender
                    .filter((g) => g.context)
                    .map((g) => g.context)
                    .join(" · ")}
                </p>
              )}
              <h3 className="section-title">
                Family connections <span>{relations.length}</span>
              </h3>
              <div className="relation-list">
                {relations.map((r) => {
                  const other = byId.get(
                    r.from === selected.id ? r.to : r.from,
                  );
                  return (
                    <div className="relation-row" key={r.id}>
                      <button onClick={() => choose(other!.id)}>
                        <strong>{other?.name}</strong>
                        <small>
                          {labelRelation(r)}
                          {r.parenthood ? ` · ${r.parenthood}` : ""}
                          {r.status !== "supported" ? ` · ${r.status}` : ""}
                        </small>
                      </button>
                      <button
                        className="evidence-button"
                        aria-label={`Inspect relationship with ${other?.name}`}
                        onClick={() => setRelationshipId(r.id)}
                      >
                        <BookOpen size={15} />
                      </button>
                    </div>
                  );
                })}
                {!relations.length && (
                  <p className="muted">
                    No family claims under the current filters. This character
                    remains part of the atlas.
                  </p>
                )}
              </div>
              <h3 className="section-title">
                Source passages <span>{selectedEvidence.length}</span>
              </h3>
              <EvidenceList evidence={selectedEvidence} dataset={dataset} />
              <p className="identity-id">Stable identity: {selected.id}</p>
            </div>
          ) : (
            <div className="welcome-detail">
              <div className="welcome-art">
                <GitBranch size={46} strokeWidth={1} />
                <span />
                <span />
                <span />
              </div>
              <p className="eyebrow">BEGIN WITH A NAME</p>
              <h2>
                Trace a lineage.
                <br />
                Discover a connection.
              </h2>
              <p>
                Select any character to explore their family and read the
                passages behind each connection.
              </p>
              <div className="starter-picks">
                {["Pandu", "Kunti", "Arjuna"].map((name) => {
                  const c = dataset?.characters.find((c) => c.name === name);
                  return c ? (
                    <button key={name} onClick={() => choose(c.id)}>
                      {name}
                      <ArrowRight size={15} />
                    </button>
                  ) : null;
                })}
              </div>
              {state.selected && !selected && dataset && (
                <p role="status">
                  The shared character is not in this dataset yet. Search the
                  current inventory.
                </p>
              )}
              <div className="reading-note">
                <BookOpen size={18} />
                <p>
                  A graph of evidence.
                  <br />
                  <small>Every connection leads back to the text.</small>
                </p>
              </div>
            </div>
          )}
          <div className="relationship-filters">
            <details open>
              <summary>Relationship filters</summary>
              <div className="filter-checks">
                {[
                  ["parent_of", "Parents & children"],
                  ["spouse_of", "Spouses"],
                  ["sibling_of", "Siblings"],
                ].map(([value, label]) => (
                  <label key={value}>
                    <input
                      type="checkbox"
                      checked={state.filters.relationships.includes(value)}
                      onChange={() => toggle("relationships", value)}
                    />
                    {label}
                  </label>
                ))}
                <label className="uncertain-filter">
                  <input
                    type="checkbox"
                    checked={state.filters.uncertain}
                    onChange={(e) =>
                      setState((s) => ({
                        ...s,
                        filters: { ...s.filters, uncertain: e.target.checked },
                      }))
                    }
                  />
                  Include provisional claims
                </label>
              </div>
              <details>
                <summary className="sub-filter">Parenthood types</summary>
                <div className="filter-checks">
                  {[
                    "biological",
                    "divine",
                    "adoptive",
                    "social",
                    "unspecified",
                  ].map((value) => (
                    <label key={value}>
                      <input
                        type="checkbox"
                        checked={state.filters.parenthood.includes(value)}
                        onChange={() => toggle("parenthood", value)}
                      />
                      {value[0].toUpperCase() + value.slice(1)}
                    </label>
                  ))}
                </div>
              </details>
            </details>
          </div>
        </aside>
      </main>
      {showCoverage && dataset && (
        <div className="modal-backdrop" onClick={() => setShowCoverage(false)}>
          <section
            ref={modal}
            className="coverage-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="coverage-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              autoFocus
              aria-label="Close coverage"
              onClick={() => setShowCoverage(false)}
            >
              <X size={20} />
            </button>
            <p className="eyebrow">AN EXPANDING, SOURCE-GROUNDED ATLAS</p>
            <h2 id="coverage-title">
              The whole epic.
              <br />
              One passage at a time.
            </h2>
            <p>
              The aim is every identifiable character in this edition. The
              current release is partial. Page processing and identity review
              are reported separately.
            </p>
            <div className="coverage-numbers">
              <div>
                <strong>{dataset.characters.length.toLocaleString()}</strong>
                <span>characters</span>
              </div>
              <div>
                <strong>{coverage?.totalPages.toLocaleString()}</strong>
                <span>source pages</span>
              </div>
              <div>
                <strong>{coverage?.totalBooks}</strong>
                <span>books</span>
              </div>
            </div>
            <div className="progress-track">
              <span style={{ width: `${percentage}%` }} />
            </div>
            <p className="progress-label">
              {coverage?.reviewedBatchIds.length} / {coverage?.totalBatches}{" "}
              batches omission-checked · {percentage.toFixed(1)}%
            </p>
            <p>{coverage?.message}</p>
            <div className="methodology">
              <h3>How to read this atlas</h3>
              <p>
                Search includes aliases, namesakes, and distinguishable unnamed
                people. Parent arrows point toward children. Descendants follow
                parent claims only; spouses and siblings do not count as
                descendants.
              </p>
              <p>
                “Source-supported” means a claim is supported by a cited
                passage. Batch checks use Codex; they are not a complete human
                review. {coverage?.unresolvedCount ?? 0} provisional records or
                open extraction/identity issues remain. Ambiguous names are kept
                separate.
              </p>
              <p>
                {coverage?.reviewedPages.length} complete pages and{" "}
                {coverage?.reviewedBooks.length} books have completed all
                associated batch checks. Processing every page cannot prove that
                every character was found.
              </p>
              <p>
                Source: {dataset.sources[0]?.title}, translated by{" "}
                {dataset.sources[0]?.translator}. PDF page numbers refer to the
                supplied file. Full PDFs are not redistributed.
              </p>
              {dataset.issues.filter((issue) => issue.status === "open")
                .length > 0 && (
                <details>
                  <summary>Open extraction and identity issues</summary>
                  <ul>
                    {dataset.issues
                      .filter((issue) => issue.status === "open")
                      .map((issue) => (
                        <li key={issue.id}>
                          <strong>
                            {issue.batchId} · {issue.category}
                          </strong>
                          : {issue.description}
                        </li>
                      ))}
                  </ul>
                </details>
              )}
            </div>
            <button
              className="primary-button"
              onClick={() => setShowCoverage(false)}
            >
              Explore the atlas
              <ArrowRight size={16} />
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
