// 📁 commands/be.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const bePath = path.join(__dirname, '../data/BE.json');
const configPath = path.join(__dirname, '../data/BE-config.json');

// 유틸 함수
function loadBE() {
  if (!fs.existsSync(bePath)) fs.writeFileSync(bePath, '{}');
  return JSON.parse(fs.readFileSync(bePath, 'utf8'));
}
function saveBE(data) {
  fs.writeFileSync(bePath, JSON.stringify(data, null, 2));
}
function loadConfig() {
  if (!fs.existsSync(configPath)) fs.writeFileSync(configPath, '{"fee":0}');
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}
function saveConfig(data) {
  fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
}

// 잔액 조회
function getBE(userId) {
  const be = loadBE();
  return be[userId]?.amount || 0;
}
// 지급/차감
function addBE(userId, amount, reason) {
  const be = loadBE();
  if (!be[userId]) be[userId] = { amount: 0, history: [] };
  be[userId].amount += amount;
  if (be[userId].amount < 0) be[userId].amount = 0;
  be[userId].history.push({
    type: amount > 0 ? "earn" : "spend",
    amount: Math.abs(amount),
    reason,
    timestamp: Date.now()
  });
  saveBE(be);
}
// 송금 (수수료 적용)
function transferBE(fromId, toId, amount, feePercent) {
  const be = loadBE();
  if (!be[fromId]) be[fromId] = { amount: 0, history: [] };
  if (!be[toId]) be[toId] = { amount: 0, history: [] };
  const fee = Math.floor(amount * feePercent / 100);
  const sendAmount = amount - fee;
  if (be[fromId].amount < amount) return { ok: false, reason: "잔액 부족" };
  if (sendAmount <= 0) return { ok: false, reason: "수수료가 전액 초과" };
  // 송금 차감
  be[fromId].amount -= amount;
  be[fromId].history.push({
    type: "spend",
    amount: amount,
    reason: `정수송금 -> <@${toId}> (수수료 ${fee}BE)`,
    timestamp: Date.now()
  });
  // 수령인 지급
  be[toId].amount += sendAmount;
  be[toId].history.push({
    type: "earn",
    amount: sendAmount,
    reason: `정수송금 ← <@${fromId}> (수수료 ${fee}BE)`,
    timestamp: Date.now()
  });
  saveBE(be);
  return { ok: true, fee, sendAmount };
}

module.exports = {
  data: [
    // /정수확인
    new SlashCommandBuilder()
      .setName('정수확인')
      .setDescription('내 파랑 정수(BE) 잔액을 확인합니다.'),
    // /정수지급
    new SlashCommandBuilder()
      .setName('정수지급')
      .setDescription('파랑 정수(BE)를 지급하거나 차감합니다.')
      .addUserOption(opt => opt.setName('유저').setDescription('대상 유저').setRequired(true))
      .addIntegerOption(opt => opt.setName('금액').setDescription('지급/차감할 금액').setRequired(true)),
    // /정수송금
    new SlashCommandBuilder()
      .setName('정수송금')
      .setDescription('다른 유저에게 파랑 정수(BE)를 송금합니다.')
      .addUserOption(opt => opt.setName('유저').setDescription('받을 유저').setRequired(true))
      .addIntegerOption(opt => opt.setName('금액').setDescription('송금할 금액').setRequired(true)),
    // /정수관리 (관리자 전용)
    new SlashCommandBuilder()
      .setName('정수관리')
      .setDescription('정수 송금 수수료율(%)을 설정합니다. (관리자만)')
      .addIntegerOption(opt => opt.setName('수수료').setDescription('송금 수수료율(%)').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  ],
  async execute(interaction) {
    // 명령어 분기
    const command = interaction.commandName;
    if (command === '정수확인') {
      const be = getBE(interaction.user.id);
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('파랑 정수 잔액')
            .setDescription(`<@${interaction.user.id}>님의 보유 파랑 정수(BE)는 **${be} BE** 입니다.`)
            .setColor(0x3399ff)
        ],
        ephemeral: true
      });
    }
    if (command === '정수지급') {
      const target = interaction.options.getUser('유저');
      const amount = interaction.options.getInteger('금액');
      if (amount === 0) return interaction.reply({ content: '0 BE는 지급/차감할 수 없습니다.', ephemeral: true });
      if (amount < 0) {
        // 차감
        const current = getBE(target.id);
        if (current <= 0) return interaction.reply({ content: '해당 유저는 차감할 BE가 없습니다.', ephemeral: true });
        const minus = Math.min(current, Math.abs(amount));
        addBE(target.id, -minus, `관리자 차감 by <@${interaction.user.id}>`);
        return interaction.reply({ content: `<@${target.id}>의 파랑 정수(BE)에서 **${minus} BE** 차감됨!`, ephemeral: false });
      } else {
        // 지급
        addBE(target.id, amount, `관리자 지급 by <@${interaction.user.id}>`);
        return interaction.reply({ content: `<@${target.id}>에게 **${amount} BE** 지급 완료!`, ephemeral: false });
      }
    }
    if (command === '정수송금') {
      const to = interaction.options.getUser('유저');
      const amount = interaction.options.getInteger('금액');
      if (to.id === interaction.user.id) return interaction.reply({ content: '자기 자신에게는 송금할 수 없습니다.', ephemeral: true });
      if (amount <= 0) return interaction.reply({ content: '1 BE 이상만 송금할 수 있습니다.', ephemeral: true });
      const config = loadConfig();
      const fromBalance = getBE(interaction.user.id);
      if (fromBalance < amount) return interaction.reply({ content: '잔액이 부족합니다.', ephemeral: true });
      const { ok, fee, sendAmount, reason } = transferBE(interaction.user.id, to.id, amount, config.fee || 0);
      if (!ok) return interaction.reply({ content: `송금 실패: ${reason}`, ephemeral: true });
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('파랑 정수 송금')
            .setDescription(`**${amount} BE**를 <@${to.id}>에게 송금 완료!\n수수료: **${fee} BE**\n실제 입금액: **${sendAmount} BE**`)
            .setColor(0x3399ff)
        ]
      });
    }
    if (command === '정수관리') {
      // 관리자만
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: '이 명령어는 관리자만 사용할 수 있습니다.', ephemeral: true });
      }
      const fee = interaction.options.getInteger('수수료');
      if (fee < 0 || fee > 100) return interaction.reply({ content: '수수료는 0~100% 범위로 입력해 주세요.', ephemeral: true });
      const config = loadConfig();
      config.fee = fee;
      saveConfig(config);
      return interaction.reply({ content: `정수 송금 수수료를 **${fee}%**로 설정 완료!`, ephemeral: false });
    }
  },
};
