const { PermissionFlagsBits, ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const fs = require("fs");
const path = require("path");

const CONTROL_CHANNEL_ID = "1425966714604224566";
const ROLE_ID_A = "1205052922296016906";
const ROLE_ID_B = "1403748042666151936";
const DATA_PATH = path.join(__dirname, "../data/approval-blocked.json");

function loadBlocked() {
  try {
    const j = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
    if (j && typeof j === "object") return j;
    return {};
  } catch {
    return {};
  }
}
function saveBlocked(all) {
  try {
    fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
    fs.writeFileSync(DATA_PATH, JSON.stringify(all), "utf8");
  } catch {}
}
function addBlocked(uid) {
  const all = loadBlocked();
  all[uid] = { userId: uid, blockedAt: Date.now() };
  saveBlocked(all);
  return all[uid];
}
function removeBlocked(uid) {
  const all = loadBlocked();
  if (all[uid]) {
    delete all[uid];
    saveBlocked(all);
    return true;
  }
  return false;
}
function isBlocked(uid) {
  const all = loadBlocked();
  return !!all[uid];
}
function getAllBlockedIds() {
  return Object.keys(loadBlocked());
}
async function deletePrivateJoinChannel(guild, uid) {
  let target = null;
  try {
    const approvalFlow = require("./approval-flow.js");
    if (approvalFlow && typeof approvalFlow.findUserPrivateChannel === "function") {
      target = approvalFlow.findUserPrivateChannel(guild, uid);
    }
  } catch {}
  if (!target) {
    try {
      await guild.channels.fetch();
    } catch {}
    target = guild.channels.cache.find((c) => c.type === ChannelType.GuildText && c.topic === uid);
  }
  if (target) {
    try { await target.delete("승인 절차 차단 대상 정리"); } catch {}
  }
}
async function deleteFallbackJoinChannelsByName(guild, member) {
  try {
    await guild.channels.fetch();
  } catch {}
  const base = (member.displayName || member.user.username || "").replace(/[^ㄱ-ㅎ가-힣A-Za-z0-9-_]/g, "");
  const candidates = guild.channels.cache.filter(
    (c) =>
      c.type === ChannelType.GuildText &&
      typeof c.name === "string" &&
      c.name.startsWith("입장-") &&
      c.name.includes(base)
  );
  for (const ch of candidates.values()) {
    try { await ch.delete("승인 절차 차단 대상 정리(이름 패턴)"); } catch {}
  }
}
async function assignBypassRoles(guild, uid) {
  try { await guild.roles.fetch(); } catch {}
  const member = await guild.members.fetch(uid).catch(() => null);
  if (!member) return false;
  try {
    const r1 = guild.roles.cache.get(ROLE_ID_A);
    if (r1) { try { await member.roles.add(r1, "승인 절차 차단 대상 역할 부여(A)"); } catch {} }
    const r2 = guild.roles.cache.get(ROLE_ID_B);
    if (r2) { try { await member.roles.add(r2, "승인 절차 차단 대상 역할 부여(B)"); } catch {} }
  } catch {}
  return true;
}
async function removeBypassRoles(guild, uid) {
  try { await guild.roles.fetch(); } catch {}
  const member = await guild.members.fetch(uid).catch(() => null);
  if (!member) return false;
  try {
    const r1 = guild.roles.cache.get(ROLE_ID_A);
    if (r1) { try { await member.roles.remove(r1, "승인 절차 제한 해제(A)"); } catch {} }
    const r2 = guild.roles.cache.get(ROLE_ID_B);
    if (r2) { try { await member.roles.remove(r2, "승인 절차 제한 해제(B)"); } catch {} }
  } catch {}
  return true;
}
async function applyBlockNow(guild, uid) {
  await assignBypassRoles(guild, uid);
  const member = await guild.members.fetch(uid).catch(() => null);
  if (member) {
    await deletePrivateJoinChannel(guild, uid);
    await new Promise((r) => setTimeout(r, 1200));
    await deleteFallbackJoinChannelsByName(guild, member);
  } else {
    await deletePrivateJoinChannel(guild, uid);
  }
}
function makeConfirmEmbed(guild, uid, blocked, actorId) {
  const title = blocked ? "이미 제한된 유저입니다" : "승인 절차 제한 확인";
  const desc = blocked ? "이미 제한된 유저입니다. 제한을 해제하시겠습니까?" : "해당 유저의 승인 절차를 모두 차단하고 지정 역할을 부여합니다. 진행하시겠습니까?";
  const e = new EmbedBuilder()
    .setTitle(title)
    .setDescription(desc)
    .addFields(
      { name: "대상", value: `<@${uid}> (${uid})`, inline: false },
      { name: "상태", value: blocked ? "제한됨" : "미제한", inline: true }
    )
    .setFooter({ text: `요청자: ${actorId}` })
    .setTimestamp(new Date());
  return e;
}
function makeButtons(uid, blocked) {
  const rows = [];
  if (!blocked) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`blk:apply:${uid}`).setLabel("제한 적용").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`blk:cancel:${uid}`).setLabel("취소").setStyle(ButtonStyle.Secondary)
      )
    );
  } else {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`blk:remove:${uid}`).setLabel("제한 해제").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`blk:cancel:${uid}`).setLabel("취소").setStyle(ButtonStyle.Secondary)
      )
    );
  }
  return rows;
}
function parseTargetsFromMessage(msg) {
  const set = new Set();
  for (const m of msg.mentions.users.values()) set.add(m.id);
  const ids = (msg.content.match(/\b\d{17,20}\b/g) || []);
  for (const id of ids) set.add(id);
  return Array.from(set);
}
module.exports = (client) => {
  client.on("messageCreate", async (msg) => {
    try {
      if (msg.channelId !== CONTROL_CHANNEL_ID) return;
      if (!msg.guild) return;
      if (msg.author?.bot) return;
      if (msg.webhookId) return;
      const hasManage = msg.member?.permissions?.has(PermissionFlagsBits.ManageGuild);
      if (!hasManage) return;
      const targets = parseTargetsFromMessage(msg).slice(0, 10);
      if (!targets.length) return;
      for (const uid of targets) {
        const blocked = isBlocked(uid);
        const embed = makeConfirmEmbed(msg.guild, uid, blocked, msg.author.id);
        const components = makeButtons(uid, blocked);
        await msg.reply({ embeds: [embed], components, allowedMentions: { parse: [], users: [], roles: [], repliedUser: false } });
      }
    } catch {}
  });
  client.on("interactionCreate", async (i) => {
    try {
      if (!i.isButton()) return;
      if (i.channelId !== CONTROL_CHANNEL_ID) return;
      if (!i.guild) return;
      if (i.user?.bot) { try { await i.deferUpdate().catch(() => {}); } catch {} return; }
      const hasManage = i.member?.permissions?.has(PermissionFlagsBits.ManageGuild);
      if (!hasManage) { try { await i.reply({ content: "권한이 없습니다.", ephemeral: true }); } catch {} return; }
      const [ns, action, uid] = String(i.customId).split(":");
      if (ns !== "blk" || !/^\d{17,20}$/.test(uid)) return;
      if (action === "cancel") {
        try { await i.update({ components: [], content: "취소되었습니다.", allowedMentions: { parse: [], users: [], roles: [], repliedUser: false } }); } catch {}
        return;
      }
      if (action === "apply") {
        addBlocked(uid);
        await applyBlockNow(i.guild, uid);
        const embed = new EmbedBuilder()
          .setTitle("제한 적용 완료")
          .setDescription("해당 유저의 승인 절차가 차단되었으며 지정 역할이 부여되었습니다.")
          .addFields({ name: "대상", value: `<@${uid}> (${uid})` })
          .setTimestamp(new Date());
        try { await i.update({ embeds: [embed], components: [], allowedMentions: { parse: [], users: [], roles: [], repliedUser: false } }); } catch {}
        return;
      }
      if (action === "remove") {
        removeBlocked(uid);
        await removeBypassRoles(i.guild, uid);
        const embed = new EmbedBuilder()
          .setTitle("제한 해제 완료")
          .setDescription("해당 유저의 승인 절차 제한이 해제되었습니다.")
          .addFields({ name: "대상", value: `<@${uid}> (${uid})` })
          .setTimestamp(new Date());
        try { await i.update({ embeds: [embed], components: [], allowedMentions: { parse: [], users: [], roles: [], repliedUser: false } }); } catch {}
        return;
      }
    } catch {}
  });
  client.on("guildMemberAdd", async (member) => {
    try {
      if (!isBlocked(member.id)) return;
      await new Promise((r) => setTimeout(r, 1500));
      await applyBlockNow(member.guild, member.id);
    } catch {}
  });
  client.on("channelCreate", async (ch) => {
    try {
      if (ch.type !== ChannelType.GuildText) return;
      const guild = ch.guild;
      const topic = ch.topic;
      if (topic && /^\d{17,20}$/.test(topic) && isBlocked(topic)) {
        try { await ch.delete("승인 절차 차단 대상의 개인 채널 자동 삭제"); } catch {}
        return;
      }
      if (typeof ch.name === "string" && ch.name.startsWith("입장-")) {
        await guild.members.fetch().catch(() => {});
        const blockedIds = getAllBlockedIds().filter((id) => guild.members.cache.has(id));
        if (!blockedIds.length) return;
        for (const uid of blockedIds) {
          const m = guild.members.cache.get(uid);
          if (!m) continue;
          const base = (m.displayName || m.user.username || "").replace(/[^ㄱ-ㅎ가-힣A-Za-z0-9-_]/g, "");
          if (base && ch.name.includes(base)) {
            try { await ch.delete("승인 절차 차단 대상의 개인 채널 자동 삭제(이름 매칭)"); } catch {}
            break;
          }
        }
      }
    } catch {}
  });
  client.once("ready", async () => {
    try {
      for (const g of client.guilds.cache.values()) {
        const ids = getAllBlockedIds();
        if (!ids.length) continue;
        await g.members.fetch().catch(() => {});
        for (const uid of ids) {
          if (g.members.cache.has(uid)) {
            await applyBlockNow(g, uid);
          } else {
            await deletePrivateJoinChannel(g, uid);
          }
        }
      }
    } catch {}
  });
};
