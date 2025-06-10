const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const profilesPath = path.join(__dirname, '../data/profiles.json');
const favorPath = path.join(__dirname, '../data/favor.json');
const champPath = path.join(__dirname, '../data/champion-records.json');

function readJson(p) { if (!fs.existsSync(p)) return {}; return JSON.parse(fs.readFileSync(p)); }

module.exports = {
  data: new SlashCommandBuilder()
    .setName('내프로필')
    .setDescription('본인의 프로필을 확인합니다.'),
  async execute(interaction) {
    const userId = interaction.user.id;
    const profiles = readJson(profilesPath);
    const favor = readJson(favorPath);
    const championRecords = readJson(champPath);

    if (!profiles[userId]) {
      return interaction.reply({ content: '먼저 `/프로필등록`으로 프로필을 등록해주세요!', ephemeral: true });
    }
    const profile = profiles[userId];
    const user = await interaction.guild.members.fetch(userId);
    const joinedAt = user.joinedAt || new Date();
    const joinedStr = `<t:${Math.floor(joinedAt.getTime()/1000)}:R>`;

    // 챔피언 기록
    let champInfo = '';
    if (championRecords[userId]) {
      const c = championRecords[userId];
      champInfo = `챔피언: **${c.name}**\n승/무/패: **${c.win}/${c.draw}/${c.lose}**`;
    } else {
      champInfo = '챔피언 기록 없음';
    }
    const embed = new EmbedBuilder()
      .setTitle(`${user.user.username}님의 프로필`)
      .setThumbnail(user.user.displayAvatarURL())
      .setColor(0x5b96fa)
      .addFields(
        { name: '상태 메시지', value: profile.statusMsg || '없음', inline: false },
        { name: '선호 게임', value: (profile.favGames && profile.favGames.length > 0) ? profile.favGames.join(', ') : '없음', inline: false },
        { name: '오버워치 티어/포지션', value: profile.owTier || '없음', inline: true },
        { name: '롤 티어/포지션', value: profile.lolTier || '없음', inline: true },
        { name: '스팀 닉네임', value: profile.steamNick || '없음', inline: true },
        { name: '롤 닉네임#태그', value: profile.lolNick || '없음', inline: true },
        { name: '배틀넷 닉네임', value: profile.bnetNick || '없음', inline: true },
        { name: '호감도', value: String(favor[userId] || 0), inline: true },
        { name: '서버 입장', value: joinedStr, inline: true },
        { name: '챔피언 기록', value: champInfo, inline: false }
      );
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
