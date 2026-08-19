#!/usr/bin/env node
// Field Archive static site generator.
// Fetches Specimens + Concepts from Airtable and writes static HTML into docs/.
//
// Requires Node 20+ (uses global fetch) and an AIRTABLE_TOKEN env var scoped
// read-only to the base below.

import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');

const BASE_ID = 'app0RuO42lb4FLov0';
const SPECIMENS_TABLE_ID = 'tbl8kUsFvFztzd1PD';
const CONCEPTS_TABLE_ID = 'tblYFySOs7CHxNIxA';

const TOKEN = process.env.AIRTABLE_TOKEN;
if (!TOKEN) {
  console.error('Missing AIRTABLE_TOKEN environment variable.');
  process.exit(1);
}

// Explicit field allowlists. This is what keeps the private "Specialists"
// field (Concepts) out of the build entirely — it is never requested from
// the Airtable API, so it never reaches docs/ or git history.
const SPECIMEN_FIELDS = [
  'Specimen Code', 'Name', 'Neighborhood', 'Date Spotted',
  'Photos', 'Measurements', 'Existing Materials', 'Notes',
];
const CONCEPT_FIELDS = [
  'Concept Code', 'Specimen', 'Concept Art', 'Idea', 'Challenge', 'Blocks', 'Materials',
];

async function fetchAllRecords(tableId, fields) {
  const records = [];
  let offset;
  do {
    const params = new URLSearchParams();
    for (const f of fields) params.append('fields[]', f);
    params.set('pageSize', '100');
    if (offset) params.set('offset', offset);
    const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${tableId}?${params}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    if (!res.ok) {
      throw new Error(`Airtable fetch failed (${tableId}): ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    records.push(...data.records);
    offset = data.offset;
  } while (offset);
  return records;
}

function slugForAttachment(att) {
  const ext = path.extname(att.filename || '') || '.jpg';
  const base = path.basename(att.filename || att.id, ext)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);
  return `${att.id}-${base || 'file'}${ext.toLowerCase()}`;
}

async function downloadAttachments(attachments, destDir) {
  if (!attachments || !attachments.length) return [];
  await mkdir(destDir, { recursive: true });
  const results = [];
  for (const att of attachments) {
    const filename = slugForAttachment(att);
    const dest = path.join(destDir, filename);
    if (!existsSync(dest)) {
      const res = await fetch(att.url);
      if (!res.ok) {
        console.warn(`  ! failed to download attachment ${att.id}: ${res.status}`);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      await writeFile(dest, buf);
      console.log(`  downloaded ${filename}`);
    }
    results.push(filename);
  }
  return results;
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yy = String(d.getUTCFullYear()).slice(-2);
  return `${dd}.${mm}.${yy}`;
}

function datafield(label, value) {
  if (value) {
    return `<div class="datafield"><div class="lbl">${esc(label)}</div><div class="val">${esc(value)}</div></div>`;
  }
  return `<div class="datafield"><div class="lbl">${esc(label)}</div><div class="val muted">Not yet recorded</div></div>`;
}

function pageShell({ prefix, title, tally, backLink, body }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${esc(title)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,500;1,9..144,600&family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${prefix}assets/css/site.css">
<link rel="icon" href="${prefix}assets/img/favicon.svg" type="image/svg+xml">
</head>
<body>
<div class="wrap">
  <div class="topbar">
    <div class="row">
      <div class="wordmark"><a href="${prefix}index.html"><b>Maker Project Lab</b><span>&middot;</span>Field Archive</a></div>
      <div class="tally">${esc(tally)}</div>
    </div>
  </div>

  ${body}

  <div class="foot">
    <div class="stampline">
      <img class="mpl-mark" src="${prefix}assets/img/mpl-mark.svg" alt="Maker Project Lab">
      <div class="word">Maker Project Lab<br>Barcelona field archive</div>
    </div>
    ${backLink}
  </div>
</div>
</body>
</html>
`;
}

function renderConceptCard(concept, specimenCode) {
  const [artFile] = concept.artFiles;
  const art = artFile
    ? `<div class="concept-art"><img src="../assets/images/concepts/${concept.id}/${artFile}" alt="Concept art for ${esc(concept.idea || concept.code)}"></div>`
    : `<div class="concept-art no-art"><div class="hint">No concept art yet</div></div>`;

  const rows = [
    ['Challenge', concept.challenge, 'alt'],
    ['Blocks', concept.blocks, ''],
    ['Materials', concept.materials, ''],
  ].filter(([, val]) => val)
    .map(([label, val, variant]) => `
        <span class="lbl-tag${variant ? ' ' + variant : ''}">${esc(label)}</span>
        <div class="field-text">${esc(val)}</div>`).join('');

  return `
    <div class="concept-card">
      ${art}
      <div class="concept-body">
        <div class="concept-id">${esc(concept.code)} &middot; branch of ${esc(specimenCode)}</div>
        <h3>${esc(concept.idea || concept.code)}</h3>
        ${rows}
      </div>
    </div>`;
}

function renderSpecimenPage(specimen, concepts, specimenCount) {
  const [heroFile] = specimen.photoFiles;
  const heroPhoto = heroFile
    ? `<div class="hero-photo"><img src="../assets/images/specimens/${specimen.id}/${heroFile}" alt="${esc(specimen.name)}, as found"></div>`
    : `<div class="hero-photo no-photo"><div class="hint">No photo yet</div></div>`;

  const chips = [specimen.neighborhood, specimen.dateSpotted ? `Spotted ${specimen.dateSpotted}` : null]
    .filter(Boolean)
    .map(c => `<div class="chip">${esc(c)}</div>`).join('');

  const branches = concepts.length
    ? `
  <div class="tree"></div>
  <div class="concepts">
    ${concepts.map(c => renderConceptCard(c, specimen.code)).join('\n')}
  </div>`
    : `
  <div class="no-concepts"><div class="body-text">No concepts filed yet &mdash; check back soon.</div></div>`;

  const body = `
  <div class="hero">
    <div>
      ${heroPhoto}
      <div class="hero-cap">Photographed as found${specimen.neighborhood ? ' &middot; ' + esc(specimen.neighborhood) + ', Barcelona' : ''}</div>
    </div>
    <div class="hero-right">
      <div class="eyebrow">Specimen ${esc(specimen.code)}</div>
      <h1>${esc(specimen.name).replace(/\n/g, '<br>')}</h1>
      <div class="meta-row">${chips}</div>
      <div class="datafields">
        ${datafield('Materials', specimen.existingMaterials)}
        ${datafield('Measurements', specimen.measurements)}
        ${datafield('Notes', specimen.notes)}
      </div>
    </div>
  </div>

  <div class="branch-header">
    <h2>Branches</h2>
    <div class="count">${concepts.length} concept${concepts.length === 1 ? '' : 's'} filed against this specimen</div>
  </div>
  ${branches}`;

  return pageShell({
    prefix: '../',
    title: `${specimen.code} — ${specimen.name} · Field Archive`,
    tally: `${specimenCount} specimen${specimenCount === 1 ? '' : 's'} catalogued`,
    backLink: `<a class="back" href="../index.html">&larr; Back to full archive</a>`,
    body,
  });
}

function renderArchiveCard(specimen) {
  const [photoFile] = specimen.photoFiles;
  const photo = photoFile
    ? `<div class="archive-photo"><img src="assets/images/specimens/${specimen.id}/${photoFile}" alt="${esc(specimen.name)}"></div>`
    : `<div class="archive-photo no-photo"><div class="hint">No photo yet</div></div>`;

  return `
    <a class="archive-card" href="specimens/${specimen.code}.html">
      ${photo}
      <div class="archive-body">
        <div class="archive-id">${esc(specimen.code)}</div>
        <h3 class="archive-name">${esc(specimen.name)}</h3>
        <div class="archive-meta">
          ${specimen.neighborhood ? `<div class="chip">${esc(specimen.neighborhood)}</div>` : ''}
          <div class="chip">${specimen.conceptCount} concept${specimen.conceptCount === 1 ? '' : 's'}</div>
        </div>
      </div>
    </a>`;
}

function renderIndexPage(specimens) {
  const body = `
  <div class="archive-intro">
    <div class="eyebrow">Barcelona street infrastructure, catalogued</div>
    <h1>The Field Archive</h1>
  </div>
  <div class="archive-grid">
    ${specimens.map(renderArchiveCard).join('\n')}
  </div>`;

  return pageShell({
    prefix: '',
    title: 'Field Archive · Maker Project Lab',
    tally: `${specimens.length} specimen${specimens.length === 1 ? '' : 's'} catalogued`,
    backLink: '',
    body,
  });
}

async function main() {
  console.log('Fetching Specimens and Concepts from Airtable...');
  const [specimenRecords, conceptRecords] = await Promise.all([
    fetchAllRecords(SPECIMENS_TABLE_ID, SPECIMEN_FIELDS),
    fetchAllRecords(CONCEPTS_TABLE_ID, CONCEPT_FIELDS),
  ]);
  console.log(`  ${specimenRecords.length} specimens, ${conceptRecords.length} concepts`);

  await mkdir(DOCS, { recursive: true });

  console.log('Downloading attachments...');
  const specimens = [];
  for (const rec of specimenRecords) {
    const f = rec.fields;
    const photoFiles = await downloadAttachments(
      f['Photos'],
      path.join(DOCS, 'assets', 'images', 'specimens', rec.id)
    );
    specimens.push({
      id: rec.id,
      code: f['Specimen Code'] || rec.id,
      name: f['Name'] || 'Untitled specimen',
      neighborhood: f['Neighborhood'] || null,
      dateSpotted: fmtDate(f['Date Spotted']),
      measurements: f['Measurements'] || null,
      existingMaterials: f['Existing Materials'] || null,
      notes: f['Notes'] || null,
      photoFiles,
    });
  }

  const conceptsBySpecimen = new Map();
  for (const rec of conceptRecords) {
    const f = rec.fields;
    const artFiles = await downloadAttachments(
      f['Concept Art'],
      path.join(DOCS, 'assets', 'images', 'concepts', rec.id)
    );
    const specimenLink = (f['Specimen'] || [])[0];
    const concept = {
      id: rec.id,
      code: f['Concept Code'] || rec.id,
      idea: f['Idea'] || null,
      challenge: f['Challenge'] || null,
      blocks: f['Blocks'] || null,
      materials: f['Materials'] || null,
      artFiles,
    };
    if (!specimenLink) {
      console.warn(`  ! concept ${concept.code} has no linked specimen, skipping`);
      continue;
    }
    if (!conceptsBySpecimen.has(specimenLink)) conceptsBySpecimen.set(specimenLink, []);
    conceptsBySpecimen.get(specimenLink).push(concept);
  }

  for (const specimen of specimens) {
    specimen.conceptCount = (conceptsBySpecimen.get(specimen.id) || []).length;
  }

  console.log('Writing pages...');
  await mkdir(path.join(DOCS, 'specimens'), { recursive: true });
  await mkdir(path.join(DOCS, 'assets', 'css'), { recursive: true });
  await mkdir(path.join(DOCS, 'assets', 'img'), { recursive: true });
  await copyFile(
    path.join(ROOT, 'assets', 'css', 'site.css'),
    path.join(DOCS, 'assets', 'css', 'site.css')
  );
  await copyFile(
    path.join(ROOT, 'assets', 'img', 'mpl-mark.svg'),
    path.join(DOCS, 'assets', 'img', 'mpl-mark.svg')
  );
  await copyFile(
    path.join(ROOT, 'assets', 'img', 'favicon.svg'),
    path.join(DOCS, 'assets', 'img', 'favicon.svg')
  );

  await writeFile(path.join(DOCS, 'index.html'), renderIndexPage(specimens));
  for (const specimen of specimens) {
    const concepts = conceptsBySpecimen.get(specimen.id) || [];
    const html = renderSpecimenPage(specimen, concepts, specimens.length);
    await writeFile(path.join(DOCS, 'specimens', `${specimen.code}.html`), html);
  }

  await writeFile(path.join(DOCS, '.nojekyll'), '');

  console.log(`Done. Wrote ${specimens.length + 1} pages to docs/.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
