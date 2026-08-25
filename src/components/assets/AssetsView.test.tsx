import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AssetsView from './AssetsView';
import { setApi } from '../../lib/api';
import { createMockApi } from '../../test/mock-api';
import { useAssetStore } from '../../stores/useAssetStore';
import { useToastStore } from '../../stores/useToastStore';
import { makeAsset, makeAssetCategory, makeCashCategory } from '../../test/factories';
import type { AppApi } from '../../types';

const NISA = makeAssetCategory({
  id: 1,
  name: 'NISA',
  fields: [
    { key: 'f1', label: '銘柄', type: 'text', required: true, unit: null },
    { key: 'f3', label: '保有数量', type: 'number', required: false, unit: '口' },
  ],
});

/** The category every ledger has; its holdings are 現在の残高. */
const CASH = makeCashCategory();

const HOLDING = makeAsset({
  id: 11,
  categoryId: 1,
  name: 'つみたて投資枠',
  value: 1_200_000,
  fields: { f1: 'eMAXIS Slim', f3: 34_000 },
});

let api: AppApi;

beforeEach(() => {
  api = createMockApi();
  setApi(api);
  useAssetStore.setState({ categories: [], assets: [], loading: false });
  useToastStore.setState({ toasts: [], queue: [] });
});

afterEach(() => {
  setApi(null);
  vi.restoreAllMocks();
});

describe('when the ledger holds only its cash category', () => {
  // Every ledger has one -- the server provisions it -- so this, not an empty
  // list, is what a household that ignores 資産 actually sees.
  beforeEach(() => {
    useAssetStore.setState({ categories: [CASH], assets: [] });
  });

  it('shows the cash category and says what it is for', () => {
    render(<AssetsView />);

    expect(screen.getByRole('heading', { name: '現金' })).toBeInTheDocument();
    expect(screen.getByText('現在の残高')).toBeInTheDocument();
  });

  it('refuses to offer a delete button for it', () => {
    // Deleting it would take every cash holding with it and zero the forecast.
    // The server refuses the call too -- this is only the half the user sees.
    render(<AssetsView />);

    expect(screen.queryByRole('button', { name: '現金の分類を削除' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '現金の分類を編集' })).toBeInTheDocument();
  });

  it('still offers the templates for everything else', () => {
    render(<AssetsView />);

    expect(screen.getByText('雛形から分類を追加')).toBeInTheDocument();
    expect(screen.getByText('NISA')).toBeInTheDocument();
    // 現金 is not among them: a second cash category is the double count this
    // whole design removes.
    expect(screen.queryByText('財布や銀行口座などの残高をそのまま記録します。')).not.toBeInTheDocument();
  });

  it('creates nothing until a template is actually saved', async () => {
    const user = userEvent.setup();
    render(<AssetsView />);

    await user.click(screen.getByText('NISA'));

    // The dialog opens pre-filled and the user may still change or abandon it.
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(api.addAssetCategory).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('銘柄')).toBeInTheDocument();
  });

  it('sends the template shape when the pre-filled dialog is saved', async () => {
    const user = userEvent.setup();
    api.addAssetCategory = vi.fn().mockResolvedValue({ ...NISA, id: 5 });
    render(<AssetsView />);

    await user.click(screen.getByText('NISA'));
    await user.click(await screen.findByRole('button', { name: '保存' }));

    // Asserted exactly, not loosely: the keys are the identity that holdings
    // attach their values to, so a template that quietly renumbered them would
    // be a different template.
    expect(api.addAssetCategory).toHaveBeenCalledWith({
      name: 'NISA',
      color: '#22c55e',
      fields: [
        { key: 'f1', label: '銘柄', type: 'text', required: true, unit: null },
        { key: 'f2', label: '証券会社', type: 'text', required: false, unit: null },
        { key: 'f3', label: '保有数量', type: 'number', required: false, unit: '口' },
        { key: 'f4', label: '取得単価', type: 'number', required: false, unit: '円' },
      ],
    });
  });
});

describe('when the ledger tracks assets', () => {
  beforeEach(() => {
    useAssetStore.setState({ categories: [NISA], assets: [HOLDING] });
  });

  it('builds the columns from the category, not from a fixed list', () => {
    // This is the whole reason a category carries a shape: another category
    // would show different columns on the same screen.
    render(<AssetsView />);

    expect(screen.getByRole('columnheader', { name: '銘柄' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '保有数量' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'eMAXIS Slim' })).toBeInTheDocument();
    // Formatted with its unit, which display code must never do by hand.
    expect(screen.getByRole('cell', { name: '34,000 口' })).toBeInTheDocument();
  });

  it('shows the portfolio total', () => {
    render(<AssetsView />);
    // Scoped to the headline figure: the same number also appears as the
    // category's subtotal, which is correct and not what this asserts.
    expect(screen.getByRole('definition')).toHaveTextContent('¥1,200,000');
  });

  it('refuses to save a holding that leaves a required parameter blank', async () => {
    const user = userEvent.setup();
    render(<AssetsView />);

    await user.click(screen.getByRole('button', { name: '資産を追加' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('資産名'), '成長投資枠');
    await user.type(within(dialog).getByLabelText('評価額'), '500000');
    await user.click(within(dialog).getByRole('button', { name: '保存' }));

    // The form runs the same validator the server does, so this never becomes a
    // round trip that comes back rejected.
    expect(await screen.findByText('銘柄は必須です')).toBeInTheDocument();
    expect(api.addAsset).not.toHaveBeenCalled();
  });

  it('sends a number parameter as a number, not as the string the input produced', async () => {
    const user = userEvent.setup();
    api.addAsset = vi.fn().mockResolvedValue({ ...HOLDING, id: 12 });
    render(<AssetsView />);

    await user.click(screen.getByRole('button', { name: '資産を追加' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('資産名'), '成長投資枠');
    await user.type(within(dialog).getByLabelText('評価額'), '500000');
    await user.type(within(dialog).getByLabelText('銘柄 *'), 'オルカン');
    await user.type(within(dialog).getByLabelText('保有数量'), '1200');
    await user.click(within(dialog).getByRole('button', { name: '保存' }));

    expect(api.addAsset).toHaveBeenCalledWith({
      categoryId: 1,
      name: '成長投資枠',
      value: 500_000,
      fields: { f1: 'オルカン', f3: 1200 },
    });
  });

  it('warns before saving a category edit that discards stored values', async () => {
    // Removing a parameter now drops its values from every holding, which is not
    // recoverable -- so it is said before the save, not after.
    const user = userEvent.setup();
    render(<AssetsView />);

    await user.click(screen.getByRole('button', { name: 'NISAの分類を編集' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: '保有数量を削除' }));

    expect(
      await within(dialog).findByText(/保有数量を削除します/, { selector: 'p' }),
    ).toBeInTheDocument();
  });

  it('keeps the templates reachable once a category exists', async () => {
    // A household that started with 現金 should not have to retype the NISA
    // shape because the picker only ever appeared on an empty view.
    render(<AssetsView />);
    expect(screen.getByText('雛形から分類を追加')).toBeInTheDocument();
  });

  it('warns that the holdings go with the category before deleting it', async () => {
    const user = userEvent.setup();
    render(<AssetsView />);

    await user.click(screen.getByRole('button', { name: 'NISAの分類を削除' }));

    // ON DELETE CASCADE is not recoverable, so the count is stated up front.
    // selector:'p' pins the assertion to the description itself -- a regex
    // matcher also matches every ancestor whose textContent contains it.
    expect(
      await screen.findByText(/1 件の資産も一緒に削除されます/, { selector: 'p' }),
    ).toBeInTheDocument();
  });
});
