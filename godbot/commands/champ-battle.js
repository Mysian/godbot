const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const champions = require("../utils/champion-data");
const { calculateDamage } = require("../utils/battleEngine");

const userDataPath = path.join(__dirname, "../data/champion-users.json");
const recordPath = path.join(__dirname, "../data/champion-records.json");
const battlePath = path.join(__dirname, "../data/battle-active.json");

function load(path) {
  if (!fs.existsSync(path)) fs.writeFileSync(path, "{}");
  return JSON.parse(fs.readFileSync(path));
}

function save(path, data) {
  fs.writeFileSync(path, JSON.stringify(data, null, 2));
}

function createHpBar(current, max) {
  const totalBars = 10;
  const filled = Math.max(0, Math.round((current / max) * totalBars));
  return "🟥".repeat(filled) + "⬜".repeat(totalBars - filled);
}

function createBattleEmbed(challenger, opponent, battle, userData, turnId) {
  const challengerStats = userData[challenger.id].stats;
  const opponentStats = userData[opponent.id].stats;
  const chp = battle.hp[challenger.id];
  const ohp = battle.hp[opponent.id];

  return new EmbedBuilder()
    .setTitle("⚔️ 챔피언 배틀")
    .setDescription(`**${challenger.username}** vs **${opponent.username}**`)
    .addFields(
      {
        name: `👑 ${challenger.username}`,
        value: `💬 ${userData[challenger.id].name} | 💖 ${chp} / ${challengerStats.hp}\n${createHpBar(chp, challengerStats.hp)}`,
        inline: true
      },
      {
        name: `🛡️ ${opponent.username}`,
        value: `💬 ${userData[opponent.id].name} | 💖 ${ohp} / ${opponentStats.hp}\n${createHpBar(ohp, opponentStats.hp)}`,
        inline: true
      },
      {
        name: `🎯 현재 턴`,
        value: `<@${turnId}>`,
        inline: false
      }
    )
    .setColor(0x3498db);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("챔피언배틀")
    .setDescription("지정한 유저와 챔피언 배틀을 시작합니다.")
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
      [b.challenger, b.opponent].includes(challenger.id)
    )) {
      return interaction.reply({ content: "⚔️ 이미 전투 중입니다!", ephemeral: true });
    }

    const challengerChamp = userData[challenger.id];
    const opponentChamp = userData[opponent.id];

    const battleId = `${challenger.id}_${opponent.id}`;

    const battle = {
      challenger: challenger.id,
      opponent: opponent.id,
      hp: {
        [challenger.id]: challengerChamp.stats.hp,
        [opponent.id]: opponentChamp.stats.hp
      },
      turn: challenger.id,
      logs: []
    };

    battleData[battleId] = battle;
    save(battlePath, battleData);

    const embed = createBattleEmbed(challenger, opponent, battle, userData, challenger.id);

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("attack").setLabel("🗡️ 공격").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("defend").setLabel("🛡️ 방어").setStyle(ButtonStyle.Secondary)
    );

    const message = await interaction.reply({
      content: `<@${challenger.id}> vs <@${opponent.id}>`,
      embeds: [embed],
      components: [buttons],
      fetchReply: true
    });

    const collector = message.createMessageComponentCollector({ time: 120_000 });

    collector.on("collect", async i => {
      const currentBattle = load(battlePath)[battleId]; // 항상 최신 상태 유지
      if (!currentBattle) return i.reply({ content: "⚠️ 전투 정보가 없습니다.", ephemeral: true });

      if (i.user.id !== currentBattle.turn) {
        return i.reply({ content: "⛔ 지금은 당신의 턴이 아닙니다.", ephemeral: true });
      }

      const isAttack = i.customId === "attack";
      const actorId = i.user.id;
      const targetId = actorId === currentBattle.challenger ? currentBattle.opponent : currentBattle.challenger;

      const attacker = userData[actorId];
      const defender = userData[targetId];

      const result = calculateDamage(attacker.stats, defender.stats, isAttack);

      currentBattle.hp[targetId] -= result.damage;
      currentBattle.logs.push(`**${i.user.username}**: ${result.log}`);

      // 승패 판정
      if (currentBattle.hp[targetId] <= 0) {
        const records = load(recordPath);
        records[actorId] = records[actorId] || { name: attacker.name, win: 0, draw: 0, lose: 0 };
        records[targetId] = records[targetId] || { name: defender.name, win: 0, draw: 0, lose: 0 };

        records[actorId].win++;
        records[targetId].lose++;

        save(recordPath, records);
        delete battleData[battleId];
        save(battlePath, battleData);

        return i.update({
          content: `🏆 **${i.user.username}** 승리!\n\n📜 전투 기록:\n${currentBattle.logs.join("\n")}`,
          embeds: [],
          components: []
        });
      }

      // 턴 교체
      currentBattle.turn = targetId;
      battleData[battleId] = currentBattle;
      save(battlePath, battleData);

      const updatedEmbed = createBattleEmbed(challenger, opponent, currentBattle, userData, targetId);

      await i.update({
        content: `💥 **${i.user.username}**의 행동 완료! 턴이 <@${targetId}> 에게 넘어갑니다.`,
        embeds: [updatedEmbed],
        components: [buttons]
      });
    });

    collector.on("end", async () => {
      delete battleData[battleId];
      save(battlePath, battleData);
    });
  }
};
