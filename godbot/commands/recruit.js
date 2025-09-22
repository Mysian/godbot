// commands/recruit.js
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

const 모집채널ID = "1209147973255036959";
const CHECK_EMOJI = "✅";

function parseVoiceIdFromField(fields) {
  const v = fields.find(f => f.name === "음성 채널")?.value || "";
  const m = v.match(/<#(\d+)>/);
  return m ? m[1] : null;
}

function getField(fields, name) {
  return fields.find(f => f.name === name);
}

function setField(embed, name, value, inline = false) {
  const fields = embed.data.fields || [];
  const idx = fields.findIndex(f => f.name === name);
  if (idx >= 0) {
    fields[idx] = { name, value, inline };
    embed.setFields(fields);
  } else {
    embed.addFields({ name, value, inline });
  }
}

function listMentions(ids) {
  if (!ids.size) return "없음";
  return Array.from(ids).map(id => `<@${id}>`).join("\n");
}

function closeEmbed(embed) {
  const prev = embed.data.description || "";
  embed.setDescription(`[모집 종료]\n~~${prev}~~`);
  const fields = (embed.data.fields || []).map(f => f.name === "마감까지" ? { name: "마감까지", value: "마감 종료", inline: true } : f);
  embed.setFields(fields);
  embed.setColor(0x8a8a8a);
  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("모집")
    .setDescription("모집 글 작성/수정/종료")
    .addSubcommand(sc =>
      sc
        .setName("작성")
        .setDescription("모집 글을 작성해요.")
        .addStringOption(o =>
          o.setName("내용").setDescription("모집 내용을 입력하세요.").setRequired(true)
        )
        .addIntegerOption(o =>
          o.setName("모집인원").setDescription("모집 인원 (1~9)").setRequired(true).setMinValue(1).setMaxValue(9)
        )
        .addStringOption(o =>
          o
            .setName("음성채널")
            .setDescription("모집할 음성 채널")
            .addChoices(
              { name: "🎙️ 101호", value: "1222085152600096778" },
              { name: "🎙️ 102호", value: "1222085194706587730" },
              { name: "🎙️ 201호", value: "1230536383941050368" },
              { name: "🎙️ 202호", value: "1230536435526926356" },
              { name: "🎙️ 301호", value: "1207990601002389564" },
              { name: "🎙️ 302호", value: "1209157046432170015" },
              { name: "🎙️ 401호", value: "1209157237977911336" },
              { name: "🎙️ 402호", value: "1209157289555140658" },
              { name: "🎙️ 501호", value: "1209157326469210172" },
              { name: "🎙️ 502호", value: "1209157352771682304" },
              { name: "🎙️ 601호", value: "1209157451895672883" },
              { name: "🎙️ 602호", value: "1209157492207255572" },
              { name: "🎙️ 701호", value: "1209157524243091466" },
              { name: "🎙️ 702호", value: "1209157622662561813" }
            )
        )
        .addRoleOption(o =>
          o.setName("mention_role").setDescription("알림으로 멘션할 역할 (@here/@everyone 금지)")
        )
        .addIntegerOption(o =>
          o.setName("마감시간").setDescription("유지 시간(시간 단위, 1~24)").setMinValue(1).setMaxValue(24)
        )
    )
    .addSubcommand(sc =>
      sc
        .setName("수정")
        .setDescription("기존 모집 글을 수정해요.")
        .addStringOption(o =>
          o.setName("메시지id").setDescription("수정할 모집글 메시지 ID").setRequired(true)
        )
        .addStringOption(o =>
          o.setName("내용").setDescription("새 모집 내용").setRequired(true)
        )
        .addIntegerOption(o =>
          o.setName("모집인원").setDescription("새 모집 인원")
        )
    )
    .addSubcommand(sc =>
      sc
        .setName("종료")
        .setDescription("모집 글을 강제 마감해요.")
        .addStringOption(o =>
          o.setName("메시지id").setDescription("마감할 모집글 메시지 ID").setRequired(true)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === "작성") {
      const content = interaction.options.getString("내용");
      const count = interaction.options.getInteger("모집인원");
      const voiceId = interaction.options.getString("음성채널");
      const mentionRole = interaction.options.getRole("mention_role");
      let closeHour = interaction.options.getInteger("마감시간") ?? 1;
      if (closeHour < 1) closeHour = 1;
      if (closeHour > 24) closeHour = 24;
      if (mentionRole && (mentionRole.name === "@everyone" || mentionRole.name === "@here")) {
        return await interaction.reply({ content: "❌ @everyone, @here 역할은 사용할 수 없어요.", ephemeral: true });
      }
      const 모집채널 = await interaction.guild.channels.fetch(모집채널ID);
      if (!모집채널 || !모집채널.isTextBased()) {
        return await interaction.reply({ content: "❌ 모집 전용 채널을 찾을 수 없어요.", ephemeral: true });
      }
      const recruiterId = interaction.user.id;
      const startedAt = Date.now();
      const closeMs = closeHour * 60 * 60 * 1000;
      const closeAt = startedAt + closeMs;
      const closeTimestamp = Math.floor(closeAt / 1000);
      const embed = new EmbedBuilder()
        .setTitle("📢 모집 글")
        .setDescription(content)
        .addFields(
          { name: "모집 인원", value: `${count}명`, inline: true },
          ...(voiceId ? [{ name: "음성 채널", value: `<#${voiceId}>`, inline: true }] : []),
          { name: "모집자", value: `<@${recruiterId}>`, inline: true },
          { name: "마감까지", value: `<t:${closeTimestamp}:R>`, inline: true },
          { name: "참여자", value: "없음", inline: false }
        )
        .setColor(0x57c3ff)
        .setTimestamp();

      const msgOptions = { embeds: [embed] };
      if (mentionRole) msgOptions.content = `${mentionRole}`;
      const msg = await 모집채널.send(msgOptions);
      try { await msg.react(CHECK_EMOJI); } catch {}

      const participants = new Set();
      let closed = false;

      const updateParticipantsField = async () => {
        setField(embed, "참여자", listMentions(participants), false);
        await msg.edit({ embeds: [embed] });
      };

      const closeNow = async () => {
        if (closed) return;
        closed = true;
        closeEmbed(embed);
        try { await msg.reactions.removeAll(); } catch {}
        await msg.edit({ embeds: [embed] });
      };

      const postParticipationNotice = async (userId) => {
        if (voiceId) {
          try {
            const ch = await interaction.guild.channels.fetch(voiceId);
            if (ch && ch.isTextBased()) {
              await ch.send(`-# <@${userId}> 님께서 참여 의사를 밝혔습니다.`);
            }
          } catch {}
          return;
        }
        try {
          const member = await interaction.guild.members.fetch(recruiterId);
          const vc = member?.voice?.channel;
          if (!vc) return;
          if (vc.members?.size <= 0) return;
          const ch = await interaction.guild.channels.fetch(vc.id);
          if (ch && ch.isTextBased()) {
            await ch.send(`-# <@${userId}> 님께서 참여 의사를 밝혔습니다.`);
          }
        } catch {}
      };

      const filter = (reaction, user) => reaction.emoji.name === "✅" && !user.bot;
      const collector = msg.createReactionCollector({ filter, time: closeMs });

      collector.on("collect", async (reaction, user) => {
        if (closed) {
          try { await reaction.users.remove(user.id); } catch {}
          return;
        }
        if (participants.has(user.id)) return;
        if (participants.size >= count) {
          try { await reaction.users.remove(user.id); } catch {}
          return;
        }
        participants.add(user.id);
        await updateParticipantsField();
        await postParticipationNotice(user.id);
        if (participants.size >= count) {
          closeNow();
        }
      });

      collector.on("end", async () => {
        await closeNow();
      });

      setTimeout(async () => {
        await closeNow();
      }, closeMs);

      return await interaction.reply({ content: "✅ 모집 글을 게시했어요!", ephemeral: true });
    }

    if (sub === "수정") {
      const msgId = interaction.options.getString("메시지id");
      const newContent = interaction.options.getString("내용");
      const newCount = interaction.options.getInteger("모집인원");
      const 모집채널 = await interaction.guild.channels.fetch(모집채널ID);
      try {
        const msg = await 모집채널.messages.fetch(msgId);
        if (!msg) throw new Error();
        const embed = EmbedBuilder.from(msg.embeds[0]);
        if (!embed) throw new Error();
        const recruiterId = getField(embed.data.fields || [], "모집자")?.value?.replace(/[<@>]/g, "");
        if (recruiterId && recruiterId !== interaction.user.id) {
          return await interaction.reply({ content: "❌ 모집글 작성자만 수정할 수 있어요.", ephemeral: true });
        }
        embed.setDescription(newContent);
        if (typeof newCount === "number" && Number.isInteger(newCount) && newCount >= 1 && newCount <= 9) {
          setField(embed, "모집 인원", `${newCount}명`, true);
        }
        await msg.edit({ embeds: [embed] });
        return await interaction.reply({ content: "✅ 모집 글을 수정했어요!", ephemeral: true });
      } catch {
        return await interaction.reply({ content: "❌ 모집글을 찾을 수 없어요. 메시지 ID를 확인해 주세요.", ephemeral: true });
      }
    }

    if (sub === "종료") {
      const msgId = interaction.options.getString("메시지id");
      const 모집채널 = await interaction.guild.channels.fetch(모집채널ID);
      try {
        const msg = await 모집채널.messages.fetch(msgId);
        if (!msg) throw new Error();
        const embed = EmbedBuilder.from(msg.embeds[0]);
        if (!embed) throw new Error();
        const recruiterId = getField(embed.data.fields || [], "모집자")?.value?.replace(/[<@>]/g, "");
        if (recruiterId && recruiterId !== interaction.user.id) {
          return await interaction.reply({ content: "❌ 모집글 작성자만 종료할 수 있어요.", ephemeral: true });
        }
        closeEmbed(embed);
        try { await msg.reactions.removeAll(); } catch {}
        await msg.edit({ embeds: [embed] });
        return await interaction.reply({ content: "✅ 모집 글을 마감했어요!", ephemeral: true });
      } catch {
        return await interaction.reply({ content: "❌ 모집글을 찾을 수 없어요. 메시지 ID를 확인해 주세요.", ephemeral: true });
      }
    }
  }
};
