import { z } from 'zod';
import {
  FIELD_KEY_PATTERN,
  MAX_ASSET_FIELDS,
  MAX_FIELD_LABEL_LENGTH,
  MAX_FIELD_TEXT_LENGTH,
  MAX_FIELD_UNIT_LENGTH,
} from '../../shared/asset-fields';

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
const costTypeEnum = z.enum(['fixed', 'variable']);

export const finiteNumberSchema = z.number().finite();
export const idSchema = z.number().int().positive();
export const yearMonthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, 'yyyy-MM 形式である必要があります');
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'yyyy-MM-dd 形式である必要があります');
export const amountSchema = z.number().finite().min(0, '金額は0以上である必要があります');

const categoryFieldsSchema = z.object({
  name: z.string().min(1, 'カテゴリ名は必須です'),
  type: typeEnum,
  // Nullable so a colour can be cleared; see the note on CategoryInput.
  color: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
  // Nullable for the same reason: null clears the 固定費/変動費 classification.
  costType: costTypeEnum.nullable().optional(),
});

/**
 * 固定費/変動費 only applies to expenses, and the database CHECK says so too.
 *
 * Repeating the rule here is not redundancy for its own sake: the constraint
 * would answer with PostgreSQL's own text about a named constraint, which
 * reaches the user as the generic CONFLICT message. This one is written for
 * them.
 */
export const categoryInputSchema = categoryFieldsSchema.superRefine((input, ctx) => {
  if (input.type === 'income' && input.costType != null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['costType'],
      message: '固定費/変動費は支出カテゴリにのみ設定できます',
    });
  }
});

// Partial of the FIELDS, not of the refined schema: a patch may carry costType
// without type, and the pairing is then checked by the database -- there is
// nothing here to compare it against.
export const categoryPatchSchema = categoryFieldsSchema.partial();

export const templateInputSchema = z.object({
  name: z.string().min(1, 'テンプレート名は必須です'),
  dayOfMonth: z.number().int().min(1).max(31),
  type: typeEnum,
  categoryId: z.number().int().positive().nullable().optional(),
  defaultAmount: z.number().finite().optional(),
});
export const templatePatchSchema = templateInputSchema.partial();

// ---------------------------------------------------------------------------
// Assets
//
// The schemas below check SHAPE only. Whether a holding's parameters satisfy its
// category is decided in the asset repository, because the answer lives in
// another row (the category's field definitions) and no static schema can see
// it. See shared/asset-fields.ts for the rules both sides run.
// ---------------------------------------------------------------------------

const assetFieldTypeEnum = z.enum(['text', 'number', 'date']);

const assetFieldDefSchema = z.object({
  key: z.string().regex(FIELD_KEY_PATTERN, 'パラメータの識別子が不正です'),
  label: z.string().min(1, 'パラメータ名は必須です').max(MAX_FIELD_LABEL_LENGTH),
  type: assetFieldTypeEnum,
  required: z.boolean(),
  unit: z.string().max(MAX_FIELD_UNIT_LENGTH).nullable(),
});

const assetFieldDefsSchema = z.array(assetFieldDefSchema).max(MAX_ASSET_FIELDS);

/**
 * A stored parameter value: text, number, or "not filled in".
 *
 * Bounded on purpose. `fields` is JSONB, so without a cap on the string length
 * and on how many keys may arrive, one request could store a megabyte in a row
 * that the whole 資産 view loads at once. Unknown keys are dropped later by the
 * validator, but they have to survive parsing to get there.
 */
const assetFieldValuesSchema = z.record(
  z.string().max(64),
  z.union([z.string().max(MAX_FIELD_TEXT_LENGTH), z.number().finite(), z.null()]),
);

export const assetCategoryInputSchema = z.object({
  name: z.string().min(1, '資産カテゴリ名は必須です'),
  color: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
  fields: assetFieldDefsSchema.optional(),
});
export const assetCategoryPatchSchema = assetCategoryInputSchema.partial();

export const assetInputSchema = z.object({
  categoryId: idSchema,
  name: z.string().min(1, '資産名は必須です'),
  // Not amountSchema: a holding may legitimately be negative (a loan balance
  // tracked as an asset category), which is why value has no CHECK either.
  value: finiteNumberSchema,
  fields: assetFieldValuesSchema.optional(),
});
export const assetPatchSchema = assetInputSchema.partial();
