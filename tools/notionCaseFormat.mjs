// Round-trippable converter between a case JSON file and the Notion page
// body that authors it. Both directions live here so they can't drift, and
// so the scheduled sync is a deterministic transform rather than a model
// re-reading prose every night.
//
// Format spec (human-facing copy): docs/notion-case-format.md
//
// Shape rules, in one paragraph: "## " opens a section, "### " opens a
// record inside it, and every field is a "- key: value" bullet. Nothing
// else is significant. That means the whole thing stays editable from the
// Notion mobile app, which is the point.

// Kept in step with scanEngine.js — this module is imported by the Notion
// tooling, which must not pull in anything Phaser-adjacent.
const KINDS = ['aside', 'passage', 'thread'];
function inferKind(length) {
  if (length < 34) return 'aside';
  if (length < 54) return 'passage';
  return 'thread';
}

const SECTIONS = {
  FACT: 'Fact Pattern',
  DISC: 'Disclosures',
  LEADS: 'Leads',
  FIELDS: 'Request Fields',
  DOCS: 'Documents',
  TUNING: 'Tuning'
};

// --------------------------------------------------------------- serialize

function bullets(pairs) {
  return pairs.map(([k, v]) => `- ${k}: ${v}`).join('\n');
}

export function caseToMarkdown(c) {
  const out = [];

  out.push(`## ${SECTIONS.FACT}`, '', c.factPattern.trim(), '');

  out.push(`## ${SECTIONS.DISC}`, '');
  out.push('### Preamble', '', c.disclosures.preamble.trim(), '');
  c.disclosures.entries.forEach((e) => {
    out.push(`### ${e.heading}`, '', e.text.trim(), '');
  });

  out.push(`## ${SECTIONS.LEADS}`, '');
  c.disclosures.leads.forEach((l) => out.push(`- ${l}`));
  out.push('');

  out.push(`## ${SECTIONS.FIELDS}`, '');
  const fields = [
    ...c.requestFields.mandatory.map((f) => [f, true]),
    ...c.requestFields.discoverable.map((f) => [f, false])
  ];
  fields.forEach(([f, required]) => {
    out.push(`### ${f.label}`, '');
    out.push(
      bullets(
        [
          ['field', f.id],
          ['required', required ? 'yes' : 'no'],
          f.multi ? ['multi', 'yes'] : null,
          ['phrase', f.phrase]
        ].filter(Boolean)
      )
    );
    f.options.forEach((o) => out.push(`- option: ${o.value} = ${o.label}`));
    out.push('');
  });

  out.push(`## ${SECTIONS.DOCS}`, '');
  c.documentPool.forEach((d) => {
    out.push(`### ${d.id} — ${d.title}`, '');
    out.push(
      bullets([
        ['type', d.type],
        ['date', d.date],
        ['custodian', d.custodian],
        ['location', d.location],
        ['labels', (d.labels || []).join(', ')],
        ['length', d.baseLength]
      ])
    );
    (d.hotZones || []).forEach((z) =>
      out.push(`- zone: ${z.kind} ${z.length} | ${z.value} | ${z.flavor}`)
    );
    out.push('');
  });

  const sc = c.scoringConfig;
  out.push(`## ${SECTIONS.TUNING}`, '');
  out.push(
    bullets([
      ['compression curve', sc.compressionCurve.join(', ')],
      ['window width', sc.windowWidth],
      ['extra document type cost', sc.extraDocTypeCost ?? 0],
      ['capture threshold', sc.captureThreshold],
      ['minimum document length', sc.minDocumentLength]
    ])
  );
  // Labor (Phase 3): a purchased pool of reading effort AND a box of a given
  // size in grid cells. The player divides the pool by packing the box, so
  // there is no Spread row and no `notch` line any more.
  // A trailing "*" on the id marks the option the builder opens on.
  const star = (o) => (o.default ? '*' : '');
  sc.laborTiers.forEach((t) => {
    const b = t.box || {};
    out.push(
      `- tier ${t.id}${star(t)}: cost ${t.cost} | effort ${t.effort} | box ${b.w}x${b.h} | ${t.label} | ${t.blurb}`
    );
  });
  sc.readingStyles.forEach((r) => {
    out.push(
      `- style ${r.id}${star(r)}: width ${r.width} | effort ${r.effort} | ` +
        `catches ${(r.catches || []).join(', ')} | ${r.label} | ${r.blurb}`
    );
  });
  out.push('');

  return out.join('\n');
}

// ------------------------------------------------------------------- parse

function tokenize(md) {
  // Notion hands back enhanced markdown that may carry a preamble; the spec
  // starts at the first "## " heading.
  // Notion hands markdown back with its special characters escaped
  // ("60 \\| 400", "all \\{value\\}"), so undo that before parsing or every
  // zone and phrase comes back mangled.
  const unescaped = md.replace(/\\([\\`*_{}\[\]()#+\-.!|~>=])/g, '$1');
  const first = unescaped.match(/^##\s+(?!#)/m);
  const body = first ? unescaped.slice(first.index) : unescaped;

  const sections = [];
  let section = null;
  let record = null;

  for (const rawLine of body.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    const trimmed = line.trim();

    const h2 = trimmed.match(/^##\s+(?!#)(.*)$/);
    if (h2) {
      section = { name: h2[1].trim(), records: [], prose: [], bullets: [] };
      sections.push(section);
      record = null;
      continue;
    }
    const h3 = trimmed.match(/^###\s+(.*)$/);
    if (h3 && section) {
      record = { heading: h3[1].trim(), prose: [], bullets: [] };
      section.records.push(record);
      continue;
    }
    if (!section) continue;

    const target = record || section;
    const bullet = trimmed.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      target.bullets.push(bullet[1].trim());
    } else if (trimmed) {
      target.prose.push(trimmed);
    } else {
      target.prose.push('');
    }
  }
  return sections;
}

const kv = (bulletList) => {
  const map = {};
  const repeated = {};
  bulletList.forEach((b) => {
    const m = b.match(/^([A-Za-z][\w ]*?)\s*:\s*(.*)$/);
    if (!m) return;
    const key = m[1].trim().toLowerCase();
    const value = m[2].trim();
    if (key in map) {
      repeated[key] = repeated[key] || [map[key]];
      repeated[key].push(value);
    } else {
      map[key] = value;
    }
  });
  Object.entries(repeated).forEach(([k, v]) => {
    map[k] = v[v.length - 1];
    map[`${k}[]`] = v;
  });
  // Single occurrences still need list form for the repeatable keys.
  ['option', 'zone'].forEach((k) => {
    if (map[k] !== undefined && !map[`${k}[]`]) map[`${k}[]`] = [map[k]];
  });
  return map;
};

// Notion stores each paragraph as its own block and returns them one per
// line with no blank line between, so a non-empty line IS a paragraph.
// (A soft line break inside a paragraph therefore becomes a paragraph
// break on the way back — documented in docs/notion-case-format.md.)
const prose = (lines) =>
  lines
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n\n')
    .trim();

class ParseError extends Error {}

export function markdownToCase(markdown, meta) {
  const sections = tokenize(markdown);
  const find = (name) => sections.find((s) => s.name.toLowerCase() === name.toLowerCase());
  const need = (name) => {
    const s = find(name);
    if (!s) throw new ParseError(`Missing "## ${name}" section`);
    return s;
  };

  if (!meta || !meta.caseId) throw new ParseError('Missing Case ID property');

  // Fact pattern
  const factPattern = prose(need(SECTIONS.FACT).prose);
  if (!factPattern) throw new ParseError('Fact Pattern section is empty');

  // Disclosures
  const disc = need(SECTIONS.DISC);
  let preamble = '';
  const entries = [];
  disc.records.forEach((r) => {
    if (r.heading.toLowerCase() === 'preamble') preamble = prose(r.prose);
    else entries.push({ heading: r.heading, text: prose(r.prose) });
  });

  const leadsSection = find(SECTIONS.LEADS);
  const leads = leadsSection ? leadsSection.bullets.slice() : [];

  // Request fields
  const mandatory = [];
  const discoverable = [];
  need(SECTIONS.FIELDS).records.forEach((r) => {
    const m = kv(r.bullets);
    if (!m.field) throw new ParseError(`Request field "${r.heading}" is missing a "field:" bullet`);
    const options = (m['option[]'] || []).map((o) => {
      const parts = o.split('=');
      if (parts.length < 2) throw new ParseError(`Bad option "${o}" in field "${r.heading}"`);
      return { value: parts[0].trim(), label: parts.slice(1).join('=').trim() };
    });
    if (!options.length) throw new ParseError(`Request field "${r.heading}" has no options`);
    const field = { id: m.field, label: r.heading, phrase: m.phrase || '{value}', options };
    // A multi field lets the player tick several values at once; the engine
    // treats its request value as an array.
    if ((m.multi || '').toLowerCase() === 'yes') field.multi = true;
    if ((m.required || '').toLowerCase() === 'yes') mandatory.push(field);
    else discoverable.push({ ...field, unlockedBy: m.unlockedby || 'stub' });
  });
  if (!mandatory.length) throw new ParseError('No required request fields');

  // Documents
  const documentPool = need(SECTIONS.DOCS).records.map((r) => {
    const m = kv(r.bullets);
    // "doc-01 — Title": the id never contains whitespace, so split on the
    // FIRST dash only. Titles are free to contain their own hyphens.
    const head = r.heading.match(/^(\S+)\s+[—–-]\s+([\s\S]+)$/);
    const id = (head ? head[1] : r.heading).trim();
    const title = head ? head[2].trim() : id;
    const length = Number(m.length);
    if (!Number.isFinite(length)) throw new ParseError(`Document "${id}" has a bad "length:"`);
    const hotZones = (m['zone[]'] || []).map((z) => {
      const parts = z.split('|');
      if (parts.length < 3) throw new ParseError(`Bad zone in "${id}": ${z}`);
      // "aside 24" or just "24" — the kind is optional and inferred from the
      // length when it's left off, so a case can be typed without thinking
      // about kinds at all.
      const headMatch = parts[0].trim().match(/^(?:([a-z]+)\s+)?(\d+)$/i);
      if (!headMatch) throw new ParseError(`Zone in "${id}" needs "[kind] length": ${z}`);
      const zk = headMatch[1] ? headMatch[1].toLowerCase() : null;
      if (zk && !KINDS.includes(zk)) {
        throw new ParseError(`Zone in "${id}" has unknown kind "${zk}" (use ${KINDS.join(', ')})`);
      }
      const zl = Number(headMatch[2]);
      const zv = Number(parts[1].trim());
      if (!Number.isFinite(zl) || !Number.isFinite(zv)) {
        throw new ParseError(`Zone in "${id}" needs numeric length and value`);
      }
      return {
        length: zl,
        value: zv,
        kind: zk || inferKind(zl),
        flavor: parts.slice(2).join('|').trim()
      };
    });
    return {
      id,
      title,
      type: m.type || '',
      date: m.date || '',
      custodian: m.custodian || '',
      location: m.location || '',
      labels: (m.labels || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      baseLength: length,
      hotZones
    };
  });
  if (!documentPool.length) throw new ParseError('Document pool is empty');

  // Tuning
  const tuningBullets = need(SECTIONS.TUNING).bullets;
  const t = kv(tuningBullets);
  // "tier solo: ..." parses as its own key per row, so pull these from the raw
  // bullets instead of the key/value map. A trailing "*" on the id marks the
  // option the request builder opens on.
  const rowsOf = (kind) =>
    tuningBullets.filter((b) => new RegExp(`^${kind}\\s+[a-z0-9_-]+\\*?\\s*:`, 'i').test(b));

  const splitRow = (kind, line) => {
    const entry = line.replace(new RegExp(`^${kind}\\s+`, 'i'), '');
    const [head, ...rest] = entry.split('|');
    const m = head.match(/^([a-z0-9_-]+)(\*?)\s*:\s*(.*)$/i);
    if (!m) throw new ParseError(`Bad ${kind} line: ${line}`);
    return { id: m[1], isDefault: m[2] === '*', head: m[3].trim(), rest };
  };
  const num = (text, key, line, kind) => {
    const m = text.match(new RegExp(`${key}\\s+(-?[\\d.]+)`, 'i'));
    if (!m) throw new ParseError(`${kind} line needs "${key} N": ${line}`);
    return Number(m[1]);
  };
  const withDefault = (rows) => {
    if (!rows.some((r) => r.default)) rows[Math.floor(rows.length / 2)].default = true;
    return rows;
  };

  const laborTiers = rowsOf('tier').map((line) => {
    const { id, isDefault, head, rest } = splitRow('tier', line);
    const boxRaw = (rest[1] || '').match(/box\s*(\d+)\s*[x×]\s*(\d+)/i);
    if (!boxRaw) throw new ParseError(`Tier line needs "box WxH": ${line}`);
    const row = {
      id,
      cost: num(head, 'cost', line, 'Tier'),
      effort: num(rest[0] || '', 'effort', line, 'Tier'),
      box: { w: Number(boxRaw[1]), h: Number(boxRaw[2]) },
      label: (rest[2] || '').trim(),
      blurb: (rest[3] || '').trim()
    };
    if (row.box.w < 2 || row.box.h < 2) {
      throw new ParseError(`Tier "${id}" box must be at least 2x2: ${line}`);
    }
    if (isDefault) row.default = true;
    return row;
  });
  if (!laborTiers.length) throw new ParseError('No labor tiers defined');

  const readingStyles = rowsOf('style').map((line) => {
    const { id, isDefault, head, rest } = splitRow('style', line);
    const caught = ((rest[1] || '').match(/catches\s+([a-z,\s]+)/i) || [])[1] || '';
    const catches = caught
      .split(',')
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean);
    if (!catches.length) throw new ParseError(`Style line needs "catches <kinds>": ${line}`);
    catches.forEach((k) => {
      if (!KINDS.includes(k)) throw new ParseError(`Style "${id}" catches unknown kind "${k}"`);
    });
    const row = {
      id,
      width: num(head, 'width', line, 'Style'),
      effort: num(rest[0] || '', 'effort', line, 'Style'),
      catches,
      label: (rest[2] || '').trim(),
      blurb: (rest[3] || '').trim()
    };
    if (isDefault) row.default = true;
    return row;
  });
  // Every kind must be registered by someone, or a case can hide money where
  // no plan can ever reach it.
  KINDS.forEach((k) => {
    if (!readingStyles.some((r) => r.catches.includes(k))) {
      throw new ParseError(`No reading style catches "${k}" findings`);
    }
  });
  if (!readingStyles.length) throw new ParseError('No reading styles defined');

  withDefault(laborTiers);
  withDefault(readingStyles);

  const numList = (s) => String(s).split(',').map((x) => Number(x.trim()));

  return {
    id: meta.caseId,
    level: meta.level ?? 1,
    order: meta.order ?? 1,
    title: meta.title,
    subtitle: meta.subtitle ?? '',
    client: meta.client ?? '',
    opponent: meta.opponent ?? '',
    factPattern,
    disclosures: { preamble, entries, leads },
    requestFields: { mandatory, discoverable },
    documentPool,
    scoringConfig: {
      compressionCurve: numList(t['compression curve']),
      minDocumentLength: Number(t['minimum document length']),
      windowWidth: Number(t['window width']),
      extraDocTypeCost: Number(t['extra document type cost'] ?? 0),
      captureThreshold: Number(t['capture threshold']),
      laborTiers,
      readingStyles
    },
    moneyThreshold: meta.moneyThreshold ?? 0
  };
}

export { ParseError };
