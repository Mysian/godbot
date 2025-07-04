// ==== commands/godbit-admin.js ====
// 관리자 통합: 타입/시장/로그 멘트 완전체

const {
  SlashCommandBuilder, EmbedBuilder
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const lockfile = require('proper-lockfile');

// ==== 15종 코인 타입(변동성/설명/트렌드) ====
const COIN_TYPES = [
  { coinType: 'verystable', volatility: { min: -0.00015, max: 0.00015 }, trend: 0.00003, desc: '국가채권급 초안정' },
  { coinType: 'chaotic',    volatility: { min: -0.004,   max: 0.004   }, trend: 0.00012, desc: '초미친 도박, 하루에 2배' },
  { coinType: 'dead',       volatility: { min: -0.0002, max: 0.00015 }, trend: -0.00005,desc: '서서히 녹는 죽은코인' },
  { coinType: 'neutral',    volatility: { min: -0.0006,  max: 0.0007  }, trend: 0,       desc: '시장평균 일반코인' },
  { coinType: 'long',       volatility: { min: -0.0002,  max: 0.002  }, trend: 0.00008, desc: '장기 우상향' },
  { coinType: 'short',      volatility: { min: -0.001,  max: 0.002   }, trend: 0.00005,desc: '단타, 진폭큼' },
  { coinType: 'boxer',      volatility: { min: -0.0003,  max: 0.00025  }, trend: 0,      desc: '박스권, 평평' },
  { coinType: 'slowbull',   volatility: { min: -0.0001, max: 0.0004 }, trend: 0.00007,desc: '느린 우상향 적금' },
  { coinType: 'explodebox', volatility: { min: -0.0003,  max: 0.003  }, trend: 0.00013, desc: '가끔 펌핑' },
  { coinType: 'growth',     volatility: { min: -0.0004,  max: 0.0018  }, trend: 0.00023, desc: '성장주 우상향' },
  { coinType: 'roller',     volatility: { min: -0.0025,  max: 0.0025  }, trend: 0.00008, desc: '롤러코스터' },
  { coinType: 'zombie',     volatility: { min: -0.0007,  max: 0.00015  }, trend: -0.00006,desc: '만년 약세' },
  { coinType: 'dailyboom',  volatility: { min: -0.0001,  max: 0.004  }, trend: 0,      desc: '일확천금' },
  { coinType: 'bubble',     volatility: { min: -0.004,   max: 0.006  }, trend: 0.00015, desc: '초반 급등 후 폭락' },
  { coinType: 'fear',       volatility: { min: -0.0022,  max: 0.0007  }, trend: -0.00011,desc: '악재 민감, 하락' },
];

const coinsPath   = path.join(__dirname, '../data/godbit-coins.json');
const walletsPath = path.join(__dirname, '../data/godbit-wallets.json');
const NOTICE_CHANNEL_ID = '1389821392618262631';

// ==== 이벤트 상폐/부활/상장 멘트 ====
const DELIST_MSGS = [
  '😱 [상폐] 이런! {coin}은(는) 스캠 코인으로 판명되었습니다!',
  '😱 [상폐] {coin}은(는) 사기였습니다! 사기!',
  '😱 [상폐] {coin} 관련 좋지 않은 소식입니다.. 그렇습니다.. 상장 폐지되었습니다.',
  '😱 [상폐] {coin}에 투자하신 분들! 큰일났습니다..! 해당 코인은 휴지 쪼가리가 되었어요!',
  '😱 [상폐] 충격! {coin}은(는) 좋지 않은 결말을 맞이합니다.',
  '😱 [상폐] {coin} 투자자 여러분, 안타까운 소식입니다.'
];
const REVIVE_MSGS = [
  '🐦‍🔥 [부활] {coin} 부활! 투자자들의 눈물 속에 다시 상장되었습니다!',
  '🐦‍🔥 [부활] 놀랍게도 {coin}이(가) 재상장! 다시 한 번 기회를 노려보세요!',
  '🐦‍🔥 [부활] 희소식! {coin}이(가) 시장에 복귀했습니다!',
  '🐦‍🔥 [부활] 죽지 않고 돌아왔다! {coin}이(가) 다시 거래소에 등장했습니다.',
];
const NEWCOIN_MSGS = [
  '🌟 [상장] 새로운 코인! {coin}이(가) 거래소에 등장했습니다. 모두 주목!',
  '🌟 [상장] {coin} 신규 상장! 이제부터 거래가 가능합니다!',
  '🌟 [상장] {coin}이(가) 오늘부로 공식 상장되었습니다. 첫 번째 투자자는 누구?',
  '🌟 [상장] {coin} 코인, 대망의 상장! 승부의 시작을 알립니다!',
];
function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
async function postLogMsg(type, coinName, client) {
  let msg;
  if (type === 'delist') msg = pickRandom(DELIST_MSGS).replace('{coin}', coinName);
  if (type === 'revive') msg = pickRandom(REVIVE_MSGS).replace('{coin}', coinName);
  if (type === 'new')    msg = pickRandom(NEWCOIN_MSGS).replace('{coin}', coinName);
  try {
    const ch = await client.channels.fetch(NOTICE_CHANNEL_ID);
    if (ch) ch.send(msg);
  } catch (e) {}
}

async function loadJson(file, def) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(def, null, 2));
  const release = await lockfile.lock(file, { retries: 5, minTimeout: 50 });
  let data;
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); }
  finally { await release(); }
  return data;
}
async function saveJson(file, data) {
  const release = await lockfile.lock(file, { retries: 5, minTimeout: 50 });
  try { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
  finally { await release(); }
}
function toKSTString(utcOrDate) {
  if (!utcOrDate) return '-';
  try {
    return new Date(utcOrDate).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  } catch {
    return '-';
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('갓비트관리')
    .setDescription('갓비트 관리자 전용 명령어')
    .addSubcommand(sub =>
      sub.setName('타입목록')
        .setDescription('갓비트 코인 타입/특성 전체 확인')
    )
    .addSubcommand(sub =>
      sub.setName('타입변경')
        .setDescription('특정 코인 타입(스타일) 변경')
        .addStringOption(opt => opt.setName('코인명').setDescription('코인명').setRequired(true))
        .addStringOption(opt => opt.setName('타입').setDescription('15가지 타입').setRequired(true)
          .addChoices(...COIN_TYPES.map(t => ({ name: `${t.coinType} - ${t.desc}`, value: t.coinType })))
        )
    )
    .addSubcommand(sub =>
      sub.setName('타입랜덤')
        .setDescription('특정 코인 타입 무작위 재배정')
        .addStringOption(opt => opt.setName('코인명').setDescription('코인명').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('조정')
        .setDescription('코인 전체적 흐름(변동성) 조정 (전체 한 번에 적용)')
        .addStringOption(opt =>
          opt.setName('흐름').setDescription('변동성 옵션').setRequired(true)
            .addChoices(
              { name: '하이리스크 하이리턴', value: 'high' },
              { name: '균형 잡힌', value: 'balance' },
              { name: '안전한', value: 'safe' },
              { name: '불규칙적인', value: 'chaos' }
            )
        )
        .addStringOption(opt =>
          opt.setName('코인명').setDescription('코인명(선택)').setRequired(false)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('지급')
        .setDescription('특정 유저에게 특정 코인 지급')
        .addUserOption(opt => opt.setName('유저').setDescription('지급 대상').setRequired(true))
        .addStringOption(opt => opt.setName('코인').setDescription('코인명').setRequired(true))
        .addIntegerOption(opt => opt.setName('수량').setDescription('수량').setMinValue(1).setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('초기화')
        .setDescription('코인 시장 전체 초기화(까리코인만 남음)')
    )
    .addSubcommand(sub =>
      sub.setName('상장')
        .setDescription('특정 코인 상장(타입 직접 지정 가능, 상폐된 코인 재상장은 "부활상장")')
        .addStringOption(opt => opt.setName('코인명').setDescription('상장할 코인명').setRequired(true))
        .addStringOption(opt => opt.setName('타입').setDescription('15가지 타입').setRequired(false)
          .addChoices(...COIN_TYPES.map(t => ({ name: `${t.coinType} - ${t.desc}`, value: t.coinType })))
        )
    )
    .addSubcommand(sub =>
      sub.setName('상장폐지')
        .setDescription('특정 코인 상장폐지')
        .addStringOption(opt => opt.setName('코인명').setDescription('상장폐지할 코인명').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('옵션')
        .setDescription('상장폐지 확률/기준 등 옵션 설정')
        .addStringOption(opt =>
          opt.setName('폐지기준').setDescription('폐지 옵션').setRequired(true)
            .addChoices(
              { name: '수익 저조시', value: 'profitlow' },
              { name: '랜덤 확률', value: 'random' }
            )
        )
        .addIntegerOption(opt =>
          opt.setName('확률').setDescription('랜덤 폐지 확률(%)').setMinValue(1).setMaxValue(100).setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub.setName('우상향')
        .setDescription('특정 코인을 우상향 목록에 추가')
        .addStringOption(opt => opt.setName('코인명').setDescription('코인명').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('우상향삭제')
        .setDescription('특정 코인을 우상향 목록에서 제거')
        .addStringOption(opt => opt.setName('코인명').setDescription('코인명').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('우하향')
        .setDescription('특정 코인을 우하향 목록에 추가')
        .addStringOption(opt => opt.setName('코인명').setDescription('코인명').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('우하향삭제')
        .setDescription('특정 코인을 우하향 목록에서 제거')
        .addStringOption(opt => opt.setName('코인명').setDescription('코인명').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('떡상')
        .setDescription('특정 코인을 입력한 금액까지 점진적/자연스럽게 떡상시킴')
        .addStringOption(opt => opt.setName('코인명').setDescription('코인명').setRequired(true))
        .addIntegerOption(opt => opt.setName('금액').setDescription('목표 금액').setMinValue(1).setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('떡락')
        .setDescription('특정 코인을 입력한 금액까지 점진적/자연스럽게 떡락시킴')
        .addStringOption(opt => opt.setName('코인명').setDescription('코인명').setRequired(true))
        .addIntegerOption(opt => opt.setName('금액').setDescription('목표 금액').setMinValue(1).setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('이벤트')
        .setDescription('시장 이벤트(특정 코인 강제 펌핑/덤핑/평균화)')
        .addStringOption(opt => opt.setName('코인명').setDescription('코인명').setRequired(true))
        .addStringOption(opt =>
          opt.setName('종류').setDescription('이벤트 종류').setRequired(true)
            .addChoices(
              { name: '펌핑', value: 'pump' },
              { name: '덤핑', value: 'dump' },
              { name: '평균화', value: 'normalize' }
            )
        )
    )
    .addSubcommand(sub =>
      sub.setName('상태')
        .setDescription('갓비트 코인 시스템 전체 현황/세팅 상태를 확인')
    )
  ,

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const coins = await loadJson(coinsPath, {});

    // ========== 1. 타입 목록 확인 ==========
    if (sub === '타입목록') {
      const embed = new EmbedBuilder()
        .setTitle('💠 [갓비트] 코인 타입 리스트 (총 15종)')
        .setColor('#1188ee');
      COIN_TYPES.forEach(t => {
        embed.addFields({
          name: `${t.coinType}`,
          value: `• 변동폭: ${Math.round(t.volatility.min*10000)/100}% ~ ${Math.round(t.volatility.max*10000)/100}%\n• 트렌드: ${(t.trend*100).toFixed(3)}%/틱\n• ${t.desc}`,
          inline: false
        });
      });
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    // ========== 2. 타입 변경 ==========
    if (sub === '타입변경') {
  const coin = interaction.options.getString('코인명');
  const type = interaction.options.getString('타입');
  if (!coins[coin]) return interaction.reply({ content: `❌ [${coin}] 존재하지 않는 코인입니다.`, ephemeral: true });
  const prevType = coins[coin].coinType ?? '-';
  const target = COIN_TYPES.find(t => t.coinType === type);
  if (!target) return interaction.reply({ content: `❌ 지원하지 않는 타입입니다.`, ephemeral: true });
  coins[coin].coinType = type;
  coins[coin].volatility = target.volatility;
  coins[coin].trend = target.trend;
  await saveJson(coinsPath, coins);
  return interaction.reply({ content: `✅ [${coin}] 타입을 **${prevType} → ${type}**(으)로 변경 완료!`, ephemeral: true });
}


    // ========== 3. 타입 랜덤 재배정 ==========
    if (sub === '타입랜덤') {
      const coin = interaction.options.getString('코인명');
      if (!coins[coin]) return interaction.reply({ content: `❌ [${coin}] 존재하지 않는 코인입니다.`, ephemeral: true });
      const pick = COIN_TYPES[Math.floor(Math.random()*COIN_TYPES.length)];
      coins[coin].coinType = pick.coinType;
      coins[coin].volatility = pick.volatility;
      coins[coin].trend = pick.trend;
      await saveJson(coinsPath, coins);
      return interaction.reply({ content: `🔀 [${coin}] 타입이 랜덤하게 **${pick.coinType}**(으)로 변경됨!`, ephemeral: true });
    }

    // ========== 4. 시장 전체 조정 ==========
    if (sub === '조정') {
      const flow = interaction.options.getString('흐름');
      const targetCoin = interaction.options.getString('코인명');
      let changeCount = 0;
      let targets = targetCoin ? [targetCoin] : Object.keys(coins).filter(c=>!c.startsWith('_'));
      for (const coin of targets) {
        if (!coins[coin]) continue;
        let t = coins[coin];
        if (flow === 'high')      t.volatility = { min: -0.02, max: 0.02 }, t.trend = 0.001;
        else if (flow === 'balance') t.volatility = { min: -0.003, max: 0.003 }, t.trend = 0;
        else if (flow === 'safe')    t.volatility = { min: -0.0008, max: 0.0008 }, t.trend = 0.00008;
        else if (flow === 'chaos')   t.volatility = { min: -0.03, max: 0.03 }, t.trend = 0.0015;
        changeCount++;
      }
      await saveJson(coinsPath, coins);
      return interaction.reply({ content: `⚡️ ${changeCount}개 코인에 [${flow}] 옵션 적용됨.`, ephemeral: true });
    }

    // ========== 5. 코인 지급 ==========
    if (sub === '지급') {
      const user = interaction.options.getUser('유저');
      const coin = interaction.options.getString('코인');
      const qty = interaction.options.getInteger('수량');
      if (!coins[coin]) return interaction.reply({ content: `❌ [${coin}] 존재하지 않는 코인입니다.`, ephemeral: true });
      let wallets = await loadJson(walletsPath, {});
      wallets[user.id] = wallets[user.id] || {};
      wallets[user.id][coin] = (wallets[user.id][coin] || 0) + qty;
      await saveJson(walletsPath, wallets);
      return interaction.reply({ content: `✅ [${user.username}]님께 [${coin}] ${qty}개 지급 완료!`, ephemeral: true });
    }

    // ========== 6. 시장 초기화 ==========
    if (sub === '초기화') {
      const now = new Date().toISOString();
      const coinsNew = {
        '까리코인': {
          price: 1000, history: [1000], historyT: [now], listedAt: now,
          volatility: { min: -0.0006, max: 0.0007 }, trend: 0.0003, coinType: "verystable"
        }
      };
      await saveJson(coinsPath, coinsNew);
      return interaction.reply({ content: '🗑️ 시장 전체가 초기화되었습니다 (까리코인만 남음)', ephemeral: true });
    }

    // ========== 7. 상장(신규/부활 자동 감지) ==========
    if (sub === '상장') {
      const coin = interaction.options.getString('코인명');
      const type = interaction.options.getString('타입');
      const now = new Date().toISOString();
      let pick;
      if (type) pick = COIN_TYPES.find(t => t.coinType === type);
      else pick = COIN_TYPES[Math.floor(Math.random()*COIN_TYPES.length)];

      // "부활상장"인지 감지
      let revive = false;
      if (coins[coin] && coins[coin].delistedAt) revive = true;
      if (!coins[coin] || revive) {
        coins[coin] = {
          price: Math.floor(1000 + Math.random() * 49000),
          history: [],
          historyT: [],
          listedAt: now,
          delistedAt: null,
          volatility: pick.volatility,
          trend: pick.trend,
          coinType: pick.coinType
        };
        coins[coin].history.push(coins[coin].price);
        coins[coin].historyT.push(now);
        await saveJson(coinsPath, coins);
        await postLogMsg(revive ? 'revive' : 'new', coin, interaction.client);
        return interaction.reply({ content: `🎉 [${coin}]이(가) **${pick.coinType}** 타입으로 ${revive ? "부활상장" : "상장"}됨!`, ephemeral: true });
      }
      else {
        return interaction.reply({ content: `❌ 이미 상장된 코인입니다.`, ephemeral: true });
      }
    }

    // ========== 8. 상장폐지 ==========
    if (sub === '상장폐지') {
      const coin = interaction.options.getString('코인명');
      if (!coins[coin]) return interaction.reply({ content: `❌ [${coin}] 존재하지 않는 코인입니다.`, ephemeral: true });
      if (coins[coin].delistedAt) return interaction.reply({ content: `❌ 이미 상장폐지된 코인입니다.`, ephemeral: true });
      coins[coin].delistedAt = new Date().toISOString();
      await saveJson(coinsPath, coins);
      await postLogMsg('delist', coin, interaction.client);
      return interaction.reply({ content: `⛔️ [${coin}]이(가) 상장폐지됨.`, ephemeral: true });
    }

    // ========== 9. 상장폐지 옵션 ==========
    if (sub === '옵션') {
      const opt = interaction.options.getString('폐지기준');
      const prob = interaction.options.getInteger('확률');
      coins._delistOption = { type: opt, prob: prob || (opt === 'random' ? 10 : undefined) };
      await saveJson(coinsPath, coins);
      return interaction.reply({ content: `✅ 상장폐지 옵션: ${opt} ${prob ? `(${prob}%)` : ''}`, ephemeral: true });
    }

    // ========== 10. 우상향/우상향삭제 ==========
    if (sub === '우상향') {
      const coin = interaction.options.getString('코인명');
      coins._uptrend = coins._uptrend || [];
      if (!coins._uptrend.includes(coin)) coins._uptrend.push(coin);
      await saveJson(coinsPath, coins);
      return interaction.reply({ content: `📈 [${coin}]이(가) 우상향 목록에 추가됨!`, ephemeral: true });
    }
    if (sub === '우상향삭제') {
      const coin = interaction.options.getString('코인명');
      coins._uptrend = coins._uptrend || [];
      coins._uptrend = coins._uptrend.filter(c=>c!==coin);
      await saveJson(coinsPath, coins);
      return interaction.reply({ content: `🗑️ [${coin}] 우상향 목록에서 제거됨.`, ephemeral: true });
    }

    // ========== 11. 우하향/우하향삭제 ==========
    if (sub === '우하향') {
      const coin = interaction.options.getString('코인명');
      coins._downtrend = coins._downtrend || [];
      if (!coins._downtrend.includes(coin)) coins._downtrend.push(coin);
      await saveJson(coinsPath, coins);
      return interaction.reply({ content: `📉 [${coin}]이(가) 우하향 목록에 추가됨!`, ephemeral: true });
    }
    if (sub === '우하향삭제') {
      const coin = interaction.options.getString('코인명');
      coins._downtrend = coins._downtrend || [];
      coins._downtrend = coins._downtrend.filter(c=>c!==coin);
      await saveJson(coinsPath, coins);
      return interaction.reply({ content: `🗑️ [${coin}] 우하향 목록에서 제거됨.`, ephemeral: true });
    }

    // ========== 12. 떡상/떡락 ==========
    if (sub === '떡상' || sub === '떡락') {
      const coin = interaction.options.getString('코인명');
      const priceTarget = interaction.options.getInteger('금액');
      if (!coins[coin]) return interaction.reply({ content: `❌ [${coin}] 존재하지 않는 코인입니다.`, ephemeral: true });
      const now = coins[coin].price;
      const delta = priceTarget - now;
      const step = Math.ceil(Math.abs(delta) / 10);
      let pArr = [];
      for (let i=1; i<=10; i++) {
        let next = sub === '떡상'
          ? now + (step*i)
          : now - (step*i);
        if (sub === '떡상' && next > priceTarget) next = priceTarget;
        if (sub === '떡락' && next < priceTarget) next = priceTarget;
        pArr.push(next);
      }
      coins[coin].history = coins[coin].history || [];
      coins[coin].historyT = coins[coin].historyT || [];
      pArr.forEach(p => {
        coins[coin].history.push(p);
        coins[coin].historyT.push(new Date().toISOString());
      });
      coins[coin].price = priceTarget;
      await saveJson(coinsPath, coins);
      return interaction.reply({ content: `🚀 [${coin}] ${sub==='떡상'?'떡상':'떡락'} 완료!`, ephemeral: true });
    }

    // ========== 13. 이벤트 ==========
    if (sub === '이벤트') {
  const coin = interaction.options.getString('코인명');
  const kind = interaction.options.getString('종류');
  if (!coins[coin]) return interaction.reply({ content: `❌ [${coin}] 존재하지 않는 코인입니다.`, ephemeral: true });

  let oldPrice = coins[coin].price;
  let newPrice = oldPrice;
  if (kind === 'pump') {
    const pct = 0.2 + Math.random() * 0.8; // 20~100% 상승
    newPrice = Math.round(oldPrice * (1 + pct));
  } else if (kind === 'dump') {
    const pct = 0.2 + Math.random() * 0.7; // 20~90% 하락
    newPrice = Math.max(1, Math.round(oldPrice * (1 - pct)));
  } else if (kind === 'normalize') {
    // 시장 평균으로 보정
    let total = 0, count = 0;
    for (const [n, info] of Object.entries(coins)) {
      if (n.startsWith('_') || info.delistedAt) continue;
      total += info.price ?? 0;
      count++;
    }
    newPrice = count ? Math.round(total / count) : oldPrice;
  }
  coins[coin].price = newPrice;
  coins[coin].history = coins[coin].history || [];
  coins[coin].historyT = coins[coin].historyT || [];
  coins[coin].history.push(newPrice);
  coins[coin].historyT.push(new Date().toISOString());
  await saveJson(coinsPath, coins);
  return interaction.reply({ content: `🌊 [${coin}] ${kind === 'pump' ? '펌핑' : kind === 'dump' ? '덤핑' : '평균화'} 이벤트 적용됨! (${oldPrice} → ${newPrice} BE)`, ephemeral: true });
}


    // ========== 14. 상태 ==========
    if (sub === '상태') {
  let live = 0, delisted = 0;
  let types = {};
  let desc = '';
  for (const [name, info] of Object.entries(coins)) {
    if (name.startsWith('_')) continue;
    if (info.delistedAt) delisted++; else live++;
    types[info.coinType] = (types[info.coinType] || 0) + 1;
    if (!info.delistedAt) {
      desc += `• ${name} | ${info.price?.toLocaleString() ?? '-'} BE | ${info.coinType}\n`;
    }
  }
  const embed = new EmbedBuilder()
    .setTitle('⚡️ 갓비트 시장 상태')
    .addFields(
      { name: '상장 코인', value: `${live}개`, inline: true },
      { name: '상장폐지', value: `${delisted}개`, inline: true },
      { name: '코인 타입 분포', value: Object.entries(types).map(([k,v])=>`${k}: ${v}개`).join(', '), inline: false },
      { name: '코인별 타입', value: desc.length ? desc : '상장 코인 없음', inline: false },
    )
    .setColor('#00c896')
    .setTimestamp();
  await interaction.reply({ embeds: [embed], ephemeral: true });
  return;
}
  }
};

