// commands/game-search.js
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const fetch = require("node-fetch");
const cheerio = require("cheerio");

const GENRE_TAG_MAP = {
  "1인칭 슈팅": 1663, "3인칭 슈팅": 3814, "로그라이크": 1716, "RPG": 122, "JRPG": 4434,
  "어드벤처": 21, "액션": 19, "공포": 1667, "턴제": 1677, "전략": 9, "시뮬레이션": 599,
  "샌드박스": 3810, "아케이드": 1773, "격투": 1743, "퍼즐": 1664, "음악": 1621,
  "귀여운": 4726, "애니메": 4085, "레이싱": 699, "배틀로얄": 176981, "싱글플레이": 4182
};
const GENRE_CHOICES = Object.keys(GENRE_TAG_MAP).map(name => ({ name, value: name }));

const BASE_URL = "https://store.steampowered.com/search/?sort_by=Released_DESC&untags=12095,5611,6650,9130&category1=998&unvrsupport=401&ndl=1";
const EMBED_IMG = "https://media.discordapp.net/attachments/1388728993787940914/1388729871508832267/image.png?ex=68620afa&is=6860b97a&hm=0dfb144342b6577a6d7d8abdbd2338cdee5736dd948cfe49a428fdc7cb2d199a&=&format=webp&quality=lossless";

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

// 검색 결과 크롤러
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

// 추천게임(장르 적용)
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

// 상세정보 API
async function fetchGameDetails(appids) {
  let result = {};
  await Promise.all(appids.map(async id => {
    try {
      let res = await fetch(`https://store.steampowered.com/api/appdetails?appids=${id}&cc=KR&l=koreana`);
      let json = await res.json();
      result[id] = json[id]?.data || null;
    } catch {}
  }));
  return result;
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
function hasKorean(text) {
  return /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(text);
}

// 지원 언어(한글), 카테고리(멀티/싱글/협동), 유저 평가 파싱
function parseExtraInfo(detail) {
  if (!detail) return {
    korean: false,
    multiplayer: false,
    singleplayer: false,
    coop: false,
    review: "평가 자료 부족"
  };

function formatKoreanDate(str) {
  if (!str) return "";
  // 케이스: 2025년 7월 2일 (이미 한글이면 그대로)
  if (/[년월일]/.test(str)) return str;
  // 케이스: Jun 25, 2025 또는 25 Jun, 2025
  const months = {
    Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
    Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12"
  };
  // "25 Jun, 2025"
  let m = str.match(/^(\d{1,2}) (\w{3}), (\d{4})$/);
  if (m) {
    const [_, d, mon, y] = m;
    return `${y}년 ${months[mon]}월 ${d.padStart(2, "0")}일`;
  }
  // "Jun 25, 2025"
  m = str.match(/^(\w{3}) (\d{1,2}), (\d{4})$/);
  if (m) {
    const [_, mon, d, y] = m;
    return `${y}년 ${months[mon]}월 ${d.padStart(2, "0")}일`;
  }
  // "2025-06-25" ISO 케이스
  m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const [_, y, mon, d] = m;
    return `${y}년 ${mon}월 ${d}일`;
  }
  // 못 맞추면 그대로
  return str;
}

  const kor = (detail.supported_languages || "").includes("한국어");
  const categories = (detail.categories || []).map(c=>c.description);
  const mp = categories.some(c => /멀티|Multi/i.test(c));
  const sp = categories.some(c => /싱글|Single/i.test(c));
  const coop = categories.some(c => /협동|Co-op|Coop/i.test(c));
  // 유저평가(steam 평점, metacritic 등)
  let review = "평가 자료 부족";
  if (detail.recommendations && detail.recommendations.total)
    review = `추천 ${detail.recommendations.total.toLocaleString()}+`;
  else if (detail.metacritic && detail.metacritic.score)
    review = `메타크리틱 ${detail.metacritic.score}`;
  else if (detail.release_date && detail.release_date.coming_soon)
    review = "출시 예정";
  else if (detail.short_description && /압도적으로 긍정적|매우 긍정적|긍정적|복합적|부정적|매우 부정적|없음/.test(detail.short_description))
    review = detail.short_description.match(/압도적으로 긍정적|매우 긍정적|긍정적|복합적|부정적|매우 부정적|없음/)[0];

  return { korean: kor, multiplayer: mp, singleplayer: sp, coop, review };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("게임검색")
    .setDescription("Steam 스토어에서 장르+키워드로 게임을 검색합니다.")
    .addStringOption(opt =>
      opt.setName("장르1")
        .setDescription("필수 장르 (예: 액션, 공포, RPG 등)")
        .setRequired(true)
        .addChoices(...GENRE_CHOICES)
    )
    .addStringOption(opt =>
      opt.setName("키워드")
        .setDescription("검색할 키워드 (선택, 예: 좀비, 판타지 등)")
        .setRequired(false)
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
    const tagIds = [...new Set(genres.map(g => GENRE_TAG_MAP[g]).filter(Boolean))];

    const keywordRaw = interaction.options.getString("키워드")?.trim() || "";
    await interaction.deferReply({ ephemeral: true });

    let searchTerms = [];
    if (keywordRaw && hasKorean(keywordRaw)) {
      const translated = await googleTranslateKorToEn(keywordRaw);
      searchTerms = [keywordRaw];
      if (
        translated &&
        translated.toLowerCase() !== keywordRaw.toLowerCase() &&
        !hasKorean(translated)
      ) {
        searchTerms.push(translated);
      }
    } else if (keywordRaw) {
      searchTerms = [keywordRaw];
    }

    let mergedList = [];
    let seen = new Set();
    if (searchTerms.length > 0) {
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
    } else {
      mergedList = await fetchSteamGamesByTerm("", tagIds);
    }

    // 게임 상세 데이터 불러오기 (한 번에)
    const details = await fetchGameDetails(mergedList.map(g=>g.id));

    if (!mergedList.length) {
      const topGames = await fetchSteamTopRatedGames(tagIds);
      const picks = getRandomItems(topGames, 5);
      const detailPick = await fetchGameDetails(picks.map(g=>g.id));
      const embed = new EmbedBuilder()
        .setTitle("이런! 검색 결과가 없습니다.\n대신 이런 게임은 어떠신가요?")
        .setColor(0x1b2838)
        .setImage(EMBED_IMG);
      picks.forEach((game, idx) => {
        const extra = parseExtraInfo(detailPick[game.id]);
        embed.addFields({
          name: `${idx+1}. ${game.name}`,
          value:
            `[Steam 바로가기](${game.link})\n` +
            (game.release ? `🗓️ 출시일: ${formatKoreanDate(game.release)}\n` : "") +
            (game.price ? `💰 가격: ${game.price}\n` : "") +
            (extra.korean ? "🇰🇷 **한국어 지원**  " : "") +
            (extra.multiplayer ? "🧑‍🤝‍🧑 **멀티플레이**  " : "") +
            (extra.singleplayer ? "👤 싱글 " : "") +
            (extra.coop ? "🤝 협동 " : "") +
            `\n⭐ 유저 평가: ${extra.review}`,
          inline: false,
        });
      });
      await interaction.editReply({ embeds: [embed], ephemeral: true });
      return;
    }

    // 페이지 분할
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
        const extra = parseExtraInfo(details[game.id]);
        embed.addFields({
          name: `${idx+1}. ${game.name}`,
          value:
            `[Steam 바로가기](${game.link})\n` +
            (game.release ? `🗓️ 출시일: ${formatKoreanDate(game.release)}\n` : "") +
            (game.price ? `💰 가격: ${game.price}\n` : "") +
            (extra.korean ? "🇰🇷 **한국어 지원**  " : "") +
            (extra.multiplayer ? "🧑‍🤝‍🧑 **멀티플레이**  " : "") +
            (extra.singleplayer ? "👤 싱글 " : "") +
            (extra.coop ? "🤝 협동 " : "") +
            `\n⭐ 유저 평가: ${extra.review}`,
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
