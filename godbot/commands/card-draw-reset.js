
const fs = require("fs");
const path = require("path");

module.exports = {
  data: {
    name: "카드뽑기횟수초기화",
    description: "특정 유저의 뽑기 제한을 초기화합니다.",
    options: [{
      name: "유저",
      type: 6,
      description: "초기화할 유저",
      required: true
    }]
  },
  async execute(interaction) {
    const target = interaction.options.getUser("유저");
    const limitPath = path.join(__dirname, "..", "data", "drawLimits.json");

    if (fs.existsSync(limitPath)) {
      const limits = JSON.parse(fs.readFileSync(limitPath));
      delete limits[target.id];
      fs.writeFileSync(limitPath, JSON.stringify(limits, null, 2));
    }

    interaction.reply(`🔄 <@${target.id}>의 카드뽑기 횟수를 초기화했습니다.`);
  }
};
