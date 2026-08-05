function stripBom(text) {
  return text.replace(/^\uFEFF/, '');
}

function detectDelimiter(text) {
  const sample = text.slice(0, 4000);
  if (sample.includes('\t')) return '\t';
  if (sample.includes(';')) return ';';
  return ',';
}

function splitDelimited(line, delim) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === delim && !inQ) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function splitTitleTheme(titleTheme) {
  if (!titleTheme) return { title: '', theme: null };
  const idx = titleTheme.indexOf(':');
  if (idx > 0) {
    const title = titleTheme.slice(0, idx).trim();
    const theme = titleTheme.slice(idx + 1).trim();
    return { title, theme: theme || null };
  }
  return { title: titleTheme.trim(), theme: null };
}

function mapHeader(cells) {
  const map = {};
  for (let i = 0; i < cells.length; i++) {
    const h = String(cells[i] || '').toLowerCase();
    if (h.includes('№') || h.includes('номер') || h === 'no' || h === 'n') map.catalogNo = i;
    else if (h.includes('назван') || h.includes('тема') || h.includes('заголовок')) map.title = i;
    else if (h.includes('цель')) map.goals = i;
    else if (h.includes('эффект') || h.includes('польз')) map.effect = i;
  }
  return map;
}

function normalizeRows(rawRows) {
  const rows = [];
  let headerMap = null;
  let start = 0;

  if (rawRows.length === 0) return rows;

  const firstCells = rawRows[0];
  const firstIsNumeric = firstCells.length > 0 && !isNaN(parseInt(firstCells[0], 10));

  if (!firstIsNumeric) {
    headerMap = mapHeader(firstCells);
    start = 1;
  }

  const colIndex = (key) => (headerMap && headerMap[key] !== undefined ? headerMap[key] : null);

  for (let i = start; i < rawRows.length; i++) {
    const cells = rawRows[i];
    let catalogNo;
    let titleTheme;
    let goals;
    let effect;

    if (headerMap) {
      const ci = colIndex('catalogNo');
      catalogNo = ci !== null ? cells[ci] : undefined;
      titleTheme = colIndex('title') !== null ? cells[colIndex('title')] : undefined;
      goals = colIndex('goals') !== null ? cells[colIndex('goals')] : undefined;
      effect = colIndex('effect') !== null ? cells[colIndex('effect')] : undefined;
    } else {
      [catalogNo, titleTheme, goals, effect] = [cells[0], cells[1], cells[2], cells[3]];
    }

    const no = parseInt(catalogNo, 10);
    const titleThemeStr = titleTheme == null ? '' : String(titleTheme).trim();
    if (!Number.isInteger(no) || no <= 0 || !titleThemeStr) continue;

    const { title, theme } = splitTitleTheme(titleThemeStr);
    if (!title) continue;

    rows.push({
      catalogNo: no,
      title,
      theme,
      goals: goals == null ? null : String(goals).trim() || null,
      effect: effect == null ? null : String(effect).trim() || null,
    });
  }

  return rows;
}

function parseText(text) {
  const cleaned = stripBom(text);
  const delim = detectDelimiter(cleaned);
  const rawRows = cleaned
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .map((l) => splitDelimited(l, delim));
  return normalizeRows(rawRows);
}

function parseXlsx(buffer) {
  const XLSX = require('xlsx');
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const rawRows = aoa.map((row) => (Array.isArray(row) ? row.map((c) => String(c)) : []));
  return normalizeRows(rawRows);
}

function decodeEntities(str) {
  return str
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(parseInt(d, 10)));
}

function stripTags(html) {
  return decodeEntities(html.replace(/<[^>]+>/g, '').trim());
}

function extractDocxTables(html) {
  const tables = [];
  const tableRe = /<table[^>]*>([\s\S]*?)<\/table>/g;
  let m;
  while ((m = tableRe.exec(html)) !== null) {
    const rows = [];
    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
    let rm;
    while ((rm = rowRe.exec(m[1])) !== null) {
      const cells = [];
      const cellRe = /<td[^>]*>([\s\S]*?)<\/td>|<th[^>]*>([\s\S]*?)<\/th>/g;
      let cm;
      while ((cm = cellRe.exec(rm[1])) !== null) {
        cells.push(stripTags(cm[1] || cm[2] || ''));
      }
      if (cells.length > 0) rows.push(cells);
    }
    if (rows.length > 0) tables.push(rows);
  }
  return tables;
}

async function parseDocx(buffer) {
  const mammoth = require('mammoth');
  const result = await mammoth.convertToHtml({ buffer });
  const html = result.value || '';

  const tables = extractDocxTables(html);
  for (const table of tables) {
    if (table.length < 2) continue;
    const rows = normalizeRows(table);
    if (rows.length > 0) return rows;
  }

  const paragraphRe = /<p[^>]*>([\s\S]*?)<\/p>/g;
  const lines = [];
  let pm;
  while ((pm = paragraphRe.exec(html)) !== null) {
    const text = stripTags(pm[1]);
    if (text) lines.push(text);
  }
  if (lines.length > 0) return parseText(lines.join('\n'));
  return [];
}

module.exports = { parseText, parseXlsx, parseDocx, normalizeRows, splitTitleTheme, detectDelimiter };
