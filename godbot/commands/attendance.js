// commands/attendance.js

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const bePath = path.join(__dirname, '../data/BE.json');
const earnCooldownPath = path.join(__dirname, '../data/earn-cooldown.json');
const profilesPath = path.join(__dirname, '../data/profiles.json');
const attendancePath = path.join(__dirname, '../data/attendance-data.json');
const activityTracker = require('../utils/activity-tracker');
const koreaTZ = 9 * 60 * 60 * 1000;

// ===== 유틸 함수 =====
function loadJson(p) {
  if (!fs.existsSync(p)) fs.writeFileSync(p, "{}");
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function saveJson(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}
function getUserBe(userId) {
  const be = loadJson(bePath);
  return be[userId]?.amount || 0;
}
function setUserBe(userId, diff, reason = "") {
  const be = loadJson(bePath);
  be[userId] = be[userId] || { amount: 0, history: [] };
  be[userId].amount += diff;
  be[userId].history.push({ type: diff > 0 ? "earn" : "lose", amount: Math.abs(diff), reason, timestamp: Date.now() });
  saveJson(bePath, be);
}
function getCooldown(userId, type) {
  const data = loadJson(earnCooldownPath);
  return data[userId]?.[type] || 0;
}
function setCooldown(userId, type, ms, midnight = false) {
  const data = loadJson(earnCooldownPath);
  data[userId] = data[userId] || {};
  data[userId][type] = midnight ? nextMidnightKR() : Date.now() + ms;
  saveJson(earnCooldownPath, data);
}
function nextMidnightKR() {
  const now = new Date(Date.now() + koreaTZ);
  now.setHours(0, 0, 0, 0);
  return now.getTime() - koreaTZ + 24 * 60 * 60 * 1000;
}
function hasProfile(userId) {
  if (!fs.existsSync(profilesPath)) return false;
  const profiles = JSON.parse(fs.readFileSync(profilesPath, 'utf8'));
  return !!profiles[userId];
}
function comma(n) {
  return n.toLocaleString('ko-KR');
}

// ====== 출석 명령어 ======
module.exports = {
  data: new SlashCommandBuilder()
    .setName('출석')
    .setDescription('오늘의 출석 체크로 BE를 받아가세요!'),
  async execute(interaction) {
    const userId = interaction.user.id;
    if (!hasProfile(userId)) {
      await interaction.reply({
        content: "❌ 프로필 정보가 없습니다!\n`/프로필등록` 명령어로 먼저 프로필을 등록해 주세요.",
        ephemeral: true
      });
      return;
    }

    const now = Date.now();
    const todayKST = new Date(Date.now() + koreaTZ).toISOString().slice(0,10);

    function getYesterdayKST() {
      const now = new Date(Date.now() + koreaTZ);
      now.setDate(now.getDate() - 1);
      now.setHours(0, 0, 0, 0);
      return now.toISOString().slice(0, 10);
    }
    function getUserActivity(userId, date) {
      try {
        const stats = activityTracker.getStats({from: date, to: date});
        return stats.find(s => s.userId === userId) || { voice: 0, message: 0 };
      } catch { return { voice: 0, message: 0 }; }
    }
    function getConsecutiveDays(userId, data, today) {
      const info = data[userId];
      if (!info) return 1;
      const lastDate = info.lastDate || null;
      const lastStreak = info.streak || 1;
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yyyymmdd = yesterday.toISOString().slice(0, 10);
      if (lastDate === yyyymmdd) return Math.min(lastStreak + 1, 1000);
      return 1;
    }
    function loadAttendance() {
      if (!fs.existsSync(attendancePath)) fs.writeFileSync(attendancePath, "{}");
      return JSON.parse(fs.readFileSync(attendancePath, 'utf8'));
    }
    function saveAttendance(data) {
      fs.writeFileSync(attendancePath, JSON.stringify(data, null, 2));
    }

    const next = getCooldown(userId, 'attendance');
    if (next > now) {
      const remain = Math.ceil((next - now) / 1000 / 60);
      await interaction.reply({ content: `⏰ 이미 출석했어! 다음 출석 가능까지 약 ${remain}분 남음.`, ephemeral: true });
      return;
    }

    const yesterdayKST = getYesterdayKST();
    const activity = getUserActivity(userId, yesterdayKST);
    const voiceSec = Math.min(activity.voice || 0, 72000);
    const msgCnt = Math.min(activity.message || 0, 10000);

    let voiceBE = Math.floor(voiceSec / 72000 * 30000);
    let chatBE = Math.floor(msgCnt / 10000 * 20000);

    let baseBE = voiceBE + chatBE;
    let randRate = Math.random() * 0.8 + 0.7;
    let reward = Math.floor(baseBE * randRate);

    let attendanceData = loadAttendance();
    let streak = getConsecutiveDays(userId, attendanceData, todayKST);
    let bonus = Math.min(streak * 50, 50000);

    reward += bonus;

    attendanceData[userId] = {
      lastDate: todayKST,
      streak: streak
    };
    saveAttendance(attendanceData);

    setUserBe(userId, reward, `출석 보상 (음성:${voiceBE} + 채팅:${chatBE} ×랜덤 ${randRate.toFixed(2)}, 연속${streak}일 보너스${bonus})`);
    setCooldown(userId, 'attendance', 0, true);

    let effectMsg = `음성 ${comma(voiceBE)} + 채팅 ${comma(chatBE)} ×(${randRate.toFixed(2)}) + 연속출석(${streak}일, ${comma(bonus)} BE)`;
    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setTitle(`📅 출석 완료! | 🔥 **연속 ${streak}일** 출석 중!`)
        .setDescription(
          `오늘의 출석 보상: **${comma(reward)} BE**\n` +
          `\n` +
          `▶️ **연속 출석 ${streak}일째!**\n` +
          `${effectMsg}\n` +
          `\n` +
          `\`연속 출석 보너스:\` **${comma(bonus)} BE**` +
          `\n\n(내일 자정 이후 다시 출석 가능!)`
        )
        .setColor(0x00aaff)
        .setFooter({ text: `연속 출석 기록은 하루라도 빠지면 1일부터 다시 시작!` })
      ],
      ephemeral: true
    });
    return;
  }
};
