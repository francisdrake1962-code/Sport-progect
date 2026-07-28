const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const LOCALES_DIR = path.join(__dirname, '..', '..', 'src', 'locales');
const RUSSIAN_COUNTRIES = ['RU', 'BY', 'KZ', 'UA', 'UZ', 'KG', 'TJ', 'MD', 'AM', 'AZ', 'TM', 'GE'];
const VALID_LANGUAGES = ['en', 'ru'];

router.get('/:lang', (req, res) => {
  const lang = req.params.lang;
  if (!VALID_LANGUAGES.includes(lang)) {
    return res.status(404).json({ error: 'Language not found' });
  }
  const filePath = path.join(LOCALES_DIR, lang + '.json');
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    res.json(JSON.parse(raw));
  } catch {
    res.status(404).json({ error: 'Locale file not found' });
  }
});

module.exports = router;
module.exports.VALID_LANGUAGES = VALID_LANGUAGES;
module.exports.RUSSIAN_COUNTRIES = RUSSIAN_COUNTRIES;
