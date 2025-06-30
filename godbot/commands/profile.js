// commands/profile.js
// -----------------------------------------------------------------------------
// "/프로필" 명령어
//  - /프로필등록 없이도 기본 프로필 출력
//  - 플레이 스타일 역할 자동 감지 (빡겜러 / 즐빡겔러 / 즐겜러)
//  - 가장 친한 친구 TOP3 (닉네임) 표시 – 탈주자 필터링
//  - 최근 7일 채팅·음성 사용량 통계
// -----------------------------------------------------------------------------
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs   = require("fs");
const path = require("path");

// ---- 외부 모듈 --------------------------------------------------------------
const relationship = require("../utils/relationship.js");
const activity     = require("../utils/activity-tracker.js");

// ---- 파일 경로 --------------------------------------------------------------
const profilesPath = path.join(__dirname, "../data/profiles.json");
const favorPath    = path.join(__dirname, "../data/favor.json");
const bePath       = path.join(__dirname, "../data/BE.json");

// ---- 플레이 스타일 역할 ID ---------------------------------------------------
const PLAY_STYLE_ROLES = {
  "빡겜러":   "1210762363704311838",
  "즐빡겜러": "1210762298172383273",
  "즐겜러":   "1210762420151394354",
};

// ---- 유틸 -------------------------------------------------------------------
const readJson = (p) => (!fs.existsSync(p) ? {} : JSON.parse(fs.readFileSync(p)));
const formatAmount = (n) => Number(n ?? 0).toLocaleString("ko-KR");
const formatVoice = (sec = 0) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h ? `${h}시간 ${m}분` : `${m}분`;
};

function getFavorEmoji(favor) {
  if (favor >= 15) return "💖";
  if (favor >= 5) return "😊";
  if (favor >= 0) return "🤝";
  return "💢";
}
function getTierEmoji(str = "") {
  const lower = str.toLowerCase();
  if (!str) return "❔";
  if (str.includes("챌린저") || lower.includes("challenger")) return "🌟";
  if (str.includes("마스터") || lower.includes("master")) return "🔱";
  if (str.includes("다이아") || lower.includes("diamond")) return "💎";
  if (str.includes("플래") || lower.includes("plat")) return "🥈";
  if (str.includes("골드") || lower.includes("gold")) return "🥇";
  if (str.includes("실버") || lower.includes("silver")) return "🥉";
  if (str.includes("브론즈") || lower.includes("bronze")) return "🥄";
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
    .addUserOption((opt) =>
      opt
        .setName("유저")
        .setDescription("확인할 유저 (입력 안하면 본인)")
        .setRequired(false)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser("유저") || interaction.user;
    const userId = target.id;

    // ---- JSON 로드 ----------------------------------------------------------
    const profiles = readJson(profilesPath);
    const favor = readJson(favorPath);
    const be = readJson(bePath);

    // ---- 프로필 기본값 -------------------------------------------------------
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

    // ---- 길드 멤버 -----------------------------------------------------------
    const member = await interaction.guild.members
      .fetch(userId)
      .catch(() => null);

    // ---- 상태 메세지 / 가입일 / 호감도 / 정수 -------------------------------
    const statusMsg = `🗨️ 『${profile.statusMsg?.trim() || "상태 메시지가 없습니다."}』`;
    const joinedAt = member?.joinedAt || new Date();
    const joinedStr = `<t:${Math.floor(joinedAt.getTime() / 1000)}:R>`;
    const favorVal = favor[userId] ?? 0;
    const favorEmoji = getFavorEmoji(favorVal);
    const beAmount = formatAmount(be[userId]?.amount ?? 0);
    const playStyle = getPlayStyle(member);

    // ---- Top 3 Friends (닉네임) --------------------------------------------
    let topNames = [];
    try {
      const topIds = relationship.getTopRelations(userId, 10) || [];
      for (const fid of topIds) {
        if (topNames.length >= 3) break;
        if (fid === userId) continue;
        const m = await interaction.guild.members.fetch(fid).catch(() => null);
        if (m && !topNames.includes(m.displayName)) topNames.push(m.displayName);
      }
    } catch (_) {}
    if (!topNames.length) topNames = ["없음"];

    // ---- 최근 7일 활동 ------------------------------------------------------
    const seven = activity.getLast7Days(userId) || { chat: 0, voice: 0 };

    // ---- Embed --------------------------------------------------------------
    const embed = new EmbedBuilder()
      .setTitle("프로필 정보")
      .setThumbnail(target.displayAvatarURL())
      .setColor(
        favorVal >= 15 ? 0xff71b3 : favorVal >= 5 ? 0x82d8ff : 0xbcbcbc
      )
      .setDescription([
        `<@${userId}> 님의 프로필`,
        statusMsg,
        `🔷 파랑 정수(BE): **${beAmount} BE**`,
      ].join("\n"))
      .addFields(
        {
          name: "🎮 플레이 스타일",
          value: playStyle,
          inline: true,
        },
        { name: `${favorEmoji} 호감도`, value: String(favorVal), inline: true },
        { name: "⏰ 서버 입장", value: joinedStr, inline: true },
        {
          name: "🤗 교류가 가장 활발한 유저 3인",
          value: topNames.map((n, i) => `${i + 1}. ${n}`).join("\n"),
          inline: false,
        },
        {
          name: "📊 최근 7일 채팅",
          value: `${seven.chat.toLocaleString()} 회`,
          inline: true,
        },
        {
          name: "🔊 최근 7일 음성",
          value: formatVoice(seven.voice),
          inline: true,
        },
        {
          name: "🎲 선호 게임",
          value: profile.favGames.length
            ? profile.favGames.map((g) => `• ${g}`).join("\n")
            : "없음",
          inline: false,
        },
        {
          name: "🟠 오버워치",
          value: `${getTierEmoji(profile.owTier)} ${profile.owTier || "없음"}`,
          inline: true,
        },
        {
          name: "🔵 롤",
          value: `${getTierEmoji(profile.lolTier)} ${profile.lolTier || "없음"}`,
          inline: true,
        },
        {
          name: "💻 스팀",
          value: profile.steamNick || "없음",
          inline: true,
        },
        {
          name: "🔖 롤 닉네임",
          value: profile.lolNick || "없음",
          inline: true,
        },
        {
          name: "🟦 배틀넷",
          value: profile.bnetNick || "없음",
          inline: true,
        }
      )
      .setFooter({
        text:
          userId === interaction.user.id
            ? "내 프로필은 오직 나만 볼 수 있어요!"
            : "이 정보는 오직 명령어 입력자만 볼 수 있어요!",
        iconURL: interaction.client.user.displayAvatarURL(),
      });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
