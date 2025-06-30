// commands/profile.js
// 프로필 조회 명령어 ("/프로필")
// - /프로필등록 을 하지 않은 유저도 기본 프로필 출력
// - 플레이 스타일 역할(빡겜러/즐빡겜러/즐겜러) 자동 감지
// - 가장 친한 친구 3명(닉네임) 출력
// -----------------------------------------------------------------------------
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs   = require("fs");
const path = require("path");

// ---- 파일 경로 ----
const profilesPath = path.join(__dirname, "../data/profiles.json");
const favorPath    = path.join(__dirname, "../data/favor.json");
const bePath       = path.join(__dirname, "../data/BE.json");

// ---- 플레이 스타일 역할 ID ----
const PLAY_STYLE_ROLES = {
  "빡겜러":   "1210762363704311838",
  "즐빡겜러": "1210762298172383273",
  "즐겜러":   "1210762420151394354",
};

// ---- 관계 모듈 ----
const relationship = require("../utils/relationship.js");

// ---- 유틸 ----
const readJson = p => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p)) : {});
const formatAmount = n => Number(n ?? 0).toLocaleString("ko-KR");

function getFavorEmoji(favor) {
  if (favor >= 15) return "💖";
  if (favor >= 5)  return "😊";
  if (favor >= 0)  return "🤝";
  return "💢";
}
function getTierEmoji(str = "") {
  const lower = str.toLowerCase();
  if (!str)                                   return "❔";
  if (str.includes("챌린저") || lower.includes("challenger")) return "🌟";
  if (str.includes("마스터")  || lower.includes("master"))    return "🔱";
  if (str.includes("다이아")  || lower.includes("diamond"))   return "💎";
  if (str.includes("플래")    || lower.includes("plat"))      return "🥈";
  if (str.includes("골드")    || lower.includes("gold"))      return "🥇";
  if (str.includes("실버")    || lower.includes("silver"))    return "🥉";
  if (str.includes("브론즈")  || lower.includes("bronze"))    return "🥄";
  return "🎮";
}
function getPlayStyle(member) {
  if (!member) return "미설정";
  for (const [name, id] of Object.entries(PLAY_STYLE_ROLES)) {
    if (member.roles.cache.has(id)) return name;
  }
  return "미설정";
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("프로필")
    .setDescription("유저의 프로필을 확인합니다.")
    .addUserOption(opt =>
      opt.setName("유저")
        .setDescription("확인할 유저 (입력 안하면 본인)")
        .setRequired(false)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser("유저") || interaction.user;
    const userId = target.id;

    // ---- JSON 로드 ----
    const profiles = readJson(profilesPath);
    const favor    = readJson(favorPath);
    const be       = readJson(bePath);

    // ---- 프로필 기본값 ----
    const defaultProfile = {
      statusMsg: "",
      favGames: [],
      owTier: "",
      lolTier: "",
      steamNick: "",
      lolNick: "",
      bnetNick: "",
    };
    const profile = profiles[userId] || defaultProfile;

    // ---- 길드 멤버 정보 ----
    const member = await interaction.guild.members.fetch(userId).catch(() => null);

    // ---- 필드 가공 ----
    const statusMsg = `🗨️ 『${profile.statusMsg?.trim() || "상태 메시지가 없습니다."}』`;
    const joinedAt  = member?.joinedAt || new Date();
    const joinedStr = `<t:${Math.floor(joinedAt.getTime() / 1000)}:R>`;
    const favorVal  = favor[userId] ?? 0;
    const favorEmoji= getFavorEmoji(favorVal);
    const beAmount  = formatAmount(be[userId]?.amount ?? 0);
    const playStyle = getPlayStyle(member);

    // ---- 가장 친한 친구 3명 ----
    let friendsStr = "없음";
    try {
      const top = relationship.getTopRelations(userId, 3);
      if (top.length) {
        const names = await Promise.all(
          top.map(async ({ userId: fid }) => {
            const m = await interaction.guild.members.fetch(fid).catch(() => null);
            return m ? m.displayName : "(탈주)";
          })
        );
        friendsStr = names.map(n => `• ${n}`).join("\n");
      }
    } catch (e) {
      console.error("[TopRelations 오류]", e);
    }

    // ---- Embed ----
    const embed = new EmbedBuilder()
      .setTitle("프로필 정보")
      .setThumbnail(target.displayAvatarURL())
      .setColor(favorVal >= 15 ? 0xff71b3 : favorVal >= 5 ? 0x82d8ff : 0xbcbcbc)
      .setDescription([
        `<@${userId}> 님의 프로필`,
        statusMsg,
        `🔷 파랑 정수(BE): **${beAmount} BE**`,
      ].join("\n"))
      .addFields(
        { name: "🎮 플레이 스타일", value: playStyle, inline: true },
        { name: `${favorEmoji} 호감도`,      value: String(favorVal), inline: true },
        { name: "⏰ 서버 입장",             value: joinedStr,        inline: true },
        { name: "🎲 선호 게임",            value: profile.favGames.length ? profile.favGames.map(g => `• ${g}`).join("\n") : "없음", inline: false },
        { name: "🟠 오버워치",            value: `${getTierEmoji(profile.owTier)} ${profile.owTier || "없음"}`, inline: true },
        { name: "🔵 롤",                 value: `${getTierEmoji(profile.lolTier)} ${profile.lolTier || "없음"}`, inline: true },
        { name: "💻 스팀",                value: profile.steamNick || "없음", inline: true },
        { name: "🔖 롤 닉네임",           value: profile.lolNick   || "없음", inline: true },
        { name: "🟦 배틀넷",              value: profile.bnetNick  || "없음", inline: true },
        { name: "👥 가장 친한 친구",      value: friendsStr,                        inline: false },
      )
      .setFooter({
        text: userId === interaction.user.id ? "내 프로필은 오직 나만 볼 수 있어요!" : "이 정보는 오직 명령어 입력자만 볼 수 있어요!",
        iconURL: interaction.client.user.displayAvatarURL(),
      });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
