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
const {
  getChampionIcon,
  getChampionSplash
} = require("../utils/champion-utils");

const userDataPath = path.join(__dirname, "../data/champion-users.json");
const recordPath = path.join(__dirname, "../data/champion-records.json");
const battlePath = path.join(__dirname, "../data/battle-active.json");

function load(filePath) {
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, "{}");
  return JSON.parse(fs.readFileSync(filePath));
}

function save(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function createHpBar(current, max) {
  const totalBars = 10;
  const filled = Math.max(0, Math.round((current / max) * totalBars));
  return "🟥".repeat(filled) + "⬜".repeat(totalBars - filled);
}

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
        value: `💬 ${ch.name} | 💖 ${chp} / ${ch.stats.hp}\n${createHpBar(chp, ch.stats.hp)}`,
        inline: true
      },
      {
        name: `🛡️ ${opponent.username}`,
        value: `💬 ${op.name} | 💖 ${ohp} / ${op.stats.hp}\n${createHpBar(ohp, op.stats.hp)}`,
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
        logs: []
      };

      battleData[battleId] = battle;
      save(battlePath, battleData);

      const embed = createBattleEmbed(challenger, opponent, battle, userData, challenger.id);
      const battleButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("attack").setLabel("🗡️ 공격").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("defend").setLabel("🛡️ 방어").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("skill").setLabel("✨ 스킬").setStyle(ButtonStyle.Primary)
      );

      await i.editReply({
        content: `⚔️ 전투 시작! <@${challenger.id}> vs <@${opponent.id}>`,
        embeds: [embed],
        components: [battleButtons]
      });

      const battleMsg = await i.fetchReply();
      const battleCollector = battleMsg.createMessageComponentCollector({ time: 120000 });

      battleCollector.on("collect", async i => {
        try {
          const currentBattle = load(battlePath)[battleId];
          if (!currentBattle) return i.reply({ content: "⚠️ 전투 정보가 없습니다.", ephemeral: true });

          if (i.user.id !== currentBattle.turn) {
            return i.reply({ content: "⛔ 지금은 당신의 턴이 아닙니다.", ephemeral: true });
          }

          await i.deferUpdate();

          const isAttack = i.customId !== "defend";
          const actorId = i.user.id;
          const targetId = actorId === currentBattle.challenger ? currentBattle.opponent : currentBattle.challenger;

          const attacker = userData[actorId];
          const defender = userData[targetId];

          const result = calculateDamage(attacker.stats, defender.stats, isAttack);
          currentBattle.hp[targetId] -= result.damage;
          currentBattle.logs.push(`**${i.user.username}**: ${result.log}`);

          let logMsg = result.log;

          if (currentBattle.hp[targetId] <= 0) {
            const records = load(recordPath);
            records[actorId] = records[actorId] || { name: attacker.name, win: 0, draw: 0, lose: 0 };
            records[targetId] = records[targetId] || { name: defender.name, win: 0, draw: 0, lose: 0 };

            records[actorId].win++;
            records[targetId].lose++;

            save(recordPath, records);
            delete battleData[battleId];
            save(battlePath, battleData);

            return await i.message.edit({
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

          await i.message.edit({
            content: `💥 **${i.user.username}**의 행동 완료! 턴이 <@${targetId}> 에게 넘어갑니다.`,
            embeds: [updatedEmbed],
            components: [battleButtons]
          });
        } catch (err) {
          console.error("🔥 버튼 처리 오류:", err);
          if (!i.replied && !i.deferred) {
            await i.reply({ content: "❌ 처리 중 오류가 발생했습니다.", ephemeral: true });
          }
        }
      });

      battleCollector.on("end", async () => {
        delete battleData[battleId];
        save(battlePath, battleData);
      });
    });

    collector.on("end", async (_, reason) => {
      if (reason !== "messageDelete") {
        await interaction.editReply({ content: "⏱️ 요청 시간이 만료되어 전투가 취소되었습니다.", components: [] });
      }
    });
  }
};
