const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

// 음성채널 카테고리 ID
const CATEGORY_ID = "1207980297854124032";

function getSortedChannels(channels) {
  // 채널명 기준: 숫자 시작 우선, 이후 가나다순
  const numFirst = [];
  const charFirst = [];
  for (const ch of channels.values()) {
    const first = ch.name.trim()[0];
    if (first >= '0' && first <= '9') {
      numFirst.push(ch);
    } else {
      charFirst.push(ch);
    }
  }
  // 각각 오름차순 정렬
  numFirst.sort((a, b) => a.name.localeCompare(b.name, 'ko-KR', { numeric: true }));
  charFirst.sort((a, b) => a.name.localeCompare(b.name, 'ko-KR'));
  return [...numFirst, ...charFirst];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("리모콘")
    .setDescription("누구나 상시 클릭해서 이동할 수 있는 음성채널 이동 리모콘"),
  async execute(interaction) {
    // 카테고리 내 음성채널 목록
    const channels = interaction.guild.channels.cache
      .filter(ch => ch.parentId === CATEGORY_ID && ch.type === 2);

    if (!channels.size) {
      return interaction.reply({ content: "해당 카테고리 내 음성채널이 없어요!", ephemeral: false });
    }

    // 정렬된 배열 반환
    const sorted = getSortedChannels(channels);

    const embed = new EmbedBuilder()
      .setTitle("🎛️ 음성채널 빠른 이동 리모콘")
      .setDescription("이동하고 싶은 음성채널을 클릭하세요!\n(누구나 상시 클릭 가능)")
      .setColor("#4f8cff");

    // 5개씩 버튼 줄로 생성
    const rows = [];
    let row = new ActionRowBuilder();
    let count = 0;
    for (const channel of sorted) {
      if (count === 5) {
        rows.push(row);
        row = new ActionRowBuilder();
        count = 0;
      }
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`remote_move_${channel.id}`)
          .setLabel(channel.name)
          .setStyle(ButtonStyle.Secondary)
      );
      count++;
    }
    if (row.components.length) rows.push(row);

    // 전체에게 공개, 항상 채널에 남게!
    await interaction.reply({
      embeds: [embed],
      components: rows,
      ephemeral: false
    });
  },

  async handleButton(interaction) {
    if (interaction.customId.startsWith("remote_move_")) {
      const channelId = interaction.customId.replace("remote_move_", "");
      if (!interaction.member.voice.channel) {
        return interaction.reply({ content: "먼저 음성채널에 접속해 있어야 이동할 수 있어!", ephemeral: true });
      }
      try {
        await interaction.member.voice.setChannel(channelId);
        return interaction.reply({ content: "✅ 이동 완료!", ephemeral: true });
      } catch {
        return interaction.reply({ content: "이동 실패! 권한/상태를 확인해줘!", ephemeral: true });
      }
    }
  }
};
