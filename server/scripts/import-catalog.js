const fs = require('fs');
const path = require('path');

const VALID_ZONES = ['шея', 'поясница', 'грудной_отдел', 'колени', 'ноги_таз', 'спина_осанка', 'плечи_руки', 'баланс_общее'];

function parseZoneString(zoneStr) {
  if (!zoneStr || zoneStr.includes('Не определено')) return [];
  const parts = zoneStr.split(',').map(s => s.trim().replace(/\?$/, '').toLowerCase());
  const zones = [];
  for (const part of parts) {
    if (VALID_ZONES.includes(part)) {
      zones.push(part);
    } else {
      const mapped = mapZoneName(part);
      if (mapped) zones.push(mapped);
    }
  }
  return [...new Set(zones)];
}

function mapZoneName(name) {
  const map = {
    'общая суставная разминка (без явного акцента)': 'баланс_общее',
    'шея': 'шея',
    'плечи_руки': 'плечи_руки',
    'грудной_отдел': 'грудной_отдел',
    'поясница': 'поясница',
    'спина_осанка': 'спина_осанка',
    'колени': 'колени',
    'ноги_таз': 'ноги_таз',
    'баланс_общее': 'баланс_общее',
  };
  return map[name] || null;
}

function parseDuration(durStr) {
  if (!durStr) return 27;
  const parts = String(durStr).split(':');
  if (parts.length === 2) {
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  }
  return parseInt(durStr) || 27;
}

function parseDirection(dirStr) {
  if (!dirStr) return null;
  if (dirStr.includes('суставная разминка') || dirStr.includes('Суставная разминка')) {
    return 'суставная_разминка';
  }
  if (dirStr.includes('поток') || dirStr.includes('Поток')) {
    return 'занятие_в_потоке';
  }
  return null;
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split('.');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return dateStr;
}

async function importCatalog(xlsxExtractDir, _dbPath) {
  console.log('Reading sharedStrings.xml...');
  const ssXml = fs.readFileSync(path.join(xlsxExtractDir, 'xl', 'sharedStrings.xml'), 'utf8');
  const strings = [];
  const tMatches = ssXml.matchAll(/<t>([^<]*)<\/t>/g);
  for (const m of tMatches) {
    strings.push(m[1]);
  }
  console.log(`  ${strings.length} shared strings`);

  console.log('Reading sheet1.xml...');
  const sheetXml = fs.readFileSync(path.join(xlsxExtractDir, 'xl', 'worksheets', 'sheet1.xml'), 'utf8');
  const rowCount = (sheetXml.match(/<row /g) || []).length;
  console.log(`  ${rowCount} rows`);

  function parseRow(rowXml) {
    const cells = {};
    const cellMatches = rowXml.matchAll(/<c r="([A-Z]+)\d+"[^>]*>(?:<v>([^<]*)<\/v>)?<\/c>/g);
    for (const m of cellMatches) {
      const col = m[1];
      const val = m[2] || '';
      const cellTag = m[0].match(/<c[^>]*>/)?.[0] || '';
      if (cellTag.includes(' t="s"')) {
        cells[col] = strings[parseInt(val)] || '';
      } else {
        cells[col] = val;
      }
    }
    return cells;
  }

  const lessons = [];

  for (let i = 2; i <= rowCount; i++) {
    const rowRegex = new RegExp('<row r="' + i + '"[^>]*>(.*?)<\\/row>', 's');
    const rowMatch = sheetXml.match(rowRegex);
    if (!rowMatch) continue;

    const cells = parseRow(rowMatch[1]);
    const catalogId = parseInt(cells['A']);
    if (!catalogId) continue;

    const duration = parseDuration(cells['C']);
    const direction = parseDirection(cells['E']);
    const zones = parseZoneString(cells['F']);
    const effect = cells['G'] || null;
    const originalTitle = cells['I'] || null;
    const originalDescription = cells['J'] || null;
    const date = parseDate(cells['B']);

    const title = originalTitle || `Занятие ${catalogId}`;

    lessons.push({
      catalogId, title, duration, direction, zones, effect,
      originalTitle, originalDescription, date,
    });
  }

  console.log(`\nParsed ${lessons.length} lessons from catalog`);

  const stats = { total: lessons.length, imported: 0, skipped: 0, zonesTotal: 0 };
  const zonesStats = {};
  const dirStats = {};

  for (const l of lessons) {
    if (l.direction) {
      dirStats[l.direction] = (dirStats[l.direction] || 0) + 1;
    }
    for (const z of l.zones) {
      zonesStats[z] = (zonesStats[z] || 0) + 1;
    }
  }

  console.log('\nDirection stats:');
  Object.entries(dirStats).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
  console.log('\nZone stats:');
  Object.entries(zonesStats).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

  return { lessons, stats: { ...stats, zonesTotal: Object.values(zonesStats).reduce((a, b) => a + b, 0) } };
}

async function insertIntoDb(lessons, db) {
  const { getDb, saveDb } = require('../db');
  const database = db || await getDb();

  console.log('\nInserting lessons into database...');

  let imported = 0;
  for (const l of lessons) {
    try {
      database.run(
        `INSERT INTO lessons (title, duration, status, date, direction, direction_source, effect_description, is_free)
         VALUES (?, ?, 'active', ?, ?, 'заголовок', ?, 0)`,
        [l.title, l.duration, l.date, l.direction, l.effect]
      );
      const idResult = database.exec(`SELECT last_insert_rowid()`);
      const lessonId = idResult[0]?.values[0]?.[0];
      if (lessonId) {
        for (const zone of l.zones) {
          database.run(`INSERT OR IGNORE INTO lesson_zones (lesson_id, zone) VALUES (?, ?)`, [lessonId, zone]);
        }
        imported++;
      }
    } catch (err) {
      console.error(`  Error importing lesson ${l.catalogId}: ${err.message}`);
    }
  }

  saveDb();
  console.log(`Imported ${imported} lessons`);
  return imported;
}

module.exports = { importCatalog, insertIntoDb, parseZoneString, parseDuration, parseDirection, parseDate };

if (require.main === module) {
  const xlsxDir = process.argv[2] || path.join(process.env.USERPROFILE || '', 'AppData', 'Local', 'Temp', 'xlsx_extract');
  if (!fs.existsSync(path.join(xlsxDir, 'xl', 'worksheets', 'sheet1.xml'))) {
    console.error('Usage: node import-catalog.js [path-to-extracted-xlsx]');
    console.error('Default: ' + xlsxDir);
    process.exit(1);
  }

  importCatalog(xlsxDir).then(({ lessons, stats }) => {
    console.log('\n=== IMPORT PREVIEW ===');
    console.log(`Lessons: ${stats.total}`);
    console.log(`Zones: ${stats.zonesTotal}`);
    console.log('\nFirst 5 lessons:');
    lessons.slice(0, 5).forEach(l => {
      console.log(`  #${l.catalogId}: ${l.title} (${l.duration}s) [${l.zones.join(', ')}]`);
    });

    const confirm = process.argv.includes('--confirm');
    if (!confirm) {
      console.log('\nRun with --confirm to insert into database');
      process.exit(0);
    }

    return insertIntoDb(lessons);
  }).then((imported) => {
    if (imported !== undefined) console.log('\nDone!');
    process.exit(0);
  }).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
