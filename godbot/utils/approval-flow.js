const { ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const fsp = require("fs/promises");
const path = require("path");

const GATE_CHANNEL_ID = "1277610812977971334";
const STAFF_DECIDE_CHANNEL_ID = "1276751288117235755";
const APPROVED_LOG_CHANNEL_ID = "1240936843122573312";
const REJECTED_LOG_CHANNEL_ID = "1240936845014208614";
const SUB_ALT_ROLE_ID = "1208987442234007582";
const APPROVED_ROLE_ID = "285645561582059520";
const SERVER_NAME = "까리한 디스코드";
const DATA_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "approvals.json");

let selectSettings = null;
let selectGame = null;
try { selectSettings = require("../commands/select-settings.js"); } catch { selectSettings = { execute: async i => { try { await i.reply({ content: "서버 태그 설정 모듈이 없습니다.", ephemeral: true }); } catch {} } }; }
try { selectGame = require("../commands/select-game.js"); } catch { selectGame = { execute: async i => { try { await i.reply({ content: "게임 태그 설정 모듈이 없습니다.", ephemeral: true }); } catch {} } }; }

async function loadStore() { try { await fsp.mkdir(DATA_DIR, { recursive: true }); } catch {} try { const raw = await fsp.readFile(STORE_FILE, "utf8"); return JSON.parse(raw); } catch { return { users: {}, messages: {} }; } }
async function saveStore(store) { await fsp.writeFile(STORE_FILE, JSON.stringify(store, null, 2), "utf8"); }
function minAllowedBirthYear() { const now = new Date(); return now.getFullYear() - 20; }
function ensureRecord(store, uid) { if (!store.users[uid]) store.users[uid] = { status: null, countJoinAttempts: 0, countApproved: 0, countRejected: 0, rejectedBirthYears: [], history: [], activeChannelId: null, flow: null, pendingDecisionMessageId: null, lastStepMsgIds: {} }; if (!store.users[uid].lastStepMsgIds) store.users[uid].lastStepMsgIds = {}; return store.users[uid]; }

function gateEmbed() { return new EmbedBuilder().setTitle(`🔑 ${SERVER_NAME} 서버 승인 절차`).setColor(0x7b2ff2).setDescription(["아래 버튼으로 입장 절차를 시작하세요.","신규/재입장/부계 확인 후 관리진 승인으로 마무리됩니다.",`입장 가능 출생년도: **${minAllowedBirthYear()}년 이하**`].join("\n")); }
function gateRow() { return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("gate_start").setStyle(ButtonStyle.Success).setLabel("서버 입장하기").setEmoji("✅")); }
async function postGateIfMissing(guild){try{const ch=await guild.channels.fetch(GATE_CHANNEL_ID).catch(()=>null);if(!ch)return;const msgs=await ch.messages.fetch({limit:10}).catch(()=>null);const exists=msgs?.some(m=>m.author?.bot&&m.components?.[0]?.components?.[0]?.customId==="gate_start");if(!exists)await ch.send({embeds:[gateEmbed()],components:[gateRow()]});}catch{}}

function rowType(){return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("type_new").setStyle(ButtonStyle.Primary).setLabel("신규 입장"),new ButtonBuilder().setCustomId("type_rejoin").setStyle(ButtonStyle.Secondary).setLabel("재입장"),new ButtonBuilder().setCustomId("type_alt").setStyle(ButtonStyle.Success).setLabel("부계정 생성"));}
function rowGender(){return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("gender_m").setStyle(ButtonStyle.Primary).setLabel("남자"),new ButtonBuilder().setCustomId("gender_f").setStyle(ButtonStyle.Secondary).setLabel("여자"));}
function rowSource(){return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("src_disboard").setStyle(ButtonStyle.Primary).setLabel("디스보드"),new ButtonBuilder().setCustomId("src_dicoall").setStyle(ButtonStyle.Secondary).setLabel("디코올"),new ButtonBuilder().setCustomId("src_promo").setStyle(ButtonStyle.Secondary).setLabel("홍보글"),new ButtonBuilder().setCustomId("src_ref").setStyle(ButtonStyle.Success).setLabel("추천인(지인)"));}
function rowTags(todo){return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("open_select_settings").setStyle(ButtonStyle.Primary).setLabel(todo?.settingsDone?"서버 태그 ✔":"서버 태그 설정"),new ButtonBuilder().setCustomId("done_settings").setStyle(todo?.settingsDone?ButtonStyle.Secondary:ButtonStyle.Success).setLabel(todo?.settingsDone?"서버 태그 완료됨":"서버 태그 완료"));}
function rowTags2(todo){return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("open_select_games").setStyle(ButtonStyle.Primary).setLabel(todo?.gamesDone?"게임 태그 ✔":"게임 태그 설정"),new ButtonBuilder().setCustomId("done_games").setStyle(todo?.gamesDone?ButtonStyle.Secondary:ButtonStyle.Success).setLabel(todo?.gamesDone?"게임 태그 완료됨":"게임 태그 완료"));}
function rowNick(){return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("open_nick").setStyle(ButtonStyle.Primary).setLabel("별명 입력"));}
function rowDecision(ctxId){return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`approve_user:${ctxId}`).setStyle(ButtonStyle.Success).setLabel("승인"),new ButtonBuilder().setCustomId(`approve_silent:${ctxId}`).setStyle(ButtonStyle.Primary).setLabel("조용히 승인"),new ButtonBuilder().setCustomId(`reject_user:${ctxId}`).setStyle(ButtonStyle.Danger).setLabel("거절"));}

async function disableMessageButtons(channel,messageId){if(!messageId)return;try{const msg=await channel.messages.fetch(messageId).catch(()=>null);if(!msg||!msg.editable||!msg.components?.length)return;const comps=msg.components.map(row=>{const r=new ActionRowBuilder();r.addComponents(...row.components.map(c=>ButtonBuilder.from(c).setDisabled(true)));return r;});await msg.edit({components:comps}).catch(()=>{});}catch{}}

function embedStep(title,desc,color){return new EmbedBuilder().setTitle(title).setDescription(desc).setColor(color||0x95a5a6);}

async function openModalBirth(i){const modal=new ModalBuilder().setCustomId("modal_birth").setTitle("출생년도 입력");const t=new TextInputBuilder().setCustomId("birth").setLabel("출생년도 (예: 2005)").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(4);modal.addComponents(new ActionRowBuilder().addComponents(t));await i.showModal(modal);}
async function openModalNick(i){const modal=new ModalBuilder().setCustomId("modal_nick").setTitle("서버 별명 입력");const t=new TextInputBuilder().setCustomId("nick").setLabel("서버에서 사용할 별명").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(32);modal.addComponents(new ActionRowBuilder().addComponents(t));await i.showModal(modal);}
async function openModalRef(i){const modal=new ModalBuilder().setCustomId("modal_ref").setTitle("추천인 닉네임 입력");const t=new TextInputBuilder().setCustomId("ref").setLabel("추천인 닉네임").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(32);modal.addComponents(new ActionRowBuilder().addComponents(t));await i.showModal(modal);}
async function openModalAlt(i){const modal=new ModalBuilder().setCustomId("modal_alt").setTitle("부계정 생성");const t1=new TextInputBuilder().setCustomId("mainNick").setLabel("본계정 닉네임").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(32);const t2=new TextInputBuilder().setCustomId("mainBirth").setLabel("본계정 출생년도 (예: 2005)").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(4);modal.addComponents(new ActionRowBuilder().addComponents(t1),new ActionRowBuilder().addComponents(t2));await i.showModal(modal);}
async function ensureNicknameUnique(guild,nickname){const members=await guild.members.fetch();const exists=members.find(m=>(m.nickname||m.user.username).toLowerCase()===nickname.toLowerCase());return !exists;}

function buildSummaryEmbed(ctx){const e=new EmbedBuilder().setTitle("📝 승인 심사 요청").setColor(0xf2b619).setThumbnail(ctx.member.user.displayAvatarURL({size:256})).addFields({name:"유저",value:`<@${ctx.member.id}> (${ctx.member.user.tag})`,inline:false},{name:"유형",value:ctx.type,inline:true},{name:"출생년도",value:ctx.type==="부계정"?String(ctx.mainBirthYear):String(ctx.birthYear),inline:true},{name:"성별",value:ctx.type==="부계정"?"-":(ctx.gender||"-"),inline:true},{name:"입장 경로",value:ctx.type==="부계정"?`본계정: ${ctx.mainNickname}`:`${ctx.source||"-"}${ctx.referrer?` / 추천인: ${ctx.referrer}`:""}`,inline:false},{name:"희망 별명",value:ctx.nickname||"-",inline:false});return e;}
function decisionLogEmbed(ctx,approved,reason){const e=new EmbedBuilder().setTitle(approved?"✅ 승인":"❌ 거절").setColor(approved?0x2ecc71:0xe74c3c).setThumbnail(ctx.member.user.displayAvatarURL({size:256})).setDescription([`• 유저: <@${ctx.member.id}> (${ctx.member.user.tag})`,`• 유형: ${ctx.type}`,ctx.type==="부계정"?`• 본계정: ${ctx.mainNickname} / 출생년도: ${ctx.mainBirthYear}`:`• 출생년도: ${ctx.birthYear} / 성별: ${ctx.gender} / 경로: ${ctx.source}${ctx.referrer?` / 추천인: ${ctx.referrer}`:""}`,`• 별명: ${ctx.nickname||"-"}`,reason?`• 비고: ${reason}`:null].filter(Boolean).join("\n"));return e;}
async function logApproved(guild,ctx,reason){const ch=await guild.channels.fetch(APPROVED_LOG_CHANNEL_ID).catch(()=>null);if(ch)await ch.send({embeds:[decisionLogEmbed(ctx,true,reason||null)]});}
async function logRejected(guild,ctx,reason){const ch=await guild.channels.fetch(REJECTED_LOG_CHANNEL_ID).catch(()=>null);if(ch)await ch.send({embeds:[decisionLogEmbed(ctx,false,reason||null)]});}

function buildRecordSummary(rec){const arr=[];arr.push(`• 누적 시도: ${rec.countJoinAttempts}회`);arr.push(`• 승인: ${rec.countApproved}회, 거절: ${rec.countRejected}회`);if(rec.rejectedBirthYears?.length)arr.push(`• 출생년도 오입력 거절: ${rec.rejectedBirthYears.join(", ")}`);return arr.join("\n");}

async function getOrCreatePrivateChannel(guild,user){const store=await loadStore();const rec=ensureRecord(store,user.id);if(rec.activeChannelId){const exist=await guild.channels.fetch(rec.activeChannelId).catch(()=>null);if(exist){const canView=exist.permissionsFor(user.id)?.has(PermissionFlagsBits.ViewChannel);if(canView)return exist;}}const ch=await guild.channels.create({name:`입장-${user.username}-${user.id.slice(-4)}`,type:ChannelType.GuildText,permissionOverwrites:[{id:guild.roles.everyone.id,deny:[PermissionFlagsBits.ViewChannel]},{id:user.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.AttachFiles,PermissionFlagsBits.EmbedLinks]}]});rec.activeChannelId=ch.id;rec.flow=null;await saveStore(store);return ch;}

async function beginFlow(i){const store=await loadStore();const rec=ensureRecord(store,i.user.id);const ch=await getOrCreatePrivateChannel(i.guild,i.user);rec.countJoinAttempts+=1;rec.status=null;await saveStore(store);await i.editReply({content:`전용 채널로 이동해 진행해줘: <#${ch.id}>`,ephemeral:true});await ch.send({content:`<@${i.user.id}>`}).catch(()=>{});const intro=await ch.send({embeds:[new EmbedBuilder().setTitle(`👋 ${i.member.displayName}님 환영!`).setDescription([`아래에서 유형을 선택해줘.`,buildRecordSummary(rec)].join("\n")).setColor(0x2095ff)],components:[rowType()]});const s=await loadStore();const r=ensureRecord(s,i.user.id);r.lastStepMsgIds.type=intro.id;await saveStore(s);return ch;}

async function upsertFlow(uid,patch){const s=await loadStore();const r=ensureRecord(s,uid);r.flow=Object.assign({},r.flow||{},patch||{});await saveStore(s);return r.flow;}
async function getFlow(uid){const s=await loadStore();const r=ensureRecord(s,uid);return r.flow||null;}
async function clearFlowAndChannel(guild,uid){const s=await loadStore();const r=ensureRecord(s,uid);if(r.activeChannelId){const ch=await guild.channels.fetch(r.activeChannelId).catch(()=>null);if(ch){try{await ch.delete().catch(()=>{});}catch{}}r.activeChannelId=null;}r.flow=null;if(r.pendingDecisionMessageId&&s.messages[r.pendingDecisionMessageId])delete s.messages[r.pendingDecisionMessageId];r.pendingDecisionMessageId=null;await saveStore(s);}

async function sendDecisionCard(guild,ctx,rec){const staffCh=await guild.channels.fetch(STAFF_DECIDE_CHANNEL_ID).catch(()=>null);if(!staffCh)return null;const head=new EmbedBuilder().setTitle("📮 승인 요청").setColor(0x7b2ff2).setThumbnail(ctx.member.user.displayAvatarURL({size:256})).setDescription(`• 대상: <@${ctx.member.id}> (${ctx.member.user.tag})\n• 기록\n${buildRecordSummary(rec)}`);const ctxId=`${ctx.member.id}:${Date.now()}`;const msg=await staffCh.send({embeds:[head,buildSummaryEmbed(ctx)],components:[rowDecision(ctxId)]});const store=await loadStore();store.messages[msg.id]={ctx,memberId:ctx.member.id,channelId:rec.activeChannelId||null,ctxId};rec.pendingDecisionMessageId=msg.id;await saveStore(store);return msg.id;}

async function announceWelcome(guild,ctx,silent){if(silent)return;const store=await loadStore();const rec=ensureRecord(store,ctx.member.id);if(!rec.activeChannelId)return;const ch=await guild.channels.fetch(rec.activeChannelId).catch(()=>null);if(!ch)return;const topGames=(ctx.selectedGames&&Array.isArray(ctx.selectedGames)?ctx.selectedGames.slice(0,5):[]).map((g,i)=>`#${i+1} ${g}`).join("\n")||"표시할 게임 태그가 없습니다.";await ch.send({content:`<@${ctx.member.id}> 님이 입장했습니다! 까리하게 맞이해주세요!! @here`}).catch(()=>{});await ch.send({embeds:[new EmbedBuilder().setTitle("선택한 대표 게임").setDescription(topGames).setColor(0x2ecc71)]}).catch(()=>{});}

async function handleDecision(i,action,ctxFromId){if(!i.member.permissions.has(PermissionFlagsBits.ManageGuild)&&!i.member.permissions.has(PermissionFlagsBits.Administrator)){await i.reply({content:"권한이 없습니다.",ephemeral:true});return;}const mid=i.message.id;const store=await loadStore();let saved=store.messages[mid];if(!saved||(ctxFromId&&saved.ctxId!==ctxFromId)){await i.reply({content:"컨텍스트가 만료되었습니다.",ephemeral:true});return;}const guild=i.guild;const member=await guild.members.fetch(saved.memberId).catch(()=>null);if(!member){await i.reply({content:"대상 사용자를 찾을 수 없습니다.",ephemeral:true});return;}const ctx=Object.assign({},saved.ctx,{member});const rec=ensureRecord(store,member.id);if(action==="APPROVE"||action==="APPROVE_SILENT"){rec.countApproved+=1;rec.status="approved";if(ctx.type==="부계정"){try{await member.roles.add(SUB_ALT_ROLE_ID).catch(()=>{});}catch{}}try{await member.roles.add(APPROVED_ROLE_ID).catch(()=>{});}catch{}if(ctx.nickname){const ok=await ensureNicknameUnique(guild,ctx.nickname);if(ok){try{await member.setNickname(ctx.nickname).catch(()=>{});}catch{}}}rec.history.push({at:Date.now(),type:ctx.type==="부계정"?"ALT_APPROVED":"APPROVED",payload:ctx});await saveStore(store);await logApproved(guild,ctx,action==="APPROVE_SILENT"?"조용히 승인":"일반 승인");try{await i.update({content:"처리 완료",components:[]});}catch{}await announceWelcome(guild,ctx,action==="APPROVE_SILENT");try{await clearFlowAndChannel(guild,member.id);}catch{}}else{rec.countRejected+=1;rec.status="rejected";if(ctx.birthYear&&ctx.birthRejectedImmediate)rec.rejectedBirthYears.push(ctx.birthYear);rec.history.push({at:Date.now(),type:"REJECTED",payload:ctx});await saveStore(store);await logRejected(guild,ctx,"관리진 거절");try{await i.update({content:"거절 처리 완료",components:[]});}catch{}try{if(rec.activeChannelId){const ch=await guild.channels.fetch(rec.activeChannelId).catch(()=>null);if(ch)await ch.send({content:`<@${member.id}> 승인 심사에서 거절되었습니다. 문의는 운영진에게 부탁해.`}).catch(()=>{});}}catch{}try{await clearFlowAndChannel(guild,member.id);}catch{}}delete store.messages[mid];await saveStore(store);}

async function handleAltFinalize(i,values){const guild=i.guild;const member=await guild.members.fetch(i.user.id);const mainNickname=values.mainNick.trim();const mainBirthYear=parseInt(values.mainBirth,10);if(!/^\d{4}$/.test(String(mainBirthYear))){await i.reply({content:"출생년도 형식이 올바르지 않습니다.",ephemeral:true});return;}const minY=minAllowedBirthYear();if(mainBirthYear>minY){const store=await loadStore();const rec=ensureRecord(store,member.id);rec.countRejected+=1;rec.rejectedBirthYears.push(mainBirthYear);rec.history.push({at:Date.now(),type:"ALT_REJECT",year:mainBirthYear});rec.status="rejected";await saveStore(store);const ctx={type:"부계정",mainNickname,mainBirthYear,member,nickname:`${member.displayName||member.user.username}[부계]`};await logRejected(guild,ctx,`본계정 출생년도 기준 미달 (최소 ${minY})`);await i.reply({content:`부계정 생성 거절: 본계정 출생년도 기준 미달 (최소 ${minY})`,ephemeral:true});try{await clearFlowAndChannel(guild,member.id);}catch{}return;}await upsertFlow(member.id,{type:"부계정",mainNickname,mainBirthYear,nickname:`${mainNickname}[부계]`});const store=await loadStore();const rec=ensureRecord(store,member.id);const ctx={type:"부계정",mainNickname,mainBirthYear,member,nickname:`${mainNickname}[부계]`};const msgId=await sendDecisionCard(guild,ctx,rec);await i.reply({content:"부계정 심사 요청이 접수되었습니다. 관리진 승인을 기다려줘.",ephemeral:true});if(rec.activeChannelId){const ch=await guild.channels.fetch(rec.activeChannelId).catch(()=>null);if(ch){const waitMsg=await ch.send({embeds:[embedStep("대기 안내","관리진의 승인을 기다려줘.",0x95a5a6)]});rec.lastStepMsgIds.wait=waitMsg.id;await saveStore(store);}}}

async function handleBirthValidation(yearStr){const y=parseInt(yearStr,10);const minY=minAllowedBirthYear();if(!/^\d{4}$/.test(String(y)))return{ok:false,reason:"출생년도 형식이 올바르지 않습니다."};if(y>minY)return{ok:false,reason:`출생년도 기준 미달 (최소 ${minY})`};return{ok:true,year:y};}

function top5GamesFromFlow(flow){if(!flow||!flow.selectedGames||!Array.isArray(flow.selectedGames))return[];return flow.selectedGames.slice(0,5);}
function buildDecisionCtxFromFlow(flow,member){return{type:flow.type||"신규/재입장",birthYear:flow.birthYear,gender:flow.gender,source:flow.source,referrer:flow.referrer,nickname:flow.nickname,tagsDone:!!(flow.settingsDone&&flow.gamesDone),member,mainNickname:flow.mainNickname,mainBirthYear:flow.mainBirthYear,selectedGames:top5GamesFromFlow(flow)};}

async function canAdoptChannel(i){const can=i.channel.permissionsFor(i.user.id)?.has(PermissionFlagsBits.ViewChannel);const looks=typeof i.channel.name==="string"&&i.channel.name.startsWith("입장-");return !!(can&&looks);}
async function ensureOwnChannel(i){const store=await loadStore();const rec=ensureRecord(store,i.user.id);if(rec.activeChannelId===i.channel.id)return{store,rec,ok:true};if(await canAdoptChannel(i)){rec.activeChannelId=i.channel.id;await saveStore(store);return{store,rec,ok:true};}return{store,rec,ok:false};}

async function collectFlow(client){
  client.on("interactionCreate", async i => {
    if (!i.inCachedGuild()) return;

    if (i.isButton() && i.customId === "gate_start") {
      await i.deferReply({ ephemeral: true });
      const ch = await beginFlow(i);
      if (!ch) return;
      return;
    }

    if (i.isButton() && (i.customId === "type_new" || i.customId === "type_rejoin" || i.customId === "type_alt")) {
      const guard = await ensureOwnChannel(i);
      if (!guard.ok) { await i.reply({ content: "본인 전용 채널에서만 진행 가능해.", ephemeral: true }); return; }
      const rec = guard.rec;
      await disableMessageButtons(i.channel, rec.lastStepMsgIds.type);
      if (i.customId === "type_alt") { await openModalAlt(i); return; }
      await upsertFlow(i.user.id, { type: i.customId === "type_new" ? "신규" : "재입장" });
      await openModalBirth(i);
      const ask = await i.channel.send({ embeds: [embedStep("출생년도 입력", "모달에 출생년도를 입력해줘.", 0x95a5a6)] });
      rec.lastStepMsgIds.birth = ask.id; await saveStore(guard.store);
      return;
    }

    if (i.isModalSubmit() && i.customId === "modal_alt") {
      const guard = await ensureOwnChannel(i);
      if (!guard.ok) { await i.reply({ content: "본인 전용 채널에서만 진행 가능해.", ephemeral: true }); return; }
      const mainNick = i.fields.getTextInputValue("mainNick");
      const mainBirth = i.fields.getTextInputValue("mainBirth");
      await handleAltFinalize(i, { mainNick, mainBirth });
      return;
    }

    if (i.isModalSubmit() && i.customId === "modal_birth") {
      const guard = await ensureOwnChannel(i);
      if (!guard.ok) { await i.reply({ content: "본인 전용 채널에서만 진행 가능해.", ephemeral: true }); return; }
      const v = i.fields.getTextInputValue("birth");
      const res = await handleBirthValidation(v);
      const store = guard.store; const rec = guard.rec;
      if (!res.ok) {
        rec.countRejected += 1; if (/^\d{4}$/.test(String(v))) rec.rejectedBirthYears.push(parseInt(v, 10));
        rec.history.push({ at: Date.now(), type: "BIRTH_REJECT", year: v }); rec.status = "rejected"; await saveStore(store);
        const ctx = { type: "신규/재입장", birthYear: /^\d{4}$/.test(String(v)) ? parseInt(v, 10) : null, birthRejectedImmediate: true, member: await i.guild.members.fetch(i.user.id) };
        await logRejected(i.guild, ctx, res.reason);
        await i.reply({ content: `승인 거절: ${res.reason}`, ephemeral: true });
        try { if (rec.activeChannelId) { const ch = await i.guild.channels.fetch(rec.activeChannelId).catch(() => null); if (ch) await ch.send({ content: `<@${i.user.id}> 승인 심사에서 거절되었습니다. 문의는 운영진에게 부탁해.` }); } } catch {}
        try { await clearFlowAndChannel(i.guild, i.user.id); } catch {}
        return;
      }
      await upsertFlow(i.user.id, { birthYear: res.year });
      await i.reply({ content: `출생년도 확인 완료: ${res.year}`, ephemeral: true });
      await disableMessageButtons(i.channel, rec.lastStepMsgIds.birth);
      const msg = await i.channel.send({ embeds: [embedStep("성별 선택", "아래 버튼으로 성별을 선택해줘.", 0x9b59b6)], components: [rowGender()] });
      rec.lastStepMsgIds.gender = msg.id; await saveStore(store);
      return;
    }

    if (i.isButton() && (i.customId === "gender_m" || i.customId === "gender_f")) {
      const guard = await ensureOwnChannel(i);
      if (!guard.ok) { await i.reply({ content: "본인 전용 채널에서만 진행 가능해.", ephemeral: true }); return; }
      const f = await getFlow(i.user.id);
      if (!f || !f.birthYear) { await i.reply({ content: "먼저 출생년도부터 입력해줘.", ephemeral: true }); return; }
      const store = guard.store; const rec = guard.rec;
      await upsertFlow(i.user.id, { gender: i.customId === "gender_m" ? "남자" : "여자" });
      await i.reply({ content: "성별 선택 완료.", ephemeral: true });
      await disableMessageButtons(i.channel, rec.lastStepMsgIds.gender);
      const msg = await i.channel.send({ embeds: [embedStep("입장 경로", "어디서 오셨는지 선택해줘.", 0x3498db)], components: [rowSource()] });
      rec.lastStepMsgIds.source = msg.id; await saveStore(store);
      return;
    }

    if (i.isButton() && i.customId.startsWith("src_")) {
      const guard = await ensureOwnChannel(i);
      if (!guard.ok) { await i.reply({ content: "본인 전용 채널에서만 진행 가능해.", ephemeral: true }); return; }
      const f = await getFlow(i.user.id);
      if (!f || !f.birthYear || !f.gender) { await i.reply({ content: "출생년도, 성별부터 진행해줘.", ephemeral: true }); return; }
      const map = { src_disboard: "디스보드", src_dicoall: "디코올", src_promo: "홍보글", src_ref: "추천인(지인)" };
      const sourceSel = map[i.customId] || "기타";
      await upsertFlow(i.user.id, { source: sourceSel });
      const store = guard.store; const rec = guard.rec;
      await disableMessageButtons(i.channel, rec.lastStepMsgIds.source);
      if (i.customId === "src_ref") { await openModalRef(i); return; }
      const msg = await i.channel.send({ embeds: [embedStep("태그 설정", "서버 태그와 게임 태그 설정을 완료한 뒤, 별명을 입력해줘.", 0x2ecc71)], components: [rowTags(f), rowTags2(f)] });
      rec.lastStepMsgIds.tags = msg.id; await saveStore(store);
      return;
    }

    if (i.isModalSubmit() && i.customId === "modal_ref") {
      const guard = await ensureOwnChannel(i);
      if (!guard.ok) { await i.reply({ content: "본인 전용 채널에서만 진행 가능해.", ephemeral: true }); return; }
      const ref = i.fields.getTextInputValue("ref").trim();
      await upsertFlow(i.user.id, { referrer: ref });
      const f = await getFlow(i.user.id);
      const store = guard.store; const rec = guard.rec;
      const msg = await i.channel.send({ embeds: [embedStep("태그 설정", "서버 태그와 게임 태그 설정을 완료한 뒤, 별명을 입력해줘.", 0x2ecc71)], components: [rowTags(f), rowTags2(f)] });
      rec.lastStepMsgIds.tags = msg.id; await saveStore(store);
      await i.reply({ content: `추천인: ${ref}`, ephemeral: true });
      return;
    }

    if (i.isButton() && i.customId === "open_select_settings") { const guard = await ensureOwnChannel(i); if (!guard.ok) { await i.reply({ content: "본인 전용 채널에서만 진행 가능해.", ephemeral: true }); return; } try { await selectSettings.execute(i); } catch {} return; }
    if (i.isButton() && i.customId === "open_select_games") { const guard = await ensureOwnChannel(i); if (!guard.ok) { await i.reply({ content: "본인 전용 채널에서만 진행 가능해.", ephemeral: true }); return; } try { await selectGame.execute(i); } catch {} return; }

    if (i.isButton() && (i.customId === "done_settings" || i.customId === "done_games")) {
      const guard = await ensureOwnChannel(i);
      if (!guard.ok) { await i.reply({ content: "본인 전용 채널에서만 진행 가능해.", ephemeral: true }); return; }
      const store = guard.store; const rec = guard.rec;
      const cur = await getFlow(i.user.id);
      const patch = Object.assign({}, cur || {});
      if (i.customId === "done_settings") patch.settingsDone = true; else patch.gamesDone = true;
      await upsertFlow(i.user.id, patch);
      const updated = await getFlow(i.user.id);
      try { const msg = await i.channel.messages.fetch(rec.lastStepMsgIds.tags).catch(() => null); if (msg) await msg.edit({ components: [rowTags(updated), rowTags2(updated)] }).catch(() => {}); } catch {}
      if (updated.settingsDone && updated.gamesDone) { const nickAsk = await i.channel.send({ embeds: [embedStep("별명 입력", "아래 버튼을 눌러 서버에서 사용할 별명을 입력해줘.", 0xf39c12)], components: [rowNick()] }); rec.lastStepMsgIds.nick = nickAsk.id; await saveStore(store); }
      await i.reply({ content: "설정 완료 체크됨.", ephemeral: true });
      return;
    }

    if (i.isButton() && i.customId === "open_nick") {
      const guard = await ensureOwnChannel(i);
      if (!guard.ok) { await i.reply({ content: "본인 전용 채널에서만 진행 가능해.", ephemeral: true }); return; }
      const f = await getFlow(i.user.id);
      if (!f?.settingsDone || !f?.gamesDone) { await i.reply({ content: "서버 태그와 게임 태그를 먼저 완료해줘.", ephemeral: true }); return; }
      await openModalNick(i);
      return;
    }

    if (i.isModalSubmit() && i.customId === "modal_nick") {
      const guard = await ensureOwnChannel(i);
      if (!guard.ok) { await i.reply({ content: "본인 전용 채널에서만 진행 가능해.", ephemeral: true }); return; }
      const want = i.fields.getTextInputValue("nick").trim();
      const unique = await ensureNicknameUnique(i.guild, want);
      if (!unique) { await i.reply({ content: "이미 사용 중인 별명이야. 다른 별명으로 입력해줘.", ephemeral: true }); return; }
      await upsertFlow(i.user.id, { nickname: want });
      const store = guard.store; const rec = guard.rec;
      await i.reply({ content: `별명 설정: ${want}`, ephemeral: true });
      await disableMessageButtons(i.channel, rec.lastStepMsgIds.nick);
      const flow = await getFlow(i.user.id);
      const member = await i.guild.members.fetch(i.user.id);
      const ctx = buildDecisionCtxFromFlow(flow, member);
      const msgId = await sendDecisionCard(i.guild, ctx, rec);
      if (rec.activeChannelId) {
        const ch = await i.guild.channels.fetch(rec.activeChannelId).catch(() => null);
        if (ch) {
          const wait = await ch.send({ embeds: [embedStep("대기 안내", "관리진의 승인을 기다려줘.", 0x95a5a6)] });
          rec.lastStepMsgIds.wait = wait.id; await saveStore(store);
        }
      }
      return;
    }

    if (i.isButton() && (i.customId.startsWith("approve_user:") || i.customId.startsWith("approve_silent:") || i.customId.startsWith("reject_user:"))) {
      const [action, ctxId] = i.customId.split(":");
      await handleDecision(i, action === "approve_user" ? "APPROVE" : action === "approve_silent" ? "APPROVE_SILENT" : "REJECT", ctxId);
      return;
    }
  });

  client.on("guildMemberRemove", async member => { try { const store = await loadStore(); ensureRecord(store, member.id); await clearFlowAndChannel(member.guild, member.id); const rec = ensureRecord(store, member.id); rec.status = null; await saveStore(store); } catch {} });

  client.on("guildMemberAdd", async member => { try { const store = await loadStore(); const rec = ensureRecord(store, member.id); rec.status = null; rec.flow = null; await saveStore(store); } catch {} });

  client.on("channelDelete", async ch => {
    if (!ch?.guild) return;
    const store = await loadStore();
    let changed = false;
    for (const uid of Object.keys(store.users)) {
      const rec = store.users[uid];
      if (rec.activeChannelId === ch.id) { rec.activeChannelId = null; rec.flow = null; changed = true; }
      if (rec.pendingDecisionMessageId && store.messages[rec.pendingDecisionMessageId] && store.messages[rec.pendingDecisionMessageId].channelId === ch.id) { delete store.messages[rec.pendingDecisionMessageId]; rec.pendingDecisionMessageId = null; changed = true; }
    }
    if (changed) await saveStore(store);
  });
}

function initApprovalSystem(client){
  client.once("ready", async () => {
    for (const [, g] of client.guilds.cache) { await postGateIfMissing(g).catch(() => {}); }
    const store = await loadStore();
    for (const uid of Object.keys(store.users)) {
      const rec = store.users[uid];
      if (rec.activeChannelId) {
        const guild = [...client.guilds.cache.values()].find(gg => gg.channels.cache.has(rec.activeChannelId)) || null;
        if (guild) {
          const ch = await guild.channels.fetch(rec.activeChannelId).catch(() => null);
          if (!ch) { rec.activeChannelId = null; rec.flow = null; await saveStore(store); }
        }
      }
    }
  });
  collectFlow(client);
}

module.exports = { initApprovalSystem };
