const {
  SlashCommandBuilder, EmbedBuilder
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const lockfile = require('proper-lockfile');

// ==== 공통 상수 및 함수 ====
const coinsPath   = path.join(__dirname, '../data/godbit-coins.json');
const walletsPath = path.join(__dirname, '../data/godbit-wallets.json');
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
// (BE 기능 외부 util에서 가져와야 함. 아래 예시로 직접 추가/수정 가능)
const { addBE, getBE, loadConfig } = require('./be-util.js');

// JSON 락 안전 입출력
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
function safeSliceHistory(hist, n) {
  if (!Array.isArray(hist)) return Array(n).fill(null);
  if (hist.length >= n) return hist.slice(-n);
  return Array(n - hist.length).fill(null).concat(hist);
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

// ==== 통합 명령어 구조 ====
module.exports = {
  data: new SlashCommandBuilder()
    .setName('갓비트')
    .setDescription('가상 코인 시스템 통합 명령어')

    // 1. 코인차트
    .addSubcommand(sub =>
      sub.setName('코인차트')
        .setDescription('코인 시장 전체 차트 (구간/페이지)')
        .addIntegerOption(opt =>
          opt.setName('구간').setDescription('차트 기간(5분~30일)').addChoices(
            { name: '5분', value: 1 },
            { name: '1시간', value: 12 },
            { name: '3시간', value: 36 },
            { name: '6시간', value: 72 },
            { name: '12시간', value: 144 },
            { name: '24시간', value: 288 },
            { name: '3일', value: 864 },
            { name: '7일', value: 2016 },
            { name: '14일', value: 4032 },
            { name: '30일', value: 8640 }
          )
        )
        .addIntegerOption(opt =>
          opt.setName('페이지').setDescription('페이지 번호').setMinValue(1)
        )
    )

    // 2. 매수
    .addSubcommand(sub =>
      sub.setName('매수')
        .setDescription('코인을 매수합니다')
        .addStringOption(opt => opt.setName('코인').setDescription('코인명').setRequired(true))
        .addIntegerOption(opt => opt.setName('수량').setDescription('매수 수량').setMinValue(1).setRequired(true))
    )

    // 3. 매도
    .addSubcommand(sub =>
      sub.setName('매도')
        .setDescription('코인을 매도합니다')
        .addStringOption(opt => opt.setName('코인').setDescription('코인명').setRequired(true))
        .addIntegerOption(opt => opt.setName('수량').setDescription('매도 수량').setMinValue(1).setRequired(true))
    )

    // 4. 히스토리
    .addSubcommand(sub =>
      sub.setName('히스토리')
        .setDescription('코인 가격 이력 조회')
        .addStringOption(opt => opt.setName('코인').setDescription('코인명').setRequired(true))
        .addIntegerOption(opt => opt.setName('개수').setDescription('조회 개수(기본 12=1시간, 최대 8640)').setMinValue(1).setMaxValue(8640))
    )

    // 5. 내코인
    .addSubcommand(sub =>
      sub.setName('내코인')
        .setDescription('내 보유 코인/평가액 조회')
    ),

  // === execute 분기 ===
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // 1. 코인차트
    if (sub === '코인차트') {
      await interaction.deferReply({ ephemeral: true });
      const chartRange = interaction.options.getInteger('구간') || 12;
      const page = (interaction.options.getInteger('페이지') || 1) - 1;
      const coins = await loadJson(coinsPath, {});
      const allAlive = Object.entries(coins).filter(([_,info]) => !info.delistedAt);
      const totalPages = Math.ceil(allAlive.length / PAGE_SIZE);
      const pageIdx = Math.max(0, Math.min(page, totalPages-1));
      const slice = allAlive.slice(pageIdx * PAGE_SIZE, (pageIdx + 1) * PAGE_SIZE);

      const change = {};
      slice.forEach(([n,info]) => {
        const h = info.history;
        const last = h?.at(-1) ?? 0, prev = h?.at(-2) ?? last;
        const diff = last - prev;
        const pct = prev ? (diff / prev * 100) : 0;
        change[n] = { price: last, diff, pct };
      });

      const listEmbed = new EmbedBuilder()
        .setTitle(`📈 갓비트 시장 현황 (페이지 ${pageIdx+1}/${totalPages})`)
        .setColor('#FFFFFF').setTimestamp();

      slice.slice(0, 5).forEach(([n], i) => {
        const { price, diff, pct } = change[n];
        const arrow = diff >= 0 ? '🔺' : '🔽';
        const emoji = EMOJIS[i % EMOJIS.length];
        listEmbed.addFields({
          name: `${emoji} ${n}`,
          value: `${price.toLocaleString()} BE ${arrow}${Math.abs(diff).toLocaleString()} (${diff>=0?'+':''}${pct.toFixed(2)}%)`
        });
      });

      const histories = slice.map(([,info]) => safeSliceHistory(info.history, chartRange));
      const maxLen = Math.max(...histories.map(h => h.length));
      const labels = Array.from({ length: maxLen }, (_,i) => i+1);
      const datasets = slice.map(([n,info], i) => ({
        label: n,
        data: safeSliceHistory(info.history, chartRange),
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
        .setTitle('📊 코인 가격 차트')
        .setImage(`https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}`)
        .setColor('#FFFFFF').setTimestamp();

      return interaction.editReply({ embeds: [listEmbed, chartEmbed] });
    }

    // 2. 매수
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

      return interaction.editReply({ content: `✅ ${coin} ${amount}개 매수 완료! (수수료 ${fee} BE)` });
    }

    // 3. 매도
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

      return interaction.editReply({ content: `✅ ${coin} ${amount}개 매도 완료! (수수료 ${fee} BE)` });
    }

    // 4. 히스토리
    if (sub === '히스토리') {
      await interaction.deferReply({ ephemeral: true });
      const coin = interaction.options.getString('코인');
      const cnt = Math.min(8640, Math.max(1, interaction.options.getInteger('개수') || 12));
      const coins = await loadJson(coinsPath, {});
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
        .setColor('#3498DB').setTimestamp();
      return interaction.editReply({ embeds: [e] });
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
