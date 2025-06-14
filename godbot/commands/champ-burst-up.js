// commands/champ-burst-up.js
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const lockfile = require("proper-lockfile");
const championList = require("../utils/champion-data");
const { getChampionKeyByName } = require("../utils/champion-utils");

const dataPath = path.join(__dirname, "../data/champion-users.json");
const battleActivePath = path.join(__dirname, "../data/battle-active.json");
const enhanceHistoryPath = path.join(__dirname, "../data/champion-enhance-history.json");
const GREAT_SOUL_ROLE_ID = "1382665471605870592";

async function loadJSON(p) {
  if (!fs.existsSync(p)) fs.writeFileSync(p, "{}");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
async function saveJSON(p, d) {
  fs.writeFileSync(p, JSON.stringify(d, null, 2));
}

// 히스토리 기록 함수 - 카운트만큼 누적(성공, 실패)
async function updateEnhanceHistory(userId, { success = 0, fail = 0, max = null } = {}) {
  let release;
  try {
    release = await lockfile.lock(enhanceHistoryPath, { retries: { retries: 10, minTimeout: 30, maxTimeout: 100 } });
    let hist = await loadJSON(enhanceHistoryPath);
    if (!hist[userId]) hist[userId] = { total: 0, success: 0, fail: 0, max: 0 };
    hist[userId].total += (success + fail);
    if (success) hist[userId].success += success;
    if (fail) hist[userId].fail += fail;
    if (max !== null && max > hist[userId].max) hist[userId].max = max;
    await saveJSON(enhanceHistoryPath, hist);
  } catch (e) {} finally { if (release) try { await release(); } catch {} }
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
    .setName("챔피언한방강화")
    .setDescription("한 번에 여러 번(5, 10, 20강) 강화에 도전한다!"),
  async execute(interaction) {
    let release;
    let errorMessage = null;
    let immediateReply = null;
    try {
      await interaction.deferReply({ ephemeral: true });
      release = await lockfile.lock(dataPath, { retries: { retries: 10, minTimeout: 30, maxTimeout: 100 } });
      const userId = interaction.user.id;
      const userMention = `<@${userId}>`;
      const data = await loadJSON(dataPath);
      const battleActive = await loadJSON(battleActivePath);

      const inBattle = Object.values(battleActive).some(b =>
        b.challenger === userId || b.opponent === userId
      );
      if (inBattle) {
        immediateReply = { content: "⚔️ 전투 중에는 강화할 수 없습니다!" };
        return;
      }
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
      return startBurstUpgrade(interaction, interaction.user.id, `<@${interaction.user.id}>`);
    }
  }
};

async function startBurstUpgrade(interaction, userId, userMention) {
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

    const selectRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('burst-enhance-count')
        .setPlaceholder('한 번에 몇 회 강화할까요?')
        .addOptions(
          { label: '5회 강화', value: '5', description: '한 번에 5회 연속 강화' },
          { label: '10회 강화', value: '10', description: '한 번에 10회 연속 강화' },
          { label: '20회 강화', value: '20', description: '한 번에 20회 연속 강화 (위험!)' }
        )
    );
    const embed = new EmbedBuilder()
      .setTitle(`💥 한방 강화 - 강화 횟수 선택`)
      .setDescription(`**${champ.name} ${champ.level}강**
한 번에 여러 번 강화를 시도할 수 있습니다!

- 강화 성공 확률: **연속 성공확률 = (개별확률)^N**
- 한 번이라도 실패하면 강화 실패! (챔피언 소멸 위험 O)
- **실패 시 소멸 방지 확률은 고정 10% (즉, 90%로 챔피언 소멸!)**
- 불굴의 영혼 전설등급이 있다면 해당 아이템이 대신 소멸!

어떤 도전을 하시겠습니까?`)
      .setColor(0xef5350);
    if (champImg) embed.setThumbnail(champImg);

    displayContent = {
      embeds: [embed],
      components: [selectRow],
      ephemeral: true
    };
  } catch (err) {
    errorMessage = "❌ 강화 준비 중 오류 발생! 잠시 후 다시 시도해주세요.";
  } finally {
    if (release) try { await release(); } catch {}
    if (errorMessage) return interaction.editReply({ content: errorMessage });
    if (displayContent) {
      await interaction.editReply(displayContent);
      await setupBurstCountCollector(interaction, userId, userMention);
      return;
    }
  }
}

async function setupBurstCountCollector(interaction, userId, userMention) {
  const filter = i => i.user.id === userId && i.customId === "burst-enhance-count";
  const collector = interaction.channel.createMessageComponentCollector({
    filter, time: 30000, max: 1
  });
  collector.on("collect", async i => {
    await i.deferUpdate();
    const count = parseInt(i.values[0], 10);

    let data = await loadJSON(dataPath);
    let champ = data[userId];
    const rate = getSuccessRate(champ.level);
    const burstProb = Math.pow(rate, count);
    const champKey = getChampionKeyByName(champ.name);
    const champImg = champKey
      ? `https://ddragon.leagueoflegends.com/cdn/15.11.1/img/champion/${champKey}.png`
      : null;
    const percent = Math.floor(burstProb * 10000) / 100;

    // ====== [추가] 강화 능력치 미리보기 ======
    // 현재 능력치
    const curStats = { ...champ.stats };
    let previewStats = { ...curStats };
    let previewLevel = champ.level;
    for (let c = 0; c < count; c++) {
      const { gain } = calcStatGain(previewLevel, previewStats.attack, previewStats.ap);
      previewStats.attack += gain.attack;
      previewStats.ap += gain.ap;
      previewStats.hp += gain.hp;
      previewStats.defense += gain.defense;
      previewStats.penetration += gain.penetration;
      previewLevel++;
    }
    const statFields = [
      { label: "⚔️ 공격력", key: "attack" },
      { label: "🔮 주문력", key: "ap" },
      { label: "❤️ 체력", key: "hp" },
      { label: "🛡️ 방어력", key: "defense" },
      { label: "💥 관통력", key: "penetration" }
    ];
    let statPreview = statFields
      .map(
        (stat) =>
          `${stat.label}   [${curStats[stat.key]} → **${previewStats[stat.key]}**]`
      )
      .join("\n");

    const infoEmbed = new EmbedBuilder()
      .setTitle("🔥 강화 도전 확률 안내")
      .setDescription(
        `**${champ.name} ${champ.level}강 → ${champ.level + count}강(도전 시)**\n\n` +
        `- 한 번에 ${count}회 연속 강화!\n` +
        `- 연속 성공확률: **${percent}%**\n` +
        `- 실패 시 챔피언 소멸 확률: **90%** (소멸 방지 10%)\n\n` +
        `**[능력치 미리보기]**\n${statPreview}\n\n정말 강화에 도전하시겠습니까?`
      )
      .setColor(0xf5a623);
    if (champImg) infoEmbed.setThumbnail(champImg);

    const buttonRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`burst-confirm-${count}`)
        .setLabel("강화 도전한다!")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("burst-cancel")
        .setLabel("취소")
        .setStyle(ButtonStyle.Secondary)
    );
    await i.editReply({
      embeds: [infoEmbed],
      components: [buttonRow],
      ephemeral: true
    });
    await setupBurstConfirmCollector(i, userId, userMention, count);
  });
  collector.on("end", async (collected, reason) => {
    if (collected.size === 0) {
      try {
        await interaction.editReply({
          content: "⏳ 강화 선택 시간이 초과되었습니다. 다시 시도해주세요.",
          embeds: [],
          components: [],
          ephemeral: true
        });
      } catch (err) {}
    }
  });
}

async function setupBurstConfirmCollector(interaction, userId, userMention, burstCount) {
  const filter = i =>
    i.user.id === userId &&
    (i.customId === `burst-confirm-${burstCount}` || i.customId === "burst-cancel");
  const collector = interaction.channel.createMessageComponentCollector({
    filter, time: 30000, max: 1
  });
  collector.on("collect", async i => {
    await i.deferUpdate();
    if (i.customId === "burst-cancel") {
      await i.editReply({
        content: "🛑 강화가 취소되었습니다.",
        embeds: [],
        components: [],
        ephemeral: true
      });
      return;
    }
    await handleBurstUpgradeProcess(i, userId, userMention, burstCount);
  });
  collector.on("end", async (collected, reason) => {
    if (collected.size === 0) {
      try {
        await interaction.editReply({
          content: "⏳ 강화 대기 시간이 초과되었습니다. 다시 시도해주세요.",
          embeds: [],
          components: [],
          ephemeral: true
        });
      } catch (err) {}
    }
  });
}

async function handleBurstUpgradeProcess(interaction, userId, userMention, burstCount) {
  let release2;
  let errorMessage = null;
  let resultContent = null;
  try {
    release2 = await lockfile.lock(dataPath, { retries: { retries: 10, minTimeout: 30, maxTimeout: 100 } });
    let dataNow = await loadJSON(dataPath);
    let champNow = dataNow[userId];

    const startLevel = champNow.level;
    const base = championList.find(c => c.name === champNow.name)?.stats;
    champNow.stats = champNow.stats || { ...base };

    let currentLevel = champNow.level;
    let successCount = 0;
    let failHappened = false;
    let failAt = 0;

    for (let i = 0; i < burstCount; i++) {
      const curSuccess = Math.random() < getSuccessRate(currentLevel);
      if (!curSuccess) {
        failHappened = true;
        failAt = i;
        break;
      }
      // 강화 성공 - 스탯 증가
      const { gain } = calcStatGain(currentLevel, champNow.stats.attack, champNow.stats.ap);
      champNow.stats.attack += gain.attack;
      champNow.stats.ap += gain.ap;
      champNow.stats.hp += gain.hp;
      champNow.stats.defense += gain.defense;
      champNow.stats.penetration += gain.penetration;
      currentLevel++;
      successCount++;
    }

    if (!failHappened) {
      // 완전 연속 성공
      champNow.level += burstCount;
      champNow.success += burstCount;
      await saveJSON(dataPath, dataNow);
      await updateEnhanceHistory(userId, { success: burstCount, fail: 0, max: champNow.level });

      const statList = [
        { label: "공격력", key: "attack", emoji: "⚔️" },
        { label: "주문력", key: "ap", emoji: "🔮" },
        { label: "체력", key: "hp", emoji: "❤️" },
        { label: "방어력", key: "defense", emoji: "🛡️" },
        { label: "관통력", key: "penetration", emoji: "💥" },
      ];
      let statDesc = statList.map(stat =>
        `${stat.emoji} **${stat.label}**\n${champNow.stats[stat.key]}`
      ).join("\n");

      const resultEmbed = new EmbedBuilder()
        .setTitle(`🎉 한방 강화 성공!`)
        .setDescription(`**${champNow.name} ${startLevel}강 → ${champNow.level}강**
연속 ${burstCount}회 강화 성공!
연속 성공확률: **${Math.round(Math.pow(getSuccessRate(startLevel), burstCount) * 10000) / 100}%**

${statDesc}
`)
        .setColor(0xff9800);

      const champKeyNow = getChampionKeyByName(champNow.name);
      if (champKeyNow)
        resultEmbed.setThumbnail(`https://ddragon.leagueoflegends.com/cdn/15.11.1/img/champion/${champKeyNow}.png`);

      resultContent = {
        embeds: [resultEmbed],
        components: [],
        ephemeral: true
      };
    }
    else {
      // 중간 실패, 소실 판정
      // [1] 성공분만큼 레벨/성공횟수 증가
      champNow.level += successCount;
      champNow.success += successCount;

      // [2] 실패 카운트(실패는 1회만!)
      await updateEnhanceHistory(userId, { success: successCount, fail: 1, max: champNow.level });

      // [3] 소실방어(10%) 체크
      const surviveRate = 0.1;
      const survive = Math.random() < surviveRate;

      if (survive) {
        await saveJSON(dataPath, dataNow);
        const failEmbed = new EmbedBuilder()
          .setTitle(`💦 강화 실패! 챔피언이 살아남았다!`)
          .setDescription(`${userMention}님, ${champNow.name} ${startLevel + successCount + 1}강에서 실패!
**${successCount}회 연속 강화 성공 후 실패!**
10% 확률로 챔피언이 살아남았습니다!

> ${successCount > 0 ? `**${champNow.name} ${startLevel}강 → ${champNow.level}강**까지는 성공 처리됨!` : "아쉽게도 성공 없이 바로 실패..."}
`)
          .setColor(0x2196f3);
        const champKeyFail = getChampionKeyByName(champNow.name);
        if (champKeyFail)
          failEmbed.setThumbnail(`https://ddragon.leagueoflegends.com/cdn/15.11.1/img/champion/${champKeyFail}.png`);
        resultContent = { embeds: [failEmbed], components: [], ephemeral: true };
      } else {
        // 불굴의 영혼 전설등급 보호
        const guild = interaction.guild;
        const member = await guild.members.fetch(userId).catch(() => null);

        if (member && member.roles.cache.has(GREAT_SOUL_ROLE_ID)) {
          await member.roles.remove(GREAT_SOUL_ROLE_ID).catch(() => null);
          await saveJSON(dataPath, dataNow);
          const reviveEmbed = new EmbedBuilder()
            .setTitle(`💎 불굴의 영혼 전설등급 효과 발동!`)
            .setDescription(`${champNow.name} ${startLevel + successCount + 1}강에서 실패했으나,
아이템: **불굴의 영혼 전설등급** 효과로 살아났습니다! (아이템 소모됨)
> ${successCount > 0 ? `**${champNow.name} ${startLevel}강 → ${champNow.level}강**까지는 성공 처리됨!` : "아쉽게도 성공 없이 바로 실패..."}
`)
            .setColor(0xffe082);
          const champKey = getChampionKeyByName(champNow.name);
          if (champKey)
            reviveEmbed.setThumbnail(`https://ddragon.leagueoflegends.com/cdn/15.11.1/img/champion/${champKey}.png`);
          resultContent = { embeds: [reviveEmbed], components: [], ephemeral: true };
        } else {
          // 챔피언 소멸!
          await updateEnhanceHistory(userId, { max: champNow.level });

          // ✅ 전적 기록까지 같이 삭제
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
            .setDescription(`${userMention}님, **${lostName}**가 ${startLevel + successCount + 1}강에서 소멸되었습니다...
> ${successCount > 0 ? `**${lostName} ${startLevel}강 → ${startLevel + successCount}강**까지는 성공 처리됨!` : "아쉽게도 성공 없이 바로 실패..."}

90% 확률로 소멸 (불굴의 영혼 전설등급이 없었습니다)`)
            .setColor(0xf44336);
          const champKey = getChampionKeyByName(lostName);
          if (champKey)
            failEmbed.setThumbnail(`https://ddragon.leagueoflegends.com/cdn/15.11.1/img/champion/${champKey}.png`);
          resultContent = { embeds: [failEmbed], components: [], ephemeral: true };
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
      return;
    }
  }
}
