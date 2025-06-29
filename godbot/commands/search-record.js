// commands/search-record.js
const { SlashCommandBuilder } = require("discord.js");
const axios = require("axios");
const cheerio = require("cheerio");

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

    let url = "";
    let opggData = null;
    let description = "";
    let embedThumbnail = undefined;
    let embedImage = undefined;

    try {
      switch (game) {
        case "lol":
          url = `https://www.op.gg/summoners/kr/${encodeURIComponent(nickname.replace("#", "-"))}`;
          opggData = await fetchLoLDetail(nickname.replace("#", "-"));
          description = `[op.gg에서 상세 정보 확인하기](${url})` +
            (opggData ? `
**티어** : ${opggData.tier || "-"}
**전적(승/패)** : ${opggData.winlose || "-"}
` : "\n전적 정보를 불러올 수 없습니다.");
          if (opggData && opggData.profileImg) {
            embedThumbnail = { url: opggData.profileImg };
          }
          if (opggData && opggData.tierGraph) {
            embedImage = { url: opggData.tierGraph };
          }
          break;

        case "tft":
          url = `https://op.gg/ko/tft/summoners/kr/${encodeURIComponent(nickname.replace("#", "-"))}`;
          description = `[op.gg에서 상세 정보 확인하기](${url})`;
          break;

        case "valorant":
          url = `https://op.gg/ko/valorant/profile/${encodeURIComponent(nickname.replace("#", "-"))}`;
          opggData = await fetchValorantTier(nickname.replace("#", "-"));
          description = `[op.gg에서 상세 정보 확인하기](${url})` +
            (opggData && opggData.tier ? `\n**티어** : ${opggData.tier}` : "");
          break;

        case "overwatch2":
          url = `https://op.gg/ko/overwatch/search?playerName=${encodeURIComponent(nickname.replace("#", "-"))}`;
          description = `[op.gg에서 상세 정보 확인하기](${url})`;
          break;

        case "pubg":
          url = `https://op.gg/ko/pubg/user/${encodeURIComponent(nickname)}`;
          description = `[op.gg에서 상세 정보 확인하기](${url})`;
          break;

        case "supervive":
          url = `https://supervive.op.gg/ko_KR/players/steam-${encodeURIComponent(nickname)}`;
          description = `[op.gg에서 상세 정보 확인하기](${url})`;
          break;

        default:
          return interaction.editReply("지원하지 않는 게임입니다.");
      }

      const embed = {
        color: 0x5865f2,
        title: `${nickname} 전적검색 (${GAME_TYPES.find(g => g.value === game).name})`,
        url,
        description: description,
        footer: { text: "전적 정보는 op.gg 정책에 따라 일부 제한될 수 있음" },
      };
      if (embedThumbnail) embed.thumbnail = embedThumbnail;
      if (embedImage) embed.image = embedImage;

      await interaction.editReply({ embeds: [embed] });

    } catch (e) {
      console.error(e);
      await interaction.editReply("전적 정보를 불러오는데 오류가 발생했습니다.");
    }
  }
};

async function fetchLoLDetail(nicknameDash) {
  try {
    const res = await axios.get(`https://www.op.gg/summoners/kr/${encodeURIComponent(nicknameDash)}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
      }
    });
    const html = res.data;
    const $ = cheerio.load(html);

    // 프로필 이미지
    const profileImg = $('img[class*="rounded-\\[20px\\]"]').attr("src") || null;

    // 티어: <strong class="text-xl first-letter:uppercase">master</strong>
    const tier = $("strong.text-xl.first-letter\\:uppercase").first().text().trim() || null;

    // 전적(승/패): <span class="leading-[26px]">648승 653패</span>
    const winlose = $("span.leading-\\[26px\\]").first().text().trim() || null;

    // 티어 그래프(큰 이미지)
    // 일반적으로 op.gg는 svg 그래프 바로 위/아래 img 태그에 src가 걸려있음 (아니면 아예 이미지 제공 안함)
    // 일단 대표적으로 svg 바로 다음 img, svg 바로 앞 img를 찾음
    let tierGraph = null;
    const svgParent = $('svg.recharts-surface').parent();
    if (svgParent.length > 0) {
      // svg 태그의 부모 아래에 img가 있으면 그걸 사용
      tierGraph = svgParent.find('img').attr('src') || null;
    }
    // 그래도 못찾으면 전체에서 너비 1000 이상 img 아무거나
    if (!tierGraph) {
      $('img').each((_, el) => {
        const src = $(el).attr('src');
        if (src && ($(el).attr('width') == "1000" || src.includes("graph") || src.includes("chart"))) {
          tierGraph = src;
        }
      });
    }
    // svg를 이미지로 변환해야 하는 경우는 서버 크롤링/이미지 생성 기능 필요하므로 패스

    return {
      profileImg,
      tier,
      winlose,
      tierGraph,
    };
  } catch (e) {
    console.error("fetchLoLDetail 에러:", e);
    return null;
  }
}

// 발로란트 티어 파싱 (구현 필요 시 구조 제공해주면 맞춤 가능)
async function fetchValorantTier(nicknameDash) {
  return null;
}
