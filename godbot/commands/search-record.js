// commands/search-record.js
const { SlashCommandBuilder } = require("discord.js");
const axios = require("axios");

const GAME_TYPES = [
  { name: "리그 오브 레전드 (롤)", value: "lol" },
  { name: "전략적 팀 전투 (롤체)", value: "tft" },
  { name: "발로란트", value: "valorant" },
  { name: "오버워치", value: "overwatch2" },
  { name: "PUBG (배그)", value: "pubg" },
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
    let result = "";
    let opggData = null;

    try {
      switch (game) {
        case "lol": {
          url = `https://www.op.gg/summoners/kr/${encodeURIComponent(nickname.replace("#", "-"))}`;
          opggData = await fetchLoLTier(nickname.replace("#", "-"));
          if (opggData) {
            result = `**티어:** ${opggData.tier || "-"} ${opggData.lp || ""}\n` +
                     `**솔로랭크:** ${opggData.solo || "-"}\n` +
                     `**자유랭크:** ${opggData.flex || "-"}\n`;
          } else {
            result = "전적 정보를 불러올 수 없습니다.";
          }
          break;
        }
        case "tft": {
          url = `https://op.gg/ko/tft/summoners/kr/${encodeURIComponent(nickname.replace("#", "-"))}`;
          opggData = await fetchTFTTier(nickname.replace("#", "-"));
          if (opggData) {
            result = `**티어:** ${opggData.tier || "-"}\n` +
                     `**LP:** ${opggData.lp || "-"}\n`;
          } else {
            result = "전적 정보를 불러올 수 없습니다.";
          }
          break;
        }
        case "valorant": {
          url = `https://op.gg/ko/valorant/profile/${encodeURIComponent(nickname.replace("#", "-"))}`;
          opggData = await fetchValorantTier(nickname.replace("#", "-"));
          if (opggData) {
            result = `**티어:** ${opggData.tier || "-"}\n` +
                     `**MMR:** ${opggData.mmr || "-"}\n`;
          } else {
            result = "전적 정보를 불러올 수 없습니다.";
          }
          break;
        }
        case "overwatch2": {
          url = `https://op.gg/ko/overwatch/search?playerName=${encodeURIComponent(nickname.replace("#", "-"))}`;
          opggData = await fetchOverwatch2Data(nickname.replace("#", "-"));
          if (opggData) {
            result = `**레벨:** ${opggData.level || "-"}\n` +
                     `**평점:** ${opggData.rating || "-"}\n`;
          } else {
            result = "전적 정보를 불러올 수 없습니다.";
          }
          break;
        }
        case "pubg": {
          url = `https://op.gg/ko/pubg/user/${encodeURIComponent(nickname)}`;
          opggData = await fetchPUBGData(nickname);
          if (opggData) {
            result = `**레벨:** ${opggData.level || "-"}\n` +
                     `**레이팅:** ${opggData.rating || "-"}\n`;
          } else {
            result = "전적 정보를 불러올 수 없습니다.";
          }
          break;
        }
        default:
          return interaction.editReply("지원하지 않는 게임입니다.");
      }

      const embed = {
        color: 0x5865f2,
        title: `${nickname} 전적검색 (${GAME_TYPES.find(g => g.value === game).name})`,
        url,
        description: `[op.gg에서 상세 정보 확인하기](${url})\n\n${result ? result : ""}`,
        footer: { text: "전적 정보는 op.gg 정책에 따라 일부 제한될 수 있음" }
      };

      await interaction.editReply({ embeds: [embed] });

    } catch (e) {
      console.error(e);
      await interaction.editReply("전적 정보를 불러오는데 오류가 발생했습니다.");
    }
  }
};

// 롤 티어 등급/랭크 파싱 (정규식)
async function fetchLoLTier(nicknameDash) {
  try {
    const res = await axios.get(`https://www.op.gg/summoners/kr/${encodeURIComponent(nicknameDash)}`);
    const html = res.data;
    const tierMatch = html.match(/<div class="tier">(.*?)<\/div>/);
    const lpMatch = html.match(/<div class="lp">(.*?)<\/div>/);
    const soloMatch = html.match(/솔로랭크.*?<div.*?tier.*?>(.*?)<\/div>/s);
    const flexMatch = html.match(/자유랭크.*?<div.*?tier.*?>(.*?)<\/div>/s);
    return {
      tier: tierMatch ? tierMatch[1].replace(/<.*?>/g, "").trim() : null,
      lp: lpMatch ? lpMatch[1].replace(/<.*?>/g, "").trim() : null,
      solo: soloMatch ? soloMatch[1].replace(/<.*?>/g, "").trim() : null,
      flex: flexMatch ? flexMatch[1].replace(/<.*?>/g, "").trim() : null,
    };
  } catch {
    return null;
  }
}

// 롤체 티어 파싱
async function fetchTFTTier(nicknameDash) {
  try {
    const res = await axios.get(`https://op.gg/ko/tft/summoners/kr/${encodeURIComponent(nicknameDash)}`);
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

// 발로란트 티어 파싱 (기본적으로 링크 제공, 일부 티어 표시)
async function fetchValorantTier(nicknameDash) {
  try {
    const res = await axios.get(`https://op.gg/ko/valorant/profile/${encodeURIComponent(nicknameDash)}`);
    const html = res.data;
    const tierMatch = html.match(/<span class="tier-name">(.*?)<\/span>/);
    const mmrMatch = html.match(/<div class="mmr">(.*?)<\/div>/);
    return {
      tier: tierMatch ? tierMatch[1].replace(/<.*?>/g, "").trim() : null,
      mmr: mmrMatch ? mmrMatch[1].replace(/<.*?>/g, "").trim() : null,
    };
  } catch {
    return null;
  }
}

// 오버워치2 데이터 파싱
async function fetchOverwatch2Data(nicknameDash) {
  try {
    const searchUrl = `https://op.gg/ko/overwatch/search?playerName=${encodeURIComponent(nicknameDash)}`;
    const res = await axios.get(searchUrl);
    const html = res.data;
    const levelMatch = html.match(/<div class="level">(\d+)<\/div>/);
    const ratingMatch = html.match(/<span class="rating-point">([0-9,]+)<\/span>/);
    return {
      level: levelMatch ? levelMatch[1] : null,
      rating: ratingMatch ? ratingMatch[1] : null,
    };
  } catch {
    return null;
  }
}

// 배그 레이팅/레벨 등
async function fetchPUBGData(nickname) {
  try {
    const res = await axios.get(`https://op.gg/ko/pubg/user/${encodeURIComponent(nickname)}`);
    const html = res.data;
    const levelMatch = html.match(/<span class="level">(.*?)<\/span>/);
    const ratingMatch = html.match(/<span class="rating-point">(.*?)<\/span>/);
    return {
      level: levelMatch ? levelMatch[1].replace(/<.*?>/g, "").trim() : null,
      rating: ratingMatch ? ratingMatch[1].replace(/<.*?>/g, "").trim() : null,
    };
  } catch {
    return null;
  }
}
