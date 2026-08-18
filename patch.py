import re

content = open('js/app.js', encoding='utf-8').read()
content = content.replace('Выставлено:', 'Обновлено:')

replacement = r'''function renderSchedule() {
  const wrap = document.getElementById('schedule');
  const cached = localStorage.getItem(SCHEDULE_CACHE_KEY);
  const raw = cached ? JSON.parse(cached) : DEFAULT_SCHEDULE;
  const days = Array.isArray(raw) ? raw : [raw];

  if (!days.length || !Array.isArray(days[0].events)) {
    wrap.innerHTML = '<div class="empty">Нет событий</div>';
    return;
  }

  const now = new Date();
  const curMins = now.getHours() * 60 + now.getMinutes();

  function parseTime(tStr) {
    const m = String(tStr).match(/(\d{1,2}):(\d{2})/);
    if (!m) return null;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  }

  function getEventState(e, nextE) {
    const start = parseTime(e.time);
    if (start === null) return '';
    let end = null;
    const parts = String(e.time).split('-');
    if (parts.length > 1) {
      end = parseTime(parts[1]);
    } else if (nextE) {
      end = parseTime(nextE.time);
    }
    if (end === null || end < start) end = start + 60;

    if (curMins >= start && curMins < end) return ' ev-now';
    if (start > curMins && (start - curMins) <= 45) return ' ev-soon';
    if (curMins >= end) return ' ev-past';
    return '';
  }

  function renderDay(d, isSingle) {
    let html = '';
    d.events.forEach((e, i) => {
      const nextE = d.events[i + 1];
      const stateClass = getEventState(e, nextE);
      
      let badge = '';
      if (stateClass === ' ev-now') badge = '<div class="ev-badge badge-now">Идёт сейчас</div>';
      else if (stateClass === ' ev-soon') badge = '<div class="ev-badge badge-soon">Скоро</div>';

      html += '<div class="ev' + stateClass + '">' +
        '<div class="ev-time-col"><span class="ev-time">' + escapeHtml(e.time) + '</span></div>' +
        '<div class="ev-info"><span class="ev-title">' + escapeHtml(e.title) + '</span>' + badge + '</div>' +
        '</div>';
    });
    return html;
  }

  if (days.length === 1) {
    const d = days[0];
    wrap.innerHTML =
      '<div class="acc open">' +
      '<div class="acc-head" style="cursor:default"><span>' + escapeHtml(d.day || 'План') + '</span></div>' +
      '<div class="acc-body" style="display:block">' + renderDay(d, true) + '</div></div>';
    return;
  }

  wrap.innerHTML = '';
  days.forEach((day, di) => {
    const item = document.createElement('div');
    item.className = 'acc' + (di === 0 ? ' open' : '');
    
    item.innerHTML =
      '<button class="acc-head" type="button"><span>' + escapeHtml(day.day || 'День ' + (di + 1)) + '</span><i data-feather="chevron-down"></i></button>' +
      '<div class="acc-body">' + renderDay(day, false) + '</div>';
    wrap.appendChild(item);
  });
  if (typeof feather !== 'undefined') feather.replace();
}
'''

content = re.sub(r'function renderSchedule\(\) \{[\s\S]*?(?=\n/\* ----------|\nfunction|\nconst)', lambda _: replacement, content)
open('js/app.js', 'w', encoding='utf-8').write(content)
