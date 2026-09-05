import { z } from 'zod';
import {
  FIELD_KEY_PATTERN,
  MAX_ASSET_FIELDS,
  MAX_ASSET_VALUE,
  MAX_FIELD_LABEL_LENGTH,
  MAX_FIELD_TEXT_LENGTH,
  MAX_FIELD_UNIT_LENGTH,
} from '../../shared/asset-fields';
import { parseRecurrence, type Recurrence } from '../../shared/recurrence';
import { MAX_MIN_BALANCE_THRESHOLD } from '../../shared/ledger-settings';
import { isVocabDayId, wordById } from '../../shared/vocabulary';
import { QUIZ_DIRECTIONS } from '../../shared/vocabulary/types';

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

/**
 * When a planned entry happens.
 *
 * Delegated to `parseRecurrence` rather than rebuilt as a Zod discriminated
 * union, because the rules are not only shape rules: 'once' must carry a date
 * that EXISTS (2026-02-31 parses as a well-formed string and would then be an
 * entry that never occurs), and the interval bounds have to match the database
 * CHECK. Writing those twice is writing them to eventually disagree -- and the
 * half that disagrees here is the half that turns a readable validation message
 * into a CONFLICT from the INSERT.
 *
 * `transform` returns the NARROWED value, so what reaches the repository has
 * already had any stray fields dropped -- a `{kind:'monthly'}` carrying a
 * leftover `month` cannot reach entry_templates_recurrence_shape_chk.
 *
 * `z.custom<Recurrence>()` rather than `z.unknown()` for the base: the handler
 * table in api.ts requires each schema's INPUT type to match the method
 * signature it validates, so a schema declaring `unknown` in fails to compile
 * there. The check itself is entirely in the superRefine below -- z.custom with
 * no validator asserts a type without testing anything, which is exactly what is
 * wanted when the real test cannot be expressed as a Zod combinator.
 */
const recurrenceSchema = z
  .custom<Recurrence>()
  .superRefine((value, ctx) => {
    const parsed = parseRecurrence(value);
    if (!parsed.ok) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: parsed.error });
    }
  })
  .transform((value): Recurrence => {
    // Unreachable once superRefine has added an issue -- Zod skips the transform
    // for a failed refinement. The throw is here so this function is total
    // rather than relying on a cast to paper over the impossible branch.
    const parsed = parseRecurrence(value);
    if (!parsed.ok) throw new Error(parsed.error);
    return parsed.value;
  });

export const templateInputSchema = z.object({
  name: nameSchema('テンプレート名'),
  recurrence: recurrenceSchema,
  type: typeEnum,
  categoryId: z.number().int().positive().nullable().optional(),
  defaultAmount: z.number().finite().optional(),
});

// `.partial()` on a schema whose `recurrence` is a ZodEffects makes the whole
// effect optional, which is what a patch needs: absent means "leave the timing
// alone", and any value present still goes through the same narrowing.
export const templatePatchSchema = templateInputSchema.partial();

/**
 * A patch of this ledger's settings.
 *
 * Every field optional: `undefined` means "leave alone", which is what lets a
 * form save one setting without asserting a value for every other one that will
 * ever exist. `.strict()` rejects an unknown key rather than dropping it -- a
 * misspelled setting name that silently does nothing is worse than an error,
 * because the user sees the form save and the figure not change.
 *
 * The bounds mirror shared/ledger-settings.ts, which is also where the reader
 * clamps. Both exist on purpose: this one gives the user a message, and that one
 * keeps a value written around this schema from making the dashboard unusable.
 */
export const ledgerSettingsPatchSchema = z
  .object({
    minBalanceThreshold: z
      .number()
      .finite()
      .min(0, '最低残高は0以上で指定してください')
      .max(MAX_MIN_BALANCE_THRESHOLD, '最低残高が大きすぎます')
      .optional(),
  })
  .strict();

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
  /**
   * Whole yen, and it may be negative.
   *
   * Negative because a household that tracks a loan balance as an asset
   * category has to enter it that way for the total to mean anything -- which
   * is also why the column carries no CHECK.
   *
   * Integer because the alternative is a fraction of a yen that no screen can
   * show. Every screen rounds for display, and figures rounded independently
   * stop adding up: two holdings of 100.5 render as ¥101 + ¥101 beside a total
   * of ¥201. Refusing the input is the only fix that does not require every
   * reader to round the same way forever.
   *
   * Bounded by MAX_ASSET_VALUE, which is what NUMERIC(14,2) can hold. Without
   * it a mistyped extra digit reaches the database, which answers with a numeric
   * overflow -- redacted on the way out, so the user gets a generic failure
   * about a field they can plainly see is a number.
   *
   * The limit lives in shared/asset-fields.ts because the dialog checks it too;
   * and since 現在の残高 became a holding, EVERY balance edit comes through here.
   */
  value: finiteNumberSchema
    .int('評価額は円単位（整数）で入力してください')
    .min(-MAX_ASSET_VALUE, '評価額が小さすぎます')
    .max(MAX_ASSET_VALUE, '評価額が大きすぎます'),
  fields: assetFieldValuesSchema.optional(),
});
export const assetPatchSchema = assetInputSchema.partial();

// ---------------------------------------------------------------------------
// 英単語クイズ (user-scoped)
//
// The one schema in this file that validates against SOMETHING OTHER THAN a
// shape: `wordId` is checked for membership in the book. That is deliberate.
//
//   `vocab_attempts.word_id` has no foreign key -- the words live in
//   shared/vocabulary, not in the database (migration 006 explains why). With no
//   key, nothing else stops a client storing ids that name nothing, and a table
//   of rows that resolve to no word is a study record whose 正答率 has a
//   denominator nobody can account for.
//
//   Reads already drop what they cannot resolve, so this is not about safety on
//   the way out. It is about not writing rubbish on the way in, where the caller
//   can still be told which id was wrong.
// ---------------------------------------------------------------------------

/**
 * Largest run this endpoint accepts.
 *
 * The longest legitimate submission is one quiz over every word the app knows
 * (80 today), and the body limit already caps the request at 64 KB. This is the
 * semantic bound rather than the transport one: a "run" of ten thousand answers
 * is not a quiz somebody sat, and accepting it would let one request write more
 * history than a year of real use.
 */
const MAX_ATTEMPTS_PER_SUBMISSION = 200;

const vocabWordIdSchema = z
  .string()
  .max(64)
  .refine((id) => wordById(id) !== undefined, {
    message: '未知の単語 ID です',
  });

export const vocabAttemptsSchema = z
  .array(
    z.object({
      wordId: vocabWordIdSchema,
      direction: z.enum(QUIZ_DIRECTIONS),
      correct: z.boolean(),
    }),
  )
  .max(MAX_ATTEMPTS_PER_SUBMISSION);

/**
 * The Day to clear, or null for "all of it".
 *
 * Nullable rather than optional, and validated against the sections that exist:
 * a mis-typed `?day=` reaching a DELETE is the one place in this feature where
 * being permissive destroys data. An unknown Day is refused, never widened to
 * "everything".
 */
export const vocabResetTargetSchema = z
  .number()
  .int()
  .refine((day) => isVocabDayId(day), { message: '未知の Day です' })
  .nullable();
