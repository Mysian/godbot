// commands/game-search.js
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const fetch = require("node-fetch");
const cheerio = require("cheerio");

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

// 게임 크롤러 (검색어: term 인코딩)
async function fetchSteamGamesByTerm(term) {
  let url = BASE_URL;
  if (term && term.trim() !== "") {
    url += "&term=" + encodeURIComponent(term.trim());
  }
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

// 추천게임
async function fetchSteamTopRatedGames() {
  const url = BASE_URL + "&filter=topsellers";
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

// 한글 여부 판별
function hasKorean(text) {
  return /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(text);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("게임검색")
    .setDescription("Steam 스토어에서 키워드로 게임을 검색합니다.")
    .addStringOption(opt =>
      opt.setName("키워드")
        .setDescription("검색할 키워드(띄어쓰기로 여러 개 가능, 예: 공포 좀비 슈팅)")
        .setRequired(false)
    ),
  async execute(interaction) {
    const keywordRaw = interaction.options.getString("키워드")?.trim() || "";
    await interaction.deferReply({ ephemeral: true });

    let searchTerms = [];
    // 한글이면 번역 추가
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

    // 검색결과 통합
    let mergedList = [];
    let seen = new Set();
    if (searchTerms.length > 0) {
      for (const term of searchTerms) {
        const list = await fetchSteamGamesByTerm(term);
        for (const g of list) {
          if (!seen.has(g.id)) {
            mergedList.push(g);
            seen.add(g.id);
          }
        }
        if (mergedList.length >= 50) break;
      }
    } else {
      // 키워드 없으면 최신 전체
      mergedList = await fetchSteamGamesByTerm("");
    }

    if (!mergedList.length) {
      // 결과 없으면 추천 5개
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

    const createEmbed = (results, page, totalPages, keywords) => {
      const embed = new EmbedBuilder()
        .setTitle(`🔍 Steam 게임 검색: ${keywords ? keywords : '최신 게임'}`)
        .setColor(0x1b2838)
        .setFooter({ text: `페이지 ${page+1} / ${totalPages} (버튼 유효시간: 5분)` })
        .setImage(EMBED_IMG);

      results.forEach((game, idx) => {
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
      return embed;
    };

    let msg = await interaction.editReply({
      embeds: [createEmbed(pages[currPage], currPage, totalPages, keywordRaw)],
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
        embeds: [createEmbed(pages[currPage], currPage, totalPages, keywordRaw)],
        components: [getActionRow(currPage)],
        ephemeral: true
      });
    });
    collector.on("end", () => {
      msg.edit({ components: [] }).catch(()=>{});
    });
  }
};
