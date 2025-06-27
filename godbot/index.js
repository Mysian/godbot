const fs = require("fs");
const path = require("path");
const express = require("express");
const { Client, Collection, GatewayIntentBits, Events, ActivityType } = require("discord.js");
require("dotenv").config();
const activity = require("./utils/activity-tracker");
const relationship = require("./utils/relationship.js");

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

// ✅ 봇 준비 완료 시 로그 전송 + 활동 상태 번갈아 표시
client.once(Events.ClientReady, async () => {
  console.log(`✅ 로그인됨! ${client.user.tag}`);

  const activityMessages = [
    "/챔피언획득으로 롤 챔피언을 키워보세요!",
    "/도움말 을 통해 까리한 기능들을 확인해보세요!",
    "/프로필등록 을 통해 자신의 개성을 뽐내세요!!"
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
**시간:** ${time}`,
      color: 0x009688
    };
    await logChannel.send({ embeds: [embed] });
  } catch (e) { /* 무시 */ }
}

// === 모달 커스텀ID 핸들러 등록 (한 곳에서)
const modalHandlers = new Map([
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
  // 필요하면 추가로 더 여기에 등록
]);

const warnCmd = client.commands.get("경고");
const unwarnCmd = client.commands.get("경고취소");
const champBattle = require('./commands/champ-battle');

client.on(Events.InteractionCreate, async interaction => {
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

  // 5. 그 외 명령어/버튼(로그 및 명령어 실행)
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
const { setup: setupFastGive } = require('./commands/be-fastgive.js');
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
    await message.channel.send(`🎯 <@${current.id}>님의 차례입니다. !장전 입력해주세요.`);
    game.timeout = setTimeout(() => {
      const msgs = ["다이너마이트가 터졌습니다. 너무 늦었습니다.", "타이머가 끝났습니다... 그리고 당신도."];
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

  if (message.content === "!장전") {
    if (!isTurn) return message.reply("❌ 지금은 당신 차례가 아닙니다!");
    if (game.isLoaded) return message.reply("❗ 이미 장전되었습니다. !격발을 입력하세요!");
    if (game.timeout) clearTimeout(game.timeout);
    const tensionMsgs = ["서늘한 기분이 든다.", "어디서 화약 냄새가 난다.."];
    game.isLoaded = true;
    return message.reply(`🔫 ${tensionMsgs[Math.floor(Math.random() * tensionMsgs.length)]} 이제 !격발을 입력하세요.`);
  }

  if (message.content === "!격발") {
    if (!isTurn) return message.reply("❌ 지금은 당신 차례가 아닙니다!");
    if (!game.isLoaded) return message.reply("❗ 먼저 !장전을 입력해야 합니다!");
    if (game.timeout) clearTimeout(game.timeout);

    const deathChance = Math.random();
    if (deathChance < 0.39) {
      const deathMsgs = ["삼가 고인의 명복을 빕니다.", "펑! 그리고 정적..."];
      const msg = deathMsgs[Math.floor(Math.random() * deathMsgs.length)];
      rouletteGames.delete(channelId);
      activeChannels.delete(channelId);
      message.channel.send(`💥 **${user.username}** 님이 사망했습니다.\n${msg}\n\n게임 종료.`);
      logRouletteResult({
        timestamp: new Date().toISOString(),
        channel: message.channel.name,
        players: game.participants.map(p => p.username),
        dead: user.username,
        messages: msg,
      });
    } else {
      const surviveMsgs = ["휴 살았다.", "응 살았죠?", "무빙~"];
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
      const reward = Math.floor(Math.random() * 10) + 1;
      addBE(msg.author.id, reward, "채널 주제 보상");
      msg.channel.send(`🔷 <@${msg.author.id}>님이 파랑 정수 ${reward} BE 획득!`);
    }
  }
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
  console.error("⚠️ unhandledRejection:", reason);
  try {
    const logChannel = await client.channels.fetch(LOG_CHANNEL_ID);
    if (logChannel && logChannel.isTextBased()) {
      await logChannel.send(`⚠️ **[unhandledRejection] 처리되지 않은 예외 발생!**\n\`\`\`\n${String(reason).slice(0, 1900)}\n\`\`\``);
    }
  } catch (logErr) {}
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

const dmRelay = require('./commands/dm.js');
dmRelay.relayRegister(client);

// 후원 이미지 받기 지원
require("./utils/donate-dm-listener.js")(client);

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("봇이 실행 중입니다!");
});

app.listen(PORT, () => {
  console.log(`✅ Express 서버가 ${PORT}번 포트에서 실행 중입니다.`);
});
