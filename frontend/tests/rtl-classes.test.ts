import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * RTL guard: only logical spacing/positioning utilities are allowed
 * (ms/me/ps/pe/start/end/text-start/text-end/border-s/border-e/rounded-s/rounded-e).
 */
const FORBIDDEN =
  /(?<![\w-])(?:-?(?:ml|mr|pl|pr|left|right|scroll-ml|scroll-mr|scroll-pl|scroll-pr)-[\w./[\]-]+|text-left|text-right|float-left|float-right|border-l|border-r|rounded-l|rounded-r|rounded-tl|rounded-tr|rounded-bl|rounded-br)(?![\w-])/g;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (name === "__fixtures__") return [];
    return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|css)$/.test(name) ? [p] : [];
  });
}

describe("RTL: no physical direction utilities", () => {
  const files = walk(join(__dirname, "..", "src"));

  it("scans source files", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("uses logical utilities only", () => {
    const offences: string[] = [];
    for (const file of files) {
      if (file.endsWith(".test.ts")) continue;
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          // only inspect class-like strings
          if (!/className|class=|@apply/.test(line) && !/["'`]/.test(line)) return;
          for (const m of line.matchAll(FORBIDDEN)) {
            offences.push(`${file}:${i + 1}: ${m[0]}`);
          }
        });
    }
    expect(offences).toEqual([]);
  });

  it("catches forbidden classes (self-test)", () => {
    expect('className="ml-2 pr-4 text-right left-0"'.match(FORBIDDEN)).toEqual(["ml-2", "pr-4", "text-right", "left-0"]);
    expect('className="ms-2 pe-4 text-end start-0 border-s"'.match(FORBIDDEN)).toBeNull();
  });
});
