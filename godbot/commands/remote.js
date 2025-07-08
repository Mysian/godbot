const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } = require("discord.js");

// === [필수] 음성채널 카테고리 ID를 여기에 맞게! ===
const CATEGORY_ID = "1207980297854124032";

module.exports = {
  data: new SlashCommandBuilder()
    .setName("리모콘")
    .setDescription("음성채널 상태 입력/수정, 빠른 이동 리모콘"),
  async execute(interaction) {
    // 카테고리 내 음성채널 목록
    const channels = interaction.guild.channels.cache
      .filter(ch => ch.parentId === CATEGORY_ID && ch.type === 2);
    if (!channels.size) {
      return interaction.reply({ content: "해당 카테고리 내 음성채널이 없어요!", ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle("🎛️ 음성채널 리모콘")
      .setDescription([
        "원하는 기능을 아래 버튼으로 사용할 수 있습니다.",
        "",
        "1️⃣ **음성채널 상태명 입력/수정**",
        "2️⃣ **음성채널 빠른 이동**",
      ].join("\n"))
      .setColor("#4f8cff");

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId("remote_set_topic")
          .setLabel("음성채널 상태명 입력/수정")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("remote_quick_move")
          .setLabel("음성채널 빠른 이동")
          .setStyle(ButtonStyle.Success)
      );

    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  },

  // === 버튼/모달/이동 핸들러 ===
  async handleButton(interaction) {
    // 1. 상태명 입력/수정
    if (interaction.customId === "remote_set_topic") {
      // 음성채널 드롭다운 (모달에 직접 입력해도 되고, 여기선 드롭다운 우선)
      const channels = interaction.guild.channels.cache
        .filter(ch => ch.parentId === CATEGORY_ID && ch.type === 2);

      const select = new StringSelectMenuBuilder()
        .setCustomId("remote_select_channel_for_topic")
        .setPlaceholder("상태명을 수정할 음성채널을 선택하세요.")
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(
          Array.from(channels.values()).map(c => ({
            label: c.name,
            value: c.id
          }))
        );

      return interaction.reply({
        content: "상태명을 수정할 음성채널을 선택하세요.",
        components: [new ActionRowBuilder().addComponents(select)],
        ephemeral: true
      });
    }

    // 2. 빠른 이동
    if (interaction.customId === "remote_quick_move") {
      const channels = interaction.guild.channels.cache
        .filter(ch => ch.parentId === CATEGORY_ID && ch.type === 2);
      if (!channels.size) {
        return interaction.reply({ content: "음성채널 없음!", ephemeral: true });
      }
      // 버튼이 5개 이상이면 페이지네이션(간단화)
      const rows = [];
      let row = new ActionRowBuilder();
      let count = 0;
      for (const channel of channels.values()) {
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

      return interaction.reply({
        content: "이동할 음성채널을 선택하세요!",
        components: rows,
        ephemeral: true
      });
    }

    // 3. 음성채널 이동 버튼
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
  },

  async handleSelect(interaction) {
    // 상태명 입력 모달로
    if (interaction.customId === "remote_select_channel_for_topic") {
      const channelId = interaction.values[0];
      // 모달
      const modal = new ModalBuilder()
        .setCustomId(`remote_modal_topic_${channelId}`)
        .setTitle("상태명 입력/수정")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("new_topic")
              .setLabel("새로운 상태/설명 입력")
              .setStyle(TextInputStyle.Short)
              .setMaxLength(100)
              .setPlaceholder("예: 자유롭게 대화중!")
              .setRequired(true)
          )
        );
      return interaction.showModal(modal);
    }
  },

  async handleModal(interaction) {
    // 모달 상태명 변경
    if (interaction.customId.startsWith("remote_modal_topic_")) {
      const channelId = interaction.customId.replace("remote_modal_topic_", "");
      const newTopic = interaction.fields.getTextInputValue("new_topic");
      const channel = interaction.guild.channels.cache.get(channelId);
      if (!channel) {
        return interaction.reply({ content: "채널을 찾을 수 없습니다.", ephemeral: true });
      }
      await channel.setTopic(newTopic);
      return interaction.reply({ content: `\`${channel.name}\`의 상태명이 \`${newTopic}\`(으)로 변경됨!`, ephemeral: true });
    }
  }
};
