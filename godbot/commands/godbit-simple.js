// ==== commands/godbit-simple.js ====
// /갓비트 : 셀렉트(주기), 새로고침, 이전/다음(페이지)까지 지원

const {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ComponentType
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const lockfile = require('proper-lockfile');
const { getBE } = require('./be-util.js');

const coinsPath = path.join(__dirname, '../data/godbit-coins.json');
const walletsPath = path.join(__dirname, '../data/godbit-wallets.json');
const EMOJIS = ['🟥','🟦','🟩','🟧','🟪','🟨','🟫','⬜','⚫','🟣','🦋','🦄','🐍','🦜','🦖','🐲','🦩','🐬','🦧','🦢','🦉'];
const PAGE_SIZE = 7;

const CHART_FILTERS = [
  { label: "1분",   value: "1m",   interval: 1 },
  { label: "10분",  value: "10m",  interval: 10 },
  { label: "30분",  value: "30m",  interval: 30 },
  { label: "1시간", value: "1h",   interval: 60 },
  { label: "3시간", value: "3h",   interval: 180 },
  { label: "6시간", value: "6h",   interval: 360 },
  { label: "12시간",value: "12h",  interval: 720 },
  { label: "1일",   value: "1d",   interval: 1440 },
  { label: "3일",   value: "3d",   interval: 4320 },
  { label: "일주일",value: "7d",   interval: 10080 },
];

async function loadJson(file, def) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(def, null, 2));
  const release = await lockfile.lock(file, { retries: 5, minTimeout: 50 });
  let data;
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); }
  finally { await release(); }
  return data;
}
function toKSTString(utcOrDate) {
  if (!utcOrDate) return '-';
  try {
    return new Date(utcOrDate).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  } catch {
    return '-';
  }
}
function getRecentChange(info, intervalMin = 1) {
  const h = info.history || [];
  const ht = info.historyT || [];
  if (h.length < 2) return { change: 0, pct: 0, prev: h[h.length-1] ?? 0, now: h[h.length-1] ?? 0, prevTime: ht[ht.length-1] ?? null };
  let now = h[h.length-1], nowTime = ht[ht.length-1];
  let baseIdx = h.length-2;
  for (let i = h.length-1; i >= 0; i--) {
    if (!ht[i]) continue;
    const minAgo = Math.floor((new Date(nowTime) - new Date(ht[i])) / 60000);
    if (minAgo >= intervalMin) { baseIdx = i; break; }
  }
  let prev = h[baseIdx] ?? now;
  let change = now - prev;
  let pct = prev ? (change / prev) * 100 : 0;
  return { change, pct, prev, now, prevTime: ht[baseIdx] ?? null };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('갓비트')
    .setDescription('간편 전체 코인 현황판')
    .addStringOption(opt =>
      opt.setName('주기')
        .setDescription('시간 필터')
        .setRequired(false)
        .addChoices(...CHART_FILTERS.map(f=>({ name: f.label, value: f.value })))
    ),
  async execute(interaction) {
    let filterValue = interaction.options.getString('주기') || '1h';
    let filterConfig = CHART_FILTERS.find(f=>f.value === filterValue) || CHART_FILTERS[3];
    let page = 0;

    await interaction.deferReply({ ephemeral: true });

    async function render(filterValue, pageIdx) {
      const coins = await loadJson(coinsPath, {});
      const wallets = await loadJson(walletsPath, {});
      let allAlive = Object.entries(coins)
        .filter(([name, info]) => !name.startsWith('_') && !info.delistedAt);

      const userBE = getBE(interaction.user.id);

      const coinList = allAlive.map(([name, info], i) => {
        const { change, pct, prev, now } = getRecentChange(info, filterConfig.interval);
        return { name, now, change, pct, idx: i };
      }).sort((a, b) => b.now - a.now);

      const totalPages = Math.ceil(coinList.length / PAGE_SIZE);
      if (pageIdx < 0) pageIdx = 0;
      if (pageIdx >= totalPages) pageIdx = totalPages-1;

      const slice = coinList.slice(pageIdx*PAGE_SIZE, (pageIdx+1)*PAGE_SIZE);

      const embed = new EmbedBuilder()
        .setTitle(`📈 [갓비트] 전체 시장 현황 (${filterConfig.label})`)
        .setColor('#4EC3F7')
        .setDescription(`💳 내 BE: ${userBE.toLocaleString()} BE\n**코인 가격 내림차순 정렬**\n페이지 ${pageIdx+1}/${totalPages}`)
        .setTimestamp();

      slice.forEach((item, i) => {
        const emoji = EMOJIS[(pageIdx*PAGE_SIZE+i) % EMOJIS.length];
        const arrow = item.change > 0 ? '🔺' : item.change < 0 ? '🔻' : '⏺';
        const maxBuy = Math.floor(userBE / (item.now||1));
        embed.addFields({
          name: `${emoji} ${item.name}`,
          value: `${item.now.toLocaleString()} BE ${arrow} (${item.change>=0?'+':''}${item.pct.toFixed(2)}%)  |  🛒 최대 매수: ${maxBuy}개`,
          inline: false
        });
      });

      const select = new StringSelectMenuBuilder()
        .setCustomId('filter')
        .setPlaceholder('시간 주기 선택')
        .addOptions(CHART_FILTERS.map(f=>({
          label: f.label, value: f.value, default: f.value===filterValue
        })));
      const row1 = new ActionRowBuilder().addComponents(select);

      const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('prev').setLabel('◀️ 이전').setStyle(ButtonStyle.Primary).setDisabled(pageIdx === 0),
        new ButtonBuilder().setCustomId('refresh').setLabel('🔄 새로고침').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('next').setLabel('▶️ 다음').setStyle(ButtonStyle.Primary).setDisabled(pageIdx === totalPages-1)
      );

      await interaction.editReply({
        embeds: [embed],
        components: [row1, navRow]
      });

      return { totalPages, pageIdx };
    }

    let { totalPages } = await render(filterValue, page);

    const msg = await interaction.fetchReply();

    const collector1 = msg.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      time: 600_000,
      filter: i => i.user.id === interaction.user.id
    });

    collector1.on('collect', async sel => {
      filterValue = sel.values[0];
      filterConfig = CHART_FILTERS.find(f=>f.value === filterValue) || filterConfig;
      page = 0;
      await sel.deferUpdate();
      const res = await render(filterValue, page);
      totalPages = res.totalPages;
    });

    const collector2 = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 600_000,
      filter: i => i.user.id === interaction.user.id
    });
    collector2.on('collect', async btn => {
      if (btn.customId === 'refresh') {
        await btn.deferUpdate();
        await render(filterValue, page);
      } else if (btn.customId === 'prev' && page > 0) {
        page -= 1;
        await btn.deferUpdate();
        await render(filterValue, page);
      } else if (btn.customId === 'next' && page < totalPages-1) {
        page += 1;
        await btn.deferUpdate();
        await render(filterValue, page);
      }
    });
  }
};
