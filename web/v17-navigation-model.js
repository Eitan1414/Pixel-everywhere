/**
 * v1.7 visual shell: deterministic, DOM-independent feature deduplication.
 * Keep this helper separate so the menu can be unit-tested without a browser.
 */
export function uniqueMenuFeatures(features = []) {
  const seen = new Set();
  const result = [];
  for (const feature of features) {
    const label = String(feature?.label || "").trim();
    const id = String(feature?.id || label).trim().toLowerCase();
    if (!label || !id || seen.has(id)) continue;
    seen.add(id);
    result.push({ ...feature, label });
  }
  return result;
}
