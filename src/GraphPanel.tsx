import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  forwardRef,
} from "react";
import Sigma from "sigma";
import { EdgeArrowProgram } from "sigma/rendering";
import EdgeCurveProgram, { EdgeCurvedArrowProgram } from "@sigma/edge-curve";
import FA2Layout from "graphology-layout-forceatlas2/worker";
import dagre from "@dagrejs/dagre";
import type { Dataset, Filters, Mode } from "./data/schema";
import {
  makeGraph,
  neighborhood,
  hasParentCycle,
  eligible,
} from "./data/graph";

export type GraphControls = {
  zoom: (direction: number) => void;
  fit: () => void;
};
type Props = {
  dataset: Dataset;
  selected: string | null;
  view: "overview" | "family";
  mode: Mode;
  hops: number;
  filters: Filters;
  onSelect: (id: string) => void;
  onEdge: (id: string) => void;
};
const GraphPanel = forwardRef<GraphControls, Props>(
  function GraphPanel(props, ref) {
    const container = useRef<HTMLDivElement>(null);
    const sigma = useRef<Sigma | null>(null);
    const [error, setError] = useState("");
    const [cycle, setCycle] = useState(false);
    const callbacks = useRef(props);
    callbacks.current = props;
    useImperativeHandle(
      ref,
      () => ({
        zoom(direction) {
          const camera = sigma.current?.getCamera();
          if (camera)
            camera.animate(
              {
                ratio: Math.max(
                  0.01,
                  Math.min(
                    8,
                    camera.getState().ratio * (direction > 0 ? 0.7 : 1.4),
                  ),
                ),
              },
              { duration: 180 },
            );
        },
        fit() {
          sigma.current?.getCamera().animatedReset({ duration: 250 });
        },
      }),
      [],
    );
    useEffect(() => {
      if (!container.current) return;
      setError("");
      const focus = neighborhood(
        props.dataset.relationships,
        props.selected,
        props.mode,
        props.hops,
        props.filters,
      );
      const visible =
        props.view === "family" && props.selected ? focus.nodes : undefined;
      const graph = makeGraph(props.dataset, props.filters, visible);
      const parallel = new Map<string, string[]>();
      graph.forEachEdge((edge, _attributes, from, to) => {
        const pair = [from, to].sort().join("|");
        parallel.set(pair, [...(parallel.get(pair) ?? []), edge]);
      });
      for (const edges of parallel.values())
        if (edges.length > 1)
          edges.forEach((edge, i) =>
            graph.mergeEdgeAttributes(edge, {
              type: graph.isDirected(edge) ? "curvedArrow" : "curved",
              curvature: (i - (edges.length - 1) / 2) * 0.28,
            }),
          );
      const relations = props.dataset.relationships.filter((r) =>
        eligible(r, props.filters),
      );
      const cyclic = hasParentCycle(relations, visible);
      setCycle(cyclic);
      let worker: FA2Layout | undefined;
      let renderer: Sigma | undefined;
      let stopTimer: ReturnType<typeof setTimeout> | undefined;
      let focusTimer: ReturnType<typeof setTimeout> | undefined;
      const placeIsolates = () => {
        const isolates = graph.nodes().filter((id) => graph.degree(id) === 0);
        if (!isolates.length || isolates.length === graph.order) return;
        const connected = graph.nodes().filter((id) => graph.degree(id) > 0);
        const x =
          Math.max(...connected.map((id) => graph.getNodeAttribute(id, "x"))) +
          80;
        const width = Math.ceil(Math.sqrt(isolates.length));
        isolates.forEach((id, i) =>
          graph.mergeNodeAttributes(id, {
            x: x + (i % width) * 32,
            y: Math.floor(i / width) * 32,
          }),
        );
      };
      try {
        if (visible && !cyclic && graph.order > 1) {
          const layout = new dagre.graphlib.Graph({ multigraph: true });
          layout.setGraph({ rankdir: "TB", nodesep: 70, ranksep: 100 });
          layout.setDefaultEdgeLabel(() => ({}));
          graph.forEachNode((id) =>
            layout.setNode(id, { width: 120, height: 35 }),
          );
          relations
            .filter(
              (r) =>
                r.type === "parent_of" &&
                graph.hasNode(r.from) &&
                graph.hasNode(r.to),
            )
            .forEach((r) => layout.setEdge(r.from, r.to, {}, r.id));
          dagre.layout(layout);
          graph.forEachNode((id) => {
            const p = layout.node(id);
            graph.mergeNodeAttributes(id, { x: p.x, y: -p.y });
          });
        }
        renderer = new Sigma(graph, container.current, {
          defaultEdgeType: "line",
          edgeProgramClasses: {
            arrow: EdgeArrowProgram,
            curved: EdgeCurveProgram,
            curvedArrow: EdgeCurvedArrowProgram,
          },
          labelFont: "system-ui, sans-serif",
          labelSize: 12,
          labelColor: { color: "#37483f" },
          stagePadding: 75,
          allowInvalidContainer: true,
          defaultDrawNodeLabel(context, data, settings) {
            if (!data.label) return;
            context.font = `${settings.labelWeight} ${settings.labelSize}px ${settings.labelFont}`;
            context.fillStyle = "#37483f";
            const width = context.measureText(data.label).width;
            const right = data.x + data.size + 5;
            const canvasWidth =
              context.canvas.clientWidth || context.canvas.width;
            const drawLeft = right + width > canvasWidth - 8;
            context.textAlign = drawLeft ? "right" : "left";
            context.fillText(
              data.label,
              drawLeft ? data.x - data.size - 5 : right,
              data.y + settings.labelSize / 3,
            );
          },
          labelDensity: visible ? 2 : 0.6,
          labelRenderedSizeThreshold: visible ? 0 : 5,
          renderEdgeLabels: false,
          enableEdgeEvents: true,
          zIndex: true,
          minCameraRatio: 0.01,
          maxCameraRatio: 8,
          nodeReducer(node, data) {
            const isSelected = node === props.selected;
            const connected = focus.nodes.has(node);
            return {
              ...data,
              color: props.selected && !connected ? "#d4d8cd" : data.color,
              size: isSelected ? 11 : connected ? 7 : data.size,
              label: props.selected && !connected ? "" : data.label,
              highlighted: isSelected,
              forceLabel: isSelected || (Boolean(visible) && connected),
              zIndex: isSelected ? 3 : connected ? 2 : 0,
            };
          },
          edgeReducer(edge, data) {
            return {
              ...data,
              color:
                props.selected && !focus.edges.has(edge)
                  ? "#e3e4db"
                  : data.color,
              size: focus.edges.has(edge) ? 2.4 : data.size,
            };
          },
        });
        sigma.current = renderer;
        renderer.on("clickNode", ({ node }) =>
          callbacks.current.onSelect(node),
        );
        renderer.on("clickEdge", ({ edge }) => callbacks.current.onEdge(edge));
        renderer.on("enterNode", () => {
          if (container.current) container.current.style.cursor = "pointer";
        });
        renderer.on("leaveNode", () => {
          if (container.current) container.current.style.cursor = "grab";
        });
        if ((!visible || cyclic) && graph.order > 1 && graph.size > 0) {
          worker = new FA2Layout(graph, {
            settings: {
              barnesHutOptimize: true,
              adjustSizes: false,
              gravity: 0.3,
              scalingRatio: 8,
              slowDown: 6,
            },
          });
          worker.start();
          stopTimer = setTimeout(
            () => {
              worker?.stop();
              placeIsolates();
            },
            graph.order > 1000 ? 3500 : 800,
          );
        } else placeIsolates();
        const activeRenderer = renderer;
        focusTimer = setTimeout(
          () => {
            if (props.selected && props.view === "overview") {
              const position = activeRenderer.getNodeDisplayData(
                props.selected,
              );
              if (position)
                activeRenderer
                  .getCamera()
                  .animate(
                    { x: position.x, y: position.y, ratio: 0.55 },
                    { duration: 350 },
                  );
            }
          },
          graph.order > 1000 ? 3600 : 850,
        );
      } catch (e) {
        setError(
          `The visual graph could not load. You can still search and explore every character in the list. ${e instanceof Error ? e.message : ""}`,
        );
        renderer?.kill();
        sigma.current = null;
      }
      return () => {
        clearTimeout(stopTimer);
        clearTimeout(focusTimer);
        worker?.kill();
        renderer?.kill();
        sigma.current = null;
      };
    }, [
      props.dataset,
      props.selected,
      props.view,
      props.mode,
      props.hops,
      props.filters,
    ]);
    return (
      <>
        <div
          ref={container}
          className="sigma-container"
          aria-label="Interactive family graph. Search and character lists provide an accessible alternative."
          role="img"
        />
        {error && (
          <div className="graph-notice" role="alert">
            {error}
          </div>
        )}
        {cycle && (
          <div className="cycle-notice" role="status">
            This family contains a parentage cycle. Showing the network layout;
            all source claims are retained.
          </div>
        )}
      </>
    );
  },
);
export default GraphPanel;
