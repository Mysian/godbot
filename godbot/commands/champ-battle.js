const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const { calculateDamage } = require("../utils/battleEngine");
const { getChampionIcon, getChampionSplash } = require("../utils/champion-utils");
const championSkills = require("../utils/skills");

const userDataPath = path.join(__dirname, "../data/champion-users.json");
const recordPath = path.join(__dirname, "../data/champion-records.json");
const battlePath = path.join(__dirname, "../data/battle-active.json");

const { client } = require("../index");

function load(filePath) {
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, "{}");
  return JSON.parse(fs.readFileSync(filePath));
}

function save(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function getRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function createHpBar(current, max) {
  const totalBars = 10;
  const filled = Math.max(0, Math.round((current / max) * totalBars));
  return "🟥".repeat(filled) + "⬜".repeat(totalBars - filled);
}

const getStatusIcons = (effects) => {
  if (!effects) return "";
  let icons = "";
  if (effects.stunned) icons += "💫";
  if (effects.dot) icons += "☠️";
  return icons;
};

function createBattleEmbed(challenger, opponent, battle, userData, turnId, logMessage = "") {
  const ch = userData[challenger.id];
  const op = userData[opponent.id];
  const chp = battle.hp[challenger.id];
  const ohp = battle.hp[opponent.id];

  return new EmbedBuilder()
    .setTitle("⚔️ 챔피언 배틀")
    .setDescription(`**${challenger.username}** vs **${opponent.username}**`)
    .addFields(
      {
        name: `👑 ${challenger.username}`,
        value: `💬 ${ch.name} ${getStatusIcons(battle.statusEffects?.[challenger.id])} | 💖 ${chp} / ${ch.stats.hp}
${createHpBar(chp, ch.stats.hp)}`,
        inline: true
      },
      {
        name: `🛡️ ${opponent.username}`,
        value: `💬 ${op.name} ${getStatusIcons(battle.statusEffects?.[opponent.id])} | 💖 ${ohp} / ${op.stats.hp}
${createHpBar(ohp, op.stats.hp)}`,
        inline: true
      },
      {
        name: `🎯 현재 턴`,
        value: `<@${turnId}>`,
        inline: false
      },
      {
        name: `📢 행동 결과`,
        value: logMessage || "없음",
        inline: false
      }
    )
    .setThumbnail(getChampionIcon(ch.name))
    .setColor(0x3498db);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("챔피언배틀")
    .setDescription("지정한 유저와 챔피언 배틀을 요청합니다.")
    .addUserOption(opt =>
      opt.setName("상대").setDescription("대결할 상대를 선택하세요").setRequired(true)
    ),

  async execute(interaction) {
    const challenger = interaction.user;
    const opponent = interaction.options.getUser("상대");

    if (challenger.id === opponent.id) {
      return interaction.reply({ content: "❌ 자신과는 배틀할 수 없습니다.", ephemeral: true });
    }

    const userData = load(userDataPath);
    const battleData = load(battlePath);

    if (!userData[challenger.id] || !userData[opponent.id]) {
      return interaction.reply({ content: "❌ 두 유저 모두 챔피언을 보유해야 합니다.", ephemeral: true });
    }

    if (Object.values(battleData).some(b =>
      [b.challenger, b.opponent].includes(challenger.id) ||
      [b.challenger, b.opponent].includes(opponent.id))) {
      return interaction.reply({ content: "⚔️ 둘 중 한 명이 이미 전투 중입니다!", ephemeral: true });
    }

    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("accept_battle").setLabel("✅ 수락").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("decline_battle").setLabel("❌ 거절").setStyle(ButtonStyle.Danger)
    );

    const requestMessage = await interaction.reply({
      content: `📝 <@${opponent.id}>님, <@${challenger.id}>의 챔피언 배틀 요청이 도착했습니다. 수락하시겠습니까?`,
      components: [confirmRow],
      fetchReply: true
    });

    const collector = requestMessage.createMessageComponentCollector({ time: 30000 });

collector.on("collect", async i => {
  // 👉 수락/거절 버튼이 아닌 경우는 무시 (전투용 버튼은 별도로 처리됨)
  if (i.customId !== "accept_battle" && i.customId !== "decline_battle") return;

  // 👉 요청받은 유저(opponent)만 누를 수 있도록 제한
  if (i.user.id !== opponent.id) {
    return i.reply({ content: "⛔ 이 버튼은 요청받은 유저만 사용할 수 있습니다.", ephemeral: true });
  }

  await i.deferUpdate();

  if (i.customId === "decline_battle") {
    await i.editReply({
      content: `❌ <@${opponent.id}>님이 배틀 요청을 거절했습니다.`,
      components: []
    });
    collector.stop();
    return;
  }

  // 👉 배틀 수락한 경우
  const battleId = `${challenger.id}_${opponent.id}`;
  const chChamp = userData[challenger.id];
  const opChamp = userData[opponent.id];

  const battle = {
    challenger: challenger.id,
    opponent: opponent.id,
    hp: {
      [challenger.id]: chChamp.stats.hp,
      [opponent.id]: opChamp.stats.hp
    },
    turn: challenger.id,
    logs: [],
    statusEffects: {
      [challenger.id]: {},
      [opponent.id]: {}
    }
  };

  battleData[battleId] = battle;
  save(battlePath, battleData);

  const embed = createBattleEmbed(challenger, opponent, battle, userData, challenger.id);
  const battleButtons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("attack").setLabel("🗡️ 평타").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("defend").setLabel("🛡️ 무빙").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("skill").setLabel("✨ 스킬").setStyle(ButtonStyle.Primary)
  );

  await i.editReply({
    content: `⚔️ 전투 시작! <@${challenger.id}> vs <@${opponent.id}>`,
    embeds: [embed],
    components: [battleButtons]
  });

await new Promise(resolve => setTimeout(resolve, 300));
  
  const battleMsg = await i.fetchReply();
  let turnCollector;

const startTurnCollector = () => {
  if (turnCollector) {
    try {
      turnCollector.stop();
    } catch (err) {
      console.warn("🛠 이전 Collector 정리 중 에러:", err);
    }
  }

  turnCollector = battleMsg.createMessageComponentCollector({ time: 30000 });

turnCollector.on("collect", async i => {
  try {
    if (!i.deferred && !i.replied) {
      await i.deferUpdate();
    }

    const currentBattle = load(battlePath)[battleId];
    if (!currentBattle) {
      await i.followUp({ content: "⚠️ 전투 정보가 없습니다. (이미 종료된 전투)", ephemeral: true });
      return;
    }

    // 👇 아래부터 계속 이어서 작성...


      }

      const actorId = i.user.id;
      const targetId = actorId === currentBattle.challenger ? currentBattle.opponent : currentBattle.challenger;
      const attacker = userData[actorId];
      const defender = userData[targetId];

            const actorStatus = currentBattle.statusEffects[actorId] || {};
            const targetStatus = currentBattle.statusEffects[targetId] || {};

            if (actorStatus.stunned) {
              delete currentBattle.statusEffects[actorId].stunned;
              currentBattle.logs.push(`💫 ${attacker.name}는 기절 상태로 행동할 수 없습니다!`);
              currentBattle.turn = targetId;
              save(battlePath, battleData);

              const updatedEmbed = createBattleEmbed(challenger, opponent, currentBattle, userData, targetId, `💤 ${attacker.name}는 기절했다!`);
              await battleMsg.edit({
                content: `💤 기절! 이제 <@${targetId}> 의 차례입니다.`,
                embeds: [updatedEmbed],
                components: [battleButtons]
              });
              return startTurnCollector();
            }

            if (actorStatus.dot) {
              const { turns, damage } = actorStatus.dot;
              currentBattle.hp[actorId] -= damage;
              currentBattle.logs.push(`☠️ ${attacker.name}는 중독되어 ${damage}의 피해를 입었습니다!`);
              actorStatus.dot.turns -= 1;
              if (actorStatus.dot.turns <= 0) delete actorStatus.dot;
            }

            let result;
            let logMsg;

            if (i.customId === "skill") {
              const skill = championSkills[attacker.name];
              if (skill) {
                const baseDamage = calculateDamage(attacker.stats, defender.stats, true).damage;
                const finalDamage = skill.apply(attacker, defender, true, baseDamage, {});
                currentBattle.hp[targetId] -= finalDamage;

                if (defender.stunned) currentBattle.statusEffects[targetId].stunned = true;
                if (defender.dot) currentBattle.statusEffects[targetId].dot = defender.dot;

                logMsg = `✨ **${attacker.name}의 스킬 발동! [${skill.name}]**\n🌀 ${skill.description}\n💥 피해량: ${finalDamage}`;
              } else {
                logMsg = `⚠️ ${attacker.name}는 스킬이 없습니다!`;
              }
            } else {
              const isAttack = i.customId === "attack";
              result = calculateDamage(attacker.stats, defender.stats, isAttack);
              currentBattle.hp[targetId] -= result.damage;

              const phrases = {
                attack: [
                  `🗡️ ${attacker.name}의 강력한 공격!`,
                  `💢 ${attacker.name}의 평타가 적중했다!`,
                  `🔪 ${attacker.name}의 무자비한 일격!`
                ],
                critical: [
                  `💥 ${attacker.name}의 크리티컬 히트!`,
                  `🔥 ${attacker.name}의 결정타!`
                ],
                defend: [
                  `🛡️ ${attacker.name}는 방어 자세를 취했다.`,
                  `⚔️ ${attacker.name}가 적의 공격을 예측했다!`
                ]
              };

              if (i.customId === "defend") {
                logMsg = getRandom(phrases.defend);
              } else {
                logMsg = result.critical
                  ? getRandom(phrases.critical) + `\n${result.log}`
                  : getRandom(phrases.attack) + `\n${result.log}`;
              }
            }

            currentBattle.logs.push(logMsg);

            if (currentBattle.hp[targetId] <= 0) {
              const records = load(recordPath);
              records[actorId] = records[actorId] || { name: attacker.name, win: 0, draw: 0, lose: 0 };
              records[targetId] = records[targetId] || { name: defender.name, win: 0, draw: 0, lose: 0 };
              records[actorId].win++;
              records[targetId].lose++;
              save(recordPath, records);
              delete battleData[battleId];
              save(battlePath, battleData);

              return await battleMsg.edit({
                content: null,
                embeds: [
                  new EmbedBuilder()
                    .setTitle("🏆 승리!")
                    .setDescription(`**${i.user.username}** 님이 전투에서 승리하였습니다!`)
                    .addFields(
                      { name: "🧙 사용한 챔피언", value: attacker.name, inline: true },
                      { name: "📜 전투 기록", value: currentBattle.logs.slice(-5).join("\n") || "없음", inline: false }
                    )
                    .setThumbnail(getChampionIcon(attacker.name))
                    .setImage(getChampionSplash(attacker.name))
                    .setColor(0x00ff88)
                    .setFooter({ text: "까리한 디스코드 챔피언 배틀" })
                    .setTimestamp()
                ],
                components: []
              });
            }

            currentBattle.turn = targetId;
      battleData[battleId] = currentBattle;
      save(battlePath, battleData);

      const updatedEmbed = createBattleEmbed(challenger, opponent, currentBattle, userData, targetId, logMsg);

      await battleMsg.edit({
        content: `💥 턴 종료! 이제 <@${targetId}> 의 차례입니다.`,
        embeds: [updatedEmbed],
        components: [battleButtons]
      });

      startTurnCollector();

    } catch (err) {
      console.error("🔥 버튼 처리 오류:", err);
      try {
        if (!i.replied && !i.deferred) {
          await i.reply({ content: "❌ 처리 중 오류가 발생했습니다.", ephemeral: true });
        }
      } catch (e) {
        console.error("❗ 오류 응답 중 또 오류:", e);
      }
    }
  });

  turnCollector.on("end", async () => {
    const stillExists = load(battlePath)[battleId];
    if (stillExists) {
      delete battleData[battleId];
      save(battlePath, battleData);
      try {
        await battleMsg.edit({
          content: "⛔ 전투가 시간 초과로 종료되었습니다.",
          components: []
        });
      } catch (e) {
        console.warn("🛠 전투 종료 메시지 수정 실패:", e);
            }
          }
        }); // ⬅️ ✅ turnCollector.on("end", ...) 닫음

      }; // ⬅️ ✅ startTurnCollector 함수 닫음

    }); // ⬅️ ✅ 수락 버튼 Collector 닫음
  }
};
