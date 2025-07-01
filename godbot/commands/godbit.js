// 📁 commands/godbit.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const lockfile = require('proper-lockfile');
const { addBE, getBE, loadConfig } = require('./be-util.js');

// Data file paths
const coinsPath = path.join(__dirname, '../data/coins.json');
const walletsPath = path.join(__dirname, '../data/godbit-wallets.json');

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

// Simulate market events: price update, random listing/delist
async function simulateMarket(interaction, coins) {
  const config = loadConfig();
  // Price movement ±10%
  for (const [name, info] of Object.entries(coins)) {
    const delta = (Math.random() * 0.2) - 0.1; // -0.1 to +0.1
    const newPrice = Math.max(1, Math.floor(info.price * (1 + delta)));
    info.price = newPrice;
    info.history.push(newPrice);
  }
  // Random new coin listing (5% chance)
  if (Math.random() < 0.05) {
    const members = interaction.guild.members.cache.filter(m => /^[가-힣]{2}$/.test(m.displayName));
    if (members.size > 0) {
      const arr = Array.from(members.values());
      const pick = arr[Math.floor(Math.random() * arr.length)];
      const coinName = `${pick.displayName}코인`;
      if (!coins[coinName]) {
        coins[coinName] = { price: Math.floor(Math.random() * 900) + 100, history: [] };
      }
    }
  }
  // Random delisting (2% chance)
  if (Math.random() < 0.02) {
    const otherCoins = Object.keys(coins).filter(n => n !== '까리코인');
    if (otherCoins.length > 0) {
      const rem = otherCoins[Math.floor(Math.random() * otherCoins.length)];
      delete coins[rem];
    }
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('갓비트')
    .setDescription('가상 코인 거래 시스템')
    .addSubcommand(sub => sub.setName('list').setDescription('코인 목록 및 시세 업데이트'))
    .addSubcommand(sub =>
      sub
        .setName('buy')
        .setDescription('코인 매수')
        .addStringOption(opt => opt.setName('코인').setDescription('코인 이름').setRequired(true))
        .addNumberOption(opt => opt.setName('수량').setDescription('구매 수량').setRequired(true))
    )
    .addSubcommand(sub =>
      sub
        .setName('sell')
        .setDescription('코인 매도')
        .addStringOption(opt => opt.setName('코인').setDescription('코인 이름').setRequired(true))
        .addNumberOption(opt => opt.setName('수량').setDescription('판매 수량').setRequired(true))
    )
    .addSubcommand(sub => sub.setName('portfolio').setDescription('내 코인 보유 현황 확인'))
    .addSubcommand(sub =>
      sub
        .setName('graph')
        .setDescription('코인 가격 차트 보기')
        .addStringOption(opt => opt.setName('코인').setDescription('코인 이름').setRequired(true))
    ),

  async execute(interaction) {
    await interaction.deferReply();
    const coins = await loadJson(coinsPath, {});
    await ensureBaseCoin(coins);
    const wallets = await loadJson(walletsPath, {});
    const sub = interaction.options.getSubcommand();

    if (sub === 'list') {
      await simulateMarket(interaction, coins);
      await saveJson(coinsPath, coins);
      const embed = new EmbedBuilder().setTitle('📈 갓비트 코인 목록').setTimestamp();
      for (const [name, info] of Object.entries(coins)) {
        embed.addFields({ name, value: `현재가: ${info.price.toLocaleString()} BE`, inline: true });
      }
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'buy') {
      const coin = interaction.options.getString('코인');
      const amount = interaction.options.getNumber('수량');
      if (!coins[coin]) return interaction.editReply(`❌ '${coin}' 코인을 찾을 수 없습니다.`);
      const cost = coins[coin].price * amount;
      const bal = getBE(interaction.user.id);
      if (bal < cost) return interaction.editReply(`❌ BE 잔액이 부족합니다. 필요한 BE: ${cost.toLocaleString()}, 보유 BE: ${bal.toLocaleString()}`);
      await addBE(interaction.user.id, -cost, `구매: ${amount} ${coin}`);
      wallets[interaction.user.id] = wallets[interaction.user.id] || {};
      wallets[interaction.user.id][coin] = (wallets[interaction.user.id][coin] || 0) + amount;
      await saveJson(walletsPath, wallets);
      return interaction.editReply(`✅ ${coin} ${amount}개 매수 완료! 지불 BE: ${cost.toLocaleString()}`);
    }

    if (sub === 'sell') {
      const coin = interaction.options.getString('코인');
      const amount = interaction.options.getNumber('수량');
      if (!coins[coin]) return interaction.editReply(`❌ '${coin}' 코인을 찾을 수 없습니다.`);
      const holding = wallets[interaction.user.id]?.[coin] || 0;
      if (holding < amount) return interaction.editReply(`❌ 보유 수량이 부족합니다. 보유: ${holding}`);
      const sellGross = coins[coin].price * amount;
      const feePercent = loadConfig().fee || 0;
      const fee = Math.floor(sellGross * feePercent / 100);
      const net = sellGross - fee;
      await addBE(interaction.user.id, net, `판매: ${amount} ${coin}`);
      wallets[interaction.user.id][coin] -= amount;
      if (wallets[interaction.user.id][coin] <= 0) delete wallets[interaction.user.id][coin];
      await saveJson(walletsPath, wallets);
      return interaction.editReply(`✅ ${coin} ${amount}개 매도 완료! 수령 BE: ${net.toLocaleString()} (수수료 ${fee} BE)`);
    }

    if (sub === 'portfolio') {
      const userWallet = wallets[interaction.user.id] || {};
      const embed = new EmbedBuilder().setTitle('💼 내 갓비트 포트폴리오').setTimestamp();
      let totalVal = 0;
      for (const [coin, qty] of Object.entries(userWallet)) {
        const price = coins[coin]?.price || 0;
        const value = price * qty;
        totalVal += value;
        embed.addFields({ name: coin, value: `수량: ${qty}, 평가액: ${value.toLocaleString()} BE`, inline: false });
      }
      embed.addFields({ name: '총 평가액', value: `${totalVal.toLocaleString()} BE`, inline: false });
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'graph') {
      const coin = interaction.options.getString('코인');
      const info = coins[coin];
      if (!info) return interaction.editReply(`❌ '${coin}' 코인을 찾을 수 없습니다.`);
      const prices = info.history;
      const labels = prices.map((_, i) => i + 1);
      const chartConfig = {
        type: 'line',
        data: { labels, datasets: [{ label: coin, data: prices }] }
      };
      const chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}`;
      const embed = new EmbedBuilder().setTitle(`📊 ${coin} 가격 차트`).setImage(chartUrl).setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }
  }
};
