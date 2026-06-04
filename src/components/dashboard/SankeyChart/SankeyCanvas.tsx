import { useMemo, useEffect, useState } from 'react';
import { sankey as d3Sankey, sankeyLinkHorizontal, sankeyCenter } from 'd3-sankey';
import type { SankeyNode, SankeyLink } from 'd3-sankey';
import { type CashFlowData, type CashFlowNode, type CashFlowLink } from '../../../utils/cashflow';

type SNode = SankeyNode<CashFlowNode, CashFlowLink>;

// Color constants for SVG text elements
const SAVINGS_TEXT = '#34d399';
const DEFICIT_TEXT = '#f87171';
const MARGIN = { top: 32, right: 130, bottom: 16, left: 130 } as const;

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

  const layout = useMemo(() => {
    if (!cashFlowData || width === 0) return null;

    const innerWidth = width - MARGIN.left - MARGIN.right;
    const innerHeight = svgHeight - MARGIN.top - MARGIN.bottom;

    if (innerWidth < 100 || innerHeight < 50) return null;

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
  }, [cashFlowData, width, svgHeight]);

  if (!(layout && width > 0)) return null;

  const svgWidth = Math.max(0, width - 48);

  return (
    <svg width={svgWidth} height={svgHeight}>
      <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
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
                    {node.name}
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
