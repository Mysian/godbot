// commands/search-record.js
const { SlashCommandBuilder } = require("discord.js");
const axios = require("axios");

const GAME_TYPES = [
  { name: "리그 오브 레전드 (롤)", value: "lol" },
  { name: "전략적 팀 전투 (롤체)", value: "tft" },
  { name: "발로란트", value: "valorant" },
  { name: "오버워치", value: "overwatch2" },
  { name: "PUBG (배그)", value: "pubg" },
  { name: "슈퍼바이브", value: "supervive" },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName("전적검색")
    .setDescription("유저의 게임 전적을 op.gg 기반으로 검색합니다.")
    .addStringOption(option =>
      option.setName("게임")
        .setDescription("게임을 선택하세요")
        .setRequired(true)
        .addChoices(...GAME_TYPES.map(g => ({ name: g.name, value: g.value })))
    )
    .addStringOption(option =>
      option.setName("닉네임")
        .setDescription("닉네임#태그 또는 닉네임을 입력 (게임별 형식 주의)")
        .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const game = interaction.options.getString("게임");
    let nickname = interaction.options.getString("닉네임").trim();

    // op.gg 규칙: 닉네임#태그 형식 그대로 붙여서 encode해서 검색해야 함
    // 예: op.gg/summoners/kr/닉네임-태그
    // 발로란트/옵치2: /profile/닉네임-태그

    let url = "";
    let result = "";
    let opggData = null;

    try {
      switch (game) {
        case "lol":
          // 닉네임#태그 혹은 닉네임만 입력 가능, op.gg에서는 붙여서 -로
          url = `https://www.op.gg/summoners/kr/${encodeURIComponent(nickname.replace("#", "-"))}`;
          opggData = await fetchLoLTier(nickname.replace("#", "-"));
          result = opggData ? `**${opggData.tier}** ${opggData.lp || ""}` : "랭크 정보를 불러올 수 없습니다.";
          break;

        case "tft":
          url = `https://op.gg/ko/tft/summoners/kr/${encodeURIComponent(nickname.replace("#", "-"))}`;
          result = "";
          break;

        case "valorant":
          url = `https://op.gg/ko/valorant/profile/${encodeURIComponent(nickname.replace("#", "-"))}`;
          opggData = await fetchValorantTier(nickname.replace("#", "-"));
          result = opggData ? `**${opggData.tier}**` : "";
          break;

        case "overwatch2":
          url = `https://op.gg/ko/overwatch/search?playerName=${encodeURIComponent(nickname.replace("#", "-"))}`;
          result = "";
          break;

        case "pubg":
          url = `https://op.gg/ko/pubg/user/${encodeURIComponent(nickname)}`;
          result = "";
          break;

        case "supervive":
          url = `https://supervive.op.gg/ko_KR/players/steam-${encodeURIComponent(nickname)}`;
          result = "";
          break;

        default:
          return interaction.editReply("지원하지 않는 게임입니다.");
      }

      const embed = {
        color: 0x5865f2,
        title: `${nickname} 전적검색 (${GAME_TYPES.find(g => g.value === game).name})`,
        url,
        description: `[op.gg에서 상세 정보 확인하기](${url})\n${result ? `\n${result}` : ""}`,
        footer: { text: "전적 정보는 op.gg 정책에 따라 일부 제한될 수 있음" }
      };

      await interaction.editReply({ embeds: [embed] });

    } catch (e) {
      console.error(e);
      await interaction.editReply("전적 정보를 불러오는데 오류가 발생했습니다.");
    }
  }
};

// 롤 티어 간단 파싱 (HTML 크롤링, axios+정규식, puppeteer 쓰면 더 정확)
async function fetchLoLTier(nicknameDash) {
  try {
    const res = await axios.get(`https://www.op.gg/summoners/kr/${encodeURIComponent(nicknameDash)}`);
    const html = res.data;
    const tierMatch = html.match(/<div class="tier">(.*?)<\/div>/);
    const lpMatch = html.match(/<div class="lp">(.*?)<\/div>/);
    return {
      tier: tierMatch ? tierMatch[1].replace(/<.*?>/g, "").trim() : null,
      lp: lpMatch ? lpMatch[1].replace(/<.*?>/g, "").trim() : null,
    };
  } catch {
    return null;
  }
}

// 발로란트 티어 파싱 (링크만 제공, API 없음)
async function fetchValorantTier(nicknameDash) {
  return null;
}
