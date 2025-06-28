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

    // 태그(예: #KR1) 분리
    let tag = "";
    if (nickname.includes("#")) {
      [nickname, tag] = nickname.split("#");
      nickname = nickname.trim();
      tag = tag.trim();
    }

    // 각 게임별 OP.GG URL & 티어/레벨 추출 로직
    let url = "";
    let result = "";
    let opggData = null;

    try {
      switch (game) {
        case "lol":
          url = `https://www.op.gg/summoners/kr/${encodeURIComponent(nickname)}`;
          // 롤은 공식 API 없음, op.gg html 파싱 (예시, 자세한건 puppeteer 등 필요)
          opggData = await fetchLoLTier(nickname);
          result = opggData ? `**${opggData.tier}** ${opggData.lp || ""}` : "랭크 정보를 불러올 수 없습니다.";
          break;

        case "tft":
          url = `https://tft.op.gg/summoner/userName=${encodeURIComponent(nickname)}`;
          // 롤체도 마찬가지, 간략 링크만 제공
          result = "";
          break;

        case "valorant":
          if (!tag) return interaction.editReply("발로란트는 닉네임#태그 형식으로 입력해주세요 (예: 닉네임#KR1)");
          url = `https://valorant.op.gg/profile/riot/${encodeURIComponent(nickname)}-${encodeURIComponent(tag)}`;
          opggData = await fetchValorantTier(nickname, tag);
          result = opggData ? `**${opggData.tier}**` : "랭크 정보를 불러올 수 없습니다.";
          break;

        case "overwatch2":
          url = `https://overwatch.op.gg/profile/${encodeURIComponent(nickname)}`;
          // 옵치는 닉네임#태그 없으면 에러
          if (!tag) return interaction.editReply("옵치2는 닉네임#태그 형식으로 입력해주세요 (예: 닉네임#1234)");
          url = `https://overwatch.op.gg/profile/${encodeURIComponent(nickname)}-${encodeURIComponent(tag)}`;
          result = "";
          break;

        case "pubg":
          url = `https://pubg.op.gg/user/${encodeURIComponent(nickname)}`;
          result = "";
          break;

        case "supervive":
          url = `https://supervive.op.gg/profile/${encodeURIComponent(nickname)}`;
          result = "";
          break;

        default:
          return interaction.editReply("지원하지 않는 게임입니다.");
      }

      const embed = {
        color: 0x5865f2,
        title: `${nickname}${tag ? "#" + tag : ""} 전적검색 (${GAME_TYPES.find(g => g.value === game).name})`,
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
async function fetchLoLTier(nickname) {
  try {
    const res = await axios.get(`https://www.op.gg/summoners/kr/${encodeURIComponent(nickname)}`);
    const html = res.data;
    // 티어 예시 추출 (2024년 기준, op.gg 구조 자주 바뀜!)
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

// 발로란트 티어 파싱 (op.gg는 일부 API 제공, 여기선 없는 경우 링크만)
async function fetchValorantTier(nickname, tag) {
  try {
    // op.gg 비공식 API, 실제로는 크롤링 필요 (여기선 링크만 제공)
    return null;
  } catch {
    return null;
  }
}
