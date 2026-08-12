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
let myName = '';   // «Имя Фамилия» — подпись под фото
let myScore = 0;   // текущие баллы

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
    myVkId = DEV_MODE ? '' : String(vk.id);
    myName = DEV_MODE ? 'DEV-пользователь' : (vk.first_name + ' ' + vk.last_name).trim();

    // 4. Рендер + подписки
    renderHeader(vk);
    renderSchedule();
    renderTasks(DEFAULT_TASKS_EMPTY);
    initDock();

    if (DEV_MODE) {
      seedDevData(myUid, vk);
    } else {
      subscribeScore(myUid, vk);
      subscribeTasks(myUid);
      subscribeSchedule();
    }
    maybeShowAdminBtn(vk);
  } catch (err) {
    console.error(err);
    showToast('Не удалось загрузить приложение: ' + err.message, true);
  }
}

const DEFAULT_TASKS_EMPTY = [];

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
   (напр. iOS WKWebView глушит long-polling-канал), догружаем get().
   Поллинг — с экспоненциальным откатом (15с → 30с → 1м → 2м → 4м) и стопом
   после POLL_MAX попыток: если канал мёртв, вечный опрос выжжет дневной
   лимит чтений Firestore (150 устройств × 30 документов × 4 раза/мин).
   Первый доставленный снапшот (любым путём) гасит поллинг полностью. */
const POLL_MAX = 5;

function listenWithFallback(ref, onSnap, onErr, firstMs) {
  let got = false;
  let timer = null;
  let polls = 0;
  let delay = 15000;
  const stop = () => { if (timer) { clearTimeout(timer); timer = null; } };
  const deliver = (snap) => {
    if (got) return;
    got = true;
    stop();
    onSnap(snap);
  };
  const poll = () => ref.get().then(deliver).catch(() => {});
  ref.onSnapshot(deliver, onErr);
  setTimeout(() => { if (!got) poll(); }, firstMs || 6000);
  const schedule = () => {
    if (got || polls >= POLL_MAX) return;
    timer = setTimeout(() => {
      poll();
      polls++;
      if (polls < POLL_MAX) { delay = Math.min(delay * 2, 120000); schedule(); }
    }, delay);
  };
  schedule();
}

/* ---------- Баллы + выполненные задания в реальном времени ----------
   Подписка на свой документ заодно проверяет существование: при первом входе
   создаёт профиль (1 запись), при смене имени/аватара обновляет их (редко).
   Отдельный get() больше не нужен — экономит 1 чтение на каждый вход. */
function subscribeScore(uid, vk) {
  const name = (vk.first_name + ' ' + vk.last_name).trim();
  const avatar = vk.photo_100 || '';
  const ref = db.collection('users').doc(uid);
  listenWithFallback(
    ref,
    (snap) => {
      if (!snap.exists) {
        ref.set({ vkId: String(vk.id), name: name, avatar: avatar, score: 0, done: {} })
          .catch(() => {});
        return;
      }
      const d = snap.data();
      if (d.name !== name || d.avatar !== avatar) {
        ref.set({ vkId: String(vk.id), name: name, avatar: avatar }, { merge: true })
          .catch(() => {});
      }
      myScore = d.score || 0;
      document.getElementById('score-num').textContent = myScore;
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
    },
    () => showToast('Не удаётся обновить счёт', true)
  );
}

function setScore(n) {
  myScore = n;
  document.getElementById('score-num').textContent = n;
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

/* Применить данные расписания (снапшот или кнопка «Обновить»): в кэш + перерисовать.
   Формат как раньше: {events} или {days}. Возвращает false, если данных нет. */
function applySchedule(data, showMsg) {
  if (!data) return false;
  const name = data.presetName || data.day || 'Расписание на сегодня';
  if (Array.isArray(data.events)) {
    localStorage.setItem(SCHEDULE_CACHE_KEY, JSON.stringify({ day: name, events: data.events }));
    renderSchedule();
    if (showMsg) showToast('Выставлено: ' + name);
    return true;
  }
  if (Array.isArray(data.days)) {
    localStorage.setItem(SCHEDULE_CACHE_KEY, JSON.stringify(data.days));
    renderSchedule();
    if (showMsg) showToast(name ? 'Выставлено: ' + name : 'Расписание обновлено');
    return true;
  }
  return false;
}

/* Живое расписание: 1 документ schedule/current. Новый пресет появляется
   у участников сразу после выставления (1 чтение на клиента при изменении). */
function subscribeSchedule() {
  listenWithFallback(
    db.collection('schedule').doc('current'),
    (snap) => {
      if (snap.exists) applySchedule(snap.data(), false);
    },
    () => { /* молчим — останется кэш + кнопка «Обновить» */ }
  );
}

/* Кнопка «Обновить» — ручной фолбэк к живой подписке */
async function refreshSchedule() {
  if (DEV_MODE) { showToast('DEV_MODE: расписание из кода'); return; }
  if (!db) { showToast('Приложение ещё не готово, обнови страницу', true); return; }
  try {
    const snap = await db.collection('schedule').doc('current').get();
    if (!snap.exists || !applySchedule(snap.exists ? snap.data() : null, true)) {
      showToast('Актуальное расписание ещё не загружено', true);
    }
  } catch (err) {
    showToast('Расписание сейчас недоступно: ' + err.message, true);
  }
}

/* ---------- Рейтинг топ-10 ----------
   БЕЗ live-подписки: живой топ-10 при 150 участниках множил бы чтения
   (каждая запись балла топ-игрока → снапшот всем). Грузим по запросу,
   а повторные открытия вкладки/тыки по «Обновить» отдаём из кэша 60 сек —
   спам-тапами дневной лимит чтений не пробить. */
const RATING_CACHE_KEY = 'mw_rating_cache_v1';
const RATING_TTL = 60 * 1000;
// «Показать всех» читает ВСЕ документы участников (~150 чтений), поэтому кэш 30 минут:
// повторные разворачивания не тратят ни одного чтения.
const RATING_ALL_CACHE_KEY = 'mw_rating_all_cache_v1';
const RATING_ALL_TTL = 30 * 60 * 1000;
let ratingData = [];
let ratingTop = [];        // топ-10 (последний ответ) — сворачиваемся обратно в него
let ratingExpanded = false;
let ratingLoading = false;

function ratingAllCached() {
  try {
    const c = JSON.parse(localStorage.getItem(RATING_ALL_CACHE_KEY) || 'null');
    return (c && Array.isArray(c.list) && Date.now() - c.ts < RATING_ALL_TTL) ? c.list : null;
  } catch (e) { return null; }
}

async function loadRating() {
  if (DEV_MODE || ratingLoading) return;
  if (!db) { showToast('Приложение ещё не готово, обнови страницу', true); return; }
  const wrap = document.getElementById('rating');
  try {
    const cached = JSON.parse(localStorage.getItem(RATING_CACHE_KEY) || 'null');
    if (cached && Array.isArray(cached.list) && Date.now() - cached.ts < RATING_TTL) {
      ratingTop = cached.list;
      ratingData = ratingTop;
      ratingExpanded = false;
      renderRating();
      return;
    }
  } catch (e) {}
  ratingLoading = true;
  if (wrap && !wrap.innerHTML.trim()) {
    wrap.innerHTML = '<div class="skel h18"></div><div class="skel h18"></div><div class="skel h18"></div>';
  }
  try {
    const snap = await db.collection('users').orderBy('score', 'desc').limit(10).get();
    ratingTop = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
    ratingData = ratingTop;
    ratingExpanded = false;
    try { localStorage.setItem(RATING_CACHE_KEY, JSON.stringify({ ts: Date.now(), list: ratingTop })); } catch (e) {}
    renderRating();
  } catch (err) {
    showToast('Рейтинг недоступен', true);
  } finally {
    ratingLoading = false;
  }
}

/* «Показать всех»: разворачивает топ-10 до полного списка. ~150 чтений за свежий
   запрос, но кэш 30 мин превращает повторные тыки в 0 чтений. */
async function loadRatingAll() {
  if (DEV_MODE || ratingLoading) return;
  if (!db) { showToast('Приложение ещё не готово, обнови страницу', true); return; }
  const all = ratingAllCached();
  if (all) {
    ratingData = all;
    ratingExpanded = true;
    renderRating();
    return;
  }
  ratingLoading = true;
  try {
    const snap = await db.collection('users').orderBy('score', 'desc').get();
    const fresh = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
    try { localStorage.setItem(RATING_ALL_CACHE_KEY, JSON.stringify({ ts: Date.now(), list: fresh })); } catch (e) {}
    ratingTop = fresh.slice(0, 10);
    ratingData = fresh;
    ratingExpanded = true;
    renderRating();
  } catch (err) {
    showToast('Рейтинг недоступен', true);
  } finally {
    ratingLoading = false;
  }
}

/* ---------- Задания ---------- */
const SEEN_TASKS_KEY = 'mw_seen_tasks_v1';
const TASKS_CACHE_KEY = 'mw_tasks_cache_v1';
let seenTasks = new Set();
let lastTasks = [];
let tasksSubscribed = false;   // не больше одного живого слушателя заданий на устройство

function tasksCache() {
  try { return JSON.parse(localStorage.getItem(TASKS_CACHE_KEY) || 'null'); } catch (e) { return null; }
}

function subscribeTasks(uid) {
  try { seenTasks = new Set(JSON.parse(localStorage.getItem(SEEN_TASKS_KEY) || '[]')); } catch (e) {}
  const cached = tasksCache();
  if (cached && Array.isArray(cached.list) && cached.list.length) renderTasks(cached.list);
  if (tasksSubscribed) return;   // слушатель уже есть — не плодим вторые
  tasksSubscribed = true;
  // Агрегат в tasks/current пишет админ (см. admin.js): 1 документ вместо A документов —
  // это 1 чтение на вход при протухшем кэше, а не ~A.
  // Живая подписка ВСЕГДА активна: кэш служит только для мгновенного рендера,
  // иначе свежий кэш (15 мин) задерживал бы новые задания участникам до протухания.
  listenWithFallback(
    db.doc('tasks/current'),
    (snap) => {
      const data = snap.data() || {};
      const fresh = Array.isArray(data.list) ? data.list.filter((t) => t && t.active) : [];
      try { localStorage.setItem(TASKS_CACHE_KEY, JSON.stringify({ ts: Date.now(), list: fresh })); } catch (e) {}
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
      (t.withPhoto
        ? '<button class="btn btn-sm btn-photo" data-act="photo" title="Сфоткать и отправить">' +
          '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
          '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.6"/>' +
          '<path d="M21 15l-5-5L5 21"/></svg></button>'
        : '') +
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
  wrap.querySelectorAll('[data-act="photo"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.task');
      const id = card.dataset.id;
      const task = list.find((t) => t.id === id);
      vkFeedback('click');
      pickTaskPhoto(task);
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

/* ---------- Фото-отправка заданий ----------
   «Сфоткать»: камера/галерея → сжатие на клиенте (~1280px JPEG,
   ~200КБ) → base64 прямо в документ заявки submissions/{id}
   (Storage в проекте не включён; лимит Firestore 1МБ на документ).
   Бот публикует фото в паблик (см. bot.js). */
const PHOTO_MAX_W = 1280;
const PHOTO_QUALITY = 0.8;
const PHOTO_B64_MAX = 800000;   // ~600КБ фото → лимит документа с запасом

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1]);
    fr.onerror = () => reject(new Error('не удалось закодировать фото'));
    fr.readAsDataURL(blob);
  });
}

function pickTaskPhoto(task) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.addEventListener('change', () => {
    const files = input.files ? Array.from(input.files) : [];
    input.remove();
    if (files.length) submitTaskWithPhoto(task, files);
  });
  document.body.appendChild(input);
  input.click();
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, PHOTO_MAX_W / (img.width || 1));
      const w = Math.max(1, Math.round((img.width || 1) * scale));
      const h = Math.max(1, Math.round((img.height || 1) * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('сжатие не удалось'))), 'image/jpeg', PHOTO_QUALITY);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('не удалось прочитать фото')); };
    img.src = url;
  });
}

async function submitTaskWithPhoto(task, files) {
  const lim = taskLimit(task);
  const next = taskCount(task) + 1;
  if (next > lim) { showToast('Лимит выполнений исчерпан', true); vkFeedback('error'); return; }
  if (DEV_MODE) { showToast('DEV: фото-отправка', false); await doTask(task); return; }
  try {
    showToast('Готовлю фото…');
    const photoB64s = [];
    for (const file of files) {
      const blob = await compressImage(file);
      const photoB64 = await blobToBase64(blob);
      if (photoB64.length > PHOTO_B64_MAX) {
        showToast('Одно из фото слишком тяжёлое, выбери другое', true);
        vkFeedback('error');
        return;
      }
      photoB64s.push(photoB64);
    }
    if (!photoB64s.length) throw new Error('нет фото');
    const doc = {
      uid: myUid,
      vkId: myVkId,
      name: myName,
      taskId: task.id,
      taskText: task.text,
      points: task.points,
      photoB64s: photoB64s,
      sent: false,
      state: 'pending',
      ts: firebase.firestore.FieldValue.serverTimestamp(),
    };
    if (photoB64s.length === 1) doc.photoB64 = photoB64s[0];
    await db.collection('submissions').add(doc);
    showToast('Фото ушло в паблик!');
    await doTask(task);
  } catch (err) {
    showToast('Не удалось отправить фото: ' + err.message, true);
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
}

function renderRating(listOverride) {
  const wrap = document.getElementById('rating');
  const list = listOverride || ratingData;
  if (!list.length) {
    wrap.innerHTML = '<div class="empty">Пока никого нет — стань первым!</div>';
    return;
  }
  const rows = list.map((u, i) => {
    const rankCls = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : '';
    const me = myVkId && String(u.vkId) === myVkId ? ' rate-me' : '';
    const avatar = u.avatar
      ? '<img class="rate-avatar" src="' + escapeHtml(u.avatar) + '" alt="">'
      : '<div class="rate-avatar">' + escapeHtml((u.name || '?')[0]) + '</div>';
    return (
      '<div class="rate-row' + me + '">' +
      '<div class="rate-rank ' + rankCls + '">' + (i + 1) + '</div>' +
      avatar +
      '<div class="rate-name">' +
      '<span class="rate-name-text">' + escapeHtml(u.name || 'Без имени') + '</span>' +
      '</div>' +
      '<div class="rate-pts">' + (u.score || 0) + '</div>' +
      '</div>'
    );
  }).join('');
  const total = ratingAllCached() ? ratingAllCached().length : 0;
  const more = ratingExpanded
    ? '<div class="rate-more"><button id="rate-toggle" class="btn btn-ghost btn-block" type="button">Свернуть</button></div>'
    : '<div class="rate-more"><button id="rate-toggle" class="btn btn-ghost btn-block" type="button">' +
      (total > 10 ? 'Показать всех (' + total + ')' : 'Показать всех') + '</button></div>';
  wrap.innerHTML = rows + more;
  const tbtn = document.getElementById('rate-toggle');
  if (tbtn) {
    tbtn.addEventListener('click', () => {
      vkFeedback('click');
      if (ratingExpanded) { ratingExpanded = false; ratingData = ratingTop; renderRating(); }
      else loadRatingAll();
    });
  }
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
