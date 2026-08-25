import { useMemo, useEffect, useState } from 'react';
import { sankey as d3Sankey, sankeyLinkHorizontal, sankeyCenter } from 'd3-sankey';
import type { SankeyNode, SankeyLink } from 'd3-sankey';
import { type CashFlowData, type CashFlowNode, type CashFlowLink } from '../../../utils/cashflow';

type SNode = SankeyNode<CashFlowNode, CashFlowLink>;

// Color constants for SVG text elements
const SAVINGS_TEXT = '#34d399';
const DEFICIT_TEXT = '#f87171';
const MARGIN = { top: 32, bottom: 16 } as const;

// ---------------------------------------------------------------------------
// THE SIDE MARGINS HOLD THE LABELS, AND THEY USED TO BE FIXED AT 130px EACH.
//
// That is 260px gone before a single band is drawn, which was invisible while
// this panel occupied two thirds of a wide row and fatal everywhere else:
//
//   - a phone (375px) gives the card about 295px of content -> 35px of diagram
//   - a third of the dashboard's three-column row gives about 314px -> 54px
//
// Below `MIN_INNER_WIDTH` the old code returned null, so the card rendered its
// heading and its 収入/支出/差引 footer with NOTHING between them. No error, no
// empty state, no skeleton -- the diagram simply was not there, and the only
// test covering it asserted on the heading, so nothing failed. It shipped that
// way twice: once to phones, once to the desktop when a card was added beside
// this one and its column narrowed.
//
// So the margins scale with the width, the labels are trimmed to fit them, and
// a width that genuinely cannot carry the diagram SAYS SO rather than
// disappearing. A panel that vanishes silently is the same class of mistake as
// an empty state that makes a false claim: the screen stops telling the truth
// about what it knows.
// ---------------------------------------------------------------------------

const MAX_SIDE = 130;
const MIN_SIDE = 60;
/** Narrower than this and there is no honest diagram to draw. */
const MIN_INNER_WIDTH = 90;

/** The side margin this width can afford, for labels and for the bands. */
function sideMarginFor(width: number): number {
  return Math.round(Math.min(MAX_SIDE, Math.max(MIN_SIDE, width * 0.2)));
}

/**
 * Trims a label to what fits beside the node.
 *
 * At 11px a CJK glyph is about 11px wide, which is the worst case and the
 * common one here (category names are Japanese). The full name stays reachable:
 * every node carries it in its tooltip.
 */
function fitLabel(name: string, side: number): string {
  const max = Math.max(3, Math.floor((side - 10) / 11));
  return name.length <= max ? name : `${name.slice(0, max - 1)}…`;
}

const pathGen = sankeyLinkHorizontal();

interface SankeyCanvasProps {
  cashFlowData: CashFlowData;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onHover: (e: React.MouseEvent, content: string) => void;
  onHoverEnd: () => void;
}

export function SankeyCanvas({ cashFlowData, containerRef, onHover, onHoverEnd }: SankeyCanvasProps) {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    setWidth(el.clientWidth);

    return () => observer.disconnect();
  }, [containerRef]);

  // Dynamic height: base + per-node padding (right column is usually tallest)
  const svgHeight = useMemo(() => {
    if (!cashFlowData) return 300;
    const rightNodes = cashFlowData.nodes.filter(
      (n) => n.type === 'expense' || n.type === 'savings',
    );
    const leftNodes = cashFlowData.nodes.filter(
      (n) => n.type === 'income' || n.type === 'deficit',
    );
    const maxNodes = Math.max(rightNodes.length, leftNodes.length, 1);
    return Math.max(300, maxNodes * 44 + MARGIN.top + MARGIN.bottom + 32);
  }, [cashFlowData]);

  const side = sideMarginFor(width);
  const innerWidth = width - side * 2;

  const layout = useMemo(() => {
    if (!cashFlowData || width === 0) return null;

    const innerHeight = svgHeight - MARGIN.top - MARGIN.bottom;

    if (innerWidth < MIN_INNER_WIDTH || innerHeight < 50) return null;

    const generator = d3Sankey<CashFlowNode, CashFlowLink>()
      .nodeWidth(16)
      .nodePadding(14)
      .nodeAlign(sankeyCenter)
      .extent([[0, 0], [innerWidth, innerHeight]]);

    const graph = generator({
      nodes: cashFlowData.nodes.map((d) => ({ ...d })),
      links: cashFlowData.links.map((d) => ({ ...d })),
    });

    return graph;
  }, [cashFlowData, width, innerWidth, svgHeight]);

  // Still measuring. One frame, and drawing nothing is the truth.
  if (width === 0) return null;

  // Too narrow to draw. SAY IT -- the alternative is a card with a heading, a
  // footer, and a hole where the diagram was.
  if (!layout) {
    return (
      <div className="flex items-center justify-center text-center" style={{ minHeight: 120 }}>
        <p className="text-slate-500 text-sm">
          この幅ではフロー図を表示できません。
          <br />
          合計は下に表示しています。
        </p>
      </div>
    );
  }

  return (
    <svg width={width} height={svgHeight}>
      <g transform={`translate(${side},${MARGIN.top})`}>
        <defs>
          {layout.links.map((link, i) => {
            const sourceNode = link.source as SNode;
            const targetNode = link.target as SNode;
            return (
              <linearGradient
                key={`link-grad-${i}`}
                id={`link-grad-${i}`}
                x1="0%"
                y1="0%"
                x2="100%"
                y2="0%"
              >
                <stop offset="0%" stopColor={sourceNode.color} stopOpacity={0.45} />
                <stop offset="100%" stopColor={targetNode.color} stopOpacity={0.45} />
              </linearGradient>
            );
          })}
        </defs>

        {/* Links */}
        {layout.links.map((link, i) => {
          const d = pathGen(link as Parameters<typeof pathGen>[0]);
          if (!d) return null;

          const sourceNode = link.source as SNode;
          const targetNode = link.target as SNode;
          const tooltipText = `${sourceNode.name} → ${targetNode.name}: ¥${Math.round(link.value ?? 0).toLocaleString()}`;

          return (
            <path
              key={`link-${i}`}
              d={d}
              fill="none"
              stroke={`url(#link-grad-${i})`}
              strokeWidth={Math.max((link.width ?? 1), 1)}
              strokeOpacity={0.5}
              className="transition-opacity duration-150"
              style={{ cursor: 'pointer' }}
              onMouseMove={(e) => onHover(e, tooltipText)}
              onMouseLeave={onHoverEnd}
            />
          );
        })}

        {/* Nodes */}
        {layout.nodes.map((node, i) => {
          const x0 = node.x0 ?? 0;
          const y0 = node.y0 ?? 0;
          const x1 = node.x1 ?? 0;
          const y1 = node.y1 ?? 0;
          const nodeHeight = y1 - y0;
          const nodeWidth = x1 - x0;

          const isCenter = node.type === 'total';
          const isLeft = !isCenter && (node.type === 'income' || node.type === 'deficit');
          const tooltipText = `${node.name}: ¥${Math.round(node.value ?? 0).toLocaleString()}`;

          const fillOpacity = node.type === 'savings' || node.type === 'deficit' ? 0.75 : 0.85;
          const rx = node.type === 'total' ? 4 : 3;

          return (
            <g key={`node-${i}`}>
              <rect
                x={x0}
                y={y0}
                width={nodeWidth}
                height={Math.max(nodeHeight, 1)}
                rx={rx}
                ry={rx}
                fill={node.color}
                fillOpacity={fillOpacity}
                style={{ cursor: 'pointer' }}
                onMouseMove={(e) => onHover(e, tooltipText)}
                onMouseLeave={onHoverEnd}
              />
              {(node.type === 'savings' || node.type === 'deficit') && (
                <rect
                  x={x0}
                  y={y0}
                  width={nodeWidth}
                  height={Math.max(nodeHeight, 1)}
                  rx={rx}
                  ry={rx}
                  fill="none"
                  stroke={node.color}
                  strokeWidth={1.5}
                  strokeDasharray="4 2"
                  strokeOpacity={0.6}
                />
              )}
              {isCenter ? (
                <>
                  <text
                    x={(x0 + x1) / 2}
                    y={y0 - 18}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="#94a3b8"
                    style={{ fontSize: '12px', fontWeight: 600 }}
                  >
                    {node.name}
                  </text>
                  <text
                    x={(x0 + x1) / 2}
                    y={y0 - 4}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="#cbd5e1"
                    style={{ fontSize: '11px' }}
                  >
                    ¥{Math.round(node.value ?? 0).toLocaleString()}
                  </text>
                </>
              ) : (
                <>
                  <text
                    x={isLeft ? x0 - 8 : x1 + 8}
                    y={(y0 + y1) / 2 - 6}
                    textAnchor={isLeft ? 'end' : 'start'}
                    dominantBaseline="central"
                    fill={node.type === 'savings' ? SAVINGS_TEXT : node.type === 'deficit' ? DEFICIT_TEXT : '#94a3b8'}
                    style={{ fontSize: '11px', fontWeight: node.type === 'savings' || node.type === 'deficit' ? 600 : 400 }}
                  >
                    {fitLabel(node.name, side)}
                  </text>
                  <text
                    x={isLeft ? x0 - 8 : x1 + 8}
                    y={(y0 + y1) / 2 + 8}
                    textAnchor={isLeft ? 'end' : 'start'}
                    dominantBaseline="central"
                    fill="#64748b"
                    style={{ fontSize: '10px' }}
                  >
                    ¥{Math.round(node.value ?? 0).toLocaleString()}
                  </text>
                </>
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
}
