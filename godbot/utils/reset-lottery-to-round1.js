const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '../data/lottery.json');

if (!fs.existsSync(DATA_PATH)) {
  process.exit(1);
}

const s = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

const r1 = s.rounds && s.rounds['1'] ? s.rounds['1'] : null;
const keep = { round: 2, controlMessageId: s.controlMessageId || null, rounds: {}, lastDrawAt: 0 };

if (r1) {
  keep.rounds['1'] = r1;
  if (r1.drawnAt && Number.isFinite(r1.drawnAt)) {
    keep.lastDrawAt = r1.drawnAt * 1000;
  } else {
    keep.lastDrawAt = Date.now();
  }
} else {
  keep.rounds['1'] = { tickets: [], result: null, drawnAt: 0, rule: { pick: 6 } };
  keep.lastDrawAt = 0;
}

fs.writeFileSync(DATA_PATH, JSON.stringify(keep, null, 2), 'utf8');
console.log('OK');
