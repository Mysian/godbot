const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, Events } = require("discord.js");
const { isBotEnabled } = require("./control-panel");

const TARGET_CHANNEL_ID = "1433813732928000100";     // 장기 미접속 안내 임베드 채널
const STAFF_LOG_CHANNEL_ID = "1380874052855529605";  // 관리진 확인용 로그 채널
const LONG_INACTIVE_ROLE_ID = "1371476512024559756"; // 장기 미접속 역할

function buildEmbed() {
  return new EmbedBuilder()
    .setColor(0x9E9E9E)
    .setTitle("⏳ 장기 미접속 안내")
    .setDescription([
      "장기간 서버 접속이 어려우신가요?",
      "",
      "아래 버튼을 통해 **장기 미접속 역할**을 설정/해지하실 수 있습니다.",
      "",
      "—",
      "🔔 **유의 사항**",
      "• 장기 미접속 역할이 부여된 기간 동안에는 **경험치가 지급되지 않습니다.**",
      "• 귀환 시 언제든 아래 버튼으로 역할을 해지하실 수 있습니다."
    ].join("\n"))
    .setFooter({ text: "까리한 디스코드 · 갓봇" });
}

function buildButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("longaway:open")
      .setLabel("장기간 미접속 예정입니다.")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("longaway:cancel")
      .setLabel("장기간 미접속 역할을 해지하겠습니다.")
      .setStyle(ButtonStyle.Secondary)
  );
}

function buildModal() {
  const modal = new ModalBuilder()
    .setCustomId("longaway:modal")
    .setTitle("장기 미접속 등록");

  const reason = new TextInputBuilder()
    .setCustomId("longaway:reason")
    .setLabel("미접속 사유를 적어주세요.")
    .setPlaceholder("예) 시험 준비, 군 휴가, 개인 사정 등")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true);

  const period = new TextInputBuilder()
    .setCustomId("longaway:days")
    .setLabel("미접속 예정 기간(일수)")
    .setPlaceholder("예) 30일, 70, 157일, 400")
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  return modal.addComponents(
    new ActionRowBuilder().addComponents(reason),
    new ActionRowBuilder().addComponents(period)
  );
}

async function upsertPanel(client) {
  try {
    const ch = await client.channels.fetch(TARGET_CHANNEL_ID).catch(() => null);
    if (!ch || !ch.isTextBased()) return;

    const marker = "-# ⏳ **장기 미접속 안내 패널**";
    const recent = await ch.messages.fetch({ limit: 20 }).catch(() => null);
    const exist = recent?.find(m => m.author.id === client.user.id && (m.content?.includes(marker) || m.embeds?.[0]?.title === "⏳ 장기 미접속 안내"));

    const embed = buildEmbed();
    const components = [buildButtons()];

    if (exist) {
      await exist.edit({ content: marker, embeds: [embed], components }).catch(() => {});
    } else {
      await ch.send({ content: marker, embeds: [embed], components }).catch(() => {});
    }
  } catch (e) {
    // no-op
  }
}

function parseDays(input) {
  if (!input) return null;
  const num = String(input).match(/\d+/g);
  if (!num || !num.length) return null;
  const days = parseInt(num.join(""), 10);
  return Number.isFinite(days) && days > 0 ? days : null;
}

async function logToStaff(client, payload) {
  const {
    type, // "register" | "cancel"
    user, // GuildMember or User
    guild,
    reason,
    days
  } = payload;

  try {
    const ch = await client.channels.fetch(STAFF_LOG_CHANNEL_ID).catch(() => null);
    if (!ch || !ch.isTextBased()) return;

    const ts = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
    const desc = type === "register"
      ? [
          `**유저:** <@${user.id}> (\`${user.tag ?? (user.user?.tag || "unknown")}\`)`,
          `**사유:** ${reason ?? "-"}`,
          `**기간:** ${days ? `${days}일` : "-"}`,
          `**시간:** ${ts}`
        ].join("\n")
      : [
          `**유저:** <@${user.id}> (\`${user.tag ?? (user.user?.tag || "unknown")}\`)`,
          `**조치:** 장기 미접속 역할 해지`,
          `**시간:** ${ts}`
        ].join("\n");

    const embed = new EmbedBuilder()
      .setColor(type === "register" ? 0x5E35B1 : 0x546E7A)
      .setTitle(type === "register" ? "✅ 장기 미접속 등록" : "♻️ 장기 미접속 해지")
      .setDescription(desc);

    await ch.send({ embeds: [embed] }).catch(() => {});
  } catch {
    // no-op
  }
}

function addDays(date, days) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

module.exports = {
  register(client) {
    client.once(Events.ClientReady, async () => {
      if (!isBotEnabled()) return;
      await upsertPanel(client);
    });

    client.on(Events.InteractionCreate, async interaction => {
      try {
        if (!isBotEnabled()) return;

        // 버튼: 등록 모달 열기
        if (interaction.isButton() && interaction.customId === "longaway:open") {
          const modal = buildModal();
          return interaction.showModal(modal);
        }

        // 모달 제출: 역할 부여 및 로그
        if (interaction.isModalSubmit() && interaction.customId === "longaway:modal") {
          const reason = interaction.fields.getTextInputValue("longaway:reason")?.trim();
          const daysRaw = interaction.fields.getTextInputValue("longaway:days")?.trim();
          const days = parseDays(daysRaw);

          if (!days) {
            return interaction.reply({
              content: "입력하신 기간을 이해하지 못했어요. **정확한 일수**로 다시 입력해 주세요. (예: `30일`, `70`)",
              ephemeral: true
            }).catch(() => {});
          }

          const member = interaction.member;
          const guild = interaction.guild;

          if (!guild || !member) {
            return interaction.reply({ content: "길드 정보가 없어서 처리할 수 없어요.", ephemeral: true }).catch(() => {});
          }

          const role = guild.roles.cache.get(LONG_INACTIVE_ROLE_ID) || await guild.roles.fetch(LONG_INACTIVE_ROLE_ID).catch(() => null);
          if (!role) {
            return interaction.reply({ content: "장기 미접속 역할을 찾을 수 없어요. 관리자에게 문의해 주세요.", ephemeral: true }).catch(() => {});
          }

          // 역할 부여
          try {
            if (!member.roles.cache.has(LONG_INACTIVE_ROLE_ID)) {
              await member.roles.add(LONG_INACTIVE_ROLE_ID, "장기 미접속 등록");
            }
          } catch {
            return interaction.reply({ content: "역할을 부여하는 중 오류가 발생했어요. 권한을 확인해 주세요.", ephemeral: true }).catch(() => {});
          }

          const now = new Date();
          const until = addDays(now, days);
          const untilStr = until.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });

          await interaction.reply({
            content: [
              "장기 미접속 등록을 완료했어요.",
              `• 사유: **${reason}**`,
              `• 기간: **${days}일** (귀환 예정일 **${untilStr}**)`,
              "",
              "※ 장기 미접속 역할이 부여된 기간 동안에는 **경험치가 지급되지 않습니다.**"
            ].join("\n"),
            ephemeral: true
          }).catch(() => {});

          await logToStaff(client, {
            type: "register",
            user: interaction.user,
            guild,
            reason,
            days
          });

          return;
        }

        // 버튼: 해지
        if (interaction.isButton() && interaction.customId === "longaway:cancel") {
          const member = interaction.member;
          const guild = interaction.guild;

          if (!guild || !member) {
            return interaction.reply({ content: "길드 정보가 없어서 처리할 수 없어요.", ephemeral: true }).catch(() => {});
          }

          const hasRole = member.roles.cache.has(LONG_INACTIVE_ROLE_ID);
          if (!hasRole) {
            await interaction.reply({ content: "현재 장기 미접속 역할이 부여되어 있지 않습니다.", ephemeral: true }).catch(() => {});
            return;
          }

          try {
            await member.roles.remove(LONG_INACTIVE_ROLE_ID, "장기 미접속 해지");
          } catch {
            return interaction.reply({ content: "역할을 해지하는 중 오류가 발생했어요. 권한을 확인해 주세요.", ephemeral: true }).catch(() => {});
          }

          await interaction.reply({
            content: "장기 미접속 역할을 해지했어요. 복귀를 환영합니다!",
            ephemeral: true
          }).catch(() => {});

          await logToStaff(client, {
            type: "cancel",
            user: interaction.user,
            guild
          });

          return;
        }

      } catch {
        // no-op (안전)
      }
    });
  }
};
