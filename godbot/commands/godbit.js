// 📁 commands/godbit.js
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ComponentType
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const lockfile = require('proper-lockfile');
const { addBE, getBE, loadConfig } = require('./be-util.js');

const coinsPath   = path.join(__dirname, '../data/coins.json');
const walletsPath = path.join(__dirname, '../data/godbit-wallets.json');
const MAX_COINS   = 10;
const COLORS      = ['red','blue','green','orange','purple','cyan','magenta','brown','gray','teal'];

// JSON utils
async function loadJson(file, def) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(def, null, 2));
  const release = await lockfile.lock(file, { retries: 5, minTimeout: 50 });
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  await release();
  return data;
}
async function saveJson(file, data) {
  const release = await lockfile.lock(file, { retries: 5, minTimeout: 50 });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  await release();
}

// Ensure base coin
async function ensureBaseCoin(coins) {
  if (!coins['까리코인']) {
    coins['까리코인'] = {
      price: 1000,
      history: [1000],
      listedAt: new Date().toISOString()
    };
  }
}

// Market simulation with correlation
async function simulateMarket(interaction, coins) {
  // base coin first
  const base = coins['까리코인'];
  const deltaBase = (Math.random() * 0.2) - 0.1;
  const newBase = Math.max(1, Math.floor(base.price * (1 + deltaBase)));
  base.price = newBase;
  base.history.push(newBase);

  // other coins
  for (const [name, info] of Object.entries(coins)) {
    if (name === '까리코인') continue;
    // random ±10% + base correlation
    let delta = (Math.random() * 0.2) - 0.1 + deltaBase * 0.5;
    // clamp to ±20%
    delta = Math.max(-0.2, Math.min(delta, 0.2));
    const p = Math.max(1, Math.floor(info.price * (1 + delta)));
    info.price = p;
    info.history.push(p);
  }

  // 신규 상장 (5%)
  if (Math.random() < 0.05) {
    const mems = interaction.guild.members.cache.filter(m => /^[가-힣]{2}$/.test(m.displayName));
    if (mems.size) {
      const pick = Array.from(mems.values())[Math.floor(Math.random() * mems.size)];
      const name = `${pick.displayName}코인`;
      if (!coins[name]) {
        coins[name] = {
          price: Math.floor(Math.random() * 900) + 100,
          history: [coins['까리코인'].price],
          listedAt: new Date().toISOString()
        };
      }
    }
  }
  // 폐지 (2%)
  if (Math.random() < 0.02) {
    const others = Object.keys(coins).filter(n => n !== '까리코인');
    if (others.length) {
      const del = others[Math.floor(Math.random() * others.length)];
      coins[del].delistedAt = new Date().toISOString();
      // 기록은 보존
    }
  }
  // 최대 개수 유지
  while (Object.keys(coins).length > MAX_COINS) {
    const others = Object.keys(coins).filter(n => n !== '까리코인');
    if (!others.length) break;
    delete coins[others[Math.floor(Math.random() * others.length)]];
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('갓비트')
    .setDescription('가상 코인 거래 시스템')
    .addSubcommand(sub =>
      sub.setName('코인차트')
         .setDescription('모든 코인 현황 + 통합 차트')
    ),

  async execute(interaction) {
    await interaction.deferReply();
    const coins   = await loadJson(coinsPath, {});
    const wallets = await loadJson(walletsPath, {});
    await ensureBaseCoin(coins);

    // 메인 렌더
    async function renderMain() {
      await simulateMarket(interaction, coins);
      await saveJson(coinsPath, coins);

      const change = {};
      for (const [n, info] of Object.entries(coins)) {
        const h = info.history;
        const last = h[h.length - 1], prev = h[h.length - 2] || last;
        const diff = last - prev;
        const pct  = prev ? (diff / prev * 100) : 0;
        change[n] = { price: last, diff, pct };
      }

      const listEmbed = new EmbedBuilder()
        .setTitle('📈 갓비트 시장 현황')
        .setColor('#FFFFFF')
        .setTimestamp();
      for (const [n, { price, diff, pct }] of Object.entries(change)) {
        const arrow = diff >= 0 ? '🔺' : '🔽';
        listEmbed.addFields({
          name: `**${n}**`,
          value: `${price.toLocaleString()} BE ${arrow}${Math.abs(diff).toLocaleString()} (${diff >= 0 ? '+' : ''}${pct.toFixed(2)}%)`,
          inline: true
        });
      }

      const histories = Object.values(coins).map(c => c.history);
      const maxLen = Math.max(...histories.map(h => h.length));
      const labels = Array.from({ length: maxLen }, (_, i) => i + 1);
      const datasets = Object.entries(coins).map(([n, info], i) => ({
        label: n,
        data: Array(maxLen - info.history.length).fill(null).concat(info.history),
        borderColor: COLORS[i % COLORS.length],
        fill: false
      }));
      const chartConfig = {
        type: 'line',
        data: { labels, datasets },
        options: {
          plugins: {
            legend: {
              position: 'bottom',
              labels: { color: 'black' }
            }
          },
          scales: {
            x: { title: { display: true, text: '시간(스텝)' } },
            y: { title: { display: true, text: '가격 (BE)' } }
          }
        }
      };
      const chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}`;
      const chartEmbed = new EmbedBuilder()
        .setTitle('📊 통합 코인 가격 차트')
        .setImage(chartUrl)
        .setColor('#FFFFFF')
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('godbit_buy').setLabel('매수').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('godbit_sell').setLabel('매도').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('godbit_portfolio').setLabel('내 코인').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('godbit_history').setLabel('코인 히스토리').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('godbit_refresh').setLabel('새로고침').setStyle(ButtonStyle.Secondary)
      );

      await interaction.editReply({ embeds: [listEmbed, chartEmbed], components: [row] });
    }

    await renderMain();

    const msg = await interaction.fetchReply();
    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 120_000,
      filter: i => i.user.id === interaction.user.id
    });

    collector.on('collect', async i => {
      if (i.customId === 'godbit_refresh') {
        await renderMain();
        return i.deferUpdate();
      }
      if (i.customId === 'godbit_buy') {
        const modal = new ModalBuilder().setCustomId('godbit_buy_modal').setTitle('코인 매수');
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('coin').setLabel('코인 이름').setStyle(TextInputStyle.Short).setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('amount').setLabel('수량').setStyle(TextInputStyle.Short).setRequired(true)
          )
        );
        return i.showModal(modal);
      }
      if (i.customId === 'godbit_sell') {
        const modal = new ModalBuilder().setCustomId('godbit_sell_modal').setTitle('코인 매도');
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('coin').setLabel('코인 이름').setStyle(TextInputStyle.Short).setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('amount').setLabel('수량').setStyle(TextInputStyle.Short).setRequired(true)
          )
        );
        return i.showModal(modal);
      }
      if (i.customId === 'godbit_portfolio') {
        const userW = wallets[i.user.id] || {};
        const e = new EmbedBuilder().setTitle('💼 내 코인').setColor('#00CC99');
        let total = 0;
        if (!Object.keys(userW).length) {
          e.setDescription('보유 코인이 없습니다.');
        } else {
          for (const [c, q] of Object.entries(userW)) {
            const v = (coins[c]?.price || 0) * q;
            total += v;
            e.addFields({ name: c, value: `수량: ${q}\n평가액: ${v.toLocaleString()} BE` });
          }
          e.addFields({ name: '총 평가액', value: `${total.toLocaleString()} BE` });
        }
        return i.reply({ embeds: [e], ephemeral: true });
      }
      if (i.customId === 'godbit_history') {
        const e = new EmbedBuilder().setTitle('🕘 코인 히스토리').setColor('#3498DB');
        for (const [n, info] of Object.entries(coins)) {
          const listed = info.listedAt ? `상장: ${new Date(info.listedAt).toLocaleString()}\n` : '';
          const delisted = info.delistedAt ? `폐지: ${new Date(info.delistedAt).toLocaleString()}\n` : '';
          const hist = info.history.slice(-5).map((p, idx) => `${idx+1}:${p}`).join(', ');
          e.addFields({ name: n, value: `${listed}${delisted}최근 5개 가격: ${hist}` });
        }
        return i.reply({ embeds: [e], ephemeral: true });
      }
    });

    interaction.client.on('interactionCreate', async subI => {
      if (!subI.isModalSubmit()) return;
      const id = subI.customId;
      const coin = subI.fields.getTextInputValue('coin');
      const amount = Number(subI.fields.getTextInputValue('amount'));
      await simulateMarket(subI, coins);
      await saveJson(coinsPath, coins);

      if (id === 'godbit_buy_modal') {
        if (!coins[coin]) return subI.reply({ content: `❌ 코인 없음: ${coin}`, ephemeral: true });
        const cost = coins[coin].price * amount;
        const bal = getBE(subI.user.id);
        if (bal < cost) return subI.reply({ content: `❌ BE 부족: 필요 ${cost}`, ephemeral: true });
        await addBE(subI.user.id, -cost, `매수 ${amount} ${coin}`);
        wallets[subI.user.id] = wallets[subI.user.id] || {};
        wallets[subI.user.id][coin] = (wallets[subI.user.id][coin] || 0) + amount;
        await saveJson(walletsPath, wallets);
        return subI.reply({ content: `✅ ${coin} ${amount}개 매수 완료!`, ephemeral: true });
      }
      if (id === 'godbit_sell_modal') {
        if (!coins[coin]) return subI.reply({ content: `❌ 코인 없음: ${coin}`, ephemeral: true });
        const have = wallets[subI.user.id]?.[coin] || 0;
        if (have < amount) return subI.reply({ content: `❌ 보유 부족: ${have}`, ephemeral: true });
        const gross = coins[coin].price * amount;
        const fee = Math.floor(gross * (loadConfig().fee || 0) / 100);
        const net = gross - fee;
        await addBE(subI.user.id, net, `매도 ${amount} ${coin}`);
        wallets[subI.user.id][coin] -= amount;
        if (wallets[subI.user.id][coin] <= 0) delete wallets[subI.user.id][coin];
        await saveJson(walletsPath, wallets);
        return subI.reply({ content: `✅ ${coin} ${amount}개 매도 완료!`, ephemeral: true });
      }
    });
  }
};
