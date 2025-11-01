// commands/alarm-dm.js
const fs = require("fs");
const path = require("path");
const { SlashCommandBuilder, EmbedBuilder, MessageFlagsBitField } = require("discord.js");

const MAP = {
  "경매":        { key: "auction",     type: "role",    roleId: "1255580504745574552" },
  "내전":        { key: "scrim",       type: "role",    roleId: "1255580383559422033" },
  "공지사항":    { key: "notice",      type: "role",    roleId: "1255583755670917221" },
  "이벤트":      { key: "event",       type: "role",    roleId: "1255580760371626086" },
  "정수 퀴즈":   { key: "intQuiz",     type: "role",    roleId: "1255580906199191644" },
  "BUMP":       { key: "bump",        type: "role",    roleId: "1314483547142098984" },
  "모집방":      { key: "recruit",     type: "channel", channelId: "1209147973255036959" },
  "재난문자":    { key: "disaster",    type: "channel", channelId: "1419724916055347211" },
  "게임뉴스":    { key: "gamenews",    type: "channel", channelId: "1425432550351831200" },
};

const DATA_PATH = path.join(__dirname, "../data/notify-settings.json");
function loadStore() {
  if (!fs.existsSync(DATA_PATH)) fs.writeFileSync(DATA_PATH, "{}");
  try { return JSON.parse(fs.readFileSync(DATA_PATH, "utf8")); } catch { return {}; }
}
function saveStore(obj) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(obj, null, 2));
}

async function ensureRole(member, roleId) {
  if (!roleId) return;
  const role = member.guild.roles.cache.get(roleId) || await member.guild.roles.fetch(roleId).catch(()=>null);
  if (!role) return;
  if (!member.roles.cache.has(role.id)) {
    await member.roles.add(role.id, "알림 옵션 ON에 따른 역할 부여").catch(()=>{});
  }
}
async function removeRole(member, roleId) {
  if (!roleId) return;
  if (member.roles.cache.has(roleId)) {
    await member.roles.remove(roleId, "알림 옵션 OFF에 따른 역할 해제").catch(()=>{});
  }
}

async function dmUser(user, payload) {
  try {
    await user.send(payload);
    return true;
  } catch {
    return false;
  }
}

// --- Ephemeral 차단 유틸 ---
function isEphemeralMessage(message) {
  try {
    if (!message) return false;
    if (message.flags?.has?.(MessageFlagsBitField.Flags.Ephemeral)) return true;
    if (message.interaction?.ephemeral === true) return true;
    return false;
  } catch {
    return false;
  }
}

function makeJumpEmbed(title, description, url, color=0x7b2ff2) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description || "내용이 없습니다.")
    .setURL(url)
    .setFooter({ text: "까리한 디스코드 • 갓봇 알림" })
    .setTimestamp();
}

function buildRelayPayload(message, title, color) {
  const text = (message.cleanContent || "").slice(0, 1900);

  const embeds = (message.embeds && message.embeds.length)
    ? message.embeds.map(e => EmbedBuilder.from(e))
    : [ new EmbedBuilder()
          .setColor(color ?? 0x5865F2)
          .setTitle(title)
          .setDescription(text || "내용이 없습니다.")
          .setURL(message.url)
          .setFooter({ text: "까리한 디스코드 • 갓봇 알림" })
          .setTimestamp()
      ];

  const files = message.attachments?.size
    ? [...message.attachments.values()].map(att => ({
        attachment: att.url,
        name: att.name || "file"
      }))
    : [];

  return { content: text || null, embeds, files };
}

async function relayByRoleMention(message, roleId, titleText) {
  if (!message.guild) return;
  if (isEphemeralMessage(message)) return; // 에페메럴 DM 릴레이 차단
  if (!message.mentions?.roles?.has(roleId)) return;

  const store = loadStore();
  const subs = Object.entries(store).filter(([, s]) => s["auction"] || s["scrim"] || s["notice"] || s["event"] || s["intQuiz"] || s["bump"]);
  const targets = subs.filter(([, s]) => {
    const m = Object.entries(MAP).find(([, v]) => v.roleId === roleId);
    if (!m) return false;
    const key = m[1].key;
    return !!s[key];
  }).map(([uid]) => uid);

  if (targets.length === 0) return;
  const payload = buildRelayPayload(message, `🔔 ${titleText} 새 알림`, 0x00b894);

  for (const uid of targets) {
    const user = await message.client.users.fetch(uid).catch(()=>null);
    if (!user) continue;
    await dmUser(user, payload);
  }
}

async function relayByChannel(message, channelId, titleText) {
  if (!message.guild) return;
  if (isEphemeralMessage(message)) return; // 에페메럴 DM 릴레이 차단
  if (message.channelId !== channelId) return;

  const store = loadStore();
  const m = Object.entries(MAP).find(([, v]) => v.channelId === channelId);
  if (!m) return;
  const key = m[1].key;
  const targets = Object.entries(store).filter(([, s]) => !!s[key]).map(([uid]) => uid);
  if (targets.length === 0) return;

  const payload = buildRelayPayload(message, `📬 ${titleText}`, 0x0984e3);

  for (const uid of targets) {
    const user = await message.client.users.fetch(uid).catch(()=>null);
    if (!user) continue;
    await dmUser(user, payload);
  }
}

function registerRelaysOnce() {
  if (global.__notifyRelayRegistered) return;
  global.__notifyRelayRegistered = true;
  const client = global.client;
  if (!client) return;

  client.on("messageCreate", async (msg) => {
    try {
      if (isEphemeralMessage(msg)) return; // 이중 보호
      await relayByRoleMention(msg, MAP["경매"].roleId, "경매 역할 멘션");
      await relayByRoleMention(msg, MAP["내전"].roleId, "내전 역할 멘션");
      await relayByRoleMention(msg, MAP["공지사항"].roleId, "공지사항 역할 멘션");
      await relayByRoleMention(msg, MAP["이벤트"].roleId, "이벤트 역할 멘션");
      await relayByRoleMention(msg, MAP["정수 퀴즈"].roleId, "정수 퀴즈 역할 멘션");
      await relayByRoleMention(msg, MAP["BUMP"].roleId, "BUMP 역할 멘션");

      await relayByChannel(msg, MAP["모집방"].channelId, "모집방 새 글");
      await relayByChannel(msg, MAP["재난문자"].channelId, "재난 문자");
      await relayByChannel(msg, MAP["게임뉴스"].channelId, "게임뉴스 새 글");
    } catch {}
  });
}

registerRelaysOnce();

module.exports = {
  data: new SlashCommandBuilder()
    .setName("알림")
    .setDescription("개인 DM으로 특정 항목의 알림을 받으실 수 있습니다. (토글 가능)")
    .addStringOption(opt =>
      opt.setName("옵션")
        .setDescription("토글할 항목을 선택해 주세요.")
        .setRequired(true)
        .addChoices(
          { name: "경매", value: "경매" },
          { name: "내전", value: "내전" },
          { name: "공지사항", value: "공지사항" },
          { name: "이벤트", value: "이벤트" },
          { name: "정수 퀴즈", value: "정수 퀴즈" },
          { name: "BUMP", value: "BUMP" },
          { name: "모집방", value: "모집방" },
          { name: "재난문자", value: "재난문자" },
          { name: "게임뉴스", value: "게임뉴스" },
        )
    ),
  async execute(interaction) {
    const choice = interaction.options.getString("옵션");
    const meta = MAP[choice];
    if (!meta) return interaction.reply({ content: "잘못된 옵션입니다.", ephemeral: true });

    if (!interaction.guild) return interaction.reply({ content: "서버 안에서만 사용하실 수 있습니다.", ephemeral: true });

    const member = await interaction.guild.members.fetch(interaction.user.id).catch(()=>null);
    if (!member) return interaction.reply({ content: "멤버 정보를 찾지 못했습니다.", ephemeral: true });

    const store = loadStore();
    const uid = interaction.user.id;
    if (!store[uid]) store[uid] = {};

    const nowOn = !store[uid][meta.key];
    store[uid][meta.key] = nowOn;
    saveStore(store);

    if (meta.type === "role") {
      if (nowOn) await ensureRole(member, meta.roleId);
      else await removeRole(member, meta.roleId);
    }

    const status = nowOn ? "ON" : "OFF";
    const tip = nowOn
      ? "이제부터 해당 알림이 DM으로 전송됩니다."
      : "해당 알림 DM 전송이 중지되었습니다.";
    const embed = new EmbedBuilder()
      .setColor(nowOn ? 0x2ecc71 : 0xe74c3c)
      .setTitle(`알림 옵션: ${choice} → ${status}`)
      .setDescription(tip)
      .setFooter({ text: "까리한 디스코드 • 갓봇 알림" })
      .setTimestamp();

    try { await interaction.reply({ embeds: [embed], ephemeral: true }); } catch {}

    const testMsg = nowOn
      ? new EmbedBuilder()
          .setColor(0xf1c40f)
          .setTitle(`테스트 알림: ${choice}`)
          .setDescription("실제 알림은 관련 글이 올라오거나 역할 멘션 시 도착합니다.")
          .setFooter({ text: "DM 수신이 차단되어 있을 경우 도착하지 않습니다." })
          .setTimestamp()
      : null;
    if (nowOn) {
      const ok = await dmUser(interaction.user, { embeds: [testMsg] });
      if (!ok) {
        try {
          await interaction.followUp({ content: "DM 전송에 실패했습니다. DM 수신 허용 상태를 확인해 주세요.", ephemeral: true });
        } catch {}
      }
    }
  }
};
