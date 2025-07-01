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
const HISTORY_MAX = 100;  // 히스토리 최대 100개
const COLORS      = ['red','blue','green','orange','purple','cyan','magenta','brown','gray','teal'];
const EMOJIS      = ['🟥','🟦','🟩','🟧','🟪','🟨','🟫','⬜','⚫','🟣'];

// KST 변환
function toKSTString(utcOrDate) {
  const d = new Date(utcOrDate);
  d.setHours(d.getHours() + 9);
  return d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
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
    coins['까리코인'] = {
      price: 1000,
      history: [1000],
      historyT: [new Date().toISOString()],
      listedAt: new Date().toISOString()
    };
  }
}
// 히스토리 추가: 가격+타임
async function addHistory(info, price) {
  if (!info.history) info.history = [];
  if (!info.historyT) info.historyT = [];
  info.history.push(price);
  info.historyT.push(new Date().toISOString());
  // 100개 제한
  while (info.history.length > HISTORY_MAX) info.history.shift();
  while (info.historyT.length > HISTORY_MAX) info.historyT.shift();
}
function safeHistoryPair(info, from, to) {
  const h = info.history || [];
  const ht = info.historyT || [];
  const len = h.length;
  if (!ht.length) {
    info.historyT = h.map((_,i) =>
      info.listedAt
        ? new Date(new Date(info.listedAt).getTime() + 1000*60*5*i).toISOString()
        : new Date(Date.now() - 1000*60*5*(h.length-i-1)).toISOString()
    );
    return safeHistoryPair(info, from, to);
  }
  return {
    h: h.slice(from, to),
    ht: ht.slice(from, to)
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('갓비트')
    .setDescription('가상 코인 시스템 통합 명령어')
    // 1. 코인차트(검색+버튼)
    .addSubcommand(sub =>
      sub.setName('코인차트')
        .setDescription('시장 전체 또는 특정 코인 차트')
        .addStringOption(opt => opt.setName('코인').setDescription('코인명(선택)').setRequired(false))
    )
    // 2. 히스토리(버튼)
    .addSubcommand(sub =>
      sub.setName('히스토리')
        .setDescription('코인 가격 이력(페이지) 조회')
        .addStringOption(opt => opt.setName('코인').setDescription('코인명').setRequired(true))
    )
    // 3. 매수
    .addSubcommand(sub =>
      sub.setName('매수')
        .setDescription('코인을 매수합니다')
        .addStringOption(opt => opt.setName('코인').setDescription('코인명').setRequired(true))
        .addIntegerOption(opt => opt.setName('수량').setDescription('매수 수량').setMinValue(1).setRequired(true))
    )
    // 4. 매도
    .addSubcommand(sub =>
      sub.setName('매도')
        .setDescription('코인을 매도합니다')
        .addStringOption(opt => opt.setName('코인').setDescription('코인명').setRequired(true))
        .addIntegerOption(opt => opt.setName('수량').setDescription('매도 수량').setMinValue(1).setRequired(true))
    )
    // 5. 내코인
    .addSubcommand(sub =>
      sub.setName('내코인')
        .setDescription('내 보유 코인/평가액 조회')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // 1. 코인차트(검색+버튼)
    if (sub === '코인차트') {
      await interaction.deferReply({ ephemeral: true });
      const search = (interaction.options.getString('코인')||'').trim();
      const coins = await loadJson(coinsPath, {});
      await ensureBaseCoin(coins);
      const wallets = await loadJson(walletsPath, {});
      let allAlive = Object.entries(coins).filter(([_,info]) => !info.delistedAt);
      if (search) {
        // 부분 일치 검색
        allAlive = allAlive.filter(([name]) => name.toLowerCase().includes(search.toLowerCase()));
        if (!allAlive.length) {
          return interaction.editReply({ content: `❌ [${search}] 코인 없음!` });
        }
      }
      const totalPages = Math.ceil(allAlive.length / PAGE_SIZE);

      let page = 0;
      const chartRange = 12; // 1시간

      async function renderChartPage(pageIdx = 0) {
        const userBE = getBE(interaction.user.id);
        const slice = allAlive.slice(pageIdx * PAGE_SIZE, (pageIdx + 1) * PAGE_SIZE);

        const listEmbed = new EmbedBuilder()
          .setTitle(`📈 갓비트 시장 현황${search ? ` - [${search}]` : ''} (페이지 ${pageIdx+1}/${totalPages})`)
          .setDescription(`💳 내 BE: ${userBE.toLocaleString()} BE`)
          .setColor('#FFFFFF')
          .setTimestamp();

        slice.forEach(([n,info], i) => {
          const price = info.price ?? 0;
          const emoji = EMOJIS[i % EMOJIS.length];
          const maxBuy = Math.floor(userBE / price);
          listEmbed.addFields({
            name: `${emoji} ${n}`,
            value: [
              `${price.toLocaleString()} BE`,
              `🛒 최대 매수: ${maxBuy}개`
            ].join('\n'),
            inline: false
          });
        });

       // 차트(각 코인 히스토리)
const chartRange = 12;
const histories = slice.map(([,info]) => (info.history||[]).slice(-chartRange));
const maxLen = Math.max(...histories.map(h => h.length));
const labels = Array.from({ length: maxLen }, (_,i) => i+1);

const datasets = slice.map(([n,info], i) => ({
  label: n,
  data: (info.history||[]).slice(-chartRange),
  borderColor: COLORS[i % COLORS.length],
  fill: false
}));

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





        // 버튼
        const navRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('first').setLabel('🏠 처음').setStyle(ButtonStyle.Secondary).setDisabled(pageIdx===0),
          new ButtonBuilder().setCustomId('prev').setLabel('◀️ 이전').setStyle(ButtonStyle.Primary).setDisabled(pageIdx===0),
          new ButtonBuilder().setCustomId('next').setLabel('▶️ 다음').setStyle(ButtonStyle.Primary).setDisabled(pageIdx===totalPages-1),
          new ButtonBuilder().setCustomId('last').setLabel('🏁 끝').setStyle(ButtonStyle.Secondary).setDisabled(pageIdx===totalPages-1)
        );

        await interaction.editReply({
          embeds: [listEmbed, chartEmbed],
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
      // --- 상장 정보 체크 ---
      if (!info) return interaction.editReply({ content: `❌ [${coin}] 상장 정보가 없는 코인입니다.` });

      // 폐지/상장여부 판정
      let isDelisted = !!info.delistedAt;
      let delistMsg = '';
      if (isDelisted) {
        // 폐지 후 재상장 이력 체크
        const allList = Object.entries(coins)
          .filter(([name]) => name === coin)
          .map(([_,i]) => i)
          .sort((a,b) => (a.listedAt||'').localeCompare(b.listedAt||''));
        // 현재 info가 가장 최근인지 확인
        if (info.listedAt && allList.length >= 2) {
          const last = allList[allList.length-1];
          if (last === info) isDelisted = true;
          else isDelisted = false;
        }
        if (isDelisted) {
          delistMsg = `⚠️ ${toKSTString(info.delistedAt)}에 상장폐지된 코인입니다.`;
        }
      }

      // 히스토리 100개까지만 지원
      const h = (info.history || []).slice(-HISTORY_MAX);
      const ht = (info.historyT || []).slice(-HISTORY_MAX);
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
        const lines = list.map((p, idx) =>
          p == null
            ? `${start+idx+1}. (데이터없음)`
            : `${start+idx+1}. ${p.toLocaleString()} BE  |  ${toKSTString(timeList[idx])}`
        );
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

    // 5. 내코인
    if (sub === '내코인') {
      await interaction.deferReply({ ephemeral: true });
      const coins = await loadJson(coinsPath, {});
      const wallets = await loadJson(walletsPath, {});
      const userW = wallets[interaction.user.id] || {};
      const e = new EmbedBuilder().setTitle('💼 내 코인').setColor('#00CC99').setTimestamp();
      let total = 0;
      if (!Object.keys(userW).length) {
        e.setDescription('보유 코인이 없습니다.');
      } else {
        for (const [c, q] of Object.entries(userW)) {
          if (!coins[c] || coins[c].delistedAt) continue;
          const v = (coins[c]?.price || 0) * q;
          total += v;
          e.addFields({ name: c, value: `수량: ${q}개\n평가액: ${v.toLocaleString()} BE\n🔽 최대 매도: ${q}개` });
        }
        e.addFields({ name: '총 평가액', value: `${total.toLocaleString()} BE` });
      }
      return interaction.editReply({ embeds: [e] });
    }
  }
};
