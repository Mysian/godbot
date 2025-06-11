const fs = require("fs");
const path = require("path");
const { REST, Routes } = require("discord.js");
require("dotenv").config();

const commands = [];
const commandFiles = fs.readdirSync("./commands").filter(file => file.endsWith(".js"));

for (const file of commandFiles) {
  const command = require(`./commands/${file}`);

  if (!command.data) {
    console.warn(`⚠️ ${file} 에 data가 없습니다.`);
    continue;
  }

  // SlashCommandBuilder 형식일 때만 등록
  if (typeof command.data.toJSON === "function") {
    commands.push(command.data.toJSON());
  } else {
    console.warn(`⚠️ ${file} 의 data는 toJSON을 지원하지 않습니다.`);
  }
}

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
  try {
    console.log("📡 명령어 등록 중...");
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log("✅ 명령어 등록 완료!");
  } catch (error) {
    console.error("❌ 등록 실패:", error);
  }
})();
