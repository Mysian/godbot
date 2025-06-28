// commands/game-search.js
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const fetch = require("node-fetch");

const STEAM_SEARCH_URL = "https://store.steampowered.com/api/storesearch";
const STEAM_DETAILS_URL = "https://store.steampowered.com/api/appdetails";

function buildQuery(keywords) {
  return `${STEAM_SEARCH_URL}?cc=KR&l=koreana&term=${encodeURIComponent(keywords.join(" "))}`;
}

// 키워드별 확장 필터링 (한글/멀티/싱글/co-op)
function filterGameByKeyword(game, detail, inputKeywords) {
  const keywordKorean = inputKeywords.some(k=>["한국어","한글"].includes(k));
  const keywordMulti = inputKeywords.some(k=>["멀티","멀티플레이","멀티플레이어"].includes(k));
  const keywordSingle = inputKeywords.some(k=>["싱글","싱글플레이","싱글플레이어"].includes(k));
  const keywordCoop = inputKeywords.some(k=>["코옵","코옵", "협동", "coop", "co-op"].includes(k));

  // 언어
  if (keywordKorean && detail) {
    const korSupport = (detail.data.supported_languages||"").includes("한국어");
    if (!korSupport) return false;
  }
  // 멀티/싱글/Co-op
  if ((keywordMulti || keywordSingle || keywordCoop) && detail) {
    let categories = (detail.data?.categories || []).map(c=>c.description || "").join(" ");
    if (keywordMulti && !categories.includes("멀티플레이어")) return false;
    if (keywordSingle && !categories.includes("싱글 플레이어")) return false;
    if (keywordCoop && !categories.includes("협동")) return false;
  }
  return true;
}

async function getGameDetails(appids) {
  // 한 번에 최대 20개만 (속도/트래픽 제한)
  let results = {};
  await Promise.all(appids.map(async id => {
    try {
      let res = await fetch(`${STEAM_DETAILS_URL}?appids=${id}&cc=KR&l=koreana`);
      let json = await res.json();
      results[id] = json[id];
    } catch(e) {}
  }));
  return results;
}

function parseGameInfo(game, detail, inputKeywords) {
  const korSupport = detail && (detail.data.supported_languages||"").includes("한국어");
  let cats = detail && detail.data.categories ? detail.data.categories.map(x=>x.description) : [];
  let genres = detail && detail.data.genres ? detail.data.genres.map(x=>x.description) : [];
  let price = game.price ? `${game.price.final/100}원` : (detail && detail.data.is_free ? "무료" : "가격정보없음");
  let platform = game.platforms ? Object.keys(game.platforms).filter(p=>game.platforms[p]).join(", ") : "-";
  let desc = 
    `[Steam 바로가기](https://store.steampowered.com/app/${game.id})\n` +
    `💰 가격: ${price}\n` +
    `🖥️ 플랫폼: ${platform}\n` +
    (korSupport ? "🇰🇷 **한국어 지원**\n" : "") +
    (cats.length ? "📦 분류: " + cats.join(", ") + "\n" : "") +
    (genres.length ? "🎮 장르: " + genres.join(", ") + "\n" : "");
  return desc;
}

function createEmbed(results, page, totalPages, keywords, details, inputKeywords) {
  const embed = new EmbedBuilder()
    .setTitle(`🔍 Steam 게임 검색: ${keywords.join(", ")}`)
    .setColor(0x1b2838)
    .setFooter({ text: `페이지 ${page+1} / ${totalPages}` });

  if (!results.length) {
    embed.setDescription("결과가 없습니다.");
    return embed;
  }

  results.forEach((game, idx) => {
    const detail = details[game.id];
    const desc = parseGameInfo(game, detail, inputKeywords);
    embed.addFields({
      name: `${idx+1}. ${game.name}` + (detail && (detail.data.supported_languages||"").includes("한국어") ? " 🇰🇷" : ""),
      value: desc,
      inline: false,
    });
  });

  // 키워드 안내
  let info = [];
  if (inputKeywords.some(k=>["한국어","한글"].includes(k))) info.push("**한국어 지원** 게임만 표시");
  if (inputKeywords.some(k=>["멀티","멀티플레이","멀티플레이어"].includes(k))) info.push("**멀티플레이** 지원 게임만 표시");
  if (inputKeywords.some(k=>["싱글","싱글플레이","싱글플레이어"].includes(k))) info.push("**싱글플레이** 지원 게임만 표시");
  if (inputKeywords.some(k=>["코옵","협동","coop","co-op"].includes(k))) info.push("**협동(Co-op)** 지원 게임만 표시");
  if (info.length) embed.setDescription(info.join(" / "));
  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("게임검색")
    .setDescription("Steam 스토어에서 키워드로 게임을 검색합니다.")
    .addStringOption(opt =>
      opt.setName("키워드")
        .setDescription("검색할 키워드(띄어쓰기로 여러 개 가능, 예: 좀비 FPS 한국어 멀티)")
        .setRequired(true)
    ),
  async execute(interaction) {
    const keywordRaw = interaction.options.getString("키워드").trim();
    const inputKeywords = keywordRaw.split(/\s+/);
    await interaction.deferReply({ ephemeral: false });

    let searchUrl = buildQuery(inputKeywords);
    let res = await fetch(searchUrl, {
      headers: { "accept": "application/json", "user-agent": "discord-bot" }
    });
    let data = await res.json();

    let games = (data?.items || []).filter(x => !!x.name);
    // 최대 20개만
    games = games.slice(0, 20);

    // 상세 정보 파싱
    let details = await getGameDetails(games.map(g=>g.id));
    // 고급 필터 적용
    games = games.filter(g => filterGameByKeyword(g, details[g.id], inputKeywords));

    // 페이지 분할
    let pages = [];
    for (let i = 0; i < 2; i++) {
      let slice = games.slice(i*10, (i+1)*10);
      pages.push(slice);
    }
    let currPage = 0;
    const totalPages = pages.filter(p=>p.length>0).length;

    // 버튼
    const getActionRow = (currPage) => new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("prevPage")
        .setLabel("이전")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currPage === 0),
      new ButtonBuilder()
        .setCustomId("nextPage")
        .setLabel("다음")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(currPage === totalPages-1)
    );

    let msg = await interaction.editReply({
      embeds: [createEmbed(pages[currPage], currPage, totalPages, inputKeywords, details, inputKeywords)],
      components: [getActionRow(currPage)],
    });

    // 페이지 버튼 이벤트
    const filter = i =>
      i.user.id === interaction.user.id &&
      ["prevPage", "nextPage"].includes(i.customId);

    const collector = msg.createMessageComponentCollector({ filter, time: 60_000 });
    collector.on("collect", async btn => {
      if (btn.customId === "prevPage" && currPage > 0) currPage--;
      else if (btn.customId === "nextPage" && currPage < totalPages-1) currPage++;
      await btn.update({
        embeds: [createEmbed(pages[currPage], currPage, totalPages, inputKeywords, details, inputKeywords)],
        components: [getActionRow(currPage)],
      });
    });
    collector.on("end", () => {
      msg.edit({ components: [] }).catch(()=>{});
    });
  }
};
