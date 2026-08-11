/* ============================================================
   МедиаволнApp — приложение участника
   Авторизация ВК + Firebase (аноним), рейтинг, задания, расписание.
   Голосование на текущем этапе не реализуется.
   ============================================================ */

const SELF_DOC_CACHE = 'mw_self_v1';   // кэш «я выполнял задания»
const doneCache = JSON.parse(localStorage.getItem(SELF_DOC_CACHE) || '{}');

let db, auth;

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
      auth = firebase.auth();
      await auth.signInAnonymously();
    } else {
      console.warn('DEV_MODE: Firebase пропущен, используется локальное хранилище.');
    }

    // 3. Гарантируем документ пользователя (создаём при первом входе)
    const myUid = DEV_MODE ? 'dev-user' : auth.currentUser.uid;
    if (!DEV_MODE) await ensureUserDoc(myUid, vk);

    // 4. Рендер + подписки
    renderHeader(vk);
    renderSchedule();
    renderTasks(DEFAULT_TASKS_EMPTY);
    initDock();

    if (DEV_MODE) {
      seedDevData(myUid, vk);
    } else {
      subscribeScore(myUid);
      subscribeRating();
      subscribeTasks(myUid);
    }
  } catch (err) {
    console.error(err);
    showToast('Не удалось загрузить приложение: ' + err.message, true);
  }
}

const DEFAULT_TASKS_EMPTY = [];

/* Создать документ users/{uid} при первом входе (score: 0) */
async function ensureUserDoc(uid, vk) {
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      vkId: String(vk.id),
      name: (vk.first_name + ' ' + vk.last_name).trim(),
      avatar: vk.photo_100 || '',
      score: 0,
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

/* ---------- Баллы в реальном времени ---------- */
function subscribeScore(uid) {
  db.collection('users').doc(uid).onSnapshot(
    (snap) => {
      if (snap.exists) {
        const d = snap.data();
        document.getElementById('score-num').textContent = d.score || 0;
      }
    },
    () => showToast('Не удаётся обновить счёт', true)
  );
}

function setScore(n) {
  document.getElementById('score-num').textContent = n;
}

/* ---------- Расписание ---------- */
function renderSchedule() {
  const wrap = document.getElementById('schedule');
  const cached = localStorage.getItem(SCHEDULE_CACHE_KEY);
  const list = cached ? JSON.parse(cached) : DEFAULT_SCHEDULE;

  wrap.innerHTML = '';
  list.forEach((day, di) => {
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
    if (snap.exists && Array.isArray(snap.data().days)) {
      localStorage.setItem(SCHEDULE_CACHE_KEY, JSON.stringify(snap.data().days));
      renderSchedule();
      showToast('Расписание обновлено');
    } else {
      showToast('Актуальное расписание ещё не загружено', true);
    }
  } catch (err) {
    showToast('Расписание сейчас недоступно: ' + err.message, true);
  }
}

/* ---------- Рейтинг топ-10 ---------- */
let ratingData = [];
let lastRatingRender = 0;
let ratingTimer = null;

function subscribeRating() {
  db.collection('users')
    .orderBy('score', 'desc')
    .limit(10)
    .onSnapshot((snap) => {
      ratingData = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
      throttleRenderRating();
    }, () => showToast('Рейтинг недоступен', true));
}

/* Обновление не чаще 5 секунд */
function throttleRenderRating() {
  const now = Date.now();
  if (now - lastRatingRender >= 5000) {
    lastRatingRender = now;
    renderRating();
    return;
  }
  if (ratingTimer) return;
  ratingTimer = setTimeout(() => {
    ratingTimer = null;
    lastRatingRender = Date.now();
    renderRating();
  }, 5000 - (now - lastRatingRender));
}

/* ---------- Задания ---------- */
let seenTasks = new Set();
let lastTasks = [];

function subscribeTasks(uid) {
  db.collection('tasks')
    .where('active', '==', true)
    .orderBy('createdAt', 'desc')
    .onSnapshot((snap) => {
      const fresh = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      // Уведомление о новом задании
      fresh.forEach((t) => {
        if (!seenTasks.has(t.id)) {
          seenTasks.add(t.id);
          showToast('Новое задание: ' + t.text);
        }
      });
      renderTasks(fresh);
    }, () => showToast('Задания недоступны', true));
}

function renderTasks(list) {
  lastTasks = list;
  const wrap = document.getElementById('tasks');
  const undone = list.filter((t) => !doneCache[t.id]);
  const doneCount = list.length - undone.length;

  if (!undone.length && !doneCount) {
    wrap.innerHTML = '<div class="empty">Заданий пока нет. Отдыхай!</div>';
    return;
  }
  wrap.innerHTML = undone.map((t) =>
    '<div class="card task rise" data-id="' + t.id + '">' +
    '<span class="task-text">' + escapeHtml(t.text) + '</span>' +
    '<span class="task-pts">+' + t.points + '</span>' +
    '<button class="btn btn-sm" data-act="do">Выполнить</button>' +
    '</div>'
  ).join('') +
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
  try {
    if (DEV_MODE) {
      const cur = Number(localStorage.getItem('mw_dev_score') || 0) + task.points;
      localStorage.setItem('mw_dev_score', String(cur));
      setScore(cur);
    } else {
      const myUid = auth.currentUser.uid;
      await db.collection('users').doc(myUid).update({
        score: firebase.firestore.FieldValue.increment(task.points),
      });
    }
    doneCache[task.id] = true;               // задание больше не показываем
    localStorage.setItem(SELF_DOC_CACHE, JSON.stringify(doneCache));
    renderTasks(lastTasks);                  // скрыть выполненное сразу
    vkToast('+' + task.points + ' баллов!');
    showToast('Задание выполнено: +' + task.points + ' баллов');
  } catch (err) {
    showToast('Не удалось выполнить: ' + err.message, true);
  }
}

/* ---------- Переключение вкладок докбара ---------- */
function initDock() {
  document.querySelectorAll('.dock-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.dock-item').forEach((b) => b.classList.toggle('on', b === btn));
      document.querySelectorAll('.app-pane').forEach((p) => p.classList.toggle('active', p.dataset.tab === tab));
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
  const myUid = DEV_MODE ? 'dev-user' : (auth && auth.currentUser ? auth.currentUser.uid : '');
  if (!list.length) {
    wrap.innerHTML = '<div class="empty">Пока никого нет — стань первым!</div>';
    return;
  }
  wrap.innerHTML = list.map((u, i) => {
    const rankCls = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : '';
    const me = u.uid === myUid ? ' rate-me' : '';
    const avatar = u.avatar
      ? '<img class="rate-avatar" src="' + escapeHtml(u.avatar) + '" alt="">'
      : '<div class="rate-avatar">' + escapeHtml((u.name || '?')[0]) + '</div>';
    return (
      '<div class="rate-row' + me + '">' +
      '<div class="rate-rank ' + rankCls + '">' + (i + 1) + '</div>' +
      avatar +
      '<div class="rate-name">' + escapeHtml(u.name || 'Без имени') + '</div>' +
      '<div class="rate-pts">' + (u.score || 0) + '</div>' +
      '</div>'
    );
  }).join('');
}

/* ---------- Запуск ---------- */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('sched-refresh').addEventListener('click', refreshSchedule);
  init();
});
