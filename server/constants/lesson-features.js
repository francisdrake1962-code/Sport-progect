// Single source of truth for lesson selection features.
// Zone = body area (Зона тела), mood = wellbeing state (Самочувствие).
// Used by: import auto-classification, admin editor, /api/user/lessons-filter,
// the "Подобрать занятие" picker and the catalog reference tables.

const BODY_ZONES = [
  { id: 'шея', label: 'Шея' },
  { id: 'плечи_руки', label: 'Плечи / Руки' },
  { id: 'грудной_отдел', label: 'Грудной отдел' },
  { id: 'поясница', label: 'Поясница' },
  { id: 'спина_осанка', label: 'Спина / Осанка' },
  { id: 'колени', label: 'Колени' },
  { id: 'ноги_таз', label: 'Ноги / Таз' },
  { id: 'баланс_общее', label: 'Баланс / Общее' },
];

const MOODS = [
  { id: 'энергия', label: 'Взбодриться' },
  { id: 'снятие стресса', label: 'Успокоиться' },
  { id: 'баланс', label: 'Баланс' },
  { id: 'поток', label: 'Поток / Ощущения' },
];

const ZONE_IDS = BODY_ZONES.map((z) => z.id);
const MOOD_IDS = MOODS.map((m) => m.id);

function getFeatureLabels(ids, list) {
  const byId = {};
  list.forEach((item) => { byId[item.id] = item.label; });
  return (ids || []).map((id) => byId[id] || id);
}

module.exports = { BODY_ZONES, MOODS, ZONE_IDS, MOOD_IDS, getFeatureLabels };
