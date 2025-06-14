const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const profilesPath = path.join(__dirname, '../data/profiles.json');
const favorPath = path.join(__dirname, '../data/favor.json');

function readJson(p) { if (!fs.existsSync(p)) return {}; return JSON.parse(fs.readFileSync(p)); }

function getFavorEmoji(favor) {
  if (favor >= 15) return '💖';
  if (favor >= 5) return '😊';
  if (favor >= 0) return '🤝';
  return '💢';
}

function getTierEmoji(str) {
  if (!str) return '❔';
  if (str.includes('챌린저') || str.toLowerCase().includes('challenger')) return '🌟';
  if (str.includes('마스터') || str.toLowerCase().includes('master')) return '🔱';
  if (str.includes('다이아') || str.toLowerCase().includes('diamond')) return '💎';
  if (str.includes('플래') || str.toLowerCase().includes('plat')) return '🥈';
  if (str.includes('골드') || str.toLowerCase().includes('gold')) return '🥇';
  if (str.includes('실버') || str.toLowerCase().includes('silver')) return '🥉';
  if (str.includes('브론즈') || str.toLowerCase().includes('bronze')) return '🥄';
  return '🎮';
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('프로필조회')
    .setDescription('유저의 프로필을 확인합니다.')
    .addUserOption(opt => opt.setName('유저').setDescription('확인할 유저').setRequired(true)),
  async execute(interaction) {
    const target = interaction.options.getUser('유저');
    const userId = target.id;
    const profiles = readJson(profilesPath);
    const favor = readJson(favorPath);

    if (!profiles[userId]) {
      return interaction.reply({ content: '해당 유저는 프로필이 없습니다.', ephemeral: true });
    }

    const profile = profiles[userId];
    const member = await interaction.guild.members.fetch(userId).catch(() => null);
    const joinedAt = member?.joinedAt || new Date();
    const joinedStr = `<t:${Math.floor(joinedAt.getTime()/1000)}:R>`;

    const favorValue = favor[userId] ?? 0;
    const favorEmoji = getFavorEmoji(favorValue);

    const embed = new EmbedBuilder()
      .setTitle(`🧑‍💻 ${target.username}님의 프로필`)
      .setThumbnail(target.displayAvatarURL())
      .setColor(favorValue >= 15 ? 0xff71b3 : favorValue >= 5 ? 0x82d8ff : 0xfa5b5b)
      .setDescription("🔍 해당 유저의 게임/소통 프로필 정보입니다!\n\n__신뢰와 호감도가 높을수록 더 많은 사람들과 소통하기 좋아요!__")
      .addFields(
        { name: '💬 상태 메시지', value: profile.statusMsg || '없음', inline: false },
        { name: '🎮 선호 게임', value: (profile.favGames && profile.favGames.length > 0) ? profile.favGames.map(g => `• ${g}`).join('\n') : '없음', inline: false },
        { name: '🟠 오버워치 티어/포지션', value: `${getTierEmoji(profile.owTier)} ${profile.owTier || '없음'}`, inline: true },
        { name: '🔵 롤 티어/포지션', value: `${getTierEmoji(profile.lolTier)} ${profile.lolTier || '없음'}`, inline: true },
        { name: '💻 스팀 닉네임', value: profile.steamNick ? `🎮 ${profile.steamNick}` : '없음', inline: true },
        { name: '🔖 롤 닉네임#태그', value: profile.lolNick ? `🔵 ${profile.lolNick}` : '없음', inline: true },
        { name: '🟦 배틀넷 닉네임', value: profile.bnetNick ? `⚡ ${profile.bnetNick}` : '없음', inline: true },
        { name: '⏰ 서버 입장', value: joinedStr, inline: true },
        { name: `${favorEmoji} 호감도`, value: String(favorValue), inline: true }
      )
      .setFooter({ text: '이 정보는 오직 명령어 입력자만 볼 수 있어요!', iconURL: interaction.client.user.displayAvatarURL() });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
