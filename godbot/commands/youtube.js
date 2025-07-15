const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fetch = require("node-fetch");

const YT_API_KEY = "AIzaSyDYNjIQ-jVCnG6_Wqwnm5gOVrDHvAyVF2w";

module.exports = {
  data: new SlashCommandBuilder()
    .setName("유튜브")
    .setDescription("유튜브 채널 정보를 확인합니다.")
    .addStringOption(opt =>
      opt.setName("채널")
        .setDescription("유튜브 채널 ID 또는 채널명(핸들)")
        .setRequired(true)
    ),
  async execute(interaction) {
    const input = interaction.options.getString("채널");
    await interaction.deferReply();

    let channelId = input;
    if (input.startsWith("@")) {
      const handle = input.slice(1);
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(handle)}&key=${YT_API_KEY}`;
      const search = await fetch(url).then(res => res.json());
      channelId = search.items?.[0]?.id?.channelId;
      if (!channelId) {
        return interaction.editReply("채널 핸들/이름으로 채널을 찾을 수 없습니다.");
      }
    }
    const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${channelId}&key=${YT_API_KEY}`;
    const res = await fetch(url).then(r => r.json());
    if (!res.items?.length) {
      return interaction.editReply("채널 정보를 찾을 수 없습니다.");
    }
    const ch = res.items[0];
    const stats = ch.statistics;
    const info = ch.snippet;

    const embed = new EmbedBuilder()
      .setTitle(info.title)
      .setURL(`https://www.youtube.com/channel/${channelId}`)
      .setThumbnail(info.thumbnails?.default?.url || null)
      .setDescription(info.description?.slice(0, 300) || "설명 없음")
      .addFields(
        { name: "구독자", value: `${Number(stats.subscriberCount).toLocaleString()}명`, inline: true },
        { name: "총 조회수", value: `${Number(stats.viewCount).toLocaleString()}회`, inline: true },
        { name: "영상 개수", value: `${Number(stats.videoCount).toLocaleString()}개`, inline: true }
      )
      .setColor(0xff0000);

    await interaction.editReply({ embeds: [embed] });
  }
};
