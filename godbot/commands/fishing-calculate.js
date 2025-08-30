const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

const RARITY = ["노말","레어","유니크","레전드","에픽","언노운"];
const TIER_ORDER = ["브론즈","실버","골드","플래티넘","다이아","마스터","그랜드마스터","챌린저"];
const TIME_BUFFS = {
  "낮":   { biteSpeed: -2, dmg: 0, resistReduce: 0, rarityBias: 0 },
  "노을": { biteSpeed: -1, dmg: 0, resistReduce: 0, rarityBias: 1 },
  "밤":   { biteSpeed:  0, dmg: 0, resistReduce: 0, rarityBias: 2 },
};
const TIER_BUFFS = {
  "브론즈":       { biteSpeed:  0, dmg: 0, resistReduce: 0, rarityBias: 0 },
  "실버":         { biteSpeed: -1, dmg: 1, resistReduce: 1, rarityBias: 1 },
  "골드":         { biteSpeed: -2, dmg: 1, resistReduce: 1, rarityBias: 2 },
  "플래티넘":     { biteSpeed: -3, dmg: 2, resistReduce: 2, rarityBias: 3 },
  "다이아":       { biteSpeed: -4, dmg: 3, resistReduce: 3, rarityBias: 4 },
  "마스터":       { biteSpeed: -5, dmg: 4, resistReduce: 4, rarityBias: 5 },
  "그랜드마스터": { biteSpeed: -6, dmg: 5, resistReduce: 5, rarityBias: 6 },
  "챌린저":       { biteSpeed: -8, dmg: 6, resistReduce: 6, rarityBias: 8 },
};
const ROD_SPECS = {
  "나무 낚싯대":   { maxDur: 50,  biteSpeed: -4,  dmg: 6,  resistReduce: 0,  rarityBias: 0 },
  "강철 낚싯대":   { maxDur: 120,  biteSpeed: -8,  dmg: 9,  resistReduce: 3,  rarityBias: 2 },
  "금 낚싯대":     { maxDur: 250, biteSpeed: -12, dmg: 12, resistReduce: 5,  rarityBias: 5 },
  "다이아 낚싯대": { maxDur: 550, biteSpeed: -18, dmg: 15, resistReduce: 8,  rarityBias: 10 },
  "전설의 낚싯대": { maxDur: 990, biteSpeed: -25, dmg: 20, resistReduce: 12, rarityBias: 18 }
};
const FLOAT_SPECS = {
  "동 찌":    { maxDur: 30,  biteSpeed: -3,  resistReduce: 2,  rarityBias: 0 },
  "은 찌":    { maxDur: 60, biteSpeed: -6,  resistReduce: 4,  rarityBias: 2 },
  "금 찌":    { maxDur: 90, biteSpeed: -9,  resistReduce: 7,  rarityBias: 4 },
  "다이아 찌": { maxDur: 200, biteSpeed: -12, resistReduce: 10, rarityBias: 7 }
};
const BAIT_SPECS = {
  "지렁이 미끼":        { pack: 20, biteSpeed: -2, rarityBias: 0  },
  "새우 미끼":          { pack: 20, biteSpeed: -4, rarityBias: 2  },
  "빛나는 젤리 미끼":  { pack: 20, biteSpeed: -7, rarityBias: 6  }
};
const LENGTH_TABLE = {
  "멸치":[5,15],
  "피라냐":[15,40],
  "금붕어":[5,25],
  "전갱이":[20,50],
  "고등어":[25,60],
  "가재":[8,20],
  "연어":[60,120],
  "다랑어":[80,200],
  "가자미":[25,50],
  "오징어":[20,60],
  "잉어":[30,100],
  "삼치":[40,100],
  "복어":[15,45],
  "황어":[30,60],
  "도미":[30,80],
  "참돔":[40,90],
  "붕어":[20,50],
  "비단 잉어":[40,100],
  "빙어":[8,15],
  "갈치":[80,200],
  "참치":[150,300],
  "장어":[50,200],
  "개복치":[100,300],
  "문어":[50,200],
  "거북이":[30,100],
  "곰치":[100,300],
  "고래상어":[300,1200],
  "빨판상어":[40,110],
  "청새치":[200,450],
  "철갑상어":[150,600],
  "대왕고래":[1000,3000],
  "작은입배스":[20,40],
  "홍어":[50,150],
  "가오리":[40,200],
  "우럭":[20,60],
  "민어":[50,100],
  "병어":[15,40],
  "방어":[50,100],
  "전어":[15,30],
  "은어":[15,25],
  "송어":[30,70],
  "넙치":[40,100],
  "청어":[20,40],
  "꽁치":[25,40],
  "쏘가리":[25,50],
  "농어":[40,100],
  "큰입배스":[30,80],
  "참다랑어":[150,300],
  "황다랑어":[100,200],
  "메기":[60,200],
  "블롭피쉬":[20,40],
  "그림자 장어":[100,250],
  "별빛 잉어":[50,120],
  "심연의 복어":[80,180],
  "아귀":[50,150],
  "에테르 피쉬":[120,250],
  "루미나 샤크":[300,600],
  "해룡 까리오스":[800,3500],
  "샤이닝 해파리":[25,200],
  "덤보 문어":[30,180],
  "황금 잉어":[40,150],
  "꼴뚜기":[10,50],
  "뼈 생선":[30,150],
  "피라미": [5, 15],
  "쏠배감펭": [20, 40],
  "개구리": [6, 15],
  "해마": [5, 35],
  "톱상어": [150, 500],
  "야광어": [20, 60],
  "실러캔스": [150, 200],
  "앵무조개": [15, 25],
  "홍게": [40,70],
  "유령고래": [100,200],
  "클리오네의 정령": [10,50]
};
const RARITY_HP_MULT = { "노말":1, "레어":1.5, "유니크":2.0, "레전드":3.0, "에픽":4.0, "언노운":20.0 };

function getTierBuff(tier){ return TIER_BUFFS[tier] || TIER_BUFFS["브론즈"]; }
function getTimeBuff(band){ return TIME_BUFFS[band] || { biteSpeed:0, dmg:0, resistReduce:0, rarityBias:0 }; }

function effectiveDmg(rod, tier){
  const base = (ROD_SPECS[rod]?.dmg||6);
  return base + (getTierBuff(tier).dmg||0);
}
function effectiveResistReduce(rod, float, tier){
  const r=(ROD_SPECS[rod]?.resistReduce||0);
  const f=(FLOAT_SPECS[float]?.resistReduce||0);
  const t=(getTierBuff(tier).resistReduce||0);
  return r+f+t;
}
function effectiveRarityBias(rod, float, bait, tier, timeBand){
  const r=(ROD_SPECS[rod]?.rarityBias||0);
  const f=(FLOAT_SPECS[float]?.rarityBias||0);
  const b=(BAIT_SPECS[bait]?.rarityBias||0);
  const t=(getTierBuff(tier).rarityBias||0);
  const tm=(getTimeBuff(timeBand).rarityBias||0);
  return r+f+b+t+tm;
}

function rarityWeights(rod,float,bait,tier,timeBand){
  const base = { "노말": 110, "레어": 30, "유니크": 5, "레전드": 1.5, "에픽": 0.5, "언노운": 0.1 };
  const bias = effectiveRarityBias(rod,float,bait,tier,timeBand);
  const m = { ...base };
  m["레어"]    += bias*0.8;
  m["유니크"]  += bias*0.35;
  m["레전드"]  += bias*0.12;
  m["에픽"]    += bias*0.04;
  m["언노운"]  += bias*0.01;
  return m;
}
function normalizeWeights(m){
  const s = Object.values(m).reduce((a,b)=>a+b,0);
  const o={}; for(const k of Object.keys(m)) o[k]=m[k]/s;
  return o;
}

function avgMinMaxLen(){
  let sMin=0, sMax=0, n=0;
  for(const [a,b] of Object.values(LENGTH_TABLE)){
    sMin+=a; sMax+=b; n++;
  }
  return { Lmin: sMin/n, Lmax: sMax/n };
}

function clamp(x,a,b){ return Math.max(a, Math.min(b, x)); }

function catchChanceRangeForRarity(rarity, rod, float, tier){
  const idx = RARITY.indexOf(rarity);
  const rr = clamp(Math.round(10 + idx*5) - effectiveResistReduce(rod,float,tier), 5, 999);
  const dmg = effectiveDmg(rod,tier);
  const take = Math.max(1, dmg + 4.5 - rr/4);
  const { Lmin, Lmax } = avgMinMaxLen();
  const hpMin = clamp(Math.round((Lmin/2) * (RARITY_HP_MULT[rarity]||1)), 30, 8000);
  const hpMax = clamp(Math.round((Lmax/2) * (RARITY_HP_MULT[rarity]||1)), 30, 8000);
  const cycMin = hpMin / take;
  const cycMax = hpMax / take;
  const control = clamp(50 + 1.5*effectiveResistReduce(rod,float,tier) + 0.8*(dmg-10), 10, 95);
  let pEsc = clamp(0.25 - control*0.002, 0.03, 0.25) * (1 + idx*0.03);
  const timePenaltyMin = (cycMin*2 > 90) ? 0.85 : 1;
  const timePenaltyMax = (cycMax*2 > 90) ? 0.85 : 1;
  const pMin = Math.pow(1 - pEsc, cycMin) * timePenaltyMin;
  const pMax = Math.pow(1 - pEsc, cycMax) * timePenaltyMax;
  return { min: clamp(pMin,0,1), max: clamp(pMax,0,1) };
}

function pct(x){ return (x*100).toFixed(1)+"%"; }

const data = new SlashCommandBuilder()
  .setName("낚시공략")
  .setDescription("낚시 통합 명령")
  .addSubcommand(s=>s.setName("확률").setDescription("티어×시간대×장비 조합에 따른 등급별 조우/포획 확률 계산")
    .addStringOption(o=>o.setName("티어").setDescription("티어").setRequired(true).addChoices(...TIER_ORDER.map(v=>({name:v, value:v}))))
    .addStringOption(o=>o.setName("시간대").setDescription("시간대").setRequired(true).addChoices(...Object.keys(TIME_BUFFS).map(v=>({name:v, value:v}))))
    .addStringOption(o=>o.setName("낚싯대").setDescription("낚싯대").setRequired(true).addChoices(...Object.keys(ROD_SPECS).map(v=>({name:v, value:v}))))
    .addStringOption(o=>o.setName("찌").setDescription("찌").setRequired(true).addChoices(...Object.keys(FLOAT_SPECS).map(v=>({name:v, value:v}))))
    .addStringOption(o=>o.setName("미끼").setDescription("미끼").setRequired(true).addChoices(...Object.keys(BAIT_SPECS).map(v=>({name:v, value:v}))))
  );

async function execute(interaction){
  const sub = interaction.options.getSubcommand();
  if (sub !== "확률") return interaction.reply({ content:"지원하지 않는 하위 명령입니다.", ephemeral:true });
  const tier = interaction.options.getString("티어", true);
  const timeBand = interaction.options.getString("시간대", true);
  const rod = interaction.options.getString("낚싯대", true);
  const float = interaction.options.getString("찌", true);
  const bait = interaction.options.getString("미끼", true);

  const w = rarityWeights(rod,float,bait,tier,timeBand);
  const p = normalizeWeights(w);

  const dmg = effectiveDmg(rod,tier);
  const rr = effectiveResistReduce(rod,float,tier);
  const rb = effectiveRarityBias(rod,float,bait,tier,timeBand);

  const rows = RARITY.map(r=>{
    const enc = pct(p[r]||0);
    const rng = catchChanceRangeForRarity(r, rod, float, tier);
    const lo = pct(rng.min), hi = pct(rng.max);
    return `• [${r}] 조우 ${enc} | 포획 ${lo} ~ ${hi}`;
  });

  const eb = new EmbedBuilder()
    .setTitle("🎯 낚시 확률 계산")
    .setDescription([
      `장비: ${rod} / ${float} / ${bait}`,
      `티어·시간대: ${tier} / ${timeBand}`,
      `제압력: ${dmg} | 저항감쇄: ${rr} | 희귀도 가중치: +${rb}`,
      "",
      rows.join("\n")
    ].join("\n"))
    .setColor(0x3aa0ff);

  return interaction.reply({ embeds:[eb], ephemeral:true });
}

module.exports = { data, execute };
