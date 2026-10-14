// Checks for the installable app's rules: where the background file runs, the
// manifest each page names and the two manifests themselves, and the install
// offer. Pure. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/offline-app.test.ts

import { readFileSync } from "node:fs";

import { installKind, manifestHref, shouldRegister } from "@/lib/offline/app";

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

// ---------------------------------------------------------------- where it runs

eq(
  "the live site and every campaign's address; localhost only when asked; never the preview",
  [
    shouldRegister("groundwork.ke", ""),
    shouldRegister("sakaja.groundwork.ke", ""),
    shouldRegister("localhost", "?sw=1"),
    shouldRegister("localhost", ""),
    shouldRegister("id-preview--abc.lovable.app", "?sw=1"),
    shouldRegister("notgroundwork.ke", ""),
  ],
  [true, true, true, false, false, false],
);

// ---------------------------------------------------------------- manifests

eq(
  "the field app's pages name the field manifest; every other page the main one",
  [
    manifestHref("/field"),
    manifestHref("/field/x"),
    manifestHref("/fieldwork"),
    manifestHref("/home"),
  ],
  [
    "/field.webmanifest?v=4",
    "/field.webmanifest?v=4",
    "/site.webmanifest?v=4",
    "/site.webmanifest?v=4",
  ],
);
{
  const site = JSON.parse(readFileSync("public/site.webmanifest", "utf8"));
  const field = JSON.parse(readFileSync("public/field.webmanifest", "utf8"));
  eq(
    "two installs: their own ids and start pages, the same scope and icons",
    [site.id, site.start_url, field.id, field.start_url, field.name, site.scope, field.scope],
    ["/", "/home", "/field", "/field", "Groundwork Field", "/", "/"],
  );
  eq("the same icons", field.icons, site.icons);
}

// ---------------------------------------------------------------- the install offer

const ua = {
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1",
  ipad: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15",
  android:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36",
};
eq(
  "the prompt where offered, the iPhone note, nothing installed or elsewhere",
  [
    installKind({ standalone: false, hasPrompt: true, userAgent: ua.android, touchPoints: 5 }),
    installKind({ standalone: false, hasPrompt: false, userAgent: ua.iphone, touchPoints: 5 }),
    installKind({ standalone: false, hasPrompt: false, userAgent: ua.ipad, touchPoints: 5 }),
    installKind({ standalone: false, hasPrompt: false, userAgent: ua.ipad, touchPoints: 0 }),
    installKind({ standalone: true, hasPrompt: true, userAgent: ua.android, touchPoints: 5 }),
    installKind({ standalone: false, hasPrompt: false, userAgent: ua.android, touchPoints: 5 }),
  ],
  ["prompt", "ios", "ios", null, null, null],
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
