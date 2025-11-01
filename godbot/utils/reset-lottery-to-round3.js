// utils/reset-lottery-to-round3.js
const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '../data/lottery.json'); // 경로 확인

if (!fs.existsSync(DATA_PATH)) {
  console.error('데이터 파일이 없음:', DATA_PATH);
  process.exit(1);
}

const s = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8') || '{}');

// 기존 데이터 안전 접근
const rounds = (s && s.rounds) ? s.rounds : {};

const r1 = rounds['1'] || null;
const r2 = rounds['2'] || null;
const r3 = rounds['3'] || null;

// drawnAt 단위 보정(초/밀리초 모두 대응)
const toMs = (x) => {
  if (!x || !Number.isFinite(x)) return 0;
  // 2001-09-09 이후(초 단위 1e9)와 2001-09-09 이전(밀리초 1e12) 구분
  return x < 1e12 ? x * 1000 : x;
};

const pickDrawnMs = (obj) => {
  if (!obj || typeof obj !== 'object') return 0;
  return toMs(obj.drawnAt || 0);
};

// 새 상태 구성: 1~3회차만 보존, 다음 오픈은 4회차
const keep = {
  round: 4, // 다음 오픈 회차를 4로
  controlMessageId: s.controlMessageId || null,
  rounds: {},
  lastDrawAt: 0,
};

// 최소 형태 생성기
const MIN = () => ({ tickets: [], result: null, drawnAt: 0, rule: { pick: 6 } });

keep.rounds['1'] = r1 || MIN();
keep.rounds['2'] = r2 || MIN();
keep.rounds['3'] = r3 || MIN();

// 최근 추첨 시각(밀리초) 계산: 1~3회차 모두 반영
keep.lastDrawAt = Math.max(
  pickDrawnMs(keep.rounds['1']),
  pickDrawnMs(keep.rounds['2']),
  pickDrawnMs(keep.rounds['3'])
);

// 저장
fs.writeFileSync(DATA_PATH, JSON.stringify(keep, null, 2), 'utf8');
console.log('완료: 1~3회차만 남기고 정리. 다음 오픈은 4회차로 세팅됨:', DATA_PATH);
