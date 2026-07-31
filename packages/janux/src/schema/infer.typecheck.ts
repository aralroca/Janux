/**
 * Compile-time contract for `Infer` — no runtime, `bun run typecheck` is what
 * executes this file. A schema is the only description of a shape Janux has;
 * `Infer` is what lets the value side of that shape be read without restating
 * it as an interface, so every assertion below is a reading that must hold.
 */
import { bool, enums, int, list, money, num, obj, schema, str, type Infer, type JxType } from './index';

/** Exact identity, not assignability: `any` and a widened union both satisfy `extends`. */
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// Primitives.
export const isString: Equals<Infer<typeof title>, string> = true;
const title = str();
export const isInt: Equals<Infer<typeof count>, number> = true;
const count = int();
export const isNum: Equals<Infer<typeof ratio>, number> = true;
const ratio = num();
export const isMoney: Equals<Infer<typeof price>, number> = true;
const price = money();
export const isBool: Equals<Infer<typeof draft>, boolean> = true;
const draft = bool();

// Enums keep their literal members, so a `switch` over them can be exhaustive.
export const isLiteralUnion: Equals<Infer<typeof status>, 'draft' | 'published'> = true;
const status = enums(['draft', 'published']);

// Modifiers.
export const isOptional: Equals<Infer<typeof maybe>, string | undefined> = true;
const maybe = str().optional();
export const isNullable: Equals<Infer<typeof nullish>, string | null> = true;
const nullish = str().nullable();
export const boundsKeepTheType: Equals<Infer<typeof bounded>, string> = true;
const bounded = str().min(2).max(10);
export const defaultsKeepTheType: Equals<Infer<typeof defaulted>, number> = true;
const defaulted = int().default(0);

// Lists, of a type and of a shape.
export const isStringList: Equals<Infer<typeof tags>, string[]> = true;
const tags = list(str());
export const isRowList: Equals<Infer<typeof rows>, { id: number }[]> = true;
const rows = list({ id: int() });

// Objects and the root `schema()` builder, nesting included.
const post = schema({
  title: str(),
  draft: bool().default(false),
  tags: list(str()),
  author: obj({ name: str(), age: int().optional() }),
});

type Post = Infer<typeof post>;

export const readsTitle: Equals<Post['title'], string> = true;
export const readsDraft: Equals<Post['draft'], boolean> = true;
export const readsTags: Equals<Post['tags'], string[]> = true;
export const readsNested: Equals<Post['author']['name'], string> = true;
export const readsOptionalNested: Equals<Post['author']['age'], number | undefined> = true;

// @ts-expect-error — a string field is not a number.
export const notANumber: Equals<Post['title'], number> = true;
// @ts-expect-error — a field the schema never declared does not exist.
export const missing: Post['nope'] = undefined;

// A wrong default stays writable — `validate` is what rejects it, and the
// conformance corpus says so. What must not change is the inferred type.
export const wrongDefaultKeepsTheType: Equals<Infer<ReturnType<typeof int>>, number> = true;

// The unparameterised type still names any schema, so annotations written
// before `Infer` existed keep compiling.
export const erased: JxType = post;
export const shapeErased: Record<string, JxType> = { title: str(), tags: list(str()) };
