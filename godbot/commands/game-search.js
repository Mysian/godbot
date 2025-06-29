// commands/game-search.js
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const fetch = require("node-fetch");
const cheerio = require("cheerio");

const STEAM_SEARCH_URL = "https://store.steampowered.com/api/storesearch";
const STEAM_DETAILS_URL = "https://store.steampowered.com/api/appdetails";
const EMBED_IMG = "https://media.discordapp.net/attachments/1388728993787940914/1388729871508832267/image.png?ex=68620afa&is=6860b97a&hm=0dfb144342b6577a6d7d8abdbd2338cdee5736dd948cfe49a428fdc7cb2d199a&=&format=webp&quality=lossless";

const NEW_KEYWORDS = ["신작", "신작게임", "최신", "new", "newgame", "new_game", "recent"];
const GENRE_KOR_ENG_MAP = {
  "액션": "action", "어드벤처": "adventure", "모험": "adventure",
  "rpg": "RPG", "jrpg": "JRPG", "시뮬": "simulation", "시뮬레이션": "simulation",
  "전략": "strategy", "슈팅": "shooter", "슈터": "shooter",
  "퍼즐": "puzzle", "스포츠": "sports", "레이싱": "racing", "음악": "music",
  "리듬": "rhythm", "샌드박스": "sandbox", "생존": "survival", "공포": "horror",
  "공포게임": "horror", "호러": "horror", "mmo": "MMO", "mmorpg": "MMORPG",
  "오픈월드": "open world", "카드": "card", "보드": "board", "메트로배니아": "metroidvania"
};
const ADULT_GENRES = ["성인", "Adult", "Nudity", "Sexual Content", "야한", "노출", "Adult Only", "NSFW"];
const ADULT_CONTENTS = ["Nudity", "Sexual Content", "Adult Only", "야한", "노출", "성인", "NSFW"];

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

function isAdultGame(detail) {
  if (!detail || !detail.data) return false;
  if (detail.data.required_age && Number(detail.data.required_age) >= 18) return true;
  if (detail.data.content_descriptors && Array.isArray(detail.data.content_descriptors.notes)) {
    for (const note of detail.data.content_descriptors.notes) {
      for (const adult of ADULT_CONTENTS) {
        if (note.toLowerCase().includes(adult.toLowerCase())) return true;
      }
    }
  }
  if (detail.data.genres && Array.isArray(detail.data.genres)) {
    for (const g of detail.data.genres) {
      for (const adult of ADULT_GENRES) {
        if (g.description && g.description.toLowerCase().includes(adult.toLowerCase())) return true;
      }
    }
  }
  if (detail.data.categories && Array.isArray(detail.data.categories)) {
    for (const c of detail.data.categories) {
      for (const adult of ADULT_GENRES) {
        if (c.description && c.description.toLowerCase().includes(adult.toLowerCase())) return true;
      }
    }
  }
  if (
    detail.data.name &&
    /(19[+]|adult|성인|야한|노출|nsfw)/i.test(detail.data.name)
  ) return true;
  return false;
}

function filterGameByKeyword(game, detail, genreFilters) {
  if (isAdultGame(detail)) return false;
  if (genreFilters.length > 0) {
    const genres = (detail && detail.data.genres) ? detail.data.genres.map(x => x.description.toLowerCase()) : [];
    let hit = false;
    for (const genre of genreFilters) {
      if (genres.some(g => g.includes(genre.toLowerCase()))) hit = true;
    }
    if (!hit) return false;
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

function parseGameInfo(game, detail) {
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
    (genres.length ? "🎮 장르: " + genres.join(", ") + "\n" : "") +
    (detail && detail.data.release_date && detail.data.release_date.date ? `🗓️ 출시일: ${detail.data.release_date.date}\n` : "");
  return desc;
}

function createEmbed(results, page, totalPages, keywords, details, noticeMsg) {
  const embed = new EmbedBuilder()
    .setTitle(`🔍 Steam 게임 검색: ${keywords.join(", ")}`)
    .setColor(0x1b2838)
    .setFooter({ text: `페이지 ${page+1} / ${totalPages} (버튼 유효시간: 5분)` })
    .setImage(EMBED_IMG);

  if (!results.length) {
    embed.setDescription("결과가 없습니다.");
    return embed;
  }

  results.forEach((game, idx) => {
    const detail = details[game.id];
    const desc = parseGameInfo(game, detail);
    embed.addFields({
      name: `${idx+1}. ${game.name}` + (detail && (detail.data.supported_languages||"").includes("한국어") ? " 🇰🇷" : ""),
      value: desc,
      inline: false,
    });
  });

  if (noticeMsg) embed.setDescription((embed.data.description||"") + `\n\n${noticeMsg}`);
  return embed;
}

// ★ 신작 공포게임/공포게임 신작 전용 크롤링
async function fetchSteamHorrorNewGames() {
  const url = 'https://store.steampowered.com/search/?sort_by=Released_DESC&supportedlang=koreana&tags=1667&untags=5611&category1=998&unvrsupport=401&os=win&ndl=1';
  const html = await fetch(url, { headers: { "user-agent": "discord-bot" } }).then(r=>r.text());
  const $ = cheerio.load(html);
  const gameList = [];
  $('.search_result_row').each((i, el) => {
    if (i >= 50) return false; // 50개까지만
    const $el = $(el);
    const appid = $el.attr('data-ds-appid');
    const name = $el.find('.title').text().trim();
    const link = $el.attr('href');
    const release = $el.find('.search_released').text().trim();
    const price = $el.find('.search_price, .discount_final_price').first().text().trim();
    const thumb = $el.find('.search_capsule img').attr('src');
    if (appid && name) {
      gameList.push({ id: appid, name, link, release, price, thumb });
    }
  });
  return gameList;
}

// ★ 평점 좋은 게임(매우 긍정적 이상, 한글지원, 비성인) 무작위 추천
async function fetchSteamTopRatedGames() {
  const url = "https://store.steampowered.com/search/?filter=topsellers&supportedlang=koreana&category1=998";
  const html = await fetch(url, { headers: { "user-agent": "discord-bot" } }).then(r=>r.text());
  const $ = cheerio.load(html);
  const games = [];
  $('.search_result_row').each((i, el) => {
    if (games.length >= 50) return false;
    const $el = $(el);
    const appid = $el.attr('data-ds-appid');
    const name = $el.find('.title').text().trim();
    const link = $el.attr('href');
    const release = $el.find('.search_released').text().trim();
    const price = $el.find('.search_price, .discount_final_price').first().text().trim();
    const review = $el.find('.search_reviewscore span').attr('data-tooltip-html') || "";
    const thumb = $el.find('.search_capsule img').attr('src');
    // 평점 긍정적 이상, 성인게임 제외, 한글지원
    if (
      appid && name &&
      /(매우 긍정적|압도적으로 긍정적)/.test(review)
    ) {
      games.push({ id: appid, name, link, release, price, review, thumb });
    }
  });
  return games;
}

function getRandomItems(arr, n) {
  const copy = [...arr];
  const result = [];
  while (copy.length && result.length < n) {
    const idx = Math.floor(Math.random() * copy.length);
    result.push(copy.splice(idx, 1)[0]);
  }
  return result;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("게임검색")
    .setDescription("Steam 스토어에서 키워드로 게임을 검색합니다.")
    .addStringOption(opt =>
      opt.setName("키워드")
        .setDescription("검색할 키워드(띄어쓰기로 여러 개 가능, 예: 신작 공포게임 액션 모험)")
        .setRequired(true)
    ),
  async execute(interaction) {
    const keywordRaw = interaction.options.getString("키워드").trim();
    const inputKeywords = keywordRaw.split(/\s+/);

    // ★ 신작 공포게임/공포게임 신작 특별 처리
    if (
      keywordRaw === "공포게임 신작" ||
      keywordRaw === "신작 공포게임"
    ) {
      await interaction.deferReply({ ephemeral: true });
      const gameList = await fetchSteamHorrorNewGames();

      if (!gameList.length) {
        // 결과가 없으면 인기/평점게임 랜덤 5개 추천
        const topGames = await fetchSteamTopRatedGames();
        const picks = getRandomItems(topGames, 5);
        const embed = new EmbedBuilder()
          .setTitle("이런! 검색 결과가 없습니다.\n대신 이런 게임은 어떠신가요?")
          .setColor(0x1b2838)
          .setImage(EMBED_IMG);
        picks.forEach((game, idx) => {
          embed.addFields({
            name: `${idx+1}. ${game.name}`,
            value:
              `[Steam 바로가기](${game.link})\n` +
              (game.review ? `⭐ ${game.review.split('<br>').join(' / ')}\n` : "") +
              (game.release ? `🗓️ 출시일: ${game.release}\n` : "") +
              (game.price ? `💰 가격: ${game.price}\n` : ""),
            inline: false,
          });
        });
        await interaction.editReply({ embeds: [embed], ephemeral: true });
        return;
      }

      // 페이지 분할
      let pages = [];
      for (let i = 0; i < 10; i++) {
        let slice = gameList.slice(i*5, (i+1)*5);
        pages.push(slice);
      }
      let currPage = 0;
      const totalPages = pages.filter(p=>p.length>0).length;

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

      const createSimpleEmbed = (results, page, totalPages) => {
        const embed = new EmbedBuilder()
          .setTitle("🧟‍♂️ Steam 공포 신작 게임 (자동링크 결과)")
          .setColor(0x1b2838)
          .setFooter({ text: `페이지 ${page+1} / ${totalPages} (버튼 유효시간: 5분)` })
          .setImage(EMBED_IMG);

        results.forEach((game, idx) => {
          embed.addFields({
            name: `${idx+1}. ${game.name}`,
            value:
              `[Steam 바로가기](${game.link})\n` +
              (game.release ? `🗓️ 출시일: ${game.release}\n` : "") +
              (game.price ? `💰 가격: ${game.price}\n` : ""),
            inline: false,
          });
        });
        return embed;
      };

      let msg = await interaction.editReply({
        embeds: [createSimpleEmbed(pages[currPage], currPage, totalPages)],
        components: [getActionRow(currPage)],
        ephemeral: true
      });

      const filter = i =>
        i.user.id === interaction.user.id &&
        ["prevPage", "nextPage"].includes(i.customId);

      const collector = msg.createMessageComponentCollector({ filter, time: 300_000 }); // 5분

      collector.on("collect", async btn => {
        if (btn.customId === "prevPage" && currPage > 0) currPage--;
        else if (btn.customId === "nextPage" && currPage < totalPages-1) currPage++;
        await btn.update({
          embeds: [createSimpleEmbed(pages[currPage], currPage, totalPages)],
          components: [getActionRow(currPage)],
          ephemeral: true
        });
      });
      collector.on("end", () => {
        msg.edit({ components: [] }).catch(()=>{});
      });

      return;
    }

    // 기존 검색로직 (원본)
    await interaction.deferReply({ ephemeral: true });

    // 장르 필터(자동)
    const genreFilters = inputKeywords
      .map(k => GENRE_KOR_ENG_MAP[k.toLowerCase()])
      .filter(Boolean);

    // 신작/최신 전용 (term 없이 최신순)
    const onlyNew = inputKeywords.length === 1 && NEW_KEYWORDS.includes(inputKeywords[0].toLowerCase());
    const hasNew = inputKeywords.some(k => NEW_KEYWORDS.includes(k.toLowerCase()));

    let allGames = [];
    let keywordsUsed = [...inputKeywords];
    let noticeMsg = "";
    if (onlyNew || hasNew) {
      allGames = await fetchRecentGames();
      noticeMsg = "※ '신작' 키워드는 최신 출시 게임 기준으로 50개까지 보여줍니다.";
      keywordsUsed = ["신작 게임"];
    } else {
      // 자동 번역
      let translated = await googleTranslateKorToEn(inputKeywords.join(" "));
      let allTerms = [];
      // 원본 한글 term
      allTerms.push(inputKeywords.join(" "));
      // 번역 영어 term(영어로 변환된게 한글 term과 다르면 추가)
      if (translated && translated.toLowerCase() !== inputKeywords.join(" ").toLowerCase()) {
        allTerms.push(translated);
      }
      // term별로 모두 검색해서 합치기(중복제거)
      let seen = new Set();
      for (const term of allTerms) {
        let searchUrl = `${STEAM_SEARCH_URL}?cc=KR&l=koreana&term=${encodeURIComponent(term)}`;
        let res = await fetch(searchUrl, { headers: { "accept": "application/json", "user-agent": "discord-bot" }});
        let data = await res.json();
        let games = (data?.items || []).filter(x => !!x.name);
        for (const g of games) {
          if (!seen.has(g.id)) {
            allGames.push(g);
            seen.add(g.id);
          }
          if (allGames.length >= 50) break;
        }
        if (allGames.length >= 50) break;
      }
      noticeMsg = allGames.length === 0 ? "※ 결과가 부족해 한글/영어로 최대한 넓게 자동 검색했습니다." : "";
    }

    // 상세정보 가져오기 + 필터링(성인/장르)
    let details = await getGameDetails(allGames.map(g=>g.id));
    let filteredGames = allGames.filter(g => filterGameByKeyword(g, details[g.id], genreFilters));

    // 필터 후 결과가 0개면 장르 필터 없이 term검색 결과라도 무조건 뿌려주기
    if (filteredGames.length === 0 && allGames.length > 0) {
      filteredGames = allGames.filter(g => !isAdultGame(details[g.id]));
      noticeMsg += "\n※ 장르/카테고리 조건을 완화해 유사 결과를 보여줍니다.";
    }

    // 진짜로 아무것도 없으면 안내 + 추천
    if (filteredGames.length === 0) {
      const topGames = await fetchSteamTopRatedGames();
      const picks = getRandomItems(topGames, 5);
      const embed = new EmbedBuilder()
        .setTitle("이런! 검색 결과가 없습니다.\n대신 이런 게임은 어떠신가요?")
        .setColor(0x1b2838)
        .setImage(EMBED_IMG);
      picks.forEach((game, idx) => {
        embed.addFields({
          name: `${idx+1}. ${game.name}`,
          value:
            `[Steam 바로가기](${game.link})\n` +
            (game.review ? `⭐ ${game.review.split('<br>').join(' / ')}\n` : "") +
            (game.release ? `🗓️ 출시일: ${game.release}\n` : "") +
            (game.price ? `💰 가격: ${game.price}\n` : ""),
          inline: false,
        });
      });
      await interaction.editReply({ embeds: [embed], ephemeral: true });
      return;
    }

    // 페이지 분할
    let pages = [];
    for (let i = 0; i < 10; i++) {
      let slice = filteredGames.slice(i*5, (i+1)*5);
      pages.push(slice);
    }
    let currPage = 0;
    const totalPages = pages.filter(p=>p.length>0).length;

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
      embeds: [createEmbed(pages[currPage], currPage, totalPages, keywordsUsed, details, noticeMsg)],
      components: [getActionRow(currPage)],
      ephemeral: true
    });

    const filter = i =>
      i.user.id === interaction.user.id &&
      ["prevPage", "nextPage"].includes(i.customId);

    const collector = msg.createMessageComponentCollector({ filter, time: 300_000 }); // 5분

    collector.on("collect", async btn => {
      if (btn.customId === "prevPage" && currPage > 0) currPage--;
      else if (btn.customId === "nextPage" && currPage < totalPages-1) currPage++;
      await btn.update({
        embeds: [createEmbed(pages[currPage], currPage, totalPages, keywordsUsed, details, noticeMsg)],
        components: [getActionRow(currPage)],
        ephemeral: true
      });
    });
    collector.on("end", () => {
      msg.edit({ components: [] }).catch(()=>{});
    });
  }
};
