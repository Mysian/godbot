const { SlashCommandBuilder, StringSelectMenuBuilder, ActionRowBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

// 진행중인 배틀 저장 위치
const battlePath = path.join(__dirname, "../data/battle-active.json");
const userDataPath = path.join(__dirname, "../data/champion-users.json");

// 배틀 데이터 불러오기/저장
function loadBattleData() {
  if (!fs.existsSync(battlePath)) fs.writeFileSync(battlePath, "{}");
  return JSON.parse(fs.readFileSync(battlePath));
}
function saveBattleData(data) {
  fs.writeFileSync(battlePath, JSON.stringify(data, null, 2));
}
function loadUserData() {
  if (!fs.existsSync(userDataPath)) fs.writeFileSync(userDataPath, "{}");
  return JSON.parse(fs.readFileSync(userDataPath));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("챔피언배틀종료")
    .setDescription("진행 중인 챔피언 배틀을 선택해서 강제 종료합니다."),

  async execute(interaction) {
    const battleData = loadBattleData();
    const userData = loadUserData();

    // 현재 진행중인 모든 배틀 추출 (key, 챌린저ID, 오포넌트ID)
    const activeBattles = Object.entries(battleData).map(([key, v]) => ({
      id: key,
      challenger: v.challenger,
      opponent: v.opponent
    }));

    // 배틀이 하나도 없으면 안내
    if (activeBattles.length === 0) {
      return interaction.reply({
        content: "⚠️ 현재 진행 중인 챔피언 배틀이 없습니다.",
        ephemeral: true
      });
    }

    // 유저명 & 챔피언 표시
    const guild = interaction.guild;
    const battleList = await Promise.all(activeBattles.map(async (b) => {
      const chMember = await guild.members.fetch(b.challenger).catch(() => null);
      const opMember = await guild.members.fetch(b.opponent).catch(() => null);
      const chName = chMember ? chMember.displayName : b.challenger;
      const opName = opMember ? opMember.displayName : b.opponent;
      const chChamp = userData[b.challenger]?.name || "?";
      const opChamp = userData[b.opponent]?.name || "?";
      return {
        label: `${chName} (${chChamp}) vs ${opName} (${opChamp})`,
        value: b.id
      };
    }));

    // 셀렉트 메뉴 구성
    const menu = new StringSelectMenuBuilder()
      .setCustomId("battle_end_select")
      .setPlaceholder("종료할 배틀을 선택하세요")
      .addOptions(battleList);

    const row = new ActionRowBuilder().addComponents(menu);

    const embed = new EmbedBuilder()
      .setTitle("🛑 챔피언 배틀 중단")
      .setDescription(
        "진행 중인 배틀 목록입니다. 종료할 배틀을 선택하면 해당 배틀만 강제 종료됩니다.\n\n" +
        battleList.map((b, idx) => `**${idx + 1}.** ${b.label}`).join("\n")
      )
      .setColor(0xFF5555)
      .setFooter({ text: "까리한 디스코드" })
      .setTimestamp();

    const reply = await interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: true
    });

    // 셀렉트 메뉴 처리
    const collector = reply.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 30_000
    });

    collector.on("collect", async (i) => {
      const selected = i.values[0];
      if (!battleData[selected]) {
        return i.reply({ content: "❌ 이미 종료된 배틀입니다.", ephemeral: true });
      }
      delete battleData[selected];
      saveBattleData(battleData);

      await i.update({
        embeds: [
          new EmbedBuilder()
            .setTitle("✅ 배틀 종료 완료")
            .setDescription(`선택한 배틀이 정상적으로 중단되었습니다.`)
            .setColor(0x5BFFAF)
            .setFooter({ text: "까리한 디스코드" })
            .setTimestamp()
        ],
        components: []
      });
      collector.stop();
    });

    collector.on("end", async () => {
      try { await reply.edit({ components: [] }); } catch {}
    });
  }
};
