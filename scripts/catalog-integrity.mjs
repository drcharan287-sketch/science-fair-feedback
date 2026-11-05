/**
 * Shared fail-closed integrity validation for the PUBLIC VoiceVote catalog.
 *
 * Each published project may also carry a stable ID that survives a rename.
 * Duplicate visible names within a class and section are still AMBIGUOUS,
 * so do not publish them even if their IDs differ.
 *
 * This checks prospective data only. It never reads or writes feedback.
 */
export function validateProjectEntries(entries) {
  if (!Array.isArray(entries) || !entries.length) {
    throw new Error('No active projects returned; existing public snapshot retained.');
  }
  if (entries.length > 10000) {
    throw new Error('Unexpectedly large project catalog; existing snapshot retained.');
  }
  const limits = {grade:30, section:120, project:200};
  const seen = new Map();
  const seenIds = new Map();
  const projects = entries.map((item, row) => {
    if (!item || typeof item !== 'object') {
      throw new Error('Project catalog row ' + (row + 1) + ' is missing.');
    }
    const p = {};
    for (const key of ['grade','section','project']) {
      const value = item[key];
      if (typeof value !== 'number' && typeof value !== 'string') {
        throw new Error('Project catalog row ' + (row + 1) + ' has an invalid ' + key + '.');
      }
      const trimmed = String(value).trim();
      if (!trimmed || trimmed.length > limits[key] || /[\u0000-\u001f\u007f]/.test(trimmed)) {
        throw new Error('Project catalog row ' + (row + 1) + ' has an empty, oversized or control-character ' + key + '.');
      }
      p[key] = trimmed;
    }
    if (item.id !== undefined && item.id !== null && String(item.id).trim()) {
      const id = String(item.id).trim();
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id)) {
        throw new Error('Invalid stable project ID at row ' + (row + 1) + '.');
      }
      if (seenIds.has(id)) {
        throw new Error('Duplicate stable project ID at rows ' + seenIds.get(id) +
          ' and ' + (row + 1) + '.');
      }
      seenIds.set(id, row + 1);
      p.id = id;
    }
    // Normalization is ONLY used to spot aliases. Keep exact names because
    // the deployed backend validates submitted values against Sheet strings.
    const identity = JSON.stringify(
      [p.grade,p.section,p.project].map(s => s.normalize('NFKC').replace(/\s+/gu,' ').toLocaleLowerCase())
    );
    if (seen.has(identity)) {
      throw new Error('Ambiguous catalog identity: rows ' + seen.get(identity) +
        ' and ' + (row + 1) + ' refer to the same class, section and project. ' +
        'Give different teams distinct approved project names before publishing.');
    }
    seen.set(identity,row + 1);
    return p;
  });
  return projects.sort((a,b) =>
    a.grade.localeCompare(b.grade,undefined,{numeric:true}) ||
    a.section.localeCompare(b.section,undefined,{numeric:true}) ||
    a.project.localeCompare(b.project,undefined,{numeric:true})
  );
}
