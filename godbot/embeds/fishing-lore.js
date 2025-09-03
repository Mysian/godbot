// embeds/fishing-lore.js
// 모든 아이템/물고기/재화의 "한 줄 설명(로어)" + 헬퍼

/** 카테고리 이름 규칙
 *  fish, rod, float, bait, relic, junk, currency, key, chest
 *  (복수형/대소문자 섞여 들어와도 normalize로 정리)
 */
const ALIAS = {
  fish: "fish", fishes: "fish",
  rod: "rod", rods: "rod",
  float: "float", floats: "float",
  bait: "bait", baits: "bait",
  relic: "relic", relics: "relic",
  junk: "junk", junks: "junk",
  currency: "currency", coin: "currency", coins: "currency",
  key: "key", keys: "key",
  chest: "chest", chests: "chest",
};
const normalizeKind = (k) => ALIAS[String(k || "").toLowerCase()] || String(k || "").toLowerCase();
const trim = (s) => (typeof s === "string" ? s.trim() : "");

// === 여기에 계속 추가해서 채우면 됨 ===
const LORE = {
  fish: {
    // 예시들 — 네가 계속 늘려줘
    "클리오네": "바다의 복권이라 불리는 녀석. 크기는 작지만… 듣자 하니 성체도 어딘가에 있다.",
    "클리오네 성체": "혹한의 바다를 누비는 진짜 모습. 그 실체는 소문보다 더 차갑다.",
  },
  rod: {
    "나무 낚싯대": "첫 낚시꾼의 친구. 가볍고 성실하다.",
  },
  float: {
    "동 찌": "가벼운 일렁임도 놓치지 않는 기본기."
  },
  bait: {
    "지렁이 미끼": "누구나 좋아하는 클래식."
  },
  relic: {
    "바다의 부적": "미세한 행운이 깃든 조가비 조각."
  },
  junk: {
    "빈 병": "오래 떠돌다 닿은 이야기의 껍데기."
  },
  currency: {
    "파랑 정수": "세계에 흩어진 에너지. 상상한 대로 흐른다.",
    "낚시 코인": "항구 상점이 사랑하는 반짝임."
  },
  key: {
    "까리한 열쇠": "묵직한 손맛. 누군가의 보물과 맞물린다."
  },
  chest: {
    "까리한 보물상자": "겉만 봐도 비밀이 묵직하다."
  },
};

// === 헬퍼들 ===
function loreOf(kind, name) {
  const k = normalizeKind(kind);
  const n = trim(name);
  const s = LORE?.[k]?.[n];
  return trim(s);
}
function loreLine(kind, name) {
  const s = loreOf(kind, name);
  return s ? `_${s}_` : ""; // 이탤릭 한 줄
}

// 동적 추가가 필요할 때(코드로 즉석 등록)
function setLore(kind, name, text) {
  const k = normalizeKind(kind);
  const n = trim(name);
  if (!k || !n) return;
  LORE[k] = LORE[k] || {};
  LORE[k][n] = trim(text);
}

module.exports = { loreOf, loreLine, setLore, LORE };
