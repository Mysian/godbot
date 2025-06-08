const fs = require("fs");
const path = require("path");
const express = require("express");
const { Client, Collection, GatewayIntentBits } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.MessageContent,
  ],
});

require("dotenv").config();
const LOG_CHANNEL_ID = "1381062597230460989";

// ✅ 명령어 등록
client.commands = new Collection();
const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs
  .readdirSync(commandsPath)
  .filter((file) => file.endsWith(".js"));
for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  client.commands.set(command.data.name, command);
}

// ✅ Ready 시 로그만 전송
client.once("ready", async () => {
  console.log(`✅ 봇 로그인 완료: ${client.user.tag}`);
  const logChannel = await client.channels
    .fetch(LOG_CHANNEL_ID)
    .catch(() => null);
  if (logChannel && logChannel.isTextBased()) {
    logChannel.send(
      `🔁 봇이 재시작되었습니다! (${new Date().toLocaleString("ko-KR")})`,
    );
  }
});

// ✅ 슬래시 명령어 처리
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return;
  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    await interaction.reply({
      content: "❌ 명령어 실행 중 오류가 발생했어요.",
      ephemeral: true,
    });
    const logChannel = await client.channels
      .fetch(LOG_CHANNEL_ID)
      .catch(() => null);
    if (logChannel && logChannel.isTextBased()) {
      logChannel.send(
        `❗ 명령어 오류 발생\n\`\`\`\n${error.stack?.slice(0, 1900)}\n\`\`\``,
      );
    }
  }
});

// ✅ 게임 모듈 통합
const {
  rouletteGames,
  activeChannels,
  logRouletteResult,
} = require("./commands/game");

// ✅ 게임 메시지 핸들링
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  const channelId = message.channel.id;
  const game = rouletteGames.get(channelId);
  if (!game || !game.inProgress) return;

  const user = message.author;
  const isTurn = game.participants[game.currentTurn].id === user.id;

  const sendNextTurn = async () => {
    if (game.timeout) clearTimeout(game.timeout);
    const current = game.participants[game.currentTurn];
    await message.channel.send(
      `🎯 <@${current.id}>님의 차례입니다. !장전 입력해주세요.`,
    );
    game.timeout = setTimeout(() => {
      const msgs = [
        "다이너마이트가 터졌습니다. 너무 늦었습니다.",
        "타이머가 끝났습니다... 그리고 당신도.",
      ];
      const msg = msgs[Math.floor(Math.random() * msgs.length)];
      rouletteGames.delete(channelId);
      activeChannels.delete(channelId);
      message.channel.send(
        `☠️ **${current.username}** 님이 폭사!\n💣 ${msg}\n\n게임 종료.`,
      );
      logRouletteResult({
        timestamp: new Date().toISOString(),
        channel: message.channel.name,
        players: game.participants.map((p) => p.username),
        dead: current.username,
        messages: msg,
      });
    }, 20000);
  };

  if (message.content === "!장전") {
    if (!isTurn) return message.reply("❌ 지금은 당신 차례가 아닙니다!");
    if (game.isLoaded)
      return message.reply("❗ 이미 장전되었습니다. !격발을 입력하세요!");
    if (game.timeout) clearTimeout(game.timeout);
    const tensionMsgs = ["서늘한 기분이 든다.", "어디서 화약 냄새가 난다.."];
    game.isLoaded = true;
    return message.reply(
      `🔫 ${tensionMsgs[Math.floor(Math.random() * tensionMsgs.length)]} 이제 !격발을 입력하세요.`,
    );
  }

  if (message.content === "!격발") {
    if (!isTurn) return message.reply("❌ 지금은 당신 차례가 아닙니다!");
    if (!game.isLoaded)
      return message.reply("❗ 먼저 !장전을 입력해야 합니다!");
    if (game.timeout) clearTimeout(game.timeout);

    const deathChance = Math.random();
    if (deathChance < 0.23) {
      const deathMsgs = ["삼가 고인의 명복을 빕니다.", "펑! 그리고 정적..."];
      const msg = deathMsgs[Math.floor(Math.random() * deathMsgs.length)];
      rouletteGames.delete(channelId);
      activeChannels.delete(channelId);
      message.channel.send(
        `💥 **${user.username}** 님이 사망했습니다.\n${msg}\n\n게임 종료.`,
      );
      logRouletteResult({
        timestamp: new Date().toISOString(),
        channel: message.channel.name,
        players: game.participants.map((p) => p.username),
        dead: user.username,
        messages: msg,
      });
    } else {
      const surviveMsgs = ["휴 살았다.", "응 살았죠?", "무빙~"];
      const surviveMsg =
        surviveMsgs[Math.floor(Math.random() * surviveMsgs.length)];
      game.isLoaded = false;
      game.currentTurn = (game.currentTurn + 1) % game.participants.length;
      await message.channel.send(
        `😮 **${user.username}** 님은 살아남았습니다!\n🫣 ${surviveMsg}`,
      );
      sendNextTurn();
    }
  }
});

// ✅ 예외 핸들링
process.on("uncaughtException", async (err) => {
  console.error("❌ uncaughtException:", err);
  try {
    const logChannel = await client.channels.fetch(LOG_CHANNEL_ID);
    if (logChannel && logChannel.isTextBased()) {
      await logChannel.send(
        `❌ **[uncaughtException] 봇에 예기치 못한 오류!**\n\`\`\`\n${err.stack.slice(0, 1900)}\n\`\`\``,
      );
    }
  } catch (logErr) {}
  setTimeout(() => process.exit(1), 3000);
});

process.on("unhandledRejection", async (reason) => {
  console.error("⚠️ unhandledRejection:", reason);
  try {
    const logChannel = await client.channels.fetch(LOG_CHANNEL_ID);
    if (logChannel && logChannel.isTextBased()) {
      await logChannel.send(
        `⚠️ **[unhandledRejection] 처리되지 않은 예외 발생!**\n\`\`\`\n${String(reason).slice(0, 1900)}\n\`\`\``,
      );
    }
  } catch (logErr) {}
});

// ✅ 핑 서버 (필요 시 유지 가능)
const server = express();
server.all("/", (req, res) => res.send("봇이 깨어있어요!"));
server.listen(3000, () => {
  console.log("✅ 핑 서버 활성화 완료 (포트 3000)");
});
setInterval(
  () => {
    require("http").get("https://godbot.leeyoungmin3123.repl.co");
  },
  1000 * 60 * 5,
);

// ✅ 자동 재접속 모니터링
setInterval(
  async () => {
    if (!client || !client.user || !client.ws || client.ws.status !== 0) {
      console.warn("🛑 클라이언트 연결이 끊겼습니다. 재로그인 시도 중...");
      try {
        await client.destroy();
        await client.login(process.env.DISCORD_TOKEN);
      } catch (err) {
        console.error("🔁 재접속 실패:", err);
      }
    }
  },
  1000 * 60 * 5,
);

// ✅ 봇 로그인
client.login(process.env.DISCORD_TOKEN);
