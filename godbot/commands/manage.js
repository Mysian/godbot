const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const os = require("os");

const EXCLUDE_ROLE_ID = "1371476512024559756";
const NEWBIE_ROLE_ID = "1295701019430227988";

module.exports = {
  data: new SlashCommandBuilder()
    .setName("관리")
    .setDescription("서버 관리 명령어입니다.")
    .addStringOption((option) =>
      option
        .setName("옵션")
        .setDescription("실행할 관리 기능을 선택하세요.")
        .setRequired(true)
        .addChoices(
          { name: "장기 미이용 유저 추방", value: "inactive" },
          { name: "비활동 신규유저 추방", value: "newbie" },
          { name: "유저 정보 조회", value: "user" },
          { name: "서버상태", value: "status" }
        )
    )
    .addUserOption((option) =>
      option
        .setName("대상유저")
        .setDescription("정보를 조회할 유저")
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const option = interaction.options.getString("옵션");
    const guild = interaction.guild;
    const activityPath = path.join(__dirname, "..", "activity.json");
    const activity = fs.existsSync(activityPath)
      ? JSON.parse(fs.readFileSync(activityPath))
      : {};

    // ======= 서버 상태 =======
    if (option === "status") {
      const memory = process.memoryUsage();
      const rssMB = (memory.rss / 1024 / 1024);
      const heapMB = (memory.heapUsed / 1024 / 1024);

      const load = os.loadavg()[0];
      const uptimeSec = Math.floor(process.uptime());
      const uptime = (() => {
        const h = Math.floor(uptimeSec / 3600);
        const m = Math.floor((uptimeSec % 3600) / 60);
        const s = uptimeSec % 60;
        return `${h}시간 ${m}분 ${s}초`;
      })();

      let memState = "🟢";
      if (rssMB > 1024) memState = "🔴";
      else if (rssMB > 500) memState = "🟡";

      let cpuState = "🟢";
      if (load > 3) cpuState = "🔴";
      else if (load > 1.5) cpuState = "🟡";

      let upState = "🟢";
      if (uptimeSec < 3600) upState = "🔴";
      else if (uptimeSec < 86400) upState = "🟡";

      let total = "🟢 안정적";
      if (memState === "🔴" || cpuState === "🔴") total = "🔴 불안정";
      else if (memState === "🟡" || cpuState === "🟡") total = "🟡 주의";

      let comment = "";
      if (total === "🟢 안정적") comment = "서버가 매우 쾌적하게 동작 중이에요!";
      else if (total === "🟡 주의") comment = "서버에 약간의 부하가 있으니 주의하세요.";
      else comment = "지금 서버가 상당히 무거워요! 재시작이나 최적화가 필요할 수 있음!";

      let hostInfo = `플랫폼: ${os.platform()} (${os.arch()})\n호스트: ${os.hostname()}`;
      if (process.env.RAILWAY_STATIC_URL) {
        hostInfo += `\nRailway URL: ${process.env.RAILWAY_STATIC_URL}`;
      }

      const embed = new EmbedBuilder()
        .setTitle(`${total} | 서버 상태 진단`)
        .setColor(total === "🔴 불안정" ? 0xff2222 : total === "🟡 주의" ? 0xffcc00 : 0x43e743)
        .setDescription(comment)
        .addFields(
          { name: `메모리 사용량 ${memState}`, value: `RSS: \`${rssMB.toFixed(2)}MB\`\nheapUsed: \`${heapMB.toFixed(2)}MB\``, inline: true },
          { name: `CPU 부하율 ${cpuState}`, value: `1분 평균: \`${load.toFixed(2)}\``, inline: true },
          { name: `실행시간(Uptime) ${upState}`, value: uptime, inline: true },
          { name: "호스트정보", value: hostInfo, inline: false },
          { name: "Node 버전", value: process.version, inline: true }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed], ephemeral: true });
      return;
    }

    // ===== 기존 관리 =====
    if (option === "inactive" || option === "newbie") {
      const 기준날짜 = new Date(
        Date.now() - (option === "inactive" ? 90 : 7) * 24 * 60 * 60 * 1000
      );
      const members = await guild.members.fetch();
      const 추방대상 = [];

      for (const member of members.values()) {
        if (member.user.bot) continue;
        if (member.roles.cache.has(EXCLUDE_ROLE_ID)) continue;

        const lastActive = activity[member.id];

        if (option === "inactive") {
          if (!lastActive || new Date(lastActive) < 기준날짜) {
            추방대상.push(member);
          }
        } else if (option === "newbie") {
          const joinedAt = member.joinedAt;
          const isNewbie = member.roles.cache.has(NEWBIE_ROLE_ID);
          const inactive =
            !lastActive || new Date(lastActive) < joinedAt;
          const daysPassed =
            (Date.now() - joinedAt.getTime()) / (1000 * 60 * 60 * 24);

          if (isNewbie && inactive && daysPassed >= 7) {
            추방대상.push(member);
          }
        }
      }

      const descList = [];
      let totalLength = 0;
      for (const m of 추방대상) {
        const line = `• <@${m.id}> (${m.user.tag})`;
        if (totalLength + line.length + 1 < 4000) {
          descList.push(line);
          totalLength += line.length + 1;
        } else {
          descList.push(`외 ${추방대상.length - descList.length}명...`);
          break;
        }
      }

      const preview = new EmbedBuilder()
        .setTitle(
          `[${option === "inactive" ? "장기 미이용" : "비활동 신규유저"}] 추방 대상 미리보기`
        )
        .setDescription(
          추방대상.length ? descList.join("\n") : "✅ 추방 대상자가 없습니다."
        )
        .setColor(0xffcc00);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("confirm_kick")
          .setLabel("✅ 예")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId("cancel_kick")
          .setLabel("❌ 아니오")
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.editReply({ embeds: [preview], components: [row] });

      const collector = interaction.channel.createMessageComponentCollector({
        filter: (i) => i.user.id === interaction.user.id,
        time: 15000,
      });

      collector.on("collect", async (i) => {
        if (i.customId === "confirm_kick") {
          await i.update({
            content: "⏳ 추방을 진행 중입니다...",
            embeds: [],
            components: [],
          });
          for (const member of 추방대상) {
            try {
              await member.kick("자동 추방: 활동 없음");
            } catch (err) {
              console.error(`❗ ${member.user.tag} 추방 실패: ${err}`);
            }
          }
          await interaction.followUp({
            content: `✅ ${추방대상.length}명의 유저를 추방했습니다.`,
            ephemeral: true,
          });
        } else {
          await i.update({
            content: "❌ 추방이 취소되었습니다.",
            embeds: [],
            components: [],
          });
        }
      });

      collector.on("end", async (collected) => {
        if (collected.size === 0) {
          await interaction.editReply({
            content: "⏰ 시간이 초과되어 추방이 취소되었습니다.",
            embeds: [],
            components: [],
          });
        }
      });
    } else if (option === "user") {
      const target =
        interaction.options.getUser("대상유저") || interaction.user;
      const member = await guild.members.fetch(target.id).catch(() => null);

      if (!member) {
        await interaction.editReply({
          content: "❌ 해당 유저를 찾을 수 없습니다.",
        });
        return;
      }

      const lastActive = activity[target.id];
      const joinedAt = member.joinedAt;
      const lastActiveStr = lastActive
        ? new Date(lastActive).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
        : "기록 없음";
      const joinedAtStr = joinedAt
        ? joinedAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
        : "기록 없음";

      const embed = new EmbedBuilder()
        .setTitle(`유저 정보: ${target.tag}`)
        .setThumbnail(target.displayAvatarURL())
        .addFields(
          { name: "유저 ID", value: target.id, inline: false },
          { name: "서버 입장일", value: joinedAtStr, inline: false },
          { name: "마지막 활동일", value: lastActiveStr, inline: false }
        )
        .setColor(0x00bfff);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("nickname_change")
          .setLabel("별명 변경")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("timeout")
          .setLabel("타임아웃 (1시간)")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("kick")
          .setLabel("추방")
          .setStyle(ButtonStyle.Danger)
      );

      await interaction.editReply({ embeds: [embed], components: [row] });

      const collector = interaction.channel.createMessageComponentCollector({
        filter: (i) => i.user.id === interaction.user.id,
        time: 20000,
      });

      collector.on("collect", async (i) => {
        if (i.customId === "nickname_change") {
          await i.update({
            content: "✏️ 새로운 별명을 입력해주세요.",
            embeds: [],
            components: [],
          });

          const msgCollector = interaction.channel.createMessageCollector({
            filter: (m) => m.author.id === interaction.user.id,
            time: 20000,
            max: 1,
          });

          msgCollector.on("collect", async (msg) => {
            try {
              await member.setNickname(msg.content);
              await interaction.followUp({
                content: `✅ 별명이 **${msg.content}**(으)로 변경되었습니다.`,
                ephemeral: true,
              });
            } catch (err) {
              await interaction.followUp({
                content: "❌ 별명 변경 실패 (권한 문제일 수 있음)",
                ephemeral: true,
              });
            }
          });

          msgCollector.on("end", (collected) => {
            if (collected.size === 0) {
              interaction.followUp({
                content: "⏰ 시간이 초과되어 별명 변경이 취소되었습니다.",
                ephemeral: true,
              });
            }
          });
        } else if (i.customId === "timeout") {
          await i.update({
            content: "⏳ 타임아웃(1시간) 적용 중...",
            embeds: [],
            components: [],
          });
          try {
            await member.timeout(60 * 60 * 1000, "관리 명령어로 타임아웃");
            await interaction.followUp({
              content: `✅ <@${member.id}>님에게 1시간 타임아웃을 적용했습니다.`,
              ephemeral: true,
            });
          } catch (err) {
            await interaction.followUp({
              content: "❌ 타임아웃 실패 (권한 문제일 수 있음)",
              ephemeral: true,
            });
          }
        } else if (i.customId === "kick") {
          await i.update({
            content: "⏳ 유저 추방 중...",
            embeds: [],
            components: [],
          });
          try {
            await member.kick("관리 명령어로 추방");
            await interaction.followUp({
              content: `✅ <@${member.id}>님을 서버에서 추방했습니다.`,
              ephemeral: true,
            });
          } catch (err) {
            await interaction.followUp({
              content: "❌ 추방 실패 (권한 문제일 수 있음)",
              ephemeral: true,
            });
          }
        }
      });

      collector.on("end", (collected) => {});
    }
  },
};
