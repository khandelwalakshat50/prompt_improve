export type DiffLine = { type: "same" | "add" | "del"; text: string; a?: number; b?: number };

/** Line diff via LCS. Prompts are small, so O(n*m) is fine. */
export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before.replace(/\r\n?/g, "\n").split("\n");
  const b = after.replace(/\r\n?/g, "\n").split("\n");
  const n = a.length;
  const m = b.length;
  const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: "same", text: a[i], a: i + 1, b: j + 1 });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ type: "del", text: a[i], a: i + 1 });
      i++;
    } else {
      out.push({ type: "add", text: b[j], b: j + 1 });
      j++;
    }
  }
  while (i < n) out.push({ type: "del", text: a[i], a: ++i });
  while (j < m) out.push({ type: "add", text: b[j], b: ++j });
  return out;
}
