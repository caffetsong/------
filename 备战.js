/* =========================================================
   游戏符文数据(静态)
========================================================= */

const runeData = {

    colorful: [
        { name: "觉醒·磐固", description: "最大生命，双防：+6%" },
        { name: "灵狐·召唤", description: "攻击和技能会放出灵狐，对目标英雄造成伤害" },
        { name: "猎隼·扑击", description: "3s内用三次独立的普通攻击或技能命中同一英雄，追加伤害，cd15s" },
        { name: "地灵·回生", description: "升级时回复并提高最大生命" },
        { name: "冰灵·霜冻", description: "普攻或技能命中英雄使其在移动时留下冰霜路径，持续3s，路径上的敌人会被被减速。冷却15s" },
        { name: "神行·振奋", description: "普攻和移动积攒层数，满层下一次普攻消耗所有层数回复生命值，提高移速" },
        { name: "凛霜·席卷", description: "定身英雄后提升双防，持续3s，期间对周围每个敌人造成伤害，冷却15s" },
        { name: "觉醒·疾咒", description: "+法攻,法穿,攻速" },
        { name: "觉醒·透甲", description: "+物攻,物穿,技能急速" },
        { name: "觉醒·强袭", description: "+最大生命,物攻,技能急速" },
    ],

    attack: [
        { name: "破魔", description: "+法穿,法攻" },
        { name: "鹰戮", description: "攻击半血以下英雄增伤" },
        { name: "蛮斗", description: "自身半血以上时，造成额外伤害" },
        { name: "狮狩", description: "伤害+4%，敌方生命值越高，增伤越高，最高12%" },
        { name: "同仇", description: "对英雄造成伤害时，提高4%目标受到自身的伤害，提高7%目标受到队友的伤害，持续4秒" },
        { name: "荆棘", description: "受到攻击时，对敌方英雄造成伤害" },
        { name: "连弩", description: "+物攻,物穿" },
        { name: "霹雳", description: "+物攻,攻速" },

    ],
    


    defense: [
        { name: "蝠拥", description: "+最大生命，生命汲取" },
        { name: "神佑", description: "残血护盾" },
        { name: "群岩", description: "周围存在英雄时双防" },
        { name: "渴血", description: "自身半血以上时，获得生命汲取" },
        { name: "摄魂", description: "对英雄造成伤害时，降低其5%双攻，持续5秒" },
        { name: "调息", description: "6秒未受到伤害时，提高35~56(随等级提升)物理防御和法术防御，在受到伤害2.5秒后失效，冷却8秒" },
        { name: "壁垒", description: "+双抗" },
    ],
    

    general: [
        { name: "锋鸣", description: "+技能急速，最大生命" },
        { name: "掘金", description: "游戏开始时，击杀和助攻额外经济" },
        { name: "风驰", description: "增加3%移动速度，脱战后效果提升至3倍" },
        { name: "瞬雷", description: "曙光战技及装备技能冷却减少30%" },
        { name: "灵犀", description: "对敌方英雄造成伤害时，自身对其造成伤害会回复伤害值4% 的生命值，队友对其造成伤害会回复伤害值7 % 的生命值，持续5秒" },
        { name: "剑誓", description: "击杀或助攻续航" },
        { name: "疾行", description: "+移速,韧性" }

    ]
};


/* =========================================================
   符文卡片素材
   - RUNE_BG    : 每种符文类型共用的外层背景图 (彩色 n1 / 攻击 n2 / 防御 n3 / 通用 n4)
   - RUNE_ICONS : 每个符文居中图标 URL, 按符文名对应。当前留空,
                  之后在此补充: RUNE_ICONS["猎隼·扑击"] = "https://....png"
                  未填写的符文, 卡片中央会显示符文名文字兜底。
========================================================= */

const RUNE_BG = {
    colorful: "https://sgyx-plt-static-resources.cache.jj.cn/sgwebsite/imgs/vs/pc/xsbg/n1.png",
    attack: "https://sgyx-plt-static-resources.cache.jj.cn/sgwebsite/imgs/vs/pc/xsbg/n2.png",
    defense: "https://sgyx-plt-static-resources.cache.jj.cn/sgwebsite/imgs/vs/pc/xsbg/n3.png",
    general: "https://sgyx-plt-static-resources.cache.jj.cn/sgwebsite/imgs/vs/pc/xsbg/n4.png"
};

const RUNE_ICONS = {

    "猎隼·扑击": "https://sgyx-plt-static-resources.cache.jj.cn/space/common/9947570bbc054eb5f66a684a543c4b5d.png",
    "冰灵·霜冻": "https://sgyx-plt-static-resources.cache.jj.cn/space/common/92b68b081ec0a199d57656c480d54e26.png",
    "地灵·回生": "https://sgyx-plt-static-resources.cache.jj.cn/space/common/d83d95d36aee32535a12f5337387bb71.png",
    "觉醒·庇护": "https://sgyx-plt-static-resources.cache.jj.cn/space/common/b935bfc1e51966018b0279e4754418bb.png",
    "觉醒·法能": "https://sgyx-plt-static-resources.cache.jj.cn/space/common/40a1c43a290370126f1ab0ae55a30b9c.png",
    "觉醒·疾射": "https://sgyx-plt-static-resources.cache.jj.cn/space/common/ae089246bb3e387e24fb242f67036a05.png",
    "觉醒·疾咒": "https://sgyx-plt-static-resources.cache.jj.cn/space/common/c5b6f78bf54e8c635f656f2763c78d9c.png",
    "觉醒·磐固": "https://sgyx-plt-static-resources.cache.jj.cn/space/common/f6b17659fd024227dcdb710a923547b7.png",
    "觉醒·强袭": "https://sgyx-plt-static-resources.cache.jj.cn/space/common/5b4f8084c4e9d38f62fc4fd5d9659c8c.png",
    "觉醒·守卫": "https://sgyx-plt-static-resources.cache.jj.cn/space/common/a19fc52278d6125d7054d7a27f322471.png",
    "觉醒·透甲": "https://sgyx-plt-static-resources.cache.jj.cn/space/common/a3f77f394e9d325a57a5379b2fd5d2d8.png",
    "猎隼·扑击": "https://sgyx-plt-static-resources.cache.jj.cn/space/common/9947570bbc054eb5f66a684a543c4b5d.png",
    "凛霜·席卷": "https://sgyx-plt-static-resources.cache.jj.cn/space/common/604bbb970533aa675c1ed2fb5111e116.png",
    "灵狐·召唤": "https://sgyx-plt-static-resources.cache.jj.cn/space/common/e15412bd94aaf8e39cf69648b2308554.png",
    "神行·振奋": "https://sgyx-plt-static-resources.cache.jj.cn/space/common/b8fc17785a2d18e4e0e40d71cc974bc5.png",
    "奔涌": "https://sgyx-plt-static-resources.cache.jj.cn/space/common/3ea965129857805a4cb311ba7baa5d3b.png",
    "盾歌": "https://sgyx-plt-static-resources.cache.jj.cn/space/common/4cba516012756516e94efa737e72efc7.png",
    "荆棘": "https://sgyx-plt-static-resources.cache.jj.cn/space/common/a7d156932e3c39ab8b68e8af517e0b6b.png",
    "连弩": "https://sgyx-plt-static-resources.cache.jj.cn/space/common/2ee2228f61dc9bd77bd121b8c669d604.png",
    "蛮斗": "https://sgyx-plt-static-resources.cache.jj.cn/space/common/7810e06b7aca95c1d8a46154160d2260.png",
    "霹雳": "https://sgyx-plt-static-resources.cache.jj.cn/space/common/8d5b0459070c193b14a24a2bba7abb61.png",
    "破魔": "https://sgyx-plt-static-resources.cache.jj.cn/space/common/9160bb2111372c0f24234ee5d5399984.png",
    "狮狩": "https://sgyx-plt-static-resources.cache.jj.cn/space/common/d8c46bfe3bb6f3aef0ac5dee3abe1894.png",
    "同仇": "https://sgyx-plt-static-resources.cache.jj.cn/space/common/12034822501b433219e177cb2e832eaa.png",
    "鹰戮": "https://sgyx-plt-static-resources.cache.jj.cn/space/common/27bbdaafc76aba34f141f72e5b566a64.png",
    "壁垒": "https://sgyx-plt-static-resources.cache.jj.cn/space/common/cd0066736ec7957e3a4a10c29f60a21c.png",
    "调息": "https://sgyx-plt-static-resources.cache.jj.cn/space/common/aa05dfa8ba3315b2e46fa2df538c4179.png",
    "蝠拥": "https://sgyx-plt-static-resources.cache.jj.cn/space/common/12c99f96195491f11e415c3fcec87cf0.png",
    "回春": "https://sgyx-plt-static-resources.cache.jj.cn/space/common/8e50f8d38ae5f57bd2d64cf2ebc36551.png",
    "渴血": "https://sgyx-plt-static-resources.cache.jj.cn/space/common/e9ef6548f54e599fcf640a2cb50dba79.png",
    "群岩": "https://sgyx-plt-static-resources.cache.jj.cn/space/common/893dfba42db665d1ff083c7841401d3d.png",
    "摄魂": "https://sgyx-plt-static-resources.cache.jj.cn/space/common/efb7a46ae9b1032b618a7e3f6c2e0b27.png",
    "神佑": "https://sgyx-plt-static-resources.cache.jj.cn/space/common/002049b6342647ef1c8c3df9db7ebb54.png",
    "风驰": "https://sgyx-plt-static-resources.cache.jj.cn/space/common/908518dc4778aeb6d9fdee5cf4e095db.png",
    "锋鸣": "https://sgyx-plt-static-resources.cache.jj.cn/space/common/cd1d48f234d81d51e956b64a8d8a3c43.png",
    "疾行": "https://sgyx-plt-static-resources.cache.jj.cn/space/common/24f6e97aa9108dc0ce2ae260117bbed3.png",
    "剑誓": "https://sgyx-plt-static-resources.cache.jj.cn/space/common/d3a413340087ff148d5d745eab082686.png",
    "掘金": "https://sgyx-plt-static-resources.cache.jj.cn/space/common/27c923b186e7b349c9ca16e15040885b.png",
    "灵犀": "https://sgyx-plt-static-resources.cache.jj.cn/space/common/54d4f148258df1346aaffec89768b8b1.png",
    "瞬雷": "https://sgyx-plt-static-resources.cache.jj.cn/space/common/e42cd4cae49b0f8fdbe6b40b7a8cc5bd.png",
    "追猎": "https://sgyx-plt-static-resources.cache.jj.cn/space/common/d25dec687524206ad4f976a134882297.png",
};

/* 符文类型槽位(按行展示顺序) */
const RUNE_TYPES = [
    { key: "colorful", label: "彩色" },
    { key: "attack", label: "攻击" },
    { key: "defense", label: "防御" },
    { key: "general", label: "通用" }
];

/* 出装配置 */
const EQUIP_SLOT_COUNT = 6;
const EQUIP_TIERS = ["1", "2", "3"];
const TIER_LABEL = { "1": "1级装备", "2": "2级装备", "3": "3级装备" };
let equipData = {};        // { 定位: { "1": [{name,icon}], ... } }
let equipNameMap = {};     // 装备名 -> 条目(取第一条匹配)
let equipEditor = null;    // { open:bool, pos:string|null, pick:string|null }


/* =========================================================
   状态
========================================================= */

let heroes = [];
let data = {};
let currentHero = null;
let currentBuildIndex = -1;  // 保留(索引型操作以入参为准)
let heroLanes = {};          // 英雄 -> 常用分路[](来自 英雄介绍.json)
let heroPlayers = {};        // 英雄 -> 擅长选手[](来自 英雄介绍.json)


/* =========================================================
   本地 JSON 数据存取
========================================================= */

async function loadRemote(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`${path} 请求失败: ${res.status}`);
    return res.json();
}

async function loadData() {
    try {
        const saved = await loadRemote("api/data");
        return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
    } catch (error) {
        console.error("读取本地数据失败:", error);
        return {};
    }
}

async function saveData() {
    await fetch("api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    });
}


/* =========================================================
   数据访问(不自动创建默认方案)
========================================================= */

async function loadEquipData() {
    try {
        const raw = await loadRemote("equip.json");
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;

        equipData = {};
        equipNameMap = {};

        for (const pos of Object.keys(raw)) {
            const tiers = raw[pos];
            equipData[pos] = {};
            for (const tier of Object.keys(tiers || {})) {
                const list = Array.isArray(tiers[tier]) ? tiers[tier] : [];
                /* 支持纯字符串(装备名)与旧对象 {name, icon} 两种写法 */
                const names = list.map(it =>
                    typeof it === "string" ? it : (it && typeof it.name === "string" ? it.name : null)
                ).filter(Boolean);

                equipData[pos][tier] = names;
                for (const name of names) {
                    if (!equipNameMap[name]) {
                        equipNameMap[name] = { name, position: pos, tier };
                    }
                }
            }
        }
    } catch (error) {
        console.error("读取装备数据失败:", error);
    }
}

function getEquipPositions() {
    return Object.keys(equipData);
}

/* 本地装备图标: /equipicon/{装备名}.png */
function equipIconUrl(name) {
    return `equipicon/${encodeURIComponent(name)}.png`;
}

/* 清洗某方案的装备数组: 基础 6 格, 编辑弹窗内可增加更多格, 内容为装备名或 null */
function normalizeEquips(value) {
    const arr = Array.isArray(value) ? value : [];
    const out = arr.map(v => (typeof v === "string" && v ? v : null));
    while (out.length < EQUIP_SLOT_COUNT) out.push(null);
    return out;
}

/* 清洗备用装备数组: 与主装备数组等长对齐, 内容为装备名或 null */
function normalizeEquipsBackup(value, length) {
    const arr = Array.isArray(value) ? value : [];
    const out = [];
    for (let i = 0; i < length; i++) {
        const v = arr[i];
        out.push(typeof v === "string" && v ? v : null);
    }
    return out;
}

function normalizeBuild(build) {
    if (!build || typeof build !== "object") return null;
    const runes = build.runes && typeof build.runes === "object" ? build.runes : {};
    const equips = normalizeEquips(build.equips);
    return {
        name: build.name && String(build.name).trim() ? String(build.name).trim() : "未命名方案",
        lane: typeof build.lane === "string" && build.lane.trim() ? build.lane.trim() : null,
        player: typeof build.player === "string" && build.player.trim() ? build.player.trim() : null,
        runes: {
            colorful: Array.isArray(runes.colorful) ? runes.colorful : [],
            attack: Array.isArray(runes.attack) ? runes.attack : [],
            defense: Array.isArray(runes.defense) ? runes.defense : [],
            general: Array.isArray(runes.general) ? runes.general : []
        },
        equips,
        equipsBackup: normalizeEquipsBackup(build.equipsBackup, equips.length),
        equipsBackup2: normalizeEquipsBackup(build.equipsBackup2, equips.length)
    };
}

function getHeroBuilds(hero) {
    const list = data[hero];
    if (!Array.isArray(list)) return [];
    return list.map(normalizeBuild).filter(Boolean);
}

function getHeroBuildCount(hero) {
    const list = data[hero];
    return Array.isArray(list) ? list.length : 0;
}

function getCurrentBuild() {
    if (!currentHero) return null;
    const builds = getHeroBuilds(currentHero);
    return builds[currentBuildIndex] || null;
}

/* 将清洗后的方案列表写回 data */
function writeBack(hero, builds) {
    data[hero] = builds;
}


/* =========================================================
   头像: 按名字对应 HeadIcon/{名字}.png
========================================================= */

function createAvatarImg(heroName, fallbackText) {
    const img = document.createElement("img");
    img.alt = heroName;
    img.draggable = false;
    img.onerror = () => {
        if (img.parentNode) img.parentNode.textContent = fallbackText;
    };
    img.src = `HeadIcon/${encodeURIComponent(heroName)}.png`;
    return img;
}


/* =========================================================
   选择英雄
========================================================= */

function selectHero(hero) {
    currentHero = hero;

    /* URL 同步 ?hero= ，刷新/分享后仍停留在同一英雄 */
    try {
        const u = new URL(location.href);
        u.searchParams.set("hero", hero);
        history.replaceState(null, "", u);
    } catch (error) { /* 忽略 */ }

    document.getElementById("heroName").textContent = hero;

    const bigAvatar = document.getElementById("heroAvatar");
    bigAvatar.textContent = "";
    bigAvatar.appendChild(createAvatarImg(hero, hero.substring(0, 1)));

    renderSchemes();
    updateUniversalButton();
}


/* =========================================================
   单英雄多方案: 渲染该英雄的全部方案(上下滚动查看)
   每套方案卡片 = 名称+操作 + 符文四槽 + 出装摘要
========================================================= */

function getSchemes() {
    return currentHero ? getHeroBuilds(currentHero) : [];
}


/* =========================================================
   通用符文(英雄级共享符文配置)
   开启后顶部显示一份共享符文, 方案卡隐藏各自符文区(数据保留);
   关闭后方案恢复显示自己的符文配置。存于 data.__universal[hero]。
========================================================= */

function getUniversalEntry(hero) {
    const store = data.__universal;
    const entry = store && typeof store === "object" && !Array.isArray(store) ? store[hero] : null;
    if (!entry || typeof entry !== "object") {
        return { enabled: false, runes: { colorful: [], attack: [], defense: [], general: [] } };
    }
    const runes = entry.runes && typeof entry.runes === "object" ? entry.runes : {};
    return {
        enabled: !!entry.enabled,
        runes: {
            colorful: Array.isArray(runes.colorful) ? runes.colorful : [],
            attack: Array.isArray(runes.attack) ? runes.attack : [],
            defense: Array.isArray(runes.defense) ? runes.defense : [],
            general: Array.isArray(runes.general) ? runes.general : []
        }
    };
}

function setUniversalEntry(hero, entry) {
    if (!data.__universal || typeof data.__universal !== "object" || Array.isArray(data.__universal)) {
        data.__universal = {};
    }
    data.__universal[hero] = entry;
}

/* 通用符文的“虚拟方案”对象, 供符文槽/选择器复用 */
function getUniversalBuild() {
    return { runes: getUniversalEntry(currentHero).runes };
}

/* 渲染全部方案卡片到 #buildsArea */
function renderSchemes() {
    const area = document.getElementById("buildsArea");
    if (!area) return;
    area.innerHTML = "";

    const builds = getSchemes();

    if (!builds.length) {
        const empty = document.createElement("div");
        empty.className = "schemes-empty";
        empty.textContent = currentHero
            ? `「${currentHero}」还没有任何备战方案, 点击右上角 "+ 新建方案" 创建。`
            : "未选择英雄：请从「梯度排行 → 英雄详情 → 🧩 备战方案」进入。";
        area.appendChild(empty);
        return;
    }

    const universal = getUniversalEntry(currentHero);

    /* 启用通用符文: 方案列表顶部显示共享符文面板 */
    if (universal.enabled) {
        area.appendChild(renderUniversalRunePanel(universal));
    }

    builds.forEach((build, index) => {
        area.appendChild(renderSchemeCard(build, index, universal.enabled));
    });

    hideRuneInfo();
}

/* 通用符文面板(启用时显示在方案列表顶部) */
function renderUniversalRunePanel(entry) {
    const panel = document.createElement("section");
    panel.className = "panel build-card universal-rune-panel";

    const head = document.createElement("div");
    head.className = "build-card-head";
    const title = document.createElement("div");
    title.className = "build-card-title";
    const num = document.createElement("span");
    num.className = "build-card-index";
    num.textContent = "通用符文";
    const desc = document.createElement("span");
    desc.className = "universal-desc";
    desc.textContent = "对该英雄所有方案生效; 关闭后各方案恢复显示自己的符文配置";
    title.appendChild(num);
    title.appendChild(desc);
    head.appendChild(title);
    panel.appendChild(head);

    const slots = document.createElement("div");
    slots.className = "rune-slots";
    renderRuneSlots({ runes: entry.runes }, "universal", slots);
    panel.appendChild(slots);

    return panel;
}

/* 单套方案卡片(universalEnabled: 通用符文开启时隐藏本方案符文区, 数据保留) */
function renderSchemeCard(build, index, universalEnabled) {
    const card = document.createElement("section");
    card.className = "panel build-card";
    card.dataset.index = index;

    /* ---- 头部: 方案序号 + 备注/删除 ---- */
    const head = document.createElement("div");
    head.className = "build-card-head";

    const nameEl = document.createElement("div");
    nameEl.className = "build-card-title";
    const num = document.createElement("span");
    num.className = "build-card-index";
    num.textContent = `方案 ${index + 1}`;
    const nm = document.createElement("span");
    nm.className = "build-card-name" + (build.name === "新方案" ? " placeholder" : "");
    nm.textContent = build.name;
    nm.title = build.name;
    nameEl.appendChild(num);
    nameEl.appendChild(nm);

    /* 分路标签: 下拉选项来自 英雄介绍.json 中该英雄的常用分路 */
    const lanes = heroLanes[currentHero] || [];
    if (lanes.length) {
        const laneSelect = document.createElement("select");
        laneSelect.className = "lane-select";
        laneSelect.title = "分路";

        const emptyOpt = document.createElement("option");
        emptyOpt.value = "";
        emptyOpt.textContent = "分路";
        laneSelect.appendChild(emptyOpt);
        lanes.forEach(lane => {
            const opt = document.createElement("option");
            opt.value = lane;
            opt.textContent = lane;
            if (build.lane === lane) opt.selected = true;
            laneSelect.appendChild(opt);
        });
        /* 当前分路已不在可选列表时(数据文件更新过), 保留显示原值 */
        if (build.lane && !lanes.includes(build.lane)) {
            const opt = document.createElement("option");
            opt.value = build.lane;
            opt.textContent = build.lane;
            opt.selected = true;
            laneSelect.appendChild(opt);
        }

        laneSelect.onchange = () => setBuildLane(index, laneSelect.value);
        nameEl.appendChild(laneSelect);
    }

    /* 人物标签: 下拉选项来自 英雄介绍.json 中该英雄的擅长选手 */
    const players = heroPlayers[currentHero] || [];
    if (players.length) {
        const playerSelect = document.createElement("select");
        playerSelect.className = "lane-select player-select";
        playerSelect.title = "选手";

        const emptyOpt = document.createElement("option");
        emptyOpt.value = "";
        emptyOpt.textContent = "选手";
        playerSelect.appendChild(emptyOpt);
        players.forEach(p => {
            const opt = document.createElement("option");
            opt.value = p;
            opt.textContent = p;
            if (build.player === p) opt.selected = true;
            playerSelect.appendChild(opt);
        });
        /* 当前选手已不在可选列表时(数据文件更新过), 保留显示原值 */
        if (build.player && !players.includes(build.player)) {
            const opt = document.createElement("option");
            opt.value = build.player;
            opt.textContent = build.player;
            opt.selected = true;
            playerSelect.appendChild(opt);
        }

        playerSelect.onchange = () => setBuildPlayer(index, playerSelect.value);
        nameEl.appendChild(playerSelect);
    }

    head.appendChild(nameEl);

    const actions = document.createElement("div");
    actions.className = "build-card-actions";
    const btnRename = document.createElement("button");
    btnRename.type = "button";
    btnRename.className = "btn";
    btnRename.textContent = "✎ 备注";
    btnRename.onclick = () => editBuildRemark(index);
    const btnDelete = document.createElement("button");
    btnDelete.type = "button";
    btnDelete.className = "btn danger";
    btnDelete.textContent = "删除";
    btnDelete.onclick = () => deleteBuild(index);
    actions.appendChild(btnRename);
    actions.appendChild(btnDelete);
    head.appendChild(actions);
    card.appendChild(head);

    /* ---- 符文区(通用符文开启时不渲染, 方案数据保留不动) ---- */
    if (!universalEnabled) {
        const runeTitle = document.createElement("div");
        runeTitle.className = "build-section-label";
        runeTitle.textContent = "符文配置";
        card.appendChild(runeTitle);

        const runesWrap = document.createElement("div");
        runesWrap.className = "rune-slots";
        renderRuneSlots(build, index, runesWrap);
        card.appendChild(runesWrap);
    }

    /* ---- 出装区 ---- */
    const equipTitleRow = document.createElement("div");
    equipTitleRow.className = "build-section-label equip-label-row";
    const equipTitle = document.createElement("span");
    equipTitle.textContent = "出装配置";
    const btnEditEquip = document.createElement("button");
    btnEditEquip.type = "button";
    btnEditEquip.className = "btn";
    btnEditEquip.textContent = "✎ 修改出装";
    btnEditEquip.onclick = () => openEquipEditor(index);
    equipTitleRow.appendChild(equipTitle);
    equipTitleRow.appendChild(btnEditEquip);
    card.appendChild(equipTitleRow);

    const equipSummary = document.createElement("div");
    equipSummary.className = "equip-summary";
    renderEquipSummary(build, equipSummary, index);
    card.appendChild(equipSummary);

    return card;
}

function getSelectedRuneName(build, type) {
    const arr = build.runes[type];
    return Array.isArray(arr) && arr.length > 0 ? arr[0] : "";
}

/* 渲染某方案的四类符文槽(每类一槽), 放入 container */
function renderRuneSlots(build, buildIndex, container) {
    if (!container) return;
    container.innerHTML = "";

    RUNE_TYPES.forEach(({ key, label }) => {
        const selectedName = getSelectedRuneName(build, key);
        const rune = selectedName
            ? runeData[key].find(item => item.name === selectedName) || null
            : null;

        const slot = document.createElement("div");
        slot.className = "rune-slot";

        const title = document.createElement("div");
        title.className = "rune-slot-title";
        title.textContent = label;
        slot.appendChild(title);

        /* 槽位卡片 */
        const card = document.createElement("div");
        card.className = "rune-card" + (rune ? " selected" : "");
        card.style.backgroundImage = `url('${RUNE_BG[key]}')`;

        if (rune) {
            const iconUrl = (RUNE_ICONS && RUNE_ICONS[rune.name]) || "";
            if (iconUrl) {
                const img = document.createElement("img");
                img.className = "rune-icon";
                img.src = iconUrl;
                img.alt = rune.name;
                img.draggable = false;
                card.appendChild(img);
            } else {
                const mark = document.createElement("span");
                mark.className = "rune-slot-plus";
                mark.textContent = "?";
                card.appendChild(mark);
            }

            /* 悬浮槽位卡片: 显示 info 气泡 */
            bindRuneInfo(card, rune);
        } else {
            const mark = document.createElement("span");
            mark.className = "rune-slot-plus";
            mark.textContent = "+";
            card.appendChild(mark);
        }

        /* 点击打开/收起该类型符文下拉 */
        card.onclick = () => {
            if (runePicker && runePicker.buildIndex === buildIndex && runePicker.type === key) {
                closeRunePicker();
            } else {
                openRunePicker(buildIndex, key, card);
            }
        };

        slot.appendChild(card);

        /* 卡片下方符文名 */
        const nameEl = document.createElement("div");
        nameEl.className = "rune-card-name";
        nameEl.textContent = rune ? rune.name : "未选择";
        slot.appendChild(nameEl);

        container.appendChild(slot);
    });
}


/* =========================================================
   符文下拉选择(点击槽位卡片弹出)
========================================================= */

let runePicker = null;

/* 出装编辑弹窗状态 */
let equipEditorOpen = false;
let equipPickPos = null;      // 当前定位筛选
let backupPickIndex = null;   // 待拖入备用装备的槽位下标
let equipMenuEl = null;       // 槽位右键菜单元素

function closeRunePicker() {
    if (runePicker) {
        runePicker.el.remove();
        runePicker = null;
    }
}

function openRunePicker(buildIndex, type, anchorCard) {
    closeRunePicker();

    const build = buildIndex === "universal" ? getUniversalBuild() : getSchemes()[buildIndex];
    if (!build) return;

    const currentName = getSelectedRuneName(build, type);
    const typeInfo = RUNE_TYPES.find(t => t.key === type);
    const bgUrl = RUNE_BG[type];

    const panel = document.createElement("div");
    panel.className = "rune-picker";

    const panelTitle = document.createElement("div");
    panelTitle.className = "rune-picker-title";
    panelTitle.textContent = (typeInfo?.label || "") + "符文 · 选择";
    panel.appendChild(panelTitle);

    /* 横向列表容器: 不显示当前已选中的符文 */
    const listEl = document.createElement("div");
    listEl.className = "rune-option-list";

    runeData[type].forEach(rune => {
        if (rune.name === currentName) return;

        const option = document.createElement("div");
        option.className = "rune-option";
        option.dataset.name = rune.name;

        /* 卡片: 该类型共用背景图 + 居中符文图标 */
        const card = document.createElement("div");
        card.className = "rune-option-card";
        card.style.backgroundImage = `url('${bgUrl}')`;

        const iconUrl = (RUNE_ICONS && RUNE_ICONS[rune.name]) || "";
        if (iconUrl) {
            const img = document.createElement("img");
            img.src = iconUrl;
            img.alt = rune.name;
            img.draggable = false;
            img.loading = "lazy";
            card.appendChild(img);
        } else {
            const mark = document.createElement("span");
            mark.className = "rune-option-placeholder";
            mark.textContent = "?";
            card.appendChild(mark);
        }
        option.appendChild(card);

        /* 下方符文名 */
        const nameEl = document.createElement("div");
        nameEl.className = "rune-option-name";
        nameEl.textContent = rune.name;
        option.appendChild(nameEl);

        /* 悬浮下拉项: 显示 info 气泡 */
        bindRuneInfo(option, rune);

        option.onclick = () => {
            setRuneSelection(buildIndex, type, rune.name);
        };

        listEl.appendChild(option);
    });

    panel.appendChild(listEl);
    document.body.appendChild(panel);

    /* 定位到卡片附近 */
    const rect = anchorCard.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    let top = rect.bottom + 6;
    let left = rect.left;
    if (top + panelRect.height > window.innerHeight - 10) {
        top = Math.max(10, rect.top - panelRect.height - 6);
    }
    if (left + panelRect.width > window.innerWidth - 10) {
        left = window.innerWidth - panelRect.width - 10;
    }
    panel.style.top = `${top}px`;
    panel.style.left = `${left}px`;

    runePicker = { buildIndex, type, el: panel };
}

function onPickerOutsideClick(event) {
    if (!runePicker) return;
    if (runePicker.el.contains(event.target)) return;
    /* 点击符文槽位卡片时由卡片自身的 click 决定开/关 */
    if (event.target.closest && event.target.closest(".rune-card")) return;
    closeRunePicker();
}

function onPickerViewportChange() {
    if (runePicker) closeRunePicker();
}

/* 设置某方案的某类符文选中(单类单符文); buildIndex 为 "universal" 时写通用符文 */
async function setRuneSelection(buildIndex, type, runeName) {
    if (buildIndex === "universal") {
        const entry = getUniversalEntry(currentHero);
        entry.runes = { ...entry.runes, [type]: [runeName] };
        setUniversalEntry(currentHero, entry);

        closeRunePicker();
        await saveData();
        renderSchemes();
        return;
    }

    const build = getSchemes()[buildIndex];
    if (!build) return;

    const builds = getSchemes();
    builds[buildIndex] = {
        ...build,
        runes: {
            ...build.runes,
            [type]: [runeName]
        }
    };
    writeBack(currentHero, builds);

    closeRunePicker();
    await saveData();
    renderSchemes();
}


/* =========================================================
   查找符文
========================================================= */

function findRune(name) {
    const groups = [runeData.colorful, runeData.attack, runeData.defense, runeData.general];
    for (const group of groups) {
        const rune = group.find(item => item.name === name);
        if (rune) return rune;
    }
    return null;
}


/* =========================================================
   符文信息浮层(info): 悬浮符文时在指针旁显示名称+描述
========================================================= */

let runeInfoEl = null;

function getRuneInfoEl() {
    if (!runeInfoEl) {
        runeInfoEl = document.createElement("div");
        runeInfoEl.className = "rune-info";
        runeInfoEl.style.display = "none";
        document.body.appendChild(runeInfoEl);
    }
    return runeInfoEl;
}

function showRuneInfoAt(rune, x, y) {
    const info = getRuneInfoEl();
    info.innerHTML = "";
    info.style.display = "block";

    const name = document.createElement("div");
    name.className = "rune-info-name";
    name.textContent = rune.name;
    info.appendChild(name);

    const desc = document.createElement("div");
    desc.className = "rune-info-desc";
    desc.textContent = (rune.description && rune.description.trim())
        ? rune.description
        : "暂无符文描述";
    info.appendChild(desc);

    /* 先把元素挂上以便量尺寸, 再做碰撞调整 */
    const pad = 12;
    let left = x + pad;
    let top = y + pad;
    const rect = info.getBoundingClientRect();
    if (left + rect.width > window.innerWidth - 6) {
        left = x - rect.width - pad;
    }
    if (top + rect.height > window.innerHeight - 6) {
        top = y - rect.height - pad;
    }
    info.style.left = `${Math.max(6, left)}px`;
    info.style.top = `${Math.max(6, top)}px`;
}

function hideRuneInfo() {
    if (runeInfoEl) runeInfoEl.style.display = "none";
}

/* 悬浮槽位卡片时: 显示 info 气泡; 移出时隐藏 */
function bindRuneInfo(el, rune) {
    el.onmouseenter = () => {
        const r = el.getBoundingClientRect();
        showRuneInfoAt(rune, r.left + r.width / 2, r.top);
    };
    el.onmouseleave = hideRuneInfo;
}


/* =========================================================
   出装: 只读摘要 + 居中弹窗编辑(槽位 + 装备列表)
========================================================= */

function getEquipInfo(name) {
    if (!name) return null;
    return equipNameMap[name] || null;
}

/* equip-summary: 可变行数布局, 直接展示全部装备
   底行 = 三级主装备紧凑排列; 非三级主装备浮在其后第一件三级主装备的正上方
   (多个非三级依次向上堆叠, 越早出现的越靠上); 备1 在三级主装备正上方, 备2 在其下方 */
function renderEquipSummary(build, container, buildIndex) {
    if (!container || !build) return;
    container.innerHTML = "";

    const equips = normalizeEquips(build.equips);
    const b1 = normalizeEquipsBackup(build.equipsBackup, equips.length);
    const b2 = normalizeEquipsBackup(build.equipsBackup2, equips.length);

    if (!equips.some(n => !!n)) {
        const hint = document.createElement("div");
        hint.className = "equip-summary-empty";
        hint.textContent = "暂无装备";
        container.appendChild(hint);
        return;
    }

    /* 组装列: 每件三级主装备一列, 列内自上而下 = 非三级升级链 → 备1 → 三级主 → 备2;
       非三级主装备挂到其后第一件三级主装备的列上, 末尾没有三级的挂到最后一列 */
    const columns = [];
    let pending = [];
    equips.forEach((name, i) => {
        if (!name) return;                    /* 空格跳过, 不占摘要列 */
        const info = getEquipInfo(name);
        if (info && info.tier === "3") {
            columns.push({
                chain: pending,
                backup1: b1[i] || null,
                main: name,
                backup2: b2[i] || null,
                hasBackup: !!(b1[i] || b2[i])
            });
            pending = [];
        } else {
            pending.push(name);
            if (b1[i]) pending.push(b1[i]);   /* 非三级主装备的备用跟随其列 */
            if (b2[i]) pending.push(b2[i]);
        }
    });
    if (pending.length) {
        if (columns.length) columns[columns.length - 1].chain.push(...pending);
        else columns.push({ chain: pending, backup1: null, main: null, backup2: null, hasBackup: false });
    }

    /* 规则: 有备用装备的列(上方被备1占用), 其升级链改排到前一个三级列的下方;
       没有前一个三级列时改排到本列下方 */
    const belowOf = Array.from({ length: columns.length }, () => []);
    columns.forEach((col, ci) => {
        if (col.hasBackup && col.chain.length) {
            const target = ci > 0 ? belowOf[ci - 1] : belowOf[ci];
            target.push(...col.chain);
            col.chain = [];
        }
    });

    /* 行数: 上方 = max(备1, 各列链长); 下方 = max(改排链长 + 备2) */
    const rowsAbove = Math.max(1, ...columns.map(c => (c.hasBackup ? 1 : c.chain.length)));
    const rowsBelow = Math.max(0, ...columns.map((c, ci) => belowOf[ci].length + (c.backup2 ? 1 : 0)));
    const totalRows = 1 + rowsAbove + rowsBelow;

    container.style.gridTemplateRows = `repeat(${totalRows}, auto)`;

    const makeCell = (name, plusEmpty) => {
        const cell = document.createElement("div");
        cell.className = "equip-slot equip-summary-cell";

        /* 点击任意格进入编辑弹窗 */
        if (typeof buildIndex === "number") cell.onclick = () => openEquipEditor(buildIndex);

        const info = getEquipInfo(name);
        if (!info) {
            if (plusEmpty) {
                const card = document.createElement("div");
                card.className = "equip-slot-card";
                const plus = document.createElement("span");
                plus.className = "equip-slot-plus";
                plus.textContent = "+";
                card.appendChild(plus);
                cell.appendChild(card);
            }
            return cell;  /* 空占位, 仅用于行列对齐 */
        }

        const card = buildEquipCard(info, null, null);
        cell.appendChild(card);

        const nameEl = document.createElement("div");
        nameEl.className = "equip-slot-name";
        nameEl.textContent = info.tier !== "3" ? `${info.name}·T${info.tier}` : info.name;
        cell.appendChild(nameEl);
        return cell;
    };

    columns.forEach((col, ci) => {
        /* 上方: 有备用时显示备1, 否则显示升级链(向上堆叠, 依次) */
        const aboveItems = col.hasBackup ? (col.backup1 ? [col.backup1] : []) : col.chain;
        for (let k = 0; k < rowsAbove - aboveItems.length; k++) container.appendChild(makeCell(null, false));  /* 顶部对齐补位 */
        aboveItems.forEach(n => container.appendChild(makeCell(n, false)));
        /* 底行: 三级主装备, 空格显示 + */
        container.appendChild(makeCell(col.main, !col.main));
        /* 下方: 改排的升级链 + 备2 */
        const below = belowOf[ci];
        below.forEach(n => container.appendChild(makeCell(n, false)));
        if (col.backup2) container.appendChild(makeCell(col.backup2, false));
        for (let k = 0; k < rowsBelow - below.length - (col.backup2 ? 1 : 0); k++) container.appendChild(makeCell(null, false));  /* 底部对齐补位 */
    });
}

/* 生成槽位卡片: 单装备占满; 主+备用1 为双图, 主+备用1+备用2 为三图,
   裁剪多边形见 index.html 的 .dual/.triple 规则(调试工具产出, 已去误差) */
function buildEquipCard(mainInfo, backupInfo, backup2Info) {
    const card = document.createElement("div");

    const infos = [mainInfo, backupInfo, backup2Info].filter(Boolean);
    if (infos.length >= 2) {
        card.className = "equip-slot-card " + (infos.length === 3 ? "triple" : "dual");
        infos.forEach(info => {
            const img = document.createElement("img");
            img.src = equipIconUrl(info.name);
            img.alt = info.name;
            img.loading = "lazy";
            img.draggable = false;
            img.onerror = function () { img.style.display = "none"; };
            card.appendChild(img);
        });
        return card;
    }

    card.className = "equip-slot-card" + (mainInfo ? " has-equip" : "");

    if (mainInfo) {
        const img = document.createElement("img");
        img.src = equipIconUrl(mainInfo.name);
        img.alt = mainInfo.name;
        img.loading = "lazy";
        img.draggable = false;
        img.onerror = function () { img.style.display = "none"; };
        card.appendChild(img);
    } else {
        const plus = document.createElement("span");
        plus.className = "equip-slot-plus";
        plus.textContent = "+";
        card.appendChild(plus);
    }

    return card;
}

/* 渲染可编辑装备槽(弹窗内): 格数不限, 末尾附“增加一格”按钮;
   右键装备弹出菜单(删除/备用装备), 空格右键直接删除此格 */
function renderEquipBar(build) {
    const bar = document.getElementById("equipBar");
    if (!bar) return;
    bar.innerHTML = "";

    const slotCount = build.equips.length;
    const canRemoveSlot = slotCount > EQUIP_SLOT_COUNT;

    for (let i = 0; i < slotCount; i++) {
        const mainInfo = getEquipInfo(build.equips[i]);
        const backupInfo = getEquipInfo(build.equipsBackup[i]);
        const backup2Info = getEquipInfo(build.equipsBackup2[i]);
        const awaitingBackup = backupPickIndex === i;

        const slot = document.createElement("div");
        slot.className = "equip-slot" + (awaitingBackup ? " await-backup" : "");
        slot.dataset.index = i;

        const card = buildEquipCard(mainInfo, backupInfo, backup2Info);

        if (equipEditorOpen) {
            /* 槽位自身可拖起: 主装备移动/交换, 备用装备跟随 */
            if (mainInfo) {
                slot.draggable = true;
                slot.addEventListener("dragstart", (e) => {
                    e.dataTransfer.setData("text/x-slot-index", String(i));
                    e.dataTransfer.effectAllowed = "move";
                    slot.classList.add("dragging");
                });
                slot.addEventListener("dragend", () => {
                    slot.classList.remove("dragging");
                });
            }

            /* 拖拽目标: 装备列表拖入 / 槽位间移动; 待备用槽位的拖入优先作为备用装备 */
            slot.addEventListener("dragover", (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = e.dataTransfer.types.includes("text/x-slot-index")
                    ? "move" : "copy";
                card.classList.add("drag-over");
            });
            slot.addEventListener("dragleave", () => {
                card.classList.remove("drag-over");
            });
            slot.addEventListener("drop", (e) => {
                e.preventDefault();
                card.classList.remove("drag-over");
                const fromSlot = e.dataTransfer.getData("text/x-slot-index");
                if (fromSlot !== "") {
                    const from = Number(fromSlot);
                    if (Number.isInteger(from) && from !== i) moveEquipBetweenSlots(from, i);
                    return;
                }
                const name = e.dataTransfer.getData("text/plain");
                if (!name) return;
                if (awaitingBackup) {
                    fillBackupIntoSlot(i, name);
                } else {
                    fillEquipIntoSlot(i, name);
                }
            });

            /* 点击待备用槽位: 取消等待拖入 */
            slot.addEventListener("click", () => {
                if (backupPickIndex === i) {
                    backupPickIndex = null;
                    renderEquipBar(build);
                }
            });

            /* 右键: 有装备弹操作菜单; 空格且格数多于基础 6 格时直接删除此格 */
            slot.addEventListener("contextmenu", (e) => {
                e.preventDefault();
                if (build.equips[i]) {
                    openEquipMenu(i, e.clientX, e.clientY);
                } else if (canRemoveSlot) {
                    backupPickIndex = null;
                    removeEquipSlot(i);
                }
            });
        }

        slot.appendChild(card);

        const nameEl = document.createElement("div");
        nameEl.className = "equip-slot-name";
        nameEl.textContent = awaitingBackup
            ? "拖入备用装备…"
            : (mainInfo
                ? [mainInfo, backupInfo, backup2Info].filter(Boolean).map(x => x.name).join(" / ")
                : "");
        slot.appendChild(nameEl);

        bar.appendChild(slot);
    }

    /* 末尾“增加一格”按钮: 追加一个空槽, 格数不限 */
    const addSlot = document.createElement("div");
    addSlot.className = "equip-slot equip-add-slot";
    addSlot.title = "增加一格";

    const addCard = document.createElement("div");
    addCard.className = "equip-slot-card";
    const addPlus = document.createElement("span");
    addPlus.className = "equip-slot-plus";
    addPlus.textContent = "+";
    addCard.appendChild(addPlus);
    addSlot.appendChild(addCard);

    const addLabel = document.createElement("div");
    addLabel.className = "equip-slot-name";
    addLabel.textContent = "增加一格";
    addSlot.appendChild(addLabel);

    addSlot.onclick = addEquipSlot;
    bar.appendChild(addSlot);
}


/* =========================================================
   槽位右键菜单(删除装备 / 备用装备)
========================================================= */

function closeEquipMenu() {
    if (equipMenuEl) {
        equipMenuEl.remove();
        equipMenuEl = null;
    }
}

/* 在 (x, y) 处弹出某槽位的操作菜单 */
function openEquipMenu(slotIndex, x, y) {
    closeEquipMenu();

    const build = getEditBuild();
    if (!build || !build.equips[slotIndex]) return;

    const backupCount = (build.equipsBackup[slotIndex] ? 1 : 0)
        + (build.equipsBackup2[slotIndex] ? 1 : 0);

    const menu = document.createElement("div");
    menu.className = "equip-context-menu";

    /* 删除主装备(有备用时按顺序顶替) */
    const btnDelete = document.createElement("button");
    btnDelete.type = "button";
    btnDelete.className = "equip-context-item";
    btnDelete.textContent = backupCount ? "删除装备(备用顶替)" : "删除装备";
    btnDelete.onclick = () => {
        closeEquipMenu();
        removeEquipFromSlot(slotIndex);
    };
    menu.appendChild(btnDelete);

    /* 备用装备: 每格最多两个; 移除时移除最后一个(靠后的备用顶替靠前的) */
    if (backupCount < 2) {
        const btnAdd = document.createElement("button");
        btnAdd.type = "button";
        btnAdd.className = "equip-context-item";
        btnAdd.textContent = "添加备用装备";
        btnAdd.onclick = () => {
            closeEquipMenu();
            backupPickIndex = slotIndex;
            renderEquipBar(getEditBuild());
        };
        menu.appendChild(btnAdd);
    }

    if (backupCount > 0) {
        const btnRemove = document.createElement("button");
        btnRemove.type = "button";
        btnRemove.className = "equip-context-item";
        btnRemove.textContent = "移除备用装备";
        btnRemove.onclick = () => {
            closeEquipMenu();
            removeBackupFromSlot(slotIndex);
        };
        menu.appendChild(btnRemove);
    }

    document.body.appendChild(menu);

    /* 边缘防溢出 */
    const rect = menu.getBoundingClientRect();
    let left = x;
    let top = y;
    if (left + rect.width > window.innerWidth - 8) left = window.innerWidth - rect.width - 8;
    if (top + rect.height > window.innerHeight - 8) top = y - rect.height;
    menu.style.left = `${Math.max(8, left)}px`;
    menu.style.top = `${Math.max(8, top)}px`;

    equipMenuEl = menu;
}


/* 槽位间拖拽: 主装备与备用装备作为整体移动/交换 */
async function moveEquipBetweenSlots(fromIndex, toIndex) {
    const build = getEditBuild();
    if (!build || fromIndex === toIndex) return;

    build.equips = normalizeEquips(build.equips);
    build.equipsBackup = normalizeEquipsBackup(build.equipsBackup, build.equips.length);
    build.equipsBackup2 = normalizeEquipsBackup(build.equipsBackup2, build.equips.length);
    if (fromIndex < 0 || fromIndex >= build.equips.length) return;
    if (toIndex < 0 || toIndex >= build.equips.length) return;

    [build.equips[fromIndex], build.equips[toIndex]] =
        [build.equips[toIndex], build.equips[fromIndex]];
    [build.equipsBackup[fromIndex], build.equipsBackup[toIndex]] =
        [build.equipsBackup[toIndex], build.equipsBackup[fromIndex]];
    [build.equipsBackup2[fromIndex], build.equipsBackup2[toIndex]] =
        [build.equipsBackup2[toIndex], build.equipsBackup2[fromIndex]];

    await saveBuildEdit(build);
}

/* 弹窗内容: 顶部定位筛选 + 三行(T1/T2/T3)装备列表 */
function renderEquipEditor() {
    const modal = document.getElementById("equipModal");
    const tabsEl = document.getElementById("equipPosTabs");
    const colsEl = document.getElementById("equipTierCols");
    if (!modal || !tabsEl || !colsEl) return;

    modal.hidden = false;

    const positions = getEquipPositions();
    if (!equipPickPos || !positions.includes(equipPickPos)) {
        equipPickPos = positions[0] || null;
    }
    if (!equipPickPos) return;

    /* 定位 tabs */
    tabsEl.innerHTML = "";
    positions.forEach(pos => {
        const tab = document.createElement("button");
        tab.type = "button";
        tab.className = "equip-pos-tab" + (pos === equipPickPos ? " active" : "");
        tab.textContent = pos;
        tab.onclick = () => {
            equipPickPos = pos;
            renderEquipEditor();
        };
        tabsEl.appendChild(tab);
    });

    /* 三行: tier 1/2/3 */
    colsEl.innerHTML = "";
    EQUIP_TIERS.forEach(tier => {
        const col = document.createElement("div");
        col.className = "equip-tier-col";

        const title = document.createElement("div");
        title.className = "equip-tier-col-title";

        const tierNum = document.createElement("span");
        tierNum.className = "tier-num";
        tierNum.textContent = `T${tier}`;
        title.appendChild(tierNum);

        const tierText = document.createElement("span");
        tierText.textContent = TIER_LABEL[tier];
        title.appendChild(tierText);

        col.appendChild(title);

        const listEl = document.createElement("div");
        listEl.className = "equip-tier-list";
        const list = (equipData[equipPickPos] && equipData[equipPickPos][tier]) || [];

        list.forEach(name => {
            const opt = document.createElement("div");
            opt.className = "equip-option";
            opt.dataset.name = name;
            opt.draggable = true;

            const img = document.createElement("img");
            img.src = equipIconUrl(name);
            img.alt = "";
            img.loading = "lazy";
            img.onerror = function () { img.style.display = "none"; };
            opt.appendChild(img);

            const nameEl = document.createElement("div");
            nameEl.className = "equip-option-name";
            nameEl.textContent = name;
            opt.appendChild(nameEl);

            /* 拖拽: 携带装备名, 供槽位 drop 使用 */
            opt.addEventListener("dragstart", (e) => {
                e.dataTransfer.setData("text/plain", name);
                e.dataTransfer.effectAllowed = "copy";
                opt.classList.add("dragging");
            });
            opt.addEventListener("dragend", () => {
                opt.classList.remove("dragging");
            });

            listEl.appendChild(opt);
        });

        col.appendChild(listEl);
        colsEl.appendChild(col);
    });
}

/* 当前弹窗编辑的方案索引 */
let equipEditBuildIndex = -1;

function getEditBuild() {
    if (!currentHero || equipEditBuildIndex < 0) return null;
    const builds = getSchemes();
    return builds[equipEditBuildIndex] || null;
}

function openEquipEditor(buildIndex) {
    const build = getSchemes()[buildIndex];
    if (!build) return;
    equipEditorOpen = true;
    equipEditBuildIndex = buildIndex;
    equipPickPos = getEquipPositions()[0] || null;
    document.getElementById("equipModal").hidden = false;
    renderEquipBar(build);
    renderEquipEditor();
}

function closeEquipModal() {
    const modal = document.getElementById("equipModal");
    if (modal) modal.hidden = true;
    equipEditorOpen = false;
    equipEditBuildIndex = -1;
    backupPickIndex = null;
    closeEquipMenu();
}

function closeEquipEditor() {
    closeEquipModal();
    renderSchemes();
}

/* 写回弹窗编辑中的方案并刷新弹窗与页面 */
async function saveBuildEdit(build) {
    const builds = getSchemes();
    builds[equipEditBuildIndex] = build;
    writeBack(currentHero, builds);

    await saveData();
    renderEquipBar(build);
    renderEquipEditor();
    renderSchemes();
}

/* 把装备填入某槽(拖拽放下) */
async function fillEquipIntoSlot(index, equipName) {
    const build = getEditBuild();
    if (!build || index < 0 || index >= build.equips.length) return;

    build.equips = normalizeEquips(build.equips);
    build.equips[index] = equipName;
    await saveBuildEdit(build);
}

/* 删除某槽主装备; 有备用装备时按顺序顶替(备1→主, 备2→备1) */
async function removeEquipFromSlot(index) {
    const build = getEditBuild();
    if (!build || index < 0 || index >= build.equips.length) return;

    build.equips = normalizeEquips(build.equips);
    build.equipsBackup = normalizeEquipsBackup(build.equipsBackup, build.equips.length);
    build.equipsBackup2 = normalizeEquipsBackup(build.equipsBackup2, build.equips.length);

    if (build.equipsBackup[index]) {
        build.equips[index] = build.equipsBackup[index];
        build.equipsBackup[index] = build.equipsBackup2[index] || null;
        build.equipsBackup2[index] = null;
    } else {
        build.equips[index] = null;
    }
    backupPickIndex = null;
    await saveBuildEdit(build);
}

/* 把装备填入某槽的备用位(先右键“添加备用装备”进入等待, 再拖入;
   备1 优先填充, 每格最多两个备用) */
async function fillBackupIntoSlot(index, equipName) {
    const build = getEditBuild();
    if (!build || index < 0 || index >= build.equips.length) return;
    if (!build.equips[index]) return;

    if (!build.equipsBackup[index]) {
        build.equipsBackup[index] = equipName;
    } else if (!build.equipsBackup2[index]) {
        build.equipsBackup2[index] = equipName;
    } else {
        return;
    }
    backupPickIndex = null;
    await saveBuildEdit(build);
}

/* 移除某槽最后一个备用装备(备2 优先移除; 只剩备1 时移除备1) */
async function removeBackupFromSlot(index) {
    const build = getEditBuild();
    if (!build || index < 0 || index >= build.equips.length) return;

    if (build.equipsBackup2[index]) {
        build.equipsBackup2[index] = null;
    } else {
        build.equipsBackup[index] = null;
    }
    backupPickIndex = null;
    await saveBuildEdit(build);
}

/* 编辑弹窗内追加一个空槽(格数不限) */
async function addEquipSlot() {
    const build = getEditBuild();
    if (!build) return;

    build.equips = normalizeEquips(build.equips);
    build.equipsBackup = normalizeEquipsBackup(build.equipsBackup, build.equips.length);
    build.equipsBackup2 = normalizeEquipsBackup(build.equipsBackup2, build.equips.length);
    build.equips.push(null);
    build.equipsBackup.push(null);
    build.equipsBackup2.push(null);
    backupPickIndex = null;
    await saveBuildEdit(build);
}

/* 删除一个空槽(仅当格数多于基础 6 格时允许, 由右键空格触发) */
async function removeEquipSlot(index) {
    const build = getEditBuild();
    if (!build) return;

    build.equips = normalizeEquips(build.equips);
    build.equipsBackup = normalizeEquipsBackup(build.equipsBackup, build.equips.length);
    build.equipsBackup2 = normalizeEquipsBackup(build.equipsBackup2, build.equips.length);
    if (build.equips.length <= EQUIP_SLOT_COUNT) return;
    build.equips.splice(index, 1);
    build.equipsBackup.splice(index, 1);
    build.equipsBackup2.splice(index, 1);
    backupPickIndex = null;
    await saveBuildEdit(build);
}


/* =========================================================
   通用符文开关(顶部按钮)
========================================================= */

async function toggleUniversalRune() {
    if (!currentHero) return;
    closeRunePicker();

    /* 符文内容默认为空, 开启后在面板中自行选择 */
    const entry = getUniversalEntry(currentHero);
    entry.enabled = !entry.enabled;
    setUniversalEntry(currentHero, entry);

    await saveData();
    renderSchemes();
    updateUniversalButton();
}

function updateUniversalButton() {
    const btn = document.getElementById("btnUniversalRune");
    if (!btn) return;
    const on = !!currentHero && getUniversalEntry(currentHero).enabled;
    btn.classList.toggle("primary", on);
    btn.textContent = on ? "通用符文: 开" : "通用符文: 关";
    btn.disabled = !currentHero;
}


/* 设置方案分路标签(仅保存, 不整卡重绘, 保持下拉框状态) */
async function setBuildLane(buildIndex, lane) {
    if (!currentHero) return;
    const builds = getHeroBuilds(currentHero);
    const build = builds[buildIndex];
    if (!build) return;

    builds[buildIndex] = { ...build, lane: lane || null };
    writeBack(currentHero, builds);
    await saveData();
}

/* 设置方案人物(选手)标签(仅保存, 不整卡重绘, 保持下拉框状态) */
async function setBuildPlayer(buildIndex, player) {
    if (!currentHero) return;
    const builds = getHeroBuilds(currentHero);
    const build = builds[buildIndex];
    if (!build) return;

    builds[buildIndex] = { ...build, player: player || null };
    writeBack(currentHero, builds);
    await saveData();
}


/* =========================================================
   新建 / 备注 / 删除方案
========================================================= */

async function createBuild() {
    if (!currentHero) return;

    /* 不再要求命名, 直接创建; 备注可通过“✎ 备注”后续添加; 符文默认为空, 需自行选择 */
    const builds = getHeroBuilds(currentHero);
    builds.push({
        name: "新方案",
        runes: { colorful: [], attack: [], defense: [], general: [] },
        equips: normalizeEquips(),
        equipsBackup: normalizeEquipsBackup(null, EQUIP_SLOT_COUNT),
        equipsBackup2: normalizeEquipsBackup(null, EQUIP_SLOT_COUNT)
    });

    writeBack(currentHero, builds);

    await saveData();
    renderSchemes();
}

/* 编辑方案备注(原“重命名”概念, 备注可选) */
async function editBuildRemark(buildIndex) {
    if (!currentHero) return;
    const builds = getHeroBuilds(currentHero);
    const build = builds[buildIndex];
    if (!build) return;

    const name = prompt("请输入方案备注", build.name === "新方案" ? "" : build.name);
    if (name === null) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === build.name) return;

    builds[buildIndex] = { ...build, name: trimmed };
    writeBack(currentHero, builds);

    await saveData();
    renderSchemes();
}

async function deleteBuild(buildIndex) {
    if (!currentHero) return;

    const builds = getHeroBuilds(currentHero);
    const build = builds[buildIndex];
    if (!build) return;

    if (!confirm(`确定删除第${buildIndex + 1}个方案「${build.name}」吗?`)) return;

    builds.splice(buildIndex, 1);
    writeBack(currentHero, builds);

    await saveData();
    renderSchemes();
}


/* =========================================================
   事件绑定
========================================================= */

document.getElementById("btnCreateBuild").addEventListener("click", createBuild);

document.getElementById("btnUniversalRune").addEventListener("click", toggleUniversalRune);

document.getElementById("btnDoneEquip").addEventListener("click", closeEquipEditor);

/* 点击弹窗遮罩关闭 */
document.getElementById("equipModal").addEventListener("mousedown", function (e) {
    if (e.target === this) closeEquipEditor();
});

/* 符文下拉浮层的全局关闭事件(只注册一次) */
document.addEventListener("mousedown", onPickerOutsideClick);
window.addEventListener("scroll", onPickerViewportChange, true);
window.addEventListener("resize", onPickerViewportChange);

/* 右键菜单外按下时关闭菜单 */
document.addEventListener("mousedown", (e) => {
    if (equipMenuEl && !equipMenuEl.contains(e.target)) closeEquipMenu();
});

/* 点击非高亮槽位时取消备用装备等待。
   用 click 而非 mousedown: 原生拖拽以 mousedown 开始且结束后不触发 click,
   这样从装备列表起拖不会误取消等待状态 */
document.addEventListener("click", (e) => {
    if (backupPickIndex === null || !equipEditorOpen) return;
    /* 右键菜单内的点击(如“添加备用装备”本身)不算取消 */
    if (e.target.closest && e.target.closest(".equip-context-menu")) return;

    const pendingSlot = document.querySelector(
        `#equipBar .equip-slot[data-index="${backupPickIndex}"]`
    );
    if (!pendingSlot || !pendingSlot.contains(e.target)) {
        backupPickIndex = null;
        const build = getEditBuild();
        if (build) renderEquipBar(build);
    }
});


/* =========================================================
   启动: 加载英雄与本地数据, 不自动创建默认方案
========================================================= */

async function boot() {
    try {
        const heroRes = await loadRemote("api/heroes");
        heroes = Array.isArray(heroRes.heroes) ? heroRes.heroes : [];
    } catch (error) {
        console.error("读取英雄列表失败:", error);
    }

    try {
        const laneRes = await loadRemote("api/lanes");
        heroLanes = laneRes.lanes && typeof laneRes.lanes === "object" ? laneRes.lanes : {};
    } catch (error) {
        console.error("读取英雄分路数据失败:", error);
        heroLanes = {};
    }

    try {
        const playerRes = await loadRemote("api/players");
        heroPlayers = playerRes.players && typeof playerRes.players === "object" ? playerRes.players : {};
    } catch (error) {
        console.error("读取选手数据失败:", error);
        heroPlayers = {};
    }

    const loaded = await Promise.all([loadData(), loadEquipData()]);
    data = loaded[0];

    /* 深链: ?hero=英雄名 → 直接进入该英雄的备战方案（由主项目「英雄详情」跳入）
       英雄列表已移除，未带参数时显示引导而非任意英雄 */
    let wanted = null;
    try {
        wanted = new URLSearchParams(location.search).get("hero");
    } catch (error) { /* 忽略参数解析异常 */ }

    if (wanted && heroes.includes(wanted)) {
        selectHero(wanted);
    } else {
        showEntryHint(wanted);
    }
}


/* 无英雄参数（或英雄不存在）时的引导：入口在主站「梯度排行 → 英雄详情」 */
function showEntryHint(badName) {
    const avatar = document.getElementById("heroAvatar");
    if (avatar) avatar.textContent = "";
    const nameEl = document.getElementById("heroName");
    if (nameEl) nameEl.textContent = "未选择英雄";

    const area = document.getElementById("buildsArea");
    if (!area) return;
    area.innerHTML = "";

    const box = document.createElement("div");
    box.className = "schemes-empty";
    box.textContent = badName
        ? `未找到英雄「${badName}」。`
        : "本页由英雄详情进入。";
    area.appendChild(box);

    const back = document.createElement("div");
    back.className = "schemes-empty";
    const link = document.createElement("a");
    link.href = "/";
    link.textContent = "← 前往梯度排行，点开英雄后选择「🧩 备战方案」";
    link.style.color = "#58a6ff";
    back.appendChild(link);
    area.appendChild(back);
}

boot();
