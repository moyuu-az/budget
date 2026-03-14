import { useMemo, useRef, useEffect, useState, useCallback, memo } from 'react';
import { sankey as d3Sankey, sankeyLinkHorizontal, sankeyCenter } from 'd3-sankey';
import type { SankeyNode, SankeyLink } from 'd3-sankey';
import { useTemplateStore } from '../../stores/useTemplateStore';
import { useMonthlyStore } from '../../stores/useMonthlyStore';
import { useCategoryStore } from '../../stores/useCategoryStore';
import { toYearMonth } from '../../utils/forecast';
import { buildCashFlowData, type CashFlowNode, type CashFlowLink } from '../../utils/cashflow';

type SNode = SankeyNode<CashFlowNode, CashFlowLink>;
type SLink = SankeyLink<CashFlowNode, CashFlowLink>;

// Color constants for SVG text elements
const SAVINGS_TEXT = '#34d399';
const DEFICIT_TEXT = '#f87171';
const MARGIN = { top: 32, right: 130, bottom: 16, left: 130 } as const;

const pathGen = sankeyLinkHorizontal();

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
  const [selectedYearMonth, setSelectedYearMonth] = useState(() => toYearMonth(new Date()));
  const fetchMonthlyAmounts = useMonthlyStore((s) => s.fetchMonthlyAmounts);
  const fetchedMonthsRef = useRef(new Set<string>());

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

  const currentYearMonth = useMemo(() => toYearMonth(new Date()), []);

  const goPrevMonth = useCallback(() => {
    setSelectedYearMonth((prev) => {
      const [y, m] = prev.split('-').map(Number);
      const d = new Date(y, m - 2, 1);
      return toYearMonth(d);
    });
  }, []);

  const goNextMonth = useCallback(() => {
    setSelectedYearMonth((prev) => {
      const [y, m] = prev.split('-').map(Number);
      const d = new Date(y, m, 1);
      return toYearMonth(d);
    });
  }, []);

  useEffect(() => {
    if (!fetchedMonthsRef.current.has(selectedYearMonth)) {
      fetchedMonthsRef.current.add(selectedYearMonth);
      fetchMonthlyAmounts(selectedYearMonth);
    }
  }, [selectedYearMonth, fetchMonthlyAmounts]);

  const cashFlowData = useMemo(
    () => buildCashFlowData(templates, monthlyAmountsMap, categories, selectedYearMonth),
    [templates, monthlyAmountsMap, categories, selectedYearMonth],
  );

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

  const titleText = useMemo(() => {
    if (selectedYearMonth === currentYearMonth) return '今月のキャッシュフロー';
    const [y, m] = selectedYearMonth.split('-').map(Number);
    return `${y}年${m}月のキャッシュフロー`;
  }, [selectedYearMonth, currentYearMonth]);

  const isLatestMonth = selectedYearMonth >= currentYearMonth;

  const navHeader = (
    <div className="flex items-center gap-2 mb-4">
      <button
        aria-label="前の月"
        onClick={goPrevMonth}
        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all"
      >
        <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <h2 className="text-lg font-semibold text-white">{titleText}</h2>
      <button
        aria-label="次の月"
        onClick={goNextMonth}
        disabled={isLatestMonth}
        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );

  if (!cashFlowData) {
    return (
      <div ref={containerRef} className="glass rounded-2xl p-6">
        {navHeader}
        <div className="flex items-center justify-center" style={{ minHeight: 150 }}>
          <p className="text-slate-500 text-sm">データがありません</p>
        </div>
      </div>
    );
  }

  const { summary } = cashFlowData;
  const svgWidth = Math.max(0, width - 48);

  return (
    <div ref={containerRef} className="glass rounded-2xl p-6 relative">
      {navHeader}
      {layout && width > 0 && (
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
                    onMouseMove={(e) => handleMouseMove(e, tooltipText)}
                    onMouseLeave={handleMouseLeave}
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
      )}

      {/* Summary footer */}
      <div className="flex items-center justify-center gap-6 mt-3 pt-3 border-t border-white/5">
        <div className="text-center">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider">収入</div>
          <div className="text-sm font-medium text-emerald-400">
            ¥{Math.round(summary.totalIncome).toLocaleString()}
          </div>
        </div>
        <div className="text-slate-600">−</div>
        <div className="text-center">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider">支出</div>
          <div className="text-sm font-medium text-slate-300">
            ¥{Math.round(summary.totalExpenses).toLocaleString()}
          </div>
        </div>
        <div className="text-slate-600">=</div>
        <div className="text-center">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider">
            {summary.net >= 0 ? '貯蓄' : '不足'}
          </div>
          <div
            className={`text-sm font-bold ${
              summary.net >= 0 ? 'text-emerald-400' : 'text-red-400'
            }`}
          >
            {summary.net >= 0 ? '+' : '-'}¥{Math.abs(Math.round(summary.net)).toLocaleString()}
          </div>
        </div>
      </div>

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
