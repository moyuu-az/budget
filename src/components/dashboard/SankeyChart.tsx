import { useMemo, useRef, useEffect, useState, useCallback, memo } from 'react';
import { sankey as d3Sankey, sankeyLinkHorizontal } from 'd3-sankey';
import type { SankeyNode, SankeyLink } from 'd3-sankey';
import { useTemplateStore } from '../../stores/useTemplateStore';
import { useMonthlyStore, resolveAmount } from '../../stores/useMonthlyStore';
import { useCategoryStore } from '../../stores/useCategoryStore';
import { toYearMonth } from '../../utils/forecast';

interface SankeyNodeExtra {
  name: string;
  color: string;
  value: number;
}

interface SankeyLinkExtra {
  sourceColor: string;
  targetColor: string;
}

type SNode = SankeyNode<SankeyNodeExtra, SankeyLinkExtra>;
type SLink = SankeyLink<SankeyNodeExtra, SankeyLinkExtra>;

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  content: string;
}

function SankeyChart() {
  const templates = useTemplateStore((s) => s.templates);
  const monthlyAmountsMap = useMonthlyStore((s) => s.monthlyAmountsMap);
  const categories = useCategoryStore((s) => s.categories);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
    content: '',
  });

  const SVG_HEIGHT = 300;
  const MARGIN = { top: 16, right: 120, bottom: 16, left: 120 };

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
  }, []);

  const yearMonth = useMemo(() => toYearMonth(new Date()), []);

  const sankeyData = useMemo(() => {
    const enabled = templates.filter((t) => t.enabled);
    if (enabled.length === 0) return null;

    const categoryMap = new Map(categories.map((c) => [c.id, c]));

    // Group templates by category and type
    const incomeByCategory = new Map<number | 'uncategorized', { name: string; color: string; total: number }>();
    const expenseByCategory = new Map<number | 'uncategorized', { name: string; color: string; total: number }>();

    for (const template of enabled) {
      const amount = resolveAmount(template.id, yearMonth, monthlyAmountsMap, templates);
      if (amount <= 0) continue;

      const catKey = template.categoryId ?? 'uncategorized';
      const cat = template.categoryId != null ? categoryMap.get(template.categoryId) : null;
      const catName = cat?.name ?? 'その他';
      const catColor = cat?.color ?? '#6b7280';

      const targetMap = template.type === 'income' ? incomeByCategory : expenseByCategory;

      if (targetMap.has(catKey)) {
        targetMap.get(catKey)!.total += amount;
      } else {
        targetMap.set(catKey, { name: catName, color: catColor, total: amount });
      }
    }

    if (incomeByCategory.size === 0 || expenseByCategory.size === 0) return null;

    // Build nodes: income categories first, then expense categories
    const incomeEntries = Array.from(incomeByCategory.values());
    const expenseEntries = Array.from(expenseByCategory.values());
    const nodes: SankeyNodeExtra[] = [
      ...incomeEntries.map((e) => ({ name: e.name, color: e.color, value: e.total })),
      ...expenseEntries.map((e) => ({ name: e.name, color: e.color, value: e.total })),
    ];

    // Build links: distribute each income source proportionally across expenses
    const totalExpense = expenseEntries.reduce((sum, e) => sum + e.total, 0);
    const links: Array<{ source: number; target: number; value: number; sourceColor: string; targetColor: string }> = [];

    for (let i = 0; i < incomeEntries.length; i++) {
      for (let j = 0; j < expenseEntries.length; j++) {
        const value = (incomeEntries[i].total * expenseEntries[j].total) / totalExpense;
        if (value > 0) {
          links.push({
            source: i,
            target: incomeEntries.length + j,
            value,
            sourceColor: incomeEntries[i].color,
            targetColor: expenseEntries[j].color,
          });
        }
      }
    }

    return { nodes, links };
  }, [templates, monthlyAmountsMap, categories, yearMonth]);

  const layout = useMemo(() => {
    if (!sankeyData || width === 0) return null;

    const innerWidth = width - MARGIN.left - MARGIN.right;
    const innerHeight = SVG_HEIGHT - MARGIN.top - MARGIN.bottom;

    if (innerWidth < 100 || innerHeight < 50) return null;

    const generator = d3Sankey<SankeyNodeExtra, SankeyLinkExtra>()
      .nodeWidth(16)
      .nodePadding(12)
      .extent([[0, 0], [innerWidth, innerHeight]]);

    const graph = generator({
      nodes: sankeyData.nodes.map((d) => ({ ...d })),
      links: sankeyData.links.map((d) => ({ ...d })),
    });

    return graph;
  }, [sankeyData, width]);

  const handleMouseMove = useCallback((e: React.MouseEvent, content: string) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTooltip({
      visible: true,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top - 10,
      content,
    });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setTooltip((prev) => ({ ...prev, visible: false }));
  }, []);

  if (!sankeyData) {
    return (
      <div className="glass rounded-2xl p-6 flex items-center justify-center" style={{ minHeight: 200 }}>
        <p className="text-slate-500 text-sm">今月のデータがありません</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="glass rounded-2xl p-6 relative">
      <h2 className="text-lg font-semibold text-white mb-4">今月のキャッシュフロー</h2>
      {layout && width > 0 && (
        <svg width={width - 48} height={SVG_HEIGHT}>
          <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
            {/* Gradient definitions for links */}
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
                    <stop offset="0%" stopColor={sourceNode.color} stopOpacity={0.5} />
                    <stop offset="100%" stopColor={targetNode.color} stopOpacity={0.5} />
                  </linearGradient>
                );
              })}
            </defs>

            {/* Links */}
            {layout.links.map((link, i) => {
              const pathGen = sankeyLinkHorizontal();
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
                  strokeOpacity={0.4}
                  className="transition-opacity hover:!stroke-opacity-70"
                  style={{ cursor: 'pointer' }}
                  onMouseMove={(e) => handleMouseMove(e, tooltipText)}
                  onMouseLeave={handleMouseLeave}
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
              const isLeft = x0 < (width - MARGIN.left - MARGIN.right) / 2;
              const tooltipText = `${node.name}: ¥${Math.round(node.value ?? 0).toLocaleString()}`;

              return (
                <g key={`node-${i}`}>
                  <rect
                    x={x0}
                    y={y0}
                    width={nodeWidth}
                    height={Math.max(nodeHeight, 1)}
                    rx={3}
                    ry={3}
                    fill={node.color}
                    fillOpacity={0.85}
                    style={{ cursor: 'pointer' }}
                    onMouseMove={(e) => handleMouseMove(e, tooltipText)}
                    onMouseLeave={handleMouseLeave}
                  />
                  {/* Node label */}
                  <text
                    x={isLeft ? x0 - 8 : x1 + 8}
                    y={(y0 + y1) / 2}
                    textAnchor={isLeft ? 'end' : 'start'}
                    dominantBaseline="central"
                    className="text-xs"
                    fill="#94a3b8"
                    style={{ fontSize: '11px' }}
                  >
                    {node.name}
                  </text>
                  <text
                    x={isLeft ? x0 - 8 : x1 + 8}
                    y={(y0 + y1) / 2 + 14}
                    textAnchor={isLeft ? 'end' : 'start'}
                    dominantBaseline="central"
                    fill="#64748b"
                    style={{ fontSize: '10px' }}
                  >
                    ¥{Math.round(node.value ?? 0).toLocaleString()}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      )}
      {/* Tooltip */}
      {tooltip.visible && (
        <div
          className="absolute pointer-events-none z-50 rounded-lg px-3 py-2 text-xs text-white shadow-xl"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, -100%)',
            background: 'rgba(30, 41, 72, 0.95)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(100, 116, 170, 0.25)',
          }}
        >
          {tooltip.content}
        </div>
      )}
    </div>
  );
}

export default memo(SankeyChart);
