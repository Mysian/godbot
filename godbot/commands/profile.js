const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

// 레벨 역할 매핑
const LEVEL_ROLES = {
  1295701019430227988: 0,
  1294560033274855425: 1,
  1294560128376246272: 2,
  1294560174610055198: 3,
  1273122761530933249: 4,
  1294560200476328038: 5,
  1272916156117680219: 10,
  1272916748420776039: 15,
  1272916831836835974: 20,
  1272917016927539295: 30,
  1294513168189624350: 40,
  1272917083327565876: 50,
  1294890825133854730: 60,
  1294890842049351690: 70,
  1294890857635381301: 80,
  1294890870910484563: 90,
  1272917121940328680: 99,
  1294561035277045770: 100,
  1294891086401241201: 150,
  1272917180870295682: 200,
  1294891155573702676: 250,
  1273038339972268035: 500,
  1294891219624792127: 750,
  1273038375397359779: 1000,
  1294891307113910372: 1500,
  1294891381172473896: 2000
};

// 파일 경로
const profilesPath = path.join(__dirname, '../data/profiles.json');
const favorPath = path.join(__dirname, '../data/favor.json');
const bePath = path.join(__dirname, '../data/BE.json');

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
const formatAmount = n => Number(n ?? 0).toLocaleString('ko-KR');

// 역할 → 레벨 변환
function getLevelFromRoles(member) {
  if (!member || !member.roles) return 0;
  const roleIDs = Array.from(member.roles.cache.keys());
  let maxLevel = 0;
  for (const roleId of roleIDs) {
    const lv = LEVEL_ROLES[roleId];
    if (lv && lv > maxLevel) maxLevel = lv;
  }
  return maxLevel;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('프로필')
    .setDescription('유저의 프로필을 확인합니다.')
    .addUserOption(opt => 
      opt.setName('유저')
        .setDescription('확인할 유저 (입력 안하면 본인)')
        .setRequired(false)
    ),
  async execute(interaction) {
    // 타겟 유저
    const target = interaction.options.getUser('유저') || interaction.user;
    const userId = target.id;
    const profiles = readJson(profilesPath);
    const favor = readJson(favorPath);
    const be = readJson(bePath);

    if (!profiles[userId]) {
      return interaction.reply({ content: target.id === interaction.user.id
        ? '먼저 `/프로필등록`으로 프로필을 등록해주세요!'
        : '해당 유저는 프로필이 없습니다.', ephemeral: true });
    }

    const profile = profiles[userId];
    let member = await interaction.guild.members.fetch(userId).catch(() => null);
    // 레벨 계산
    const level = getLevelFromRoles(member);
    const nickname = member?.nickname || target.username;

    // 상태 메시지 이모지/형식
    const statusMsg = `🗨️ 『${profile.statusMsg?.trim() ? profile.statusMsg : '상태 메시지가 없습니다.'}』`;

    // 서버 입장 시간
    const joinedAt = member?.joinedAt || new Date();
    const joinedStr = `<t:${Math.floor(joinedAt.getTime()/1000)}:R>`;
    const favorValue = favor[userId] ?? 0;
    const favorEmoji = getFavorEmoji(favorValue);
    const beAmount = formatAmount(be[userId]?.amount ?? 0);

    // 임베드
    const embed = new EmbedBuilder()
      .setTitle(`프로필 정보`)
      .setThumbnail(target.displayAvatarURL())
      .setColor(favorValue >= 15 ? 0xff71b3 : favorValue >= 5 ? 0x82d8ff : 0xbcbcbc)
      .setDescription(
        `<@${userId}> 닉네임: ${nickname} 　Lv.${level}\n` +
        statusMsg +
        `\n🔷 파랑 정수(BE): **${beAmount} BE**`
      )
      .addFields(
        { name: '🎮 선호 게임', value: (profile.favGames && profile.favGames.length > 0) ? profile.favGames.map(g => `• ${g}`).join('\n') : '없음', inline: false },
        { name: '🟠 오버워치 티어/포지션', value: `${getTierEmoji(profile.owTier)} ${profile.owTier || '없음'}`, inline: true },
        { name: '🔵 롤 티어/포지션', value: `${getTierEmoji(profile.lolTier)} ${profile.lolTier || '없음'}`, inline: true },
        { name: '💻 스팀 닉네임', value: profile.steamNick ? `🎮 ${profile.steamNick}` : '없음', inline: true },
        { name: '🔖 롤 닉네임#태그', value: profile.lolNick ? `🔵 ${profile.lolNick}` : '없음', inline: true },
        { name: '🟦 배틀넷 닉네임', value: profile.bnetNick ? `⚡ ${profile.bnetNick}` : '없음', inline: true },
        { name: '⏰ 서버 입장', value: joinedStr, inline: true },
        { name: `${favorEmoji} 호감도`, value: String(favorValue), inline: true }
      )
      .setFooter({
        text: (userId === interaction.user.id ? '내 프로필은 오직 나만 볼 수 있어요!' : '이 정보는 오직 명령어 입력자만 볼 수 있어요!'),
        iconURL: interaction.client.user.displayAvatarURL()
      });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
