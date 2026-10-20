// What an auto-call says, as Twilio's TwiML. Pure. The message plays inside a Gather so a key can
// be pressed at any point; 9 stops the person's auto-calls. A recorded message says it is one,
// from the campaign, unless the office turned that off; the candidate's cloned voice says it in
// the same voice (the line is part of the audio), others say it before the message.

export type BlastForCall = {
  script: string;
  language: "en" | "sw";
  source: "clone" | "upload" | "standard";
  audio_url: string | null;
  disclose: boolean;
};

/** The line an auto-call opens with, saying it is recorded and from whom. */
export const disclosure = (who: string, language: "en" | "sw") =>
  language === "sw"
    ? `Huu ni ujumbe uliorekodiwa kutoka kampeni ya ${who}.`
    : `This is a recorded message from ${who}'s campaign.`;

const STOP = {
  en: "To stop these calls, press 9.",
  sw: "Kusimamisha simu hizi, bonyeza 9.",
};

/** The standard voice Twilio reads English with when there is no recording. */
export const STANDARD_VOICE = { voice: "Polly.Ayanda-Neural", language: "en-ZA" };

export function autocallTwiml(o: {
  blast: BlastForCall;
  who: string;
  keyUrl: string;
  escape: (s: string) => string;
}): string {
  const { blast, escape } = o;
  const say = (text: string) =>
    `<Say voice="${STANDARD_VOICE.voice}" language="${STANDARD_VOICE.language}">${escape(text)}</Say>`;
  const parts: string[] = [];
  // The clone speaks its own disclosure inside the audio; others hear it first.
  if (blast.disclose && blast.source !== "clone")
    parts.push(say(disclosure(o.who, blast.language)));
  if (blast.audio_url) parts.push(`<Play>${escape(blast.audio_url)}</Play>`);
  else if (blast.source === "standard" && blast.script.trim()) parts.push(say(blast.script));
  else return "<Hangup/>";
  parts.push(`<Pause length="1"/>`, say(STOP[blast.language]));
  return (
    `<Gather numDigits="1" timeout="5" action="${escape(o.keyUrl)}" method="POST">${parts.join("")}</Gather>` +
    "<Hangup/>"
  );
}

/** The words the cloned voice speaks: the disclosure (when on), then the script. */
export const spokenScript = (
  b: Pick<BlastForCall, "script" | "language" | "disclose">,
  who: string,
) => [b.disclose ? disclosure(who, b.language) : "", b.script.trim()].filter(Boolean).join(" ");
