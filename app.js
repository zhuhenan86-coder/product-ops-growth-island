(() => {
  "use strict";

  const DATA = window.ISLAND_DATA;
  const STORAGE_KEY = "product-ops-growth-island-v1";
  const LEVELS = [
    [0, "产品萌新"], [100, "产品观察员"], [250, "用户研究员"], [500, "数据分析员"],
    [850, "产品运营"], [1300, "增长运营"], [1900, "高级运营"], [2700, "产品专家"],
    [3700, "产品负责人"], [5000, "AI 产品运营"]
  ];
  const MOODS = {
    full: { emoji: "🌞", label: "精力满满", count: 3, minutes: 30, copy: "今天可以完成一轮完整训练。" },
    good: { emoji: "🙂", label: "还不错", count: 3, minutes: 20, copy: "普通节奏，做完三件小事就好。" },
    normal: { emoji: "😐", label: "一般", count: 2, minutes: 15, copy: "今天少一点，只保留重要任务。" },
    tired: { emoji: "😴", label: "有点累", count: 1, minutes: 8, copy: "先完成一个轻任务，不额外加压。" },
    low: { emoji: "🌧️", label: "状态很差", count: 1, minutes: 3, copy: "只向前一小步，也算今天有进展。" }
  };

  const defaultState = () => ({
    version: 1,
    user: { name: "岛民小航", xp: 0, coins: 0 },
    mood: "good",
    checkins: [],
    completedLessons: [],
    quizAnswers: {},
    notes: {},
    challengeAnswers: {},
    projectDrafts: {},
    reflections: [],
    activity: {},
    studyMinutes: 0,
    achievements: ["first-open"],
    eventLog: [{ event: "app_open", at: new Date().toISOString() }]
  });

  let state = loadState();
  let toastTimer;
  const app = document.getElementById("app");

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!saved || saved.version !== 1) return defaultState();
      return { ...defaultState(), ...saved, user: { ...defaultState().user, ...saved.user } };
    } catch {
      return defaultState();
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    updateSidebar();
  }

  function record(event, details = {}) {
    state.eventLog.push({ event, at: new Date().toISOString(), ...details });
    state.eventLog = state.eventLog.slice(-300);
  }

  function esc(value = "") {
    return String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  }

  function todayKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function addDays(date, amount) {
    const next = new Date(date);
    next.setDate(next.getDate() + amount);
    return next;
  }

  function formatDay(key) {
    const d = new Date(`${key}T12:00:00`);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  function dayOfYear() {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    return Math.floor((now - start) / 86400000);
  }

  function getLevel() {
    let index = 0;
    LEVELS.forEach((item, i) => { if (state.user.xp >= item[0]) index = i; });
    const current = LEVELS[index];
    const next = LEVELS[index + 1] || [current[0], current[1]];
    return { number: index + 1, name: current[1], floor: current[0], next: next[0], maxed: index === LEVELS.length - 1 };
  }

  function getStreak() {
    let streak = 0;
    let cursor = new Date();
    if (!state.activity[todayKey(cursor)]) cursor = addDays(cursor, -1);
    while (state.activity[todayKey(cursor)]) {
      streak += 1;
      cursor = addDays(cursor, -1);
    }
    return streak;
  }

  function weekDays() {
    let count = 0;
    for (let i = 0; i < 7; i += 1) if (state.activity[todayKey(addDays(new Date(), -i))]) count += 1;
    return count;
  }

  function nextLesson() {
    return DATA.lessons.find(item => !state.completedLessons.includes(item.id)) || DATA.lessons[DATA.lessons.length - 1];
  }

  function currentChallenge() {
    return DATA.challenges[dayOfYear() % DATA.challenges.length];
  }

  function dailyTasks() {
    const lesson = nextLesson();
    const challengeDone = Boolean(state.challengeAnswers[todayKey()]);
    const noteDone = Boolean((state.notes[lesson.id] || "").trim().length >= 10);
    const all = [
      { id: "lesson", title: `学习：${lesson.title}`, meta: `知识卡 · ${lesson.minutes} 分钟`, xp: lesson.xp, done: state.completedLessons.includes(lesson.id), href: `#/lesson/${lesson.id}` },
      { id: "challenge", title: "完成今日产品思考", meta: "开放题 · 5 分钟", xp: 10, done: challengeDone, href: "#/challenge" },
      { id: "practice", title: "留下一个实战答案", meta: "小任务 · 10 分钟", xp: 5, done: noteDone, href: `#/lesson/${lesson.id}#practice` }
    ];
    return all.slice(0, MOODS[state.mood].count);
  }

  function markActivity(minutes = 0) {
    const key = todayKey();
    state.activity[key] = (state.activity[key] || 0) + 1;
    state.studyMinutes += minutes;
  }

  function award(xp = 0, coins = 0) {
    state.user.xp += xp;
    state.user.coins += coins;
  }

  function unlockAchievements(silent = false) {
    const before = new Set(state.achievements);
    const complete = state.completedLessons.length;
    const quizCount = Object.keys(state.quizAnswers).length;
    const noteCount = Object.values(state.notes).filter(v => String(v).trim().length >= 10).length;
    const challengeCount = Object.keys(state.challengeAnswers).length;
    const projectCount = Object.values(state.projectDrafts).filter(v => v && Object.values(v).some(x => String(x).trim())).length;
    const rules = {
      "first-lesson": complete >= 1, "first-quiz": quizCount >= 1, "first-task": noteCount >= 1,
      "three-lessons": complete >= 3, "six-lessons": complete >= 6, "twelve-lessons": complete >= 12,
      "streak-3": getStreak() >= 3, "streak-7": getStreak() >= 7, "streak-30": getStreak() >= 30,
      "checkin-7": state.checkins.length >= 7, "challenge-1": challengeCount >= 1, "challenge-7": challengeCount >= 7,
      "project-1": projectCount >= 1, "app-analysis": Boolean(state.projectDrafts["app-analysis"]?.result),
      "all-today": dailyTasks().every(t => t.done), "xp-100": state.user.xp >= 100, "xp-500": state.user.xp >= 500,
      "coins-100": state.user.coins >= 100, "reflect-1": state.reflections.length >= 1,
      "mood-low": ["low", "tired"].includes(state.mood) && Boolean(state.activity[todayKey()]),
      "north-star": state.completedLessons.includes("north-star"), "week-4": weekDays() >= 4, "notes-5": noteCount >= 5
    };
    Object.entries(rules).forEach(([id, ok]) => { if (ok && !state.achievements.includes(id)) state.achievements.push(id); });
    const newly = state.achievements.filter(id => !before.has(id));
    if (!silent && newly.length) {
      const achievement = DATA.achievements.find(a => a.id === newly[0]);
      if (achievement) showToast(`解锁成就：${achievement.name} ${achievement.icon}`);
    }
  }

  function showToast(message) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
  }

  function progressMarkup(value, max, label = "进度") {
    const percent = max ? Math.min(100, Math.round(value / max * 100)) : 100;
    return `<div class="progress-track" role="progressbar" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${value}"><span style="width:${percent}%"></span></div>`;
  }

  function updateSidebar() {
    const days = weekDays();
    document.getElementById("side-week-days").textContent = `${days} / 4 天`;
    document.getElementById("side-streak").textContent = `🔥 ${getStreak()}`;
    document.getElementById("side-week-bar").style.width = `${Math.min(100, days / 4 * 100)}%`;
  }

  function updateNav(route) {
    const base = route.startsWith("lesson") ? "learn" : route.startsWith("project/") ? "projects" : route;
    document.querySelectorAll("[data-route]").forEach(link => link.classList.toggle("active", link.dataset.route === base));
  }

  function pageHeader(eyebrow, title, copy = "", action = "") {
    return `<header class="page-header"><div><div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(title)}</h1>${copy ? `<p>${esc(copy)}</p>` : ""}</div>${action}</header>`;
  }

  function renderHome() {
    const level = getLevel();
    const tasks = dailyTasks();
    const done = tasks.filter(t => t.done).length;
    const xpMax = level.maxed ? state.user.xp : level.next;
    const dayIndex = (state.checkins.length % 7) + 1;
    const checkedToday = state.checkins.includes(todayKey());
    app.innerHTML = `<div class="page">
      ${pageHeader("TODAY · " + new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" }), "今天，向前一小步", "你的进度只和昨天的自己比较。", `<div class="top-summary"><div class="avatar">P${level.number}</div><div><strong>${esc(state.user.name)}</strong><div class="small muted">Lv ${level.number} · ${level.name}</div></div></div>`)}
      <p class="daily-quote">“不用一下子成为很厉害的人，今天比昨天多懂一个产品知识就很好。”</p>
      <div class="grid grid-hero">
        <section class="card card-body" aria-labelledby="today-title">
          <div class="card-head"><div><div class="eyebrow">预计 ${MOODS[state.mood].minutes} 分钟</div><h2 id="today-title">今天只做 ${tasks.length} 件事</h2></div><span class="pill">${done}/${tasks.length} 完成</span></div>
          <div class="task-list">${tasks.map(task => `<a class="task-row ${task.done ? "done" : ""}" href="${task.href}"><span class="task-check">${task.done ? "✓" : task.id === "lesson" ? "读" : task.id === "challenge" ? "想" : "写"}</span><span><h3>${esc(task.title)}</h3><span class="small muted">${esc(task.meta)}</span></span><span class="task-reward">+${task.xp} XP</span></a>`).join("")}</div>
          <a class="button button-block" href="${tasks.find(t => !t.done)?.href || "#/learn"}">${done === tasks.length ? "看看下一段旅程" : "继续今天的学习"}</a>
        </section>
        <div class="grid">
          <section class="card card-body card-soft" aria-labelledby="mood-title"><div class="card-head"><div><div class="eyebrow">动态调整任务量</div><h2 id="mood-title">今天状态怎么样？</h2></div></div><div class="mood-list">${Object.entries(MOODS).map(([key, mood]) => `<button class="mood-button ${state.mood === key ? "active" : ""}" data-action="mood" data-value="${key}" aria-pressed="${state.mood === key}"><span>${mood.emoji}</span><small>${mood.label}</small></button>`).join("")}</div><p class="small muted" id="mood-copy">${MOODS[state.mood].copy}</p></section>
          <section class="card card-body card-dark" aria-labelledby="checkin-title"><div class="card-head"><div><div class="eyebrow">每日来访</div><h2 id="checkin-title">${checkedToday ? "今天已经签到" : `第 ${dayIndex} 天签到`}</h2></div><span class="pill pill-amber">${state.user.coins} P 币</span></div><div class="checkin-days">${[1,2,3,4,5,6,7].map(day => `<div class="checkin-day ${day < dayIndex || checkedToday && day === dayIndex ? "done" : ""} ${!checkedToday && day === dayIndex ? "active" : ""}"><strong>${day === 7 ? "宝箱" : `D${day}`}</strong><small>${day === 7 ? "惊喜" : `+${[5,6,7,8,10,15][day-1] || "?"}`}</small></div>`).join("")}</div><button class="button button-amber button-block" data-action="checkin" ${checkedToday ? "disabled" : ""}>${checkedToday ? "明天再来" : "轻轻签到一下"}</button></section>
        </div>
      </div>

      <section class="section"><div class="section-head"><div><h2>你的成长地图</h2><p>当前先走好新手村，后面的区域会逐步亮起来。</p></div><a class="button button-secondary" href="#/learn">查看完整地图</a></div>
        <div class="card map-preview" aria-label="学习地图预览">
          <div class="map-node node-1 current"><button data-goto="#/learn" aria-label="新手村">⌂</button><small>新手村</small></div>
          <div class="map-node node-2 locked"><button aria-label="用户森林，尚未解锁">♧</button><small>用户森林</small></div>
          <div class="map-node node-3 locked"><button aria-label="数据矿洞，尚未解锁">◆</button><small>数据矿洞</small></div>
          <div class="map-node node-4 locked"><button aria-label="AI 研究所，尚未解锁">✺</button><small>AI 研究所</small></div>
        </div>
      </section>

      <section class="section stat-grid" aria-label="成长数据">
        <div class="stat"><span class="small muted">当前等级</span><strong>Lv ${level.number}</strong><span class="small">${level.name}</span></div>
        <div class="stat"><span class="small muted">累计 XP</span><strong>${state.user.xp}</strong>${progressMarkup(state.user.xp, xpMax, "等级经验")}</div>
        <div class="stat"><span class="small muted">连续成长</span><strong>${getStreak()} 天</strong><span class="small">中断也没关系，继续就好</span></div>
        <div class="stat"><span class="small muted">知识地图</span><strong>${state.completedLessons.length}/12</strong><span class="small">新手村完成度</span></div>
      </section>
    </div>`;
  }

  function renderLearn() {
    const complete = state.completedLessons.length;
    app.innerHTML = `<div class="page">
      ${pageHeader("LEARNING MAP", "产品世界地图", "每个区域代表一种能力。先完成新手村的 12 个基础关卡。", `<span class="pill pill-amber">新手村 ${complete}/12</span>`)}
      <section class="card card-body card-dark"><div class="card-head"><div><div class="eyebrow">当前区域</div><h2>新手村 · 产品运营入门</h2></div><span class="pill pill-amber">称号：互联网萌新</span></div><p class="muted">目标：理解产品、用户、需求、场景和指标，建立后续学习所需的共同语言。</p>${progressMarkup(complete, 12, "新手村进度")}</section>
      <section class="lesson-grid" aria-label="新手村关卡">${DATA.lessons.map(lesson => `<a class="lesson-card ${state.completedLessons.includes(lesson.id) ? "completed" : ""}" href="#/lesson/${lesson.id}"><span class="pill">第 ${lesson.order} 关 · ${lesson.difficulty}</span><h3>${esc(lesson.title)}</h3><p>${esc(lesson.summary)}</p><footer><span class="small muted">${lesson.minutes} 分钟</span><strong>${state.completedLessons.includes(lesson.id) ? "已完成 ✓" : `+${lesson.xp} XP →`}</strong></footer></a>`).join("")}</section>
      <section class="section"><div class="section-head"><div><h2>未来区域</h2><p>完成新手村后继续解锁，内容路径已经为你保留。</p></div></div><div class="region-list">${DATA.regions.slice(1).map(region => `<article class="region locked"><div class="region-icon">${region.icon}</div><div><h3>Level ${region.level} · ${region.name}</h3><p>${region.subtitle} · 完成称号「${region.title}」</p></div><div class="region-meta"><span class="pill">尚未解锁</span></div></article>`).join("")}</div></section>
    </div>`;
  }

  function renderLesson(id) {
    const lesson = DATA.lessons.find(item => item.id === id) || DATA.lessons[0];
    const answer = state.quizAnswers[lesson.id];
    const note = state.notes[lesson.id] || "";
    const completed = state.completedLessons.includes(lesson.id);
    const canComplete = answer && note.trim().length >= 10;
    app.innerHTML = `<div class="page">
      <a class="button button-ghost" href="#/learn">← 返回学习地图</a>
      <div class="lesson-layout section">
        <article class="card lesson-article">
          <span class="pill">新手村 · 第 ${lesson.order} 关</span><h1>${esc(lesson.title)}</h1><p class="lead">${esc(lesson.summary)} · 预计 ${lesson.minutes} 分钟</p>
          <section class="knowledge-section"><h2>① 这个东西是什么</h2><p>${esc(lesson.sections.what)}</p></section>
          <section class="knowledge-section"><h2>② 为什么产品运营需要它</h2><p>${esc(lesson.sections.why)}</p></section>
          <section class="knowledge-section"><h2>③ 现实互联网产品案例</h2><div class="case-box"><p>${esc(lesson.sections.case)}</p></div></section>
          <section class="knowledge-section"><h2>④ 面试可能怎么问</h2><p>${esc(lesson.sections.interview)}</p></section>
          <section class="knowledge-section"><h2>⑤ 工作中什么时候会用到</h2><p>${esc(lesson.sections.work)}</p></section>
        </article>
        <aside class="lesson-side">
          <section class="card card-body" aria-labelledby="quiz-title"><div class="eyebrow">即时练习</div><h2 id="quiz-title">${esc(lesson.quiz.question)}</h2><div class="quiz-options">${lesson.quiz.options.map((option, index) => `<button class="quiz-option ${answer?.selected === index ? "selected" : ""} ${answer ? index === lesson.quiz.answer ? "correct" : answer.selected === index ? "wrong" : "" : ""}" data-action="quiz" data-lesson="${lesson.id}" data-index="${index}">${String.fromCharCode(65 + index)}. ${esc(option)}</button>`).join("")}</div>${answer ? `<div class="feedback">${answer.selected === lesson.quiz.answer ? "答对了。" : "这个答案还可以再想想。"}${esc(lesson.quiz.explanation)}</div>` : `<p class="small muted">提交后会看到思路解析，不只判断对错。</p>`}</section>
          <section class="card card-body card-soft" id="practice"><div class="eyebrow">小任务</div><h2>${esc(lesson.task.prompt)}</h2><p class="small muted">至少写 10 个字。内容会自动保存在当前设备。</p><textarea class="textarea" id="lesson-note" data-lesson="${lesson.id}" placeholder="${esc(lesson.task.template)}">${esc(note)}</textarea><button class="button button-block" data-action="complete-lesson" data-lesson="${lesson.id}" ${!canComplete || completed ? "disabled" : ""}>${completed ? "这一关已完成 ✓" : `完成关卡 · +${lesson.xp} XP`}</button></section>
        </aside>
      </div>
      ${completed ? `<section class="section card card-body card-amber"><div class="card-head"><div><div class="eyebrow">关卡完成</div><h2>你已经掌握「${esc(lesson.title)}」的基本思路</h2></div><span class="pill pill-amber">+${lesson.xp} XP</span></div><a class="button" href="${nextLesson().id === lesson.id ? "#/challenge" : `#/lesson/${nextLesson().id}`}">继续下一步</a></section>` : ""}
    </div>`;
  }

  function renderChallenge() {
    const key = todayKey();
    const saved = state.challengeAnswers[key] || "";
    app.innerHTML = `<div class="page">
      ${pageHeader("DAILY CHALLENGE", "今天的产品思考", "没有唯一标准答案。先写下你的判断，再补充新的角度。", `<span class="pill">连续成长 ${getStreak()} 天</span>`)}
      <div class="grid grid-hero">
        <section class="card challenge-question"><div class="eyebrow">今日问题 · ${formatDay(key)}</div><blockquote>${esc(currentChallenge())}</blockquote><div class="field"><label for="challenge-answer">我的思考</label><textarea class="textarea" id="challenge-answer" placeholder="可以从目标用户、使用场景、产品目标、收益和代价几个角度思考。">${esc(saved)}</textarea></div><button class="button" data-action="save-challenge">${saved ? "更新我的答案" : "保存答案 · +10 XP"}</button><div id="challenge-feedback">${saved ? `<div class="feedback">已经保存。你可以继续补充：如果把这个设计改掉，会获得什么，又会失去什么？</div>` : ""}</div></section>
        <section class="card card-body card-soft"><div class="eyebrow">产品经理思考方式</div><h2>不要急着找“正确答案”</h2><ol><li>先说设计服务的是谁。</li><li>再说它解决了什么场景问题。</li><li>说明这个设计带来的收益。</li><li>最后分析它的代价与替代方案。</li></ol><p class="small muted">这种结构也适合产品面试中的开放题。</p></section>
      </div>
      <section class="section"><div class="section-head"><div><h2>运营问题模拟器</h2><p>沿着数据线索行动，不要一看到下降就马上做活动。</p></div></div><div class="grid grid-2"><article class="card card-body"><div class="eyebrow">情境 01</div><h2>你的 App DAU 下降了 20%</h2><p>第一步应该做什么？</p><div class="simulator-steps">${["马上做一次大活动", "查看数据，定位下降发生在哪个环节", "给所有用户发优惠券", "重新设计首页 UI"].map((x,i) => `<button class="sim-option" data-action="simulator" data-correct="${i === 1}">${String.fromCharCode(65+i)}. ${x}</button>`).join("")}</div><div id="sim-feedback" aria-live="polite"></div></article><article class="card card-body card-dark"><div class="eyebrow">分析路径</div><h2>发现问题 → 提出假设 → 分析数据 → 设计方案 → 验证结果</h2><p class="muted">模拟器会逐步扩展为完整剧情案例。当前版本先训练最重要的第一反应：定位问题，而不是直接跳到方案。</p></article></div></section>
    </div>`;
  }

  function renderProjects(selectedId) {
    if (selectedId) return renderProjectEditor(selectedId);
    const complete = state.completedLessons.length;
    app.innerHTML = `<div class="page">
      ${pageHeader("REAL PROJECTS", "真实项目与作品集", "把学习任务整理为以后可以用于求职的真实成果。", `<span class="pill pill-blue">已保存 ${Object.keys(state.projectDrafts).length} 个草稿</span>`)}
      <section class="project-grid">${DATA.projects.map(project => { const locked = complete < project.unlock; const draft = state.projectDrafts[project.id]; return `<article class="project-card ${locked ? "locked" : ""}"><span class="pill">Project ${String(project.order).padStart(2,"0")}</span><h3>${esc(project.title)}</h3><p>${esc(project.description)}</p>${locked ? `<span class="small muted">完成 ${project.unlock} 个知识任务后解锁</span>` : `<a class="button ${draft ? "button-secondary" : ""}" href="#/project/${project.id}">${draft ? "继续编辑" : "开始项目"}</a>`}</article>`; }).join("")}</section>
    </div>`;
  }

  function renderProjectEditor(id) {
    const project = DATA.projects.find(item => item.id === id) || DATA.projects[0];
    const draft = state.projectDrafts[id] || {};
    const fields = [
      ["background", "项目背景", "选择什么产品或问题？为什么值得分析？"],
      ["problem", "核心问题", "目标用户是谁？他在什么场景遇到什么问题？"],
      ["analysis", "分析过程", "你观察了什么、用了什么框架、得到哪些证据？"],
      ["solution", "方案", "你的核心方案、优先级和最小实现是什么？"],
      ["metrics", "核心指标", "怎样判断方案是否有效？有哪些护栏指标？"],
      ["result", "结果与复盘", "你学到了什么？下一次会怎样改进？"]
    ];
    app.innerHTML = `<div class="page"><a class="button button-ghost" href="#/projects">← 返回项目列表</a>${pageHeader(`PROJECT ${String(project.order).padStart(2,"0")}`, project.title, project.description)}<div class="project-editor"><aside class="card project-outline">${fields.map((f,i) => `<button class="${i===0?"active":""}" data-scroll="project-${f[0]}">${i+1}. ${f[1]}</button>`).join("")}</aside><section class="card card-body"><form id="project-form" data-project="${project.id}">${fields.map(([key,label,placeholder]) => `<div class="field" id="project-${key}"><label for="field-${key}">${label}</label><textarea class="textarea" id="field-${key}" name="${key}" placeholder="${placeholder}">${esc(draft[key] || "")}</textarea></div>`).join("")}<button type="submit" class="button">保存到我的作品集</button></form></section></div></div>`;
  }

  function renderProfile() {
    const level = getLevel();
    const days = Array.from({ length: 14 }, (_, i) => todayKey(addDays(new Date(), i - 13)));
    const allAchievements = DATA.achievements;
    app.innerHTML = `<div class="page">
      ${pageHeader("MY GROWTH", "我的成长", "这里不比较别人，只记录你真正完成过的事情。", `<button class="button button-secondary" data-action="export-data">导出学习数据</button>`)}
      <div class="grid grid-hero"><section class="card card-body card-dark"><div class="top-summary"><div class="avatar">P${level.number}</div><div><div class="eyebrow">当前身份</div><h2>${level.name}</h2></div></div><div class="xp-line"><div class="xp-head"><span>${state.user.xp} XP</span><span>${level.maxed ? "最高等级" : `距离 Lv ${level.number + 1} 还差 ${level.next - state.user.xp}`}</span></div>${progressMarkup(state.user.xp - level.floor, level.maxed ? 1 : level.next - level.floor, "等级经验")}</div></section><section class="card card-body"><div class="stat-grid"><div class="stat"><span class="small muted">有效学习</span><strong>${Object.keys(state.activity).length} 天</strong></div><div class="stat"><span class="small muted">累计学习</span><strong>${Math.floor(state.studyMinutes / 60)}h ${state.studyMinutes % 60}m</strong></div><div class="stat"><span class="small muted">P 币</span><strong>${state.user.coins}</strong></div><div class="stat"><span class="small muted">作品草稿</span><strong>${Object.keys(state.projectDrafts).length}</strong></div></div></section></div>
      <section class="section card card-body"><div class="card-head"><div><div class="eyebrow">最近 14 天</div><h2>学习节奏</h2></div><span class="pill">本周 ${weekDays()} 天</span></div><div class="activity-grid">${days.map(key => `<div class="activity-day ${state.activity[key] ? state.activity[key] > 1 ? "strong" : "active" : ""}"><span>${formatDay(key)}</span></div>`).join("")}</div></section>
      <section class="section"><div class="section-head"><div><h2>成就收藏</h2><p>已解锁 ${state.achievements.length} / ${allAchievements.length}</p></div></div><div class="achievement-grid">${allAchievements.map(item => `<article class="achievement ${state.achievements.includes(item.id) ? "" : "locked"}"><div class="achievement-icon">${item.icon}</div><div><h3>${esc(item.name)}</h3><p>${esc(item.description)}</p></div></article>`).join("")}</div></section>
      <section class="section grid grid-2"><div class="card card-body card-soft"><div class="eyebrow">学习复盘</div><h2>给今天留一句话</h2><div class="field"><label for="reflection">今天学会了什么，哪里还不确定？</label><textarea class="textarea" id="reflection" placeholder="哪怕只有一句也可以。"></textarea></div><button class="button" data-action="save-reflection">保存复盘</button></div><div class="card card-body"><div class="eyebrow">本地数据</div><h2>你的进度保存在当前浏览器</h2><p class="muted">清理浏览器数据会导致记录丢失。你可以先导出备份。重置后无法恢复。</p><button class="button button-danger" data-action="reset-data">重置全部数据</button></div></section>
    </div>`;
  }

  function completeCheckin() {
    const key = todayKey();
    if (state.checkins.includes(key)) return { ok: false, message: "今天已经签到" };
    const rewards = [5, 6, 7, 8, 10, 15, 20];
    const reward = rewards[state.checkins.length % 7];
    state.checkins.push(key);
    award(0, reward);
    record("checkin_complete", { reward });
    unlockAchievements(true);
    saveState();
    return { ok: true, reward, coins: state.user.coins };
  }

  function completeLesson(id) {
    const lesson = DATA.lessons.find(item => item.id === id);
    if (!lesson || state.completedLessons.includes(id)) return;
    const answer = state.quizAnswers[id];
    const note = (state.notes[id] || "").trim();
    if (!answer || note.length < 10) return showToast("先完成练习，并写下至少 10 个字的小任务。 ");
    state.completedLessons.push(id);
    award(lesson.xp, 3);
    markActivity(lesson.minutes);
    record("lesson_complete", { lesson_id: id, xp: lesson.xp });
    unlockAchievements();
    saveState();
    renderRoute();
    showToast(`完成「${lesson.title}」，获得 ${lesson.xp} XP`);
  }

  function setMood(value) {
    if (!MOODS[value]) return;
    state.mood = value;
    record("mood_select", { mood: value });
    saveState();
    renderRoute();
  }

  function resetData() {
    state = defaultState();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    location.hash = "#/home";
    renderRoute();
    showToast("已经重新开始。新的成长记录从今天算起。 ");
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `成长岛学习数据-${todayKey()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast("学习数据已经导出。 ");
  }

  function askConfirm(title, copy, action) {
    const dialog = document.getElementById("confirm-dialog");
    document.getElementById("dialog-title").textContent = title;
    document.getElementById("dialog-copy").textContent = copy;
    dialog.addEventListener("close", () => { if (dialog.returnValue === "confirm") action(); }, { once: true });
    dialog.showModal();
  }

  function renderRoute() {
    const raw = (location.hash || "#/home").replace(/^#\//, "").split("#")[0];
    const [route, id] = raw.split("/");
    updateNav(route);
    record("page_view", { page: raw });
    if (route === "learn") renderLearn();
    else if (route === "lesson") renderLesson(id);
    else if (route === "challenge") renderChallenge();
    else if (route === "projects") renderProjects();
    else if (route === "project") renderProjects(id);
    else if (route === "profile") renderProfile();
    else renderHome();
    updateSidebar();
    window.scrollTo({ top: 0, behavior: "auto" });
    app.focus({ preventScroll: true });
  }

  document.addEventListener("click", event => {
    const mood = event.target.closest('[data-action="mood"]');
    if (mood) return setMood(mood.dataset.value);
    const checkin = event.target.closest('[data-action="checkin"]');
    if (checkin) {
      const result = completeCheckin();
      renderRoute();
      return showToast(result.ok ? `签到完成，获得 ${result.reward} P 币` : result.message);
    }
    const quiz = event.target.closest('[data-action="quiz"]');
    if (quiz) {
      const id = quiz.dataset.lesson;
      const selected = Number(quiz.dataset.index);
      const lesson = DATA.lessons.find(x => x.id === id);
      const firstCorrect = selected === lesson.quiz.answer && !state.quizAnswers[id]?.rewarded;
      state.quizAnswers[id] = { selected, rewarded: firstCorrect || state.quizAnswers[id]?.rewarded || false };
      if (firstCorrect) { award(5, 0); record("quiz_submit", { lesson_id: id, correct: true }); }
      else record("quiz_submit", { lesson_id: id, correct: false });
      unlockAchievements(true); saveState(); renderLesson(id);
      return;
    }
    const complete = event.target.closest('[data-action="complete-lesson"]');
    if (complete) return completeLesson(complete.dataset.lesson);
    const saveChallenge = event.target.closest('[data-action="save-challenge"]');
    if (saveChallenge) {
      const answer = document.getElementById("challenge-answer").value.trim();
      if (answer.length < 10) return showToast("先写下至少 10 个字的判断。 ");
      const key = todayKey();
      const first = !state.challengeAnswers[key];
      state.challengeAnswers[key] = answer;
      if (first) { award(10, 2); markActivity(5); }
      record("challenge_save", { first });
      unlockAchievements(); saveState(); renderChallenge();
      showToast(first ? "思考已保存，获得 10 XP" : "答案已经更新");
      return;
    }
    const sim = event.target.closest('[data-action="simulator"]');
    if (sim) {
      document.getElementById("sim-feedback").innerHTML = `<div class="feedback">${sim.dataset.correct === "true" ? "正确。先确认下降发生在哪个用户和哪个环节，再提出假设。" : "先别急着上方案。第一步应该定位 DAU 下降来自新增、活跃还是留存。"}</div>`;
      return;
    }
    const scroll = event.target.closest("[data-scroll]");
    if (scroll) return document.getElementById(scroll.dataset.scroll)?.scrollIntoView({ behavior: "smooth", block: "start" });
    const saveReflection = event.target.closest('[data-action="save-reflection"]');
    if (saveReflection) {
      const value = document.getElementById("reflection").value.trim();
      if (!value) return showToast("先留下一句话。 ");
      state.reflections.push({ date: todayKey(), text: value }); unlockAchievements(); saveState();
      document.getElementById("reflection").value = ""; showToast("今天的复盘已经保存。 "); return;
    }
    const exportButton = event.target.closest('[data-action="export-data"]');
    if (exportButton) return exportData();
    const reset = event.target.closest('[data-action="reset-data"]');
    if (reset) return askConfirm("重置全部学习数据？", "等级、签到、答案、项目和成就都会清空，而且无法恢复。", resetData);
    const goto = event.target.closest("[data-goto]");
    if (goto) location.hash = goto.dataset.goto.replace(/^#/, "");
  });

  document.addEventListener("input", event => {
    if (event.target.id === "lesson-note") {
      const id = event.target.dataset.lesson;
      state.notes[id] = event.target.value;
      saveState();
      const button = document.querySelector('[data-action="complete-lesson"]');
      if (button && !state.completedLessons.includes(id)) button.disabled = !(state.quizAnswers[id] && event.target.value.trim().length >= 10);
    }
  });

  document.addEventListener("submit", event => {
    if (event.target.id !== "project-form") return;
    event.preventDefault();
    const id = event.target.dataset.project;
    const draft = Object.fromEntries(new FormData(event.target).entries());
    const first = !state.projectDrafts[id];
    state.projectDrafts[id] = draft;
    if (first) { award(20, 5); markActivity(20); }
    record("project_save", { project_id: id, first });
    unlockAchievements(); saveState();
    showToast(first ? "项目已保存，获得 20 XP" : "项目草稿已经更新");
  });

  function registerWebMCP() {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const safeRegister = tool => { try { Promise.resolve(context.registerTool(tool)).catch(() => {}); } catch {} };
    safeRegister({ name: "get_learning_summary", title: "查看学习进度", description: "读取当前等级、XP、连续学习、完成课程和今日任务进度。", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false }, execute() { return { level: getLevel(), xp: state.user.xp, streak_days: getStreak(), completed_lessons: state.completedLessons.length, today_tasks: dailyTasks().map(t => ({ title: t.title, done: t.done })) }; } });
    safeRegister({ name: "start_next_lesson", title: "开始下一课", description: "打开下一个尚未完成的知识关卡。", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute() { const lesson = nextLesson(); location.hash = `#/lesson/${lesson.id}`; return { opened_lesson_id: lesson.id, title: lesson.title }; } });
    safeRegister({ name: "complete_daily_checkin", title: "完成今日签到", description: "完成今天的签到并领取 P 币；不会代替有效学习。", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute() { const result = completeCheckin(); renderRoute(); return result; } });
    safeRegister({ name: "set_daily_mood", title: "设置今日状态", description: "设置今日精力状态并调整任务数量。", inputSchema: { type: "object", properties: { mood: { type: "string", enum: Object.keys(MOODS) } }, required: ["mood"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute(input) { if (!input || !MOODS[input.mood]) throw new Error("无效状态"); setMood(input.mood); return { mood: input.mood, task_count: MOODS[input.mood].count, estimated_minutes: MOODS[input.mood].minutes }; } });
  }

  unlockAchievements(true);
  saveState();
  window.addEventListener("hashchange", renderRoute);
  renderRoute();
  registerWebMCP();
})();

