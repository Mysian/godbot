// commands/champion/champ-upgrade.js
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const lockfile = require("proper-lockfile");
const championList = require("../utils/champion-data");
const { getChampionKeyByName } = require("../utils/champion-utils");

const dataPath = path.join(__dirname, "../data/champion-users.json");
const battleActivePath = path.join(__dirname, "../data/battle-active.json");

const SOUL_ROLE_ID = "1382169247538745404";

async function loadJSON(p) {
  if (!fs.existsSync(p)) fs.writeFileSync(p, "{}");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
async function saveJSON(p, d) {
  fs.writeFileSync(p, JSON.stringify(d, null, 2));
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
  let gain = {
    attack: 0,
    ap: 0,
    hp: hpGain,
    defense: defGain,
    penetration: penGain
  };
  gain[mainStat] = mainGain;
  gain[subStat] = subGain;
  return { gain, mainStat, subStat };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("챔피언강화")
    .setDescription("보유한 챔피언을 강화합니다 (최대 999강)"),

  async execute(interaction) {
    const userId = interaction.user.id;
    const userMention = `<@${userId}>`;

    let release;
    try {
      release = await lockfile.lock(dataPath, { retries: { retries: 10, minTimeout: 30, maxTimeout: 100 } });
      const data = await loadJSON(dataPath);
      const battleActive = await loadJSON(battleActivePath);

      const inBattle = Object.values(battleActive).some(b =>
        b.challenger === userId || b.opponent === userId
      );
      if (inBattle) {
        await release();
        return interaction.reply({
          content: "⚔️ 전투 중에는 강화할 수 없습니다!",
          ephemeral: true
        });
      }
      if (!data[userId] || !data[userId].name) {
        await release();
        return interaction.reply({
          content: `❌ 먼저 /챔피언획득 으로 챔피언을 얻어야 합니다.`,
          ephemeral: true
        });
      }
      if (data[userId].level >= 999) {
        await release();
        return interaction.reply({
          content: `⚠️ 이미 최대 강화 상태입니다! (**${data[userId].level}강**)`,
          ephemeral: true
        });
      }

      await release();
      await interaction.reply({ content: "⏳ 강화 준비 중...", ephemeral: true });
      return startUpgrade(interaction, userId, userMention);
    } catch (err) {
      if (release) await release();
      return interaction.reply({ content: "❌ 오류 발생! 잠시 후 다시 시도해주세요.", ephemeral: true });
    }
  }
};

// ---- 메인 로직 분리: 항상 최신 데이터로 표기 ----
async function startUpgrade(interaction, userId, userMention) {
  let release;
  try {
    release = await lockfile.lock(dataPath, { retries: { retries: 10, minTimeout: 30, maxTimeout: 100 } });
    const data = await loadJSON(dataPath);
    const champ = data[userId];

    // 강화 준비 (최신 값 반영)
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

    // 표기용 스탯
    const prevStats = { ...champ.stats };
    const upStats = {
      ...champ.stats,
      attack: champ.stats.attack + gain.attack,
      ap: champ.stats.ap + gain.ap,
      hp: champ.stats.hp + gain.hp,
      defense: champ.stats.defense + gain.defense,
      penetration: champ.stats.penetration + gain.penetration,
    };

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
      .setDescription(`**${champ.name} ${champ.level}강** → **${champ.level + 1}강**
📈 강화 확률: **${percent}%**
🛡️ 실패 시 소멸 방지 확률(레벨에 따라 증가, 최대 80%): **${survivePercent}%**
**스탯 변화 (성공 시):**

${statDesc}

> **${mainStat === "attack" ? "공격력" : "주문력"}** 중심 챔피언이기 때문에 딜링 기반 스탯의 증가량이 더 큽니다!
`)
      .setColor(mainStat === "attack" ? 0xff9800 : 0x673ab7);

    if (champImg) embed.setThumbnail(champImg);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("champion-upgrade-confirm")
        .setLabel("🔥 강화 시도")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("champion-upgrade-cancel")
        .setLabel("🛑 강화 중단")
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.editReply({
      embeds: [embed],
      components: [row],
      ephemeral: true
    });

    await release();

    const collector = interaction.channel.createMessageComponentCollector({
      filter: i =>
        i.user.id === userId &&
        ["champion-upgrade-confirm", "champion-upgrade-cancel"].includes(i.customId),
      time: 15000,
      max: 1
    });

    collector.on("collect", async i => {
      if (i.customId === "champion-upgrade-cancel") {
        await i.update({
          content: "⚪ 강화가 취소되었습니다.",
          embeds: [],
          components: [],
          ephemeral: true
        });
        return;
      }

      await i.update({
        content: `⏳ 강화 시도 중...`,
        embeds: [],
        components: [],
        ephemeral: true
      });

      setTimeout(async () => {
        // ==== 실제 강화 처리 ====
        let release2;
        try {
          release2 = await lockfile.lock(dataPath, { retries: { retries: 10, minTimeout: 30, maxTimeout: 100 } });
          let dataNow = await loadJSON(dataPath);
          let champNow = dataNow[userId];

          const rateNow = getSuccessRate(champNow.level);
          const surviveRateNow = getSurviveRate(champNow.level);
          const { gain: gainNow, mainStat: mainNow } = calcStatGain(champNow.level, champNow.stats.attack, champNow.stats.ap);

          const success = Math.random() < rateNow;

          if (success) {
            champNow.level += 1;
            champNow.success += 1;

            const oldStats = { ...champNow.stats };

            champNow.stats.attack += gainNow.attack;
            champNow.stats.ap += gainNow.ap;
            champNow.stats.hp += gainNow.hp;
            champNow.stats.defense += gainNow.defense;
            champNow.stats.penetration += gainNow.penetration;

            await saveJSON(dataPath, dataNow);

            let diffStatDesc = [
              { label: "공격력", key: "attack", emoji: "⚔️" },
              { label: "주문력", key: "ap", emoji: "🔮" },
              { label: "체력", key: "hp", emoji: "❤️" },
              { label: "방어력", key: "defense", emoji: "🛡️" },
              { label: "관통력", key: "penetration", emoji: "💥" },
            ].map(stat =>
              `${stat.emoji} **${stat.label}**\n${oldStats[stat.key]} → **${champNow.stats[stat.key]}** _( +${champNow.stats[stat.key] - oldStats[stat.key]} )_\n`
            ).join("\n");

            const resultEmbed = new EmbedBuilder()
              .setTitle(`🎉 ${champNow.name} ${champNow.level}강 성공!`)
              .setDescription(`**[강화 결과]**
${diffStatDesc}
`)
              .setColor(mainNow === "attack" ? 0xff9800 : 0x673ab7);

            const champKeyNow = getChampionKeyByName(champNow.name);
            const champImgNow = champKeyNow
              ? `https://ddragon.leagueoflegends.com/cdn/15.11.1/img/champion/${champKeyNow}.png`
              : null;
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

            await interaction.editReply({
              embeds: [resultEmbed],
              components: [nextRow],
              ephemeral: true
            });

            const nextCollector = interaction.channel.createMessageComponentCollector({
              filter: i => i.user.id === userId && ["continue-upgrade", "stop-upgrade"].includes(i.customId),
              time: 15000,
              max: 1
            });

            nextCollector.on("collect", async i => {
              if (i.customId === "stop-upgrade") {
                await i.update({
                  content: "🛑 강화 세션이 종료되었습니다.",
                  components: [],
                  ephemeral: true
                });
              } else {
                await i.deferUpdate();
                // **여기서 최신 상태로 다시 startUpgrade 호출**
                await startUpgrade(interaction, userId, userMention);
              }
            });

          } else {
            // 실패 처리 ↓
            const survive = Math.random() < surviveRateNow;
            if (survive) {
              const failEmbed = new EmbedBuilder()
                .setTitle(`💦 강화 실패! 챔피언이 살아남았다!`)
                .setDescription(`😮 ${userMention} 님이 **${champNow.name} ${champNow.level}강**에 실패했지만, 
불굴의 의지로 챔피언이 견뎌냅니다!
🛡️ 현재 소실 방지 확률: **${Math.floor(surviveRateNow * 1000) / 10}%**
`)
                .setColor(0x2196f3);
              const champKeyFail = getChampionKeyByName(champNow.name);
              if (champKeyFail) failEmbed.setThumbnail(`https://ddragon.leagueoflegends.com/cdn/15.11.1/img/champion/${champKeyFail}.png`);
              await interaction.followUp({
                embeds: [failEmbed],
                ephemeral: true
              });
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
                await interaction.followUp({
                  embeds: [reviveEmbed],
                  ephemeral: true
                });
              } else {
                const lostName = champNow.name;
                delete dataNow[userId];
                await saveJSON(dataPath, dataNow);
                const failEmbed = new EmbedBuilder()
                  .setTitle(`💥 챔피언 소멸...`)
                  .setDescription(`${userMention} 님이 **${lostName} ${champNow.level}강**에 실패하여 챔피언의 혼이 소멸되었습니다...`)
                  .setColor(0xf44336);
                if (getChampionKeyByName(lostName)) failEmbed.setThumbnail(`https://ddragon.leagueoflegends.com/cdn/15.11.1/img/champion/${getChampionKeyByName(lostName)}.png`);
                await interaction.followUp({
                  embeds: [failEmbed],
                  ephemeral: true
                });
              }
            }
          }
        } catch (err2) {
          if (release2) await release2();
        } finally {
          if (release2) await release2();
        }
      }, 2000);
    });
  } catch (err) {
    if (release) await release();
    await interaction.followUp({ content: "❌ 강화 오류! 잠시 후 다시 시도해주세요.", ephemeral: true });
  } finally {
    if (release) await release();
  }
}
