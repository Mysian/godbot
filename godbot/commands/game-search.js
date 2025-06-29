// commands/game-search.js
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const fetch = require("node-fetch");
const cheerio = require("cheerio");

const GENRE_TAG_MAP = {
  "전체": null,
  "1인칭 슈팅": 1663, "3인칭 슈팅": 3814, "로그라이크": 1716, "RPG": 122, "JRPG": 4434,
  "어드벤처": 21, "액션": 19, "공포": 1667, "턴제": 1677, "전략": 9, "시뮬레이션": 599,
  "샌드박스": 3810, "아케이드": 1773, "격투": 1743, "퍼즐": 1664, "음악": 1621,
  "귀여운": 4726, "애니메": 4085, "레이싱": 699, "배틀로얄": 176981, "싱글플레이": 4182
};
const GENRE_CHOICES = [
  { name: "전체", value: "전체" },
  ...Object.keys(GENRE_TAG_MAP).filter(x => x !== "전체").map(name => ({ name, value: name }))
];

const SORT_CHOICES = [
  { name: "최신순", value: "latest" },
  { name: "인기순", value: "popular" },
  { name: "무작위", value: "random" },
  { name: "과거순", value: "oldest" },
  { name: "부정적", value: "negative" },
];

const BASE_URL = "https://store.steampowered.com/search/?untags=12095,5611,6650,9130&category1=998&unvrsupport=401&ndl=1";
const EMBED_IMG = "https://media.discordapp.net/attachments/1388728993787940914/1388729871508832267/image.png?ex=68620afa&is=6860b97a&hm=0dfb144342b6577a6d7d8abdbd2338cdee5736dd948cfe49a428fdc7cb2d199a&=&format=webp&quality=lossless";
const ALL_KEYWORDS = ["전체", "all", "없음", "그냥", "전부"];

function hasKorean(text) {
  return /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(text);
}

function formatKoreanDate(str) {
  if (!str) return "";
  if (/[년월일]/.test(str)) return str;
  const months = {
    Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
    Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12"
  };
  let m = str.match(/^(\d{1,2}) (\w{3}), (\d{4})$/);
  if (m) {
    const [_, d, mon, y] = m;
    return `${y}년 ${months[mon]}월 ${d.padStart(2, "0")}일`;
  }
  m = str.match(/^(\w{3}) (\d{1,2}), (\d{4})$/);
  if (m) {
    const [_, mon, d, y] = m;
    return `${y}년 ${months[mon]}월 ${d.padStart(2, "0")}일`;
  }
  m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const [_, y, mon, d] = m;
    return `${y}년 ${mon}월 ${d}일`;
  }
  return str;
}

function parseSteamReview(reviewHtml) {
  if (!reviewHtml || typeof reviewHtml !== "string" || !reviewHtml.trim()) return { text: "평가 없음", count: null, percent: null, score: 0 };
  const map = {
    "Overwhelmingly Positive": {kor:"압도적으로 긍정적", score: 6},
    "Very Positive": {kor:"매우 긍정적", score: 5},
    "Mostly Positive": {kor:"대체로 긍정적", score: 4},
    "Positive": {kor:"긍정적", score: 3},
    "Mixed": {kor:"복합적", score: 0},
    "Mostly Negative": {kor:"대체로 부정적", score: -2},
    "Negative": {kor:"부정적", score: -3},
    "Overwhelmingly Negative": {kor:"압도적으로 부정적", score: -4},
    "No user reviews": {kor:"평가 없음", score: 0}
  };
  let matched = Object.entries(map).find(([eng]) => reviewHtml.includes(eng));
  let kor = matched ? matched[1].kor : "평가 없음";
  let score = matched ? matched[1].score : 0;
  let percent = null, count = null;
  let m = reviewHtml.match(/([\d.]+)% of the ([\d,]+) user reviews/);
  if (m) {
    percent = m[1];
    count = m[2].replace(/,/g, "");
  }
  let resultText = kor;
  if (kor && percent && count) {
    resultText = `${kor} (${count}명, ${percent}% 긍정)`;
  } else if (kor && count) {
    resultText = `${kor} (${count}명)`;
  }
  return { text: resultText, count, percent, score };
}

// 상세페이지에서 한국어/멀티 지원 스크래핑
async function getSupportInfo(appid) {
  try {
    const html = await fetch(`https://store.steampowered.com/app/${appid}/?l=koreana`, { headers: { "user-agent": "discord-bot" } }).then(r => r.text());
    const $ = cheerio.load(html);

    // --- 한국어 지원 여부 ---
    let kor = false;
    $("#languageTable tr").each((i, el) => {
      const firstTd = $(el).find("td").eq(0).text().trim();
      if (!firstTd.includes("한국어")) return;
      // '지원하지 않음'이 아닌 칸이 있는지 체크
      let hasSupport = false;
      $(el).find("td").each((idx, td) => {
        if (idx === 0) return;
        const txt = $(td).text().trim();
        if (txt && !txt.includes("지원하지 않음")) hasSupport = true;
      });
      if (hasSupport) kor = true;
    });

    // --- 멀티/싱글 지원 여부 ---
    let support = "미확인";
    const labels = [];
    $(".label").each((i, el) => labels.push($(el).text().trim()));
    const hasSingle = labels.some(l => l.includes("싱글 플레이어"));
    const hasMulti = labels.some(l => l.includes("멀티플레이어"));
    if (hasSingle && hasMulti) support = "싱글+멀티";
    else if (hasMulti) support = "멀티";
    else if (hasSingle) support = "싱글";

    return { kor, support };
  } catch {
    return { kor: false, support: "미확인" };
  }
}


// 구글 번역
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

async function fetchSteamGamesByTerm(term, tagIds, sort) {
  let url = BASE_URL;
  // 정렬 방식
  if (sort === "latest") url += "&sort_by=Released_DESC";
  else if (sort === "popular") url += "&filter=topsellers";
  else if (sort === "oldest") url += "&sort_by=Released_ASC";
  else url += "&sort_by=Released_DESC"; // 기본 최신순

  if (tagIds && tagIds.length > 0) url += "&tags=" + tagIds.join(",");
  if (term && term.trim() !== "") url += "&term=" + encodeURIComponent(term.trim());
  const html = await fetch(url, { headers: { "user-agent": "discord-bot" } }).then(r => r.text());
  const $ = cheerio.load(html);
  const gameList = [];
  $('.search_result_row').each((i, el) => {
    if (i >= 50) return false;
    const $el = $(el);
    const appid = $el.attr('data-ds-appid');
    const name = $el.find('.title').text().trim();
    const link = $el.attr('href');
    const release = $el.find('.search_released').text().trim();
    const price = $el.find('.search_price, .discount_final_price').first().text().trim();
    const review = $el.find('.search_reviewscore span').attr('data-tooltip-html') || "";
    if (appid && name) {
      gameList.push({ id: appid, name, link, release, price, review });
    }
  });
  return gameList;
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

// 정렬 유틸(부정적, 무작위)
function sortGames(list, mode) {
  if (mode === "random") return getRandomItems(list, list.length);
  if (mode === "negative") {
    return [...list].sort((a, b) => {
      const sA = parseSteamReview(a.review).score;
      const sB = parseSteamReview(b.review).score;
      return sA - sB; // 오름차순(부정적 우선)
    });
  }
  return list;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("게임검색")
    .setDescription("Steam 스토어에서 장르+키워드로 게임을 검색합니다.")
    .addStringOption(opt =>
      opt.setName("장르1")
        .setDescription("필수 장르 (예: 전체, 액션, 공포, RPG 등)")
        .setRequired(true)
        .addChoices(...GENRE_CHOICES)
    )
    .addStringOption(opt =>
      opt.setName("키워드")
        .setDescription("검색할 키워드 (전체 검색을 희망하는 경우 '없음' 또는 '전체' 입력)")
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName("정렬")
        .setDescription("정렬 방식 (최신순/인기순/무작위/과거순/부정적)")
        .setRequired(true)
        .addChoices(...SORT_CHOICES)
    )
    .addStringOption(opt =>
      opt.setName("추가장르1")
        .setDescription("추가 장르1 (선택)")
        .setRequired(false)
        .addChoices(...GENRE_CHOICES)
    )
    .addStringOption(opt =>
      opt.setName("추가장르2")
        .setDescription("추가 장르2 (선택)")
        .setRequired(false)
        .addChoices(...GENRE_CHOICES)
    )
    .addStringOption(opt =>
      opt.setName("추가장르3")
        .setDescription("추가 장르3 (선택)")
        .setRequired(false)
        .addChoices(...GENRE_CHOICES)
    ),
  async execute(interaction) {
    const genres = [
      interaction.options.getString("장르1"),
      interaction.options.getString("추가장르1"),
      interaction.options.getString("추가장르2"),
      interaction.options.getString("추가장르3"),
    ].filter(Boolean);

    let tagIds = [];
    if (!(genres.length === 1 && genres[0] === "전체")) {
      tagIds = [...new Set(genres.filter(g => g !== "전체").map(g => GENRE_TAG_MAP[g]).filter(Boolean))];
    }

    let keywordRaw = interaction.options.getString("키워드")?.trim() || "";
    let sortMode = interaction.options.getString("정렬") || "latest";

    let isAllKeyword = false;
    if (
      ALL_KEYWORDS.includes(keywordRaw.toLowerCase()) &&
      keywordRaw.split(/\s+/).length === 1
    ) {
      keywordRaw = "";
      isAllKeyword = true;
    }

    await interaction.deferReply({ ephemeral: true });

    // 한글 키워드 자동 번역 통합 검색(전체검색 모드 제외)
    let searchTerms = [];
    if (!isAllKeyword && keywordRaw && hasKorean(keywordRaw)) {
      const translated = await googleTranslateKorToEn(keywordRaw);
      searchTerms = [keywordRaw];
      if (
        translated &&
        translated.toLowerCase() !== keywordRaw.toLowerCase() &&
        !hasKorean(translated)
      ) {
        searchTerms.push(translated);
      }
    } else if (!isAllKeyword && keywordRaw) {
      searchTerms = [keywordRaw];
    }

    let mergedList = [];
    let seen = new Set();
    if (isAllKeyword || searchTerms.length === 0) {
      mergedList = await fetchSteamGamesByTerm("", tagIds, sortMode);
    } else {
      for (const term of searchTerms) {
        const list = await fetchSteamGamesByTerm(term, tagIds, sortMode);
        for (const g of list) {
          if (!seen.has(g.id)) {
            mergedList.push(g);
            seen.add(g.id);
          }
        }
        if (mergedList.length >= 50) break;
      }
    }

    // 정렬 추가(부정적, 무작위)
    mergedList = sortGames(mergedList, sortMode);

    if (!mergedList.length) {
      const topGames = await fetchSteamGamesByTerm("", tagIds, "popular");
      const picks = getRandomItems(topGames, 3);
      const embed = new EmbedBuilder()
        .setTitle("이런! 검색 결과가 없습니다.\n대신 이런 게임은 어떠신가요?")
        .setColor(0x1b2838)
        .setImage(EMBED_IMG);
      for (let idx in picks) {
        const game = picks[idx];
        const parsedReview = parseSteamReview(game.review);
        const { kor, support } = await getSupportInfo(game.id);
        embed.addFields({
          name: `${parseInt(idx)+1}. ${game.name}`,
          value:
            `[Steam 바로가기](${game.link})\n` +
            `⭐ ${parsedReview.text}\n` +
            (game.release ? `🗓️ 출시일: ${formatKoreanDate(game.release)}\n` : "") +
            (game.price ? `💰 가격: ${game.price}\n` : "") +
            `🌏 한국어: ${kor ? "지원" : "미지원"} / 🎮 멀티: ${support}`,
          inline: false,
        });
      }
      await interaction.editReply({ embeds: [embed], ephemeral: true });
      return;
    }

    // 3개씩 페이지네이션, 지원여부 비동기로 조회
    let pages = [];
    for (let i = 0; i < Math.ceil(mergedList.length/3); i++) {
      let slice = mergedList.slice(i*3, (i+1)*3);
      pages.push(slice);
    }
    let currPage = 0;
    const totalPages = pages.filter(p => p.length > 0).length;

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
        .setDisabled(currPage === totalPages - 1)
    );

    async function createEmbed(results, page, totalPages, genres, keywords) {
      const genreText = genres && genres.length ? `[${genres.join(", ")}]` : '';
      const embed = new EmbedBuilder()
        .setTitle(`🔍 Steam 게임 검색: ${genreText} ${keywords ? keywords : ''}`.trim())
        .setColor(0x1b2838)
        .setFooter({ text: `페이지 ${page + 1} / ${totalPages} (버튼 유효시간: 5분)` })
        .setImage(EMBED_IMG);

      for (let idx in results) {
        const game = results[idx];
        const parsedReview = parseSteamReview(game.review);
        const { kor, support } = await getSupportInfo(game.id);
        embed.addFields({
          name: `${parseInt(idx) + 1}. ${game.name}`,
          value:
            `[Steam 바로가기](${game.link})\n` +
            `⭐ ${parsedReview.text}\n` +
            (game.release ? `🗓️ 출시일: ${formatKoreanDate(game.release)}\n` : "") +
            (game.price ? `💰 가격: ${game.price}\n` : "") +
            `🌏 한국어: ${kor ? "지원" : "미지원"} / 🎮 멀티: ${support}`,
          inline: false,
        });
      }
      return embed;
    }

    let msg = await interaction.editReply({
      embeds: [await createEmbed(pages[currPage], currPage, totalPages, genres, keywordRaw)],
      components: [getActionRow(currPage)],
      ephemeral: true
    });

    const filter = i =>
      i.user.id === interaction.user.id &&
      ["prevPage", "nextPage"].includes(i.customId);

    const collector = msg.createMessageComponentCollector({ filter, time: 300_000 });

    collector.on("collect", async btn => {
      if (btn.customId === "prevPage" && currPage > 0) currPage--;
      else if (btn.customId === "nextPage" && currPage < totalPages - 1) currPage++;
      await btn.update({
        embeds: [await createEmbed(pages[currPage], currPage, totalPages, genres, keywordRaw)],
        components: [getActionRow(currPage)],
        ephemeral: true
      });
    });
    collector.on("end", () => {
      msg.edit({ components: [] }).catch(() => { });
    });
  }
};
