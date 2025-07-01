// 📁 commands/godbit.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const lockfile = require('proper-lockfile');
const { addBE, getBE, loadConfig } = require('./be-util.js');

// Data file paths
const coinsPath    = path.join(__dirname, '../data/coins.json');
const walletsPath  = path.join(__dirname, '../data/godbit-wallets.json');
const MAX_COINS    = 10;

// Load or initialize JSON data with lock
async function loadJson(filePath, defaultData) {
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
  let release;
  try {
    release = await lockfile.lock(filePath, { retries: 5, minTimeout: 50 });
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } finally {
    if (release) await release();
  }
}
async function saveJson(filePath, data) {
  let release;
  try {
    release = await lockfile.lock(filePath, { retries: 5, minTimeout: 50 });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } finally {
    if (release) await release();
  }
}

// Ensure base coin exists
async function ensureBaseCoin(coins) {
  if (!coins['까리코인']) {
    coins['까리코인'] = { price: 1000, history: [1000] };
  }
}

// Simulate market: 가격 변동, 상장, 폐지, 최대 개수 유지
async function simulateMarket(interaction, coins) {
  // 1) 가격 변동 ±10%
  for (const info of Object.values(coins)) {
    const delta = (Math.random() * 0.2) - 0.1;
    const newPrice = Math.max(1, Math.floor(info.price * (1 + delta)));
    info.price = newPrice;
    info.history.push(newPrice);
  }
  // 2) 랜덤 상장 (5% 확률)
  if (Math.random() < 0.05) {
    const members = interaction.guild.members.cache.filter(m => /^[가-힣]{2}$/.test(m.displayName));
    if (members.size > 0) {
      const pick = Array.from(members.values())[Math.floor(Math.random() * members.size)];
      const coinName = `${pick.displayName}코인`;
      if (!coins[coinName]) {
        coins[coinName] = { price: Math.floor(Math.random() * 900) + 100, history: [coins['까리코인'].price] };
      }
    }
  }
  // 3) 랜덤 폐지 (2% 확률)
  if (Math.random() < 0.02) {
    const others = Object.keys(coins).filter(n => n !== '까리코인');
    if (others.length > 0) {
      delete coins[others[Math.floor(Math.random() * others.length)]];
    }
  }
  // 4) 최대 코인 개수 유지
  while (Object.keys(coins).length > MAX_COINS) {
    const others = Object.keys(coins).filter(n => n !== '까리코인');
    if (others.length === 0) break;
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
        .setDescription('코인 목록과 (원하면) 특정 코인 차트를 동시에 표시')
        .addStringOption(opt =>
          opt
            .setName('코인')
            .setDescription('차트로 보고 싶은 코인 이름 (선택)')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('매수')
        .setDescription('코인 매수')
        .addStringOption(opt => opt.setName('코인').setDescription('코인 이름').setRequired(true))
        .addNumberOption(opt => opt.setName('수량').setDescription('구매 수량').setRequired(true))
    )
    .addSubcommand(sub =>
      sub
        .setName('매도')
        .setDescription('코인 매도')
        .addStringOption(opt => opt.setName('코인').setDescription('코인 이름').setRequired(true))
        .addNumberOption(opt => opt.setName('수량').setDescription('판매 수량').setRequired(true))
    )
    .addSubcommand(sub =>
      sub
        .setName('내코인')
        .setDescription('내 코인 보유 현황 확인')
    ),

  async execute(interaction) {
    await interaction.deferReply();
    const coins   = await loadJson(coinsPath, {});
    const wallets = await loadJson(walletsPath, {});
    await ensureBaseCoin(coins);

    const sub = interaction.options.getSubcommand();
    // 통합: 코인차트
    if (sub === '코인차트') {
      await simulateMarket(interaction, coins);
      await saveJson(coinsPath, coins);

      // ► 목록 Embed
      const listEmbed = new EmbedBuilder()
        .setTitle('📈 갓비트 코인 목록')
        .setDescription(
          Object.entries(coins)
            .map(([name, info]) => `• **${name}**: ${info.price.toLocaleString()} BE`)
            .join('\n')
        )
        .setColor('#0099FF')
        .setTimestamp();

      const embeds = [listEmbed];
      // ► 차트 Embed (코인 옵션이 있을 때만)
      const coinName = interaction.options.getString('코인');
      if (coinName) {
        if (!coins[coinName]) {
          return interaction.editReply(`❌ '${coinName}' 코인을 찾을 수 없습니다.`);
        }
        const prices = coins[coinName].history;
        const labels = prices.map((_, i) => i + 1);
        const chartConfig = {
          type: 'line',
          data: {
            labels,
            datasets: [{
              label: coinName,
              data: prices,
              fill: false,
              segment: {
                borderColor: ctx => ctx.p1.parsed.y > ctx.p0.parsed.y ? 'red' : 'blue'
              }
            }]
          },
          options: {
            plugins: { legend: { display: false } },
            scales: {
              x: { title: { display: true, text: 'Time' } },
              y: { title: { display: true, text: 'Price (BE)' } }
            }
          }
        };
        const chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}`;
        const chartEmbed = new EmbedBuilder()
          .setTitle(`📊 ${coinName} 코인차트`)
          .setImage(chartUrl)
          .setColor('#FF9900')
          .setTimestamp();
        embeds.push(chartEmbed);
      }

      return interaction.editReply({ embeds });
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
