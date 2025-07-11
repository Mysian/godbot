// commands/approve-test.js

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../utils/approve-test-db.json');
const TEST_CHANNEL_ID = '1276751288117235755';

function getRandomMember(guild) {
  const members = guild.members.cache.filter(m => !m.user.bot).map(m => m);
  return members[Math.floor(Math.random() * members.length)];
}
function loadDB() {
  if (!fs.existsSync(DB_PATH)) return [];
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}
function saveDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('승인테스트')
    .setDescription('승인 테스트 임베드를 발송합니다.')
    .addStringOption(option =>
      option.setName('유저명')
        .setDescription('승인 테스트에 사용할 유저 닉네임')
        .setRequired(true)
    ),
  async execute(interaction) {
    if (!interaction.member.permissions.has('Administrator')) {
      return interaction.reply({ content: '권한이 없습니다.', ephemeral: true });
    }
    const inputNick = interaction.options.getString('유저명');
    const randomMember = getRandomMember(interaction.guild);
    if (!randomMember) return interaction.reply({ content: '테스트 가능한 유저가 없습니다.', ephemeral: true });

    // 테스트용 데이터
    const joinHistory = "처음 입장한 유저예요.";
    const banHistory = "연령 제한 기록이 없어요.";
    const recommender = "네이버";
    const birth = "1994";
    const gender = "남";

    const embed = new EmbedBuilder()
      .setTitle('새로운 승인 요청')
      .setDescription(`${randomMember} 님이 승인을 기다리고 있습니다.`)
      .setThumbnail(randomMember.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: '닉네임', value: inputNick, inline: true },
        { name: '출생년도', value: birth, inline: true },
        { name: '성별', value: gender, inline: true },
        { name: '\u200B', value: '\u200B', inline: false },
        { name: '입장 이력', value: joinHistory, inline: false },
        { name: '연령 제한 이력', value: banHistory, inline: false },
        { name: '추천인', value: recommender, inline: false },
        { name: '승인:', value: `이 거절: 이 역할 수: 11`, inline: false },
      )
      .setColor(0x2b8dd6);

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder().setCustomId('approve').setLabel('승인').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('approve_silent').setLabel('조용히 승인').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('reject').setLabel('거절').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('reject_reason').setLabel('거절(사유 입력)').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('edit_nick').setLabel('닉네임 수정 승인').setStyle(ButtonStyle.Primary),
      );

    const msg = await interaction.guild.channels.cache.get(TEST_CHANNEL_ID).send({
      content: `@${randomMember.user.username}님의 승인 요청입니다.`,
      embeds: [embed],
      components: [row],
    });
    await msg.react('✅');
    await msg.react('❌');

    // DB 저장
    const db = loadDB();
    db.push({
      messageId: msg.id,
      targetUserId: randomMember.id,
      testNick: inputNick,
      startTime: Date.now()
    });
    saveDB(db);

    await interaction.reply({ content: '테스트 승인 임베드를 전송했습니다.', ephemeral: true });
  },
};
