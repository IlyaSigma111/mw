/* ============================================================
   МедиаволнApp — админ-панель
   Доступ: VK ID из config/admins.
   Управление расписанием, заданиями, участниками, статистикой.
   Голосование на текущем этапе не реализуется.
   ============================================================ */

let db, auth;
let ADMINS = [];
let scheduleDraft = [];          // редактируемое расписание (локальная копия)
let usersCache = [];             // все участники для поиска
let allTasks = [];               // все задания
let activeTab = 'schedule';

/* ---------- Тосты ---------- */
function showToast(text, isErr) {
  const wrap = document.getElementById('toasts');
  if (!wrap) return;
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

function confirmDialog(message) {
  return new Promise((resolve) => {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML =
      '<div class="modal">' +
      '<p style="margin-bottom:18px">' + message + '</p>' +
      '<div style="display:flex;gap:10px;justify-content:flex-end">' +
      '<button class="btn btn-ghost" data-a="no" type="button">Отмена</button>' +
      '<button class="btn btn-danger" data-a="yes" type="button">Да, точно</button>' +
      '</div></div>';
    document.body.appendChild(back);
    back.querySelector('[data-a="no"]').addEventListener('click', () => { back.remove(); resolve(false); });
    back.querySelector('[data-a="yes"]').addEventListener('click', () => { back.remove(); resolve(true); });
  });
}

/* ---------- Инициализация ---------- */
async function initAdmin() {
  try {
    const vk = await vkGetUser();

    if (!DEV_MODE) {
      firebase.initializeApp(FIREBASE_CONFIG);
      db = firebase.firestore();
      auth = firebase.auth();
      await auth.signInAnonymously();

      // 1. Проверка прав: VK ID в списке админов
      const adminsSnap = await db.collection('config').doc('admins').get();
      ADMINS = adminsSnap.exists && Array.isArray(adminsSnap.data().ids) ? adminsSnap.data().ids.map(String) : [];
      if (!ADMINS.includes(String(vk.id))) {
        showAdmin(false, null);
        return;
      }

      // 2. Регистрация текущего анонимного uid как админа (серверная проверка правил)
      await db.collection('config').doc('admins').collection('adminsLive')
        .doc(auth.currentUser.uid)
        .set({ vkId: String(vk.id) });
    } else {
      console.warn('DEV_MODE: Firebase пропущен, проверка админа не выполняется.');
    }

    showAdmin(true, vk);
    bindTabs();
    await Promise.all([loadUsers(), loadTasks()]);
    loadScheduleDraft();
    renderStats();
    switchTab('schedule');
  } catch (err) {
    console.error(err);
    showToast('Ошибка инициализации: ' + err.message, true);
  }
}

/* ---------- Экран доступа ---------- */
function showAdmin(ok, vk) {
  const gate = document.getElementById('gate');
  const panel = document.getElementById('panel');
  if (ok) {
    gate.style.display = 'none';
    panel.style.display = 'block';
    if (vk) {
      const name = (vk.first_name + ' ' + vk.last_name).trim();
      document.getElementById('admin-name').textContent = name;
    }
  } else {
    gate.style.display = 'flex';
    panel.style.display = 'none';
  }
}

/* ---------- Вкладки ---------- */
function bindTabs() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}
function switchTab(name) {
  activeTab = name;
  document.querySelectorAll('.tab-btn').forEach((b) =>
    b.classList.toggle('on', b.dataset.tab === name));
  document.querySelectorAll('.tab-pane').forEach((p) =>
    p.style.display = p.dataset.pane === name ? 'block' : 'none');
}

/* ============================================================
   РАСПИСАНИЕ
   ============================================================ */
function loadScheduleDraft() {
  scheduleDraft = DEFAULT_SCHEDULE.map((d) => ({
    day: d.day,
    events: d.events.map((e) => ({ ...e })),
  }));
  renderScheduleEditor();
}

function renderScheduleEditor() {
  const wrap = document.getElementById('sched-edit');
  wrap.innerHTML = '';
  scheduleDraft.forEach((day, di) => {
    const block = document.createElement('div');
    block.className = 'card';
    block.innerHTML =
      '<div class="field"><label>День</label>' +
      '<input class="input" data-day="' + di + '" value="' + escapeHtml(day.day) + '"></div>' +
      '<div class="ev-list"></div>' +
      '<button class="btn btn-ghost btn-sm" data-add="' + di + '" type="button">+ Добавить событие</button>';
    wrap.appendChild(block);

    const evList = block.querySelector('.ev-list');
    day.events.forEach((ev, ei) => {
      const row = document.createElement('div');
      row.className = 'row-item';
      row.style.marginTop = '8px';
      row.innerHTML =
        '<input class="input" data-time="' + di + '-' + ei + '" value="' + escapeHtml(ev.time) + '" style="width:76px" placeholder="10:00">' +
        '<input class="input grow" data-title="' + di + '-' + ei + '" value="' + escapeHtml(ev.title) + '" placeholder="Название">' +
        '<button class="btn btn-ghost btn-sm" data-del="' + di + '-' + ei + '" type="button" title="Удалить"><i data-feather="trash-2"></i></button>';
      evList.appendChild(row);
      row.querySelector('[data-del]').addEventListener('click', () => {
        scheduleDraft[di].events.splice(ei, 1);
        renderScheduleEditor();
      });
    });

    block.querySelector('[data-day]').addEventListener('input', (e) => {
      scheduleDraft[di].day = e.target.value;
    });
    block.querySelector('[data-add]').addEventListener('click', () => {
      scheduleDraft[di].events.push({ time: '12:00', title: 'Новое событие' });
      renderScheduleEditor();
    });
  });
  // live-обновление времени/названий
  document.querySelectorAll('#sched-edit [data-time]').forEach((el) => {
    el.addEventListener('input', () => {
      const [di, ei] = el.dataset.time.split('-').map(Number);
      scheduleDraft[di].events[ei].time = el.value;
    });
  });
  document.querySelectorAll('#sched-edit [data-title]').forEach((el) => {
    el.addEventListener('input', () => {
      const [di, ei] = el.dataset.title.split('-').map(Number);
      scheduleDraft[di].events[ei].title = el.value;
    });
  });
  if (window.feather) feather.replace();
}

async function saveSchedule() {
  try {
    if (DEV_MODE) { showToast('DEV_MODE: сохранение пропущено'); return; }
    await db.collection('schedule').doc('current').set({
      days: scheduleDraft.map((d) => ({ day: d.day, events: d.events })),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    showToast('Расписание сохранено');
  } catch (err) {
    showToast('Ошибка: ' + err.message, true);
  }
}

/* ============================================================
   ЗАДАНИЯ
   ============================================================ */
let taskFilter = 'all';

async function loadTasks() {
  try {
    if (DEV_MODE) { allTasks = []; renderTaskList(); return; }
    const snap = await db.collection('tasks').orderBy('createdAt', 'desc').get();
    allTasks = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderTaskList();
  } catch (err) {
    showToast('Не удалось загрузить задания: ' + err.message, true);
  }
}

function renderTaskList() {
  const list = allTasks.filter((t) => {
    if (taskFilter === 'active') return t.active;
    if (taskFilter === 'inactive') return !t.active;
    return true;
  });
  const wrap = document.getElementById('tasks-list');
  if (!list.length) {
    wrap.innerHTML = '<div class="empty">Заданий нет</div>';
    return;
  }
  wrap.innerHTML = list.map((t) =>
    '<div class="row-item">' +
    '<div class="grow"><b>' + escapeHtml(t.text) + '</b>' +
    '<small>+' + t.points + ' баллов · ' + (t.active ? '<span class="badge badge-on">активно</span>' : '<span class="badge badge-off">выкл</span>') + '</small></div>' +
    '<div class="row-actions">' +
    '<button class="btn btn-ghost btn-sm" data-tog="' + t.id + '" type="button">' + (t.active ? 'Выключить' : 'Включить') + '</button>' +
    '<button class="btn btn-danger btn-sm" data-del="' + t.id + '" type="button"><i data-feather="trash-2"></i></button>' +
    '</div></div>'
  ).join('');
  if (window.feather) feather.replace();
}

function bindTaskFilter() {
  document.querySelectorAll('[data-filter]').forEach((b) =>
    b.addEventListener('click', () => {
      taskFilter = b.dataset.filter;
      document.querySelectorAll('[data-filter]').forEach((x) => x.classList.toggle('on', x === b));
      renderTaskList();
    }));
}

async function createTask(text, points) {
  try {
    if (DEV_MODE) { allTasks.unshift({ id: 'dev', text: text, points: points, active: true }); renderTaskList(); showToast('DEV: задание добавлено'); return; }
    await db.collection('tasks').add({
      text: text,
      points: points,
      active: true,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    showToast('Задание создано');
    await loadTasks();
  } catch (err) {
    showToast('Ошибка: ' + err.message, true);
  }
}

async function toggleTask(id) {
  const t = allTasks.find((x) => x.id === id);
  if (!t) return;
  try {
    await db.collection('tasks').doc(id).update({ active: !t.active });
    await loadTasks();
  } catch (err) {
    showToast('Ошибка: ' + err.message, true);
  }
}

async function deleteTask(id) {
  const ok = await confirmDialog('Удалить задание?');
  if (!ok) return;
  try {
    await db.collection('tasks').doc(id).delete();
    await loadTasks();
    showToast('Задание удалено');
  } catch (err) {
    showToast('Ошибка: ' + err.message, true);
  }
}

/* ============================================================
   УЧАСТНИКИ
   ============================================================ */
async function loadUsers() {
  try {
    if (DEV_MODE) { usersCache = []; renderUsers(); return; }
    const snap = await db.collection('users').limit(500).get();
    usersCache = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
    renderUsers();
  } catch (err) {
    showToast('Не удалось загрузить участников: ' + err.message, true);
  }
}

let userQuery = '';

function renderUsers() {
  const q = userQuery.trim().toLowerCase();
  const list = usersCache.filter((u) =>
    !q ||
    String(u.name || '').toLowerCase().includes(q) ||
    String(u.vkId || '').includes(q)
  );
  const wrap = document.getElementById('users-list');
  if (!list.length) {
    wrap.innerHTML = '<div class="empty">Участники не найдены</div>';
    return;
  }
  wrap.innerHTML = list.map((u) =>
    '<div class="row-item">' +
    '<div class="grow"><b>' + escapeHtml(u.name || 'Без имени') + '</b>' +
    '<small>VK ID: ' + escapeHtml(String(u.vkId || '—')) + ' · баллов: ' + (u.score || 0) + '</small></div>' +
    '<div class="row-actions">' +
    '<button class="btn btn-ghost btn-sm" data-pm="' + u.uid + '" type="button">−1</button>' +
    '<button class="btn btn-ghost btn-sm" data-pp="' + u.uid + '" type="button">+1</button>' +
    '<button class="btn btn-ghost btn-sm" data-set="' + u.uid + '" type="button">Установить</button>' +
    '</div></div>'
  ).join('');
  if (window.feather) feather.replace();
}

async function changeUserScore(uid, delta) {
  try {
    await db.collection('users').doc(uid).update({
      score: firebase.firestore.FieldValue.increment(delta),
    });
    await loadUsers();
  } catch (err) {
    showToast('Ошибка: ' + err.message, true);
  }
}

async function setUserScore(uid) {
  const u = usersCache.find((x) => x.uid === uid);
  const val = prompt('Установить баллы для «' + (u && u.name) + '»:', u ? u.score : 0);
  if (val === null || val.trim() === '') return;
  const n = Number(val);
  if (isNaN(n)) { showToast('Введи число', true); return; }
  try {
    await db.collection('users').doc(uid).update({ score: n });
    await loadUsers();
  } catch (err) {
    showToast('Ошибка: ' + err.message, true);
  }
}

async function addToAll() {
  const ok = await confirmDialog('Начислить +5 баллов ВСЕМ участникам?');
  if (!ok) return;
  try {
    const batch = db.batch();
    usersCache.forEach((u) => {
      const ref = db.collection('users').doc(u.uid);
      batch.update(ref, { score: firebase.firestore.FieldValue.increment(5) });
    });
    await batch.commit();
    await loadUsers();
    renderStats();
    showToast('Всем начислено +5');
  } catch (err) {
    showToast('Ошибка: ' + err.message, true);
  }
}

async function resetAllScores() {
  const ok = await confirmDialog('СБРОСИТЬ баллы всех участников в 0? Действие необратимо.');
  if (!ok) return;
  try {
    const batch = db.batch();
    usersCache.forEach((u) => {
      batch.update(db.collection('users').doc(u.uid), { score: 0 });
    });
    await batch.commit();
    await loadUsers();
    renderStats();
    showToast('Все баллы сброшены');
  } catch (err) {
    showToast('Ошибка: ' + err.message, true);
  }
}

/* ============================================================
   СТАТИСТИКА
   ============================================================ */
function renderStats() {
  const total = usersCache.length;
  const sum = usersCache.reduce((a, u) => a + (u.score || 0), 0);
  const top3 = [...usersCache].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 3);
  const activeTasks = allTasks.filter((t) => t.active).length;

  document.getElementById('stat-users').textContent = total;
  document.getElementById('stat-sum').textContent = sum;
  document.getElementById('stat-tasks').textContent = activeTasks;
  document.getElementById('stat-top3').innerHTML = top3.length
    ? top3.map((u, i) => '<div>' + (i + 1) + '. ' + escapeHtml(u.name || '—') + ' — ' + (u.score || 0) + '</div>').join('')
    : '—';
}

/* ============================================================
   Привязка событий
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-save-schedule').addEventListener('click', saveSchedule);
  document.getElementById('btn-add-task').addEventListener('click', () => {
    const text = document.getElementById('task-text').value.trim();
    const points = Number(document.getElementById('task-points').value);
    if (!text || !points || points < 1) { showToast('Введи текст и баллы (≥1)', true); return; }
    createTask(text, points);
    document.getElementById('task-text').value = '';
    document.getElementById('task-points').value = '';
  });
  bindTaskFilter();

  document.getElementById('btn-add-all').addEventListener('click', addToAll);
  document.getElementById('btn-reset-all').addEventListener('click', resetAllScores);

  document.getElementById('users-search').addEventListener('input', (e) => {
    userQuery = e.target.value;
    renderUsers();
  });

  document.addEventListener('click', async (e) => {
    const del = e.target.closest('[data-del]');
    if (del && del.dataset.del) { deleteTask(del.dataset.del); return; }
    const tog = e.target.closest('[data-tog]');
    if (tog) { toggleTask(tog.dataset.tog); return; }
    const pm = e.target.closest('[data-pm]');
    if (pm) { changeUserScore(pm.dataset.pm, -1); return; }
    const pp = e.target.closest('[data-pp]');
    if (pp) { changeUserScore(pp.dataset.pp, 1); return; }
    const set = e.target.closest('[data-set]');
    if (set) { setUserScore(set.dataset.set); return; }
  });

  initAdmin();
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
