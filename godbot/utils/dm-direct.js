const {
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelType
} = require("discord.js");

const CONTROL_CHANNEL_ID = "1428962638083133550";
const FALLBACK_CATEGORY_ID = "1354742687022186608";

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
      `안녕하세요. **${guild?.name ?? "서버"}**에서 인사드립니다.\n\n요즘 접속이 뜸하셔서 많이 그리웠습니다. 시간 되실 때 다시 오셔서 함께 즐겨 주시면 좋겠습니다.\n어려움이나 불편하신 점이 있으시면 언제든 /민원, /신고 기능을 이용해주세요. 언제든 기다리고 있겠습니다.`,
    color: 0xffcc00
  },
  ticket_ok: {
    title: "민원/신고 접수 완료",
    desc: () =>
      "안녕하세요.\n\n회원님께서 접수하신 **민원/신고**가 관리진에게 정상적으로 전달되었습니다.\n사안에 따라 **심의 및 처리에 시간이 소요**될 수 있습니다. 진행 상황은 내부 절차에 따라 검토 후 안내드리겠습니다.",
    color: 0x34c759
  },
  thanks: {
    title: "서버 이용에 대한 감사 인사",
    desc: (guild) =>
      `안녕하세요.\n\n항상 **${guild?.name ?? "서버"}**를 이용해 주시고, 다른 유저분들과 친화적으로 지내 주심에 진심으로 감사드립니다.\n앞으로도 즐거운 활동을 하실 수 있도록 최선을 다하겠습니다. 고맙습니다.`,
    color: 0x9b59b6
  },
  caution: {
    title: "음성채널 입퇴장시 인사 안내",
    desc: () =>
      "안녕하세요.\n\n본 서버는 예의를 중시합니다. 음성채널 입퇴장시 꼭 인사를 진행해주세요.\n앞으로도 즐거운 서버 활동을 하실 수 있도록 최선을 다하겠습니다. 감사합니다.",
    color: 0xff3b30
  },
  removed: {
    title: "채팅 내용 제거 안내",
    desc: () =>
      "안녕하세요.\n\n최근 회원님이 작성하신 일부 채팅이 **서버 운영 방침**에 따라 제거되었습니다.\n이용 시 **서버 규칙에 위배되지 않도록** 유의 부탁드립니다.",
    color: 0xed7014
  }
};

function parseIdsAndMentions(msg) {
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

function buildCancelRow(ownerKey) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`dm:cancel:${ownerKey}`).setLabel("취소").setStyle(ButtonStyle.Secondary)
  );
}

function buildButtons(targetId, ownerKey) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`dm:greet:${targetId}:${ownerKey}`).setLabel("첫 인사 요청").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`dm:return:${targetId}:${ownerKey}`).setLabel("복귀 요청").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`dm:ticket_ok:${targetId}:${ownerKey}`).setLabel("민원/신고 접수 완료 안내").setStyle(ButtonStyle.Success)
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`dm:thanks:${targetId}:${ownerKey}`).setLabel("감사 인사").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`dm:caution:${targetId}:${ownerKey}`).setLabel("음성채널 인사 요청").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`dm:removed:${targetId}:${ownerKey}`).setLabel("채팅 내용 제거 안내").setStyle(ButtonStyle.Danger)
  );
  const row3 = buildCancelRow(ownerKey);
  return [row1, row2, row3];
}

async function ensureFallbackChannel(guild, targetId) {
  const name = `dm-${targetId}`;
  let channel = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && c.parentId === FALLBACK_CATEGORY_ID && (c.name === name || c.name.startsWith(name))
  );
  if (!channel) {
    channel = await guild.channels.create({
      name,
      type: ChannelType.GuildText,
      parent: FALLBACK_CATEGORY_ID,
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: targetId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        {
          id: guild.members?.me?.id ?? guild.client?.user?.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.AttachFiles
          ]
        }
      ]
    }).catch(() => null);
  } else {
    await channel.permissionOverwrites.edit(guild.id, { ViewChannel: false }).catch(() => {});
    await channel.permissionOverwrites.edit(targetId, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true
    }).catch(() => {});
    if (guild.members?.me?.id) {
      await channel.permissionOverwrites
        .edit(guild.members.me.id, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
          EmbedLinks: true,
          AttachFiles: true
        })
        .catch(() => {});
    }
  }
  return channel;
}

async function sendDmOrFallback(client, guild, targetId, kind) {
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

  let dmChannel = await user.createDM().catch(() => null);
  if (dmChannel) {
    const sent = await dmChannel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => null);
    if (sent) return { ok: true, via: "dm", channelId: dmChannel.id };
  }

  const fb = await ensureFallbackChannel(guild, targetId);
  if (!fb) throw new Error("DM_AND_FALLBACK_FAIL");
  const sent2 = await fb.send({ content: `<@${targetId}>`, embeds: [embed], allowedMentions: { users: [targetId] } }).catch(() => null);
  if (!sent2) throw new Error("DM_AND_FALLBACK_FAIL");
  return { ok: true, via: "fallback", channelId: fb.id, guildChannelId: fb.id };
}

function buildLogEmbed({ kind, targetId, actorId, ok, reason, destText }) {
  const base = new EmbedBuilder()
    .setTitle("DM 처리 로그")
    .setDescription(`유형: **${DM_TYPES[kind]?.title ?? "취소/기타"}**`)
    .addFields(
      { name: "대상", value: targetId ? `<@${targetId}> (${targetId})` : "-", inline: true },
      { name: "처리자", value: `<@${actorId}> (${actorId})`, inline: true },
      { name: "결과", value: ok ? "전송 완료" : `실패/취소\n${reason || ""}`, inline: true }
    )
    .setColor(ok ? 0x2ecc71 : 0xe74c3c)
    .setTimestamp(new Date());
  if (destText) base.addFields({ name: "전달", value: destText, inline: false });
  return base;
}

function buildSearchEmbed(nick, results) {
  const e = new EmbedBuilder()
    .setTitle("대상자 선택")
    .setDescription(`닉네임 검색 결과: **${nick}**`)
    .setTimestamp(new Date());
  if (!results?.length) e.addFields({ name: "결과", value: "일치하는 유저가 없습니다." });
  return e;
}

function buildSearchSelect(authorId, key, members) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`dm:pick:${authorId}:${key}`)
    .setPlaceholder("대상자를 선택하세요")
    .addOptions(
      members.slice(0, 25).map((m) => ({
        label: (m.nickname || m.user.globalName || m.user.username || m.user.tag).slice(0, 100),
        description: m.user.tag.slice(0, 100),
        value: m.id
      }))
    );
  return new ActionRowBuilder().addComponents(menu);
}

async function resolveByNickname(guild, text) {
  const nick = text.trim();
  if (!nick) return [];
  const found = await guild.members.search({ query: nick.slice(0, 100), limit: 10 }).catch(() => null);
  if (!found) return [];
  return Array.from(found.values());
}

module.exports = (client) => {
  client.on("messageCreate", async (msg) => {
    try {
      if (!msg.guild) return;
      if (msg.author?.bot) return;
      if (msg.channelId !== CONTROL_CHANNEL_ID) return;
      const hasManage = msg.member?.permissions?.has(PermissionFlagsBits.ManageGuild);
      if (!hasManage) return;

      let targets = parseIdsAndMentions(msg).slice(0, 10);

      if (!targets.length) {
        const text = msg.content.replace(/\s+/g, " ").trim();
        if (!text) return;
        const matches = await resolveByNickname(msg.guild, text);

        if (matches.length === 0) {
          const logFail = buildLogEmbed({
            kind: "greet",
            targetId: null,
            actorId: msg.author.id,
            ok: false,
            reason: "대상자 검색 실패"
          });
          await msg.reply({ embeds: [logFail], allowedMentions: { parse: [] } });
          return;
        }

        const ownerKey = `${msg.author.id}:${Date.now()}`;
        if (matches.length === 1) {
          const uid = matches[0].id;
          const embed = buildChoiceEmbed(uid);
          const components = buildButtons(uid, ownerKey);
          await msg.reply({
            embeds: [embed],
            components,
            allowedMentions: { parse: [], users: [], roles: [], repliedUser: false }
          });
          return;
        } else {
          const embed = buildSearchEmbed(text, matches);
          const select = buildSearchSelect(msg.author.id, ownerKey, matches);
          const cancel = buildCancelRow(ownerKey);
          await msg.reply({
            embeds: [embed],
            components: [select, cancel],
            allowedMentions: { parse: [], users: [], roles: [], repliedUser: false }
          });
          return;
        }
      }

      for (const uid of targets) {
        const ownerKey = `${msg.author.id}:${Date.now()}:${uid}`;
        const embed = buildChoiceEmbed(uid);
        const components = buildButtons(uid, ownerKey);
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
      if (!i.guild) return;
      if (i.channelId !== CONTROL_CHANNEL_ID) return;

      if (i.isStringSelectMenu()) {
        const [ns, act, ownerId, key] = String(i.customId).split(":");
        if (ns !== "dm" || act !== "pick") return;
        if (i.user.id !== ownerId) {
          await i.reply({ content: "요청자만 선택할 수 있어.", ephemeral: true }).catch(() => {});
          return;
        }
        const uid = i.values?.[0];
        if (!/^\d{17,20}$/.test(uid)) return;
        const embed = buildChoiceEmbed(uid);
        const rows = buildButtons(uid, `${ownerId}:${key}`);
        await i.update({ embeds: [embed], components: rows, allowedMentions: { parse: [] } }).catch(() => {});
        return;
      }

      if (i.isButton()) {
        const parts = String(i.customId).split(":");
        if (parts[0] !== "dm") return;

        if (parts[1] === "cancel") {
          const ownerKey = parts[2] || "";
          const ownerId = ownerKey.split(":")[0];
          if (i.user.id !== ownerId) {
            await i.reply({ content: "요청자만 취소할 수 있어.", ephemeral: true }).catch(() => {});
            return;
          }
          const log = buildLogEmbed({
            kind: "cancel",
            targetId: null,
            actorId: i.user.id,
            ok: false,
            reason: "요청 취소됨"
          });
          if (i.deferred || i.replied) {
            await i.editReply({ embeds: [log], components: [] }).catch(async () => {
              await i.message.edit({ embeds: [log], components: [], allowedMentions: { parse: [] } }).catch(() => {});
            });
          } else {
            await i.update({ embeds: [log], components: [], allowedMentions: { parse: [] } }).catch(async () => {
              await i.reply({ embeds: [log], ephemeral: true }).catch(() => {});
            });
          }
          return;
        }

        const [ns, kind, targetId, ownerKey] = parts;
        if (!DM_TYPES[kind]) return;
        if (!/^\d{17,20}$/.test(targetId)) return;
        const ownerId = (ownerKey || "").split(":")[0] || "";
        const hasManage = i.member?.permissions?.has(PermissionFlagsBits.ManageGuild);
        if (!hasManage) {
          await i.reply({ content: "권한이 없습니다.", ephemeral: true }).catch(() => {});
          return;
        }
        if (ownerId && i.user.id !== ownerId) {
          await i.reply({ content: "요청자만 처리할 수 있어.", ephemeral: true }).catch(() => {});
          return;
        }

        await i.deferReply({ ephemeral: true }).catch(() => {});
        try {
          const result = await sendDmOrFallback(i.client, i.guild, targetId, kind);
          const destText = result.via === "dm" ? "DM" : `<#${result.channelId}>`;
          const logOk = buildLogEmbed({ kind, targetId, actorId: i.user.id, ok: true, destText });
          await i.editReply({
            embeds: [
              new EmbedBuilder()
                .setDescription(result.via === "dm" ? "DM 전송이 완료되었어." : `DM이 막혀 있어서 <#${result.channelId}> 채널로 대신 전달했어.`)
                .setColor(0x2ecc71)
            ]
          }).catch(() => {});
          await i.message.edit({ embeds: [logOk], components: [], allowedMentions: { parse: [] } }).catch(() => {});
        } catch (err) {
          let reason = "알 수 없는 오류";
          if (String(err?.message) === "USER_NOT_FOUND") reason = "대상 사용자를 찾을 수 없음";
          if (String(err?.message) === "DM_AND_FALLBACK_FAIL") reason = "DM 차단/닫힘이며 대체 채널 생성에도 실패";
          const logFail = buildLogEmbed({ kind, targetId, actorId: i.user.id, ok: false, reason });
          await i.editReply({
            embeds: [new EmbedBuilder().setDescription("DM 전송 실패").setColor(0xe74c3c)]
          }).catch(() => {});
          await i.message.edit({ embeds: [logFail], components: [], allowedMentions: { parse: [] } }).catch(() => {});
        }
      }
    } catch {}
  });
};
