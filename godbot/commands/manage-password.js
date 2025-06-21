const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder
} = require("discord.js");
const fs = require("fs");
const path = require("path");

const dataDir = path.join(__dirname, "../data");
const adminpwPath = path.join(dataDir, "adminpw.json");

function loadAdminPw() {
  if (!fs.existsSync(adminpwPath)) return null;
  try {
    const { pw } = JSON.parse(fs.readFileSync(adminpwPath, "utf8"));
    return pw;
  } catch {
    return null;
  }
}
function saveAdminPw(newPw) {
  fs.writeFileSync(adminpwPath, JSON.stringify({ pw: newPw }));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("비밀번호설정")
    .setDescription("관리용 비밀번호를 설정/변경합니다."),

  async execute(interaction) {
    const currentPw = loadAdminPw();

    if (!currentPw) {
      // 최초 등록: 새 비밀번호만 입력받는 모달
      const modal = new ModalBuilder()
        .setCustomId("set_adminpw_first")
        .setTitle("비밀번호 최초 등록")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("pw")
              .setLabel("새 비밀번호 (4자리)")
              .setStyle(TextInputStyle.Short)
              .setMinLength(4)
              .setMaxLength(4)
              .setRequired(true)
          )
        );
      await interaction.showModal(modal);
      return;
    } else {
      // 변경: 현재/새 비밀번호 모두 입력받는 모달
      const modal = new ModalBuilder()
        .setCustomId("set_adminpw_change")
        .setTitle("비밀번호 변경")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("pw_current")
              .setLabel("현재 비밀번호 (4자리)")
              .setStyle(TextInputStyle.Short)
              .setMinLength(4)
              .setMaxLength(4)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("pw_new")
              .setLabel("새 비밀번호 (4자리)")
              .setStyle(TextInputStyle.Short)
              .setMinLength(4)
              .setMaxLength(4)
              .setRequired(true)
          )
        );
      await interaction.showModal(modal);
      return;
    }
  },

  async modalSubmit(interaction) {
    if (interaction.customId === "set_adminpw_first") {
      const pw = interaction.fields.getTextInputValue("pw");
      if (!/^\d{4}$/.test(pw)) {
        await interaction.reply({ content: "❌ 비밀번호는 4자리 숫자여야 합니다.", ephemeral: true });
        return;
      }
      saveAdminPw(pw);
      await interaction.reply({ content: "✅ 비밀번호가 성공적으로 등록되었습니다.", ephemeral: true });
      return;
    }

    if (interaction.customId === "set_adminpw_change") {
      const pw_current = interaction.fields.getTextInputValue("pw_current");
      const pw_new = interaction.fields.getTextInputValue("pw_new");
      const savedPw = loadAdminPw();

      if (pw_current !== savedPw) {
        await interaction.reply({ content: "❌ 현재 비밀번호가 일치하지 않습니다.", ephemeral: true });
        return;
      }
      if (!/^\d{4}$/.test(pw_new)) {
        await interaction.reply({ content: "❌ 새 비밀번호는 4자리 숫자여야 합니다.", ephemeral: true });
        return;
      }
      saveAdminPw(pw_new);
      await interaction.reply({ content: "✅ 비밀번호가 성공적으로 변경되었습니다.", ephemeral: true });
      return;
    }
  }
};
