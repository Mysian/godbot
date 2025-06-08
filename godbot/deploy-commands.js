require("dotenv").config();
const { REST, Routes } = require("discord.js");
const fs = require("fs");

const CLIENT_ID = "1380841362752274504";
const GUILD_ID = "785841387396005948";

const commands = [];
const commandFiles = fs
  .readdirSync("./commands")
  .filter((file) => file.endsWith(".js"));

for (const file of commandFiles) {
  const commandModule = require(`./commands/${file}`);

  // 배열 형태인지, 단일 명령어인지 구분
  if (Array.isArray(commandModule.data)) {
    for (const cmd of commandModule.data) {
      commands.push(cmd.toJSON());
    }
  } else {
    commands.push(commandModule.data.toJSON());
  }
}

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
  try {
    console.log("🔄 슬래시 명령어 등록 중...");

    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
      body: commands,
    });

    console.log("✅ 슬래시 명령어 등록 완료!");
  } catch (error) {
    console.error(error);
  }
})();
