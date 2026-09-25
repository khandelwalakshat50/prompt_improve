/**
 * Split pasted text into test inputs.
 * - If any line is exactly `---` (ignoring surrounding whitespace), split on those lines,
 *   so a single input can span several lines.
 * - Otherwise split on newlines and drop empty lines.
 * Returns null for a single-line paste, which should behave like a normal paste.
 */
export function splitPaste(text: string): string[] | null {
  const normalized = text.replace(/\r\n?/g, "\n");
  if (!normalized.includes("\n")) return null;
  const lines = normalized.split("\n");

  let items: string[];
  if (lines.some((l) => l.trim() === "---")) {
    items = [];
    let block: string[] = [];
    for (const line of lines) {
      if (line.trim() === "---") {
        items.push(block.join("\n"));
        block = [];
      } else {
        block.push(line);
      }
    }
    items.push(block.join("\n"));
    items = items.map((b) => b.replace(/^\s*\n/, "").replace(/\s+$/, "")).filter((b) => b.trim() !== "");
  } else {
    items = lines.filter((l) => l.trim() !== "");
  }

  // A multi-line paste that collapses to one item (e.g. "foo\n\n") is still a normal paste.
  return items.length > 1 ? items : null;
}
