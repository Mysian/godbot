const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "../data/draw-limit.json");

function loadLimitData() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({}), "utf-8");
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
}

function saveLimitData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
}

function canDraw(userId, isBooster) {
  const data = loadLimitData();
  const now = Date.now();
  const limit = isBooster ? 6 : 3;
  const resetTime = 24 * 60 * 60 * 1000;

  if (!data[userId]) {
    data[userId] = { count: 0, last: now };
  }

  const elapsed = now - data[userId].last;

  if (elapsed > resetTime) {
    data[userId] = { count: 1, last: now };
    saveLimitData(data);
    return { allowed: true, remaining: limit - 1 };
  }

  if (data[userId].count < limit) {
    data[userId].count += 1;
    saveLimitData(data);
    return { allowed: true, remaining: limit - data[userId].count };
  }

  return { allowed: false, remaining: 0 };
}

module.exports = {
  canDraw,
};
