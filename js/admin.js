/* ============================================================
   МедиаволнApp — админ-панель
   Доступ: VK ID из config/admins.
   Управление расписанием, заданиями, участниками, статистикой.
   Голосование на текущем этапе не реализуется.
   ============================================================ */

let db, auth;
let ADMINS = [];
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
      // Long-polling вместо websocket (iOS WKWebView внутри VK).
      db.settings({ experimentalForceLongPolling: true });
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
    await Promise.all([loadUsers(), loadTasks(), loadBadges()]);
    loadSchedulePanel();
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
   РАСПИСАНИЕ — пресеты
   Пресет = ОДИН день: { name, events: [{time, title}] }.
   Утром админ выставляет нужный пресет на сегодня (schedule/current).
   Хранение: schedule/{id} с docType='preset'; активный — schedule/current.
   ============================================================ */
let presetsCache = [];      // [{id, name, events, updatedAt}]
let activePreset = null;    // {presetId, presetName, events} из schedule/current
let editPreset = null;      // копия редактируемого пресета
let editId = null;          // id в Firestore (null = новый пресет)

function loadSchedulePanel() {
  if (DEV_MODE) {
    presetsCache = [{ id: 'dev', name: 'День 1 — Знакомство', events: DEFAULT_SCHEDULE.events }];
    activePreset = null;
    renderSchedulePanel();
    return;
  }
  db.collection('schedule').get()
    .then((snap) => {
      presetsCache = [];
      activePreset = null;
      snap.docs.forEach((d) => {
        const data = d.data();
        if (data.docType === 'preset') {
          presetsCache.push({
            id: d.id,
            name: data.name || 'Пресет',
            events: Array.isArray(data.events) ? data.events : [],
            updatedAt: data.updatedAt,
          });
        } else if (d.id === 'current') {
          activePreset = {
            presetId: data.presetId || '',
            presetName: data.presetName || '',
            events: Array.isArray(data.events) ? data.events : [],
          };
        }
      });
      renderSchedulePanel();
    })
    .catch((err) => showToast('Не удалось загрузить пресеты: ' + err.message, true));
}

function renderSchedulePanel() {
  const status = document.getElementById('sched-status');
  if (status) {
    status.innerHTML = activePreset && activePreset.presetName
      ? '<i data-feather="check-circle"></i> Сегодня выставлен: <b>' + escapeHtml(activePreset.presetName) + '</b>'
      : '<i data-feather="info"></i> На сегодня пока ничего не выставлено';
  }
  const wrap = document.getElementById('sched-list');
  if (!presetsCache.length) {
    wrap.innerHTML = '<div class="empty">Пресетов пока нет — создай первый.</div>';
    if (window.feather) feather.replace();
    return;
  }
  wrap.innerHTML = presetsCache.map((p) =>
    '<div class="row-item" style="flex-wrap:wrap">' +
    '<div class="grow"><b>' + escapeHtml(p.name) + '</b>' +
    '<small>' + p.events.length + ' соб. · ' + fmtPresetTime(p.updatedAt) + '</small></div>' +
    '<div class="row-actions">' +
    '<button class="btn btn-sm" data-use="' + p.id + '" type="button">Выставить на сегодня</button>' +
    '<button class="btn btn-ghost btn-sm" data-edit="' + p.id + '" type="button">Редактировать</button>' +
    '<button class="btn btn-danger btn-sm" data-pdel="' + p.id + '" type="button"><i data-feather="trash-2"></i></button>' +
    '</div></div>'
  ).join('');
  if (window.feather) feather.replace();
}

function fmtPresetTime(ts) {
  if (!ts || typeof ts.toDate !== 'function') return '—';
  return 'обновлён ' + ts.toDate().toLocaleDateString('ru-RU');
}

/* ---------- Конструктор пресета (модал): пресет = один день ---------- */
function newPreset() {
  editPreset = {
    name: '',
    events: [{ time: '10:00', title: 'Событие' }],
  };
  editId = null;
  openPresetEditor();
}

function editPresetById(id) {
  const p = presetsCache.find((x) => x.id === id);
  if (!p) return;
  editPreset = JSON.parse(JSON.stringify({ name: p.name, events: p.events }));
  editId = id;
  openPresetEditor();
}

function openPresetEditor() {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.id = 'edit-modal';
  back.innerHTML =
    '<div class="modal">' +
    '<div class="field"><label>Название дня</label>' +
    '<input id="edit-name" class="input" value="' + escapeHtml(editPreset.name) + '" placeholder="Например: День 2 — Команды"></div>' +
    '<div id="edit-events"></div>' +
    '<button id="edit-add-ev" class="btn btn-ghost btn-block" type="button">+ Добавить событие</button>' +
    '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px">' +
    '<button id="edit-cancel" class="btn btn-ghost" type="button">Отмена</button>' +
    '<button id="edit-save" class="btn" type="button">Сохранить пресет</button>' +
    '</div></div>';
  document.body.appendChild(back);

  back.querySelector('#edit-cancel').addEventListener('click', () => back.remove());
  back.querySelector('#edit-save').addEventListener('click', savePreset);
  back.querySelector('#edit-add-ev').addEventListener('click', () => {
    editPreset.events.push({ time: '12:00', title: 'Новое событие' });
    renderEditEvents();
  });
  back.querySelector('#edit-name').addEventListener('input', (e) => {
    editPreset.name = e.target.value;
  });
  renderEditEvents();
}

function renderEditEvents() {
  const wrap = document.getElementById('edit-events');
  if (!wrap) return;
  wrap.innerHTML = '';
  editPreset.events.forEach((ev, ei) => {
    const row = document.createElement('div');
    row.className = 'row-item';
    row.style.marginTop = '8px';
    row.innerHTML =
      '<input class="input" data-time="' + ei + '" value="' + escapeHtml(ev.time) + '" style="width:76px" placeholder="10:00">' +
      '<input class="input grow" data-title="' + ei + '" value="' + escapeHtml(ev.title) + '" placeholder="Название">' +
      '<button class="btn btn-ghost btn-sm" data-del="' + ei + '" type="button" title="Удалить"><i data-feather="trash-2"></i></button>';
    wrap.appendChild(row);
  });
  document.querySelectorAll('#edit-events [data-time]').forEach((el) => {
    el.addEventListener('input', () => {
      editPreset.events[Number(el.dataset.time)].time = el.value;
    });
  });
  document.querySelectorAll('#edit-events [data-title]').forEach((el) => {
    el.addEventListener('input', () => {
      editPreset.events[Number(el.dataset.title)].title = el.value;
    });
  });
  document.querySelectorAll('#edit-events [data-del]').forEach((el) => {
    el.addEventListener('click', () => {
      editPreset.events.splice(Number(el.dataset.del), 1);
      renderEditEvents();
    });
  });
  if (window.feather) feather.replace();
}

async function savePreset() {
  const name = (editPreset.name || '').trim();
  const events = editPreset.events
    .map((e) => ({ time: e.time, title: e.title }))
    .filter((e) => e.time && e.time.trim() && e.title && e.title.trim());
  if (!name) { showToast('Введи название дня', true); return; }
  if (!events.length) { showToast('Добавь хотя бы одно событие', true); return; }
  try {
    if (DEV_MODE) {
      presetsCache.push({ id: 'dev-' + Date.now(), name: name, events: events, updatedAt: null });
      renderSchedulePanel();
    } else if (editId) {
      await db.collection('schedule').doc(editId).set({
        docType: 'preset', name: name, events: events,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      await db.collection('schedule').add({
        docType: 'preset', name: name, events: events,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    }
    const modal = document.getElementById('edit-modal');
    if (modal) modal.remove();
    showToast('Пресет сохранён');
    loadSchedulePanel();
  } catch (err) {
    showToast('Ошибка: ' + err.message, true);
  }
}

async function deletePresetById(id) {
  const ok = await confirmDialog('Удалить пресет?');
  if (!ok) return;
  try {
    if (DEV_MODE) {
      presetsCache = presetsCache.filter((p) => p.id !== id);
      renderSchedulePanel();
      return;
    }
    await db.collection('schedule').doc(id).delete();
    showToast('Пресет удалён');
    loadSchedulePanel();
  } catch (err) {
    showToast('Ошибка: ' + err.message, true);
  }
}

async function activatePreset(id) {
  const p = presetsCache.find((x) => x.id === id);
  if (!p) return;
  try {
    if (DEV_MODE) {
      activePreset = { presetId: id, presetName: p.name, events: p.events };
      renderSchedulePanel();
      showToast('Выставлено: ' + p.name);
      return;
    }
    await db.collection('schedule').doc('current').set({
      docType: 'current',
      presetId: id,
      presetName: p.name,
      events: JSON.parse(JSON.stringify(p.events)),
      setAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    showToast('Выставлено на сегодня: ' + p.name);
    loadSchedulePanel();
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

/* Короткое описание типа/лимита/дня задания для списка */
function taskMeta(t) {
  const bits = [];
  if (t.type === 'repeat') bits.push('повтор · до ' + Math.max(1, t.limit || 3) + ' раз');
  if (t.day && String(t.day).trim()) bits.push('день: ' + escapeHtml(t.day));
  return bits.length ? ' · ' + bits.join(' · ') : '';
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
    '<small>+' + t.points + ' баллов' + taskMeta(t) + ' · ' + (t.active ? '<span class="badge badge-on">активно</span>' : '<span class="badge badge-off">выкл</span>') + '</small></div>' +
    '<div class="row-actions">' +
    '<button class="btn btn-ghost btn-sm" data-ed="' + t.id + '" type="button">Изменить</button>' +
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

/* Разбор массового ввода: одна строка = одно задание, «текст | N» — свои баллы */
function parseTaskLines(raw, defPoints) {
  return String(raw || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const parts = l.split('|').map((s) => s.trim());
    const pts = parts.length > 1 && Number(parts[1]) >= 1 ? Number(parts[1]) : Number(defPoints);
    return { text: parts[0], points: pts };
  });
}

async function createTask(text, points, opts) {
  opts = opts || {};
  const type = opts.type === 'repeat' ? 'repeat' : 'once';
  const limit = type === 'repeat' ? Math.max(1, Number(opts.limit) || 1) : 1;
  const day = String(opts.day || '').trim();
  try {
    if (DEV_MODE) {
      allTasks.unshift({ id: 'dev-' + Date.now(), text: text, points: points, active: true, type: type, limit: limit, day: day });
      renderTaskList(); showToast('DEV: задание добавлено'); return;
    }
    await db.collection('tasks').add({
      text: text,
      points: points,
      active: true,
      type: type,
      limit: limit,
      day: day,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    showToast('Задание создано');
    await loadTasks();
  } catch (err) {
    showToast('Ошибка: ' + err.message, true);
  }
}

/* ---------- Редактирование задания (модал) ---------- */
let editTaskId = null;

function openTaskEditor(id) {
  const t = allTasks.find((x) => x.id === id);
  if (!t) return;
  editTaskId = id;
  const type = t.type === 'repeat' ? 'repeat' : 'once';
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.id = 'edit-task-modal';
  back.innerHTML =
    '<div class="modal">' +
    '<div class="field"><label>Текст задания</label>' +
    '<input id="et-text" class="input" value="' + escapeHtml(t.text) + '"></div>' +
    '<div class="row-actions" style="justify-content:flex-start;gap:8px;margin-bottom:12px">' +
    '<div class="field" style="margin:0;width:100px"><label>Баллы</label>' +
    '<input id="et-points" class="input" type="number" min="1" value="' + Number(t.points) + '"></div>' +
    '<div class="field" style="margin:0;width:150px"><label>Тип</label>' +
    '<select id="et-type" class="input"><option value="once"' + (type === 'once' ? ' selected' : '') + '>Обычное</option>' +
    '<option value="repeat"' + (type === 'repeat' ? ' selected' : '') + '>Повторяемое</option></select></div>' +
    '<div class="field" id="et-limit-wrap" style="margin:0;width:110px' + (type === 'repeat' ? '' : ';display:none') + '"><label>Лимит раз</label>' +
    '<input id="et-limit" class="input" type="number" min="1" value="' + (t.limit || 3) + '"></div>' +
    '</div>' +
    '<div class="field"><label>День действия (пусто = всегда)</label>' +
    '<input id="et-day" class="input" value="' + escapeHtml(t.day || '') + '" placeholder="Любой день · День 1 · 2026-08-15"></div>' +
    '<label style="display:flex;gap:8px;align-items:center;margin:10px 0"><input type="checkbox" id="et-active"' + (t.active ? ' checked' : '') + '> Задание активно</label>' +
    '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px">' +
    '<button id="et-cancel" class="btn btn-ghost" type="button">Отмена</button>' +
    '<button id="et-save" class="btn" type="button">Сохранить</button>' +
    '</div></div>';
  document.body.appendChild(back);

  back.querySelector('#et-cancel').addEventListener('click', () => back.remove());
  back.querySelector('#et-save').addEventListener('click', saveTaskEdit);
  back.querySelector('#et-type').addEventListener('change', (e) => {
    document.getElementById('et-limit-wrap').style.display = e.target.value === 'repeat' ? 'block' : 'none';
  });
}

async function saveTaskEdit() {
  const text = document.getElementById('et-text').value.trim();
  const points = Number(document.getElementById('et-points').value);
  const type = document.getElementById('et-type').value;
  const limit = type === 'repeat' ? Math.max(1, Number(document.getElementById('et-limit').value) || 1) : 1;
  const day = document.getElementById('et-day').value.trim();
  const active = document.getElementById('et-active').checked;
  if (!text) { showToast('Введи текст задания', true); return; }
  if (!points || points < 1) { showToast('Баллы ≥ 1', true); return; }
  try {
    if (DEV_MODE) {
      const t = allTasks.find((x) => x.id === editTaskId);
      if (t) Object.assign(t, { text: text, points: points, type: type, limit: limit, day: day, active: active });
      renderTaskList();
    } else {
      await db.collection('tasks').doc(editTaskId).update({
        text: text,
        points: points,
        type: type,
        limit: limit,
        day: day,
        active: active,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    }
    const modal = document.getElementById('edit-task-modal');
    if (modal) modal.remove();
    showToast('Задание сохранено');
    loadTasks();
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
   БЕЙДЖИ — конструктор + выдача
   Бейдж: { name, caption, img (dataURL), createdAt } в badges/{id}.
   Выдача: массив id в users/{uid}.badges.
   ============================================================ */
let badgesCache = [];       // [{id, name, caption, img}]
let badgeFilter = 'all';

async function loadBadges() {
  try {
    if (DEV_MODE) {
      const raw = localStorage.getItem('mw_dev_badges');
      badgesCache = raw ? JSON.parse(raw) : [];
      renderBadges();
      return;
    }
    const snap = await db.collection('badges').get();
    badgesCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderBadges();
  } catch (err) {
    showToast('Не удалось загрузить бейджи: ' + err.message, true);
  }
}

function badgeGivenCount(id) {
  return usersCache.filter((u) => Array.isArray(u.badges) && u.badges.includes(id)).length;
}

function renderBadges() {
  const list = badgesCache.filter((b) => {
    if (badgeFilter === 'given') return badgeGivenCount(b.id) > 0;
    return true;
  });
  const wrap = document.getElementById('badges-list');
  if (!list.length) {
    wrap.innerHTML = '<div class="empty">Бейджей пока нет — создай первый выше.</div>';
    if (window.feather) feather.replace();
    return;
  }
  wrap.innerHTML = list.map((b) =>
    '<div class="row-item">' +
    '<img class="badge-thumb" src="' + escapeHtml(b.img || '') + '" alt="">' +
    '<div class="grow"><b>' + escapeHtml(b.name || 'Без названия') + '</b>' +
    '<small>' + escapeHtml(b.caption || '') + ' · выдано: ' + badgeGivenCount(b.id) + '</small></div>' +
    '<div class="row-actions">' +
    '<button class="btn btn-sm" data-bgive="' + b.id + '" type="button">Выдать</button>' +
    '<button class="btn btn-danger btn-sm" data-bdel="' + b.id + '" type="button"><i data-feather="trash-2"></i></button>' +
    '</div></div>'
  ).join('');
  if (window.feather) feather.replace();
}

/* Сжатие картинки в квадратный dataURL (максимум 256px) — чтобы влезать в лимит 1 МБ */
function fileToBadgeData(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const s = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => reject(new Error('Не удалось прочитать картинку'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.readAsDataURL(file);
  });
}

async function createBadge() {
  const name = document.getElementById('badge-name').value.trim();
  const caption = document.getElementById('badge-caption').value.trim();
  const file = document.getElementById('badge-file').files[0];
  if (!name) { showToast('Введи название бейджа', true); return; }
  if (!file) { showToast('Выбери картинку', true); return; }
  try {
    const img = await fileToBadgeData(file);
    if (DEV_MODE) {
      const b = { id: 'dev-b' + Date.now(), name: name, caption: caption, img: img };
      badgesCache.unshift(b);
      localStorage.setItem('mw_dev_badges', JSON.stringify(badgesCache));
      renderBadges();
      showToast('DEV: бейдж создан');
      return;
    }
    await db.collection('badges').add({
      name: name,
      caption: caption,
      img: img,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    showToast('Бейдж создан');
    await loadBadges();
  } catch (err) {
    showToast('Ошибка: ' + err.message, true);
  }
}

async function deleteBadge(id) {
  const ok = await confirmDialog('Удалить бейдж? Он исчезнет у всех, кому был выдан.');
  if (!ok) return;
  try {
    if (DEV_MODE) {
      badgesCache = badgesCache.filter((b) => b.id !== id);
      localStorage.setItem('mw_dev_badges', JSON.stringify(badgesCache));
      renderBadges();
      return;
    }
    await db.collection('badges').doc(id).delete();
    await loadBadges();
    showToast('Бейдж удалён');
  } catch (err) {
    showToast('Ошибка: ' + err.message, true);
  }
}

/* ---------- Выдача бейджа (модал: выбор участника) ---------- */
function openBadgeGive(id) {
  const badge = badgesCache.find((b) => b.id === id);
  if (!badge) return;
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML =
    '<div class="modal">' +
    '<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">' +
    '<img class="badge-thumb" src="' + escapeHtml(badge.img || '') + '" alt="">' +
    '<div><b>' + escapeHtml(badge.name) + '</b><div class="sec-sub" style="margin:2px 0 0">Кому вручить?</div></div>' +
    '</div>' +
    '<input id="bgive-search" class="input" placeholder="Поиск по имени или VK ID" style="margin-bottom:12px">' +
    '<div id="bgive-list" style="max-height:280px;overflow:auto"></div>' +
    '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px">' +
    '<button class="btn btn-ghost" data-bclose="1" type="button">Готово</button>' +
    '</div></div>';
  document.body.appendChild(back);
  back.addEventListener('click', (e) => {
    if (e.target.closest('[data-bclose]')) { back.remove(); return; }
    const row = e.target.closest('[data-brow]');
    if (row) { toggleBadgeUser(id, row.dataset.brow); return; }
  });
  const render = () => {
    const q = (document.getElementById('bgive-search').value || '').trim().toLowerCase();
    const list = usersCache.filter((u) =>
      !q || String(u.name || '').toLowerCase().includes(q) || String(u.vkId || '').includes(q));
    const box = document.getElementById('bgive-list');
    box.innerHTML = list.length
      ? list.map((u) => {
        const has = Array.isArray(u.badges) && u.badges.includes(id);
        return '<div class="row-item" data-brow="' + u.uid + '" style="cursor:pointer">' +
          '<div class="grow"><b>' + escapeHtml(u.name || 'Без имени') + '</b>' +
          '<small>VK ID: ' + escapeHtml(String(u.vkId || '—')) + '</small></div>' +
          '<span class="badge ' + (has ? 'badge-on' : 'badge-off') + '">' + (has ? 'выдан' : 'выдать') + '</span>' +
          '</div>';
      }).join('')
      : '<div class="empty">Никого не нашлось</div>';
  };
  back.querySelector('#bgive-search').addEventListener('input', render);
  render();
}

async function toggleBadgeUser(badgeId, uid) {
  const u = usersCache.find((x) => x.uid === uid);
  if (!u) return;
  const has = Array.isArray(u.badges) && u.badges.includes(badgeId);
  try {
    if (DEV_MODE) {
      u.badges = has
        ? (u.badges || []).filter((b) => b !== badgeId)
        : [].concat(u.badges || [], badgeId);
      renderUsers();
      return;
    }
    await db.collection('users').doc(uid).update({
      badges: has
        ? firebase.firestore.FieldValue.arrayRemove(badgeId)
        : firebase.firestore.FieldValue.arrayUnion(badgeId),
    });
    await Promise.all([loadUsers(), loadBadges()]);
    showToast(has ? 'Бейдж отозван' : 'Бейдж выдан: ' + (u.name || uid));
  } catch (err) {
    showToast('Ошибка: ' + err.message, true);
  }
}

function bindBadgeFilter() {
  document.querySelectorAll('[data-bfilter]').forEach((b) =>
    b.addEventListener('click', () => {
      badgeFilter = b.dataset.bfilter;
      document.querySelectorAll('[data-bfilter]').forEach((x) => x.classList.toggle('on', x === b));
      renderBadges();
    }));
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
  const toApp = document.getElementById('btn-to-app');
  if (toApp) {
    toApp.addEventListener('click', () => { location.href = 'index.html' + location.search; });
  }
  document.getElementById('btn-new-preset').addEventListener('click', newPreset);
  document.getElementById('btn-add-task').addEventListener('click', () => {
    const raw = document.getElementById('task-text').value;
    const defPoints = Number(document.getElementById('task-points').value);
    const type = document.getElementById('task-type').value;
    const limit = Number(document.getElementById('task-limit').value);
    const day = document.getElementById('task-day').value;
    const rows = parseTaskLines(raw, defPoints);
    if (!rows.length) { showToast('Введи текст задания', true); return; }
    if (rows.some((r) => !r.points || r.points < 1)) {
      showToast('Баллы ≥ 1: задай поле «Баллы» или «| N» в строке', true);
      return;
    }
    rows.forEach((r) => createTask(r.text, r.points, { type: type, limit: limit, day: day }));
    document.getElementById('task-text').value = '';
    document.getElementById('task-day').value = '';
  });
  const taskTypeEl = document.getElementById('task-type');
  const taskLimitWrap = document.getElementById('task-limit-wrap');
  if (taskTypeEl && taskLimitWrap) {
    const toggleLimit = () => {
      taskLimitWrap.style.display = taskTypeEl.value === 'repeat' ? 'block' : 'none';
    };
    taskTypeEl.addEventListener('change', toggleLimit);
    toggleLimit();
  }
  bindTaskFilter();
  bindBadgeFilter();

  document.getElementById('btn-add-badge').addEventListener('click', createBadge);
  const badgeFile = document.getElementById('badge-file');
  if (badgeFile) {
    badgeFile.addEventListener('change', () => {
      const prev = document.getElementById('badge-preview');
      if (badgeFile.files && badgeFile.files[0]) {
        prev.src = URL.createObjectURL(badgeFile.files[0]);
        prev.style.display = 'block';
      } else {
        prev.style.display = 'none';
      }
    });
  }

  document.getElementById('btn-add-all').addEventListener('click', addToAll);
  document.getElementById('btn-reset-all').addEventListener('click', resetAllScores);

  document.getElementById('users-search').addEventListener('input', (e) => {
    userQuery = e.target.value;
    renderUsers();
  });

  document.addEventListener('click', async (e) => {
    const use = e.target.closest('[data-use]');
    if (use) { activatePreset(use.dataset.use); return; }
    const pedit = e.target.closest('[data-edit]');
    if (pedit) { editPresetById(pedit.dataset.edit); return; }
    const pdel = e.target.closest('[data-pdel]');
    if (pdel) { deletePresetById(pdel.dataset.pdel); return; }
    const del = e.target.closest('[data-del]');
    if (del && del.dataset.del) { deleteTask(del.dataset.del); return; }
    const ed = e.target.closest('[data-ed]');
    if (ed) { openTaskEditor(ed.dataset.ed); return; }
    const tog = e.target.closest('[data-tog]');
    if (tog) { toggleTask(tog.dataset.tog); return; }
    const bgive = e.target.closest('[data-bgive]');
    if (bgive) { openBadgeGive(bgive.dataset.bgive); return; }
    const bdel = e.target.closest('[data-bdel]');
    if (bdel) { deleteBadge(bdel.dataset.bdel); return; }
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
