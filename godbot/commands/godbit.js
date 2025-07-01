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

// 자동 1분마다 가격만 업데이트
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

// Market simulation with correlation + listing/delisting
async function simulateMarket(interaction, coins) {
  // base coin
  const base = coins['까리코인'];
  const deltaBase = (Math.random() * 0.2) - 0.1;
  const newBase = Math.max(1, Math.floor(base.price * (1 + deltaBase)));
  base.price = newBase;
  base.history.push(newBase);

  // other coins (30% correlation)
  for (const [name, info] of Object.entries(coins)) {
    if (name === '까리코인') continue;
    let delta = (Math.random() * 0.2) - 0.1 + deltaBase * 0.3;
    delta = Math.max(-0.2, Math.min(delta, 0.2));
    const p = Math.max(1, Math.floor(info.price * (1 + delta)));
    info.price = p;
    info.history.push(p);
  }

  // listing/delisting
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
  if (Math.random() < 0.02) {
    const others = Object.keys(coins).filter(n => n !== '까리코인');
    if (others.length) {
      const del = others[Math.floor(Math.random() * others.length)];
      coins[del].delistedAt = new Date().toISOString();
    }
  }
  // enforce max
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

    // 메인 렌더 함수
    async function renderMain() {
      await simulateMarket(interaction, coins);
      await saveJson(coinsPath, coins);

      const userBE = getBE(interaction.user.id);
      // 변동 정보
      const change = {};
      for (const [n, info] of Object.entries(coins)) {
        const h = info.history;
        const last = h[h.length - 1], prev = h[h.length - 2] || last;
        const diff = last - prev;
        const pct  = prev ? (diff / prev * 100) : 0;
        change[n] = { price: last, diff, pct };
      }

      // 목록 Embed
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

      // 차트 Embed
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

      // 버튼 행
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
      if (i.customId === 'godbit_buy' || i.customId === 'godbit_sell') {
        // 매수/매도 모달
        const title = i.customId === 'godbit_buy' ? '코인 매수' : '코인 매도';
        const modalId = i.customId === 'godbit_buy' ? 'godbit_buy_modal' : 'godbit_sell_modal';
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
        return i.showModal(modal);
      }
      if (i.customId === 'godbit_portfolio') {
        const userW = wallets[i.user.id] || {};
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
        return i.reply({ embeds: [e], ephemeral: true });
      }
      if (i.customId === 'godbit_history') {
        // 히스토리 조회 모달
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
              .setPlaceholder('예: 100 (기본 20)')
          )
        );
        return i.showModal(modal);
      }
    });

    // 모달 제출 처리
interaction.client.on('interactionCreate', async subI => {
  if (!subI.isModalSubmit()) return;
  const id = subI.customId;
  await simulateMarket(subI, coins);
  await saveJson(coinsPath, coins);

  // --- 매수 모달 처리 ---
  if (id === 'godbit_buy_modal') {
    const coin = subI.fields.getTextInputValue('coin');
    const amount = Number(subI.fields.getTextInputValue('amount'));
    if (!coins[coin]) {
      return subI.reply({ content: `❌ 코인 없음: ${coin}`, ephemeral: true });
    }
    const cost = coins[coin].price * amount;
    const bal = getBE(subI.user.id);
    if (bal < cost) {
      return subI.reply({ content: `❌ BE 부족: 필요 ${cost}`, ephemeral: true });
    }
    await addBE(subI.user.id, -cost, `매수 ${amount} ${coin}`);
    wallets[subI.user.id] = wallets[subI.user.id] || {};
    wallets[subI.user.id][coin] = (wallets[subI.user.id][coin] || 0) + amount;
    await saveJson(walletsPath, wallets);
    return subI.reply({ content: `✅ ${coin} ${amount}개 매수 완료!`, ephemeral: true });
  }

  // --- 매도 모달 처리 ---
  if (id === 'godbit_sell_modal') {
    const coin = subI.fields.getTextInputValue('coin');
    const amount = Number(subI.fields.getTextInputValue('amount'));
    if (!coins[coin]) {
      return subI.reply({ content: `❌ 코인 없음: ${coin}`, ephemeral: true });
    }
    const have = wallets[subI.user.id]?.[coin] || 0;
    if (have < amount) {
      return subI.reply({ content: `❌ 보유 부족: ${have}`, ephemeral: true });
    }
    const gross = coins[coin].price * amount;
    const fee = Math.floor(gross * (loadConfig().fee || 0) / 100);
    const net = gross - fee;
    await addBE(subI.user.id, net, `매도 ${amount} ${coin}`);
    wallets[subI.user.id][coin] -= amount;
    if (wallets[subI.user.id][coin] <= 0) delete wallets[subI.user.id][coin];
    await saveJson(walletsPath, wallets);
    return subI.reply({ content: `✅ ${coin} ${amount}개 매도 완료!`, ephemeral: true });
  }

  // --- 히스토리 모달 처리 ---
  if (id === 'godbit_history_modal') {
    const coin = subI.fields.getTextInputValue('coin');
    const rawCount = subI.fields.getTextInputValue('count');
    const cnt = Math.min(100, Math.max(1, parseInt(rawCount) || 20));
    if (!coins[coin]) {
      return subI.reply({ content: `❌ 코인 없음: ${coin}`, ephemeral: true });
    }
    const info = coins[coin];
    const h = info.history.slice(-cnt);
    const lines = h.map((p, idx) => {
      const prev = idx > 0 ? h[idx - 1] : h[0];
      const arrow = p >= prev ? '🔺' : '🔽';
      return `${idx + 1}: ${arrow}${p}`;
    });
    const e = new EmbedBuilder()
      .setTitle(`🕘 ${coin} 최근 ${cnt}개 이력`)
      .setDescription(lines.join('\n'))
      .addFields(
        { name: '상장일', value: info.listedAt ? new Date(info.listedAt).toLocaleString() : 'Unknown', inline: true },
        { name: '폐지일', value: info.delistedAt ? new Date(info.delistedAt).toLocaleString() : '-', inline: true }
      )
      .setColor('#3498DB')
      .setTimestamp();
    return subI.reply({ embeds: [e], ephemeral: true });
  }
});
  }
};
