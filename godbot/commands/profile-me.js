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
    .setName('내프로필')
    .setDescription('본인의 프로필을 확인합니다.'),
  async execute(interaction) {
    const userId = interaction.user.id;
    const profiles = readJson(profilesPath);
    const favor = readJson(favorPath);

    if (!profiles[userId]) {
      return interaction.reply({ content: '먼저 `/프로필등록`으로 프로필을 등록해주세요!', ephemeral: true });
    }

    const profile = profiles[userId];
    const user = await interaction.guild.members.fetch(userId);
    const joinedAt = user.joinedAt || new Date();
    const joinedStr = `<t:${Math.floor(joinedAt.getTime()/1000)}:R>`;
    const favorValue = favor[userId] ?? 0;
    const favorEmoji = getFavorEmoji(favorValue);

    const embed = new EmbedBuilder()
      .setTitle(`🙋‍♂️ ${user.user.username}님의 프로필`)
      .setThumbnail(user.user.displayAvatarURL())
      .setColor(favorValue >= 15 ? 0xff71b3 : favorValue >= 5 ? 0x82d8ff : 0xbcbcbc)
      .setDescription("🔖 여러분의 게임/소통 프로필 정보예요!\n**정보를 예쁘게 채워서 서버 활동에 도움받아보세요!**")
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
      .setFooter({ text: '내 프로필은 오직 나만 볼 수 있어요!', iconURL: interaction.client.user.displayAvatarURL() });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
