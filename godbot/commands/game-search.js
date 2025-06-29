// commands/game-search.js
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const fetch = require("node-fetch");
const cheerio = require("cheerio");

// 장르 태그
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

const BASE_URL = "https://store.steampowered.com/search/?sort_by=Released_DESC&untags=12095,5611,6650,9130&category1=998&unvrsupport=401&ndl=1";
const EMBED_IMG = "https://media.discordapp.net/attachments/1388728993787940914/1388729871508832267/image.png?ex=68620afa&is=6860b97a&hm=0dfb144342b6577a6d7d8abdbd2338cdee5736dd948cfe49a428fdc7cb2d199a&=&format=webp&quality=lossless";

// 키워드 없는 전체검색 인식 단어
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

// ★ 리뷰 영어→한국어 변환, 인원/비율 한글 표기
function parseSteamReview(reviewHtml) {
  if (!reviewHtml || typeof reviewHtml !== "string" || !reviewHtml.trim()) return { text: "평가 없음", count: null };
  const map = {
    "Overwhelmingly Positive": "압도적으로 긍정적",
    "Very Positive": "매우 긍정적",
    "Mostly Positive": "대체로 긍정적",
    "Positive": "긍정적",
    "Mixed": "복합적",
    "Mostly Negative": "대체로 부정적",
    "Negative": "부정적",
    "Overwhelmingly Negative": "압도적으로 부정적",
    "No user reviews": "평가 없음"
  };
  let matched = Object.entries(map).find(([eng]) => reviewHtml.includes(eng));
  let kor = matched ? matched[1] : null;
  let percent = null, count = null;
  let m = reviewHtml.match(/([\d.]+)% of the ([\d,]+) user reviews/);
  if (m) {
    percent = m[1];
    count = m[2].replace(/,/g, "");
  }
  let resultText = kor ? kor : "평가 없음";
  if (kor && percent && count) {
    resultText = `${kor} (${count}명, ${percent}% 긍정)`;
  } else if (kor && count) {
    resultText = `${kor} (${count}명)`;
  }
  return { text: resultText, count: count };
}

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

async function fetchSteamGamesByTerm(term, tagIds) {
  let url = BASE_URL;
  if (tagIds && tagIds.length > 0) url += "&tags=" + tagIds.join(",");
  if (term && term.trim() !== "") url += "&term=" + encodeURIComponent(term.trim());
  const html = await fetch(url, { headers: { "user-agent": "discord-bot" } }).then(r=>r.text());
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

async function fetchSteamTopRatedGames(tagIds) {
  let url = BASE_URL + "&filter=topsellers";
  if (tagIds && tagIds.length > 0) url += "&tags=" + tagIds.join(",");
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
    if (appid && name) {
      games.push({ id: appid, name, link, release, price, review });
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

    // "전체"만 단독 선택시 태그 없음, 추가장르는 무시
    let tagIds = [];
    if (!(genres.length === 1 && genres[0] === "전체")) {
      tagIds = [...new Set(genres.filter(g => g !== "전체").map(g => GENRE_TAG_MAP[g]).filter(Boolean))];
    }

    let keywordRaw = interaction.options.getString("키워드")?.trim() || "";

    // ★ 전체/ALL/없음/그냥/전부 중 하나만 입력시 term 없이 전체 검색
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
      mergedList = await fetchSteamGamesByTerm("", tagIds);
    } else {
      for (const term of searchTerms) {
        const list = await fetchSteamGamesByTerm(term, tagIds);
        for (const g of list) {
          if (!seen.has(g.id)) {
            mergedList.push(g);
            seen.add(g.id);
          }
        }
        if (mergedList.length >= 50) break;
      }
    }

    if (!mergedList.length) {
      const topGames = await fetchSteamTopRatedGames(tagIds);
      const picks = getRandomItems(topGames, 5);
      const embed = new EmbedBuilder()
        .setTitle("이런! 검색 결과가 없습니다.\n대신 이런 게임은 어떠신가요?")
        .setColor(0x1b2838)
        .setImage(EMBED_IMG);
      picks.forEach((game, idx) => {
        const parsedReview = parseSteamReview(game.review);
        embed.addFields({
          name: `${idx+1}. ${game.name}`,
          value:
            `[Steam 바로가기](${game.link})\n` +
            `⭐ ${parsedReview.text}\n` +
            (game.release ? `🗓️ 출시일: ${formatKoreanDate(game.release)}\n` : "") +
            (game.price ? `💰 가격: ${game.price}\n` : ""),
          inline: false,
        });
      });
      await interaction.editReply({ embeds: [embed], ephemeral: true });
      return;
    }

    let pages = [];
    for (let i = 0; i < 10; i++) {
      let slice = mergedList.slice(i*5, (i+1)*5);
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

    const createEmbed = (results, page, totalPages, genres, keywords) => {
      const genreText = genres && genres.length ? `[${genres.join(", ")}]` : '';
      const embed = new EmbedBuilder()
        .setTitle(`🔍 Steam 게임 검색: ${genreText} ${keywords ? keywords : ''}`.trim())
        .setColor(0x1b2838)
        .setFooter({ text: `페이지 ${page+1} / ${totalPages} (버튼 유효시간: 5분)` })
        .setImage(EMBED_IMG);

      results.forEach((game, idx) => {
        const parsedReview = parseSteamReview(game.review);
        embed.addFields({
          name: `${idx+1}. ${game.name}`,
          value:
            `[Steam 바로가기](${game.link})\n` +
            `⭐ ${parsedReview.text}\n` +
            (game.release ? `🗓️ 출시일: ${formatKoreanDate(game.release)}\n` : "") +
            (game.price ? `💰 가격: ${game.price}\n` : ""),
          inline: false,
        });
      });
      return embed;
    };

    let msg = await interaction.editReply({
      embeds: [createEmbed(pages[currPage], currPage, totalPages, genres, keywordRaw)],
      components: [getActionRow(currPage)],
      ephemeral: true
    });

    const filter = i =>
      i.user.id === interaction.user.id &&
      ["prevPage", "nextPage"].includes(i.customId);

    const collector = msg.createMessageComponentCollector({ filter, time: 300_000 });

    collector.on("collect", async btn => {
      if (btn.customId === "prevPage" && currPage > 0) currPage--;
      else if (btn.customId === "nextPage" && currPage < totalPages-1) currPage++;
      await btn.update({
        embeds: [createEmbed(pages[currPage], currPage, totalPages, genres, keywordRaw)],
        components: [getActionRow(currPage)],
        ephemeral: true
      });
    });
    collector.on("end", () => {
      msg.edit({ components: [] }).catch(()=>{});
    });
  }
};
