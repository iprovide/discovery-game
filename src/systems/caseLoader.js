// Case registry. Cases are pure data (src/data/cases/*.json) and are picked
// up by glob rather than named imports, so the Notion sync can drop a new
// case-XX.json into the folder without anyone editing code. Ordered by
// level, then order, then id.

const modules = import.meta.glob('../data/cases/*.json', { eager: true });

const CASES = Object.values(modules)
  .map((m) => m.default ?? m)
  .sort(
    (a, b) => (a.level ?? 1) - (b.level ?? 1) || (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id)
  );

if (!CASES.length) {
  throw new Error('No case files found in src/data/cases/ — run the Notion sync or restore case-01.json');
}

export function getCaseByIndex(index) {
  return CASES[index % CASES.length];
}

export function getCaseById(id) {
  return CASES.find((c) => c.id === id);
}

export function caseCount() {
  return CASES.length;
}

export default CASES;
