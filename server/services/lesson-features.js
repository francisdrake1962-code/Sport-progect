const { BODY_ZONES, MOODS } = require('../constants/lesson-features');

// Heuristic auto-classification of lesson features from free text
// (theme / goals / effect). ZONES = body area, MOODS = wellbeing state.
// Zone keywords are matched on substring; the first zone whose keyword list
// contains the strongest body-area hit wins per zone group (a lesson may get
// several zones). Moods are multi-select too.

const ZONE_KEYWORDS = {
  'шея': ['шеи', 'шея', 'шею', 'шею'],
  'плечи_руки': ['плеч', 'рук', 'кист', 'локте', 'лучезапяст'],
  'грудной_отдел': ['грудн', 'ребр', 'груди', 'грудь'],
  'поясница': ['поясниц', 'поясниц'],
  'спина_осанка': ['спин', 'осанк', 'позвоночн', 'спину', 'спиной'],
  'колени': ['колен', 'колено'],
  'ноги_таз': ['ног', 'таз', 'стоп', 'бёдр', 'бедр', 'ягодиц'],
  'баланс_общее': ['баланс', 'координац', 'равновеси', 'устойчив'],
};

const MOOD_KEYWORDS = {
  'энергия': ['бодр', 'энерги', 'взбодр', 'энерги', 'бодрость', 'заряд', 'утренн'],
  'снятие стресса': ['расслаб', 'успок', 'стресс', 'напряжени', 'отдых', 'спокойн', 'устал', 'релакс', 'снятие'],
  'баланс': ['баланс', 'гармони', 'равновеси', 'уравновеш'],
  'поток': ['поток', 'ощущени', 'осознанн', 'дыхани', 'медленн', 'плавн', 'поток'],
};

const text = (s) => String(s || '').toLowerCase();

function inferLessonFeatures({ title, theme, goals, effect }) {
  const source = text([title, theme, goals, effect].filter(Boolean).join(' '));
  const zones = [];
  const moods = [];

  for (const zone of BODY_ZONES) {
    const words = ZONE_KEYWORDS[zone.id] || [];
    if (words.some((w) => source.includes(w))) zones.push(zone.id);
  }

  for (const mood of MOODS) {
    const words = MOOD_KEYWORDS[mood.id] || [];
    if (words.some((w) => source.includes(w))) moods.push(mood.id);
  }

  // Fallback: a lesson is always something the body does — if no zone matched,
  // default to balance/general (safe, broad).
  if (zones.length === 0) zones.push('баланс_общее');

  return { zones, moods };
}

module.exports = { inferLessonFeatures, ZONE_KEYWORDS, MOOD_KEYWORDS };
