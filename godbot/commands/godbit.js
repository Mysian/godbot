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
const EMOJIS      = ['🟥','🟦','🟩','🟧','🟪','🟨','🟫','⬜','⚫','🟣'];

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

// Ensure base coin exists
async function ensureBaseCoin(coins) {
  if (!coins['까리코인']) {
    coins['까리코인'] = {
      price: 1000,
      history: [1000],
      listedAt: new Date().toISOString()
    };
  }
}

// Market simulation
async function simulateMarket(interaction, coins) {
  // 1) Base coin
  const base = coins['까리코인'];
  const deltaBase = (Math.random() * 0.2) - 0.1;
  const newBase = Math.max(1, Math.floor(base.price * (1 + deltaBase)));
  base.price = newBase;
  base.history.push(newBase);

  // 2) Others
  for (const [name, info] of Object.entries(coins)) {
    if (name === '까리코인' || info.delistedAt) continue;
    let delta = (Math.random() * 0.2) - 0.1 + deltaBase * 0.3;
    delta = Math.max(-0.2, Math.min(delta, 0.2));
    const p = Math.max(1, Math.floor(info.price * (1 + delta)));
    info.price = p;
    info.history.push(p);
  }

  // 3) Listing
  if (Math.random() < 0.05) {
    const mems = interaction.guild.members.cache.filter(m => /^[가-힣]{2}$/.test(m.displayName));
    if (mems.size) {
      const pick = Array.from(mems.values())[Math.floor(Math.random() * mems.size)];
      const name = `${pick.displayName}코인`;
      coins[name] = {
        price: Math.floor(Math.random() * 900) + 100,
        history: [coins['까리코인'].price],
        listedAt: new Date().toISOString()
      };
      delete coins[name].delistedAt;
    }
  }

  // 4) Delisting
  if (Math.random() < 0.02) {
    const alive = Object.keys(coins).filter(n => n !== '까리코인' && !coins[n].delistedAt);
    if (alive.length) {
      const del = alive[Math.floor(Math.random() * alive.length)];
      coins[del].delistedAt = new Date().toISOString();
    }
  }

  // 5) Enforce EXACTLY MAX_COINS alive
  let alive = Object.keys(coins).filter(n => !coins[n].delistedAt);
  while (alive.length > MAX_COINS) {
    const rem = alive[Math.floor(Math.random() * alive.length)];
    coins[rem].delistedAt = new Date().toISOString();
    alive = alive.filter(n => n !== rem);
  }
  const mems = interaction.guild.members.cache.filter(m => /^[가-힣]{2}$/.test(m.displayName));
  while (alive.length < MAX_COINS && mems.size) {
    const pick = Array.from(mems.values())[Math.floor(Math.random() * mems.size)];
    const name = `${pick.displayName}코인`;
    coins[name] = {
      price: Math.floor(Math.random() * 900) + 100,
      history: [coins['까리코인'].price],
      listedAt: new Date().toISOString()
    };
    delete coins[name].delistedAt;
    alive.push(name);
  }
}

// Price-only updater
setInterval(async () => {
  const coins = await loadJson(coinsPath, {});
  for (const info of Object.values(coins)) {
    if (info.delistedAt) continue;
    const delta = (Math.random() * 0.2) - 0.1;
    const p = Math.max(1, Math.floor(info.price * (1 + delta)));
    info.price = p;
    info.history.push(p);
  }
  await saveJson(coinsPath, coins);
}, 60_000);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('갓비트')
    .setDescription('가상 코인 거래 시스템')
    .addSubcommand(sub =>
      sub.setName('코인차트').setDescription('모든 코인 현황 + 통합 차트')
    ),

  async execute(interaction) {
    await interaction.deferReply();
    const coins = await loadJson(coinsPath, {});
    const wallets = await loadJson(walletsPath, {});
    await ensureBaseCoin(coins);

    // Render
    async function renderMain() {
      await simulateMarket(interaction, coins);
      await saveJson(coinsPath, coins);

      const userBE = getBE(interaction.user.id);
      const aliveEntries = Object.entries(coins).filter(([_,info]) => !info.delistedAt);
      const change = {};
      aliveEntries.forEach(([n,info]) => {
        const h = info.history;
        const last = h.at(-1), prev = h.at(-2) ?? last;
        const diff = last - prev;
        const pct = prev ? (diff / prev * 100) : 0;
        change[n] = { price: last, diff, pct };
      });

      const listEmbed = new EmbedBuilder()
        .setTitle('📈 갓비트 시장 현황')
        .setDescription(`💳 내 BE: ${userBE.toLocaleString()} BE`)
        .setColor('#FFFFFF')
        .setTimestamp();

      aliveEntries.forEach(([n], i) => {
        const { price, diff, pct } = change[n];
        const arrow = diff >= 0 ? '🔺' : '🔽';
        const maxBuy = Math.floor(userBE / price);
        const emoji = EMOJIS[i % EMOJIS.length];
        listEmbed.addFields({
          name: `${emoji} ${n}`,
          value: [
            `${price.toLocaleString()} BE ${arrow}${Math.abs(diff).toLocaleString()} (${diff>=0?'+':''}${pct.toFixed(2)}%)`,
            `🛒 최대 매수: ${maxBuy}개`
          ].join('\n'),
          inline: true
        });
      });

      const histories = aliveEntries.map(([,info]) => info.history);
      const maxLen = Math.max(...histories.map(h => h.length));
      const labels = Array.from({ length: maxLen }, (_,i) => i+1);
      const datasets = aliveEntries.map(([n,info], i) => ({
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
      const chartEmbed = new EmbedBuilder()
        .setTitle('📊 통합 코인 가격 차트')
        .setImage(`https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}`)
        .setColor('#FFFFFF')
        .setTimestamp();

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('buy').setLabel('매수').setEmoji('💰').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('sell').setLabel('매도').setEmoji('💸').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('portfolio').setLabel('내 코인').setEmoji('📂').setStyle(ButtonStyle.Secondary)
      );
      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('history').setLabel('코인 히스토리').setEmoji('🕘').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('refresh').setLabel('새로고침').setEmoji('🔄').setStyle(ButtonStyle.Secondary)
      );

      await interaction.editReply({ embeds: [listEmbed, chartEmbed], components: [row1, row2] });
    }

    await renderMain();
    const message = await interaction.fetchReply();

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 120_000,
      filter: btn => btn.user.id === interaction.user.id
    });

    collector.on('collect', async btn => {
      await btn.deferUpdate();

      if (btn.customId === 'refresh') {
        return renderMain();
      }

      // 공통 모달 생성 함수
      const makeModal = (id, title, fields) => {
        const m = new ModalBuilder().setCustomId(id).setTitle(title);
        fields.forEach(f => {
          m.addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId(f.customId)
                .setLabel(f.label)
                .setStyle(f.style)
                .setRequired(f.required ?? false)
                .setPlaceholder(f.placeholder ?? null)
            )
          );
        });
        return m;
      };

      // 매수/매도
      if (btn.customId === 'buy' || btn.customId === 'sell') {
        const isBuy = btn.customId === 'buy';
        const modal = makeModal(
          isBuy ? 'buy_modal' : 'sell_modal',
          isBuy ? '코인 매수' : '코인 매도',
          [
            { customId: 'coin', label: '코인 이름', style: TextInputStyle.Short, required: true },
            { customId: 'amount', label: '수량', style: TextInputStyle.Short, required: true }
          ]
        );
        await btn.showModal(modal);
        const sub = await btn.awaitModalSubmit({
          filter: i => i.customId === (isBuy ? 'buy_modal' : 'sell_modal') && i.user.id === btn.user.id,
          time: 60_000
        });
        await sub.deferReply({ ephemeral: true });
        await simulateMarket(sub, coins);
        await saveJson(coinsPath, coins);

        const coin = sub.fields.getTextInputValue('coin');
        const amount = Number(sub.fields.getTextInputValue('amount'));
        if (!coins[coin]) return sub.editReply({ content: `❌ 코인 없음: ${coin}` });

        if (isBuy) {
          const cost = coins[coin].price * amount;
          const bal = getBE(sub.user.id);
          if (bal < cost) return sub.editReply({ content: `❌ BE 부족: 필요 ${cost}` });
          await addBE(sub.user.id, -cost, `매수 ${amount} ${coin}`);
          wallets[sub.user.id] = wallets[sub.user.id] || {};
          wallets[sub.user.id][coin] = (wallets[sub.user.id][coin] || 0) + amount;
          await saveJson(walletsPath, wallets);
          return sub.editReply({ content: `✅ ${coin} ${amount}개 매수 완료!` });
        } else {
          const have = wallets[sub.user.id]?.[coin] || 0;
          if (have < amount) return sub.editReply({ content: `❌ 보유 부족: ${have}` });
          const gross = coins[coin].price * amount;
          const fee = Math.floor(gross * (loadConfig().fee || 0) / 100);
          const net = gross - fee;
          await addBE(sub.user.id, net, `매도 ${amount} ${coin}`);
          wallets[sub.user.id][coin] -= amount;
          if (wallets[sub.user.id][coin] <= 0) delete wallets[sub.user.id][coin];
          await saveJson(walletsPath, wallets);
          return sub.editReply({ content: `✅ ${coin} ${amount}개 매도 완료! (수수료 ${fee} BE)` });
        }
      }

      // 포트폴리오
      if (btn.customId === 'portfolio') {
        const userW = wallets[btn.user.id] || {};
        const e = new EmbedBuilder().setTitle('💼 내 코인').setColor('#00CC99').setTimestamp();
        let total = 0;
        if (!Object.keys(userW).length) {
          e.setDescription('보유 코인이 없습니다.');
        } else {
          for (const [c, q] of Object.entries(userW)) {
            const v = (coins[c]?.price || 0) * q;
            total += v;
            e.addFields({ name: c, value: `수량: ${q}개\n평가액: ${v.toLocaleString()} BE\n🔽 최대 매도: ${q}개` });
          }
          e.addFields({ name: '총 평가액', value: `${total.toLocaleString()} BE` });
        }
        return btn.followUp({ embeds: [e], ephemeral: true });
      }

      // 히스토리
      if (btn.customId === 'history') {
        const modal = makeModal(
          'history_modal',
          '코인 히스토리 조회',
          [
            { customId: 'coin', label: '코인 이름', style: TextInputStyle.Short, required: true },
            { customId: 'count', label: '조회 개수 (최대 100)', style: TextInputStyle.Short, required: false, placeholder: '예: 100 (기본 20)' }
          ]
        );
        await btn.showModal(modal);
        const sub = await btn.awaitModalSubmit({
          filter: i => i.customId === 'history_modal' && i.user.id === btn.user.id,
          time: 60_000
        });
        await sub.deferReply({ ephemeral: true });
        await simulateMarket(sub, coins);
        await saveJson(coinsPath, coins);

        const coin = sub.fields.getTextInputValue('coin');
        const cnt = Math.min(100, Math.max(1, parseInt(sub.fields.getTextInputValue('count')) || 20));
        if (!coins[coin]) return sub.editReply({ content: `❌ 코인 없음: ${coin}` });

        const info = coins[coin];
        const h = info.history.slice(-cnt);
        const lines = h.map((p, idx) => {
          const arrow = p >= (h[idx-1] ?? p) ? '🔺' : '🔽';
          return `${idx+1}: ${arrow}${p}`;
        });
        const e = new EmbedBuilder()
          .setTitle(`🕘 ${coin} 최근 ${cnt}개 이력`)
          .setDescription(lines.join('\n'))
          .addFields(
            { name: '상장일', value: info.listedAt ? new Date(info.listedAt).toLocaleString() : '-', inline: true },
            { name: '폐지일', value: info.delistedAt ? new Date(info.delistedAt).toLocaleString() : '-', inline: true }
          )
          .setColor('#3498DB')
          .setTimestamp();
        return sub.editReply({ embeds: [e] });
      }
    });
  }
};
