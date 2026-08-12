/* ============================================================
   МедиаволнApp — приложение участника
   Авторизация ВК + Firebase (аноним), рейтинг, задания, расписание.
   Голосование на текущем этапе не реализуется.
   ============================================================ */

const SELF_DOC_CACHE = 'mw_self_v1';   // кэш «я выполнял задания»
const doneCache = JSON.parse(localStorage.getItem(SELF_DOC_CACHE) || '{}');

let db, auth;
let myUid = '';    // users/<uid> текущего участника
let myVkId = '';   // VK ID участника (общий для всех устройств)

/* ---------- Тосты ---------- */
function showToast(text, isErr) {
  const wrap = document.getElementById('toasts');
  const t = document.createElement('div');
  t.className = 'toast' + (isErr ? ' err' : '');
  const icon = isErr ? 'alert-circle' : 'check-circle';
  t.innerHTML = '<i data-feather="' + icon + '"></i><span></span>';
  t.querySelector('span').textContent = text;
  wrap.appendChild(t);
  if (window.feather) feather.replace();
  setTimeout(() => {
    t.classList.add('leave');
    setTimeout(() => t.remove(), 320);
  }, 3200);
}

/* ---------- Инициализация ---------- */
async function init() {
  try {
    // 1. Авторизация ВК
    const vk = await vkGetUser();

    // 2. Firebase: анонимный вход (бесплатный, без пароля)
    if (!DEV_MODE) {
      firebase.initializeApp(FIREBASE_CONFIG);
      db = firebase.firestore();
      // Long-polling вместо websocket — в iOS WKWebView (VK на iPhone)
      // websocket-соединение Firestore зависает и realtime не приходит.
      db.settings({ experimentalForceLongPolling: true });
      auth = firebase.auth();
      await auth.signInAnonymously();
    } else {
      console.warn('DEV_MODE: Firebase пропущен, используется локальное хранилище.');
    }

    // 3. Документ участника привязан к VK ID, а не к uid устройства:
    //    один аккаунт ВК = один профиль (баллы, выполненные задания) на всех устройствах.
    myUid = DEV_MODE ? 'dev-user' : 'vk_' + String(vk.id);
    myVkId = DEV_MODE ? '' : String(vk.id);    if (!DEV_MODE) await ensureUserDoc(myUid, vk);

    // 4. Рендер + подписки
    renderHeader(vk);
    renderSchedule();
    renderTasks(DEFAULT_TASKS_EMPTY);
    initDock();

    if (DEV_MODE) {
      seedDevData(myUid, vk);
    } else {
      subscribeScore(myUid);
      subscribeTasks(myUid);
      // subscribeBadges отключён — не нагружаем Firestore (включится при запуске бейджей)
    }
    maybeShowAdminBtn(vk);
  } catch (err) {
    console.error(err);
    showToast('Не удалось загрузить приложение: ' + err.message, true);
  }
}

const DEFAULT_TASKS_EMPTY = [];

/* Создать документ users/vk_<VK ID> при первом входе (score: 0);
   при повторных входах обновляем имя/аватар из VK только если изменились
   (иначе каждый вход = лишняя запись в Firestore). */
async function ensureUserDoc(uid, vk) {
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  const name = (vk.first_name + ' ' + vk.last_name).trim();
  const avatar = vk.photo_100 || '';
  if (snap.exists) {
    const d = snap.data();
    if (d.name !== name || d.avatar !== avatar) {
      await ref.set({ vkId: String(vk.id), name: name, avatar: avatar }, { merge: true });
    }
  } else {
    await ref.set({
      vkId: String(vk.id),
      name: name,
      avatar: avatar,
      score: 0,
      done: {},          // {taskId: сколько раз выполнено}
    });
  }
}

/* ---------- Шапка: аватар + имя + баллы ---------- */
function renderHeader(vk) {
  const avatar = document.getElementById('hdr-avatar');
  const name = document.getElementById('hdr-name');
  if (vk.photo_100) {
    avatar.innerHTML = '<img src="' + escapeHtml(vk.photo_100) + '" alt="">';
  } else {
    avatar.textContent = (vk.first_name || '?')[0] + (vk.last_name || '')[0] || '?';
  }
  name.innerHTML = '<span>' + escapeHtml(vk.first_name + ' ' + vk.last_name) + '</span><small>участник слёта</small>';
  if (window.feather) feather.replace();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/* Кнопка «Админ» в настройках: показываем только организаторам (VK ID из config/admins) */
/* Кнопка «Админ» в настройках: показываем только организаторам (VK ID из config/admins).
   Проверку кешируем в localStorage — не читаем config/admins при каждом запуске. */
const ADMIN_CACHE_KEY = 'mw_admin_v1';

async function maybeShowAdminBtn(vk) {
  const entry = document.getElementById('admin-entry');
  if (!entry) return;
  if (DEV_MODE) { entry.style.display = 'block'; return; }
  try {
    let cached = null;
    try { cached = localStorage.getItem(ADMIN_CACHE_KEY); } catch (e) {}
    if (cached === '1') { entry.style.display = 'block'; return; }
    if (cached !== '0') {
      const snap = await db.collection('config').doc('admins').get();
      const ids = snap.exists && Array.isArray(snap.data().ids)
        ? snap.data().ids.map(String)
        : [];
      const isAdmin = ids.includes(String(vk.id));
      try { localStorage.setItem(ADMIN_CACHE_KEY, isAdmin ? '1' : '0'); } catch (e) {}
      if (isAdmin) entry.style.display = 'block';
    }
  } catch (err) { /* молчим — кнопка просто не покажется */ }
}

/* ---------- Realtime с фолбэком ----------
   onSnapshot — основной источник, но если за firstMs он ничего не прислал
   (напр. iOS WKWebView глушит long-polling-канал), догружаем get()
   и опрашиваем каждые 15 секунд, ПОКА подписка молчит.
   Как только пришёл первый снапшот (любым путём) — поллинг и интервал гасятся. */
function listenWithFallback(ref, onSnap, onErr, firstMs) {
  let got = false;
  let timer = null;
  const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
  const deliver = (snap) => {
    if (got) return;
    got = true;
    stop();
    onSnap(snap);
  };
  const poll = () => ref.get().then(deliver).catch(() => {});
  ref.onSnapshot(deliver, onErr);
  setTimeout(() => { if (!got) poll(); }, firstMs || 6000);
  timer = setInterval(() => { if (!got) poll(); }, 15000);
}

/* ---------- Баллы + выполненные задания в реальном времени ---------- */
function subscribeScore(uid) {
  listenWithFallback(
    db.collection('users').doc(uid),
    (snap) => {
      if (snap.exists) {
        const d = snap.data();
        document.getElementById('score-num').textContent = d.score || 0;
        // Синхронизируем «выполненные задания» с других устройств.
        // done может быть как map'ом {id: счётчик}, так и старым массивом id.
        let changed = false;
        const sync = (id, count) => {
          if ((doneCache[id] || 0) < count) { doneCache[id] = count; changed = true; }
        };
        if (Array.isArray(d.done)) {
          d.done.forEach((id) => sync(id, 1));
        } else if (d.done && typeof d.done === 'object') {
          Object.keys(d.done).forEach((id) => sync(id, Number(d.done[id]) || 1));
        }
        if (changed) {
          localStorage.setItem(SELF_DOC_CACHE, JSON.stringify(doneCache));
          if (lastTasks.length) renderTasks(lastTasks);
        }
      }
    },
    () => showToast('Не удаётся обновить счёт', true)
  );
}

function setScore(n) {
  document.getElementById('score-num').textContent = n;
}

/* ---------- Бейджи участника ---------- */
let myBadges = [];          // [{id, name, caption, img}] — выданные мне
let allBadges = [];         // все бейджи (для показа в рейтинге)
let myBadgeIds = [];        // выданные мне id
let myActiveBadge = null;   // id бейджа, который показываю в рейтинге

function subscribeBadges(uid) {
  listenWithFallback(
    db.collection('badges'),
    (snap) => {
      allBadges = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      myBadges = allBadges.filter((b) => myBadgeIds.includes(b.id));
      renderBadges();
      if (ratingData.length) loadRating();   // обновить бейджи в рейтинге
    },
    () => { /* молчим — бейджи не критичны */ }
  );
  listenWithFallback(
    db.collection('users').doc(uid),
    (snap) => {
      if (snap.exists) {
        const d = snap.data();
        myBadgeIds = Array.isArray(d.badges) ? d.badges : [];
        myActiveBadge = d.activeBadge || null;
        myBadges = allBadges.filter((b) => myBadgeIds.includes(b.id));
        renderBadges();
      }
    },
    () => { /* молчим */ }
  );
}

function renderBadges() {
  const wrap = document.getElementById('badges');
  if (!wrap) return;
  if (!myBadges.length) {
    wrap.innerHTML = '<div class="empty">Пока пусто — бейджи вручает организатор за достижения.</div>';
    return;
  }
  wrap.innerHTML = myBadges.map((b) => {
    const active = b.id === myActiveBadge;
    return '<div class="card badge-card">' +
      '<img class="badge-img" src="' + escapeHtml(b.img || '') + '" alt="">' +
      '<div class="grow"><b>' + escapeHtml(b.name || 'Бейдж') + '</b>' +
      '<small>' + escapeHtml(b.caption || '') + '</small>' +
      '<button class="btn btn-sm ' + (active ? 'btn-badge-active' : 'btn-ghost') + '" data-activate="' + b.id + '" type="button">' +
      (active ? 'Показывается в рейтинге' : 'Показывать в рейтинге') + '</button></div>' +
      '</div>';
  }).join('');
  document.querySelectorAll('[data-activate]').forEach((btn) => {
    btn.addEventListener('click', () => setActiveBadge(btn.dataset.activate));
  });
}

/* Выбрать/снять бейдж, показываемый в рейтинге (хранится в users/{uid}.activeBadge) */
async function setActiveBadge(id) {
  if (DEV_MODE) {
    myActiveBadge = myActiveBadge === id ? null : id;
    renderBadges();
    renderRating();
    return;
  }
  try {
    const ref = db.collection('users').doc(myUid);
    if (myActiveBadge === id) {
      await ref.update({ activeBadge: firebase.firestore.FieldValue.delete() });
    } else {
      await ref.update({ activeBadge: id });
    }
    vkFeedback('success');
    showToast(myActiveBadge === id ? 'Бейдж убран из рейтинга' : 'Бейдж показывается в рейтинге');
  } catch (err) {
    showToast('Не удалось: ' + err.message, true);
  }
}

/* ---------- Расписание ---------- */
function renderSchedule() {
  const wrap = document.getElementById('schedule');
  const cached = localStorage.getItem(SCHEDULE_CACHE_KEY);
  const raw = cached ? JSON.parse(cached) : DEFAULT_SCHEDULE;
  const days = Array.isArray(raw) ? raw : [raw];

  if (!days.length || !Array.isArray(days[0].events)) {
    wrap.innerHTML = '<div class="empty">Расписание ещё не опубликовано</div>';
    return;
  }

  if (days.length === 1) {
    const d = days[0];
    wrap.innerHTML =
      '<div class="acc open">' +
      '<div class="acc-head" style="cursor:default"><span>' + escapeHtml(d.day || 'Расписание на сегодня') + '</span></div>' +
      '<div class="acc-body" style="display:block">' +
      d.events.map((e) =>
        '<div class="ev"><span class="ev-time">' + escapeHtml(e.time) + '</span>' +
        '<span class="ev-title">' + escapeHtml(e.title) + '</span></div>'
      ).join('') +
      '</div></div>';
    return;
  }

  wrap.innerHTML = '';
  days.forEach((day, di) => {
    const item = document.createElement('div');
    item.className = 'acc' + (di === 0 ? ' open' : '');
    const inner = day.events.map((e) =>
      '<div class="ev"><span class="ev-time">' + escapeHtml(e.time) + '</span>' +
      '<span class="ev-title">' + escapeHtml(e.title) + '</span></div>'
    ).join('');
    item.innerHTML =
      '<button class="acc-head" type="button">' +
      '<span>' + escapeHtml(day.day) + '</span><i data-feather="chevron-down"></i></button>' +
      '<div class="acc-body">' + inner + '</div>';
    wrap.appendChild(item);
    item.querySelector('.acc-head').addEventListener('click', () => {
      item.classList.toggle('open');
    });
  });
  if (window.feather) feather.replace();
}

/* Кнопка «Обновить» — единственное место, где участник читает schedule/current */
async function refreshSchedule() {
  if (DEV_MODE) { showToast('DEV_MODE: расписание из кода'); return; }
  if (!db) { showToast('Приложение ещё не готово, обнови страницу', true); return; }
  try {
    const snap = await db.collection('schedule').doc('current').get();
    if (!snap.exists) {
      showToast('Актуальное расписание ещё не загружено', true);
      return;
    }
    const data = snap.data();
    const name = data.presetName || data.day || 'Расписание на сегодня';
    if (Array.isArray(data.events)) {
      localStorage.setItem(SCHEDULE_CACHE_KEY, JSON.stringify({ day: name, events: data.events }));
      renderSchedule();
      showToast('Выставлено: ' + name);
    } else if (Array.isArray(data.days)) {
      localStorage.setItem(SCHEDULE_CACHE_KEY, JSON.stringify(data.days));
      renderSchedule();
      showToast(name ? 'Выставлено: ' + name : 'Расписание обновлено');
    } else {
      showToast('Актуальное расписание ещё не загружено', true);
    }
  } catch (err) {
    showToast('Расписание сейчас недоступно: ' + err.message, true);
  }
}

/* ---------- Рейтинг топ-10 ----------
   БЕЗ live-подписки: живой топ-10 при 150 участниках множил бы чтения
   (каждая запись балла топ-игрока → снапшот всем). Грузим по запросу. */
let ratingData = [];
let ratingLoading = false;

async function loadRating() {
  if (DEV_MODE || ratingLoading) return;
  if (!db) { showToast('Приложение ещё не готово, обнови страницу', true); return; }
  const wrap = document.getElementById('rating');
  ratingLoading = true;
  if (wrap && !wrap.innerHTML.trim()) {
    wrap.innerHTML = '<div class="skel h18"></div><div class="skel h18"></div><div class="skel h18"></div>';
  }
  try {
    const snap = await db.collection('users').orderBy('score', 'desc').limit(10).get();
    ratingData = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
    renderRating();
  } catch (err) {
    showToast('Рейтинг недоступен', true);
  } finally {
    ratingLoading = false;
  }
}

/* ---------- Задания ---------- */
const SEEN_TASKS_KEY = 'mw_seen_tasks_v1';
let seenTasks = new Set();
let lastTasks = [];

function subscribeTasks(uid) {
  try { seenTasks = new Set(JSON.parse(localStorage.getItem(SEEN_TASKS_KEY) || '[]')); } catch (e) {}
  listenWithFallback(
    db.collection('tasks').where('active', '==', true).orderBy('createdAt', 'desc'),
    (snap) => {
      const fresh = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      // Уведомление о новом задании — один раз за всё время, и не для сделанных
      fresh.forEach((t) => {
        if (taskDone(t)) return;
        if (!seenTasks.has(t.id)) {
          seenTasks.add(t.id);
          try { localStorage.setItem(SEEN_TASKS_KEY, JSON.stringify([...seenTasks])); } catch (e) {}
          showToast('Новое задание: ' + t.text);
        }
      });
      renderTasks(fresh);
    },
    () => showToast('Задания недоступны', true)
  );
}

/* ---------- Помощники заданий: типы, лимит повторов, день ---------- */
function taskLimit(t) {
  return t.type === 'repeat' ? Math.max(1, Number(t.limit) || 3) : 1;
}
function taskCount(t) {
  const c = doneCache[t.id];
  if (typeof c === 'number') return c;
  return c ? 1 : 0;                      // старый кэш {id: true}
}
function taskDone(t) {
  return taskCount(t) >= taskLimit(t);
}

/* Видимость по дню: пусто = всегда; иначе дата (2026-08-15), день недели или
   метка текущего выставленного пресета (напр. «День 1» при «День 1 — Команды»). */
function taskDayVisible(t) {
  if (!t.day || !String(t.day).trim()) return true;
  const want = String(t.day).trim().toLowerCase();
  const now = new Date();
  const pad = (n) => (n < 10 ? '0' : '') + n;
  const ymd = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
  if (want === ymd) return true;
  const wd = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'][now.getDay()];
  if (want === wd || want === wd.slice(0, 2)) return true;
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(SCHEDULE_CACHE_KEY) || 'null'); } catch (e) {}
  if (cached) {
    const days = Array.isArray(cached) ? cached : [cached];
    const labels = days.map((d) => String((d && d.day) || '').toLowerCase()).filter(Boolean);
    if (labels.some((l) => l.indexOf(want) >= 0 || want.indexOf(l) >= 0)) return true;
  }
  return false;
}

function renderTasks(list) {
  lastTasks = list;
  const wrap = document.getElementById('tasks');
  const visible = list.filter((t) => taskDayVisible(t));
  const undone = visible.filter((t) => !taskDone(t));
  const doneCount = visible.length - undone.length;

  if (!undone.length && !doneCount) {
    wrap.innerHTML = '<div class="empty">Заданий пока нет. Отдыхай!</div>';
    return;
  }
  wrap.innerHTML = undone.map((t) => {
    const cnt = taskCount(t);
    const lim = taskLimit(t);
    const progress = t.type === 'repeat' ? ' <span class="badge badge-on">' + cnt + '/' + lim + '</span>' : '';
    const dayChip = t.day && String(t.day).trim() ? ' <span class="badge badge-off">' + escapeHtml(t.day) + '</span>' : '';
    return (
      '<div class="card task rise" data-id="' + t.id + '">' +
      '<span class="task-text">' + escapeHtml(t.text) + dayChip + '</span>' +
      '<span class="task-pts">+' + t.points + progress + '</span>' +
      '<button class="btn btn-sm" data-act="do">' + (cnt > 0 ? 'Ещё раз' : 'Выполнить') + '</button>' +
      '</div>'
    );
  }).join('') +
  (doneCount
    ? '<div class="hint" style="text-align:center">Выполнено заданий: ' + doneCount + '</div>'
    : '');

  wrap.querySelectorAll('[data-act="do"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const card = btn.closest('.task');
      const id = card.dataset.id;
      const task = list.find((t) => t.id === id);
      btn.disabled = true;
      await doTask(task);
    });
  });
  if (window.feather) feather.replace();
}

async function doTask(task) {
  const lim = taskLimit(task);
  const next = taskCount(task) + 1;
  if (next > lim) { showToast('Лимит выполнений исчерпан', true); vkFeedback('error'); return; }
  try {
    if (DEV_MODE) {
      const cur = Number(localStorage.getItem('mw_dev_score') || 0) + task.points;
      localStorage.setItem('mw_dev_score', String(cur));
      setScore(cur);
    } else {
      const myUid = 'vk_' + myVkId;
      await db.collection('users').doc(myUid).update({
        score: firebase.firestore.FieldValue.increment(task.points),
        ['done.' + task.id]: firebase.firestore.FieldValue.increment(1),
      });
    }
    doneCache[task.id] = next;
    localStorage.setItem(SELF_DOC_CACHE, JSON.stringify(doneCache));
    renderTasks(lastTasks);                  // обновить счётчик/скрыть сразу
    vkToast('+' + task.points + ' баллов!');
    vkFeedback('success');
    showToast('Задание выполнено: +' + task.points + ' баллов' + (next < lim ? ' (' + next + '/' + lim + ')' : ''));
  } catch (err) {
    showToast('Не удалось выполнить: ' + err.message, true);
  }
}

/* ---------- Переключение вкладок докбара ---------- */
function initDock() {
  document.querySelectorAll('.dock-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      vkFeedback('click');
      document.querySelectorAll('.dock-item').forEach((b) => b.classList.toggle('on', b === btn));
      document.querySelectorAll('.app-pane').forEach((p) => p.classList.toggle('active', p.dataset.tab === tab));
      if (tab === 'rating') loadRating();
    });
  });
}

/* ---------- Настройки (локально, без БД) ---------- */
const SETTINGS_KEY = 'mw_settings_v1';
const DEFAULT_SETTINGS = { vibe: true, sound: true };

function getSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return Object.assign({}, DEFAULT_SETTINGS, JSON.parse(raw));
  } catch (e) { /* ignore */ }
  return Object.assign({}, DEFAULT_SETTINGS);
}

function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
}

/* Тактильный отклик + звук с учётом настроек. Вне ВК работает только звук. */
function vkFeedback(kind) {
  const s = getSettings();
  if (kind === 'click') {
    if (s.vibe) vkTapticImpact('light');
    if (s.sound) vkSound('click');
    return;
  }
  if (s.vibe) vkTaptic(kind);
  if (s.sound) vkSound(kind);
}

function renderSettings() {
  const s = getSettings();
  document.querySelectorAll('[data-set]').forEach((el) => {
    el.classList.toggle('on', !!s[el.dataset.set]);
  });
}

function bindSettings() {
  document.querySelectorAll('[data-set]').forEach((el) => {
    el.addEventListener('click', () => {
      const key = el.dataset.set;
      const s = getSettings();
      s[key] = !s[key];
      saveSettings(s);
      renderSettings();
      vkFeedback('success');
    });
  });
}

/* ---------- DEV-заглушка данных ---------- */
function seedDevData(uid, vk) {
  const score = Number(localStorage.getItem('mw_dev_score') || 0);
  setScore(score);
  renderRating([{ name: vk.first_name + ' ' + vk.last_name, score: score, avatar: vk.photo_100 || '' }]);
  renderTasks([
    { id: 'dev-1', text: 'Сделай фото заката и покажи соседу', points: 5 },
    { id: 'dev-2', text: 'Найди участника из другого города', points: 10 },
  ]);
  myBadges = [
    { id: 'dev-b1', name: 'DEV-бейдж', caption: 'Пример бейджа для теста', img: '' },
  ];
  allBadges = myBadges.slice();
  myActiveBadge = null;
  renderBadges();
}

function renderRating(listOverride) {
  const wrap = document.getElementById('rating');
  const list = listOverride || ratingData;
  if (!list.length) {
    wrap.innerHTML = '<div class="empty">Пока никого нет — стань первым!</div>';
    return;
  }
  wrap.innerHTML = list.map((u, i) => {
    const rankCls = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : '';
    const me = myVkId && String(u.vkId) === myVkId ? ' rate-me' : '';
    const avatar = u.avatar
      ? '<img class="rate-avatar" src="' + escapeHtml(u.avatar) + '" alt="">'
      : '<div class="rate-avatar">' + escapeHtml((u.name || '?')[0]) + '</div>';
    const badge = u.activeBadge ? allBadges.find((b) => b.id === u.activeBadge) : null;
    return (
      '<div class="rate-row' + me + '">' +
      '<div class="rate-rank ' + rankCls + '">' + (i + 1) + '</div>' +
      avatar +
      '<div class="rate-name">' +
      '<span class="rate-name-text">' + escapeHtml(u.name || 'Без имени') + '</span>' +
      (badge ? '<img class="rate-badge" src="' + escapeHtml(badge.img || '') + '" title="' + escapeHtml(badge.name || '') + '" alt="">' : '') +
      '</div>' +
      '<div class="rate-pts">' + (u.score || 0) + '</div>' +
      '</div>'
    );
  }).join('');
}

/* ---------- Запуск ---------- */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('sched-refresh').addEventListener('click', () => {
    vkFeedback('click');
    refreshSchedule();
  });
  const ratingRefresh = document.getElementById('rating-refresh');
  if (ratingRefresh) {
    ratingRefresh.addEventListener('click', () => {
      vkFeedback('click');
      loadRating();
    });
  }
  const adminBtn = document.getElementById('btn-admin-open');
  if (adminBtn) {
    adminBtn.addEventListener('click', () => { location.href = 'admin.html' + location.search; });
  }
  init();
  renderSettings();
  bindSettings();
});
