const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ComponentType,
  StringSelectMenuBuilder
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const lockfile = require('proper-lockfile');
const { addBE, getBE, loadConfig } = require('./be-util.js');

const coinsPath   = path.join(__dirname, '../data/godbit-coins.json');
const walletsPath = path.join(__dirname, '../data/godbit-wallets.json');
const MAX_COINS   = 50;
const PAGE_SIZE   = 5;
const COLORS      = ['red','blue','green','orange','purple','cyan','magenta','brown','gray','teal'];
const EMOJIS      = ['🟥','🟦','🟩','🟧','🟪','🟨','🟫','⬜','⚫','🟣'];

const CHART_INTERVALS = [
  { label: '5분', value: 1 },
  { label: '1시간', value: 12 },
  { label: '3시간', value: 36 },
  { label: '6시간', value: 72 },
  { label: '12시간', value: 144 },
  { label: '24시간', value: 288 },
  { label: '3일', value: 864 },
  { label: '7일', value: 2016 },
  { label: '14일', value: 4032 },
  { label: '30일', value: 8640 }
];

// 안전하게 history 뽑아내기(null로 채움)
function safeSliceHistory(hist, n) {
  if (!Array.isArray(hist)) return Array(n).fill(null);
  if (hist.length >= n) return hist.slice(-n);
  return Array(n - hist.length).fill(null).concat(hist);
}

// JSON 읽기/쓰기(락)
async function loadJson(file, def) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(def, null, 2));
  const release = await lockfile.lock(file, { retries: 5, minTimeout: 50 });
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } finally {
    await release();
  }
  return data;
}
async function saveJson(file, data) {
  const release = await lockfile.lock(file, { retries: 5, minTimeout: 50 });
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } finally {
    await release();
  }
}
async function ensureBaseCoin(coins) {
  if (!coins['까리코인']) {
    coins['까리코인'] = {
      price: 1000,
      history: [1000],
      listedAt: new Date().toISOString()
    };
  }
}

// **5분마다만 가격 변동 (유저 액션에선 변동 X)**
async function periodicMarket() {
  const coins = await loadJson(coinsPath, {});
  await ensureBaseCoin(coins);

  // 시세 갱신
  const base = coins['까리코인'];
  const deltaBase = (Math.random() * 0.2) - 0.1;
  const newBase = Math.max(1, Math.floor(base.price * (1 + deltaBase)));
  base.price = newBase;
  base.history.push(newBase);
  if (base.history.length > 8640) base.history.shift(); // 30일치(5분 단위=8640개)만

  for (const [name, info] of Object.entries(coins)) {
    if (name === '까리코인' || info.delistedAt) continue;
    const kImpact = deltaBase * (0.4 + Math.random()*0.2);
    let delta = (Math.random() * 0.2) - 0.1 + kImpact;
    delta = Math.max(-0.2, Math.min(delta, 0.2));
    const p = Math.max(1, Math.floor(info.price * (1 + delta)));
    info.price = p;
    info.history.push(p);
    if (info.history.length > 8640) info.history.shift();
  }
  await saveJson(coinsPath, coins);
}
setInterval(periodicMarket, 300_000); // 5분(=300,000ms)마다만 시세 변동

// 7일 지난 폐지 코인, 오래된 히스토리 정리 (매 5분)
setInterval(async () => {
  const coins = await loadJson(coinsPath, {});
  const now = Date.now();

  for (const [name, info] of Object.entries(coins)) {
    while (info.history && info.history.length > 8640) info.history.shift();
    if (info.delistedAt && name !== '까리코인') {
      const delistTime = new Date(info.delistedAt).getTime();
      if (now - delistTime > 1000*60*60*24*7) {
        delete coins[name];
      }
    }
  }
  await saveJson(coinsPath, coins);
}, 300_000);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('갓비트')
    .setDescription('가상 코인 거래 시스템')
    .addSubcommand(sub =>
      sub.setName('코인차트').setDescription('모든 코인 현황 + 통합 차트 (페이지)')
    ),

  async execute(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const coins = await loadJson(coinsPath, {});
      const wallets = await loadJson(walletsPath, {});
      await ensureBaseCoin(coins);

      const allAlive = Object.entries(coins).filter(([_,info]) => !info.delistedAt);
      const totalPages = Math.ceil(allAlive.length / PAGE_SIZE);

      let chartRange = 12;

      async function renderPage(page=0, chartInterval=chartRange) {
        const userBE = getBE(interaction.user.id);
        const slice = allAlive.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

        const change = {};
        slice.forEach(([n,info]) => {
          const h = info.history;
          const last = h?.at(-1) ?? 0, prev = h?.at(-2) ?? last;
          const diff = last - prev;
          const pct = prev ? (diff / prev * 100) : 0;
          change[n] = { price: last, diff, pct };
        });

        const listEmbed = new EmbedBuilder()
          .setTitle(`📈 갓비트 시장 현황 (페이지 ${page+1}/${totalPages})`)
          .setDescription(`💳 내 BE: ${userBE.toLocaleString()} BE`)
          .setColor('#FFFFFF')
          .setTimestamp();

        slice.slice(0, 5).forEach(([n], i) => {
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
            inline: false
          });
        });

        // 안전하게 차트 그리기
        const histories = slice.map(([,info]) => safeSliceHistory(info.history, chartInterval));
        const maxLen = Math.max(...histories.map(h => h.length));
        const labels = Array.from({ length: maxLen }, (_,i) => i+1);
        const datasets = slice.map(([n,info], i) => ({
          label: n,
          data: safeSliceHistory(info.history, chartInterval),
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
          .setTitle('📊 이 페이지 코인 가격 차트')
          .setImage(`https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}`)
          .setColor('#FFFFFF')
          .setTimestamp();

        const navRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('first').setLabel('🏠 처음').setStyle(ButtonStyle.Secondary).setDisabled(page===0),
          new ButtonBuilder().setCustomId('prev').setLabel('◀️ 이전').setStyle(ButtonStyle.Primary).setDisabled(page===0),
          new ButtonBuilder().setCustomId('next').setLabel('▶️ 다음').setStyle(ButtonStyle.Primary).setDisabled(page===totalPages-1),
          new ButtonBuilder().setCustomId('history').setLabel('🕘 히스토리').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('refresh').setLabel('🔄 새로고침').setStyle(ButtonStyle.Secondary)
        );
        const actionRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('buy').setLabel('매수').setEmoji('💰').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('sell').setLabel('매도').setEmoji('💸').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('portfolio').setLabel('내 코인').setEmoji('📂').setStyle(ButtonStyle.Secondary)
        );
        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('chart_range')
          .setPlaceholder('차트 구간 선택')
          .addOptions(CHART_INTERVALS.map(opt => ({
            label: opt.label, value: String(opt.value), default: opt.value === chartInterval
          })));
        const selectRow = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.editReply({
          embeds: [listEmbed, chartEmbed],
          components: [navRow, actionRow, selectRow]
        });
        return page;
      }

      let page = 0;
      await renderPage(page, chartRange);
      const message = await interaction.fetchReply();

      const COLLECTOR_TIMEOUT = 600_000;
      const collector = message.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: COLLECTOR_TIMEOUT,
        filter: btn => btn.user.id === interaction.user.id
      });
      const selectCollector = message.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: COLLECTOR_TIMEOUT,
        filter: sel => sel.user.id === interaction.user.id
      });

      collector.on('collect', async btn => {
        collector.resetTimer();
        try {
          await btn.deferUpdate();
          if (btn.customId === 'first') {
            page = 0;
            await renderPage(page, chartRange);
            return;
          }
          if (btn.customId === 'prev' && page > 0) {
            page -= 1;
            await renderPage(page, chartRange);
            return;
          }
          if (btn.customId === 'next' && page < totalPages-1) {
            page += 1;
            await renderPage(page, chartRange);
            return;
          }
          if (btn.customId === 'refresh') {
            await renderPage(page, chartRange);
            return;
          }
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
              time: 300_000
            });
            await sub.deferReply({ ephemeral: true });

            const coins = await loadJson(coinsPath, {});
            const wallets = await loadJson(walletsPath, {});
            await ensureBaseCoin(coins);

            const coin = sub.fields.getTextInputValue('coin');
            const amount = Number(sub.fields.getTextInputValue('amount'));
            if (!coins[coin] || coins[coin].delistedAt) return sub.editReply({ content: `❌ 상장 중인 코인만 거래 가능: ${coin}` });
            if (!Number.isFinite(amount) || amount <= 0) return sub.editReply({ content: `❌ 올바른 수량을 입력하세요.` });

            if (isBuy) {
              const price = coins[coin].price;
              const total = price * amount;
              const fee = Math.floor(total * 0.3);
              const needBE = total + fee;
              const bal = getBE(sub.user.id);
              if (bal < needBE) return sub.editReply({ content: `❌ BE 부족: 필요 ${needBE}` });
              wallets[sub.user.id] = wallets[sub.user.id] || {};
              wallets[sub.user.id][coin] = (wallets[sub.user.id][coin] || 0) + amount;
              await addBE(sub.user.id, -needBE, `매수 ${amount} ${coin} (수수료 ${fee} BE 포함)`);
              await saveJson(walletsPath, wallets);
              return sub.editReply({ content: `✅ ${coin} ${amount}개 매수 완료! (수수료 ${fee} BE)` });
            } else {
              const have = wallets[sub.user.id]?.[coin] || 0;
              if (have < amount) return sub.editReply({ content: `❌ 보유 부족: ${have}` });
              const gross = coins[coin].price * amount;
              const fee = Math.floor(gross * (loadConfig().fee || 0) / 100);
              const net = gross - fee;
              wallets[sub.user.id][coin] -= amount;
              if (wallets[sub.user.id][coin] <= 0) delete wallets[sub.user.id][coin];
              await addBE(sub.user.id, net, `매도 ${amount} ${coin}`);
              await saveJson(walletsPath, wallets);
              return sub.editReply({ content: `✅ ${coin} ${amount}개 매도 완료! (수수료 ${fee} BE)` });
            }
          }

          if (btn.customId === 'portfolio') {
            const wallets = await loadJson(walletsPath, {});
            const coins = await loadJson(coinsPath, {});
            const userW = wallets[btn.user.id] || {};
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
            return btn.followUp({ embeds: [e], ephemeral: true });
          }

          if (btn.customId === 'history') {
            const modal = makeModal(
              'history_modal',
              '코인 히스토리 조회',
              [
                { customId: 'coin', label: '코인 이름', style: TextInputStyle.Short, required: true },
                { customId: 'count', label: '조회 개수 (최대 30일=8640)', style: TextInputStyle.Short, required: false, placeholder: '예: 12 (기본 12, 5분x12=1시간)' }
              ]
            );
            await btn.showModal(modal);
            const sub = await btn.awaitModalSubmit({
              filter: i => i.customId === 'history_modal' && i.user.id === btn.user.id,
              time: 300_000
            });
            await sub.deferReply({ ephemeral: true });

            const coins = await loadJson(coinsPath, {});
            await ensureBaseCoin(coins);

            const coin = sub.fields.getTextInputValue('coin');
            const cnt = Math.min(8640, Math.max(1, parseInt(sub.fields.getTextInputValue('count')) || 12));
            if (!coins[coin]) return sub.editReply({ content: `❌ 코인 없음: ${coin}` });

            const info = coins[coin];
            const h = safeSliceHistory(info.history, cnt);
            const lines = h.map((p, idx) =>
              p === null ? `${idx+1}: 데이터없음` : `${idx+1}: ${p >= (h[idx-1] ?? p) ? '🔺' : '🔽'}${p}`
            );
            const e = new EmbedBuilder()
              .setTitle(`🕘 ${coin} 최근 ${cnt}개 이력 (5분 단위)`)
              .setDescription(lines.join('\n'))
              .addFields(
                { name: '상장일', value: info.listedAt ? new Date(info.listedAt).toLocaleString() : '-', inline: true },
                { name: '폐지일', value: info.delistedAt ? new Date(info.delistedAt).toLocaleString() : '-', inline: true }
              )
              .setColor('#3498DB')
              .setTimestamp();
            return sub.editReply({ embeds: [e] });
          }
        } catch (err) {
          console.error(err);
          try { await btn.followUp({ content: "⏳ 해당 명령어가 만료되었습니다.", ephemeral: true }); } catch {}
        }
      });

      selectCollector.on('collect', async sel => {
        selectCollector.resetTimer();
        try {
          chartRange = Number(sel.values[0]) || 12;
          await sel.deferUpdate();
          await renderPage(page, chartRange);
        } catch (err) {
          console.error(err);
        }
      });

    } catch (err) {
      console.error(err);
      try { await interaction.followUp({ content: "⏳ 해당 명령어가 만료되었습니다.", ephemeral: true }); } catch {}
    }
  },

  async modal(interaction) {
    // 매수/매도/히스토리 모두 deferReply/editReply 방식만 허용!
    if (interaction.customId === 'buy_modal' || interaction.customId === 'sell_modal') {
      try {
        await interaction.deferReply({ ephemeral: true });
        const isBuy = interaction.customId === 'buy_modal';
        const coins = await loadJson(coinsPath, {});
        const wallets = await loadJson(walletsPath, {});
        await ensureBaseCoin(coins);

        const coin = interaction.fields.getTextInputValue('coin');
        const amount = Number(interaction.fields.getTextInputValue('amount'));
        if (!coins[coin] || coins[coin].delistedAt) return interaction.editReply({ content: `❌ 상장 중인 코인만 거래 가능: ${coin}` });
        if (!Number.isFinite(amount) || amount <= 0) return interaction.editReply({ content: `❌ 올바른 수량을 입력하세요.` });

        if (isBuy) {
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
          return interaction.editReply({ content: `✅ ${coin} ${amount}개 매수 완료! (수수료 ${fee} BE)` });
        } else {
          const have = wallets[interaction.user.id]?.[coin] || 0;
          if (have < amount) return interaction.editReply({ content: `❌ 보유 부족: ${have}` });
          const gross = coins[coin].price * amount;
          const fee = Math.floor(gross * (loadConfig().fee || 0) / 100);
          const net = gross - fee;
          wallets[interaction.user.id][coin] -= amount;
          if (wallets[interaction.user.id][coin] <= 0) delete wallets[interaction.user.id][coin];
          await addBE(interaction.user.id, net, `매도 ${amount} ${coin}`);
          await saveJson(walletsPath, wallets);
          return interaction.editReply({ content: `✅ ${coin} ${amount}개 매도 완료! (수수료 ${fee} BE)` });
        }
      } catch (err) {
        console.error(err);
        try { await interaction.editReply({ content: "⏳ 거래 처리에 실패했습니다.", ephemeral: true }); } catch {}
      }
    }

    if (interaction.customId === 'history_modal') {
      try {
        await interaction.deferReply({ ephemeral: true });
        const coins = await loadJson(coinsPath, {});
        await ensureBaseCoin(coins);

        const coin = interaction.fields.getTextInputValue('coin');
        const cnt = Math.min(8640, Math.max(1, parseInt(interaction.fields.getTextInputValue('count')) || 12));
        if (!coins[coin]) return interaction.editReply({ content: `❌ 코인 없음: ${coin}` });

        const info = coins[coin];
        const h = safeSliceHistory(info.history, cnt);
        const lines = h.map((p, idx) =>
          p === null ? `${idx+1}: 데이터없음` : `${idx+1}: ${p >= (h[idx-1] ?? p) ? '🔺' : '🔽'}${p}`
        );
        const e = new EmbedBuilder()
          .setTitle(`🕘 ${coin} 최근 ${cnt}개 이력 (5분 단위)`)
          .setDescription(lines.join('\n'))
          .addFields(
            { name: '상장일', value: info.listedAt ? new Date(info.listedAt).toLocaleString() : '-', inline: true },
            { name: '폐지일', value: info.delistedAt ? new Date(info.delistedAt).toLocaleString() : '-', inline: true }
          )
          .setColor('#3498DB')
          .setTimestamp();
        return interaction.editReply({ embeds: [e] });
      } catch (err) {
        console.error(err);
        try { await interaction.editReply({ content: "⏳ 이력 조회에 실패했습니다.", ephemeral: true }); } catch {}
      }
    }
  }
};
