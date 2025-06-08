
const fs = require("fs");
const path = require("path");

const LIMIT_FILE = path.join(__dirname, "..", "data", "drawLimits.json");
const DEFAULT_LIMIT = 3;
const BOOSTER_LIMIT = 6;
const BOOSTER_ROLE_ID = "1207437971037356142"; // 부스터 역할 ID

function loadLimits() {
  if (!fs.existsSync(LIMIT_FILE)) return {};
  return JSON.parse(fs.readFileSync(LIMIT_FILE, "utf8"));
}

function saveLimits(limits) {
  fs.writeFileSync(LIMIT_FILE, JSON.stringify(limits, null, 2));
}

function checkAndUpdateDrawLimit(userId, member) {
  const limits = loadLimits();
  const now = Date.now();
  const entry = limits[userId] || { count: 0, last: now };
  const isBooster = member.roles.cache.has(BOOSTER_ROLE_ID);
  const limit = isBooster ? BOOSTER_LIMIT : DEFAULT_LIMIT;

  if (now - entry.last > 24 * 60 * 60 * 1000) {
    entry.count = 0;
    entry.last = now;
  }

  if (entry.count >= limit) return false;

  entry.count += 1;
  entry.last = now;
  limits[userId] = entry;
  saveLimits(limits);
  return true;
}

module.exports = { checkAndUpdateDrawLimit };
