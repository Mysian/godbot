const { PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

const CONTROL_CHANNEL_ID = "1428962638083133550";

const DM_TYPES = {
  greet: {
    title: "첫 인사 안내",
    desc: (guild) =>
      "안녕하세요.\n\n본 서버는 예의를 중시하며, 유저분들과의 원활한 소통을 위해 **첫 인사**를 기본으로 하고 있습니다.\n아래 링크에서 첫 인사를 남겨주세요.\n\n채널 링크: https://discord.com/channels/785841387396005948/1202425624061415464\n\n첫 인사가 진행되지 않으면 **경험치 지급이 제한**되거나, 추후 **이용에 불이익**이 발생할 수 있습니다.\n협조 부탁드립니다.",
    color: 0x5ac8fa
  },
  return: {
    title: "복귀 요청 안내",
    desc: (guild) =>
      `안녕하세요. **${guild?.name ?? "서버"}**에서 인사드립니다.\n\n요즘 접속이 뜸하셔서 많이 그리웠습니다. 시간 되실 때 다시 오셔서 함께 즐겨 주시면 좋겠습니다.\n어려움이나 불편하신 점이 있으시면 언제든 관리진에게 말씀해 주세요. 기다리고 있겠습니다.`,
    color: 0xffcc00
  },
  ticket_ok: {
    title: "민원/신고 접수 완료",
    desc: () =>
      "안녕하세요.\n\n회원님께서 접수하신 **민원/신고**가 관리진에게 정상적으로 전달되었습니다.\n사안에 따라 **심의 및 처리에 시간이 소요**될 수 있습니다. 진행 상황은 내부 절차에 따라 검토 후 안내드리겠습니다.\n추가로 전달하실 내용이 있으시면 이 DM에 회신해 주세요.",
    color: 0x34c759
  },
  thanks: {
    title: "감사의 말씀",
    desc: (guild) =>
      `안녕하세요.\n\n항상 **${guild?.name ?? "서버"}**를 이용해 주시고, 다른 유저분들과 친화적으로 지내 주심에 진심으로 감사드립니다.\n앞으로도 즐거운 활동을 하실 수 있도록 최선을 다하겠습니다. 고맙습니다.`,
    color: 0x9b59b6
  },
  caution: {
    title: "이용 주의 안내",
    desc: () =>
      "안녕하세요.\n\n서버 이용과 관련하여 몇 가지 **주의 사항**을 안내드립니다.\n- 유저 간 **예의 준수**\n- **게임 매너** 유지\n- 게임과 무관한 **과도한 외부 이슈/논쟁성 주제 자제**\n\n보다 쾌적한 커뮤니티 유지를 위해 협조 부탁드립니다.",
    color: 0xff3b30
  },
  removed: {
    title: "채팅 내용 제거 안내",
    desc: () =>
      "안녕하세요.\n\n최근 회원님이 작성하신 일부 채팅이 **서버 운영 방침**에 따라 제거되었습니다.\n이용 시 **서버 규칙에 위배되지 않도록** 유의 부탁드립니다.\n해당 조치에 대해 궁금하신 점이 있으시면 관리진에게 문의해 주세요.",
    color: 0xed7014
  }
};

function parseTargetsFromMessage(msg) {
  const set = new Set();
  for (const u of msg.mentions.users.values()) set.add(u.id);
  const ids = msg.content.match(/\b\d{17,20}\b/g) || [];
  for (const id of ids) set.add(id);
  return Array.from(set);
}

function buildChoiceEmbed(targetId) {
  return new EmbedBuilder()
    .setTitle("DM 전송 유형 선택")
    .setDescription("아래 버튼 중 전송할 **DM 유형**을 선택해 주세요.\n모든 메시지는 **임베드** 형태로, **존댓말**로 전송됩니다.")
    .addFields({ name: "대상", value: `<@${targetId}> (${targetId})` })
    .setTimestamp(new Date());
}

function buildButtons(targetId) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`dm:greet:${targetId}`).setLabel("인사 요청").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`dm:return:${targetId}`).setLabel("복귀 요청").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`dm:ticket_ok:${targetId}`).setLabel("민원/신고 접수 완료 안내").setStyle(ButtonStyle.Success)
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`dm:thanks:${targetId}`).setLabel("감사 인사").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`dm:caution:${targetId}`).setLabel("주의 경고").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`dm:removed:${targetId}`).setLabel("채팅 내용 제거 안내").setStyle(ButtonStyle.Danger)
  );
  return [row1, row2];
}

async function sendDm(client, guild, targetId, kind) {
  const t = DM_TYPES[kind];
  if (!t) throw new Error("INVALID_KIND");
  const user = await client.users.fetch(targetId).catch(() => null);
  if (!user) throw new Error("USER_NOT_FOUND");
  const embed = new EmbedBuilder()
    .setTitle(t.title)
    .setDescription(t.desc(guild))
    .setColor(t.color)
    .setFooter({ text: guild?.name ? `${guild.name} 운영진` : "서버 운영진" })
    .setTimestamp(new Date());
  const dm = await user.createDM().catch(() => null);
  if (!dm) throw new Error("DM_OPEN_FAIL");
  await dm.send({ embeds: [embed], allowedMentions: { parse: [] } });
  return true;
}

module.exports = (client) => {
  client.on("messageCreate", async (msg) => {
    try {
      if (!msg.guild) return;
      if (msg.author?.bot) return;
      if (msg.channelId !== CONTROL_CHANNEL_ID) return;
      const hasManage = msg.member?.permissions?.has(PermissionFlagsBits.ManageGuild);
      if (!hasManage) return;
      let targets = parseTargetsFromMessage(msg).slice(0, 10);
      if (!targets.length) return;
      for (const uid of targets) {
        const embed = buildChoiceEmbed(uid);
        const components = buildButtons(uid);
        await msg.reply({
          embeds: [embed],
          components,
          allowedMentions: { parse: [], users: [], roles: [], repliedUser: false }
        });
      }
    } catch {}
  });

  client.on("interactionCreate", async (i) => {
    try {
      if (!i.isButton()) return;
      if (!i.guild) return;
      if (i.channelId !== CONTROL_CHANNEL_ID) return;
      if (i.user?.bot) {
        await i.deferUpdate().catch(() => {});
        return;
      }
      const hasManage = i.member?.permissions?.has(PermissionFlagsBits.ManageGuild);
      if (!hasManage) {
        await i.reply({ content: "권한이 없습니다.", ephemeral: true }).catch(() => {});
        return;
      }
      const [ns, kind, targetId] = String(i.customId).split(":");
      if (ns !== "dm" || !DM_TYPES[kind] || !/^\d{17,20}$/.test(targetId)) return;
      await i.deferReply({ ephemeral: true }).catch(() => {});
      try {
        await sendDm(i.client, i.guild, targetId, kind);
        const done = new EmbedBuilder()
          .setTitle("DM 전송 완료")
          .setDescription(`다음 유형의 DM이 전송되었습니다: **${DM_TYPES[kind].title}**`)
          .addFields({ name: "대상", value: `<@${targetId}> (${targetId})` })
          .setColor(0x2ecc71)
          .setTimestamp(new Date());
        await i.editReply({ embeds: [done] }).catch(() => {});
        try {
          await i.message.edit({ components: [] }).catch(() => {});
        } catch {}
      } catch (err) {
        let reason = "알 수 없는 오류로 전송에 실패했습니다.";
        if (String(err?.message) === "USER_NOT_FOUND") reason = "대상 사용자를 찾을 수 없습니다.";
        if (String(err?.message) === "DM_OPEN_FAIL") reason = "상대방의 DM이 닫혀 있어 전송할 수 없습니다.";
        const fail = new EmbedBuilder()
          .setTitle("DM 전송 실패")
          .setDescription(reason)
          .addFields({ name: "대상", value: `<@${targetId}> (${targetId})` })
          .setColor(0xe74c3c)
          .setTimestamp(new Date());
        await i.editReply({ embeds: [fail] }).catch(() => {});
      }
    } catch {}
  });
};
