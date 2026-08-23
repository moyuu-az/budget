import { z } from 'zod';

// Input validation at the trust boundary.
//
// Under Electron this was a local process talking to itself and the schemas were
// a nicety. Over HTTP the body is untrusted input, so EVERY argument of EVERY
// method is validated -- including the plain ids that the IPC version passed
// straight through.
//
// These mirror the database CHECK constraints. Where they disagree, the database
// wins and the request fails with a CONFLICT instead of a VALIDATION, which is a
// worse message for the same mistake -- so keep them in step.

const typeEnum = z.enum(['income', 'expense']);

export const finiteNumberSchema = z.number().finite();
export const idSchema = z.number().int().positive();
export const yearMonthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, 'yyyy-MM 形式である必要があります');
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'yyyy-MM-dd 形式である必要があります');
export const amountSchema = z.number().finite().min(0, '金額は0以上である必要があります');

export const categoryInputSchema = z.object({
  name: z.string().min(1, 'カテゴリ名は必須です'),
  type: typeEnum,
  // Nullable so a colour can be cleared; see the note on CategoryInput.
  color: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
});
export const categoryPatchSchema = categoryInputSchema.partial();

export const templateInputSchema = z.object({
  name: z.string().min(1, 'テンプレート名は必須です'),
  dayOfMonth: z.number().int().min(1).max(31),
  type: typeEnum,
  categoryId: z.number().int().positive().nullable().optional(),
  defaultAmount: z.number().finite().optional(),
});
export const templatePatchSchema = templateInputSchema.partial();
