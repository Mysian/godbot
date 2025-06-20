// 📁 commands/schedule.js
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, ComponentType } = require("discord.js");
const fs = require("fs");
const path = require("path");
const schedulePath = path.join(__dirname, "../schedule.json");

function loadSchedule() {
  if (!fs.existsSync(schedulePath)) return [];
  return JSON.parse(fs.readFileSync(schedulePath));
}
function saveSchedule(schedule) {
  fs.writeFileSync(schedulePath, JSON.stringify(schedule, null, 2));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("일정")
    .setDescription("일정 관리 기능 (검색/등록/수정/취소/공유)"),

  async execute(interaction) {
    // 일정 불러오기
    let schedule = loadSchedule();
    // 최신순 정렬 + 최대 10개만 표시
    let desc = "등록된 일정이 없습니다.";
    if (schedule.length > 0) {
      schedule = schedule.sort((a, b) => new Date(a.date || "9999-12-31") - new Date(b.date || "9999-12-31")).slice(0, 10);
      desc = schedule.map((s, idx) => {
        let shareStr = s.share?.length
          ? `\n공유 대상: ${s.share.map(uid => `<@${uid}>`).join(", ")}`
          : "";
        return `**${idx+1}. ${s.title}**\n📅 ${s.date || "무기한"}\n📝 ${s.content}\n등록자: <@${s.userId}>${shareStr}\n`;
      }).join("\n");
    }

    // 버튼
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("schedule-search").setLabel("일정 검색").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("schedule-add").setLabel("일정 등록").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("schedule-edit").setLabel("일정 수정").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("schedule-delete").setLabel("일정 취소").setStyle(ButtonStyle.Danger)
    );

    const embed = new EmbedBuilder()
      .setTitle("📆 일정 관리")
      .setDescription(desc)
      .setColor(0x5865f2)
      .setFooter({ text: "아래 버튼으로 기능을 선택하세요." });

    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });

    // 버튼 클릭 핸들러
    const btn = await interaction.channel.awaitMessageComponent({
      filter: i => i.user.id === interaction.user.id,
      time: 30_000,
      componentType: ComponentType.Button,
    }).catch(() => null);
    if (!btn) return;

    // 일정 검색
    if (btn.customId === "schedule-search") {
      let schedule = loadSchedule();
      if (schedule.length === 0)
        return btn.update({ content: "저장된 일정이 없습니다.", embeds: [], components: [] });
      
      // 공유 받은 일정(본인만 볼 수 있는)
      const myShared = schedule.filter(s => s.share && s.share.includes(interaction.user.id));
      // 공개 일정(모든 유저가 볼 수 있는)
      const normal = schedule.filter(s => !s.share || !s.share.length);

      let desc = "";
      if (normal.length > 0) {
        desc += "📅 **전체 공개 일정**\n";
        desc += normal
          .sort((a, b) => new Date(a.date || "9999-12-31") - new Date(b.date || "9999-12-31"))
          .slice(0, 10)
          .map((s, idx) => {
            return `**${idx+1}. ${s.title}**\n📅 ${s.date || "무기한"}\n📝 ${s.content}\n등록자: <@${s.userId}>\n`;
          }).join("\n");
      }
      if (myShared.length > 0) {
        desc += "\n\n📨 **당신의 일정**\n";
        desc += myShared
          .sort((a, b) => new Date(a.date || "9999-12-31") - new Date(b.date || "9999-12-31"))
          .slice(0, 10)
          .map((s, idx) => {
            let who = s.userId === interaction.user.id ? "내가 공유함" : `<@${s.userId}>가 공유함`;
            return `**${s.title}**\n📅 ${s.date || "무기한"}\n📝 ${s.content}\n${who}\n`;
          }).join("\n");
      }
      const listEmbed = new EmbedBuilder()
        .setTitle("📅 일정 목록")
        .setDescription(desc.length ? desc : "조회 가능한 일정이 없습니다.")
        .setColor(0x57f287);
      return btn.update({ embeds: [listEmbed], components: [] });
    }

    // 일정 등록 (공유 대상 선택)
    if (btn.customId === "schedule-add") {
      // 서버 인원 최대 25명 멀티셀렉트 (자기자신 제외, 봇 제외)
      const members = await interaction.guild.members.fetch();
      const options = members.filter(m=>!m.user.bot && m.id !== interaction.user.id).map(m=>({
        label: m.displayName, value: m.id
      })).slice(0, 25);
      const selectRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("schedule-share")
          .setPlaceholder("공유 대상 유저 선택 (최대 5명, 안 해도 됨)")
          .setMinValues(0)
          .setMaxValues(Math.min(5, options.length))
          .addOptions(options)
      );
      await btn.update({ content: "공유할 유저를 선택해 주세요. (안 골라도 됨)", embeds: [], components: [selectRow] });
      const select = await interaction.channel.awaitMessageComponent({
        filter: i => i.user.id === interaction.user.id && i.customId === "schedule-share",
        time: 30_000,
        componentType: ComponentType.StringSelect,
      }).catch(() => null);
      if (!select) return;

      // 모달로 일정 정보 입력
      const modal = new ModalBuilder().setCustomId("schedule-add-modal").setTitle("일정 등록");
      const titleInput = new TextInputBuilder().setCustomId("title").setLabel("일정 제목").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(32);
      const dateInput = new TextInputBuilder().setCustomId("date").setLabel("일정 날짜 (예: 2024-12-31, 무기한이면 '무기한' 입력)").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(16);
      const contentInput = new TextInputBuilder().setCustomId("content").setLabel("일정 내용").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(200);
      const pwInput = new TextInputBuilder().setCustomId("pw").setLabel("비밀번호(숫자 4자리)").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(4).setMinLength(4);
      modal.addComponents(
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(dateInput),
        new ActionRowBuilder().addComponents(contentInput),
        new ActionRowBuilder().addComponents(pwInput)
      );
      await select.showModal(modal);
      const modalSubmit = await select.awaitModalSubmit({
        filter: i => i.user.id === interaction.user.id,
        time: 60_000
      }).catch(() => null);
      if (!modalSubmit) return;

      // 등록
      const schedule = loadSchedule();
      schedule.push({
        title: modalSubmit.fields.getTextInputValue("title"),
        date: (d => (d === "무기한" ? null : d))(modalSubmit.fields.getTextInputValue("date")),
        content: modalSubmit.fields.getTextInputValue("content"),
        share: select.values,
        pw: modalSubmit.fields.getTextInputValue("pw"),
        userId: interaction.user.id,
        created: Date.now()
      });
      saveSchedule(schedule);
      const doneEmbed = new EmbedBuilder()
        .setTitle("✅ 일정 등록 완료")
        .setDescription(
          `**${modalSubmit.fields.getTextInputValue("title")}**\n` +
          `📅 ${modalSubmit.fields.getTextInputValue("date")}\n` +
          `📝 ${modalSubmit.fields.getTextInputValue("content")}\n` +
          (select.values.length ? `공유 대상: ${select.values.map(id=>`<@${id}>`).join(", ")}` : "") +
          `\n등록자: <@${interaction.user.id}>`
        );
      return modalSubmit.reply({ embeds: [doneEmbed], ephemeral: true });
    }

    // 일정 수정 or 취소(삭제) - 공유 대상 포함
    if (btn.customId === "schedule-edit" || btn.customId === "schedule-delete") {
      let schedule = loadSchedule();
      // 본인이 등록한 일정만 선택 가능
      schedule = schedule.filter(s => s.userId === interaction.user.id);
      if (schedule.length === 0) return btn.update({ content: "본인이 등록한 일정이 없습니다.", embeds: [], components: [] });
      const selectRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("schedule-select")
          .setPlaceholder("수정/취소할 일정을 선택하세요")
          .setMinValues(1)
          .setMaxValues(1)
          .addOptions(schedule.map((s, i) => ({ label: `${s.title} (${s.date||"무기한"})`, value: String(i) })))
      );
      await btn.update({ content: "수정/취소할 일정을 선택하세요.", embeds: [], components: [selectRow] });
      const select = await interaction.channel.awaitMessageComponent({
        filter: i => i.user.id === interaction.user.id && i.customId === "schedule-select",
        time: 30_000,
        componentType: ComponentType.StringSelect,
      }).catch(() => null);
      if (!select) return;
      const idx = Number(select.values[0]);
      const target = schedule[idx];

      // 비밀번호 입력받기
      const pwModal = new ModalBuilder().setCustomId("schedule-pw-modal").setTitle("비밀번호 인증");
      const pwInput = new TextInputBuilder().setCustomId("pw").setLabel("비밀번호(숫자 4자리)").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(4).setMinLength(4);
      pwModal.addComponents(new ActionRowBuilder().addComponents(pwInput));
      await select.showModal(pwModal);
      const modalSubmit = await select.awaitModalSubmit({
        filter: i => i.user.id === interaction.user.id,
        time: 30_000
      }).catch(() => null);
      if (!modalSubmit) return;
      const inputPw = modalSubmit.fields.getTextInputValue("pw");
      if (target.pw !== inputPw) return modalSubmit.reply({ content: "비밀번호가 일치하지 않습니다.", ephemeral: true });

      // 수정
      if (btn.customId === "schedule-edit") {
        // 공유대상 수정
        const members = await interaction.guild.members.fetch();
        const options = members.filter(m=>!m.user.bot && m.id !== interaction.user.id).map(m=>({
          label: m.displayName, value: m.id
        })).slice(0, 25);
        const selectRow2 = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("schedule-share-edit")
            .setPlaceholder("공유 대상 유저 선택 (최대 5명, 안 해도 됨)")
            .setMinValues(0)
            .setMaxValues(Math.min(5, options.length))
            .addOptions(options)
            .setDefaultValues(target.share || [])
        );
        await modalSubmit.reply({ content: "수정할 공유 대상을 선택해 주세요. (안 해도 됨)", embeds: [], components: [selectRow2], ephemeral: true });
        const select2 = await interaction.channel.awaitMessageComponent({
          filter: i => i.user.id === interaction.user.id && i.customId === "schedule-share-edit",
          time: 30_000,
          componentType: ComponentType.StringSelect,
        }).catch(() => null);
        if (!select2) return;

        // 모달로 일정 정보 수정
        const modal = new ModalBuilder().setCustomId("schedule-edit-modal").setTitle("일정 수정");
        const titleInput = new TextInputBuilder().setCustomId("title").setLabel("일정 제목").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(32).setValue(target.title);
        const dateInput = new TextInputBuilder().setCustomId("date").setLabel("일정 날짜 (예: 2024-12-31, 무기한이면 '무기한' 입력)").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(16).setValue(target.date || "무기한");
        const contentInput = new TextInputBuilder().setCustomId("content").setLabel("일정 내용").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(200).setValue(target.content);
        modal.addComponents(
          new ActionRowBuilder().addComponents(titleInput),
          new ActionRowBuilder().addComponents(dateInput),
          new ActionRowBuilder().addComponents(contentInput)
        );
        await select2.showModal(modal);
        const editSubmit = await select2.awaitModalSubmit({
          filter: i => i.user.id === interaction.user.id,
          time: 60_000
        }).catch(() => null);
        if (!editSubmit) return;
        const scheduleAll = loadSchedule();
        const realIdx = scheduleAll.findIndex(s => s.userId === interaction.user.id && s.created === target.created);
        if (realIdx !== -1) {
          scheduleAll[realIdx].title = editSubmit.fields.getTextInputValue("title");
          scheduleAll[realIdx].date = (d => (d === "무기한" ? null : d))(editSubmit.fields.getTextInputValue("date"));
          scheduleAll[realIdx].content = editSubmit.fields.getTextInputValue("content");
          scheduleAll[realIdx].share = select2.values;
          saveSchedule(scheduleAll);
        }
        const doneEmbed = new EmbedBuilder()
          .setTitle("✏️ 일정 수정 완료")
          .setDescription(
            `**${editSubmit.fields.getTextInputValue("title")}**\n` +
            `📅 ${editSubmit.fields.getTextInputValue("date")}\n` +
            `📝 ${editSubmit.fields.getTextInputValue("content")}\n` +
            (select2.values.length ? `공유 대상: ${select2.values.map(id=>`<@${id}>`).join(", ")}` : "") +
            `\n등록자: <@${interaction.user.id}>`
          );
        return editSubmit.reply({ embeds: [doneEmbed], ephemeral: true });
      } else {
        const scheduleAll = loadSchedule();
        const realIdx = scheduleAll.findIndex(s => s.userId === interaction.user.id && s.created === target.created);
        if (realIdx !== -1) {
          scheduleAll.splice(realIdx, 1);
          saveSchedule(scheduleAll);
        }
        return modalSubmit.reply({ content: "🗑️ 일정이 취소(삭제)되었습니다.", ephemeral: true });
      }
    }
  }
};
