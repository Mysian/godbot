// commands/game-search.js
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const fetch = require("node-fetch");

const STEAM_SEARCH_URL = "https://store.steampowered.com/api/storesearch";
const STEAM_DETAILS_URL = "https://store.steampowered.com/api/appdetails";
const EMBED_IMG = "https://media.discordapp.net/attachments/1388728993787940914/1388729871508832267/image.png?ex=68620afa&is=6860b97a&hm=0dfb144342b6577a6d7d8abdbd2338cdee5736dd948cfe49a428fdc7cb2d199a&=&format=webp&quality=lossless";

// 신작(최신순) 트리거 단어
const NEW_KEYWORDS = ["신작", "신작게임", "최신", "new", "newgame", "new_game", "recent"];

// 장르/카테고리/테마 한글-영어 매핑 (이미지 기반 + 확장)
const GENRE_KOR_ENG_MAP = {
  "액션": "action",         "action": "action",
  "1인칭 슈팅": "first-person shooter", "1인칭": "first-person", "fps": "first-person shooter",
  "3인칭 슈팅": "third-person shooter", "3인칭": "third-person", "tps": "third-person shooter",
  "격투 무술": "fighting", "무술": "fighting",
  "슛뎀업": "shoot 'em up", "슈팅": "shooter",
  "아케이드": "arcade",
  "플랫폼": "platformer", "플랫포머": "platformer",
  "핵 앤 슬래시": "hack and slash",
  "어드벤처": "adventure", "모험": "adventure",
  "메트로배니아": "metroidvania",
  "비주얼 노벨": "visual novel",
  "어드벤처 RPG": "adventure RPG",
  "캐쥬얼": "casual", "캐주얼": "casual",
  "퍼즐": "puzzle",
  "풍부한 스토리": "story rich",
  "히든 오브젝트": "hidden object",
  "롤플레잉": "role-playing", "rpg": "RPG", "jrpg": "JRPG",
  "로그라이크": "roguelike",
  "액션 RPG": "action RPG",
  "전략": "strategy",
  "군사": "military",
  "대전략 및 4X": "4X",
  "도시 및 정착": "city builder",
  "실시간 전략": "real-time strategy", "rts": "real-time strategy",
  "카드 및 보드": "card & board",
  "카드": "card", "보드": "board",
  "타워 디펜스": "tower defense",
  "턴제 전략": "turn-based strategy",
  "턴제 RPG": "turn-based RPG",
  "파티 기반": "party-based",
  "시뮬레이션": "simulation", "시뮬": "simulation",
  "건설 및 자동화": "building & automation", "건설": "building", "자동화": "automation",
  "농업 및 제작": "farming & crafting", "농업": "farming", "제작": "crafting",
  "샌드박스 및 물리": "sandbox & physics", "샌드박스": "sandbox",
  "생활 및 일상형": "life simulation", "일상": "life simulation",
  "연애": "dating sim", "연애시뮬": "dating sim",
  "우주 및 비행": "space & flight", "우주": "space", "비행": "flight",
  "취미 및 직업": "hobby & job", "직업": "job",
  "스포츠 및 레이싱": "sports & racing", "스포츠": "sports",
  "레이싱": "racing",
  "음악": "music", "리듬": "rhythm",
  "모든 스포츠": "all sports",
  "팀 스포츠": "team sports",
  "공포": "horror", "공포게임": "horror", "호러": "horror", "horror": "horror",
  "MMO": "MMO", "MMORPG": "MMORPG",
  "오픈월드": "open world",
  "생존": "survival", "생존게임": "survival",
  "메트로배니아": "metroidvania",
  "시티": "city",
  "타이쿤": "tycoon",
};

const THEME_KOR_ENG_MAP = {
  "공상과학": "science fiction", "SF": "science fiction", "sf": "science fiction",
  "사이버펑크": "cyberpunk",
  "미스터리": "mystery", "추리": "detective",
  "성인": "adult", "성인전용": "adult", "19금": "adult",
  "애니메이션": "anime",
  "생존": "survival",
  "오픈 월드": "open world",
  "우주": "space",
  "동물": "animals",
  "좀비": "zombie",
  "도트": "pixel",
  "카툰": "cartoon",
  "판타지": "fantasy",
  "군사": "military",
  "도시": "city",
  "아포칼립스": "apocalypse",
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

function buildQuery(keywords) {
  return `${STEAM_SEARCH_URL}?cc=KR&l=koreana&term=${encodeURIComponent(keywords.join(" "))}`;
}

function extractGenreThemeFilters(inputKeywords) {
  let genreFilters = [];
  let themeFilters = [];
  let remainKeywords = [];
  for (const k of inputKeywords) {
    if (GENRE_KOR_ENG_MAP[k.toLowerCase()]) genreFilters.push(GENRE_KOR_ENG_MAP[k.toLowerCase()]);
    else if (THEME_KOR_ENG_MAP[k.toLowerCase()]) themeFilters.push(THEME_KOR_ENG_MAP[k.toLowerCase()]);
    else remainKeywords.push(k);
  }
  return { genreFilters, themeFilters, remainKeywords };
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

function filterGameByKeyword(game, detail, inputKeywords, genreFilters, themeFilters, directTitle) {
  if (isAdultGame(detail)) return false;
  // 장르 필터
  if (genreFilters && genreFilters.length > 0) {
    const genres = (detail && detail.data.genres) ? detail.data.genres.map(x => x.description.toLowerCase()) : [];
    let hit = false;
    for (const genre of genreFilters) {
      if (genres.some(g => g.includes(genre.toLowerCase()))) hit = true;
    }
    if (!hit) return false;
  }
  // 테마 필터
  if (themeFilters && themeFilters.length > 0) {
    const genres = (detail && detail.data.genres) ? detail.data.genres.map(x => x.description.toLowerCase()) : [];
    const cats = (detail && detail.data.categories) ? detail.data.categories.map(x => x.description.toLowerCase()) : [];
    let hit = false;
    for (const theme of themeFilters) {
      if (
        genres.some(g => g.includes(theme.toLowerCase())) ||
        cats.some(c => c.includes(theme.toLowerCase()))
      ) hit = true;
    }
    if (!hit) return false;
  }
  // 직접 제목 포함 모드 (ex. 젤다, 롤, 바이오하자드 등)
  if (directTitle && directTitle.length > 0) {
    const lowTitle = (detail && detail.data.name) ? detail.data.name.toLowerCase() : "";
    let hit = false;
    for (const t of directTitle) {
      if (lowTitle.includes(t.toLowerCase())) hit = true;
    }
    if (!hit) return false;
  }
  // 그 외 기존 필터
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
    (genres.length ? "🎮 장르: " + genres.join(", ") + "\n" : "") +
    (detail && detail.data.release_date && detail.data.release_date.date ? `🗓️ 출시일: ${detail.data.release_date.date}\n` : "");
  return desc;
}

function createEmbed(results, page, totalPages, keywords, details, inputKeywords, noticeMsg) {
  const embed = new EmbedBuilder()
    .setTitle(`🔍 Steam 게임 검색: ${keywords.join(", ")}`)
    .setColor(0x1b2838)
    .setFooter({ text: `페이지 ${page+1} / ${totalPages} (버튼 유효시간: 5분)` });
    .setImage(EMBED_IMG);

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

async function fetchRecentGames() {
  const url = `${STEAM_SEARCH_URL}?cc=KR&l=koreana&term=&count=250`;
  const res = await fetch(url, { headers: { "accept": "application/json", "user-agent": "discord-bot" }});
  const data = await res.json();
  const items = (data?.items || []).filter(x => x.release_date);
  items.sort((a, b) => (b.release_date || 0) - (a.release_date || 0));
  return items.slice(0, 50);
}

async function searchWithRelaxedKeywords(originKeywords, googleTranslateKorToEn) {
  function getAllRelaxedSets(arr) {
    const out = [];
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
    for (let i = 0; i < arr.length; i++) out.push([arr[i]]);
    return out;
  }

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
  const seen = new Set();
  const uniq = [];
  for (const arr of tryKeywordsList) {
    const key = arr.join("|");
    if (!seen.has(key)) {
      uniq.push(arr);
      seen.add(key);
    }
  }

  for (const keywords of uniq) {
    let allGames = [];
    let searchUrl = buildQuery(keywords);
    let res = await fetch(searchUrl, { headers: { "accept": "application/json", "user-agent": "discord-bot" }});
    let data = await res.json();
    let games = (data?.items || []).filter(x => !!x.name);
    allGames = allGames.concat(games);

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
  return { found: false, uniqueGames: [], keywords: originKeywords };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("게임검색")
    .setDescription("Steam 스토어에서 키워드로 게임을 검색합니다.")
    .addStringOption(opt =>
      opt.setName("키워드")
        .setDescription("검색할 키워드(띄어쓰기로 여러 개 가능, 예: 액션 RPG 공포 신작)")
        .setRequired(true)
    ),
  async execute(interaction) {
    const keywordRaw = interaction.options.getString("키워드").trim();
    const inputKeywords = keywordRaw.split(/\s+/);
    await interaction.deferReply({ ephemeral: true });

    // 장르/테마/제목 자동 인식
    const { genreFilters, themeFilters, remainKeywords } = extractGenreThemeFilters(inputKeywords);

    // 제목 직접검색용(매핑에 없고, 영어번역도 안되는 단어들만)
    const directTitle = remainKeywords.filter(k => !GENRE_KOR_ENG_MAP[k.toLowerCase()] && !THEME_KOR_ENG_MAP[k.toLowerCase()] && !/[가-힣a-zA-Z0-9]/.test(k) === false);

    const onlyNew = inputKeywords.length === 1 && NEW_KEYWORDS.includes(inputKeywords[0].toLowerCase());
    const hasNew = inputKeywords.some(k => NEW_KEYWORDS.includes(k.toLowerCase()));

    let uniqueGames = [];
    let keywords = inputKeywords;
    let noticeMsg = "";
    if (onlyNew || hasNew) {
      uniqueGames = await fetchRecentGames();
      noticeMsg = "※ '신작' 키워드는 최신 출시 게임 기준으로 50개까지 보여줍니다.";
      keywords = ["신작 게임"];
    } else {
      let searchRes = await searchWithRelaxedKeywords(inputKeywords, googleTranslateKorToEn);
      if (!searchRes.found) {
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
      if (searchRes.keywords.length !== inputKeywords.length || searchRes.keywords.join(" ") !== inputKeywords.join(" ")) {
        noticeMsg = "※ 검색 결과가 없어서 일부 키워드를 생략해 자동으로 재검색했습니다.";
      }
      uniqueGames = searchRes.uniqueGames;
      keywords = searchRes.keywords;
    }

    let details = await getGameDetails(uniqueGames.map(g=>g.id));
    uniqueGames = uniqueGames.filter(g => filterGameByKeyword(g, details[g.id], keywords, genreFilters, themeFilters, directTitle));

    let pages = [];
    for (let i = 0; i < 10; i++) {
      let slice = uniqueGames.slice(i*5, (i+1)*5);
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
      embeds: [createEmbed(pages[currPage], currPage, totalPages, keywords, details, keywords, noticeMsg)],
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
