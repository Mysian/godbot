// 📁 commands/godbit.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const lockfile = require('proper-lockfile');
const { addBE, getBE, loadConfig } = require('./be-util.js');

const coinsPath   = path.join(__dirname, '../data/coins.json');
const walletsPath = path.join(__dirname, '../data/godbit-wallets.json');
const MAX_COINS   = 10;
const COLORS      = ['red','blue','green','orange','purple','cyan','magenta','brown','gray','teal'];

// 안전하게 JSON 로드/저장
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

// 기본 코인 보장
async function ensureBaseCoin(coins) {
  if (!coins['까리코인']) coins['까리코인'] = { price: 1000, history: [1000] };
}

// 시장 시뮬레이션
async function simulateMarket(interaction, coins) {
  for (const info of Object.values(coins)) {
    const delta = (Math.random() * 0.2) - 0.1;
    const newP = Math.max(1, Math.floor(info.price * (1 + delta)));
    info.price = newP;
    info.history.push(newP);
  }
  if (Math.random() < 0.05) {
    const mems = interaction.guild.members.cache.filter(m => /^[가-힣]{2}$/.test(m.displayName));
    if (mems.size) {
      const pick = Array.from(mems.values())[Math.floor(Math.random() * mems.size)];
      const name = `${pick.displayName}코인`;
      if (!coins[name]) coins[name] = { price: Math.floor(Math.random() * 900) + 100, history: [coins['까리코인'].price] };
    }
  }
  if (Math.random() < 0.02) {
    const others = Object.keys(coins).filter(n => n !== '까리코인');
    if (others.length) delete coins[others[Math.floor(Math.random() * others.length)]];
  }
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
         .setDescription('모든 코인 현황 + 통합 차트 표시')
    )
    .addSubcommand(sub =>
      sub.setName('매수')
         .setDescription('코인 매수')
         .addStringOption(o => o.setName('코인').setDescription('코인 이름').setRequired(true))
         .addNumberOption(o => o.setName('수량').setDescription('수량').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('매도')
         .setDescription('코인 매도')
         .addStringOption(o => o.setName('코인').setDescription('코인 이름').setRequired(true))
         .addNumberOption(o => o.setName('수량').setDescription('수량').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('내코인')
         .setDescription('내 보유 코인 현황')
    ),

  async execute(interaction) {
    await interaction.deferReply();
    const coins   = await loadJson(coinsPath, {});
    const wallets = await loadJson(walletsPath, {});
    await ensureBaseCoin(coins);

    const sub = interaction.options.getSubcommand();
    if (sub === '코인차트') {
      await simulateMarket(interaction, coins);
      await saveJson(coinsPath, coins);

      // 변경 정보 수집
      const changeInfo = {};
      for (const [name, info] of Object.entries(coins)) {
        const h = info.history;
        const last = h[h.length - 1], prev = h[h.length - 2] || last;
        const diff = last - prev;
        const pct  = prev ? (diff / prev * 100) : 0;
        changeInfo[name] = { price: last, diff, pct };
      }

      // 목록 Embed
      const listEmbed = new EmbedBuilder()
        .setTitle('📈 갓비트 코인 현황')
        .setColor('#0099FF')
        .setTimestamp();
      for (const [name, { price, diff, pct }] of Object.entries(changeInfo)) {
        const arrow = diff >= 0 ? '🔺' : '🔻';
        listEmbed.addFields({
          name,
          value: `${price.toLocaleString()} BE ${arrow}${Math.abs(diff).toLocaleString()} (${diff >= 0 ? '+' : ''}${pct.toFixed(2)}%)`,
          inline: true
        });
      }

      // 통합 차트
      const histories = Object.values(coins).map(c => c.history);
      const maxLen = Math.max(...histories.map(h => h.length));
      const labels = Array.from({ length: maxLen }, (_, i) => i + 1);
      const datasets = Object.entries(coins).map(([name, info], i) => {
        const padded = Array(maxLen - info.history.length).fill(null).concat(info.history);
        return {
          label: name,
          data: padded,
          borderColor: COLORS[i % COLORS.length],
          fill: false
        };
      });
      const chartConfig = {
        type: 'line',
        data: { labels, datasets },
        options: {
          plugins: { legend: { position: 'bottom' } },
          scales: {
            x: { title: { display: true, text: 'Time' } },
            y: { title: { display: true, text: 'Price (BE)' } }
          }
        }
      };
      const chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}`;
      const chartEmbed = new EmbedBuilder()
        .setTitle('📊 통합 코인 가격 차트')
        .setImage(chartUrl)
        .setColor('#FF9900')
        .setTimestamp();

      return interaction.editReply({ embeds: [listEmbed, chartEmbed] });
    }

    // 매수
    if (sub === '매수') {
      const coin   = interaction.options.getString('코인');
      const amount = interaction.options.getNumber('수량');
      if (!coins[coin]) return interaction.editReply(`❌ '${coin}' 코인을 찾을 수 없습니다.`);
      const cost = coins[coin].price * amount;
      const bal  = getBE(interaction.user.id);
      if (bal < cost) {
        return interaction.editReply(`❌ BE 잔액 부족: 필요 ${cost.toLocaleString()} BE, 보유 ${bal.toLocaleString()} BE`);
      }
      await addBE(interaction.user.id, -cost, `매수: ${amount} ${coin}`);
      wallets[interaction.user.id] = wallets[interaction.user.id] || {};
      wallets[interaction.user.id][coin] = (wallets[interaction.user.id][coin] || 0) + amount;
      await saveJson(walletsPath, wallets);
      return interaction.editReply(`✅ ${coin} ${amount}개 매수 완료! 지불 ${cost.toLocaleString()} BE`);
    }

    // 매도
    if (sub === '매도') {
      const coin   = interaction.options.getString('코인');
      const amount = interaction.options.getNumber('수량');
      if (!coins[coin]) return interaction.editReply(`❌ '${coin}' 코인을 찾을 수 없습니다.`);
      const have = wallets[interaction.user.id]?.[coin] || 0;
      if (have < amount) return interaction.editReply(`❌ 보유 수량 부족: 보유 ${have}개`);
      const gross = coins[coin].price * amount;
      const fee   = Math.floor(gross * (loadConfig().fee || 0) / 100);
      const net   = gross - fee;
      await addBE(interaction.user.id, net, `매도: ${amount} ${coin}`);
      wallets[interaction.user.id][coin] -= amount;
      if (wallets[interaction.user.id][coin] <= 0) delete wallets[interaction.user.id][coin];
      await saveJson(walletsPath, wallets);
      return interaction.editReply(`✅ ${coin} ${amount}개 매도 완료! 수령 ${net.toLocaleString()} BE (수수료 ${fee} BE)`);
    }

    // 내코인
    if (sub === '내코인') {
      const userWallet = wallets[interaction.user.id] || {};
      const embed = new EmbedBuilder()
        .setTitle('💼 내코인 포트폴리오')
        .setColor('#00CC99')
        .setTimestamp();
      let total = 0;
      if (!Object.keys(userWallet).length) {
        embed.setDescription('보유한 코인이 없습니다.');
      } else {
        for (const [c, qty] of Object.entries(userWallet)) {
          const val = (coins[c]?.price || 0) * qty;
          total += val;
          embed.addFields({
            name: c,
            value: `수량: ${qty}개\n평가액: ${val.toLocaleString()} BE`,
            inline: false
          });
        }
        embed.addFields({
          name: '총 평가액',
          value: `${total.toLocaleString()} BE`,
          inline: false
        });
      }
      return interaction.editReply({ embeds: [embed] });
    }
  }
};
