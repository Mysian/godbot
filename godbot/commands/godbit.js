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

// KST 변환
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

// ===== ⭐️ 1분마다 시세/폐지/신규상장 자동 갱신! =====
async function autoMarketUpdate(members) {
  const coins = await loadJson(coinsPath, {});
  await ensureBaseCoin(coins);

  // 까리코인
  const base = coins['까리코인'];
  const deltaBase = (Math.random() * 0.2) - 0.1;
  const newBase = Math.max(1, Math.floor(base.price * (1 + deltaBase)));
  base.price = newBase;
  base.history.push(newBase);
  base.historyT = base.historyT || [];
  base.historyT.push(new Date().toISOString());
  while (base.history.length > HISTORY_MAX) base.history.shift();
  while (base.historyT.length > HISTORY_MAX) base.historyT.shift();

  // 상장폐지 옵션 자동 적용
  const delistOpt = coins._delistOption || { type: 'profitlow', prob: 10 };

  // 나머지 코인
  for (const [name, info] of Object.entries(coins)) {
    if (name === '까리코인' || info.delistedAt) continue;

    // 가격 변동성
    let minVar = -0.1, maxVar = 0.1;
    if (info.volatility) { minVar = info.volatility.min; maxVar = info.volatility.max; }
    const kImpact = deltaBase * (0.4 + Math.random()*0.2);
    let delta = (Math.random() * (maxVar-minVar)) + minVar + kImpact;
    delta = Math.max(-0.5, Math.min(delta, 0.5));
    const p = Math.max(1, Math.floor(info.price * (1 + delta)));
    info.price = p;
    info.history = info.history || [];
    info.historyT = info.historyT || [];
    info.history.push(p);
    info.historyT.push(new Date().toISOString());
    while (info.history.length > HISTORY_MAX) info.history.shift();
    while (info.historyT.length > HISTORY_MAX) info.historyT.shift();

    // === 자동 상장폐지 ===
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

  // ⭐️ 자동 신규상장 (20개 미만일 때, 2글자 닉네임 기반)
  const aliveCoins = Object.entries(coins)
    .filter(([name, info]) => !info.delistedAt && name !== '까리코인');
  if (aliveCoins.length < MAX_AUTO_COINS && members) {
    // 2글자 닉네임 추출(중복X, 봇X, 이미 상장된 코인X)
    const nameList = Array.from(
      new Set(
        [...members.values()]
          .filter(m => !m.user.bot)
          .map(m => m.nickname || m.user.username)
          .filter(nick => nick && nick.length === 2)
          .filter(nick => !coins[nick + '코인'])
      )
    );
    let newName;
    if (nameList.length) {
      newName = nameList[Math.floor(Math.random() * nameList.length)] + '코인';
    } else {
      let n = 1;
      do { newName = `신규코인${n++}`; } while (coins[newName]);
    }
    const now = new Date().toISOString();
    const vopt = coins._volatilityGlobal || null;
    let info = {
  price: Math.floor(800 + Math.random()*700),
  history: [],
  historyT: [],
  listedAt: now,
  delistedAt: null
};
// typeof로 안전하게
if (typeof vopt === "object" && vopt !== null) {
  info.volatility = vopt;
}
info.history.push(info.price);
info.historyT.push(now);
coins[newName] = info;

  await saveJson(coinsPath, coins);
}

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
      let allAlive = Object.entries(coins).filter(([_,info]) => !info.delistedAt);

      // 검색 필터
      if (search) {
        allAlive = allAlive.filter(([name]) => name.toLowerCase().includes(search.toLowerCase()));
        if (!allAlive.length) {
          return interaction.editReply({ content: `❌ [${search}] 코인 없음!` });
        }
      }

      // 전일대비 수익률로 내림차순 정렬
      const chartRange = 12;
      allAlive = allAlive.map(([name, info]) => {
        const h = info.history || [];
        const prev = h.at(-2) ?? h.at(-1) ?? 0;
        const now = h.at(-1) ?? 0;
        const change = now - prev;
        const pct = prev ? (change / prev) * 100 : 0;
        return { name, info, now, prev, change, pct };
      })
      .sort((a, b) => b.pct - a.pct);

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
          .setImage(`https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}`)
          .setColor('#FFFFFF')
          .setTimestamp();

        // 시장 현황(아래)
        const listEmbed = new EmbedBuilder()
          .setTitle(`📈 갓비트 시장 현황${search ? ` - [${search}]` : ''} (페이지 ${pageIdx+1}/${totalPages})`)
          .setDescription(`💳 내 BE: ${userBE.toLocaleString()} BE\n\n**수익률 내림차순 정렬**`)
          .setColor('#FFFFFF')
          .setTimestamp();

        slice.forEach((item, i) => {
          const emoji = EMOJIS[i % EMOJIS.length];
          const arrowColor = item.change > 0 ? '🔺' : item.change < 0 ? '🔻' : '⏺';
          const maxBuy = Math.floor(userBE / (item.now||1));
          listEmbed.addFields({
            name: `${emoji} ${item.name}`,
            value: `${item.now.toLocaleString()} BE ${arrowColor} (${item.change>=0?'+':''}${item.pct.toFixed(2)}%)
🛒 최대 매수: ${maxBuy}개`,
            inline: false
          });
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
        // 🔄 새로고침
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
      // 최신순으로 reverse!
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
      await saveJson(walletsPath, wallets);

      // 히스토리/타임 추가
      await addHistory(coins[coin], coins[coin].price);
      await saveJson(coinsPath, coins);

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
  },
  autoMarketUpdate
};
