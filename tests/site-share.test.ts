// Checks for passing a campaign's website on: the words with the link and the WhatsApp link.
// Pure. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/site-share.test.ts

import { shareWords, whatsappShare } from "@/lib/site/share";

let pass = 0;
let fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) pass++;
  else {
    fail++;
    console.log(`FAIL ${name}\n  got  ${g}\n  want ${w}`);
  }
}

const url = "https://groundwork.ke/s/githunguri";
eq(
  "the words name the candidate, else the campaign, with the seat and the address",
  [
    shareWords(
      { candidate: "Gathoni Wamuchomba", name: "Wamuchomba 2027", seat: "MP · Githunguri" },
      url,
    ),
    shareWords({ candidate: null, name: "Roysambu Ward", seat: "MCA · Roysambu" }, url),
  ],
  [
    "Gathoni Wamuchomba (MP · Githunguri): see what we will work on, and join the team. https://groundwork.ke/s/githunguri",
    "Roysambu Ward (MCA · Roysambu): see what we will work on, and join the team. https://groundwork.ke/s/githunguri",
  ],
);
eq(
  "the WhatsApp link carries the words, encoded, to a chat the person picks",
  whatsappShare("Ndio: a & b · https://x.ke/s/a?b=1"),
  "https://wa.me/?text=Ndio%3A%20a%20%26%20b%20%C2%B7%20https%3A%2F%2Fx.ke%2Fs%2Fa%3Fb%3D1",
);
eq(
  "decoded, the WhatsApp text is the words exactly",
  decodeURIComponent(
    whatsappShare(shareWords({ candidate: "A", name: "B", seat: "MP · C" }, url)).split(
      "text=",
    )[1]!,
  ),
  "A (MP · C): see what we will work on, and join the team. https://groundwork.ke/s/githunguri",
);

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
