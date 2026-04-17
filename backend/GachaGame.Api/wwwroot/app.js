const state = { users: [], userId: null, roster: [] };

const $ = (id) => document.getElementById(id);

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.Message || "API error");
  return data;
}

function renderUsers() {
  const select = $("userSelect");
  select.innerHTML = "";
  state.users.forEach((u) => {
    const op = document.createElement("option");
    op.value = u.userId;
    op.textContent = `${u.userName} (${u.userId.slice(0, 8)})`;
    select.appendChild(op);
  });
  if (!state.userId && state.users.length) state.userId = state.users[0].userId;
  select.value = state.userId || "";
}

function renderUserStats(user) {
  $("userStats").innerHTML = `Gem: <b>${user.premiumCurrency}</b> | Soul Stone: <b>${user.soulStone}</b>`;
}

function renderRoster() {
  const list = $("rosterList");
  list.innerHTML = "";
  state.roster.forEach((c) => {
    const li = document.createElement("li");
    const downed = c.isDowned ? ` <span class="lose">[DOWNED đến ${c.downedExpireAtUtc}]</span>` : "";
    const unique = c.isUnique ? `<span class="unique">UNIQUE</span>` : "";
    li.innerHTML = `${c.name} ${unique} - ${c.rarity}★ - HP: ${c.currentHp}${downed}`;
    list.appendChild(li);
  });

  const selects = [$("battleCharacter"), $("reviveCharacter")];
  selects.forEach((s) => (s.innerHTML = ""));
  state.roster.forEach((c) => {
    const txt = `${c.name} (${c.rarity}★) ${c.isDowned ? "[DOWNED]" : ""}`;
    selects.forEach((s) => {
      const op = document.createElement("option");
      op.value = c.characterId;
      op.textContent = txt;
      s.appendChild(op);
    });
  });
}

async function loadUsers() {
  state.users = await api("/api/users");
  renderUsers();
}

async function loadUserAndRoster() {
  if (!state.userId) return;
  const user = await api(`/api/users/${state.userId}`);
  renderUserStats(user);
  state.roster = await api(`/api/roster/${state.userId}`);
  renderRoster();
}

async function loadPool() {
  const pool = await api("/api/pool/live?minRarity=8");
  const list = $("poolList");
  list.innerHTML = "";
  pool.forEach((c) => {
    const li = document.createElement("li");
    li.innerHTML = `${c.name} - <b>${c.rarity}★</b>`;
    list.appendChild(li);
  });
}

async function seed() {
  const data = await api("/api/dev/seed", { method: "POST" });
  $("seedMsg").textContent = data.message;
  await loadUsers();
  await loadUserAndRoster();
  await loadPool();
}

async function pull() {
  const cost = Number($("costInput").value || 160);
  const body = {
    userId: state.userId,
    bannerTag: "season1-global",
    cost,
    idempotencyKey: `pull-${Date.now()}`,
  };
  const res = await api("/api/gacha/pull", { method: "POST", body: JSON.stringify(body) });
  $("pullMsg").innerHTML = `Nhận: <b>${res.characterName}</b> (${res.rarity}★)`;
  await loadUserAndRoster();
  await loadPool();
}

async function fight() {
  const characterId = $("battleCharacter").value;
  const difficulty = $("difficulty").value;
  const res = await api("/api/battle/fight", {
    method: "POST",
    body: JSON.stringify({ userId: state.userId, characterId, difficulty }),
  });
  $("battleMsg").innerHTML = `<span class="${res.status === "WIN" ? "win" : "lose"}">${res.message}</span>`;
  await loadUserAndRoster();
  await loadPool();
}

async function revive() {
  const characterId = $("reviveCharacter").value;
  const res = await api(`/api/roster/${characterId}/revive`, {
    method: "POST",
    body: JSON.stringify({ userId: state.userId, consumeSoulStone: true }),
  });
  $("lifeMsg").innerHTML = `<span class="win">${res.message}</span>`;
  await loadUserAndRoster();
}

async function finalizePermadeath() {
  const res = await api("/api/internal/permadeath/finalize", {
    method: "POST",
    body: JSON.stringify({ nowUtc: new Date().toISOString() }),
  });
  $("lifeMsg").innerHTML = `<span class="lose">Finalize: ${res.count} nhân vật bị xóa vĩnh viễn.</span>`;
  await loadUserAndRoster();
  await loadPool();
}

function registerEvents() {
  $("seedBtn").onclick = () => seed().catch((e) => alert(e.message));
  $("pullBtn").onclick = () => pull().catch((e) => alert(e.message));
  $("fightBtn").onclick = () => fight().catch((e) => alert(e.message));
  $("reviveBtn").onclick = () => revive().catch((e) => alert(e.message));
  $("finalizeBtn").onclick = () => finalizePermadeath().catch((e) => alert(e.message));
  $("userSelect").onchange = async (e) => {
    state.userId = e.target.value;
    await loadUserAndRoster();
  };
}

(async function boot() {
  registerEvents();
  await seed();
})();
