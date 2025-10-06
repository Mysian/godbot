// utils/personal-channel.js
const {
  ChannelType,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require("discord.js");

const TRIGGER_CHANNEL_ID = "1393144927155785759";
const CHAT_CATEGORY_ID = "1318445879455125514";
const VOICE_CATEGORY_ID = "1318529703480397954";
const VOICE_REQUIRED_ROLE_IDS = ["1352582997400092755", "1352581645714329620"];

function displayNameOf(member) {
  if (!member) return "유저";
  return member.displayName || member.user?.globalName || member.user?.username || "유저";
}

function textOverwrites(guild, userId) {
  return [
    {
      id: guild.roles.everyone.id,
      deny: [
        PermissionFlagsBits.ViewChannel,
      ],
    },
    {
      id: userId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageRoles,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.ManageThreads,
        PermissionFlagsBits.ManageWebhooks,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.SendTTSMessages,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AddReactions,
        PermissionFlagsBits.UseExternalEmojis,
        PermissionFlagsBits.UseExternalStickers,
        PermissionFlagsBits.MentionEveryone,
        PermissionFlagsBits.CreatePublicThreads,
        PermissionFlagsBits.CreatePrivateThreads,
        PermissionFlagsBits.SendMessagesInThreads,
        PermissionFlagsBits.UseApplicationCommands,
        PermissionFlagsBits.SendPolls,
        PermissionFlagsBits.CreateInstantInvite,
      ],
    },
  ];
}

function voiceOverwrites(guild, userId) {
  return [
    {
      id: guild.roles.everyone.id,
      deny: [
        PermissionFlagsBits.ViewChannel,
      ],
    },
    {
      id: userId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageRoles,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.Speak,
        PermissionFlagsBits.Stream,
        PermissionFlagsBits.PrioritySpeaker,
        PermissionFlagsBits.UseVAD,
        PermissionFlagsBits.MuteMembers,
        PermissionFlagsBits.DeafenMembers,
        PermissionFlagsBits.MoveMembers,
        PermissionFlagsBits.ManageWebhooks,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.SendTTSMessages,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AddReactions,
        PermissionFlagsBits.UseExternalEmojis,
        PermissionFlagsBits.UseExternalStickers,
        PermissionFlagsBits.MentionEveryone,
        PermissionFlagsBits.CreatePublicThreads,
        PermissionFlagsBits.CreatePrivateThreads,
        PermissionFlagsBits.SendMessagesInThreads,
        PermissionFlagsBits.ManageThreads,
        PermissionFlagsBits.UseApplicationCommands,
        PermissionFlagsBits.SendPolls,
        PermissionFlagsBits.CreateInstantInvite,
        PermissionFlagsBits.ManageEvents,
        PermissionFlagsBits.UseEmbeddedActivities,
        PermissionFlagsBits.SendVoiceMessages,
      ],
    },
  ];
}

async function createTextChannel(guild, member) {
  const name = `${displayNameOf(member)}님의 개인채팅채널`;
  const parent = guild.channels.cache.get(CHAT_CATEGORY_ID) || CHAT_CATEGORY_ID;
  const ch = await guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent,
    permissionOverwrites: textOverwrites(guild, member.id),
    reason: "개인채팅채널 자동 개설",
  });
  const nick = displayNameOf(member);
  await ch.send({ content: `@${nick} (<@${member.id}>) 님의 채널 생성이 완료되었습니다.` }).catch(() => null);
  return ch;
}

async function createVoiceChannel(guild, member) {
  const name = `${displayNameOf(member)}님의 개인음성채널`;
  const parent = guild.channels.cache.get(VOICE_CATEGORY_ID) || VOICE_CATEGORY_ID;
  const ch = await guild.channels.create({
    name,
    type: ChannelType.GuildVoice,
    parent,
    permissionOverwrites: voiceOverwrites(guild, member.id),
    reason: "개인음성채널 자동 개설",
  });
  const nick = displayNameOf(member);
  await ch.send({ content: `@${nick} (<@${member.id}>) 님의 채널 생성이 완료되었습니다.` }).catch(() => null);
  return ch;
}

async function hasAllRequiredRoles(member) {
  return VOICE_REQUIRED_ROLE_IDS.every((id) => member.roles.cache.has(id));
}

async function removeRequiredRoles(member) {
  const toRemove = VOICE_REQUIRED_ROLE_IDS.filter((id) => member.roles.cache.has(id));
  if (toRemove.length) await member.roles.remove(toRemove, "개인음성채널 개설 시 필수 역할 해제");
}

module.exports = function setupPersonalChannelUtility(client) {
  if (!client || !client.on) throw new Error("Discord client is required");

  client.on("messageCreate", async (message) => {
    try {
      if (message.author.bot) return;
      if (message.channelId !== TRIGGER_CHANNEL_ID) return;
      const target = message.mentions.users.first();
      if (!target) return;

      const embed = new EmbedBuilder()
        .setTitle("개인 채널 생성")
        .setDescription(`대상: <@${target.id}>\n개설 유형을 선택하세요.`)
        .setColor(0x5865f2);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`pc_text:${target.id}:${message.author.id}:${message.id}`)
          .setLabel("개인채팅채널 만들기")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`pc_voice:${target.id}:${message.author.id}:${message.id}`)
          .setLabel("개인음성채널 만들기")
          .setStyle(ButtonStyle.Success)
      );

      await message.reply({ embeds: [embed], components: [row] });
    } catch {}
  });

  client.on("interactionCreate", async (interaction) => {
    try {
      if (!interaction.isButton()) return;
      if (!interaction.customId.startsWith("pc_")) return;

      const [prefix, targetId, authorId, triggerMsgId] = interaction.customId.split(":");
      if (!targetId || !authorId || !triggerMsgId) return;

      if (interaction.user.id !== authorId) {
        return interaction.reply({
          content: "이 버튼은 해당 트리거 메시지 작성자만 사용할 수 있어요.",
          ephemeral: true,
        });
      }

      const guild = interaction.guild;
      if (!guild) return;

      const targetMember = await guild.members.fetch(targetId).catch(() => null);
      if (!targetMember) {
        return interaction.reply({ content: "대상 유저를 찾을 수 없어요.", ephemeral: true });
      }

      if (prefix === "pc_text") {
        await interaction.deferReply({ ephemeral: true });
        const ch = await createTextChannel(guild, targetMember);
        await interaction.editReply({ content: `개인채팅채널 생성 완료: <#${ch.id}>` });
        const toDelete = [];
        if (interaction.message?.deletable) toDelete.push(interaction.message.delete().catch(() => null));
        if (interaction.channel) toDelete.push(interaction.channel.messages.delete(triggerMsgId).catch(() => null));
        await Promise.allSettled(toDelete);
      } else if (prefix === "pc_voice") {
        const ok = await hasAllRequiredRoles(targetMember);
        if (!ok) {
          await interaction.reply({
            content: "대상 유저가 필수 역할을 모두 보유하고 있지 않아 개인음성채널을 만들 수 없습니다.",
            ephemeral: true,
          });
          const toDelete = [];
          if (interaction.message?.deletable) toDelete.push(interaction.message.delete().catch(() => null));
          if (interaction.channel) toDelete.push(interaction.channel.messages.delete(triggerMsgId).catch(() => null));
          await Promise.allSettled(toDelete);
          return;
        }
        await interaction.deferReply({ ephemeral: true });
        const ch = await createVoiceChannel(guild, targetMember);
        await removeRequiredRoles(targetMember).catch(() => null);
        await interaction.editReply({ content: `개인음성채널 생성 완료: <#${ch.id}> (필수 역할 해제됨)` });
        const toDelete = [];
        if (interaction.message?.deletable) toDelete.push(interaction.message.delete().catch(() => null));
        if (interaction.channel) toDelete.push(interaction.channel.messages.delete(triggerMsgId).catch(() => null));
        await Promise.allSettled(toDelete);
      }
    } catch {}
  });
};
