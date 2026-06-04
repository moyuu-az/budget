export interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  content: string;
}

interface SankeyTooltipProps {
  tooltip: TooltipState;
}

export function SankeyTooltip({ tooltip }: SankeyTooltipProps) {
  if (!tooltip.visible) return null;

  return (
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
  );
}
