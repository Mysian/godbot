// utils/joinLeaveTracker.js
const fs = require("fs");
const path = require("path");

const dataDir = path.join(__dirname, "../data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const TRACK_FILE = path.join(dataDir, "joinLeave.json");

function loadData() {
  try {
    return JSON.parse(fs.readFileSync(TRACK_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveData(data) {
  fs.writeFileSync(TRACK_FILE, JSON.stringify(data, null, 2), "utf8");
}

/**
 * 유저 퇴장 이력을 기록하고, 조건 만족 시 알림 보냄
 * @param {User} user - 디스코드 유저 객체
 * @param {Client} client - Discord.js 클라이언트
 */
async function trackJoinLeave(user, client) {
  const data = loadData();
  const uid = user.id;

  if (!data[uid]) data[uid] = { count: 0 };

  data[uid].count += 1;
  saveData(data);

  if (data[uid].count >= 2) {
    const channel = await client.channels.fetch("1342026335417270283").catch(() => null);
    if (channel && channel.isTextBased()) {
      channel.send(
        `⚠️ <@${uid}> (\`${uid}\`) 님은 ${data[uid].count}회 서버 들락 유저입니다.`
      );
    }
  }
}

module.exports = { trackJoinLeave };
