// events/boost.js

const { EmbedBuilder } = require('discord.js');
const path = require('path');
const fs = require('fs');

const LOG_CHANNEL_ID = '1264514955269640252';
const BOOST_DATA_PATH = path.join(__dirname, '../data/boost.json');

function loadBoostData() {
  if (!fs.existsSync(BOOST_DATA_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(BOOST_DATA_PATH, "utf8"));
  } catch {
    return {};
  }
}
function saveBoostData(data) {
  fs.writeFileSync(BOOST_DATA_PATH, JSON.stringify(data, null, 2));
}

// 유지 공지용 기록 추가
function getAnnounceKey(month) {
  return `announce_${month}`;
}

module.exports = {
  name: "guildMemberUpdate",
  async execute(oldMember, newMember) {
    const logChannel = newMember.guild.channels.cache.get(LOG_CHANNEL_ID);
    if (!logChannel) return;

    const userId = newMember.id;
    let data = loadBoostData();

    // 부스트 시작 (없다가 생김)
    if (!oldMember.premiumSince && newMember.premiumSince) {
      const now = Date.now();
      // 부스트 새로 시작(리셋)
      data[userId] = { start: now };
      saveBoostData(data);

      const embed = new EmbedBuilder()
        .setColor(0xf47fff)
        .setTitle("🚀 서버 부스트 시작")
        .setDescription(`<@${userId}> 님이 서버 부스트를 시작했습니다!`)
        .addFields({ name: "지속 기간", value: "1개월째", inline: true })
        .setTimestamp(now);

      await logChannel.send({ embeds: [embed] });
    }

    // === 3개월 단위 유지 공지 ===
    // 부스트가 유지중일 때
    if (oldMember.premiumSince && newMember.premiumSince) {
      if (data[userId] && data[userId].start) {
        const start = data[userId].start;
        const now = Date.now();
        // 개월수 계산
        const months = Math.floor((now - start) / (1000 * 60 * 60 * 24 * 30)) + 1;

        // 3의 배수개월, 0이 아니고, 해당 안내 안 했으면
        if (months % 3 === 0 && months !== 0 && !data[userId][getAnnounceKey(months)]) {
          // 안내하고, 기록 남김
          data[userId][getAnnounceKey(months)] = true;
          saveBoostData(data);

          const embed = new EmbedBuilder()
            .setColor(0xf47fff)
            .setTitle("🎉 서버 부스트 꾸준히 유지 중!")
            .setDescription(`<@${userId}> 님이 서버 부스트를 **${months}개월째** 유지하고 있습니다! 진심으로 감사합니다.`)
            .setTimestamp(now);

          await logChannel.send({ embeds: [embed] });
        }
      }
    }

    // 부스트 해제 (있다가 없어짐)
    if (oldMember.premiumSince && !newMember.premiumSince) {
      let months = 1;
      if (data[userId] && data[userId].start) {
        const start = data[userId].start;
        const now = Date.now();
        months = Math.max(1, Math.floor((now - start) / (1000 * 60 * 60 * 24 * 30)) + 1);
        // 리셋
        delete data[userId];
        saveBoostData(data);
      }
      // 작게 -# 형식
      await logChannel.send(`-# <@${userId}> 님이 서버 부스트를 해제했습니다. (총 ${months}개월 유지)`);
    }
  }
};
