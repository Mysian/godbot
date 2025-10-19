const fs = require("fs");
const path = require("path");
const express = require("express");
const { Client, Collection, GatewayIntentBits, Events, ActivityType, StringSelectMenuBuilder, ActionRowBuilder, ModalBuilder,
  TextInputBuilder, EmbedBuilder } = require("discord.js");
require("dotenv").config();
const activity = require("./utils/activity-tracker");
const activityLogger = require('./utils/activity-logger');
const relationship = require("./utils/relationship.js");
const { ALL_GAMES } = require("./commands/select-game.js");
const setupPersonalChannelUtility = require('./utils/personal-channel.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessageTyping,
    GatewayIntentBits.DirectMessageTyping
  ],
  partials: ["CHANNEL", "MESSAGE", "REACTION"],
});
global.client = client; 

const LOG_CHANNEL_ID = "1382168527015776287";
module.exports.client = client;
const OWNER_ID = process.env.OWNER_ID || "285645561582059520";
const ALLOWED_GUILD_IDS = new Set([
  "785841387396005948"
]);
function isAllowedGuild(id) {
  return id && ALLOWED_GUILD_IDS.has(String(id));
}

const APPROVAL_LOBBY_CHANNEL_ID = "1423239866359218320";
const approvalFlow = require("./utils/approval-flow");
const manualStartApproval = approvalFlow.manualStart;
const findUserPrivateChannel = approvalFlow.findUserPrivateChannel;

client.commands = new Collection();

setupPersonalChannelUtility(client);

function getAllCommandFiles(dirPath) {
  let results = [];
  const files = fs.readdirSync(dirPath);
  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      results = results.concat(getAllCommandFiles(fullPath));
    } else if (file.endsWith(".js")) {
      results.push(fullPath);
    }
  }
  return results;
}

const commandsPath = path.join(__dirname, "commands");
const commandFiles = getAllCommandFiles(commandsPath);
for (const file of commandFiles) {
  const command = require(file);
  if ("data" in command && "execute" in command) {
    client.commands.set(command.data.name, command);
  } else {
    console.log(`⚠️ ${file} 명령어에 data 또는 execute가 없습니다.`);
  }
}

const eventsPath = path.join(__dirname, "events");
if (fs.existsSync(eventsPath)) {
  const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith(".js"));
  for (const file of eventFiles) {
    const event = require(path.join(eventsPath, file));
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args));
    } else {
      client.on(event.name, (...args) => event.execute(...args));
    }
  }
}

require("./utils/approval-flow")(client);
require("./utils/approval-blocker")(client);
require("./utils/youtube-panel").setup(client);
require("./utils/caution-flow.js")(client);
require('./utils/voiceWatcher')(client);
require('./utils/restricted-role-guard')(client);
require('./utils/donor-role-expirer')(client);
require('./utils/category-channel-watcher').initChannelWatcher(client);
require('./utils/godbot-core').initGodbotCore(client);
require('./utils/bump-reward')(client);
require('./commands/nickname-change').register(client);
require('./utils/admin-digest').start(client);
require('./utils/weekly-lottery').init(client);
require('./utils/dm-direct')(client);

const recruit = require("./commands/recruit.js");
recruit.registerRecruitHandlers(client);

const { registerVoiceMuteRole } = require("./utils/voice-mute-role");
registerVoiceMuteRole(client);

const controlPanel = require('./utils/control-panel');
controlPanel.register(client);

const { startSecretChannels } = require('./utils/secret-channels.js');
startSecretChannels(client);

client.on(Events.GuildCreate, async guild => {
  const logChannel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
  const ts = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  let inviterText = "";
  try {
    const { AuditLogEvent } = require("discord.js");
    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 5 }).catch(() => null);
    const entry = logs?.entries?.find(e => e.target?.id === client.user.id);
    if (entry?.executor) inviterText = `\n**시도자:** <@${entry.executor.id}> (\`${entry.executor.tag}\`)`;
  } catch {}
  const base = `**서버:** ${guild.name} (\`${guild.id}\`)\n**인원:** ${guild.memberCount ?? "?"}명\n**시간:** ${ts}${inviterText}`;
  if (!isAllowedGuild(guild.id)) {
    if (logChannel?.isTextBased?.()) {
      await logChannel.send(`-# 🚫 **허용 외 서버 초대 시도 감지**\n${base}\n➡️ 초대 거부 및 즉시 퇴장 처리됨.`);
    }
    try { await guild.leave(); } catch {}
    return;
  }
  if (logChannel?.isTextBased?.()) {
    await logChannel.send(`-# ✅ **허용 서버에 봇이 초대됨**\n${base}`);
  }
});

const disasterWatcher = require("./utils/disaster-watcher.js");
const gameNews = require("./utils/game-news-watcher.js");

const { autoMarketUpdate } = require('./commands/godbit.js');
const GUILD_ID = process.env.GUILD_ID || '785841387396005948';

disasterWatcher.start(client);
gameNews.start(client);

setInterval(async () => {
  try {
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) return;
    const members =
      (guild.members?.cache?.size ? guild.members.cache : await guild.members.fetch());
    await autoMarketUpdate(members, client);
  } catch (e) {
    console.error('갓비트 자동상장 오류:', e);
  }
}, 600_000);

client.once(Events.ClientReady, async () => {
  console.log(`✅ 로그인됨! ${client.user.tag}`);

  try {
    const logChannel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    if (logChannel?.isTextBased?.()) {
      await logChannel.send(`-# 🔁 봇이 재시작되었습니다! (${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })})`);
    }
    await controlPanel.publish(client);
  } catch (e) {
    console.error("재시작 로그 전송 실패:", e);
  }

for (const [gid, guild] of client.guilds.cache) {
  if (!isAllowedGuild(gid)) {
    try {
      const logChannel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
      const ts = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
      if (logChannel?.isTextBased?.()) {
        await logChannel.send(`-# 🚪 **허용 외 서버 자동 퇴장**\n**서버:** ${guild.name} (\`${guild.id}\`)\n**인원:** ${guild.memberCount ?? "?"}명\n**시간:** ${ts}`);
      }
    } catch {}
    try { await guild.leave(); } catch {}
  }
}

  const guild = client.guilds.cache.get(GUILD_ID);

  if (guild) {
    await relationship.cleanupLeftMembers(guild);
    console.log("서버 나간 유저 관계/교류 데이터 정리 완료");
  }

  try {
    if (guild) {
      const { cleanupBELeftMembers } = require('./commands/be-util.js');
      const { removed } = await cleanupBELeftMembers(guild);
      console.log(`[BE 정리] 서버 나간 유저 ${removed}명 데이터 제거 완료`);
    }
  } catch (e) {
    console.error('[BE 정리 오류]', e);
  }

  const activityMessages = [
    "/갓비트 로 코인 투자를 진행해보세요.",
    "/도움말 을 통해 까리한 기능들을 확인해보세요.",
    "/후원 을 통해 서버에 힘을 보태주세요!"
  ];
  let activityIndex = 0;

  setInterval(() => {
    client.user.setPresence({
      status: "online",
      activities: [
        {
          name: activityMessages[activityIndex],
          type: ActivityType.Playing,
        },
      ],
    });
    activityIndex = (activityIndex + 1) % activityMessages.length;
  }, 20000);
    try {
        const lobby = await client.channels.fetch(APPROVAL_LOBBY_CHANNEL_ID).catch(() => null);
        if (lobby && lobby.isTextBased()) {
            const marker = "> 입장 승인 절차가 이뤄지지 않는 경우 아래 버튼을 클릭하세요.";
            const recent = await lobby.messages.fetch({ limit: 20 }).catch(() => null);
            const exist = recent?.find(m => m.author.id === client.user.id && m.content?.includes(marker));

            const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("approval_start_from_lobby")
                    .setLabel("입장 절차 진행하기")
                    .setStyle(ButtonStyle.Success)
            );
            const embed = new EmbedBuilder()
                .setColor(0x7b2ff2)
                .setTitle("🧭 까리한 디스코드 • 수동 입장")
                .setDescription([
                    "기본 채널이 생성되지 않았다면, 직접 입장 절차를 시작할 수 있습니다!",
                    "",
                    "▶️ 버튼을 누르시면 입장 절차를 진행할 수 있는 개인 채널이 생성됩니다.",
                    "⚠️ 이미 인증 절차를 진행하는 채널이 있다면 그 채널로 안내해드립니다.",
                ].join("\n"))
                .setFooter({ text: "까리한 디스코드 공식 봇, '갓봇' 입니다." });

            if (exist) {
                await exist.edit({ content: marker, embeds: [embed], components: [row] }).catch(() => { });
            } else {
                await lobby.send({ content: marker, embeds: [embed], components: [row] }).catch(() => { });
            }
        }
    } catch (e) {
        console.error("[로비 안내 임베드 업서트 실패]", e);
    }
});

async function sendCommandLog(interaction) {
  try {
    const logChannel = await interaction.client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    if (!logChannel || !logChannel.isTextBased()) return;
    const userTag = interaction.user.tag;
    const cmdName = interaction.commandName;
    const time = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

    const channel = interaction.channel;
    const channelInfo = channel
      ? (channel.isDMBased()
          ? "DM"
          : `<#${channel.id}> (\`${channel.name}\`)`)
      : "알 수 없음";

    let extra = "";
if (interaction.options) {
  const root = interaction.options.data ?? [];
  const flat = [];
  for (const opt of root) {
    if (opt.type === 1 || opt.type === 2) {
      flat.push(`sub:${opt.name}`);
      (opt.options ?? []).forEach(o => flat.push(`${o.name}=${o.value}`));
    } else {
      flat.push(`${opt.name}=${opt.value}`);
    }
  }
  extra = flat.length ? flat.map(s => `\`${s}\``).join(", ") : "";
}

    const embed = {
      title: "명령어 사용 로그",
      description: `**유저:** <@${interaction.user.id}> (\`${userTag}\`)
**명령어:** \`/${cmdName}\`
${extra ? `**옵션:** ${extra}\n` : ""}
**채널:** ${channelInfo}
**시간:** ${time}`,
      color: 0x009688
    };
    await logChannel.send({ embeds: [embed] });
  } catch (e) { }
}

const modalHandlers = new Map([
  ["rps_bet_modal", async (interaction) => {
  const cmd = client.commands.get("정수획득");
  if (cmd?.modal) return cmd.modal(interaction);
}],
["blackjack_bet_modal", async (interaction) => {
  const cmd = client.commands.get("정수획득");
  if (cmd?.modal) return cmd.modal(interaction);
}],
["coupon_redeem_modal", async (interaction) => {
  const cmd = client.commands.get("정수획득");
  if (cmd?.modal) return cmd.modal(interaction);
}],
  ["kick_reason_modal", async (interaction) => {
  const cmd = client.commands.get("강퇴투표");
  if (cmd?.modal) return cmd.modal(interaction);
}],
  ["be_search_modal", async (interaction) => {
    const cmd = client.commands.get("정수조회");
    if (cmd?.modal) return cmd.modal(interaction);
  }],
  ["set_channel_modal", async (interaction) => {
    const cmd = client.commands.get("공지하기");
    if (cmd?.modal) return cmd.modal(interaction);
  }],
  ["add_tip_modal", async (interaction) => {
    const cmd = client.commands.get("공지하기");
    if (cmd?.modal) return cmd.modal(interaction);
  }],
  ["set_interval_modal", async (interaction) => {
    const cmd = client.commands.get("공지하기");
    if (cmd?.modal) return cmd.modal(interaction);
  }],
  ["edit_tip_modal_", async (interaction) => {
    const cmd = client.commands.get("공지하기");
    if (cmd?.modal) return cmd.modal(interaction);
  }],
  ["edit_tip_final_", async (interaction) => {
  const cmd = client.commands.get("공지하기");
  if (cmd?.modal) return cmd.modal(interaction);
}],
["delete_tip_modal_", async (interaction) => {
  const cmd = client.commands.get("공지하기");
  if (cmd?.modal) return cmd.modal(interaction);
}],
  ["seham_add_", async (interaction) => {
  const cmd = client.commands.get("관리");
  if (cmd?.modalSubmit) return cmd.modalSubmit(interaction);
}],
  ["warn_modal_", async (interaction) => {
    const cmd = client.commands.get("경고");
    if (cmd?.handleModal) return cmd.handleModal(interaction);
  }],
  ["unwarn_modal_", async (interaction) => {
    const cmd = client.commands.get("경고취소");
    if (cmd?.handleModal) return cmd.handleModal(interaction);
  }],
  ["신고_모달", async (interaction) => {
    const report = require('./commands/report.js');
    if (report?.modal) return report.modal(interaction);
  }],
  ["민원_모달", async (interaction) => {
    const complaint = require('./commands/complaint.js');
    if (complaint?.modal) return complaint.modal(interaction);
  }],
  ["give-modal-", async (interaction) => {
    const cmd = client.commands.get("챔피언지급");
    if (cmd?.modalSubmit) return cmd.modalSubmit(interaction);
  }],
  ["nickname_change_modal_", async (interaction) => {
    const cmd = client.commands.get("관리");
    if (cmd?.modalSubmit) return cmd.modalSubmit(interaction);
  }],
  ["adminpw_user_", async (interaction) => {
    const cmd = client.commands.get("관리");
    if (cmd?.modalSubmit) return cmd.modalSubmit(interaction);
  }],
  ["adminpw_json_backup", async (interaction) => {
    const cmd = client.commands.get("관리");
    if (cmd?.modalSubmit) return cmd.modalSubmit(interaction);
  }],
  ["buy_modal", async (interaction) => {
  const cmd = client.commands.get("갓비트");
  if (cmd?.modal) return cmd.modal(interaction);
}],
["sell_modal", async (interaction) => {
  const cmd = client.commands.get("갓비트");
  if (cmd?.modal) return cmd.modal(interaction);
}],
["history_modal", async (interaction) => {
  const cmd = client.commands.get("갓비트");
  if (cmd?.modal) return cmd.modal(interaction);
}],
["modal_buy", async (interaction) => {
  const cmd = client.commands.get("갓비트");
  if (cmd?.modal) return cmd.modal(interaction);
}],
["modal_sell", async (interaction) => {
  const cmd = client.commands.get("갓비트");
  if (cmd?.modal) return cmd.modal(interaction);
}],
 ["status_set", async (interaction) => {
    const cmd = client.commands.get("상태설정");
    if (cmd?.modal) return cmd.modal.execute(interaction);
 }],
["bet_create", async (interaction) => {
  const cmd = client.commands.get("내기");
  if (cmd?.modal) return cmd.modal(interaction);
}],
["bet_join_select", async (interaction) => {
  const cmd = client.commands.get("내기");
  if (cmd?.modal) return cmd.modal(interaction);
}],
["bet_join_", async (interaction) => {
  const cmd = client.commands.get("내기");
  if (cmd?.modal) return cmd.modal(interaction);
}],
["bet_close_select", async (interaction) => {
  const cmd = client.commands.get("내기");
  if (cmd?.modal) return cmd.modal(interaction);
}],
["bet_settle_select", async (interaction) => {
  const cmd = client.commands.get("내기");
  if (cmd?.modal) return cmd.modal(interaction);
}],
["bet_result_select_", async (interaction) => {
  const cmd = client.commands.get("내기");
  if (cmd?.modal) return cmd.modal(interaction);
}],
["donate_money_modal", async (interaction) => {
  const cmd = client.commands.get("후원");
  if (cmd?.modal) return cmd.modal(interaction);
}],
["donate_item_modal", async (interaction) => {
  const cmd = client.commands.get("후원");
  if (cmd?.modal) return cmd.modal(interaction);
}],
["liar_", async (interaction) => {
  const cmd = client.commands.get("라이어");
  if (cmd?.modal) return cmd.modal(interaction);
}],
["liar:", async (interaction) => {
  const cmd = client.commands.get("라이어");
  if (cmd?.modal) return cmd.modal(interaction);
}],
]);

const warnCmd = client.commands.get("경고");
const unwarnCmd = client.commands.get("경고취소");
const champBattle = require('./commands/champ-battle');
const remoteCmd = client.commands.get("리모콘");
const donateCmd = client.commands.get('후원');
const fortuneCmd = require("./commands/fortune.js");
const utilCmd = client.commands.get("유틸") || require("./commands/util.js");

const scrimAnnounce =
  client.commands.get("내전공지") ||
  require("./commands/scrim-announce.js");

client.on(Events.InteractionCreate, async interaction => {
  if (interaction.guildId && !isAllowedGuild(interaction.guildId)) {
  try {
    const logChannel = await interaction.client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    const ts = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
    const g = interaction.guild;
    const who = `<@${interaction.user.id}> (\`${interaction.user.tag}\`)`;
    const what = interaction.isChatInputCommand()
      ? `명령어 /${interaction.commandName}`
      : interaction.isButton()
        ? `버튼 ${interaction.customId}`
        : interaction.isStringSelectMenu()
          ? `셀렉트 ${interaction.customId}`
          : interaction.isModalSubmit()
            ? `모달 ${interaction.customId}`
            : `상호작용`;
    if (logChannel?.isTextBased?.()) {
      await logChannel.send(`-# 🔒 **허용 외 서버 조작 시도 차단**\n**서버:** ${g?.name ?? "알 수 없음"} (\`${interaction.guildId}\`)\n**유저:** ${who}\n**행위:** ${what}\n**시간:** ${ts}`);
    }
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "이 봇은 이 서버에서 사용할 수 없어.", ephemeral: true });
    }
  } catch {}
  return;
}


  if (
  (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) &&
  interaction.channel?.name?.startsWith('입장-')
) {
  return;
}

if (interaction.isButton() && interaction.customId === "approval_start_from_lobby") {
  if (interaction.channelId !== APPROVAL_LOBBY_CHANNEL_ID) {
    return interaction.reply({ content: "이 버튼은 지정된 로비 채널에서만 사용할 수 있어.", ephemeral: true }).catch(() => {});
  }

  const guild = interaction.guild;
  const uid = interaction.user.id;

  const display = interaction.member?.nickname?.trim()
    || interaction.member?.displayName?.trim()
    || interaction.user.globalName?.trim()
    || interaction.user.username?.trim();

  const toKebab = (s) => s
    .normalize("NFKC")
    .replace(/\s+/g, "-")
    .replace(/_{2,}/g, "_")
    .replace(/-+/g, "-")
    .replace(/[^\p{L}\p{N}\-_]/gu, "")
    .toLowerCase();

  const base = toKebab(display || "user");
  const nameCandidates = [
    `입장-${base}`,
    `입장-${base}님_환영합니다`,
    `입장-${base}_환영합니다`,
  ];

  let pch = null;
  try {
    pch = (typeof findUserPrivateChannel === "function" ? findUserPrivateChannel(guild, uid) : null)
      || guild.channels.cache.find(c => c.type === 0 && c.topic === uid)
      || guild.channels.cache.find(c => c.type === 0 && nameCandidates.includes(c.name))
      || guild.channels.cache.find(c => c.type === 0 && c.name.startsWith(`입장-${base}`))
      || null;
  } catch {}

  if (pch) {
    return interaction.reply({
      content: `진행 중인 입장 인증 채널이 있습니다.\n➡️ <#${pch.id}> 로 이동해서 계속 진행해주세요.`,
      ephemeral: true
    }).catch(() => {});
  }

  try {
    const started = await (typeof manualStartApproval === "function" ? manualStartApproval(guild, uid) : null);
    if (started && started.id) {
      return interaction.reply({
        content: `입장 절차를 이곳에서 진행해주세요. 👉 <#${started.id}>`,
        ephemeral: true
      }).catch(() => {});
    }
    return interaction.reply({ content: "채널 생성에 실패했어요. 잠시 후 다시 시도해주세요.", ephemeral: true }).catch(() => {});
  } catch (e) {
    console.error("[수동 입장 시작 오류]", e);
    return interaction.reply({ content: "처리 중 오류가 발생했습니다.", ephemeral: true }).catch(() => {});
  }
}



if (interaction.isModalSubmit() && (
  interaction.customId.startsWith("modal_nickreq_") ||
  interaction.customId.startsWith("modal_reject_") ||
  interaction.customId === "modal_bio" ||
  interaction.customId === "modal_SNS" ||
  interaction.customId === "modal_추천인" ||
  interaction.customId === "modal_alt" ||
  interaction.customId === "modal_nickchange"
)) {
  return;
}

if (interaction.isModalSubmit() && interaction.customId === "gameSearchModal") {
  const keyword = interaction.fields.getTextInputValue("searchKeyword");
  const pattern = keyword
    .toLowerCase()
    .split("")
    .map(c => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  const regex = new RegExp(pattern);
  const matches = ALL_GAMES.filter(g => regex.test(g.toLowerCase()));
  if (matches.length === 0) {
    return interaction.reply({ content: "🔍 검색 결과가 없습니다.", ephemeral: true });
  }
  if (matches.length > 1) {
    return interaction.reply({
      content: `🔍 여러 개가 검색되었어요, 정확히 입력하시면 자동 등록됩니다. : ${matches.join(", ")}`,
      ephemeral: true
    });
  }
  const gameName = matches[0];
  const role = interaction.guild.roles.cache.find(r => r.name === gameName);
  if (!role) {
    return interaction.reply({ content: `❌ "${gameName}" 역할을 찾을 수 없어요.`, ephemeral: true });
  }
  const member = interaction.member;
  if (member.roles.cache.has(role.id)) {
    await member.roles.remove(role, "게임 태그 제거");
  } else {
    await member.roles.add(role, "게임 태그 추가");
  }
  const chosenRoles = member.roles.cache
    .filter(r => ALL_GAMES.includes(r.name))
    .map(r => r.name);
  const chosenText = chosenRoles.length
    ? chosenRoles.map(n => `• ${n}`).join("\n")
    : "아직 등록된 태그가 없습니다.";
  const embed = new EmbedBuilder()
    .setTitle("🎮 검색한 게임 태그 등록/해제 처리 완료")
    .setColor(0x2095ff)
    .setDescription(chosenText);

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

  const betCmd = client.commands.get("내기");
  if (
    (interaction.isStringSelectMenu() && interaction.customId.startsWith("bet_")) ||
    (interaction.isModalSubmit() && interaction.customId.startsWith("bet_"))
  ) {
    if (betCmd?.modal) {
      try {
        await betCmd.modal(interaction);
      } catch (err) {
        console.error(err);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: "❌ 내기 상호작용 처리 오류", ephemeral: true }).catch(() => {});
        }
      }
    }
    return;
  }

  if (
  interaction.isStringSelectMenu() &&
  (
    interaction.customId.startsWith("warn_option_") ||
    interaction.customId.startsWith("warn_category_") ||
    interaction.customId.startsWith("warn_reason_")
  )
) {
  if (warnCmd && typeof warnCmd.handleSelect === "function") {
    try {
      await warnCmd.handleSelect(interaction);
    } catch (err) {
      console.error(err);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.update({ content: "❣️ 처리 중 오류", components: [] });
        }
      } catch {}
    }
  }
  return;
}

  if (interaction.isButton() && remoteCmd && interaction.customId.startsWith("remote_move_")) {
    await remoteCmd.handleButton(interaction);
    return;
  }

  if (
    interaction.isButton() &&
    (interaction.customId === 'donate_money' || interaction.customId === 'donate_item')
  ) {
    if (!donateCmd) return;
    if (interaction.customId === 'donate_money') {
      await interaction.showModal(donateCmd.createDonateMoneyModal());
      return;
    }
    if (interaction.customId === 'donate_item') {
      await interaction.showModal(donateCmd.createDonateItemModal());
      return;
    }
  }

  if (interaction.isButton() && interaction.customId === "fortune_record_view") {
    return fortuneCmd.handleButton(interaction);
  }

if (interaction.isButton() && interaction.customId?.startsWith("wsearch:")) {
  const cmd = client.commands.get("검색") || require("./commands/search.js");
  try {
    await cmd.handleComponent(interaction);
  } catch (err) {
    console.error("[웹검색 component 오류]", err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "❌ 검색 버튼 처리 중 오류", ephemeral: true }).catch(() => {});
    }
  }
  return;
}

if (
  (interaction.isButton() || interaction.isModalSubmit()) &&
  (
    interaction.customId?.startsWith("calc:")  ||
    interaction.customId?.startsWith("memo:")  ||
    interaction.customId?.startsWith("lotto:") ||
    interaction.customId?.startsWith("conch:") ||
    interaction.customId?.startsWith("util:")  ||
    interaction.customId?.startsWith("img:")   || 
    interaction.customId?.startsWith("image:")    
  )
) {
  try {
    return await utilCmd.route(interaction);
  } catch (e) {
    console.error("[유틸 route 오류]", e);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "❌ 유틸 처리 중 오류", ephemeral: true }).catch(()=>{});
    }
  }
}

if (interaction.isModalSubmit()) {
  if (
    interaction.customId === 'team-modal' ||
    interaction.customId.startsWith('team:') || 
    interaction.customId.startsWith('secret_') ||
    interaction.customId.startsWith('profile:')
  ) {
    return;
  }

  if (interaction.customId.startsWith('lottery_')) {
    return;
  }

  let handled = false;
  for (const [key, handler] of modalHandlers.entries()) {
    if (interaction.customId.startsWith(key)) {
      try {
        await handler(interaction);
      } catch (err) {
        console.error(err);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: "❣️ 처리 중 오류", ephemeral: true }).catch(() => {});
        }
      }
      handled = true;
      break;
    }
  }
if (!handled) {
  const id = interaction.customId || "";
  const isCautionFlowModal = id.startsWith("cau:");
  const isApprovalFlowModal =
    id.startsWith("modal_nickreq_") ||
    id.startsWith("modal_reject_") ||
    id === "modal_bio" ||
    id === "modal_SNS" ||
    id === "modal_추천인" ||
    id === "modal_alt" ||
    id === "modal_nickchange";

  if (!interaction.replied && !interaction.deferred && !isApprovalFlowModal && !isCautionFlowModal) {
    if (!interaction.channel?.name?.startsWith('입장-')) {
      await interaction.reply({ content: "❣️ 진행 완료", ephemeral: true }).catch(() => {});
    }
  }
}
  return;
}

  if (interaction.isChatInputCommand() && interaction.commandName === "챔피언배틀") {
    await sendCommandLog(interaction);
    try {
      await champBattle.execute(interaction);
    } catch (error) {
      console.error(error);
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          content: "❌ 명령어 실행 중 오류가 발생했습니다.",
          ephemeral: true
        }).catch(() => {});
      } else {
        await interaction.reply({
          content: "❌ 명령어 실행 중 오류가 발생했습니다.",
          ephemeral: true
        }).catch(() => {});
      }
    }
    return;
  }

  if (
    interaction.isButton() && interaction.customId && (
      interaction.customId.startsWith('accept_battle_') ||
      interaction.customId.startsWith('decline_battle_') ||
      [
        'attack', 'defend', 'dodge', 'item', 'skill', 'escape', 'pass'
      ].includes(interaction.customId) ||
      interaction.customId.startsWith('useitem_') ||
      interaction.customId.startsWith('useskill_')
    )
  ) {
    try {
      await champBattle.handleButton(interaction);
    } catch (error) {
      console.error(error);
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          content: "❌ 버튼 실행 중 오류가 발생했습니다.",
          ephemeral: true
        }).catch(() => {});
      } else {
        await interaction.reply({
          content: "❌ 버튼 실행 중 오류가 발생했습니다.",
          ephemeral: true
        }).catch(() => {});
      }
    }
    return;
  }

  if (interaction.isChatInputCommand()) {
    await sendCommandLog(interaction);
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(error);
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          content: "⏳ 해당 명령어가 만료되었습니다.",
          ephemeral: true
        }).catch(() => {});
      } else {
        await interaction.reply({
          content: "⏳ 해당 명령어가 만료되었습니다.",
          ephemeral: true
        }).catch(() => {});
      }
    }
  }
});

client.on(Events.InteractionCreate, async interaction => {
  if (interaction.guildId && !isAllowedGuild(interaction.guildId)) {
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: "이 봇은 이 서버에서 사용할 수 없어.", ephemeral: true });
      }
    } catch {}
    return;
  }

if ((interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) 
    && interaction.channel?.name?.startsWith('입장-')) return;
  
  if ((interaction.isButton() || interaction.isStringSelectMenu()) && interaction.customId?.startsWith("usercleanup_")) {
  const cmd = client.commands.get("유저청소");
  if (cmd?.component) {
    try {
      await cmd.component(interaction);
    } catch (err) {
      console.error("[유저청소 component 오류]", err);
      if (!interaction.deferred && !interaction.replied) {
        await interaction.reply({ content: "❌ 처리 중 오류가 발생했어.", ephemeral: true }).catch(() => {});
      }
    }
  } else {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.reply({ content: "❌ 유저청소 핸들러를 찾지 못했어.", ephemeral: true }).catch(() => {});
    }
  }
  return;
}

if (
  (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) &&
  interaction.customId?.startsWith("scrim:")
) {
  try {
    const cmd = client.commands.get("내전공지") || scrimAnnounce;
    if (cmd?.onComponent) {
      await cmd.onComponent(interaction);
    } else {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: "❌ 내전 공지 핸들러를 찾지 못했어.", ephemeral: true }).catch(() => {});
      }
    }
  } catch (err) {
    console.error("[scrim component 오류]", err);
    if (!interaction.deferred && !interaction.replied) {
      await interaction.reply({ content: "❌ 내전 공지 버튼 처리 중 오류", ephemeral: true }).catch(() => {});
    }
  }
  return; 
}

const fishingCmd = client.commands.get("낚시") || require("./commands/fishing.js");

if (
  (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) &&
  (
    interaction.customId?.startsWith("quest:") ||
    interaction.customId?.startsWith("fish:") ||
    interaction.customId?.startsWith("shop:") ||
    interaction.customId?.startsWith("inv:")  ||
    interaction.customId?.startsWith("sell:") ||
    interaction.customId?.startsWith("sell-") ||
    interaction.customId?.startsWith("nav:")  ||
    interaction.customId?.startsWith("dex:")  ||
    interaction.customId?.startsWith("rank:") ||
    interaction.customId?.startsWith("open:") || 
    interaction.customId?.startsWith("info:") ||
    interaction.customId?.startsWith("auto:") ||
    interaction.customId?.startsWith("aqua:") ||
    interaction.customId?.startsWith("relic:") ||
    interaction.customId?.startsWith("relic-") ||
    interaction.customId?.startsWith("relic")  ||
    interaction.customId === "relic-equip-choose" ||
    interaction.customId?.startsWith("my:")
  )
) {
  try {
    await fishingCmd.component(interaction);
  } catch (err) {
    console.error("[낚시 component 오류]", err);
    if (!interaction.deferred && !interaction.replied) {
      await interaction.reply({ content: "❌ 낚시 상호작용 처리 중 오류", ephemeral: true }).catch(() => {});
    }
  }
  return;
}

if (
  (interaction.isButton() || interaction.isStringSelectMenu()) &&
  (
    (interaction.customId || "").startsWith("liar:") ||
    (interaction.customId || "").startsWith("liar-")
  )
) {
  const cmd = client.commands.get("라이어");
  if (!cmd || typeof cmd.component !== "function") {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "❌ 라이어 핸들러를 찾지 못했어.", ephemeral: true }).catch(() => {});
    }
    return;
  }
  try {
    await cmd.component(interaction);
  } catch (err) {
    console.error("[라이어 component 오류]", err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "❌ 라이어 상호작용 처리 중 오류", ephemeral: true }).catch(() => {});
    }
  }
  return;
}

  if (interaction.isButton() && interaction.customId.startsWith("bet_share_join_")) {
  const betCmd = client.commands.get("내기");
  if (betCmd?.modal) return betCmd.modal(interaction);
  return;
}

  if (!interaction.isButton()) return;

if (interaction.customId.startsWith('profile:')) return;

  if (interaction.customId.endsWith('_open')) {
    try {
      if (interaction.customId === 'complaint_open') return await complaint.execute(interaction);
      if (interaction.customId === 'report_open') return await report.execute(interaction);
      if (interaction.customId === 'punish_guide_open') return await punishGuide.execute(interaction);
      if (interaction.customId === 'warn_check_open') return await warnCheck.execute(interaction);
      if (interaction.customId === 'game_tag_open') return await gameTag.execute(interaction);
      if (interaction.customId === 'server_tag_open') return await serverTag.execute(interaction);
      if (interaction.customId === 'serverinfo_open') return await serverInfo.execute(interaction);
      if (interaction.customId === 'serverrules_open') return await serverRules.execute(interaction);
      if (interaction.customId === 'levelguide_open') return await levelGuide.execute(interaction);
      if (interaction.customId === 'profile_register_open') return await profileRegister.execute(interaction);
      if (interaction.customId === 'profile_edit_open') return await profileEdit.execute(interaction);
      if (interaction.customId === 'genji_open') return await genji.execute(interaction);
      if (interaction.customId === 'adventure_open') return await adventure.execute(interaction);
      if (interaction.customId === 'genji_rank_open') return await genjiRank.execute(interaction);
      if (interaction.customId === 'adventure_rank_open') return await adventureRank.execute(interaction);
      if (interaction.customId === 'bot_pull_open') return await botPull.execute(interaction);
      if (interaction.customId === 'bot_deploy_commands_open') return await botDeployCommands.execute(interaction);
      if (interaction.customId === 'bot_restart_open') return await botRestart.execute(interaction);
      if (interaction.customId === 'set_status_open') return await setStatus.execute(interaction);
      if (interaction.customId === 'remove_status_open') return await removeStatus.execute(interaction);
      if (interaction.customId === 'prev' || interaction.customId === 'next') return;
    } catch (err) {
      if (err?.code === 10062) return;
      console.error('버튼 핸들러 오류:', err);
    }
    return;
  }
});

client.on("messageCreate", async msg => {
  if (msg.partial) {
    try { msg = await msg.fetch(); } catch { return; }
  }
  if (msg.guild && !msg.author.bot) {
    activity.addMessage(msg.author.id, msg.channel);
  }
});

const { setup: setupFastGive } = require('./utils/be-fastgive.js');
setupFastGive(client);

const voiceStartMap = new Map();

client.once('ready', async () => {
  for (const [guildId, guild] of client.guilds.cache) {
    for (const [memberId, voiceState] of guild.voiceStates.cache) {
      if (!voiceState.channel || voiceState.member.user.bot) continue;
      if (!activity.isTracked(voiceState.channel, "voice")) continue;
      if (voiceState.selfMute || voiceState.selfDeaf) continue;
      voiceStartMap.set(voiceState.id, {
        channel: voiceState.channel,
        time: Date.now(),
        lastSaved: Date.now()
      });
    }
  }
});

client.on("voiceStateUpdate", (oldState, newState) => {
  if (!oldState.channel && newState.channel && !newState.member.user.bot) {
    if (
      activity.isTracked(newState.channel, "voice") &&
      !newState.selfMute && !newState.selfDeaf
    ) {
      voiceStartMap.set(newState.id, {
        channel: newState.channel,
        time: Date.now(),
        lastSaved: Date.now()
      });
    }
  }
  if (oldState.channel && (!newState.channel || oldState.channel.id !== newState.channel.id)) {
    const info = voiceStartMap.get(oldState.id);
    if (
      info &&
      activity.isTracked(oldState.channel, "voice")
    ) {
      const sec = Math.floor((Date.now() - info.lastSaved) / 1000);
      if (sec > 0) {
        activity.addVoice(oldState.id, sec, oldState.channel);
      }
      voiceStartMap.delete(oldState.id);
    }
    if (newState.channel && !newState.member.user.bot) {
      if (
        activity.isTracked(newState.channel, "voice") &&
        !newState.selfMute && !newState.selfDeaf
      ) {
        voiceStartMap.set(newState.id, {
          channel: newState.channel,
          time: Date.now(),
          lastSaved: Date.now()
        });
      }
    }
  }
  if (
    newState.channel && !newState.member.user.bot &&
    activity.isTracked(newState.channel, "voice")
  ) {
    const wasTracking = voiceStartMap.has(newState.id);
    if (
      (!oldState.selfMute && newState.selfMute) ||
      (!oldState.selfDeaf && newState.selfDeaf)
    ) {
      if (wasTracking) {
        const info = voiceStartMap.get(newState.id);
        const sec = Math.floor((Date.now() - info.lastSaved) / 1000);
        if (sec > 0) activity.addVoice(newState.id, sec, newState.channel);
        voiceStartMap.delete(newState.id);
      }
    }
    if (
      (oldState.selfMute && !newState.selfMute) ||
      (oldState.selfDeaf && !newState.selfDeaf)
    ) {
      if (!wasTracking && !newState.selfMute && !newState.selfDeaf) {
        voiceStartMap.set(newState.id, {
          channel: newState.channel,
          time: Date.now(),
          lastSaved: Date.now()
        });
      }
    }
  }
});

setInterval(() => {
  const now = Date.now();
  for (const [userId, info] of voiceStartMap.entries()) {
    let voiceState = null;
    for (const [guildId, guild] of client.guilds.cache) {
      if (guild.voiceStates.cache.has(userId)) {
        voiceState = guild.voiceStates.cache.get(userId);
        break;
      }
    }
    if (
      !voiceState ||
      voiceState.selfMute || voiceState.selfDeaf ||
      !activity.isTracked(info.channel, "voice")
    ) continue;

    const sec = Math.floor((now - info.lastSaved) / 1000);
    if (sec >= 60) {
      activity.addVoice(userId, sec, info.channel);
      voiceStartMap.set(userId, { ...info, lastSaved: now });
    }
  }
}, 60 * 1000);

setInterval(() => {
  for (const [guildId, guild] of client.guilds.cache) {
    const voiceStates = guild.voiceStates.cache;
    const channelMap = {};
    for (const vs of voiceStates.values()) {
      if (!vs.channelId || vs.member.user.bot) continue;
      if (!channelMap[vs.channelId]) channelMap[vs.channelId] = [];
      channelMap[vs.channelId].push(vs.member.id);
    }
    for (const ids of Object.values(channelMap)) {
      if (ids.length < 2) continue;
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          relationship.onPositive(ids[i], ids[j], 0.1);
          relationship.onPositive(ids[j], ids[i], 0.1);
        }
      }
    }
  }
}, 10 * 60 * 300);

setInterval(() => {
  relationship.decayRelationships(0.5);
}, 1000 * 60 * 60 * 24);

client.on("messageCreate", async msg => {
  if (msg.partial) {
    try { msg = await msg.fetch(); } catch { return; }
  }
  if (!msg.guild || msg.author.bot) return;
  if (msg.reference && msg.reference.messageId) {
    try {
      const repliedMsg = await msg.channel.messages.fetch(msg.reference.messageId).catch(() => null);
      if (repliedMsg && repliedMsg.author && !repliedMsg.author.bot && repliedMsg.author.id !== msg.author.id) {
        relationship.onPositive(msg.author.id, repliedMsg.author.id, 0.2);
        relationship.onPositive(repliedMsg.author.id, msg.author.id, 0.2);
      }
    } catch {}
  }
});

client.on("messageCreate", async msg => {
  if (msg.partial) {
    try { msg = await msg.fetch(); } catch { return; }
  }
  if (!msg.guild || msg.author.bot) return;
  if (msg.mentions && msg.mentions.users) {
    msg.mentions.users.forEach(user => {
      if (!user.bot && user.id !== msg.author.id) {
        relationship.onPositive(msg.author.id, user.id, 0.3);
        relationship.onPositive(user.id, msg.author.id, 0.3);
      }
    });
  }
});

client.on("messageReactionAdd", async (reaction, user) => {
  if (reaction.partial) {
    try { reaction = await reaction.fetch(); } catch { return; }
  }
  if (!reaction.message.guild || user.bot) return;
  const author = reaction.message.author;
  if (author && !author.bot && author.id !== user.id) {
    relationship.onPositive(user.id, author.id, 0.1);
    relationship.onPositive(author.id, user.id, 0.1);
  }
});

const activityPath = path.join(__dirname, "activity.json");

client.on("messageCreate", async message => {
  if (message.partial) {
    try { message = await message.fetch(); } catch { return; }
  }
  if (!message.guild || message.author.bot) return;
  let activity = {};
  if (fs.existsSync(activityPath)) {
    activity = JSON.parse(fs.readFileSync(activityPath));
  }
  activity[message.author.id] = Date.now();
  fs.writeFileSync(activityPath, JSON.stringify(activity, null, 2));
});

client.on('presenceUpdate', (oldPresence, newPresence) => {
  const userId = newPresence.userId;
  const user = newPresence.user || client.users.cache.get(userId);
  if (!user || user.bot) return;

  if (!newPresence.activities) return;
  newPresence.activities.forEach(activity => {
    if (activity.type === 0) {
      activityLogger.addActivity(userId, 'game', { name: activity.name });
    }
    if (activity.type === 2 && activity.name === 'Spotify') {
      activityLogger.addActivity(userId, 'music', {
        song: activity.details,
        artist: activity.state,
        album: activity.assets ? activity.assets.largeText : undefined
      });
    }
  });
});

const { rouletteGames, activeChannels, logRouletteResult } = require("./commands/game");

const TIMEOUT_OPTIONS = [
  { duration: 60,    chance: 0.4,  text: "1분" },
  { duration: 300,   chance: 0.3,  text: "5분" },
  { duration: 600,   chance: 0.2,  text: "10분" },
  { duration: 3600,  chance: 0.1,  text: "1시간" },
];

function getRandomTimeout() {
  let rand = Math.random();
  let acc = 0;
  for (const opt of TIMEOUT_OPTIONS) {
    acc += opt.chance;
    if (rand < acc) return opt;
  }
  return TIMEOUT_OPTIONS[TIMEOUT_OPTIONS.length - 1];
}

client.on("messageCreate", async message => {
  if (message.partial) {
    try { message = await message.fetch(); } catch { return; }
  }
  if (message.author.bot) return;
  const channelId = message.channel.id;
  const game = rouletteGames.get(channelId);
  if (!game || !game.inProgress) return;

  const user = message.author;
  const isTurn = game.participants[game.currentTurn].id === user.id;

  const sendNextTurn = async () => {
    if (game.timeout) clearTimeout(game.timeout);
    const current = game.participants[game.currentTurn];
    await message.channel.send(`🎯 <@${current.id}>님의 차례입니다. \`장전\`을 입력해주세요.`);
    game.timeout = setTimeout(() => {
      const msgs = [
        "다이너마이트가 터졌습니다. 너무 늦었습니다.",
        "타이머가 끝났습니다... 그리고 당신도."
      ];
      const msg = msgs[Math.floor(Math.random() * msgs.length)];
      rouletteGames.delete(channelId);
      activeChannels.delete(channelId);
      message.channel.send(`☠️ **${current.username}** 님이 폭사!\n💣 ${msg}\n\n게임 종료.`);
      logRouletteResult({
        timestamp: new Date().toISOString(),
        channel: message.channel.name,
        players: game.participants.map(p => p.username),
        dead: current.username,
        messages: msg,
      });
    }, 20000);
  };

  if (["!장전", "장전"].includes(message.content)) {
    if (!isTurn) return message.reply("❌ 지금은 당신 차례가 아닙니다!");
    if (game.isLoaded) return message.reply("❗ 이미 장전되었습니다. `발사`를 입력하세요!");
    if (game.timeout) clearTimeout(game.timeout);
    const tensionMsgs = ["서늘한 기분이 든다.", "어디서 화약 냄새가 난다.."];
    game.isLoaded = true;
    return message.reply(`🔫 ${tensionMsgs[Math.floor(Math.random() * tensionMsgs.length)]} 이제 \`발사\`를 입력하세요.`);
  }

  if (["!격발", "발사"].includes(message.content)) {
    if (!isTurn) return message.reply("❌ 지금은 당신 차례가 아닙니다!");
    if (!game.isLoaded) return message.reply("❗ 먼저 \`장전\`을 입력해야 합니다!");
    if (game.timeout) clearTimeout(game.timeout);

    const deathChance = Math.random();
    if (deathChance < 0.39) {
      const timeoutOption = getRandomTimeout();
      const timeoutMs = timeoutOption.duration * 1000;
      const reason = "러시안룰렛 패배!";
      const deathMsgs = [
        `삼가 고인의 명복을 빕니다. ${timeoutOption.text} 타임아웃 벌칙이 적용됩니다.`,
        `펑! 그리고 정적... ${timeoutOption.text} 동안 말을 할 수 없습니다.`,
        `💀 불운하게도 ${timeoutOption.text} 타임아웃에 당첨!`
      ];
      const msg = deathMsgs[Math.floor(Math.random() * deathMsgs.length)];
      rouletteGames.delete(channelId);
      activeChannels.delete(channelId);

      let timeoutApplied = false;
      try {
        const guildMember = await message.guild.members.fetch(user.id);
        if (
          guildMember.permissions.has("Administrator") ||
          !guildMember.moderatable ||
          guildMember.roles.highest.position >= message.guild.members.me.roles.highest.position
        ) {
          await message.channel.send(`헉! 해당 유저는 프론트맨이었습니다. 벌칙을 받지 않습니다!`);
        } else {
          await guildMember.timeout(timeoutMs, reason);
          timeoutApplied = true;
          await message.channel.send(`💥 **${user.username}** 님이 사망했습니다.\n${msg}\n\n게임 종료.`);
        }
      } catch (err) {
        if (!timeoutApplied) {
          await message.channel.send(`헉! 해당 유저는 프론트맨이었습니다. 벌칙을 받지 않습니다!`);
        } else {
          await message.channel.send(`⚠️ 타임아웃 적용 중 오류 발생!`);
        }
      }

      logRouletteResult({
        timestamp: new Date().toISOString(),
        channel: message.channel.name,
        players: game.participants.map(p => p.username),
        dead: user.username,
        messages: msg,
        timeout: timeoutOption.text,
      });
    } else {
      const surviveMsgs = [
        "휴 살았다.",
        "응 살았죠?",
        "무빙~",
        "죽을 뻔...",
        "아찔했다."
      ];
      const surviveMsg = surviveMsgs[Math.floor(Math.random() * surviveMsgs.length)];
      game.isLoaded = false;
      game.currentTurn = (game.currentTurn + 1) % game.participants.length;
      await message.channel.send(`😮 **${user.username}** 님은 살아남았습니다!\n🫣 ${surviveMsg}`);
      sendNextTurn();
    }
  }
});

const bePath = path.join(__dirname, "data/BE.json");
function loadBE() {
  if (!fs.existsSync(bePath)) fs.writeFileSync(bePath, "{}");
  return JSON.parse(fs.readFileSync(bePath, "utf8"));
}
function saveBE(data) {
  fs.writeFileSync(bePath, JSON.stringify(data, null, 2));
}
function addBE(userId, amount, reason = "") {
  const be = loadBE();
  if (!be[userId]) be[userId] = { amount: 0, history: [] };
  be[userId].amount += amount;
  be[userId].history.push({
    type: "earn",
    amount,
    reason,
    timestamp: Date.now()
  });
  saveBE(be);
}

client.on("messageCreate", async msg => {
  if (msg.partial) {
    try { msg = await msg.fetch(); } catch { return; }
  }
  if (msg.author.bot) return;
  if (!msg.guild || !msg.channel || !msg.content) return;
  if (
    msg.channel.type === 0 &&
    msg.channel.topic &&
    msg.channel.topic.includes("파랑 정수")
  ) {
    if (Math.random() < 0.01) {
      const r = Math.random();
      let reward = 0;
      let msgText = "";
      if (r < 0.7) {
        reward = Math.floor(Math.random() * (1000 - 100 + 1)) + 100;
        msgText = `-# 🔷 <@${msg.author.id}>님이 파랑 정수 ${reward.toLocaleString()} BE를 주웠습니다.`;
      } else if (r < 0.9) {
        reward = Math.floor(Math.random() * (5000 - 1001 + 1)) + 1001;
        msgText = `-# 🔷 <@${msg.author.id}>님이 파랑 정수 ${reward.toLocaleString()} BE를 획득했습니다.`;
      } else if (r < 0.97) {
        reward = Math.floor(Math.random() * (10000 - 5001 + 1)) + 5001;
        msgText = `-# 🔷 <@${msg.author.id}>님이 두둑하게 파랑 정수 ${reward.toLocaleString()} BE를 획득했습니다.`;
      } else if (r < 0.99) {
        reward = Math.floor(Math.random() * (30000 - 10001 + 1)) + 10001;
        msgText = `-# 🔷 <@${msg.author.id}>님이 희귀한 확률로 파랑 정수 ${reward.toLocaleString()} BE를 손에 넣었습니다.`;
      } else if (r < 0.998) {
        reward = Math.floor(Math.random() * (40000 - 30001 + 1)) + 30001;
        msgText = `-# 🔷 <@${msg.author.id}>님이 특급 파랑 정수 ${reward.toLocaleString()} BE를 획득합니다!`;
      } else {
        reward = Math.floor(Math.random() * (50000 - 40001 + 1)) + 40001;
        msgText = `-# 🔷 <@${msg.author.id}>님에게 레전드 상황 발생! 파랑 정수 ${reward.toLocaleString()} BE가 쏟아집니다!`;
      }

      const member = await msg.guild.members.fetch(msg.author.id).catch(() => null);
      let finalReward = reward;
      let tag = "";
      if (member) {
        const isBooster = !!member.premiumSince;
        const isDonor = member.roles.cache.has("1397076919127900171");
        if (isDonor) {
          finalReward = reward * 2;
          tag = ` [ 𝕯𝖔𝖓𝖔𝖗 보정: ${reward.toLocaleString()} → ${finalReward.toLocaleString()} ]`;
        } else if (isBooster) {
          finalReward = Math.floor(reward * 1.5);
          tag = ` [ 부스터 보정: ${reward.toLocaleString()} → ${finalReward.toLocaleString()} ]`;
        }
      }

      addBE(msg.author.id, finalReward, "채널 주제 보상");
      msg.channel.send(msgText + tag);
    }
  }
});

const report = require('./commands/report.js');
const complaint = require('./commands/complaint.js');
const punishGuide = require('./commands/punishment-guide.js');
const warnCheck = require('./commands/warncheck.js');
const gameTag = require('./commands/select-game.js');
const serverTag = require('./commands/select-settings.js');
const serverInfo = require('./commands/serverInfo.js');
const serverRules = require('./commands/server-rules.js');
const levelGuide = require('./commands/level-guide.js');
const profileRegister = require('./commands/profile-register.js');
const profileEdit = require('./commands/profile-edit.js');
const genji = require('./commands/genji.js');
const adventure = require('./commands/adventure.js');
const genjiRank = require('./commands/genji-rank.js');
const adventureRank = require('./commands/adventure-rank.js');
const botPull = require('./commands/bot-pull.js');
const botDeployCommands = require('./commands/bot-deploy-commands.js');
const botRestart = require('./commands/bot-restart.js');
const setStatus = require('./commands/setstatus.js');
const removeStatus = require('./commands/removestatus.js');


require("./utils/activity-stats");

process.on("uncaughtException", async (err) => {
  console.error("❌ uncaughtException:", err);
  try {
    const logChannel = await client.channels.fetch(LOG_CHANNEL_ID);
    if (logChannel && logChannel.isTextBased()) {
      await logChannel.send(`❌ **[uncaughtException] 봇에 예기치 못한 오류!**\n\`\`\`\n${err.stack.slice(0, 1900)}\n\`\`\``);
    }
  } catch (logErr) {}
  setTimeout(() => process.exit(1), 3000);
});

process.on("unhandledRejection", async (reason) => {

  try {
    const logChannel = await client.channels.fetch(LOG_CHANNEL_ID);
    if (logChannel && logChannel.isTextBased()) {
      await logChannel.send(`⚠️ **[unhandledRejection] 처리되지 않은 예외 발생!**\n\`\`\`\n${String(reason).slice(0, 1900)}\n\`\`\``);
    }
  } catch (logErr) {}
});

const { saveTaxSnapshot, collectTaxFromSnapshot } = require('./utils/tax-collect.js');
const cron = require('node-cron');

cron.schedule('55 17 * * *', () => {
  saveTaxSnapshot();
  console.log('정수세 스냅샷 저장 완료');
}, { timezone: 'Asia/Seoul' });

cron.schedule('0 18 * * *', async () => {
  await collectTaxFromSnapshot(global.client);
  console.log('정수세 납부 완료');
}, { timezone: 'Asia/Seoul' });

const lockfile = require('proper-lockfile');
const coinsPath = path.join(__dirname, './data/godbit-coins.json');
const SIMPLE_COIN_CHANNEL = '1381193562330370048';

client.on('messageCreate', async (msg) => {
  if (msg.channel.id !== SIMPLE_COIN_CHANNEL) return;
  if (msg.author.bot) return;
  if (!msg.content.startsWith('!')) return;

  const keyword = msg.content.slice(1).trim();
  if (!keyword.endsWith('코인')) return;
  
  const coinName = keyword;
  if (!fs.existsSync(coinsPath)) return;
  let coins;
  try {
    const release = await lockfile.lock(coinsPath, { retries: 2, stale: 2500 });
    coins = JSON.parse(fs.readFileSync(coinsPath, 'utf8'));
    release();
  } catch (e) {
    return;
  }
  const info = coins[coinName];
  if (!info) return;
  if (info.delistedAt) {
    msg.channel.send(`-# [${coinName}] 폐지된 코인입니다.`);
    return;
  }
  const price = Number(info.price).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  msg.channel.send(`-# [${coinName}] ${price} BE`);
});

setInterval(async () => {
  if (!client || !client.user || !client.ws || client.ws.status !== 0) {
    console.warn("🛑 클라이언트 연결이 끊겼습니다. 재로그인 시도 중...");
    try {
      await client.destroy();
      await client.login(process.env.DISCORD_TOKEN);
    } catch (err) {
      console.error("🔁 재접속 실패:", err);
    }
  }
}, 1000 * 60 * 1800);

client.on("messageCreate", async msg => {
  if (!msg.guild || msg.author.bot) return;
  if (msg.content === "!봇퇴장" && msg.author.id === OWNER_ID) {
  try { await msg.reply("-# 이 길드에서 떠날게."); } catch {}
  try {
    const logChannel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    const ts = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
    if (logChannel?.isTextBased?.()) {
      await logChannel.send(`-# 🚶 **소유자 명령으로 서버 퇴장**\n**서버:** ${msg.guild?.name ?? "알 수 없음"} (\`${msg.guild?.id ?? "?"}\`)\n**요청자:** <@${msg.author.id}> (\`${msg.author.tag}\`)\n**시간:** ${ts}`);
    }
  } catch {}
  try { await msg.guild.leave(); } catch {}
  return;
}
});

client.login(process.env.DISCORD_TOKEN);

const WELCOME_ROLE_ID = '1286237811959140363';
const WELCOME_CHANNEL_ID = '1202425624061415464';

client.on(Events.GuildMemberAdd, async member => {
  try {
    if (!member.roles.cache.has(WELCOME_ROLE_ID)) {
      await member.roles.add(WELCOME_ROLE_ID, '서버 첫 입장시 자동 역할 부여');
    }
  } catch (err) {
    console.error('[환영 역할 부여 실패]', err);
  }
});

client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return;
  if (message.channel.id !== WELCOME_CHANNEL_ID) return;
  if (!message.guild) return;

  const member = message.member;
  if (!member) return;

  if (member.roles.cache.has(WELCOME_ROLE_ID)) {
    try {
      await member.roles.remove(WELCOME_ROLE_ID, '환영 채널에서 채팅하여 역할 제거');
    } catch (err) {
      console.error('[환영 역할 제거 실패]', err);
    }
  }
});

client.on(Events.GuildMemberAdd, async member => {
});

client.on(Events.GuildMemberRemove, async member => {
  try {
    await trackJoinLeave(member.user, client);
  } catch (err) {
    console.error("[퇴장 추적 오류]", err);
  }
});

client.on(Events.GuildDelete, async guild => {
  try {
    const logChannel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    const ts = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
    if (logChannel?.isTextBased?.()) {
      await logChannel.send(`-# ❌ **봇이 서버에서 제거됨/퇴장됨**\n**서버:** ${guild?.name ?? "알 수 없음"} (\`${guild?.id ?? "?"}\`)\n**시간:** ${ts}`);
    }
  } catch {}
});

const dmRelay = require('./commands/dm.js');
dmRelay.relayRegister(client);

const statusPath = path.join(__dirname, "data/status.json");

function loadStatus() {
  if (!fs.existsSync(statusPath)) fs.writeFileSync(statusPath, '{}');
  return JSON.parse(fs.readFileSync(statusPath, 'utf8'));
}

const ALLOWED_CHANNEL_IDS = [
  "1202425624061415464",
];
const ALLOWED_CATEGORY_IDS = [
  "1207980297854124032",
];

client.on("messageCreate", async msg => {
  if (!msg.guild || msg.author.bot) return;

  const inAllowedTextChannel = ALLOWED_CHANNEL_IDS.includes(msg.channel.id);
  const inAllowedCategory    = msg.channel.parentId && ALLOWED_CATEGORY_IDS.includes(msg.channel.parentId);
  if (!inAllowedTextChannel && !inAllowedCategory) return;

  const status = loadStatus();
  const members = [...(msg.mentions.members?.values() ?? [])]
    .filter(m => status[m.id]);

  if (members.length === 0) return;

  const lines = members.map(m => `-# [상태] ${m.displayName}님은 ${status[m.id]}`);
  try { await msg.channel.send(lines.join("\n")); } catch {}
});

client.on('guildMemberRemove', member => {
  activityLogger.removeUser(member.id);
});

require("./utils/auto-afk-move")(client);
require('./utils/pm2-autorestart')();

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("봇이 실행 중입니다!");
});

app.listen(PORT, () => {
  console.log(`✅ Express 서버가 ${PORT}번 포트에서 실행 중입니다.`);
});
