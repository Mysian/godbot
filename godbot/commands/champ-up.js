const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const lockfile = require("proper-lockfile");
const championList = require("../utils/champion-data");
const { getChampionKeyByName } = require("../utils/champion-utils");
const { battles, battleRequests } = require("./champ-battle");
const { getBE, addBE } = require("./be-util"); // BE 연동!

const dataPath = path.join(__dirname, "../data/champion-users.json");
const enhanceHistoryPath = path.join(__dirname, "../data/champion-enhance-history.json");
const SOUL_ROLE_ID = "1382169247538745404";

const GREAT_SUCCESS_RATE = 0.05;
const ENHANCE_BE_COST = 0; // 강화 1회당 소모 BE (원하는 값으로 설정)
function formatNum(n) { return n.toLocaleString("ko-KR"); }

async function loadJSON(p) {
  if (!fs.existsSync(p)) fs.writeFileSync(p, "{}");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
async function saveJSON(p, d) {
  fs.writeFileSync(p, JSON.stringify(d, null, 2));
}
async function updateEnhanceHistory(userId, { success = false, fail = false, max = null } = {}) {
  let release;
  try {
    release = await lockfile.lock(enhanceHistoryPath, { retries: { retries: 10, minTimeout: 30, maxTimeout: 100 } });
    let hist = await loadJSON(enhanceHistoryPath);
    if (!hist[userId]) hist[userId] = { total: 0, success: 0, fail: 0, max: 0 };
    hist[userId].total++;
    if (success) hist[userId].success++;
    if (fail) hist[userId].fail++;
    if (max !== null && max > hist[userId].max) hist[userId].max = max;
    await saveJSON(enhanceHistoryPath, hist);
  } catch (e) {} finally {
    if (release) try { await release(); } catch {}
  }
}
function getSuccessRate(level) {
  if (level < 10) return 0.9;
  if (level < 30) return 0.8;
  if (level < 50) return 0.7;
  if (level < 100) return 0.6;
  if (level < 200) return 0.4;
  if (level < 500) return 0.3;
  if (level < 900) return 0.2;
  return 0.1;
}
function getSurviveRate(level) {
  const maxRate = 0.8;
  const minRate = 0.1;
  let rate = minRate + (maxRate - minRate) * (level / 999);
  if (rate > maxRate) rate = maxRate;
  return rate;
}
function calcStatGain(level, baseAtk, baseAp) {
  let mainStat = baseAtk >= baseAp ? 'attack' : 'ap';
  let subStat = baseAtk >= baseAp ? 'ap' : 'attack';
  let mainGain = Math.floor((level / 5) + 2) * 1.5;
  let subGain = Math.floor((level / 7) + 1);
  let hpGain = (level * 5) + 50;
  let defGain = Math.floor((level / 10) + 1);
  let penGain = level % 2 === 0 ? 1 : 0;
  let gain = { attack: 0, ap: 0, hp: hpGain, defense: defGain, penetration: penGain };
  gain[mainStat] = mainGain;
  gain[subStat] = subGain;
  return { gain, mainStat, subStat };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("챔피언강화")
    .setDescription("보유한 챔피언을 강화합니다 (최대 999강)"),
  async execute(interaction) {
    let release;
    let errorMessage = null;
    let immediateReply = null;
    try {
      await interaction.deferReply({ ephemeral: true });
      const userId = interaction.user.id;
      if (battles.has(userId) || battleRequests.has(userId)) {
        return interaction.editReply({
          content: "⚔️ 진행중이거나 대기중인 챔피언 배틀이 있어 강화할 수 없습니다!",
          ephemeral: true
        });
      }
      release = await lockfile.lock(dataPath, { retries: { retries: 10, minTimeout: 30, maxTimeout: 100 } });
      const data = await loadJSON(dataPath);
      if (!data[userId] || !data[userId].name) {
        immediateReply = { content: `❌ 먼저 /챔피언획득 으로 챔피언을 얻어야 합니다.` };
        return;
      }
      if (data[userId].level >= 999) {
        immediateReply = { content: `⚠️ 이미 최대 강화 상태입니다! (**${data[userId].level}강**)` };
        return;
      }
    } catch (err) {
      errorMessage = "❌ 오류 발생! 잠시 후 다시 시도해주세요.";
    } finally {
      if (release) try { await release(); } catch {}
      if (errorMessage) return interaction.editReply({ content: errorMessage });
      if (immediateReply) return interaction.editReply(immediateReply);
      return startUpgrade(interaction, interaction.user.id, `<@${interaction.user.id}>`);
    }
  }
};

async function startUpgrade(interaction, userId, userMention) {
  let release;
  let errorMessage = null;
  let displayContent = null;
  try {
    release = await lockfile.lock(dataPath, { retries: { retries: 10, minTimeout: 30, maxTimeout: 100 } });
    const data = await loadJSON(dataPath);
    const champ = data[userId];

    const champKey = getChampionKeyByName(champ.name);
    const champImg = champKey
      ? `https://ddragon.leagueoflegends.com/cdn/15.11.1/img/champion/${champKey}.png`
      : null;

    const rate = getSuccessRate(champ.level);
    const surviveRate = getSurviveRate(champ.level);
    const percent = Math.floor(rate * 1000) / 10;
    const survivePercent = Math.floor(surviveRate * 1000) / 10;

    const base = championList.find(c => c.name === champ.name)?.stats;
    champ.stats = champ.stats || { ...base };

    const { gain, mainStat } = calcStatGain(champ.level, champ.stats.attack, champ.stats.ap);
    const prevStats = { ...champ.stats };
    const upStats = {
      ...champ.stats,
      attack: champ.stats.attack + gain.attack,
      ap: champ.stats.ap + gain.ap,
      hp: champ.stats.hp + gain.hp,
      defense: champ.stats.defense + gain.defense,
      penetration: champ.stats.penetration + gain.penetration,
    };

    // BE 관련 정보
    const myBE = getBE(userId);
    const costBE = ENHANCE_BE_COST;
    const afterBE = myBE - costBE;

    const statList = [
      { label: "공격력", key: "attack", emoji: "⚔️" },
      { label: "주문력", key: "ap", emoji: "🔮" },
      { label: "체력", key: "hp", emoji: "❤️" },
      { label: "방어력", key: "defense", emoji: "🛡️" },
      { label: "관통력", key: "penetration", emoji: "💥" },
    ];
    let statDesc = statList.map(stat =>
      `${stat.emoji} **${stat.label}**\n${prevStats[stat.key]} → **${upStats[stat.key]}**\n`
    ).join("\n");

    const embed = new EmbedBuilder()
      .setTitle(`🔧 챔피언 강화 준비`)
      .setDescription(
        `**${champ.name} ${champ.level}강** → **${champ.level + 1}강**
📈 강화 확률: **${percent}%**
🛡️ 실패 시 소멸 방지 확률(레벨에 따라 증가, 최대 80%): **${survivePercent}%**
🔷 **필요 BE:** ${formatNum(costBE)}개
💰 **내 BE:** ${formatNum(myBE)}개
💸 **강화 후 BE:** ${myBE >= costBE ? formatNum(afterBE) : "부족"}

**스탯 변화 (성공 시):**

${statDesc}

> **${mainStat === "attack" ? "공격력" : "주문력"}** 중심 챔피언이기 때문에 딜링 기반 스탯의 증가량이 더 큽니다!
`
      )
      .setColor(mainStat === "attack" ? 0xff9800 : 0x673ab7);

    if (champImg) embed.setThumbnail(champImg);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("champion-upgrade-confirm")
        .setLabel("🔥 강화 시도")
        .setStyle(ButtonStyle.Success)
        .setDisabled(myBE < costBE),
      new ButtonBuilder()
        .setCustomId("champion-upgrade-cancel")
        .setLabel("🛑 강화 중단")
        .setStyle(ButtonStyle.Secondary)
    );

    displayContent = {
      embeds: [embed],
      components: [row],
      ephemeral: true
    };
  } catch (err) {
    errorMessage = "❌ 강화 준비 중 오류 발생! 잠시 후 다시 시도해주세요.";
  } finally {
    if (release) try { await release(); } catch {}
    if (errorMessage) return interaction.editReply({ content: errorMessage });
    if (displayContent) {
      await interaction.editReply(displayContent);
      await setupUpgradeCollector(interaction, userId, userMention);
      return;
    }
  }
}

async function setupUpgradeCollector(interaction, userId, userMention) {
  const filter = i =>
    i.user.id === userId &&
    ["champion-upgrade-confirm", "champion-upgrade-cancel"].includes(i.customId);

  const collector = interaction.channel.createMessageComponentCollector({
    filter,
    time: 60000,
    max: 1
  });

  let ended = false;

  collector.on("collect", async i => {
    if (ended) return;
    ended = true;
    try { await i.deferUpdate(); } catch (err) {}
    if (i.customId === "champion-upgrade-cancel") {
      try {
        await i.editReply({
          content: "⚪ 강화가 취소되었습니다.",
          embeds: [],
          components: [],
          ephemeral: true
        });
      } catch (err) {}
      return;
    }
    await handleUpgradeProcess(i, userId, userMention);
  });

  collector.on("end", async (collected, reason) => {
    if (collected.size === 0) {
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.editReply({
            content: "⏳ 강화 준비 시간이 초과되었습니다. 다시 시도해주세요.",
            embeds: [],
            components: [],
            ephemeral: true
          });
        }
      } catch (err) {}
    }
  });
}

async function handleUpgradeProcess(interaction, userId, userMention) {
  let release2;
  let errorMessage = null;
  let resultContent = null;
  try {
    // BE 차감 lock!
    let myBE = getBE(userId);
    if (myBE < ENHANCE_BE_COST) {
      return interaction.editReply({
        content: `❌ 파랑 정수(BE)가 부족합니다! (필요: ${formatNum(ENHANCE_BE_COST)}개, 보유: ${formatNum(myBE)}개)`,
        embeds: [],
        components: [],
        ephemeral: true
      });
    }
    await addBE(userId, -ENHANCE_BE_COST, "챔피언 강화");

    release2 = await lockfile.lock(dataPath, { retries: { retries: 10, minTimeout: 30, maxTimeout: 100 } });
    let dataNow = await loadJSON(dataPath);
    let champNow = dataNow[userId];

    const rateNow = getSuccessRate(champNow.level);
    const surviveRateNow = getSurviveRate(champNow.level);
    const { gain: gainNow, mainStat: mainNow } = calcStatGain(champNow.level, champNow.stats.attack, champNow.stats.ap);

    const success = Math.random() < rateNow;
    let greatSuccess = false;
    let greatGainNum = 1;

    await updateEnhanceHistory(userId, { success, fail: !success });

    if (success) {
      if (Math.random() < GREAT_SUCCESS_RATE) {
        greatSuccess = true;
        greatGainNum = Math.floor(Math.random() * 4) + 2; // 2~5강 랜덤
      }
      let beforeLevel = champNow.level;
      let oldStats = { ...champNow.stats };
      champNow.level += greatGainNum;
      if (champNow.level > 999) champNow.level = 999;
      champNow.success += 1;
      for (let i = 0; i < greatGainNum; i++) {
        const { gain } = calcStatGain(beforeLevel + i, champNow.stats.attack, champNow.stats.ap);
        champNow.stats.attack += gain.attack;
        champNow.stats.ap += gain.ap;
        champNow.stats.hp += gain.hp;
        champNow.stats.defense += gain.defense;
        champNow.stats.penetration += gain.penetration;
      }
      await saveJSON(dataPath, dataNow);
      await updateEnhanceHistory(userId, { max: champNow.level });

      let diffStatDesc = [
        { label: "공격력", key: "attack", emoji: "⚔️" },
        { label: "주문력", key: "ap", emoji: "🔮" },
        { label: "체력", key: "hp", emoji: "❤️" },
        { label: "방어력", key: "defense", emoji: "🛡️" },
        { label: "관통력", key: "penetration", emoji: "💥" },
      ].map(stat =>
        `${stat.emoji} **${stat.label}**\n${oldStats[stat.key]} → **${champNow.stats[stat.key]}** _( +${champNow.stats[stat.key] - oldStats[stat.key]} )_\n`
      ).join("\n");

      const champKeyNow = getChampionKeyByName(champNow.name);
      const champImgNow = champKeyNow
        ? `https://ddragon.leagueoflegends.com/cdn/15.11.1/img/champion/${champKeyNow}.png`
        : null;

      let title = greatSuccess
        ? `🎊 강화 대성공!! ${champNow.name} +${greatGainNum}강!!`
        : `🎉 ${champNow.name} ${champNow.level}강 성공!`;
      let desc = greatSuccess
        ? `**[강화 대성공]**\n무려 **+${greatGainNum}강**이 한 번에 강화되었습니다!\n\n${diffStatDesc}`
        : `**[강화 결과]**\n${diffStatDesc}`;

      const resultEmbed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(desc)
        .setColor(mainNow === "attack" ? 0xff9800 : 0x673ab7);

      if (champImgNow) resultEmbed.setThumbnail(champImgNow);

      const nextRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("continue-upgrade")
          .setLabel("계속 강화 가보자고~~!")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("stop-upgrade")
          .setLabel("일단 중단한다.")
          .setStyle(ButtonStyle.Secondary)
      );

      resultContent = {
        embeds: [resultEmbed],
        components: [nextRow],
        ephemeral: true
      };
    } else {
      const survive = Math.random() < surviveRateNow;
      if (survive) {
        const failEmbed = new EmbedBuilder()
          .setTitle(`💦 강화 실패! 챔피언이 살아남았다!`)
          .setDescription(`😮 ${userMention} 님이 **${champNow.name} ${champNow.level + 1}강**에 실패했지만, \n불굴의 의지로 챔피언이 견뎌냅니다!\n🛡️ 현재 소실 방지 확률: **${Math.floor(surviveRateNow * 1000) / 10}%**\n`)
          .setColor(0x2196f3);
        const champKeyFail = getChampionKeyByName(champNow.name);
        if (champKeyFail) failEmbed.setThumbnail(`https://ddragon.leagueoflegends.com/cdn/15.11.1/img/champion/${champKeyFail}.png`);
        resultContent = {
          embeds: [failEmbed],
          components: [],
          ephemeral: true
        };
      } else {
        const guild = interaction.guild;
        const member = await guild.members.fetch(userId).catch(() => null);

        if (member && member.roles.cache.has(SOUL_ROLE_ID)) {
          await member.roles.remove(SOUL_ROLE_ID).catch(() => null);
          const reviveEmbed = new EmbedBuilder()
            .setTitle(`💎 불굴의 영혼 효과 발동!`)
            .setDescription(`죽을 운명이었던 챔피언이 아이템: **불굴의 영혼** 효과로 살아납니다!\n해당 아이템이 대신 사라졌습니다.`)
            .setColor(0xffe082);
          if (getChampionKeyByName(champNow.name)) reviveEmbed.setThumbnail(`https://ddragon.leagueoflegends.com/cdn/15.11.1/img/champion/${getChampionKeyByName(champNow.name)}.png`);
          resultContent = {
            embeds: [reviveEmbed],
            components: [],
            ephemeral: true
          };
        } else {
          await updateEnhanceHistory(userId, { max: champNow.level });
          const recordPath = path.join(__dirname, "../data/champion-records.json");
          let records = {};
          try {
            if (fs.existsSync(recordPath)) records = JSON.parse(fs.readFileSync(recordPath, "utf8"));
          } catch {}
          delete records[userId];
          try { fs.writeFileSync(recordPath, JSON.stringify(records, null, 2)); } catch {}

          const lostName = champNow.name;
          delete dataNow[userId];
          await saveJSON(dataPath, dataNow);
          const failEmbed = new EmbedBuilder()
            .setTitle(`💥 챔피언 소멸...`)
            .setDescription(`${userMention} 님이 **${lostName} ${champNow.level + 1}강**에 실패하여 챔피언의 혼이 소멸되었습니다...`)
            .setColor(0xf44336);
          if (getChampionKeyByName(lostName)) failEmbed.setThumbnail(`https://ddragon.leagueoflegends.com/cdn/15.11.1/img/champion/${getChampionKeyByName(lostName)}.png`);
          resultContent = {
            embeds: [failEmbed],
            components: [],
            ephemeral: true
          };
        }
      }
    }
  } catch (err) {
    errorMessage = "❌ 강화 처리 중 오류 발생! 잠시 후 다시 시도해주세요.";
  } finally {
    if (release2) try { await release2(); } catch {}
    if (errorMessage) return interaction.editReply({ content: errorMessage });
    if (resultContent) {
      await interaction.editReply(resultContent);
      if (resultContent.components && resultContent.components.length > 0) {
        await setupNextUpgradeCollector(interaction, userId, userMention);
      }
      return;
    }
  }
}

async function setupNextUpgradeCollector(interaction, userId, userMention) {
  const filter = i =>
    i.user.id === userId &&
    ["continue-upgrade", "stop-upgrade"].includes(i.customId);

  const collector = interaction.channel.createMessageComponentCollector({
    filter,
    time: 60000,
    max: 1
  });

  let ended = false;

  collector.on("collect", async i => {
    if (ended) return;
    ended = true;
    try { await i.deferUpdate(); } catch (err) {}
    if (i.customId === "stop-upgrade") {
      try {
        await i.editReply({
          content: "🛑 강화 세션이 종료되었습니다.",
          components: [],
          ephemeral: true
        });
      } catch (err) {}
      return;
    }
    await startUpgrade(i, userId, userMention);
  });

  collector.on("end", async (collected, reason) => {
    if (collected.size === 0) {
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.editReply({
            content: "⏳ 연속 강화 대기 시간이 초과되었습니다. 다시 시도해주세요.",
            embeds: [],
            components: [],
            ephemeral: true
          });
        }
      } catch (err) {}
    }
  });
}
