// ==== commands/godbit.js ====

const {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const lockfile = require('proper-lockfile');
const { addBE, getBE, loadConfig } = require('./be-util.js');

const coinsPath   = path.join(__dirname, '../data/godbit-coins.json');
const walletsPath = path.join(__dirname, '../data/godbit-wallets.json');
const PAGE_SIZE   = 5;
const HISTORY_PAGE = 20;
const HISTORY_MAX = 100;
const MAX_AUTO_COINS = 20;
const COLORS      = ['red','blue','green','orange','purple','cyan','magenta','brown','gray','teal'];
const EMOJIS      = ['🟥','🟦','🟩','🟧','🟪','🟨','🟫','⬜','⚫','🟣'];

// 차트 기간 옵션
const CHART_FILTERS = [
  { label: "1분", value: "1m", points: 12, interval: 1 },    // 최근 12분 (raw)
  { label: "30분", value: "30m", points: 24, interval: 30 }, // 최근 12시간 (30분 단위)
  { label: "1시간", value: "1h", points: 24, interval: 60 }, // 최근 24시간 (1시간 단위)
  { label: "3시간", value: "3h", points: 24, interval: 180 },// 최근 3일 (3시간 단위)
  { label: "6시간", value: "6h", points: 28, interval: 360 },// 최근 7일 (6시간 단위)
  { label: "12시간", value: "12h", points: 28, interval: 720 }, // 최근 14일 (12시간 단위)
  { label: "24시간", value: "24h", points: 30, interval: 1440 }, // 최근 30일 (1일 단위)
  { label: "7일", value: "7d", points: 14, interval: 1440*7/14 }, // 7일 (2회/일)
  { label: "30일", value: "30d", points: 30, interval: 1440*30/30 }, // 30일 (1회/일)
];

// ==== 코인 상관관계 쌍 ====
const CORR_PAIRS = [
  ["까리코인", "영갓코인"],
  ["추경코인", "도롱코인"],
  ["팔복코인", "가또코인"],
  ["애옹코인", "호의코인"],
  ["수박코인", "호떡코인"],
  ["오레오렌찌코인", "강수덕코인"],
  ["마라탕좋아함코인", "후수니코인"],
];

// ==== 거래량 기록 (10분마다 리셋) ====
let lastVolume = {};
let lastVolumeResetAt = 0;

// ==== 시간/요일 보정 ====
function getTimePower() {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();
  let power = 1.0;
  if (hour >= 21 && hour <= 23) power *= 1.4;
  if (day === 0 || day === 6) power *= 1.25;
  return power;
}

// ==== KST 변환 ====
function toKSTString(utcOrDate) {
  if (!utcOrDate) return '-';
  if (typeof utcOrDate === 'string' && (utcOrDate.includes('오전') || utcOrDate.includes('오후'))) return utcOrDate;
  try {
    return new Date(utcOrDate).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  } catch {
    return '-';
  }
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

async function ensureBaseCoin(coins) {
  if (!coins['까리코인']) {
    const now = new Date().toISOString();
    coins['까리코인'] = {
      price: 1000,
      history: [1000],
      historyT: [now],
      listedAt: now
    };
  }
}

async function addHistory(info, price) {
  if (!info.history) info.history = [];
  if (!info.historyT) info.historyT = [];
  const now = new Date().toISOString();
  info.history.push(price);
  info.historyT.push(now);
  while (info.history.length > HISTORY_MAX) info.history.shift();
  while (info.historyT.length > HISTORY_MAX) info.historyT.shift();
}

async function getDelistOption() {
  const coins = await loadJson(coinsPath, {});
  return coins._delistOption || { type: 'profitlow', prob: 10 };
}

// ==== 거래량 기록 함수 ====
function recordVolume(coin, amount) {
  const now = Date.now();
  if (!lastVolumeResetAt || now - lastVolumeResetAt > 10*60*1000) {
    lastVolume = {};
    lastVolumeResetAt = now;
  }
  lastVolume[coin] = (lastVolume[coin] || 0) + amount;
}


function isKoreanName(str) {
  return /^[가-힣]+$/.test(str);
}

// ===== ⭐️ 1분마다 시세/폐지/신규상장 자동 갱신! =====
async function autoMarketUpdate(members) {
  const coins = await loadJson(coinsPath, {});
  const uptrend = coins._uptrend || [];
  const downtrend = coins._downtrend || [];
  
  await ensureBaseCoin(coins);

  const base = coins['까리코인'];
  const deltaBase = (Math.random() * 0.2) - 0.1;
  const newBase = Math.max(1, Math.floor(base.price * (1 + deltaBase)));
  base.price = newBase;
  base.history.push(newBase);
  base.historyT = base.historyT || [];
  base.historyT.push(new Date().toISOString());
  while (base.history.length > HISTORY_MAX) base.history.shift();
  while (base.historyT.length > HISTORY_MAX) base.historyT.shift();

  const delistOpt = coins._delistOption || { type: 'profitlow', prob: 10 };
  const timePower = getTimePower();

  // 상관관계 쌍 기록용
  let corrQueue = [];

  for (const [name, info] of Object.entries(coins)) {
    if (name.startsWith('_')) continue;
    if (name === '까리코인' || info.delistedAt) continue;

    let minVar = -0.1, maxVar = 0.1;
    if (info.volatility) { minVar = info.volatility.min; maxVar = info.volatility.max; }
    let kImpact = deltaBase * (0.4 + Math.random()*0.2);

    // 거래량 기반 변동폭 가중
    const volume = lastVolume[name] || 0;
    let volumePower = 1.0;
    if (volume > 0) {
      if (volume > 30) volumePower += 0.5;
      if (volume > 100) volumePower += 0.7;
      if (volume > 300) volumePower += 1.0;
    }

    // 우상향/우하향 가중
  let trendPower = 0;
  if (uptrend.includes(name)) trendPower += 0.02;
  if (downtrend.includes(name)) trendPower -= 0.025;
  trendPower *= (0.8 + Math.random() * 0.4);
  if (trendPower > 0.04) trendPower = 0.04;
  if (trendPower < -0.05) trendPower = -0.05;

  let delta = (Math.random() * (maxVar-minVar)) + minVar + kImpact + trendPower;
    delta *= timePower;
    delta *= volumePower;

    // 상관관계 쌍 기록(동시 적용)
    for (const [a, b] of CORR_PAIRS) {
      if (name === a || name === b) corrQueue.push([a, b, delta]);
    }

    delta = Math.max(-0.5, Math.min(delta, 0.5));
    const p = Math.max(1, Math.floor(info.price * (1 + delta)));
    info.price = p;
    info.history = info.history || [];
    info.historyT = info.historyT || [];
    info.history.push(p);
    info.historyT.push(new Date().toISOString());
    while (info.history.length > HISTORY_MAX) info.history.shift();
    while (info.historyT.length > HISTORY_MAX) info.historyT.shift();

    // 자동 상장폐지
    if (delistOpt.type === 'profitlow') {
      const h = info.history || [];
      const prev = h.at(-2) ?? h.at(-1) ?? 0;
      const now = h.at(-1) ?? 0;
      const pct = prev ? ((now - prev) / prev * 100) : 0;
      if (now < 300 && pct <= -30) {
        info.delistedAt = new Date().toISOString();
      }
    }
    if (delistOpt.type === 'random' && delistOpt.prob) {
      if (Math.random() * 100 < delistOpt.prob) {
        info.delistedAt = new Date().toISOString();
      }
    }
  }

  // 코인 상관관계(같은 방향 적용)
  for (const [a, b, lastDelta] of corrQueue) {
    if (coins[a] && coins[b]) {
      coins[b].price = Math.max(1, Math.floor(coins[b].price * (1 + (lastDelta || 0))));
      coins[b].history = coins[b].history || [];
      coins[b].historyT = coins[b].historyT || [];
      coins[b].history.push(coins[b].price);
      coins[b].historyT.push(new Date().toISOString());
      while (coins[b].history.length > HISTORY_MAX) coins[b].history.shift();
      while (coins[b].historyT.length > HISTORY_MAX) coins[b].historyT.shift();
    }
  }

  // 자동 신규상장 (20개 미만, 2글자 닉네임 기반)
  const aliveCoins = Object.entries(coins)
    .filter(([name, info]) => !info.delistedAt && name !== '까리코인');
  if (aliveCoins.length < MAX_AUTO_COINS && members) {
    // 1. 한글 닉네임만 수집, 이미 등록된 코인과 중복제외, 2글자 제한X
    const candidateNames = Array.from(
      new Set(
        [...members.values()]
          .filter(m => !m.user.bot)
          .map(m => m.nickname || m.user.username)
          .filter(nick => isKoreanName(nick))        // 한글만 허용
          .filter(nick => !coins[nick + '코인'])     // 이미 등록X
      )
    );

    if (candidateNames.length > 0) {
      // 랜덤 1명 뽑아서 상장
      const newNick = candidateNames[Math.floor(Math.random() * candidateNames.length)];
      const newName = newNick + '코인';

      const now = new Date().toISOString();
      const vopt = coins._volatilityGlobal || null;
      let info = {
        price: Math.floor(800 + Math.random()*700),
        history: [],
        historyT: [],
        listedAt: now,
        delistedAt: null
      };
      if (typeof vopt === "object" && vopt !== null) info.volatility = vopt;
      info.history.push(info.price);
      info.historyT.push(now);
      coins[newName] = info;
      await saveJson(coinsPath, coins);
    }
    // 후보가 1명도 없으면 신규 상장 자체 스킵(신규코인XX, 영문 등 생성X)
  }
  // (이하 저장 및 나머지 코드 동일)
  await saveJson(coinsPath, coins);
}

// ================== 메인 명령어 ==================

module.exports = {
  data: new SlashCommandBuilder()
    .setName('갓비트')
    .setDescription('가상 코인 시스템 통합 명령어')
    .addSubcommand(sub =>
      sub.setName('코인차트')
        .setDescription('시장 전체 또는 특정 코인 차트')
        .addStringOption(opt => opt.setName('코인').setDescription('코인명(선택)').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('히스토리')
        .setDescription('코인 가격 이력(페이지) 조회')
        .addStringOption(opt => opt.setName('코인').setDescription('코인명').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('매수')
        .setDescription('코인을 매수합니다')
        .addStringOption(opt => opt.setName('코인').setDescription('코인명').setRequired(true))
        .addIntegerOption(opt => opt.setName('수량').setDescription('매수 수량').setMinValue(1).setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('매도')
        .setDescription('코인을 매도합니다')
        .addStringOption(opt => opt.setName('코인').setDescription('코인명').setRequired(true))
        .addIntegerOption(opt => opt.setName('수량').setDescription('매도 수량').setMinValue(1).setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('내코인')
        .setDescription('내 보유 코인/평가액/손익/수익률 조회')
    )
  .addSubcommand(sub =>
  sub.setName('순위')
    .setDescription('코인 실현 수익/자산 TOP20 순위')
),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // 1. 코인차트(정렬/표시/새로고침)
    if (sub === '코인차트') {
      await interaction.deferReply({ ephemeral: true });
      const search = (interaction.options.getString('코인')||'').trim();
      const coins = await loadJson(coinsPath, {});
      await ensureBaseCoin(coins);
      const wallets = await loadJson(walletsPath, {});
      let allAlive = Object.entries(coins)
        .filter(([name, info]) => !name.startsWith('_') && !info.delistedAt);

      if (search) {
        allAlive = allAlive.filter(([name]) => name.toLowerCase().includes(search.toLowerCase()));
        if (!allAlive.length) {
          return interaction.editReply({ content: `❌ [${search}] 코인 없음!` });
        }
      }

      // 코인 가격 내림차순 정렬
      const chartRange = 12;
allAlive = allAlive.map(([name, info]) => {
  const h = info.history || [];
  const prev = h.at(-2) ?? h.at(-1) ?? 0;
  const now = h.at(-1) ?? 0;
  const change = now - prev;
  const pct = prev ? (change / prev) * 100 : 0;
  return { name, info, now, prev, change, pct };
})
.sort((a, b) => b.now - a.now);

      const totalPages = Math.ceil(allAlive.length / PAGE_SIZE);

      let page = 0;

      async function renderChartPage(pageIdx = 0) {
        const userBE = getBE(interaction.user.id);
        const slice = allAlive.slice(pageIdx * PAGE_SIZE, (pageIdx + 1) * PAGE_SIZE);

        // 차트(위)
        const datasets = slice.map((item, i) => ({
          label: item.name,
          data: (item.info.history||[]).slice(-chartRange),
          borderColor: COLORS[i % COLORS.length],
          fill: false
        }));
        const labels = Array.from({ length: chartRange }, (_,i) => i+1);
        const chartConfig = {
  backgroundColor: "white", 
  type: 'line',
  data: { labels, datasets },
  options: {
    plugins: { legend: { display: false } },
    scales: {
      x: { title: { display: true, text: '시간(5분 단위)' } },
      y: { title: { display: true, text: '가격 (BE)' } }
    }
  }
};
        const chartEmbed = new EmbedBuilder()
          .setTitle(`📊 코인 가격 차트 (1시간)${search ? ` - [${search}]` : ''}`)
          .setImage(`https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}&backgroundColor=white`)
          .setColor('#FFFFFF')
          .setTimestamp(); // <- 시간 기재

        // 시장 현황(아래)
        const listEmbed = new EmbedBuilder()
          .setTitle(`📈 갓비트 시장 현황${search ? ` - [${search}]` : ''} (페이지 ${pageIdx+1}/${totalPages})`)
          .setDescription(`💳 내 BE: ${userBE.toLocaleString()} BE\n\n**코인 가격 내림차순 정렬**`)
          .setColor('#FFFFFF');
          // 시간 기재 X

        slice.forEach((item, i) => {
          const emoji = EMOJIS[i % EMOJIS.length];
          const arrowColor = item.change > 0 ? '🔺' : item.change < 0 ? '🔻' : '⏺';
          const maxBuy = Math.floor(userBE / (item.now||1));
          listEmbed.addFields({
            name: `${emoji} ${item.name}`,
            value: `${item.now.toLocaleString()} BE ${arrowColor} (${item.change>=0?'+':''}${item.pct.toFixed(2)}%)\n🛒 최대 매수: ${maxBuy}개`,
            inline: false
          });
        });

        // 임베드 하단 - 매수/매도 커맨드 안내만(시간 X)
        listEmbed.setFooter({
          text: '/갓비트 매수 │ /갓비트 매도│ /갓비트 내코인 │ /갓비트 히스토리'
        });

        // 버튼(새로고침)
        const navRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('first').setLabel('🏠 처음').setStyle(ButtonStyle.Secondary).setDisabled(pageIdx===0),
          new ButtonBuilder().setCustomId('prev').setLabel('◀️ 이전').setStyle(ButtonStyle.Primary).setDisabled(pageIdx===0),
          new ButtonBuilder().setCustomId('refresh').setLabel('🔄 새로고침').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('next').setLabel('▶️ 다음').setStyle(ButtonStyle.Primary).setDisabled(pageIdx===totalPages-1),
          new ButtonBuilder().setCustomId('last').setLabel('🏁 끝').setStyle(ButtonStyle.Secondary).setDisabled(pageIdx===totalPages-1)
        );

        await interaction.editReply({
          embeds: [chartEmbed, listEmbed],
          components: [navRow]
        });
      }

      await renderChartPage(0);
      const msg = await interaction.fetchReply();
      const collector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 600_000,
        filter: btn => btn.user.id === interaction.user.id
      });

      collector.on('collect', async btn => {
        await btn.deferUpdate();
        if (btn.customId === 'first') page = 0;
        else if (btn.customId === 'prev' && page > 0) page -= 1;
        else if (btn.customId === 'next' && page < totalPages-1) page += 1;
        else if (btn.customId === 'last') page = totalPages-1;
        await renderChartPage(page);
      });

      collector.on('end', async () => {
        try { await interaction.editReply({ components: [] }); } catch {}
      });

      return;
    }

    // 2. 히스토리(버튼)
    if (sub === '히스토리') {
      await interaction.deferReply({ ephemeral: true });
      const coin = interaction.options.getString('코인');
      const coins = await loadJson(coinsPath, {});
      const info = coins[coin];
      if (!info) return interaction.editReply({ content: `❌ [${coin}] 상장 정보가 없는 코인입니다.` });

      let isDelisted = !!info.delistedAt;
      let delistMsg = '';
      if (isDelisted) {
        const allList = Object.entries(coins)
          .filter(([name]) => name === coin)
          .map(([_,i]) => i)
          .sort((a,b) => (a.listedAt||'').localeCompare(b.listedAt||''));
        if (info.listedAt && allList.length >= 2) {
          const last = allList[allList.length-1];
          if (last === info) isDelisted = true;
          else isDelisted = false;
        }
        if (isDelisted) {
          delistMsg = `⚠️ ${toKSTString(info.delistedAt)}에 상장폐지된 코인입니다.`;
        }
      }
      const h = (info.history || []).slice(-HISTORY_MAX).reverse();
      const ht = (info.historyT || []).slice(-HISTORY_MAX).reverse();
      if (!h.length) {
        return interaction.editReply({ content: `📉 [${coin}] 가격 이력 데이터 없음${delistMsg ? `\n${delistMsg}` : ''}` });
      }

      const totalPages = Math.ceil(h.length / HISTORY_PAGE);
      let page = 0;

      async function renderHistoryPage(pageIdx = 0) {
        const start = pageIdx * HISTORY_PAGE;
        const end = start + HISTORY_PAGE;
        const list = h.slice(start, end);
        const timeList = ht.slice(start, end);

        const lines = list.map((p, idx) => {
          if (p == null) return `${start+idx+1}. (데이터없음)`;
          const prev = list[idx+1] ?? null;
          let diff = 0;
          if (prev != null) diff = p - prev;
          let emoji = '⏸️';
          if (diff > 0) emoji = '🔺';
          else if (diff < 0) emoji = '🔻';
          return `${start+idx+1}. ${emoji} ${p.toLocaleString()} BE  |  ${toKSTString(timeList[idx])}`;
        });

        const embed = new EmbedBuilder()
          .setTitle(`🕘 ${coin} 가격 이력 (페이지 ${pageIdx+1}/${totalPages})`)
          .setDescription(lines.length ? lines.join('\n') : '데이터 없음')
          .addFields(
            { name: '상장일', value: info.listedAt ? toKSTString(info.listedAt) : '-', inline: true },
            { name: '폐지일', value: info.delistedAt ? toKSTString(info.delistedAt) : '-', inline: true }
          )
          .setColor(isDelisted ? '#888888' : '#3498DB')
          .setTimestamp();
        if (delistMsg && isDelisted) embed.setFooter({ text: delistMsg });

        const navRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('first').setLabel('🏠 처음').setStyle(ButtonStyle.Secondary).setDisabled(pageIdx===0),
          new ButtonBuilder().setCustomId('prev').setLabel('◀️ 이전').setStyle(ButtonStyle.Primary).setDisabled(pageIdx===0),
          new ButtonBuilder().setCustomId('next').setLabel('▶️ 다음').setStyle(ButtonStyle.Primary).setDisabled(pageIdx===totalPages-1),
          new ButtonBuilder().setCustomId('last').setLabel('🏁 끝').setStyle(ButtonStyle.Secondary).setDisabled(pageIdx===totalPages-1)
        );
        await interaction.editReply({ embeds: [embed], components: [navRow] });
      }

      await renderHistoryPage(0);
      const msg = await interaction.fetchReply();
      const collector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 600_000,
        filter: btn => btn.user.id === interaction.user.id
      });

      collector.on('collect', async btn => {
        await btn.deferUpdate();
        if (btn.customId === 'first') page = 0;
        else if (btn.customId === 'prev' && page > 0) page -= 1;
        else if (btn.customId === 'next' && page < totalPages-1) page += 1;
        else if (btn.customId === 'last') page = totalPages-1;
        await renderHistoryPage(page);
      });

      collector.on('end', async () => {
        try { await interaction.editReply({ components: [] }); } catch {}
      });

      return;
    }

    // 3. 매수
    if (sub === '매수') {
      await interaction.deferReply({ ephemeral: true });
      const coin = interaction.options.getString('코인');
      const amount = interaction.options.getInteger('수량');
      const coins = await loadJson(coinsPath, {});
      const wallets = await loadJson(walletsPath, {});
      if (!coins[coin] || coins[coin].delistedAt) return interaction.editReply({ content: `❌ 상장 중인 코인만 매수 가능: ${coin}` });
      if (!Number.isFinite(amount) || amount <= 0) return interaction.editReply({ content: `❌ 올바른 수량을 입력하세요.` });

      const price = coins[coin].price;
      const total = price * amount;
      const fee = Math.floor(total * 0.3);
      const needBE = total + fee;
      const bal = getBE(interaction.user.id);
      if (bal < needBE) return interaction.editReply({ content: `❌ BE 부족: 필요 ${needBE}` });

      wallets[interaction.user.id] = wallets[interaction.user.id] || {};
      wallets[interaction.user.id][coin] = (wallets[interaction.user.id][coin] || 0) + amount;
      // ⭐ 누적 매수액 기록
      wallets[interaction.user.id + "_buys"] = wallets[interaction.user.id + "_buys"] || {};
      wallets[interaction.user.id + "_buys"][coin] = (wallets[interaction.user.id + "_buys"][coin] || 0) + (price * amount);

      await addBE(interaction.user.id, -needBE, `매수 ${amount} ${coin} (수수료 ${fee} BE 포함)`);
      await saveJson(walletsPath, wallets);

      // 히스토리/타임 추가
      await addHistory(coins[coin], price);
      await saveJson(coinsPath, coins);

      // 거래량 기록!
      recordVolume(coin, amount);

      return interaction.editReply({ content: `✅ ${coin} ${amount}개 매수 완료! (수수료 ${fee} BE)` });
    }

    // 4. 매도
if (sub === '매도') {
  await interaction.deferReply({ ephemeral: true });
  const coin = interaction.options.getString('코인');
  const amount = interaction.options.getInteger('수량');
  const coins = await loadJson(coinsPath, {});
  const wallets = await loadJson(walletsPath, {});
  if (!coins[coin] || coins[coin].delistedAt) return interaction.editReply({ content: `❌ 상장 중인 코인만 매도 가능: ${coin}` });
  if (!Number.isFinite(amount) || amount <= 0) return interaction.editReply({ content: `❌ 올바른 수량을 입력하세요.` });

  const have = wallets[interaction.user.id]?.[coin] || 0;
  if (have < amount) return interaction.editReply({ content: `❌ 보유 부족: ${have}` });
  const gross = coins[coin].price * amount;
  const fee = Math.floor(gross * ((loadConfig?.() || {}).fee || 0) / 100);
  const net = gross - fee;
  wallets[interaction.user.id][coin] -= amount;
  if (wallets[interaction.user.id][coin] <= 0) delete wallets[interaction.user.id][coin];
  await addBE(interaction.user.id, net, `매도 ${amount} ${coin}`);
  // ⭐ 실현수익 기록
  wallets[interaction.user.id + "_realized"] = wallets[interaction.user.id + "_realized"] || {};
  wallets[interaction.user.id + "_realized"][coin] = (wallets[interaction.user.id + "_realized"][coin] || 0) + net;
  await saveJson(walletsPath, wallets);

  // 히스토리/타임 추가
  await addHistory(coins[coin], coins[coin].price);
  await saveJson(coinsPath, coins);

  // 거래량 기록!
  recordVolume(coin, amount);

  return interaction.editReply({ content: `✅ ${coin} ${amount}개 매도 완료! (수수료 ${fee} BE)` });
}

    // 5. 내코인 (누적매수, 평가손익, 수익률)
    if (sub === '내코인') {
      await interaction.deferReply({ ephemeral: true });
      const coins = await loadJson(coinsPath, {});
      const wallets = await loadJson(walletsPath, {});
      const userW = wallets[interaction.user.id] || {};
      const userBuys = wallets[interaction.user.id + "_buys"] || {};
      let totalEval = 0, totalBuy = 0, totalProfit = 0;

      const e = new EmbedBuilder()
        .setTitle('💼 내 코인 평가/수익 현황')
        .setColor('#2ecc71')
        .setTimestamp();

      if (!Object.keys(userW).length) {
        e.setDescription('보유 코인이 없습니다.');
      } else {
        let detailLines = [];
        for (const [c, q] of Object.entries(userW)) {
          if (!coins[c] || coins[c].delistedAt) continue;
          const nowPrice = coins[c]?.price || 0;
          const buyCost = userBuys[c] || 0;
          const evalPrice = nowPrice * q;
          const profit = evalPrice - buyCost;
          const yieldPct = buyCost > 0 ? ((profit / buyCost) * 100) : 0;
          totalEval += evalPrice;
          totalBuy += buyCost;
          totalProfit += profit;
          detailLines.push(
            `**${c}**
• 보유: ${q}개
• 누적매수: ${buyCost.toLocaleString()} BE
• 평가액: ${evalPrice.toLocaleString()} BE
• 손익: ${profit>=0?`+${profit.toLocaleString()}`:profit.toLocaleString()} BE (${yieldPct>=0?'+':''}${yieldPct.toFixed(2)}%)`
          );
        }
        const totalYield = totalBuy > 0 ? ((totalProfit/totalBuy)*100) : 0;
        e.setDescription(detailLines.join('\n\n'));
        e.addFields(
          { name: '총 매수', value: `${totalBuy.toLocaleString()} BE`, inline: true },
          { name: '총 평가', value: `${totalEval.toLocaleString()} BE`, inline: true },
          { name: '평가 손익', value: `${totalProfit>=0?`+${totalProfit.toLocaleString()}`:totalProfit.toLocaleString()} BE (${totalYield>=0?'+':''}${totalYield.toFixed(2)}%)`, inline: true }
        );
      }
      return interaction.editReply({ embeds: [e] });
    }

    // 6. 순위
if (sub === '순위') {
  await interaction.deferReply({ ephemeral: true });

  const coins = await loadJson(coinsPath, {});
  const wallets = await loadJson(walletsPath, {});

  // 1. 실현수익 TOP 20 (매도 수익)
  let realized = {};
  for (const uid in wallets) {
    if (!uid.endsWith("_realized")) continue;
    const sum = Object.values(wallets[uid] || {}).reduce((a, b) => a + b, 0);
    realized[uid.replace("_realized", "")] = sum;
  }
  const realizedRank = Object.entries(realized)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  // 2. 평가자산 TOP 20 (보유 평가액)
  let userHoldings = {};
  for (const uid in wallets) {
    if (uid.endsWith("_buys") || uid.endsWith("_realized")) continue;
    const userW = wallets[uid] || {};
    let evalSum = 0;
    for (const [coin, q] of Object.entries(userW)) {
      if (!coins[coin] || coins[coin].delistedAt) continue;
      evalSum += (coins[coin]?.price || 0) * q;
    }
    userHoldings[uid] = evalSum;
  }
  const holdingsRank = Object.entries(userHoldings)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  // 1페이지: 실현수익 TOP 20
  const realizedEmbed = new EmbedBuilder()
    .setTitle('💰 실현 수익(매도 차익) TOP 20')
    .setColor('#ffcc00')
    .setDescription(
      realizedRank.length
        ? realizedRank.map(([uid, val], i) =>
            `**${i+1}. <@${uid}>**  \`${val.toLocaleString()} 파랑 정수\``).join('\n')
        : '데이터 없음'
    )
    .setFooter({ text: '실현수익: 코인 매도를 통한 누적 손익 합산' });

  // 2페이지: 자산 TOP 20
  const holdingsEmbed = new EmbedBuilder()
    .setTitle('🏦 코인 평가자산 TOP 20')
    .setColor('#33ccff')
    .setDescription(
      holdingsRank.length
        ? holdingsRank.map(([uid, val], i) =>
            `**${i+1}. <@${uid}>**  \`${val.toLocaleString()} 파랑 정수\``).join('\n')
        : '데이터 없음'
    )
    .setFooter({ text: '자산평가: 현재 보유 코인의 시세 기준 합산' });

  let page = 0;
  const pages = [realizedEmbed, holdingsEmbed];

  const navRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('rank_prev').setLabel('◀️ 이전').setStyle(ButtonStyle.Primary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId('rank_next').setLabel('▶️ 다음').setStyle(ButtonStyle.Primary).setDisabled(page === pages.length-1)
  );

  await interaction.editReply({ embeds: [pages[page]], components: [navRow] });
  const msg = await interaction.fetchReply();
  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 600_000,
    filter: btn => btn.user.id === interaction.user.id
  });

  collector.on('collect', async btn => {
    await btn.deferUpdate();
    if (btn.customId === 'rank_prev' && page > 0) page -= 1;
    else if (btn.customId === 'rank_next' && page < pages.length-1) page += 1;
    navRow.components[0].setDisabled(page === 0);
    navRow.components[1].setDisabled(page === pages.length-1);
    await interaction.editReply({ embeds: [pages[page]], components: [navRow] });
  });

  collector.on('end', async () => {
    try { await interaction.editReply({ components: [] }); } catch {}
  });
  return;
  }
 },
  autoMarketUpdate
};
