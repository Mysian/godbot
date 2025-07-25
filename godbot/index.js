const fs = require("fs");
const path = require("path");
const express = require("express");
const { Client, Collection, GatewayIntentBits, Events, ActivityType, StringSelectMenuBuilder, ActionRowBuilder, ModalBuilder,
  TextInputBuilder, EmbedBuilder } = require("discord.js");
require("dotenv").config();
const activity = require("./utils/activity-tracker");
const relationship = require("./utils/relationship.js");
const { ALL_GAMES } = require("./commands/select-game.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages,
  ],
  partials: ["CHANNEL", "MESSAGE", "REACTION"],
});
global.client = client; 

const LOG_CHANNEL_ID = "1382168527015776287";
module.exports.client = client;

client.commands = new Collection();

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

// ✅ 이벤트 핸들링
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

// === 갓비트 신규상장 자동갱신: 10분마다 ===
const { autoMarketUpdate } = require('./commands/godbit.js');
const GUILD_ID = process.env.GUILD_ID || '785841387396005948';

setInterval(async () => {
  try {
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) return;
    const members = await guild.members.fetch();
    await autoMarketUpdate(members);
  } catch (e) {
    console.error('갓비트 자동상장 오류:', e);
  }
}, 600_000);

// ✅ 봇 준비 완료 시 로그 전송 + 활동 상태 번갈아 표시
client.once(Events.ClientReady, async () => {
  console.log(`✅ 로그인됨! ${client.user.tag}`);

  const activityMessages = [
    "/챔피언획득으로 롤 챔피언을 키워보세요!",
    "/도움말 을 통해 까리한 기능들을 확인해보세요!",
    "/프로필등록 을 통해 자신의 개성을 뽐내세요!!",
    "/내기 를 통해 정수 내기를 진행해보세요"
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

  const logChannel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
  if (logChannel && logChannel.isTextBased()) {
    logChannel.send(`🔁 봇이 재시작되었습니다! (${new Date().toLocaleString("ko-KR")})`);
  }
});

// ✅ 명령어 사용 로그 전송 함수
async function sendCommandLog(interaction) {
  try {
    const logChannel = await interaction.client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    if (!logChannel || !logChannel.isTextBased()) return;
    const userTag = interaction.user.tag;
    const cmdName = interaction.commandName;
    const time = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

    // 👉 채널 정보 뽑기
    const channel = interaction.channel;
    const channelInfo = channel
      ? (channel.isDMBased()
          ? "DM"
          : `<#${channel.id}> (\`${channel.name}\`)`)
      : "알 수 없음";

    let extra = "";
    if (interaction.options && interaction.options.data) {
      extra = interaction.options.data.map(opt =>
        `\`${opt.name}: ${opt.value}\``
      ).join(", ");
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
  } catch (e) { /* 무시 */ }
}


// === 모달 커스텀ID 핸들러 등록 (한 곳에서)
const modalHandlers = new Map([
  ["rps_bet_modal", async (interaction) => {
  const cmd = client.commands.get("정수획득");
  if (cmd?.modal) return cmd.modal(interaction);
}],
["blackjack_bet_modal", async (interaction) => {
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
  // 필요하면 추가로 더 여기에 등록
]);

const warnCmd = client.commands.get("경고");
const unwarnCmd = client.commands.get("경고취소");
const champBattle = require('./commands/champ-battle');
const remoteCmd = client.commands.get("리모콘");
const donateCmd = client.commands.get('후원');

client.on(Events.InteractionCreate, async interaction => {

// 0. 게임 검색 모달 제출 처리 → 즉시 태그 토글
if (interaction.isModalSubmit() && interaction.customId === "gameSearchModal") {
  const keyword = interaction.fields.getTextInputValue("searchKeyword");
  // 2) 각 글자를 순서대로 포함하는 fuzzy regex 생성
  const pattern = keyword
    .toLowerCase()
    .split("")
    .map(c => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  const regex = new RegExp(pattern);

  // 3) fuzzy 매칭
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

  // 4) 태그 토글
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

  // 5) 현재 등록된 태그 임베드로 보여주기
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

   // === 내기 셀렉트/모달 통합 처리 ===
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

  // 1. 경고 카테고리/세부사유 SelectMenu warn
  if (
    interaction.isStringSelectMenu() &&
    (interaction.customId.startsWith("warn_category_") || interaction.customId.startsWith("warn_reason_"))
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

  // 리모콘 음성채널 상태 변경 및 빠른 이동 관련
  if (interaction.isButton() && remoteCmd && interaction.customId.startsWith("remote_move_")) {
    await remoteCmd.handleButton(interaction);
    return;
  }

  // 💖 후원 안내 버튼(공지 등)
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

  // 2. 모달 통합 처리 (여기만 바뀜!)
  if (interaction.isModalSubmit()) {
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
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: "❣️ 진행 완료", ephemeral: true }).catch(() => {});
      }
    }
    return;
  }

  // 3. 챔피언배틀 명령어
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

  // 4. 챔피언배틀 버튼
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

  
  // 7. 그 외 명령어/버튼(로그 및 명령어 실행)
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

// === 메시지 누적 ===
client.on("messageCreate", async msg => {
  if (msg.partial) {
    try { msg = await msg.fetch(); } catch { return; }
  }
  if (msg.guild && !msg.author.bot) {
    activity.addMessage(msg.author.id, msg.channel);
  }
});

// 3시간마다 랜덤 포인트
const { setup: setupFastGive } = require('./utils/be-fastgive.js');
setupFastGive(client);


// === 음성 누적 + 1시간 알림 ===
const voiceStartMap = new Map();
client.on("voiceStateUpdate", (oldState, newState) => {
  if (!oldState.channel && newState.channel && !newState.member.user.bot) {
    if (activity.isTracked(newState.channel, "voice")) {
      voiceStartMap.set(newState.id, { channel: newState.channel, time: Date.now(), notifiedHour: 0 });
    }
  }
  if (oldState.channel && (!newState.channel || oldState.channel.id !== newState.channel.id)) {
    const info = voiceStartMap.get(oldState.id);
    if (info && activity.isTracked(oldState.channel, "voice")) {
      const sec = Math.floor((Date.now() - info.time) / 1000);
      activity.addVoice(oldState.id, sec, oldState.channel);
      voiceStartMap.delete(oldState.id);
    }
    if (newState.channel && !newState.member.user.bot) {
      if (activity.isTracked(newState.channel, "voice")) {
        voiceStartMap.set(newState.id, { channel: newState.channel, time: Date.now(), notifiedHour: 0 });
      }
    }
  }
});

// ✅ 음성채널 동접 관계도 자동상승
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
  relationship.decayRelationships(0.5); // 3일 이상 교류 없으면 자동 차감
}, 1000 * 60 * 60 * 24);

// ✅ 답글 상호작용 시 관계도 상승
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

// ✅ 멘션 시 관계도 상승
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

// ✅ 이모지 리액션 시 관계도 상승
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

// 유저 활동기록 체크 코드
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

// ✅ 게임 메시지 핸들링 (러시안룰렛 등)
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

  // !장전, !격발 → 장전, 발사로도 인식
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
      // 타임아웃 벌칙 뽑기
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

      // 멤버 타임아웃 적용 (권한/관리자 예외 처리)
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


// 파랑 정수(보상) 기능 등 기존 로직은 유지
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
      // 기존 확률별 메시지, 이모지
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

      // 배율/최종보상 처리
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

// 상시 클릭 가능 버튼형 공지 모달
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
const godbitSimple = require('./commands/godbit-simple.js');
const setStatus = require('./commands/setstatus.js');
const removeStatus = require('./commands/removestatus.js');

client.on(Events.InteractionCreate, async interaction => {
  // 갓비트 시세 요약 버튼 처리
  if (interaction.isButton() && interaction.customId === 'godbit_simple_summary') {
  interaction.options = { getString: () => null };
  await godbitSimple.execute(interaction);
  return;
}

  // 공유된 내기에 참여하기
  if (interaction.isButton() && interaction.customId.startsWith("bet_share_join_")) {
  const betCmd = client.commands.get("내기");
  if (betCmd?.modal) return betCmd.modal(interaction);
  return;
}

  // 버튼만 처리, 나머지는 무시
  if (!interaction.isButton()) return;

  // "_open"으로 끝나는 버튼만 index.js에서 직접 처리!
  if (interaction.customId.endsWith('_open')) {
    try {
      // 1. 신고/민원 세트
      if (interaction.customId === 'complaint_open') return await complaint.execute(interaction);
      if (interaction.customId === 'report_open') return await report.execute(interaction);
      if (interaction.customId === 'punish_guide_open') return await punishGuide.execute(interaction);
      if (interaction.customId === 'warn_check_open') return await warnCheck.execute(interaction);

      // 2. 태그 세트
      if (interaction.customId === 'game_tag_open') return await gameTag.execute(interaction);
      if (interaction.customId === 'server_tag_open') return await serverTag.execute(interaction);

      // 3. 안내 세트
      if (interaction.customId === 'serverinfo_open') return await serverInfo.execute(interaction);
      if (interaction.customId === 'serverrules_open') return await serverRules.execute(interaction);
      if (interaction.customId === 'levelguide_open') return await levelGuide.execute(interaction);

      // 4. 프로필 관리 세트
      if (interaction.customId === 'profile_register_open') return await profileRegister.execute(interaction);
      if (interaction.customId === 'profile_edit_open') return await profileEdit.execute(interaction);

      // 5. 겐지/모험/랭킹 세트
      if (interaction.customId === 'genji_open') return await genji.execute(interaction);
      if (interaction.customId === 'adventure_open') return await adventure.execute(interaction);
      if (interaction.customId === 'genji_rank_open') return await genjiRank.execute(interaction);
      if (interaction.customId === 'adventure_rank_open') return await adventureRank.execute(interaction);

      // 6. 봇 관리 버튼 세트
      if (interaction.customId === 'bot_pull_open') return await botPull.execute(interaction);
      if (interaction.customId === 'bot_deploy_commands_open') return await botDeployCommands.execute(interaction);
      if (interaction.customId === 'bot_restart_open') return await botRestart.execute(interaction);

      // 7. 상태 설정 afk
      if (interaction.customId === 'set_status_open') return await setStatus.execute(interaction);
      if (interaction.customId === 'remove_status_open') return await removeStatus.execute(interaction);

      if (interaction.customId === 'prev' || interaction.customId === 'next') return;
      // ================================
    } catch (err) {
      if (err?.code === 10062) return;
      console.error('버튼 핸들러 오류:', err);
    }
    return;
  }

  // "_open" 아닌 버튼은 무시(페이지네이션 등은 각 collector가 처리)
});

// 중복 처리 방지
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

// 1. 17:55 스냅샷 저장
cron.schedule('55 17 * * *', () => {
  saveTaxSnapshot();
  console.log('정수세 스냅샷 저장 완료');
}, { timezone: 'Asia/Seoul' });

// 2. 18:00 스냅샷 기준 세금 부과
cron.schedule('0 18 * * *', async () => {
  await collectTaxFromSnapshot(global.client);
  console.log('정수세 납부 완료');
}, { timezone: 'Asia/Seoul' });

// === 간단 코인 시세 조회 (!영갓코인 등) ===
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

client.login(process.env.DISCORD_TOKEN);

// 신규 첫 입장시 채팅방 인사 안하면 경험치 제한 룰
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

const dmRelay = require('./commands/dm.js');
dmRelay.relayRegister(client);

const statusPath = path.join(__dirname, "data/status.json");

function loadStatus() {
  if (!fs.existsSync(statusPath)) fs.writeFileSync(statusPath, '{}');
  return JSON.parse(fs.readFileSync(statusPath, 'utf8'));
}

// ✅ 멘션 상태 메시지 안내
const EXCLUDED_CHANNEL_IDS = [
  "1209147973255036959", // 제외할 채널ID
  "1203201767085572096",
  "1201723672495128636",
  "1264514955269640252"
];
const EXCLUDED_CATEGORY_IDS = [
  "1204329649530998794", // 제외할 카테고리ID
  "1211601490137980988"
];

client.on("messageCreate", async msg => {
  if (!msg.guild || msg.author.bot) return;
  // 채널ID 혹은 카테고리ID가 예외라면 리턴
  if (
    EXCLUDED_CHANNEL_IDS.includes(msg.channel.id) ||
    (msg.channel.parentId && EXCLUDED_CATEGORY_IDS.includes(msg.channel.parentId))
  ) return;

  const status = loadStatus();
  const mentioned = msg.mentions.members?.find(u => status[u.id]);
  if (mentioned) {
    try {
      await msg.channel.send(`-# [상태] ${mentioned.displayName}님은 ${status[mentioned.id]}`);
    } catch (e) {}
  }
});


// 120분 혼자 있는 경우 잠수방 이전
require("./utils/auto-afk-move")(client);

// 봇 자동 재시작 화, 목, 토
require('./utils/pm2-autorestart')();



const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("봇이 실행 중입니다!");
});

app.listen(PORT, () => {
  console.log(`✅ Express 서버가 ${PORT}번 포트에서 실행 중입니다.`);
});
