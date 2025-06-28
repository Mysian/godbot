// commands/game-search.js
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const fetch = require("node-fetch");

const STEAM_SEARCH_URL = "https://store.steampowered.com/api/storesearch";
const STEAM_DETAILS_URL = "https://store.steampowered.com/api/appdetails";

// 구글 무료 번역 API (비공식)
async function googleTranslateKorToEn(text) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ko&tl=en&dt=t&q=${encodeURIComponent(text)}`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    return (json[0] && json[0][0] && json[0][0][0]) ? json[0][0][0] : text;
  } catch {
    return text;
  }
}

function buildQuery(keywords) {
  return `${STEAM_SEARCH_URL}?cc=KR&l=koreana&term=${encodeURIComponent(keywords.join(" "))}`;
}

function filterGameByKeyword(game, detail, inputKeywords) {
  const keywordKorean = inputKeywords.some(k=>["한국어","한글"].includes(k));
  const keywordMulti = inputKeywords.some(k=>["멀티","멀티플레이","멀티플레이어","multiplayer"].includes(k));
  const keywordSingle = inputKeywords.some(k=>["싱글","싱글플레이","싱글플레이어","singleplayer"].includes(k));
  const keywordCoop = inputKeywords.some(k=>["코옵","협동","coop","co-op"].includes(k));

  if (keywordKorean && detail) {
    const korSupport = (detail.data.supported_languages||"").includes("한국어");
    if (!korSupport) return false;
  }
  if ((keywordMulti || keywordSingle || keywordCoop) && detail) {
    let categories = (detail.data?.categories || []).map(c=>c.description || "").join(" ");
    if (keywordMulti && !categories.includes("멀티플레이어")) return false;
    if (keywordSingle && !categories.includes("싱글 플레이어")) return false;
    if (keywordCoop && !categories.includes("협동")) return false;
  }
  return true;
}

async function getGameDetails(appids) {
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

function createEmbed(results, page, totalPages, keywords, details, inputKeywords, noticeMsg) {
  const embed = new EmbedBuilder()
    .setTitle(`🔍 Steam 게임 검색: ${keywords.join(", ")}`)
    .setColor(0x1b2838)
    .setFooter({ text: `페이지 ${page+1} / ${totalPages} (버튼 유효시간: 5분)` });

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

  let info = [];
  if (inputKeywords.some(k=>["한국어","한글"].includes(k))) info.push("**한국어 지원** 게임만 표시");
  if (inputKeywords.some(k=>["멀티","멀티플레이","멀티플레이어","multiplayer"].includes(k))) info.push("**멀티플레이** 지원 게임만 표시");
  if (inputKeywords.some(k=>["싱글","싱글플레이","싱글플레이어","singleplayer"].includes(k))) info.push("**싱글플레이** 지원 게임만 표시");
  if (inputKeywords.some(k=>["코옵","협동","coop","co-op"].includes(k))) info.push("**협동(Co-op)** 지원 게임만 표시");
  if (info.length) embed.setDescription(info.join(" / "));
  if (noticeMsg) embed.setDescription((embed.data.description||"") + `\n\n${noticeMsg}`);
  return embed;
}

// 키워드 조합을 점점 줄여가며 검색
async function searchWithRelaxedKeywords(originKeywords, googleTranslateKorToEn) {
  // [[a,b,c], [a,b], [b,c], [a], [b], ...]
  function getAllRelaxedSets(arr) {
    const out = [];
    // n개 중 n-1, n-2 ... 1개까지 조합 (단, 중복 없이)
    for (let k = arr.length-1; k >= 1; k--) {
      let done = new Set();
      let recur = (picked, left, need) => {
        if (picked.length === need) {
          const key = picked.join("|");
          if (!done.has(key)) {
            out.push([...picked]);
            done.add(key);
          }
          return;
        }
        for (let i = 0; i < left.length; i++) {
          recur(picked.concat(left[i]), left.slice(i+1), need);
        }
      };
      recur([], arr, k);
    }
    // 마지막엔 각각 단일 키워드도 넣기
    for (let i = 0; i < arr.length; i++) out.push([arr[i]]);
    return out;
  }

  // 1. 원본(한글, 영어) 모두로 검색
  const tryKeywordsList = [originKeywords];
  const hasKorean = originKeywords.some(k=>/[가-힣]/.test(k));
  if (hasKorean) {
    const engKeywords = [];
    for (const kw of originKeywords) {
      if (/[가-힣]/.test(kw)) engKeywords.push(await googleTranslateKorToEn(kw));
      else engKeywords.push(kw);
    }
    if (engKeywords.join(" ") !== originKeywords.join(" ")) {
      tryKeywordsList.push(engKeywords);
    }
  }

  // 2. 줄인 키워드들로도 한글/영어 따로따로 계속 시도
  const relaxedSets = getAllRelaxedSets(originKeywords);
  for (const set of relaxedSets) {
    tryKeywordsList.push(set);
    if (set.some(k=>/[가-힣]/.test(k))) {
      const engSet = [];
      for (const kw of set) {
        if (/[가-힣]/.test(kw)) engSet.push(await googleTranslateKorToEn(kw));
        else engSet.push(kw);
      }
      if (engSet.join(" ") !== set.join(" ")) tryKeywordsList.push(engSet);
    }
  }
  // 중복 제거
  const seen = new Set();
  const uniq = [];
  for (const arr of tryKeywordsList) {
    const key = arr.join("|");
    if (!seen.has(key)) {
      uniq.push(arr);
      seen.add(key);
    }
  }

  // 실제 검색 반복
  for (const keywords of uniq) {
    let allGames = [];
    let searchUrl = buildQuery(keywords);
    let res = await fetch(searchUrl, { headers: { "accept": "application/json", "user-agent": "discord-bot" }});
    let data = await res.json();
    let games = (data?.items || []).filter(x => !!x.name);
    allGames = allGames.concat(games);

    // 최대 50개
    let uniqueGames = [];
    let seenId = new Set();
    for (const g of allGames) {
      if (!seenId.has(g.id)) {
        uniqueGames.push(g);
        seenId.add(g.id);
      }
      if (uniqueGames.length >= 50) break;
    }
    if (uniqueGames.length > 0) {
      return { found: true, uniqueGames, keywords };
    }
  }
  // 진짜 아무것도 없을 때
  return { found: false, uniqueGames: [], keywords: originKeywords };
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

    await interaction.deferReply({ ephemeral: true });

    // 검색 반복 (키워드 줄여가며)
    let noticeMsg = "";
    let { found, uniqueGames, keywords } = await searchWithRelaxedKeywords(inputKeywords, googleTranslateKorToEn);
    if (!found) {
      // 진짜 없음 (이론상 거의 불가)
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle("Steam 게임 검색")
            .setColor(0x1b2838)
            .setDescription("정말로 결과가 없습니다. (키워드가 너무 특이하거나 Steam에 게임이 없을 수 있습니다.)")
        ],
        ephemeral: true
      });
      return;
    }
    if (keywords.length !== inputKeywords.length || keywords.join(" ") !== inputKeywords.join(" ")) {
      noticeMsg = "※ 검색 결과가 없어서 일부 키워드를 생략해 자동으로 재검색했습니다.";
    }

    // 상세 정보
    let details = await getGameDetails(uniqueGames.map(g=>g.id));
    uniqueGames = uniqueGames.filter(g => filterGameByKeyword(g, details[g.id], keywords));

    // 페이지 분할(5개씩 10페이지, 최대 50개)
    let pages = [];
    for (let i = 0; i < 10; i++) {
      let slice = uniqueGames.slice(i*5, (i+1)*5);
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
      embeds: [createEmbed(pages[currPage], currPage, totalPages, keywords, details, keywords, noticeMsg)],
      components: [getActionRow(currPage)],
      ephemeral: true
    });

    // 페이지 버튼 이벤트
    const filter = i =>
      i.user.id === interaction.user.id &&
      ["prevPage", "nextPage"].includes(i.customId);

    const collector = msg.createMessageComponentCollector({ filter, time: 300_000 }); // 5분

    collector.on("collect", async btn => {
      if (btn.customId === "prevPage" && currPage > 0) currPage--;
      else if (btn.customId === "nextPage" && currPage < totalPages-1) currPage++;
      await btn.update({
        embeds: [createEmbed(pages[currPage], currPage, totalPages, keywords, details, keywords, noticeMsg)],
        components: [getActionRow(currPage)],
        ephemeral: true
      });
    });
    collector.on("end", () => {
      msg.edit({ components: [] }).catch(()=>{});
    });
  }
};
