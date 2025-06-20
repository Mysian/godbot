const { SlashCommandBuilder, AttachmentBuilder } = require("discord.js");
const { createCanvas } = require("canvas");
const activity = require("../utils/activity-tracker");

// 표 카드 크기/컬러 설정
const WIDTH = 620;
const HEIGHT = 390;

function formatNumber(n) {
  return n.toLocaleString();
}

// 이미지 카드 그리기
function drawStatCard(ctx, stats, guildName) {
  ctx.fillStyle = "#23272A";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // 타이틀/로고
  ctx.font = "bold 26px sans-serif";
  ctx.fillStyle = "#ffe36b";
  ctx.fillText(`🌟 ${guildName} 🌟`, 32, 44);

  ctx.font = "bold 16px sans-serif";
  ctx.fillStyle = "#aaa";
  ctx.fillText("🏆 Server Top Statistics", 35, 70);

  // 채팅 타이틀
  ctx.font = "bold 20px sans-serif";
  ctx.fillStyle = "#f7c873";
  ctx.fillText("💬 Top Messages", 38, 104);

  // 채팅 랭킹 표
  ctx.font = "bold 17px sans-serif";
  stats.messages.slice(0, 5).forEach((d, i) => {
    ctx.fillStyle = "#ffe36b";
    ctx.fillText(`${i+1}`, 38, 140 + i*33);

    ctx.fillStyle = "#fff";
    ctx.fillText(`${d.name}`, 68, 140 + i*33);

    ctx.font = "bold 17px monospace";
    ctx.fillStyle = "#66ccff";
    ctx.fillText(formatNumber(d.value), 218, 140 + i*33);
    ctx.font = "bold 17px sans-serif";
  });

  // 음성 타이틀
  ctx.font = "bold 20px sans-serif";
  ctx.fillStyle = "#91e3a3";
  ctx.fillText("🔊 Top Voice Hours", 38, 255);

  // 음성 랭킹 표
  ctx.font = "bold 17px sans-serif";
  stats.voice.slice(0, 5).forEach((d, i) => {
    ctx.fillStyle = "#ffe36b";
    ctx.fillText(`${i+1}`, 38, 290 + i*33);

    ctx.fillStyle = "#fff";
    ctx.fillText(`${d.name}`, 68, 290 + i*33);

    ctx.font = "bold 17px monospace";
    ctx.fillStyle = "#71ebbd";
    ctx.fillText(`${d.value} h`, 218, 290 + i*33);
    ctx.font = "bold 17px sans-serif";
  });

  // 푸터
  ctx.font = "bold 13px sans-serif";
  ctx.fillStyle = "#999";
  ctx.fillText("기간: 최근 90일 누적", 36, HEIGHT - 28);
  ctx.font = "12px sans-serif";
  ctx.fillStyle = "#888";
  ctx.fillText("Powered by KKARI Bot", WIDTH - 160, HEIGHT - 15);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("이용현황")
    .setDescription("서버의 채팅/음성 TOP 순위를 이미지 카드로 출력"),

  async execute(interaction) {
    await interaction.deferReply();

    // 통계 데이터 불러오기
    let statsRaw = activity.getStats({ from: null, to: null, filterType: "all" });

    // 서버 전체 멤버 닉네임 가져오기
    const members = await interaction.guild.members.fetch();
    // 메시지 TOP
    let messageRank = statsRaw
      .filter(s => s.message > 0)
      .sort((a, b) => b.message - a.message)
      .slice(0, 5)
      .map(s => ({
        name: members.get(s.userId)?.displayName || members.get(s.userId)?.user?.username || s.userId,
        value: s.message
      }));

    // 음성 TOP (시간 단위)
    let voiceRank = statsRaw
      .filter(s => s.voice > 0)
      .sort((a, b) => b.voice - a.voice)
      .slice(0, 5)
      .map(s => ({
        name: members.get(s.userId)?.displayName || members.get(s.userId)?.user?.username || s.userId,
        value: (s.voice / 3600).toFixed(1)
      }));

    // 최소 데이터 채우기(없으면 빈칸)
    while (messageRank.length < 5) messageRank.push({ name: "-", value: 0 });
    while (voiceRank.length < 5) voiceRank.push({ name: "-", value: 0 });

    // 캔버스 생성
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext("2d");
    drawStatCard(ctx, { messages: messageRank, voice: voiceRank }, interaction.guild.name);

    // 이미지 버퍼
    const buffer = canvas.toBuffer("image/png");
    const attachment = new AttachmentBuilder(buffer, { name: "server-stat.png" });

    await interaction.editReply({
      content: "💎 서버 활동 TOP 랭킹",
      files: [attachment]
    });
  }
};
