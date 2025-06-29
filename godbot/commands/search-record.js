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

    try {
      switch (game) {
        case "lol":
          url = `https://www.op.gg/summoners/kr/${encodeURIComponent(nickname.replace("#", "-"))}`;
          opggData = await fetchLoLDetail(nickname.replace("#", "-"));
          description = `[op.gg에서 상세 정보 확인하기](${url})` +
            (opggData ? `
**티어** : ${opggData.tier || "-"}
**전적** : ${opggData.record || "-"}
**KDA** : ${opggData.kda || "-"}
` : "\n전적 정보를 불러올 수 없습니다.");
          if (opggData && opggData.profileImg) {
            embedThumbnail = { url: opggData.profileImg };
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

    // (중요!) 받아온 html 앞부분 콘솔 출력 (터미널 확인용)
    console.log("---- op.gg 응답 html ----");
    console.log(html.slice(0, 1000));

    // cheerio로 전체 태그+클래스+텍스트 한 번 쭉 출력 (선택자 체크용)
    const $ = cheerio.load(html);
    $('body *').each((i, el) => {
      const className = $(el).attr('class');
      const text = $(el).text();
      if (className && text) {
        console.log(`class: ${className} | text: ${text.trim().slice(0,30)}`);
      }
    });

    // 실제 데이터 파싱
    const profileImg = $("img.rounded\\[20px\\]").attr("src") || null;
    const record = $("div.leading-\\[16px\\]").first().text().trim();
    const kda = $("strong.text-\\[15px\\].text-gray-900.md\\:text-\\[20px\\]").first().text().trim();
    const tier = $("span.text-xs.lowercase.first-letter\\:uppercase").first().text().trim();

    return {
      profileImg,
      record,
      kda,
      tier,
    };
  } catch (e) {
    console.error("fetchLoLDetail 에러:", e);
    return null;
  }
}

// 발로란트 티어 파싱 (현재 구현 X, 나중에 직접 구조 제공해주면 구현 가능)
async function fetchValorantTier(nicknameDash) {
  return null;
}
