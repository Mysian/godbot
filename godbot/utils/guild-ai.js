const fs = require("fs");
const path = require("path");
const { Events } = require("discord.js");

// ───────────────────────────────────────────────────────────────────────────────
// 저장소
// ───────────────────────────────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, "data", "guild-ai");
const USERS_PATH = path.join(DATA_DIR, "users.json");
const MARKOV_DIR = path.join(DATA_DIR, "markov");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(MARKOV_DIR)) fs.mkdirSync(MARKOV_DIR, { recursive: true });

function loadJsonSafe(file, fallback) {
  try { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : fallback; }
  catch { return fallback; }
}
function saveJsonSafe(file, obj) {
  try { fs.writeFileSync(file, JSON.stringify(obj, null, 2), "utf8"); } catch {}
}

// ───────────────────────────────────────────────────────────────────────────────
// 메모리 상태
// ───────────────────────────────────────────────────────────────────────────────
const memory = {
  users: loadJsonSafe(USERS_PATH, {}),
  markovByUser: new Map(),
  markovGlobal: { order: 2, map: {}, tokensSeen: 0 },
  chatChannelId: null,
  lastReplyTsByChannel: new Map(),
  lastBotMsgByChannel: new Map(),
};

// ───────────────────────────────────────────────────────────────────────────────
// 토크나이즈/유틸
// ───────────────────────────────────────────────────────────────────────────────
const URL_RE = /(https?:\/\/[^\s]+)/ig;
const EMOJI_RE = /([\u{1F300}-\u{1FAD6}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}])/u;
const PUNC_RE = /([.!?…]+)|([,;:()"'`《》〈〉「」『』【】\[\]{}])/g;
const SPLIT_RE = /\s+/;

function tokenize(text) {
  const replaced = text
    .replace(URL_RE, " __URL__ ")
    .replace(PUNC_RE, " $1$2 ")
    .replace(EMOJI_RE, " $1 ");
  return replaced.split(SPLIT_RE).map(t => t.trim()).filter(Boolean).slice(0, 400);
}
function koreanRate(text) {
  if (!text) return 0;
  let k = 0, n = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if ((cp >= 0xAC00 && cp <= 0xD7A3) || (cp >= 0x1100 && cp <= 0x11FF) || (cp >= 0x3130 && cp <= 0x318F)) k++;
    n++;
  }
  return n ? k / n : 0;
}

// ───────────────────────────────────────────────────────────────────────────────
function getUserModel(id) {
  if (!memory.users[id]) {
    memory.users[id] = {
      id, firstSeen: Date.now(), lastSeen: Date.now(),
      messages: 0, tokens: 0, emojis: 0, questions: 0,
      positives: 0, negatives: 0, lastTopics: [], topWords: {},
      slangRate: 0.5, exclaimRate: 0.3,
    };
  }
  return memory.users[id];
}
function updateUserStats(user, text, toks) {
  user.lastSeen = Date.now();
  user.messages += 1;
  user.tokens += toks.length;
  if (/[?？]$/.test(text.trim())) user.questions += 1;
  if ((text.toLowerCase().match(/(ㅋㅋ+|ㅎㅎ+|ㄹㅇ|ㅇㅇ|ㄱㄱ|개쩔|ㄷㄷ)/g) || []).length) user.slangRate = user.slangRate * 0.9 + 0.1;
  if ((text.match(/[!！]+/g) || []).length) user.exclaimRate = user.exclaimRate * 0.9 + 0.1;
  user.emojis += (text.match(new RegExp(EMOJI_RE, "gu")) || []).length;

  const topics = toks
    .filter(t => !t.startsWith("__") && /[\p{L}\p{N}]/u.test(t) && koreanRate(t) >= 0.3 && t.length >= 2)
    .slice(0, 8);
  if (topics.length) {
    user.lastTopics = Array.from(new Set([...topics, ...user.lastTopics])).slice(0, 10);
    for (const t of topics) user.topWords[t] = (user.topWords[t] || 0) + 1;
    const top = Object.entries(user.topWords).sort((a,b)=>b[1]-a[1]).slice(0, 800);
    user.topWords = Object.fromEntries(top);
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Markov 모델
// ───────────────────────────────────────────────────────────────────────────────
function loadMarkov(uid) {
  const f = path.join(MARKOV_DIR, `${uid}.json`);
  const data = loadJsonSafe(f, null);
  if (data && data.map && data.order === 2) return data;
  return { order: 2, map: {}, tokensSeen: 0 };
}
function saveMarkov(uid, data) { saveJsonSafe(path.join(MARKOV_DIR, `${uid}.json`), data); }

function getMarkov(uid) {
  if (!memory.markovByUser.has(uid)) memory.markovByUser.set(uid, loadMarkov(uid));
  return memory.markovByUser.get(uid);
}
function feedMarkov(model, toks) {
  for (let i = 0; i < toks.length - 2; i++) {
    const a = toks[i], b = toks[i+1], c = toks[i+2];
    const key = `${a}|${b}`;
    if (!model.map[key]) model.map[key] = {};
    model.map[key][c] = (model.map[key][c] || 0) + 1;
    model.tokensSeen++;
  }
  const keys = Object.keys(model.map);
  if (keys.length > 30000 || model.tokensSeen > 260000) {
    const trimmed = keys.slice(0, Math.floor(keys.length * 0.6));
    const newMap = {};
    for (const k of trimmed) newMap[k] = model.map[k];
    model.map = newMap;
    model.tokensSeen = Math.floor(model.tokensSeen * 0.6);
  }
}
function weightedPick(obj, temperature = 1.0, banSet = null) {
  const entries = Object.entries(obj);
  if (!entries.length) return null;

  // banSet에 있는 후보는 가중치 낮춤(안티-에코용)
  let sum = 0;
  const adjusted = entries.map(([k, v]) => {
    let w = v;
    if (banSet && banSet.has(k)) w *= 0.05; // 강한 패널티
    if (temperature !== 1.0) w = Math.pow(w, 1/Math.max(0.25, Math.min(2.0, temperature)));
    sum += w;
    return [k, w];
  });
  if (sum <= 0) return entries[0][0];

  let r = Math.random() * sum;
  for (const [k, w] of adjusted) {
    r -= w;
    if (r <= 0) return k;
  }
  return adjusted[0][0];
}
function pickSeed(model, seedTokens, banSet) {
  const keys = Object.keys(model.map);
  if (!keys.length) return null;

  // 시드 후보: seedTokens에 걸리면서 ban되지 않은 것을 우선
  if (seedTokens && seedTokens.length) {
    const cand = [];
    for (const key of keys) {
      const [a,b] = key.split("|");
      let score = 0;
      if (seedTokens.includes(a)) score++;
      if (seedTokens.includes(b)) score++;
      if (score) cand.push({ key, score });
    }
    if (cand.length) {
      cand.sort((x,y)=>y.score-x.score);
      const top = cand.slice(0, Math.min(60, cand.length));
      const chosen = top[Math.floor(Math.random()*top.length)].key.split("|");
      if (!banSet || (!banSet.has(chosen[0]) || !banSet.has(chosen[1]))) return chosen;
    }
  }
  // 랜덤
  return keys[Math.floor(Math.random()*keys.length)].split("|");
}
function detok(tokens) {
  const join = new Set([",",".","!","?","…",";",":",")","]","}","»","”"]);
  const left = new Set(["(","[","{","«","“"]);
  const out = [];
  for (let i=0;i<tokens.length;i++){
    const t = tokens[i];
    if (t === "__URL__") { out.push("https://example.com"); continue; }
    if (i===0) { out.push(t); continue; }
    if (join.has(t)) out[out.length-1]+=t;
    else if (left.has(t)) out.push(t);
    else out.push(" "+t);
  }
  return out.join("").trim();
}
function gen(model, seedTokens, opts = {}) {
  const { maxLen = 48, temperature = 1.0, banSet = null } = opts;
  const keys = Object.keys(model.map);
  if (!keys.length) return null;
  const seed = pickSeed(model, seedTokens, banSet) || keys[Math.floor(Math.random()*keys.length)].split("|");
  let [a,b] = seed;
  const out = [a,b];

  for (let i=0;i<maxLen;i++){
    const key = `${a}|${b}`;
    const nextMap = model.map[key];
    if (!nextMap) break;
    const n = weightedPick(nextMap, temperature, banSet);
    if (!n) break;
    out.push(n);
    a = b; b = n;

    if (/[.!?…]/.test(n) && out.length > 10) break;
  }
  return detok(out);
}

// ───────────────────────────────────────────────────────────────────────────────
// 톤/안티-에코/후처리
// ───────────────────────────────────────────────────────────────────────────────
function averageServerTone() {
  const users = Object.values(memory.users);
  if (!users.length) return { slang: 0.4, exclaim: 0.3 };
  const n = users.length;
  const slang = users.reduce((s,u)=>s+u.slangRate,0)/n;
  const exclaim = users.reduce((s,u)=>s+u.exclaimRate,0)/n;
  return { slang, exclaim };
}
function postProcessTone(text) {
  const { slang, exclaim } = averageServerTone();
  let t = text;

  if (slang >= 0.6) {
    t = t.replace(/\b(합니다|입니다)\b/g, "임");
  } else {
    t = t.replace(/\b(ㅅㅂ|씨발)\b/g, "아놔");
  }

  if (exclaim >= 0.55 && !/[!！]$/.test(t)) {
    if (t.length < 60) t += "!";
  } else if (exclaim < 0.25) {
    t = t.replace(/[!！]{2,}/g, "!");
  }

  // 과도한 반복 문자 줄이기
  t = t.replace(/([ㅋㅎ])\1{4,}/g, "$1$1$1");
  return t;
}
function jaccard(aTokens, bTokens) {
  const A = new Set(aTokens);
  const B = new Set(bTokens);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const uni = A.size + B.size - inter || 1;
  return inter / uni;
}
function longestCommonRunLen(a, b) {
  // 연속 3토큰 이상 겹치면 에코로 간주
  let max = 0;
  for (let i=0;i<a.length;i++){
    for (let j=0;j<b.length;j++){
      let k=0;
      while (i+k<a.length && j+k<b.length && a[i+k]===b[j+k]) k++;
      if (k > max) max = k;
      if (max >= 3) return max;
    }
  }
  return max;
}
function antiEchoFilter(userText, draft) {
  const ut = tokenize(userText.toLowerCase()).slice(0, 80);
  const dt = tokenize(draft.toLowerCase()).slice(0, 80);
  const jac = jaccard(ut, dt);
  const lcr = longestCommonRunLen(ut, dt);
  return (jac < 0.45 && lcr < 3);
}
function diversify(line) {
  // 문장 길이 보정(너무 짧으면 한 절 추가 느낌)
  if (line.length < 8) line += " 더 얘기해봐";
  // 끝마침 보정
  if (!/[.?!…!]$/.test(line)) line += ".";
  return line;
}

// ───────────────────────────────────────────────────────────────────────────────
// 보안/금칙(대화만 허용)
// ───────────────────────────────────────────────────────────────────────────────
function isSensitiveAsk(s) {
  const lower = s.toLowerCase();
  const kw = [
    "token","토큰","env","환경변수","비밀번호","password","secret","key","키값","role id","역할id","권한",
    "권한승격","administrator","관리자 권한","internal","내부","db","database","supabase","railway","github",
    "config","설정파일","로그","log","채널id","채널 id","id 알려","슬래시 명령어 등록","eval","재시작","꺼",
    "서버 기밀","secret","보안","토큰 보여","소스코드","명령어","지시해","설정 바꿔","권한 줘","역할 줘",
  ];
  return kw.some(k => lower.includes(k));
}

// ───────────────────────────────────────────────────────────────────────────────
// 응답 생성
// ───────────────────────────────────────────────────────────────────────────────
function craftReply(authorId, prompt) {
  const seed = tokenize(prompt).filter(w => koreanRate(w) >= 0.25);

  // 금지 후보(안티-에코): 사용자 문장 토큰과 동일 토큰/마침표 직전 토큰들
  const banSet = new Set(seed.slice(0, 10));

  // ① 사용자 개인 모델 시도(temperature 높임 + banSet)
  let line = gen(getMarkov(authorId), seed, { maxLen: 46, temperature: 1.25, banSet });

  // ② 글로벌 모델 백업(temperature 가변)
  if (!line) line = gen(memory.markovGlobal, seed, { maxLen: 50, temperature: 1.15, banSet });

  // ③ 다른 유저 모델에서 샘플 섞기(랜덤 1명)
  if (!line) {
    const others = Object.keys(memory.users).filter(id => id !== authorId);
    if (others.length) {
      const pick = others[Math.floor(Math.random()*others.length)];
      line = gen(getMarkov(pick), seed, { maxLen: 44, temperature: 1.2, banSet });
    }
  }

  // ④ 최후의 기본 라인
  if (!line) line = "ㅇㅇ 이해함";

  // 안티-에코 검증 → 너무 비슷하면 재시도 전략
  let tries = 0;
  while (!antiEchoFilter(prompt, line) && tries < 3) {
    // 1) 시드 제거 + 온도 상승
    let alt = gen(memory.markovGlobal, [], { maxLen: 44, temperature: 1.5, banSet });
    // 2) 그래도 비슷하면 전혀 다른 단어로 seed 교란
    if (!alt) {
      const confuse = ["근데", "솔직히", "문제는", "반대로", "아무튼", "결론적으로"];
      alt = gen(memory.markovGlobal, confuse, { maxLen: 42, temperature: 1.4, banSet });
    }
    if (alt && antiEchoFilter(prompt, alt)) { line = alt; break; }
    tries++;
    if (tries >= 3) {
      // 최후: 사용자 키워드 일부를 제거한 짧은 리마인드형
      line = "오케이, 핵심만 더 말해봐";
      break;
    }
  }

  line = postProcessTone(line);
  line = diversify(line);
  return line;
}

function maybeFollowUp(authorModel) {
  const qRate = (authorModel.questions / Math.max(1, authorModel.messages));
  if (Math.random() < Math.min(0.25, 0.05 + qRate)) {
    const fups = [
      "그럼 너 생각은 뭐임?",
      "대충 감은 옴?",
      "더 자세히 풀어줘.",
      "결론은 어떻게 봄?",
      "케이스 좀 더 줘봐.",
      "그 포인트는 인정함?"
    ];
    return fups[Math.floor(Math.random()*fups.length)];
  }
  return null;
}

// ───────────────────────────────────────────────────────────────────────────────
// 등록
// ───────────────────────────────────────────────────────────────────────────────
function register(client, { chatChannelId }) {
  memory.chatChannelId = String(chatChannelId || "");

  // (1) 서버 전역 학습
  client.on(Events.MessageCreate, async (msg) => {
    try {
      if (!msg.guild || msg.author.bot) return;

      const raw = (msg.content || "");
      if (!raw || raw.length > 4000) return;

      // 코드블럭/시스템로그 과도한 학습 방지
      const codeBlockCount = (raw.match(/```/g) || []).length;
      if (codeBlockCount >= 2) return;

      const toks = tokenize(raw);
      if (toks.length >= 3) {
        const u = getUserModel(msg.author.id);
        updateUserStats(u, raw, toks);
        feedMarkov(getMarkov(msg.author.id), toks);
        feedMarkov(memory.markovGlobal, toks);

        if (Math.random() < 0.05) {
          saveJsonSafe(USERS_PATH, memory.users);
          saveMarkov(msg.author.id, getMarkov(msg.author.id));
        }
      }
    } catch {}
  });

  // (2) 지정 채널 자율 대화
  client.on(Events.MessageCreate, async (msg) => {
    try {
      if (!msg.guild || msg.author.bot) return;
      if (!memory.chatChannelId || msg.channel.id !== memory.chatChannelId) return;

      const content = (msg.content || "").trim();
      if (!content) return;

      // 내부/기밀/조작 요청 차단 (대화만)
      if (isSensitiveAsk(content)) {
        return void msg.channel.send("그건 여기서 다루기 곤란함. 대화만 하자.");
      }

      // 연속 폭주 방지: 같은 채널 1.2초 쿨
      const lastTs = memory.lastReplyTsByChannel.get(msg.channel.id) || 0;
      if (Date.now() - lastTs < 1200) return;
      memory.lastReplyTsByChannel.set(msg.channel.id, Date.now());

      // 이전에 봇이 막 한 말을 그대로 재현하지 않도록
      const lastBot = memory.lastBotMsgByChannel.get(msg.channel.id) || "";
      const draft = craftReply(msg.author.id, content);
      let reply = draft;

      // 마지막 봇 메시지와 유사도도 함께 체크(반복 루프 방지)
      let tries = 0;
      while (lastBot && !antiEchoFilter(lastBot, reply) && tries < 2) {
        const alt = craftReply(msg.author.id, content + " (다른 관점)");
        if (antiEchoFilter(lastBot, alt)) { reply = alt; break; }
        tries++;
        if (tries >= 2) reply = draft + " (이 관점도 있음)";
      }

      const u = getUserModel(msg.author.id);
      const fu = maybeFollowUp(u);
      const finalText = reply + (fu ? "\n" + fu : "");

      memory.lastBotMsgByChannel.set(msg.channel.id, finalText);
      await msg.channel.send(finalText);

      // 가끔(10%) 서버 핫토픽 브리핑(짧게)
      if (Math.random() < 0.10) {
        const top = Object.entries(
          Object.values(memory.users).reduce((acc, u) => {
            for (const [w,c] of Object.entries(u.topWords)) acc[w]=(acc[w]||0)+c;
            return acc;
          }, {})
        ).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([w])=>w);
        if (top.length) {
          const brief = `요즘 핫: ${top.join(" • ")}`;
          memory.lastBotMsgByChannel.set(msg.channel.id, brief);
          await msg.channel.send(brief);
        }
      }
    } catch {}
  });

  // 주기 저장
  setInterval(() => {
    try {
      saveJsonSafe(USERS_PATH, memory.users);
      const hot = Object.entries(memory.users).sort((a,b)=>b[1].messages-a[1].messages).slice(0,3).map(([id])=>id);
      for (const id of hot) saveMarkov(id, getMarkov(id));
      saveJsonSafe(path.join(MARKOV_DIR, "_global.json"), memory.markovGlobal);
    } catch {}
  }, 60_000);
}

module.exports = { register };
