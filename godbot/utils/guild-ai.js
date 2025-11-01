const fs = require("fs");
const path = require("path");
const { Events } = require("discord.js");

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

const memory = {
  users: loadJsonSafe(USERS_PATH, {}),
  markovByUser: new Map(),
  markovGlobal: { order: 2, map: {}, tokensSeen: 0 },
  chatChannelId: null,
  lastReplyTsByChannel: new Map(),
};

const URL_RE = /(https?:\/\/[^\s]+)/ig;
const EMOJI_RE = /([\u{1F300}-\u{1FAD6}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}])/u;
const PUNC_RE = /([.!?…]+)|([,;:()"'`《》〈〉「」『』【】\[\]{}])/g;
const SPLIT_RE = /\s+/;

function tokenize(text) {
  const replaced = text
    .replace(URL_RE, " __URL__ ")
    .replace(PUNC_RE, " $1$2 ")
    .replace(EMOJI_RE, " $1 ");
  return replaced.split(SPLIT_RE).map(t => t.trim()).filter(Boolean).slice(0, 300);
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
  if (keys.length > 25000 || model.tokensSeen > 200000) {
    const trimmed = keys.slice(0, Math.floor(keys.length * 0.6));
    const newMap = {};
    for (const k of trimmed) newMap[k] = model.map[k];
    model.map = newMap;
    model.tokensSeen = Math.floor(model.tokensSeen * 0.6);
  }
}
function pickSeed(model, seedTokens) {
  const keys = Object.keys(model.map);
  if (!keys.length) return null;
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
      const chosen = cand[Math.floor(Math.random()*Math.min(30,cand.length))].key.split("|");
      return chosen;
    }
  }
  return keys[Math.floor(Math.random()*keys.length)].split("|");
}
function weightedPick(obj) {
  let sum = 0; for (const v of Object.values(obj)) sum += v;
  let r = Math.random()*sum;
  for (const [k,v] of Object.entries(obj)) { r -= v; if (r <= 0) return k; }
  return Object.keys(obj)[0];
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
function gen(model, seedTokens, maxLen=40) {
  const keys = Object.keys(model.map);
  if (!keys.length) return null;
  const seed = pickSeed(model, seedTokens) || keys[Math.floor(Math.random()*keys.length)].split("|");
  let [a,b] = seed;
  const out = [a,b];
  for (let i=0;i<maxLen;i++){
    const key = `${a}|${b}`;
    const nextMap = model.map[key];
    if (!nextMap) break;
    const n = weightedPick(nextMap);
    out.push(n);
    a = b; b = n;
    if (/[.!?…]/.test(n) && out.length > 10) break;
  }
  return detok(out);
}

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

  if (slang >= 0.55) {
    t = t.replace(/\b(합니다|합니다\.)$/g, "함").replace(/\b(입니다|입니다\.)$/g, "임");
  } else if (slang <= 0.35) {
    // 약간만 공손 → 기본 그대로 두되, 과한 속어 치환
    t = t.replace(/\b(ㅅㅂ|씨발)\b/g, "아놔");
  }
  if (exclaim >= 0.5 && !/[!！]$/.test(t)) {
    if (t.length < 50) t += "!";
  } else if (exclaim < 0.25) {
    t = t.replace(/[!！]{2,}/g, "!");
  }

  // 문장 종결 없으면 마침표/틱 붙이기(평균 캐주얼)
  if (!/[.?!…]$/.test(t)) t += "!";
  return t;
}

function isSensitiveAsk(s) {
  const lower = s.toLowerCase();
  const kw = [
    "token","토큰","env","환경변수","비밀번호","password","secret","key","키값","role id","역할id","권한",
    "권한승격","administrator","관리자 권한","internal","내부","db","database","supabase","railway","github",
    "config","설정파일","로그","log","채널id","채널 id","id 알려", "슬래시 명령어 등록","eval","재시작","꺼",
    "서버 기밀","secret","보안","토큰 보여","소스코드"
  ];
  return kw.some(k => lower.includes(k));
}

function craftReply(authorId, prompt) {
  const seed = tokenize(prompt).filter(w => koreanRate(w) >= 0.25);
  // ① 사용자 개별 모델 시도
  const mUser = getMarkov(authorId);
  let line = gen(mUser, seed, 36);

  // ② 실패시 글로벌 모델
  if (!line) line = gen(memory.markovGlobal, seed, 44);

  // ③ 둘 다 빈약하면 기본 라인
  if (!line) line = "ㅇㅋ 이해함";

  return postProcessTone(line);
}

function maybeFollowUp(authorModel) {
  // 서버 평균에 따라 가끔 되묻기
  const qRate = (authorModel.questions / Math.max(1, authorModel.messages));
  if (Math.random() < Math.min(0.25, 0.05 + qRate)) {
    const fups = [
      "근데 너는 어떻게 생각함?",
      "이거 ㄹㅇ임?",
      "더 자세히?",
      "대충 감은 옴?",
      "결론은 뭐임?",
      "디테일 더 줘봐."
    ];
    return fups[Math.floor(Math.random()*fups.length)];
  }
  return null;
}

function register(client, { chatChannelId }) {
  memory.chatChannelId = String(chatChannelId || "");

  client.on(Events.MessageCreate, async (msg) => {
    try {
      if (!msg.guild || msg.author.bot) return;

      // 학습(모든 채팅) — 단, 너무 긴 시스템/코드 블록은 스킵
      const raw = (msg.content || "");
      if (!raw || raw.length > 4000) return;

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

  // 대화 채널: 명령어 없이 자율 응답
  client.on(Events.MessageCreate, async (msg) => {
    try {
      if (!msg.guild || msg.author.bot) return;
      if (!memory.chatChannelId || msg.channel.id !== memory.chatChannelId) return;

      const content = (msg.content || "").trim();
      if (!content) return;

      // 보안/기밀/시스템 조작 요청 차단 (대화만)
      if (isSensitiveAsk(content)) {
        return void msg.channel.send("그건 여기서 다루기 곤란함. 대화만 하자.");
      }

      // 과한 스팸 방지(연속 폭주 방지): 같은 채널 1.2초 쿨
      const lastTs = memory.lastReplyTsByChannel.get(msg.channel.id) || 0;
      if (Date.now() - lastTs < 1200) return;
      memory.lastReplyTsByChannel.set(msg.channel.id, Date.now());

      const reply = craftReply(msg.author.id, content);
      let extra = "";
      const u = getUserModel(msg.author.id);
      const fu = maybeFollowUp(u);
      if (fu) extra = "\n" + fu;

      await msg.channel.send(reply + extra);

      // 가끔(10%) 서버 평균 화제 한 줄 힌트
      if (Math.random() < 0.10) {
        const top = Object.entries(
          Object.values(memory.users).reduce((acc, u) => {
            for (const [w,c] of Object.entries(u.topWords)) acc[w]=(acc[w]||0)+c;
            return acc;
          }, {})
        ).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([w])=>w);
        if (top.length) await msg.channel.send(`요즘 핫: ${top.join(" • ")}`);
      }
    } catch {}
  });

  // 주기 저장
  setInterval(() => {
    try {
      saveJsonSafe(USERS_PATH, memory.users);
      const hot = Object.entries(memory.users).sort((a,b)=>b[1].messages-a[1].messages).slice(0,3).map(([id])=>id);
      for (const id of hot) saveMarkov(id, getMarkov(id));
      // 글로벌 모델은 가끔 샘플 덤프
      saveJsonSafe(path.join(MARKOV_DIR, "_global.json"), memory.markovGlobal);
    } catch {}
  }, 60_000);
}

module.exports = { register };
