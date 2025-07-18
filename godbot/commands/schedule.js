// 📁 commands/schedule.js
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, ComponentType } = require("discord.js");
const fs = require("fs");
const path = require("path");
const lockfile = require("proper-lockfile");
const schedulePath = path.join(__dirname, "../schedule.json");

function loadSchedule() {
  if (!fs.existsSync(schedulePath)) return [];
  return JSON.parse(fs.readFileSync(schedulePath));
}
async function saveSchedule(schedule) {
  let release;
  try {
    release = await lockfile.lock(schedulePath);
    fs.writeFileSync(schedulePath, JSON.stringify(schedule, null, 2));
  } finally {
    if (release) await release();
  }
}
function purgeOldSchedule(schedule) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return schedule.filter(s => !s.date || new Date(s.date) >= today);
}
function fmt(date) {
  if (!date) return "무기한";
  try {
    const d = new Date(date);
    if (isNaN(d)) return date;
    return `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,"0")}-${d.getDate().toString().padStart(2,"0")}`;
  } catch {
    return date;
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("일정")
    .setDescription("일정 관리 기능 (등록/수정/취소/새로고침/공유)"),

  async execute(interaction) {
    let schedule = purgeOldSchedule(loadSchedule());
    await saveSchedule(schedule);

    function makeScheduleEmbed(scheduleArr, title = "📆 일정 관리", onlyFirst = false) {
      const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor(0x5865f2);

      if (!scheduleArr.length) {
        embed.setDescription("등록된 일정이 없습니다.");
      } else {
        scheduleArr = scheduleArr
          .sort((a, b) => new Date(a.date || "9999-12-31") - new Date(b.date || "9999-12-31"));
        if (onlyFirst) scheduleArr = scheduleArr.slice(0, 1);
        else scheduleArr = scheduleArr.slice(0, 10);
        for (let i = 0; i < scheduleArr.length; i++) {
          const s = scheduleArr[i];
          embed.addFields({
            name: onlyFirst
              ? `🏷️ **${s.title}**   |   📅 **${fmt(s.date)}**   |   ⏰ **${s.time || "미정"}**`
              : `\` ${i+1} \`  🏷️ **${s.title}**   |   📅 **${fmt(s.date)}**   |   ⏰ **${s.time || "미정"}**`,
            value:
              `📝 _${s.content}_\n` +
              `👤 등록자: <@${s.userId}>`,
            inline: false,
          });
        }
      }
      return embed;
    }

    // 버튼 4개 + 일정 공유 1개(두 번째 줄)
    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("schedule-refresh").setLabel("새로고침").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("schedule-add").setLabel("일정 등록").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("schedule-edit").setLabel("일정 수정").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("schedule-delete").setLabel("일정 취소").setStyle(ButtonStyle.Danger)
    );
    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("schedule-share").setLabel("일정 공유").setStyle(ButtonStyle.Primary)
    );

    async function sendScheduleMenu(editInteraction = interaction) {
      const embed = makeScheduleEmbed(schedule);
      if (editInteraction.replied || editInteraction.deferred) {
        await editInteraction.editReply({ embeds: [embed], components: [row1, row2], ephemeral: true });
      } else {
        await editInteraction.reply({ embeds: [embed], components: [row1, row2], ephemeral: true });
      }
    }

    await sendScheduleMenu();

    while (true) {
      const btn = await interaction.channel.awaitMessageComponent({
        filter: i => i.user.id === interaction.user.id,
        time: 60_000,
        componentType: ComponentType.Button,
      }).catch(() => null);
      if (!btn) break;

      // 새로고침
      if (btn.customId === "schedule-refresh") {
        schedule = purgeOldSchedule(loadSchedule());
        await saveSchedule(schedule);
        await sendScheduleMenu(btn);
        continue;
      }

      // 일정 등록
      if (btn.customId === "schedule-add") {
        // 모달: 제목, 날짜, 시간(선택), 내용, 비번
        const modal = new ModalBuilder().setCustomId("schedule-add-modal").setTitle("일정 등록");
        const titleInput = new TextInputBuilder().setCustomId("title").setLabel("일정 제목").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(32);
        const dateInput = new TextInputBuilder().setCustomId("date").setLabel("일정 날짜 (예: 2024-12-31, 무기한이면 '무기한' 입력)").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(16);
        const timeInput = new TextInputBuilder().setCustomId("time").setLabel("일정 시간 (예: 15:00, 미입력시 '미정')").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(8);
        const contentInput = new TextInputBuilder().setCustomId("content").setLabel("일정 내용").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(200);
        const pwInput = new TextInputBuilder().setCustomId("pw").setLabel("비밀번호(숫자 4자리)").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(4).setMinLength(4);
        modal.addComponents(
          new ActionRowBuilder().addComponents(titleInput),
          new ActionRowBuilder().addComponents(dateInput),
          new ActionRowBuilder().addComponents(timeInput),
          new ActionRowBuilder().addComponents(contentInput),
          new ActionRowBuilder().addComponents(pwInput)
        );
        await btn.showModal(modal);
        const modalSubmit = await btn.awaitModalSubmit({
          filter: i => i.user.id === interaction.user.id,
          time: 60_000
        }).catch(() => null);
        if (!modalSubmit) continue;

        schedule = purgeOldSchedule(loadSchedule());
        schedule.push({
          title: modalSubmit.fields.getTextInputValue("title"),
          date: (d => (d === "무기한" ? null : d))(modalSubmit.fields.getTextInputValue("date")),
          time: modalSubmit.fields.getTextInputValue("time") || "미정",
          content: modalSubmit.fields.getTextInputValue("content"),
          pw: modalSubmit.fields.getTextInputValue("pw"),
          userId: interaction.user.id,
          created: Date.now()
        });
        await saveSchedule(schedule);

        const doneEmbed = new EmbedBuilder()
          .setTitle("✅ 일정 등록 완료")
          .setColor(0x57f287)
          .addFields({
            name: `🏷️ **${modalSubmit.fields.getTextInputValue("title")}**   |   📅 **${fmt(modalSubmit.fields.getTextInputValue("date"))}**   |   ⏰ **${modalSubmit.fields.getTextInputValue("time") || "미정"}**`,
            value:
              `📝 _${modalSubmit.fields.getTextInputValue("content")}_\n` +
              `👤 등록자: <@${interaction.user.id}>`,
            inline: false,
          });
        await modalSubmit.reply({ embeds: [doneEmbed], ephemeral: true });
        schedule = purgeOldSchedule(loadSchedule());
        await sendScheduleMenu();
        continue;
      }

      // 일정 수정/취소
      if (btn.customId === "schedule-edit" || btn.customId === "schedule-delete") {
        let scheduleSelf = purgeOldSchedule(loadSchedule()).filter(s => s.userId === interaction.user.id);
        if (scheduleSelf.length === 0) {
          await btn.update({ content: "본인이 등록한 일정이 없습니다.", embeds: [], components: [], ephemeral: true });
          break;
        }
        const selectRow = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("schedule-select")
            .setPlaceholder("수정/취소할 일정을 선택하세요")
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(scheduleSelf.map((s, i) => ({ label: `${s.title} (${fmt(s.date)})`, value: String(i) })))
        );
        await btn.update({ content: "수정/취소할 일정을 선택하세요.", embeds: [], components: [selectRow], ephemeral: true });
        const select = await interaction.channel.awaitMessageComponent({
          filter: i => i.user.id === interaction.user.id && i.customId === "schedule-select",
          time: 60_000,
          componentType: ComponentType.StringSelect,
        }).catch(() => null);
        if (!select) continue;
        const idx = Number(select.values[0]);
        const target = scheduleSelf[idx];

        // 비밀번호 입력
        const pwModal = new ModalBuilder().setCustomId("schedule-pw-modal").setTitle("비밀번호 인증");
        const pwInput = new TextInputBuilder().setCustomId("pw").setLabel("비밀번호(숫자 4자리)").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(4).setMinLength(4);
        pwModal.addComponents(new ActionRowBuilder().addComponents(pwInput));
        await select.showModal(pwModal);
        const modalSubmit = await select.awaitModalSubmit({
          filter: i => i.user.id === interaction.user.id,
          time: 60_000
        }).catch(() => null);
        if (!modalSubmit) continue;
        const inputPw = modalSubmit.fields.getTextInputValue("pw");
        if (target.pw !== inputPw) {
          await modalSubmit.reply({ content: "비밀번호가 일치하지 않습니다.", ephemeral: true });
          continue;
        }

        // 수정
        if (btn.customId === "schedule-edit") {
          // 모달: 제목, 날짜, 시간(선택), 내용
          const modal = new ModalBuilder().setCustomId("schedule-edit-modal").setTitle("일정 수정");
          const titleInput = new TextInputBuilder().setCustomId("title").setLabel("일정 제목").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(32).setValue(target.title);
          const dateInput = new TextInputBuilder().setCustomId("date").setLabel("일정 날짜 (예: 2024-12-31, 무기한이면 '무기한' 입력)").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(16).setValue(target.date || "무기한");
          const timeInput = new TextInputBuilder().setCustomId("time").setLabel("일정 시간 (예: 15:00, 미입력시 '미정')").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(8).setValue(target.time || "");
          const contentInput = new TextInputBuilder().setCustomId("content").setLabel("일정 내용").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(200).setValue(target.content);
          modal.addComponents(
            new ActionRowBuilder().addComponents(titleInput),
            new ActionRowBuilder().addComponents(dateInput),
            new ActionRowBuilder().addComponents(timeInput),
            new ActionRowBuilder().addComponents(contentInput)
          );
          await modalSubmit.showModal(modal);
          const editSubmit = await modalSubmit.awaitModalSubmit({
            filter: i => i.user.id === interaction.user.id,
            time: 60_000
          }).catch(() => null);
          if (!editSubmit) continue;
          let scheduleAll = purgeOldSchedule(loadSchedule());
          const realIdx = scheduleAll.findIndex(s => s.userId === interaction.user.id && s.created === target.created);
          if (realIdx !== -1) {
            scheduleAll[realIdx].title = editSubmit.fields.getTextInputValue("title");
            scheduleAll[realIdx].date = (d => (d === "무기한" ? null : d))(editSubmit.fields.getTextInputValue("date"));
            scheduleAll[realIdx].time = editSubmit.fields.getTextInputValue("time") || "미정";
            scheduleAll[realIdx].content = editSubmit.fields.getTextInputValue("content");
            await saveSchedule(scheduleAll);
          }
          const doneEmbed = new EmbedBuilder()
            .setTitle("✏️ 일정 수정 완료")
            .setColor(0xfee75c)
            .addFields({
              name: `🏷️ **${editSubmit.fields.getTextInputValue("title")}**   |   📅 **${fmt(editSubmit.fields.getTextInputValue("date"))}**   |   ⏰ **${editSubmit.fields.getTextInputValue("time") || "미정"}**`,
              value:
                `📝 _${editSubmit.fields.getTextInputValue("content")}_\n` +
                `👤 등록자: <@${interaction.user.id}>`,
              inline: false,
            });
          await editSubmit.reply({ embeds: [doneEmbed], ephemeral: true });
          schedule = purgeOldSchedule(loadSchedule());
          await saveSchedule(schedule);
          await sendScheduleMenu();
          continue;
        } else {
          // 삭제
          let scheduleAll = purgeOldSchedule(loadSchedule());
          const realIdx = scheduleAll.findIndex(s => s.userId === interaction.user.id && s.created === target.created);
          if (realIdx !== -1) {
            scheduleAll.splice(realIdx, 1);
            await saveSchedule(scheduleAll);
          }
          await modalSubmit.reply({ content: "🗑️ 일정이 취소(삭제)되었습니다.", ephemeral: true });
          schedule = purgeOldSchedule(loadSchedule());
          await sendScheduleMenu();
          continue;
        }
      }

      // 일정 공유
      if (btn.customId === "schedule-share") {
        // 최신 10개 일정 중에서 선택
        if (!schedule.length) {
          await btn.reply({ content: "공유할 일정이 없습니다.", ephemeral: true });
          continue;
        }
        const options = schedule
          .sort((a, b) => new Date(a.date || "9999-12-31") - new Date(b.date || "9999-12-31"))
          .slice(0, 10)
          .map((s, i) => ({
            label: `${s.title} (${fmt(s.date)})`,
            value: String(i)
          }));
        const selectRow = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("schedule-share-select")
            .setPlaceholder("공유할 일정을 선택하세요")
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(options)
        );
        await btn.reply({ content: "공유할 일정을 선택하세요.", components: [selectRow], ephemeral: true });

        const select = await interaction.channel.awaitMessageComponent({
          filter: i => i.user.id === interaction.user.id && i.customId === "schedule-share-select",
          time: 60_000,
          componentType: ComponentType.StringSelect,
        }).catch(() => null);
        if (!select) continue;

        const idx = Number(select.values[0]);
        const s = schedule
          .sort((a, b) => new Date(a.date || "9999-12-31") - new Date(b.date || "9999-12-31"))
          .slice(0, 10)[idx];

        const embed = new EmbedBuilder()
          .setTitle(`📢 공유된 일정`)
          .setColor(0x4287f5)
          .addFields({
            name: `🏷️ **${s.title}**   |   📅 **${fmt(s.date)}**   |   ⏰ **${s.time || "미정"}**`,
            value:
              `📝 _${s.content}_\n` +
              `👤 등록자: <@${s.userId}>`,
            inline: false,
          })
          .setFooter({ text: `${interaction.user.displayName}님이 공유함` });

        await interaction.channel.send({ embeds: [embed] });
        await select.reply({ content: "일정이 채팅방에 공유되었습니다.", ephemeral: true });
        continue;
      }
    }
  }
};
