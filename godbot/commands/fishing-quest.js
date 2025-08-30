// fishing-quest.js
// 공통 퀘스트(모든 유저 동일) 생성 + 유저별 진행/수령 관리
// 리셋: 일퀘 = 매일 09:00 KST, 주간 = 매주 월요일 09:00 KST
// 외부에서 호출해줄 훅:
//   Quests.configure({ guildSeed, speciesCandidates, gear:{rod:"나무 낚싯대", float:"동 찌"} });
//   Quests.onCatch(u, { name, rarity, length, timeBand, isJunk, equip:{rod,float,bait} });
//   Quests.onSell(u, soldCount, coinEarned);
//   Quests.onOpenChest(u, qty);
//   Quests.onSpend(u, amount);          // 낚시 코인 소비
//   Quests.onBaitUse(u, qty);           // 미끼 소비
//   Quests.onDurability(u, itemKey, ticks); // 내구도 감소
// UI용:
//   const snap = Quests.snapshot(u)  // {dailyKey,weeklyKey,daily:[...],weekly:[...]}
//   const res  = Quests.claim(u, scope, questId) // 보상 리스트만 반환(실지급은 바깥에서)

const TIER_MULT = {
  "브론즈": 0.9, "실버": 1.0, "골드": 1.15, "플래티넘": 1.3,
  "다이아": 1.5, "마스터": 1.8, "그랜드마스터": 2.1, "챌린저": 2.5
};
const RARITY_ORDER = ["노말","레어","유니크","레전드","에픽","언노운"];
const TIME_BANDS = ["낮","노을","밤"];

const CONFIG = {
  seedSalt: "KARIQUEST",
  guildSeed: "", // 서버마다 다르게 하고 싶으면 설정
  speciesCandidates: [], // ["멸치","고등어", ...]
  gear: { rod:"나무 낚싯대", float:"동 찌" }
};

// ===== util: 09:00 KST 리셋 키 =====
function dayKey0900KST() {
  const now = new Date(); // UTC
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth()+1).padStart(2,"0");
  const d = String(now.getUTCDate()).padStart(2,"0");
  return `${y}-${m}-${d}`; // UTC 자정 == KST 09:00
}
function weekKeyMon0900KST() {
  const now = new Date(); // UTC
  const wday = now.getUTCDay(); // 0..6
  const diffToMon = (wday+6)%7;
  const mon = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()-diffToMon));
  const y = mon.getUTCFullYear();
  const m = String(mon.getUTCMonth()+1).padStart(2,"0");
  const d = String(mon.getUTCDate()).padStart(2,"0");
  return `${y}-${m}-${d}`; // "그 주 월요일(UTC)" == KST 월 09:00
}

// ===== util: 시드/랜덤 =====
function hash32(str){
  let h = 2166136261>>>0;
  for (let i=0;i<str.length;i++){ h ^= str.charCodeAt(i); h = Math.imul(h,16777619); }
  return h>>>0;
}
function mulberry32(a){ return function(){ let t=a+=0x6D2B79F5; t=Math.imul(t^t>>>15, t|1); t^=t+Math.imul(t^t>>>7, t|61); return ((t^t>>>14)>>>0)/4294967296; }; }
function rngFromSeed(seedStr){ return mulberry32(hash32(seedStr)); }
function rint(rng,a,b){ return Math.floor(rng()*(b-a+1))+a; }
function rpick(rng,arr){ return arr[Math.floor(rng()*arr.length)]; }
function rshuffle(rng,arr){ const a=arr.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(rng()*(i+1)); [a[i],a[j]]=[a[j],a[i]];} return a; }

// ===== 상태 보관 =====
function ensureUser(u){
  u.quests2 ??= { dailyKey:null, weeklyKey:null, state:{} };
}
function resetKeysIfNeeded(u, dKey, wKey){
  ensureUser(u);
  if (u.quests2.dailyKey !== dKey || u.quests2.weeklyKey !== wKey){
    u.quests2 = { dailyKey:dKey, weeklyKey:wKey, state:{} };
  }
}

// ===== 퀘스트 정의(모든 유저 공통): 시드 기반 5개 선택 =====
function makeDailyDefs(dKey){
  const seed = `${CONFIG.seedSalt}|${CONFIG.guildSeed}|D|${dKey}`;
  const rng = rngFromSeed(seed);
  const sp = CONFIG.speciesCandidates.length? rpick(rng, CONFIG.speciesCandidates) : "특정 물고기";

  const candidates = [
    { type:"catch_any", amount:rint(rng,14,24) },
    { type:"catch_rarity_atleast", rarity:"레어", amount:rint(rng,3,6) },
    { type:"catch_timeband", band:rpick(rng,TIME_BANDS), amount:rint(rng,5,8) },
    { type:"catch_each_timeband", perBand:rint(rng,2,3) }, // 새로 추가
    { type:"catch_specific", species:sp, amount:rint(rng,1,2) }, // 새로 추가 (공통 종)
    { type:"sum_length", cm:rint(rng,600,1300) },
    { type:"sell_count", amount:rint(rng,6,14) },
    { type:"earn_coin", coin:rint(rng,15000,50000) },
    { type:"get_junk", amount:rint(rng,2,5) }, // 새로 추가
    { type:"spend_coin", coin:rint(rng,6000,25000) }, // 새로 추가 (최소 5,000 이상)
    { type:"consume_bait", amount:rint(rng,10,30) }, // 새로 추가
    { type:"sequence_rarity", pattern:["노말","레어","유니크"], need:1 }, // 새로 추가
    { type:"sequence_rarity", pattern:["유니크","레어","노말"], need:1 }, // 새로 추가
    { type:"streak_junk", need:3 },           // 연속 잡동사니 3회
    { type:"streak_same_rarity", need:3 }     // 동일 등급 3연속
  ];
  return rshuffle(rng,candidates).slice(0,5).map((def,i)=>attachId("daily", dKey, def,i));
}
function makeWeeklyDefs(wKey){
  const seed = `${CONFIG.seedSalt}|${CONFIG.guildSeed}|W|${wKey}`;
  const rng = rngFromSeed(seed);
  const sp = CONFIG.speciesCandidates.length? rpick(rng, CONFIG.speciesCandidates) : "특정 물고기";

  const candidates = [
    { type:"catch_any", amount:rint(rng,200,450) },
    { type:"unique_species", amount:rint(rng,18,32) },
    (()=>{ const rar=rpick(rng,["유니크","레전드","에픽"]); return { type:"catch_rarity_atleast", rarity:rar, amount:(rar==="에픽"? rint(rng,1,2): rint(rng,2,4)) }; })(),
    { type:"big_length_once", cm:rint(rng,140,220) },
    { type:"earn_coin", coin:rint(rng,200000,900000) },
    { type:"open_chest", amount:rint(rng,2,3) },
    { type:"catch_each_timeband", perBand:rint(rng,5,10) },   // 새로 추가
    { type:"get_junk", amount:rint(rng,10,20) },              // 새로 추가
    { type:"spend_coin", coin:rint(rng,100000,400000) },      // 새로 추가 (최소 100,000 이상)
    { type:"consume_bait", amount:rint(rng,80,200) },         // 새로 추가
    { type:"sequence_rarity", pattern:["노말","레어","유니크"], need:3 }, // 새로 추가
    { type:"sequence_rarity", pattern:["유니크","레어","노말"], need:3 }, // 새로 추가
    { type:"streak_junk", need:3 },
    { type:"streak_same_rarity", need:3 },
    { type:"catch_specific", species:sp, amount:rint(rng,5,10) },         // 새로 추가
    { type:"use_durability", items:rint(rng,2,4), ticks:rint(rng,20,60) },// 새로 추가
    { type:"gear_unique_combo", rod:CONFIG.gear.rod, float:CONFIG.gear.float, rarity:"유니크", amount:3 } // 새로 추가(주간 고정 느낌)
  ];
  return rshuffle(rng,candidates).slice(0,5).map((def,i)=>attachId("weekly", wKey, def,i));
}
function attachId(scope, key, def, idx){
  const raw = `${scope}|${key}|${JSON.stringify(def)}|${idx}`;
  def.id = `${scope}:${key}:${hash32(raw).toString(36)}`;
  def.scope = scope;
  return def;
}

// ===== 보상(티어 스케일만, 내용은 고정 테이블) =====
function rewardRoll(scope, tier, seedStr){
  const m = TIER_MULT[tier] ?? 1.0;
  const rng = rngFromSeed(`RW|${seedStr}`);
  const rewards=[];
  function coin(a,b){ rewards.push({type:"coin", amt: Math.round(rint(rng,a,b)*m)}); }
  function be(a,b){ rewards.push({type:"be", amt: Math.round(rint(rng,a,b)*m)}); }
  function bait(name, q){ rewards.push({type:"bait", name, qty:q}); }
  function key(q=1){ rewards.push({type:"key", qty:q}); }
  function chest(q=1){ rewards.push({type:"chest", qty:q}); }

  if (scope==="daily"){
    coin(3000,50000);
    if (rng()<0.80) be(5000,100000);
    if (rng()<0.70) bait(rpick(rng,["지렁이 미끼","새우 미끼","빛나는 젤리 미끼"]), rint(rng,5,20));
    if (rng()<0.07) key(1);
  }else{
    coin(50000,500000);
    be(100000,1500000);
    if (rng()<0.30) chest(1); else if (rng()<0.35) key(1);
  }
  return rewards;
}

// ===== 라벨/표시 =====
function pb(cur,tgt,w=12){ const r=Math.max(0,Math.min(1,tgt?cur/tgt:0)); const f=Math.round(r*w); return `\`${"■".repeat(f)}${"□".repeat(w-f)}\` ${Math.min(cur,tgt)}/${tgt}`; }
function label(def){
  switch(def.type){
    case "catch_any": return `아무 물고기 ${def.amount}마리 낚기`;
    case "catch_rarity_atleast": return `[${def.rarity}] 이상 ${def.amount}마리 낚기`;
    case "catch_timeband": return `(${def.band}) 시간대에 ${def.amount}마리 낚기`;
    case "catch_each_timeband": return `낮/노을/밤 각각 ${def.perBand}회 낚시 성공`;
    case "catch_specific": return `특정 어종(${def.species}) ${def.amount}마리 낚기`;
    case "sum_length": return `누적 길이 합 ${def.cm}cm 달성`;
    case "sell_count": return `물고기 ${def.amount}마리 판매`;
    case "earn_coin": return `판매로 코인 ${def.coin.toLocaleString()} 획득`;
    case "open_chest": return `까리한 보물상자 ${def.amount}개 열기`;
    case "unique_species": return `서로 다른 어종 ${def.amount}종 낚기`;
    case "big_length_once": return `한 번에 ${def.cm}cm 이상 낚기`;
    case "get_junk": return `잡동사니 ${def.amount}개 획득`;
    case "spend_coin": return `낚시 코인 ${def.coin.toLocaleString()} 소비`;
    case "consume_bait": return `미끼 ${def.amount}개 소비`;
    case "sequence_rarity": return `${def.pattern.join(" → ")} 순으로 획득 (${def.need}회)`;
    case "streak_junk": return `잡동사니 연속 ${def.need}회 획득`;
    case "streak_same_rarity": return `동일 등급 물고기 연속 ${def.need}회 획득`;
    case "use_durability": return `아이템 ${def.items}개에서 내구도 총 ${def.ticks}회 소모`;
    case "gear_unique_combo": return `[${def.rarity}] ${def.amount}마리 잡기 (장비: ${def.rod} + ${def.float})`;
  }
  return def.type;
}
function describeOne(def, st, tier){
  const rewards = rewardRoll(def.scope, tier, def.id);
  const rewardText = rewards.map(r=>{
    if (r.type==="coin") return `🪙 ${r.amt.toLocaleString()}`;
    if (r.type==="be") return `🔷 ${r.amt.toLocaleString()}원`;
    if (r.type==="bait") return `🪱 ${r.name} x${r.qty}`;
    if (r.type==="key") return `🗝️ x${r.qty}`;
    if (r.type==="chest") return `📦 x${r.qty}`;
    return "";
  }).filter(Boolean).join(" / ");

  let sub = "";
  switch(def.type){
    case "catch_any":
    case "catch_rarity_atleast":
    case "catch_timeband":
    case "sell_count":
    case "open_chest":
    case "get_junk":
    case "spend_coin":
    case "consume_bait":
    case "gear_unique_combo":
      sub = pb(st.progress||0, needOf(def)); break;
    case "catch_each_timeband":{
      const b = st.aux?.perBand||{};
      const parts = TIME_BANDS.map(x=>`${x}:${Math.min(b[x]||0,def.perBand)}/${def.perBand}`).join("  ");
      sub = parts; break;
    }
    case "catch_specific":
      sub = pb(st.progress||0, def.amount); break;
    case "sum_length":
      sub = pb(st.aux?.sumLen||0, def.cm); break;
    case "earn_coin":
      sub = pb(st.aux?.earned||0, def.coin); break;
    case "unique_species":
      sub = pb(Object.keys(st.aux?.uniq||{}).length, def.amount); break;
    case "big_length_once":
      sub = st.aux?.bigDone ? "완료됨" : `목표: ≥ ${def.cm}cm`; break;
    case "sequence_rarity":
      sub = `진행: ${st.aux?.seqCount||0}/${def.need}`; break;
    case "streak_junk":
      sub = `현재 연속: ${st.aux?.sj||0}/${def.need}`; break;
    case "streak_same_rarity":
      sub = `현재 연속: ${st.aux?.sr||0}/${def.need}`; break;
    case "use_durability":
      sub = `아이템 ${Object.keys(st.aux?.items||{}).length}/${def.items} • 내구도 ${st.aux?.ticks||0}/${def.ticks}`; break;
  }

  return {
    id:def.id, scope:def.scope,
    title: label(def),
    sub, rewardText,
    done: isDone(def, st),
    claimed: !!st.claimed
  };
}
function needOf(def){
  switch(def.type){
    case "catch_any":
    case "catch_rarity_atleast":
    case "catch_timeband":
    case "sell_count":
    case "open_chest":
    case "get_junk":
    case "spend_coin":
    case "consume_bait":
    case "gear_unique_combo":
      return def.amount||def.coin||0;
  }
  return 0;
}

// ===== 진행 판정 =====
function isDone(def, st){
  switch(def.type){
    case "catch_any":
    case "catch_rarity_atleast":
    case "catch_timeband":
    case "sell_count":
    case "open_chest":
    case "get_junk":
    case "spend_coin":
    case "consume_bait":
    case "gear_unique_combo":
      return (st.progress||0) >= needOf(def);
    case "catch_each_timeband":{
      const pb = st.aux?.perBand||{};
      return TIME_BANDS.every(b => (pb[b]||0) >= def.perBand);
    }
    case "catch_specific": return (st.progress||0) >= def.amount;
    case "sum_length": return (st.aux?.sumLen||0) >= def.cm;
    case "earn_coin": return (st.aux?.earned||0) >= def.coin;
    case "unique_species": return Object.keys(st.aux?.uniq||{}).length >= def.amount;
    case "big_length_once": return !!st.aux?.bigDone;
    case "sequence_rarity": return (st.aux?.seqCount||0) >= def.need;
    case "streak_junk": return (st.aux?.sj||0) >= def.need;
    case "streak_same_rarity": return (st.aux?.sr||0) >= def.need;
    case "use_durability": {
      const items = Object.keys(st.aux?.items||{}).length;
      const ticks = st.aux?.ticks||0;
      return items >= def.items && ticks >= def.ticks;
    }
  }
  return false;
}

// ===== 공통 정의 접근 =====
function dailyDefs(){ return makeDailyDefs(dayKey0900KST()); }
function weeklyDefs(){ return makeWeeklyDefs(weekKeyMon0900KST()); }

// ===== 훅: 진행 업데이트 =====
function getState(u,id){ ensureUser(u); u.quests2.state[id] ??= { progress:0, aux:{}, claimed:false }; return u.quests2.state[id]; }

function onCatch(u, ctxOrFish, maybeTimeBand){
  // 구버전 시그니처 호환
  const ctx = (ctxOrFish && ctxOrFish.name!==undefined) ? ctxOrFish : { name:ctxOrFish?.name, rarity:ctxOrFish?.rarity, length:ctxOrFish?.length, timeBand:maybeTimeBand };
  const rarity = ctx.rarity;
  const band = ctx.timeBand;
  const name = ctx.name;
  const len = Math.round(ctx.length||0);
  const isJunk = !!ctx.isJunk || rarity==="잡동사니";
  const rod = ctx.equip?.rod || "";
  const flt = ctx.equip?.float || "";

  const dKey = dayKey0900KST(), wKey = weekKeyMon0900KST();
  resetKeysIfNeeded(u, dKey, wKey);
  for (const def of [...dailyDefs(), ...weeklyDefs()]){
    const st = getState(u, def.id);
    if (st.claimed || isDone(def, st)) continue;

    switch(def.type){
      case "catch_any": st.progress++; break;
      case "catch_rarity_atleast":
        if (RARITY_ORDER.indexOf(rarity) >= RARITY_ORDER.indexOf(def.rarity)) st.progress++; break;
      case "catch_timeband":
        if (band === def.band) st.progress++; break;
      case "catch_each_timeband":{
        const m = (st.aux.perBand ||= {});
        if (TIME_BANDS.includes(band)) m[band] = (m[band]||0)+1;
        break;
      }
      case "catch_specific":
        if (!def.species || def.species===name) st.progress++; break;
      case "sum_length":
        st.aux.sumLen = (st.aux.sumLen||0) + len; break;
      case "unique_species":
        (st.aux.uniq ||= {})[name] = true; break;
      case "big_length_once":
        if (len >= def.cm) st.aux.bigDone = true; break;
      case "get_junk":
        if (isJunk) st.progress++; 
        // streak_junk도 같이 처리
        break;
      case "sequence_rarity":{
        if (isJunk) { st.aux.seqIdx=0; break; }
        const p = def.pattern;
        const idx = st.aux.seqIdx||0;
        if (rarity===p[idx]) {
          const nx = idx+1;
          if (nx===p.length){ st.aux.seqCount = (st.aux.seqCount||0)+1; st.aux.seqIdx=0; }
          else st.aux.seqIdx=nx;
        } else {
          st.aux.seqIdx = (rarity===p[0]? 1:0);
        }
        break;
      }
      case "streak_junk":{
        const cur = (st.aux.sj||0);
        st.aux.sj = isJunk ? cur+1 : 0;
        break;
      }
      case "streak_same_rarity":{
        const last = st.aux.lastR||null;
        if (last && rarity===last) st.aux.sr = (st.aux.sr||1)+1;
        else st.aux.sr = 1;
        st.aux.lastR = rarity;
        break;
      }
      case "gear_unique_combo":{
        if (rarity===def.rarity && rod===def.rod && flt===def.float) st.progress++;
        break;
      }
      // 나머진 다른 훅에서 처리
    }
  }
}

function onSell(u, soldCount, coinEarned){
  const dKey = dayKey0900KST(), wKey = weekKeyMon0900KST();
  resetKeysIfNeeded(u, dKey, wKey);
  for (const def of [...dailyDefs(), ...weeklyDefs()]){
    const st = getState(u, def.id);
    if (st.claimed || isDone(def, st)) continue;
    if (def.type==="sell_count") st.progress += soldCount||0;
    if (def.type==="earn_coin") st.aux.earned = (st.aux.earned||0) + Math.max(0, coinEarned||0);
  }
}
function onOpenChest(u, qty=1){
  const dKey = dayKey0900KST(), wKey = weekKeyMon0900KST();
  resetKeysIfNeeded(u, dKey, wKey);
  for (const def of [...dailyDefs(), ...weeklyDefs()]){
    const st = getState(u, def.id);
    if (st.claimed || isDone(def, st)) continue;
    if (def.type==="open_chest") st.progress += qty;
  }
}
function onSpend(u, amount){
  const dKey = dayKey0900KST(), wKey = weekKeyMon0900KST();
  resetKeysIfNeeded(u, dKey, wKey);
  for (const def of [...dailyDefs(), ...weeklyDefs()]){
    const st = getState(u, def.id);
    if (st.claimed || isDone(def, st)) continue;
    if (def.type==="spend_coin") st.progress += Math.max(0, amount||0);
  }
}
function onBaitUse(u, qty=1){
  const dKey = dayKey0900KST(), wKey = weekKeyMon0900KST();
  resetKeysIfNeeded(u, dKey, wKey);
  for (const def of [...dailyDefs(), ...weeklyDefs()]){
    const st = getState(u, def.id);
    if (st.claimed || isDone(def, st)) continue;
    if (def.type==="consume_bait") st.progress += qty;
  }
}
function onDurability(u, itemKey, ticks=1){
  const dKey = dayKey0900KST(), wKey = weekKeyMon0900KST();
  resetKeysIfNeeded(u, dKey, wKey);
  for (const def of [...dailyDefs(), ...weeklyDefs()]){
    const st = getState(u, def.id);
    if (st.claimed || isDone(def, st)) continue;
    if (def.type==="use_durability"){
      (st.aux.items ||= {})[itemKey] = true;
      st.aux.ticks = (st.aux.ticks||0) + Math.max(0,ticks);
    }
  }
}

// ===== 조회/수령 =====
function snapshot(u){
  const dKey = dayKey0900KST(), wKey = weekKeyMon0900KST();
  resetKeysIfNeeded(u, dKey, wKey);
  const tier = u.tier || "실버";
  const daily = dailyDefs().map(def => describeOne(def, getState(u,def.id), tier));
  const weekly = weeklyDefs().map(def => describeOne(def, getState(u,def.id), tier));
  return { dailyKey:dKey, weeklyKey:wKey, daily, weekly };
}
function claim(u, scope, questId){
  const tier = u.tier || "실버";
  const defs = scope==="daily" ? dailyDefs() : weeklyDefs();
  const def = defs.find(x=>x.id===questId);
  if (!def) return { ok:false, reason:"not_found" };
  const st = getState(u, def.id);
  if (!isDone(def, st)) return { ok:false, reason:"not_done" };
  if (st.claimed) return { ok:false, reason:"claimed" };
  st.claimed = true;
  const rewards = rewardRoll(scope, tier, def.id);
  return { ok:true, rewards, label: label(def) };
}

// ===== 설정 =====
function configure(opts={}){
  if (opts.guildSeed!==undefined) CONFIG.guildSeed = String(opts.guildSeed||"");
  if (Array.isArray(opts.speciesCandidates)) CONFIG.speciesCandidates = opts.speciesCandidates.slice();
  if (opts.gear){
    if (opts.gear.rod) CONFIG.gear.rod = String(opts.gear.rod);
    if (opts.gear.float) CONFIG.gear.float = String(opts.gear.float);
  }
}

module.exports = {
  configure,
  snapshot, claim,
  onCatch, onSell, onOpenChest, onSpend, onBaitUse, onDurability
};
