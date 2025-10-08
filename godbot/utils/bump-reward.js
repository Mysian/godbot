const fs = require("fs");
const path = require("path");
const { addBE } = require("../commands/be-util.js");

const TARGET_CHANNEL_ID = "1215630657393528842";
const DISBOARD_BOT_ID = "302050872383242240";
const STREAK_PATH = path.join(__dirname, "../data/bump-streak.json");

function loadStreak() {
  if (!fs.existsSync(STREAK_PATH)) fs.writeFileSync(STREAK_PATH, "{}");
  try { return JSON.parse(fs.readFileSync(STREAK_PATH, "utf8")); } catch { return {}; }
}
function saveStreak(data) {
  fs.writeFileSync(STREAK_PATH, JSON.stringify(data, null, 2));
}

module.exports = (client) => {
  client.on("messageCreate", async (msg) => {
    if (msg.author?.bot !== true) return;
    if (msg.channelId !== TARGET_CHANNEL_ID) return;
    if (msg.author.id !== DISBOARD_BOT_ID) return;
    const inter = msg.interaction;
    if (!inter || inter.commandName !== "bump") return;

    const user = inter.user;
    const guild = msg.guild;
    const member = guild?.members?.cache?.get(user.id) || user;

    const data = loadStreak();
    const ch = data[TARGET_CHANNEL_ID] || { lastUserId: null, streak: 0 };
    if (ch.lastUserId === user.id) ch.streak += 1;
    else { ch.lastUserId = user.id; ch.streak = 1; }
    let amount = ch.streak * 20000;
    if (amount > 200000) amount = 200000;
    data[TARGET_CHANNEL_ID] = ch;
    saveStreak(data);

    const reason = "DISBOARD bump 보상";
    await addBE(user.id, amount, reason);

    const name = member.displayName || member.username || user.username || "유저";
    const txt = `-# 🔹 ${name} 님의 bump에 감사를 표하며 정수가 ${amount.toLocaleString()} 만큼 지급됩니다. [연속 진행시 최대 20만 정수까지 지급]`;
    await msg.channel.send({ content: txt });
  });
};
