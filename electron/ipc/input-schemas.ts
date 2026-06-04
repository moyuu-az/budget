import { z } from 'zod';

// Tolerant input validation at the main-side trust boundary. These mirror the DB CHECK
// constraints and the shapes the renderer already sends, so they reject malformed input
// without breaking any working flow. Validate INPUT only — outputs are trusted local data.

const typeEnum = z.enum(['income', 'expense']);

export const finiteNumberSchema = z.number().finite();
export const idSchema = z.number().int();
export const yearMonthSchema = z.string().regex(/^\d{4}-\d{2}$/, 'yyyy-MM 形式である必要があります');
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'yyyy-MM-dd 形式である必要があります');
export const amountSchema = z.number().finite().min(0, '金額は0以上である必要があります');

export const categoryInputSchema = z.object({
  name: z.string().min(1, 'カテゴリ名は必須です'),
  type: typeEnum,
  color: z.string().optional(),
  sortOrder: z.number().int().optional(),
});
export const categoryPatchSchema = categoryInputSchema.partial();

export const templateInputSchema = z.object({
  name: z.string().min(1, 'テンプレート名は必須です'),
  dayOfMonth: z.number().int().min(1).max(31),
  type: typeEnum,
  categoryId: z.number().int().nullable().optional(),
  defaultAmount: z.number().finite().optional(),
});
export const templatePatchSchema = templateInputSchema.partial();
