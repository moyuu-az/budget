import { memo } from 'react';
import { motion } from 'framer-motion';
import CountUp from 'react-countup';
import type { ForecastPoint } from '../../types';

interface MinBalanceCardProps {
  point: ForecastPoint | null;
  daysUntil: number;
}

function MinBalanceCard({ point, daysUntil }: MinBalanceCardProps) {
  if (!point) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="relative overflow-hidden glass rounded-2xl p-6"
      >
        <p className="text-sm font-medium text-white/60 mb-1">最低残高予測</p>
        <p className="text-lg text-slate-400">予測データなし</p>
      </motion.div>
    );
  }

  const colorKey = point.balance < 0
    ? 'red'
    : point.balance < 50000
      ? 'amber'
      : 'green';

  const colorMap = {
    red: {
      bg: 'rgba(239, 68, 68, 0.12)',
      border: 'rgba(239, 68, 68, 0.25)',
      glow: 'glow-red',
      orb: '#ef4444',
      text: 'text-red-400',
    },
    amber: {
      bg: 'rgba(245, 158, 11, 0.12)',
      border: 'rgba(245, 158, 11, 0.25)',
      glow: '',
      orb: '#f59e0b',
      text: 'text-amber-400',
    },
    green: {
      bg: 'rgba(34, 197, 94, 0.12)',
      border: 'rgba(34, 197, 94, 0.25)',
      glow: 'glow-green',
      orb: '#22c55e',
      text: 'text-emerald-400',
    },
  };

  const style = colorMap[colorKey];
  const dateLabel = new Date(point.date).toLocaleDateString('ja-JP');
  const daysLabel = daysUntil === 0 ? '今日' : `${daysUntil}日後`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className={`relative overflow-hidden rounded-2xl p-6 ${style.glow} card-hover`}
      style={{
        background: `linear-gradient(135deg, ${style.bg} 0%, transparent 100%)`,
        border: `1px solid ${style.border}`,
      }}
      whileHover={{ scale: 1.02 }}
    >
      <div
        className="absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-15 blur-3xl"
        style={{ background: `radial-gradient(circle, ${style.orb}, transparent)` }}
      />
      <p className="text-sm font-medium text-white/60 mb-1">最低残高予測</p>
      <p className={`text-2xl font-bold tabular-nums ${style.text}`}>
        ¥<CountUp end={point.balance} duration={1} separator="," preserveValue />
      </p>
      <div className="flex items-center gap-2 mt-2">
        <span className="text-xs text-white/40">{dateLabel}</span>
        <span className="text-xs px-1.5 py-0.5 rounded-full bg-white/10 text-white/50">
          {daysLabel}
        </span>
      </div>
    </motion.div>
  );
}

export default memo(MinBalanceCard);
