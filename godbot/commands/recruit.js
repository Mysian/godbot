// commands/recruit.js
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
} = require("discord.js");

// 필수 설정
const 모집채널ID = "1209147973255036959";
const ADMIN_ROLE_IDS = ["786128824365482025", "1201856430580432906"];
const ADMIN_USER_IDS = ["285645561582059520"];

// 게임 배너(하단 큰 이미지). 필요시 계속 추가.
const GAME_BANNERS = {
  // "배틀그라운드": "https://...",
  // "발로란트": "https://...",
};
const DEFAULT_BANNER = "https://cdn.discordapp.com/attachments/1388728993787940914/1389194104424108223/2D.png";

// select-game.js 의 ALL_GAMES 를 가져와서 동일 이름의 역할을 찾는다.
let ALL_GAMES = [];
try {
  ALL_GAMES = require("../select-game.js").ALL_GAMES || [];
} catch { ALL_GAMES = []; }

// 커스텀 아이디 키
const CID_ROOT = "recruit";
const CID_OPEN_PANEL = `${CID_ROOT}:panel`;
const CID_CREATE_OPEN = `${CID_ROOT}:createOpen`;
const CID_EDIT_OPEN = `${CID_ROOT}:editOpen`;
const CID_DELETE_OPEN = `${CID_ROOT}:deleteOpen`;
const CID_CREATE_MODAL = `${CID_ROOT}:createModal`;
const CID_EDIT_MODAL = `${CID_ROOT}:editModal`;
const CID_DELETE_MODAL = `${CID_ROOT}:deleteModal`;
const CID_CREATE_GAME_SELECT = `${CID_ROOT}:createGameSelect`;
const CID_PARTICIPATE = `${CID_ROOT}:participate`;
const CID_JOINVOICE = `${CID_ROOT}:joinvoice`;

// 유틸
function getField(embed, name) {
  const fields = embed.data?.fields || [];
  return fields.find(f => f.name === name) || null;
}
function setField(embed, name, value, inline = false) {
  const fields = embed.data?.fields ? [...embed.data.fields] : [];
  const idx = fields.findIndex(f => f.name === name);
  if (idx >= 0) fields[idx] = { name, value, inline };
  else fields.push({ name, value, inline });
  embed.setFields(fields);
}
function parseCount(text) {
  const m = String(text || "").match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}
function parseMembersFromParticipants(value) {
  const ids = [];
  const re = /<@(\d+)>/g;
  let m;
  const s = String(value || "");
  while ((m = re.exec(s))) ids.push(m[1]);
  return ids;
}
function listMentions(ids) {
  if (!ids || ids.length === 0) return "없음";
  return ids.map(id => `<@${id}>`).join("\n");
}
function isAdminOrOwner(interaction) {
  if (ADMIN_USER_IDS.includes(interaction.user.id)) return true;
  const roles = interaction.member?.roles?.cache;
  if (!roles) return false;
  return ADMIN_ROLE_IDS.some(id => roles.has(id));
}
function closeEmbed(embed) {
  const prev = embed.data?.description || "";
  embed.setDescription(`[모집 종료]\n~~${prev}~~`);
  const fields = (embed.data?.fields || []).map(f => f.name === "마감까지" ? { name: "마감까지", value: "마감 종료", inline: true } : f);
  embed.setFields(fields);
  embed.setColor(0x8a8a8a);
  return embed;
}
function buildRecruitComponents(messageId, disabled = false) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${CID_PARTICIPATE}:${messageId}`).setStyle(ButtonStyle.Primary).setLabel("참여하고 싶어요").setEmoji("🙋").setDisabled(disabled),
      new ButtonBuilder().setCustomId(`${CID_JOINVOICE}:${messageId}`).setStyle(ButtonStyle.Success).setLabel("해당 음성채널 참여하기").setEmoji("🎙️").setDisabled(disabled)
    ),
  ];
}
function deriveBannerByGames(gameNames) {
  for (const g of gameNames) {
    if (GAME_BANNERS[g]) return GAME_BANNERS[g];
  }
  return DEFAULT_BANNER;
}
function buildGameTagLineByRoleNames(guild, gameNames) {
  const roleMentions = [];
  for (const name of gameNames) {
    const role = guild.roles.cache.find(r => r.name === name);
    if (role) roleMentions.push(`<@&${role.id}>`);
  }
  if (roleMentions.length === 0) return null;
  return `-# ${roleMentions.join(" ")}`;
}
function parseMessageIdFromCustomId(customId, prefix) {
  const parts = customId.split(":");
  return parts.length >= 3 ? parts[2] : parts[1];
}

// 슬래시 명령
module.exports = {
  data: new SlashCommandBuilder()
    .setName("모집")
    .setDescription("모집 글 작성/수정/삭제 패널 열기"),

  async execute(interaction) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(CID_CREATE_OPEN).setStyle(ButtonStyle.Primary).setLabel("모집 글 작성하기").setEmoji("📝"),
      new ButtonBuilder().setCustomId(CID_EDIT_OPEN).setStyle(ButtonStyle.Secondary).setLabel("모집 글 수정하기").setEmoji("✏️"),
      new ButtonBuilder().setCustomId(CID_DELETE_OPEN).setStyle(ButtonStyle.Danger).setLabel("모집 글 삭제하기").setEmoji("🗑️"),
    );
    const embed = new EmbedBuilder()
      .setTitle("📢 모집 관리")
      .setDescription("아래 버튼으로 작업을 선택하세요.")
      .setColor(0x57c3ff);
    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  },

  registerRecruitHandlers(client) {
    client.on("interactionCreate", async (i) => {
      try {
        if (i.isButton()) {
          // 패널 버튼
          if (i.customId === CID_CREATE_OPEN) {
            const vcChoices = [
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
              { name: "🎙️ 702호", value: "1209157622662561813" },
            ];
            const select = new StringSelectMenuBuilder()
              .setCustomId(`${CID_CREATE_GAME_SELECT}`)
              .setPlaceholder("모집할 게임들을 선택하세요 (최소 1개)")
              .setMinValues(1)
              .setMaxValues(Math.min(25, ALL_GAMES.length))
              .addOptions(
                ALL_GAMES
                  .slice(0, 25)
                  .map(n => {
                    const role = i.guild.roles.cache.find(r => r.name === n);
                    return { label: n, value: role ? role.id : `name:${n}` };
                  })
              );

            const rowSel = new ActionRowBuilder().addComponents(select);

            const modal = new ModalBuilder()
              .setCustomId(CID_CREATE_MODAL)
              .setTitle("모집 글 작성");

            const tiContent = new TextInputBuilder()
              .setCustomId("content")
              .setLabel("모집 내용")
              .setStyle(TextInputStyle.Paragraph)
              .setMaxLength(1000)
              .setRequired(true);

            const tiCount = new TextInputBuilder()
              .setCustomId("count")
              .setLabel("모집 인원 (1~9)")
              .setPlaceholder("예: 4")
              .setStyle(TextInputStyle.Short)
              .setRequired(true);

            const tiHours = new TextInputBuilder()
              .setCustomId("hours")
              .setLabel("마감까지 유지 시간(시간 단위, 1~24)")
              .setPlaceholder("예: 2")
              .setStyle(TextInputStyle.Short)
              .setRequired(true);

            const tiVoice = new TextInputBuilder()
              .setCustomId("voice")
              .setLabel("음성 채널 ID(선택, 위 선택 목록 중 하나)")
              .setPlaceholder("예: 1222085152600096778 (비워도 됨)")
              .setStyle(TextInputStyle.Short)
              .setRequired(false);

            modal.addComponents(
              new ActionRowBuilder().addComponents(tiContent),
              new ActionRowBuilder().addComponents(tiCount),
              new ActionRowBuilder().addComponents(tiHours),
              new ActionRowBuilder().addComponents(tiVoice),
            );

            const panel = new EmbedBuilder()
              .setTitle("📝 모집 글 작성")
              .setDescription("먼저 아래 셀렉트로 **게임**을 선택한 뒤, 모달을 열어 내용을 작성하세요.")
              .setColor(0x2ecc71);

            await i.reply({ embeds: [panel], components: [rowSel, new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId("openModalNow").setLabel("모집 내용 입력하기").setStyle(ButtonStyle.Primary).setEmoji("⌨️")
            )], ephemeral: true });

            const replyMsg = await i.fetchReply();
            const collector = replyMsg.createMessageComponentCollector({ time: 600_000, filter: x => x.user.id === i.user.id });
            let selectedGameRoleIds = [];

            collector.on("collect", async ci => {
              if (ci.isStringSelectMenu() && ci.customId === CID_CREATE_GAME_SELECT) {
                selectedGameRoleIds = ci.values;
                await ci.reply({ content: `선택한 게임 수: ${selectedGameRoleIds.length}`, ephemeral: true });
              } else if (ci.isButton() && ci.customId === "openModalNow") {
                await ci.showModal(modal);
              }
            });

            client.once("interactionCreate", async mi => {
              if (!mi.isModalSubmit()) return;
              if (mi.customId !== CID_CREATE_MODAL) return;
              try {
                const content = mi.fields.getTextInputValue("content");
                let count = parseInt(mi.fields.getTextInputValue("count") || "0", 10);
                let hours = parseInt(mi.fields.getTextInputValue("hours") || "1", 10);
                const voiceIdRaw = (mi.fields.getTextInputValue("voice") || "").trim();
                if (!Array.isArray(selectedGameRoleIds) || selectedGameRoleIds.length === 0) {
                  await mi.reply({ content: "❌ 게임을 최소 1개 이상 선택하세요.", ephemeral: true });
                  return;
                }
                if (!Number.isInteger(count) || count < 1 || count > 9) count = 1;
                if (!Number.isInteger(hours) || hours < 1 || hours > 24) hours = 1;
                const voiceId = voiceIdRaw || null;

                const channel = await mi.guild.channels.fetch(모집채널ID).catch(() => null);
                if (!channel?.isTextBased()) {
                  await mi.reply({ content: "❌ 모집 전용 채널을 찾을 수 없어요.", ephemeral: true });
                  return;
                }

                const now = Date.now();
                const closeAt = now + hours * 3600_000;
                const closeTs = Math.floor(closeAt / 1000);

                const recruiterId = mi.user.id;
                const gameNames = selectedGameRoleIds.map(v => {
                  if (v.startsWith("name:")) return v.slice(5);
                  const r = mi.guild.roles.cache.get(v);
                  return r ? r.name : null;
                }).filter(Boolean);

                const banner = deriveBannerByGames(gameNames);
                const tagLine = buildGameTagLineByRoleNames(mi.guild, gameNames);

                const embed = new EmbedBuilder()
                  .setTitle("📢 모집 글")
                  .setDescription(content)
                  .addFields(
                    { name: "모집 인원", value: `${count}명`, inline: true },
                    ...(voiceId ? [{ name: "음성 채널", value: `<#${voiceId}>`, inline: true }] : []),
                    { name: "모집자", value: `<@${recruiterId}>`, inline: true },
                    { name: "마감까지", value: `<t:${closeTs}:R>`, inline: true },
                    { name: "선택 게임", value: gameNames.join(", "), inline: false },
                    { name: "참여자", value: "없음", inline: false },
                  )
                  .setColor(0x57c3ff)
                  .setImage(banner)
                  .setTimestamp();

                const message = await channel.send({
                  content: tagLine || undefined,
                  embeds: [embed],
                  components: buildRecruitComponents("PENDING"),
                });

                const realComponents = buildRecruitComponents(message.id);
                await message.edit({ components: realComponents });

                await mi.reply({ content: "✅ 모집 글을 게시했어요!", ephemeral: true });
              } catch {
                try { await mi.reply({ content: "❌ 모집 글 작성 중 오류가 발생했어요.", ephemeral: true }); } catch {}
              }
            });

            return;
          }

          if (i.customId === CID_EDIT_OPEN) {
            const modal = new ModalBuilder()
              .setCustomId(CID_EDIT_MODAL)
              .setTitle("모집 글 수정");

            const tiMsg = new TextInputBuilder()
              .setCustomId("msgid")
              .setLabel("모집글 메시지 ID")
              .setStyle(TextInputStyle.Short)
              .setRequired(true);

            const tiContent = new TextInputBuilder()
              .setCustomId("content")
              .setLabel("새 모집 내용(비우면 기존 유지)")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false);

            const tiCount = new TextInputBuilder()
              .setCustomId("count")
              .setLabel("새 모집 인원(1~9, 비우면 기존 유지)")
              .setStyle(TextInputStyle.Short)
              .setRequired(false);

            modal.addComponents(
              new ActionRowBuilder().addComponents(tiMsg),
              new ActionRowBuilder().addComponents(tiContent),
              new ActionRowBuilder().addComponents(tiCount),
            );
            await i.showModal(modal);
            return;
          }

          if (i.customId === CID_DELETE_OPEN) {
            const modal = new ModalBuilder()
              .setCustomId(CID_DELETE_MODAL)
              .setTitle("모집 글 삭제");

            const tiMsg = new TextInputBuilder()
              .setCustomId("msgid")
              .setLabel("모집글 메시지 ID")
              .setStyle(TextInputStyle.Short)
              .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(tiMsg));
            await i.showModal(modal);
            return;
          }

          // 모집글 하단 버튼: 참여, 음성 참여
          if (i.customId.startsWith(CID_PARTICIPATE) || i.customId.startsWith(CID_JOINVOICE)) {
            const msgId = parseMessageIdFromCustomId(i.customId, CID_ROOT);
            const ch = i.channel;
            if (!ch?.isTextBased()) { await i.reply({ content: "❌ 텍스트 채널에서만 사용 가능합니다.", ephemeral: true }); return; }
            const msg = await ch.messages.fetch(msgId).catch(() => null);
            if (!msg || !msg.embeds?.[0]) { await i.reply({ content: "❌ 모집글을 찾을 수 없어요.", ephemeral: true }); return; }
            const embed = EmbedBuilder.from(msg.embeds[0]);

            // 권한/상태 파싱
            const fRecruiter = getField(embed, "모집자");
            const recruiterId = fRecruiter?.value?.replace(/[<@>]/g, "") || null;
            const fCount = getField(embed, "모집 인원");
            const maxCount = parseCount(fCount?.value) || 1;
            const fParticipants = getField(embed, "참여자");
            const curIds = parseMembersFromParticipants(fParticipants?.value);
            const fVoice = getField(embed, "음성 채널");
            const voiceId = fVoice?.value?.match(/<#(\d+)>/)?.[1] || null;
            const isClosed = (embed.data?.description || "").startsWith("[모집 종료]");

            if (i.customId.startsWith(CID_PARTICIPATE)) {
              if (isClosed) { await i.reply({ content: "모집이 종료되었어요.", ephemeral: true }); return; }
              if (curIds.includes(i.user.id)) { await i.reply({ content: "이미 참여 중이에요.", ephemeral: true }); return; }
              if (curIds.length >= maxCount) { await i.reply({ content: "정원이 가득 찼어요.", ephemeral: true }); return; }

              curIds.push(i.user.id);
              setField(embed, "참여자", listMentions(curIds), false);

              let disableNow = false;
              if (curIds.length >= maxCount) {
                closeEmbed(embed);
                disableNow = true;
              }
              await msg.edit({ embeds: [embed], components: buildRecruitComponents(msg.id, disableNow) });

              // 모집자에게 알림(해당 음성 텍스트 또는 모집자가 있는 음성 채팅방 텍텍)
              const recruiterMention = recruiterId ? `<@${recruiterId}>` : null;
              const boldName = `**${i.member?.displayName || i.user.username}**`;
              const line = `-# ${recruiterMention || "모집자"} 님, ${boldName}님이 모집 글에 참여 의사를 밝혔습니다.`;
              if (voiceId) {
                const vc = await i.guild.channels.fetch(voiceId).catch(() => null);
                if (vc?.isTextBased()) await vc.send(line).catch(() => {});
              }
              await i.reply({ content: "✅ 참여 의사를 전달했어요!", ephemeral: true });
              return;
            }

            if (i.customId.startsWith(CID_JOINVOICE)) {
              if (!voiceId) { await i.reply({ content: "❌ 이 모집글에는 음성 채널이 지정되지 않았어요.", ephemeral: true }); return; }
              const vc = await i.guild.channels.fetch(voiceId).catch(() => null);
              if (!vc || vc.type !== 2) { await i.reply({ content: "❌ 유효한 음성 채널이 아니에요.", ephemeral: true }); return; }
              const me = i.member;
              const canMove = i.guild.members.me?.permissions?.has(PermissionFlagsBits.MoveMembers);
              if (me?.voice?.channel) {
                if (canMove) {
                  try {
                    await me.voice.setChannel(vc, "모집글 참여 이동");
                    await i.reply({ content: "🎙️ 음성 채널로 이동시켰어요!", ephemeral: true });
                  } catch {
                    const invite = await vc.createInvite({ maxAge: 300, maxUses: 1, unique: true }).catch(() => null);
                    await i.reply({ content: invite ? `채널 초대: ${invite.url}` : "채널 이동에 실패했어요. 직접 참여해주세요.", ephemeral: true });
                  }
                } else {
                  const invite = await vc.createInvite({ maxAge: 300, maxUses: 1, unique: true }).catch(() => null);
                  await i.reply({ content: invite ? `채널 초대: ${invite.url}` : "권한이 없어 이동시킬 수 없어요. 직접 참여해주세요.", ephemeral: true });
                }
              } else {
                const invite = await vc.createInvite({ maxAge: 300, maxUses: 1, unique: true }).catch(() => null);
                await i.reply({ content: invite ? `채널 초대: ${invite.url}` : "초대링크 생성에 실패했어요. 직접 채널로 들어가주세요.", ephemeral: true });
              }
              return;
            }
          }
        }

        if (i.isModalSubmit()) {
          // 수정
          if (i.customId === CID_EDIT_MODAL) {
            try {
              const msgId = i.fields.getTextInputValue("msgid").trim();
              const newContent = (i.fields.getTextInputValue("content") || "").trim();
              const newCountRaw = (i.fields.getTextInputValue("count") || "").trim();
              const ch = await i.guild.channels.fetch(모집채널ID).catch(() => null);
              if (!ch?.isTextBased()) { await i.reply({ content: "❌ 모집 채널을 찾을 수 없어요.", ephemeral: true }); return; }
              const msg = await ch.messages.fetch(msgId).catch(() => null);
              if (!msg || !msg.embeds?.[0]) { await i.reply({ content: "❌ 모집글을 찾을 수 없어요.", ephemeral: true }); return; }
              const embed = EmbedBuilder.from(msg.embeds[0]);

              const recruiterId = getField(embed, "모집자")?.value?.replace(/[<@>]/g, "");
              const isOwner = recruiterId && recruiterId === i.user.id;
              if (!(isOwner || isAdminOrOwner(i))) { await i.reply({ content: "❌ 수정 권한이 없어요.", ephemeral: true }); return; }

              if (newContent) embed.setDescription(newContent);
              if (newCountRaw) {
                const n = parseInt(newCountRaw, 10);
                if (Number.isInteger(n) && n >= 1 && n <= 9) setField(embed, "모집 인원", `${n}명`, true);
              }

              await msg.edit({ embeds: [embed] });
              await i.reply({ content: "✅ 모집 글을 수정했어요!", ephemeral: true });
            } catch {
              try { await i.reply({ content: "❌ 수정 중 오류가 발생했어요.", ephemeral: true }); } catch {}
            }
            return;
          }

          // 삭제
          if (i.customId === CID_DELETE_MODAL) {
            try {
              const msgId = i.fields.getTextInputValue("msgid").trim();
              const ch = await i.guild.channels.fetch(모집채널ID).catch(() => null);
              if (!ch?.isTextBased()) { await i.reply({ content: "❌ 모집 채널을 찾을 수 없어요.", ephemeral: true }); return; }
              const msg = await ch.messages.fetch(msgId).catch(() => null);
              if (!msg || !msg.embeds?.[0]) { await i.reply({ content: "❌ 모집글을 찾을 수 없어요.", ephemeral: true }); return; }
              const embed = EmbedBuilder.from(msg.embeds[0]);

              const recruiterId = getField(embed, "모집자")?.value?.replace(/[<@>]/g, "");
              const isOwner = recruiterId && recruiterId === i.user.id;
              if (!(isOwner || isAdminOrOwner(i))) { await i.reply({ content: "❌ 삭제 권한이 없어요.", ephemeral: true }); return; }

              await msg.delete().catch(() => {});
              await i.reply({ content: "🗑️ 모집 글을 삭제했어요!", ephemeral: true });
            } catch {
              try { await i.reply({ content: "❌ 삭제 중 오류가 발생했어요.", ephemeral: true }); } catch {}
            }
            return;
          }
        }
      } catch { /* 무시 */ }
    });
  },
};
