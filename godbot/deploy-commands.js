const fs = require("fs");
const path = require("path");
const { REST, Routes } = require("discord.js");
require("dotenv").config();

const commands = [];
const nameSet = new Set();
const commandFiles = fs.readdirSync("./commands").filter(file => file.endsWith(".js"));

for (const file of commandFiles) {
  const command = require(`./commands/${file}`);

  if (!command.data) {
    console.warn(`⚠️ ${file} 에 data가 없습니다.`);
    continue;
  }

  if (typeof command.data.toJSON === "function") {
    const cmdJSON = command.data.toJSON();

    // 이름 중복 검사
    if (nameSet.has(cmdJSON.name)) {
      console.error(`❌ [중복!] "${cmdJSON.name}" 명령어가 여러 파일에서 중복됨! (${file})`);
      continue;
    }
    nameSet.add(cmdJSON.name);
    commands.push(cmdJSON);
  } else {
    console.warn(`⚠️ ${file} 의 data는 toJSON을 지원하지 않습니다.`);
  }
}

// 명령어 이름 목록 출력
console.log("등록될 명령어 이름:", commands.map(x => x.name));

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
