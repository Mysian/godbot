// utils/reset-lottery-to-round2.js
const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '../data/lottery.json'); // 경로 맞춰줘

if (!fs.existsSync(DATA_PATH)) {
  console.error('데이터 파일이 없음:', DATA_PATH);
  process.exit(1);
}

const s = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8') || '{}');

// 1, 2회차만 보존
const r1 = s.rounds && s.rounds['1'] ? s.rounds['1'] : null;
const r2 = s.rounds && s.rounds['2'] ? s.rounds['2'] : null;

const keep = {
  round: 3, // 다음 오픈 회차를 3으로
  controlMessageId: s.controlMessageId || null,
  rounds: {},
  lastDrawAt: 0,
};

// 1회차 보존(없으면 최소 형태로 생성)
keep.rounds['1'] = r1 || { tickets: [], result: null, drawnAt: 0, rule: { pick: 6 } };
// 2회차 보존(없으면 생성 안 해도 되지만 안전하게 최소 형태 생성해둠)
keep.rounds['2'] = r2 || { tickets: [], result: null, drawnAt: 0, rule: { pick: 6 } };

// lastDrawAt은 가장 최근 보존 회차 기준으로
const pickDrawn = (x) => (x && Number.isFinite(x.drawnAt) ? x.drawnAt * 1000 : 0);
keep.lastDrawAt = Math.max(pickDrawn(keep.rounds['1']), pickDrawn(keep.rounds['2']));

fs.writeFileSync(DATA_PATH, JSON.stringify(keep, null, 2), 'utf8');
console.log('완료: 1~2회차만 남기고 정리. 다음 오픈은 3회차로 세팅됨:', DATA_PATH);
