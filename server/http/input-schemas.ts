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

/**
 * Every user-supplied name, bounded.
 *
 * The columns are TEXT, which in PostgreSQL has no practical limit, and the
 * list endpoints return every row. Without a cap here one member of a shared
 * ledger can store a name of arbitrary size that every other member then
 * downloads on each page load -- not a leak, but a household budget nobody can
 * open. 100 characters is far more than any of these names needs.
 */
const nameSchema = (label: string) => z.string().min(1, `${label}は必須です`).max(100);

/**
 * A colour, bounded in length but not in format.
 *
 * The app only ever writes #rrggbb -- that is all <input type="color"> produces
 * -- so a strict regex was tempting. It would be a trap: categories imported
 * from the old SQLite database carry whatever colour they had (scripts/
 * import-sqlite.ts copies the column verbatim), and the settings form sends the
 * colour on every save. One legacy value in another notation would make that
 * category permanently uneditable, with a validation message about a field the
 * user never touched.
 *
 * The problem actually worth solving is unbounded storage, and a length cap
 * solves it. XSS is not a concern here: React assigns these through the CSSOM,
 * where a declaration cannot break out.
 */
const colorSchema = z.string().max(32);

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
  name: nameSchema('カテゴリ名'),
  type: typeEnum,
  // Nullable so a colour can be cleared; see the note on CategoryInput.
  color: colorSchema.nullable().optional(),
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
  name: nameSchema('テンプレート名'),
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
 * Key and value lengths are bounded here. The NUMBER of keys is not, and cannot
 * usefully be: a `.refine()` runs after Zod has already built the whole object,
 * which is where the memory goes. That is bounded at the door instead, by the
 * body limit in server/http/app.ts -- one place, for every method.
 *
 * Keys the category does not define are dropped by validateFieldValues before
 * anything is stored, so what reaches the database is bounded by the category's
 * own definitions regardless of what arrives.
 */
const assetFieldValuesSchema = z.record(
  z.string().max(64),
  z.union([z.string().max(MAX_FIELD_TEXT_LENGTH), z.number().finite(), z.null()]),
);

export const assetCategoryInputSchema = z.object({
  name: nameSchema('資産カテゴリ名'),
  color: colorSchema.nullable().optional(),
  sortOrder: z.number().int().optional(),
  fields: assetFieldDefsSchema.optional(),
});
export const assetCategoryPatchSchema = assetCategoryInputSchema.partial();

export const assetInputSchema = z.object({
  categoryId: idSchema,
  name: nameSchema('資産名'),
  // Not amountSchema: a holding may legitimately be negative (a loan balance
  // tracked as an asset category), which is why value has no CHECK either.
  value: finiteNumberSchema,
  fields: assetFieldValuesSchema.optional(),
});
export const assetPatchSchema = assetInputSchema.partial();
