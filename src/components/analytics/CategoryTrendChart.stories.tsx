import type { Meta, StoryObj } from '@storybook/react-vite';
import CategoryTrendChart from './CategoryTrendChart';
import type { CategoryTrendPoint } from '../../types';

const PALETTE = {
  platinum: '#60a5fa',
  olive: '#a3e635',
  view: '#a855f7',
  jcb: '#2dd4bf',
  carLoan: '#f43f5e',
  scholarship: '#7c3aed',
  paypay: '#fb7185',
};

function expenseMonth(yearMonth: string, scale = 1): CategoryTrendPoint {
  return {
    yearMonth,
    categories: [
      { categoryId: 1, name: 'プラチナプリファード', color: PALETTE.platinum, amount: Math.round(300000 * scale) },
      { categoryId: 2, name: 'Olive', color: PALETTE.olive, amount: Math.round(190000 * scale) },
      { categoryId: 3, name: 'Viewカード', color: PALETTE.view, amount: Math.round(40000 * scale) },
      { categoryId: 4, name: 'JCB', color: PALETTE.jcb, amount: Math.round(35000 * scale) },
      { categoryId: 5, name: '車ローン', color: PALETTE.carLoan, amount: 45000 },
      { categoryId: 6, name: '奨学金', color: PALETTE.scholarship, amount: 15000 },
      { categoryId: 7, name: 'PayPay', color: PALETTE.paypay, amount: Math.round(20000 * scale) },
    ],
  };
}

// Past months (<= 2026-06) and future months are all populated here — this is the state
// after the fallback fix; previously past/current months rendered empty.
const expenseData: CategoryTrendPoint[] = [
  expenseMonth('2026-02', 0.78),
  expenseMonth('2026-03', 0.95),
  expenseMonth('2026-04', 1.5),
  expenseMonth('2026-05', 0.83),
  expenseMonth('2026-06', 1.0),
  expenseMonth('2026-07', 0.81),
  expenseMonth('2026-08', 0.72),
  expenseMonth('2026-09', 0.73),
  expenseMonth('2026-10', 1.07),
];

const incomeData: CategoryTrendPoint[] = ['2026-04', '2026-05', '2026-06', '2026-07'].map((ym) => ({
  yearMonth: ym,
  categories: [
    { categoryId: 8, name: 'LY', color: '#22c55e', amount: 820000 },
    { categoryId: 9, name: 'EraX', color: '#10b981', amount: 150000 },
  ],
}));

const meta = {
  title: 'Analytics/CategoryTrendChart',
  component: CategoryTrendChart,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 760 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    todayYearMonth: '2026-06',
  },
} satisfies Meta<typeof CategoryTrendChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ExpenseTrend: Story = {
  args: { data: expenseData, type: 'expense' },
};

export const IncomeTrend: Story = {
  args: { data: incomeData, type: 'income' },
};

// Only past/current months have data; future months sit beyond the dashed "today" line.
export const PastOnly: Story = {
  args: {
    data: expenseData.filter((p) => p.yearMonth <= '2026-06'),
    type: 'expense',
  },
};

export const Empty: Story = {
  args: { data: [], type: 'expense' },
};
