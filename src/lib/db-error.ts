// A database refusal as words for the person who asked: the database's own message when it wrote
// one for people (raised with P0001, 42501 or 22023 in our functions), ours otherwise.

export type Failure = { code?: string; message?: string };

const WRITTEN_FOR_PEOPLE = new Set(["P0001", "42501", "22023"]);

export const refused = (error: Failure, fallback: string): Error =>
  new Error(
    error.code && WRITTEN_FOR_PEOPLE.has(error.code) && error.message ? error.message : fallback,
  );
