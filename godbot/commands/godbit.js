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

// 1분마다 가격만 업데이트
async function updatePricesOnly() {
  const coins = await loadJson(coinsPath, {});
  for (const info of Object.values(coins)) {
    const delta = (Math.random() * 0.2) - 0.1;
    const p = Math.max(1, Math.floor(info.price * (1 + delta)));
    info.price = p;
    info.history.push(p);
  }
  await saveJson(coinsPath, coins);
}
setInterval(updatePricesOnly, 60 * 1000);

// JSON utils
async function loadJson(file, def) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(def, null, 2));
  const release = await lockfile.lock(file, { retries: 5, minTimeout: 50, stale: 5000 });
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return data;
  } finally {
    await release();
  }
}

async function saveJson(file, data) {
  const release = await lockfile.lock(file, { retries: 5, minTimeout: 50, stale: 5000 });
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } finally {
    await release();
  }
}

// Ensure base coin exists
function ensureBaseCoin(coins) {
  if (!coins['까리코인']) {
    coins['까리코인'] = {
      price: 1000,
      history: [1000],
      listedAt: new Date().toISOString()
    };
  }
}

// Simulate market movements and listing/delisting
async function simulateMarket(guild, coins) {
  const base = coins['까리코인'];
  const deltaBase = (Math.random() * 0.2) - 0.1;
  const newBase = Math.max(1, Math.floor(base.price * (1 + deltaBase)));
  base.price = newBase;
  base.history.push(newBase);

  for (const [name, info] of Object.entries(coins)) {
    if (name === '까리코인') continue;
    let delta = (Math.random() * 0.2) - 0.1 + deltaBase * 0.3;
    delta = Math.max(-0.2, Math.min(delta, 0.2));
    const p = Math.max(1, Math.floor(info.price * (1 + delta)));
    info.price = p;
    info.history.push(p);
  }

  // 5% 신규 상장
  if (Math.random() < 0.05) {
    const mems = guild.members.cache.filter(m => /^[가-힣]{2}$/.test(m.displayName));
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

  // 2% 폐지
  if (Math.random() < 0.02) {
    const others = Object.keys(coins).filter(n => n !== '까리코인');
    if (others.length) {
      const del = others[Math.floor(Math.random() * others.length)];
      coins[del].delistedAt = new Date().toISOString();
    }
  }

  // enforce max coins
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
      sub
        .setName('코인차트')
        .setDescription('모든 코인 현황 + 통합 차트')
    ),

  async execute(interaction) {
    await interaction.deferReply();

    let coins   = await loadJson(coinsPath, {});
    let wallets = await loadJson(walletsPath, {});
    ensureBaseCoin(coins);

    // Main rendering function
    async function renderMain() {
      await simulateMarket(interaction.guild, coins);
      await saveJson(coinsPath, coins);

      const userBE = getBE(interaction.user.id);
      const change = {};
      for (const [n, info] of Object.entries(coins)) {
        const h = info.history;
        const last = h[h.length - 1];
        const prev = h[h.length - 2] ?? last;
        const diff = last - prev;
        const pct  = prev ? (diff / prev * 100) : 0;
        change[n] = { price: last, diff, pct };
      }

      const listEmbed = new EmbedBuilder()
        .setTitle('📈 갓비트 시장 현황')
        .setDescription(`💳 내 BE: ${userBE.toLocaleString()} BE`)
        .setColor('#FFFFFF')
        .setTimestamp();

      for (const [n, { price, diff, pct }] of Object.entries(change)) {
        const arrow = diff >= 0 ? '🔺' : '🔽';
        const maxBuy = Math.floor(userBE / price);
        listEmbed.addFields({
          name: `**${n}**`,
          value: [
            `${price.toLocaleString()} BE ${arrow}${Math.abs(diff).toLocaleString()} (${diff >= 0 ? '+' : ''}${pct.toFixed(2)}%)`,
            `🛒 최대 매수: ${maxBuy}개`
          ].join('\n'),
          inline: true
        });
      }

      // prepare chart
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
          plugins: { legend: { position: 'bottom', labels: { color: 'black' } } },
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

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('godbit_buy').setLabel('매수').setEmoji('💰').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('godbit_sell').setLabel('매도').setEmoji('💸').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('godbit_portfolio').setLabel('내 코인').setEmoji('📂').setStyle(ButtonStyle.Secondary)
      );
      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('godbit_history').setLabel('코인 히스토리').setEmoji('🕘').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('godbit_refresh').setLabel('새로고침').setEmoji('🔄').setStyle(ButtonStyle.Secondary)
      );

      await interaction.editReply({ embeds: [listEmbed, chartEmbed], components: [row1, row2] });
    }

    await renderMain();

    const msg = await interaction.fetchReply();
    const buttonCollector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 120_000,
      filter: btn => btn.user.id === interaction.user.id
    });

    // Modal handler
    const modalHandler = async subI => {
      if (!subI.isModalSubmit() || subI.user.id !== interaction.user.id) return;

      const id = subI.customId;
      const coinName = subI.fields.getTextInputValue('coin');

      // always simulate and save market before handling
      await simulateMarket(interaction.guild, coins);
      await saveJson(coinsPath, coins);

      if (id === 'godbit_buy_modal' || id === 'godbit_sell_modal') {
        const amount = Number(subI.fields.getTextInputValue('amount'));
        if (!coins[coinName]) {
          return subI.reply({ content: `❌ 코인 없음: ${coinName}`, ephemeral: true });
        }

        if (id === 'godbit_buy_modal') {
          const cost = coins[coinName].price * amount;
          const bal = getBE(subI.user.id);
          if (bal < cost) {
            return subI.reply({ content: `❌ BE 부족: 필요 ${cost}`, ephemeral: true });
          }
          await addBE(subI.user.id, -cost, `매수 ${amount} ${coinName}`);
          wallets[subI.user.id] = wallets[subI.user.id] || {};
          wallets[subI.user.id][coinName] = (wallets[subI.user.id][coinName] || 0) + amount;
          await saveJson(walletsPath, wallets);
          return subI.reply({ content: `✅ ${coinName} ${amount}개 매수 완료!`, ephemeral: true });
        } else {
          const have = wallets[subI.user.id]?.[coinName] || 0;
          if (have < amount) {
            return subI.reply({ content: `❌ 보유 부족: ${have}`, ephemeral: true });
          }
          const gross = coins[coinName].price * amount;
          const config = await loadConfig();
          const fee = Math.floor(gross * ((config.fee || 0) / 100));
          const net = gross - fee;
          await addBE(subI.user.id, net, `매도 ${amount} ${coinName}`);
          wallets[subI.user.id][coinName] -= amount;
          if (wallets[subI.user.id][coinName] <= 0) delete wallets[subI.user.id][coinName];
          await saveJson(walletsPath, wallets);
          return subI.reply({ content: `✅ ${coinName} ${amount}개 매도 완료! (수수료 ${fee} BE)`, ephemeral: true });
        }
      }

      if (id === 'godbit_history_modal') {
        const rawCount = subI.fields.getTextInputValue('count') || '';
        const cnt = Math.min(100, Math.max(1, parseInt(rawCount, 10) || 20));
        if (!coins[coinName]) {
          return subI.reply({ content: `❌ 코인 없음: ${coinName}`, ephemeral: true });
        }
        const info = coins[coinName];
        const h = info.history.slice(-cnt);
        const lines = h.map((p, idx) => {
          const prev = idx > 0 ? h[idx - 1] : h[0];
          const arrow = p >= prev ? '🔺' : '🔽';
          return `${idx + 1}: ${arrow}${p}`;
        });
        const e = new EmbedBuilder()
          .setTitle(`🕘 ${coinName} 최근 ${cnt}개 이력`)
          .setDescription(lines.join('\n'))
          .addFields(
            { name: '상장일', value: info.listedAt ? new Date(info.listedAt).toLocaleString() : 'Unknown', inline: true },
            { name: '폐지일', value: info.delistedAt ? new Date(info.delistedAt).toLocaleString() : '-', inline: true }
          )
          .setColor('#3498DB')
          .setTimestamp();
        return subI.reply({ embeds: [e], ephemeral: true });
      }
    };

    interaction.client.on('interactionCreate', modalHandler);

    // clean up listener when collector ends
    buttonCollector.on('end', () => {
      interaction.client.removeListener('interactionCreate', modalHandler);
    });

    // handle button clicks
    buttonCollector.on('collect', async btn => {
      switch (btn.customId) {
        case 'godbit_refresh':
          await renderMain();
          return btn.deferUpdate();
        case 'godbit_buy':
        case 'godbit_sell': {
          const modalId = btn.customId === 'godbit_buy' ? 'godbit_buy_modal' : 'godbit_sell_modal';
          const title = btn.customId === 'godbit_buy' ? '코인 매수' : '코인 매도';
          const modal = new ModalBuilder().setCustomId(modalId).setTitle(title);
          modal.addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('coin')
                .setLabel('코인 이름')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('amount')
                .setLabel('수량')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            )
          );
          return btn.showModal(modal);
        }
        case 'godbit_portfolio': {
          const userW = wallets[btn.user.id] || {};
          const e = new EmbedBuilder()
            .setTitle('💼 내 코인')
            .setColor('#00CC99')
            .setTimestamp();
          let total = 0;
          if (!Object.keys(userW).length) {
            e.setDescription('보유 코인이 없습니다.');
          } else {
            for (const [c, q] of Object.entries(userW)) {
              const price = coins[c]?.price || 0;
              const v = price * q;
              total += v;
              e.addFields({
                name: c,
                value: [
                  `수량: ${q}개`,
                  `평가액: ${v.toLocaleString()} BE`,
                  `🔽 최대 매도: ${q}개`
                ].join('\n')
              });
            }
            e.addFields({ name: '총 평가액', value: `${total.toLocaleString()} BE` });
          }
          return btn.reply({ embeds: [e], ephemeral: true });
        }
        case 'godbit_history': {
          const modal = new ModalBuilder().setCustomId('godbit_history_modal').setTitle('코인 히스토리 조회');
          modal.addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('coin')
                .setLabel('코인 이름')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('count')
                .setLabel('조회 개수 (최대 100)')
                .setStyle(TextInputStyle.Short)
                .setRequired(false)
                .setPlaceholder('예: 20 (기본)')
            )
          );
          return btn.showModal(modal);
        }
      }
    });
  }
};
