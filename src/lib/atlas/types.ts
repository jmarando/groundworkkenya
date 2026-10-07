// The election atlas's shared shapes. Shares and turnout are percentages (0 to 100), kept
// unrounded until they are shown. A missing figure is null, never zero.

export type Race = "president" | "governor" | "mp";
export type Level = "country" | "county" | "constituency" | "ward";

/** One candidate's votes in one area for one election, with the bloc they stood for. */
export type Vote = { bloc: string; votes: number };

/**
 * What the document says about turnout in one area; each figure may be missing. These are
 * `atlas_turnout`'s registered, cast_votes, rejected_votes and valid_votes.
 */
export type Turnout = {
  registered: number | null;
  cast: number | null;
  rejected: number | null;
  valid: number | null;
};

/** A bloc's votes in an area and its share of the valid votes, in percent. */
export type BlocShare = { bloc: string; votes: number; share: number };

/** Which way an area leans and by how many points. */
export type Lean = { side: "ours" | "theirs" | "even"; points: number };
