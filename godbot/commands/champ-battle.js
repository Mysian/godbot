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

    // 이미 진행 중인지 확인
    if (Object.values(battleData).some(b => b.challenger === challenger.id || b.opponent === challenger.id)) {
      return interaction.reply({ content: "⚔️ 이미 진행 중인 전투가 있습니다!", ephemeral: true });
    }

    if (!userData[challenger.id] || !userData[opponent.id]) {
      return interaction.reply({ content: "❌ 두 유저 모두 챔피언을 보유해야 합니다.", ephemeral: true });
    }

    const challengerChamp = userData[challenger.id];
    const opponentChamp = userData[opponent.id];

    const battleId = `${challenger.id}_${opponent.id}`;

    // 전투 상태 초기화
    battleData[battleId] = {
      challenger: challenger.id,
      opponent: opponent.id,
      hp: {
        [challenger.id]: challengerChamp.stats.hp,
        [opponent.id]: opponentChamp.stats.hp
      },
      turn: challenger.id,
      logs: []
    };
    save(battlePath, battleData);

    const embed = new EmbedBuilder()
      .setTitle("⚔️ 챔피언 배틀 시작!")
      .setDescription(
        `**${challenger.username}** vs **${opponent.username}**\n\n` +
        `첫 공격자: **${challenger.username}**\n` +
        `🧪 버튼을 눌러 행동을 선택하세요!`
      )
      .setColor(0xe74c3c);

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("attack").setLabel("공격").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("defend").setLabel("방어").setStyle(ButtonStyle.Secondary)
    );

    const message = await interaction.reply({
      content: `<@${challenger.id}> vs <@${opponent.id}>`,
      embeds: [embed],
      components: [buttons],
      fetchReply: true
    });

    const collector = message.createMessageComponentCollector({ time: 120_000 });

    collector.on("collect", async i => {
      const battle = load(battlePath)[battleId];
      if (!battle) return i.reply({ content: "전투가 종료되었거나 유효하지 않습니다.", ephemeral: true });

      if (i.user.id !== battle.turn) {
        return i.reply({ content: "⛔ 지금은 당신의 턴이 아닙니다.", ephemeral: true });
      }

      const isAttack = i.customId === "attack";
      const actorId = i.user.id;
      const targetId = actorId === challenger.id ? opponent.id : challenger.id;

      const attacker = userData[actorId];
      const defender = userData[targetId];

      const result = calculateDamage(attacker.stats, defender.stats, isAttack);

      battle.hp[targetId] -= result.damage;
      battle.logs.push(`**${i.user.username}**: ${result.log}`);

      // 체력 0 이하 체크
      if (battle.hp[targetId] <= 0) {
        const records = load(recordPath);
        records[actorId] = records[actorId] || { name: attacker.name, win: 0, draw: 0, lose: 0 };
        records[targetId] = records[targetId] || { name: defender.name, win: 0, draw: 0, lose: 0 };

        records[actorId].win++;
        records[targetId].lose++;

        save(recordPath, records);
        delete battleData[battleId];
        save(battlePath, battleData);

        return i.update({
          content: `🏆 **${i.user.username}** 승리!\n\n📜 로그:\n${battle.logs.join("\n")}`,
          embeds: [],
          components: []
        });
      }

      // 턴 넘기기
      battle.turn = targetId;
      save(battlePath, battleData);

      await i.update({
        content: `💥 ${i.user.username}의 행동 완료! 턴이 <@${targetId}>에게 넘어갑니다.`,
        embeds: [],
        components: [buttons]
      });
    });

    collector.on("end", async () => {
      delete battleData[battleId];
      save(battlePath, battleData);
    });
  }
};
