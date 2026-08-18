import re

css = '''
/* ---------- ВОССТАНОВЛЕННЫЕ КЛАССЫ (Админка и Округа) ---------- */

/* Вкладки (Tabs) для админки */
.tabs { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 8px; margin-bottom: 16px; }
.tabs::-webkit-scrollbar { display: none; }
.tab-btn {
  flex-shrink: 0;
  border: none; background: var(--surface-2); color: var(--text-dim);
  font-family: inherit; font-size: 14px; font-weight: 600;
  padding: 10px 16px; border-radius: var(--radius-full); cursor: pointer;
  transition: all 0.2s;
}
.tab-btn:active { transform: scale(0.96); }
.tab-btn.on { background: var(--primary); color: #fff; }

/* Разное и Бейджи */
.badge { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: var(--radius-full); }
.badge-on { background: var(--primary-container); color: var(--primary); }
.badge-off { background: var(--error-container); color: var(--error); }
.badge-admin { background: var(--tertiary-container); color: var(--tertiary); }

.stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.stat { background: var(--surface); border-radius: var(--radius-xl); padding: 16px; display: flex; flex-direction: column; gap: 4px; }
.stat b { display: block; font-size: 26px; font-weight: 700; color: var(--text-main); }
.stat span { font-size: 12px; color: var(--text-dim); font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; }
@media (min-width: 760px) { .stat-grid { grid-template-columns: repeat(4, 1fr); } }

/* Flex rows and utilities */
.row-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.row-actions .btn { flex: 1; }
.btn-sm { padding: 10px 14px; font-size: 14px; }

/* Выбор округа (District Modal) */
.district-list { max-height: 52vh; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding-bottom: 16px; }
.district-opt {
  width: 100%; text-align: left;
  background: var(--surface-2); border: none; border-radius: var(--radius-lg);
  color: var(--text-main); font-family: inherit; font-size: 16px; font-weight: 500;
  padding: 16px; cursor: pointer;
  transition: all 0.2s;
}
.district-opt:active { transform: scale(0.97); opacity: 0.8; }
.district-opt-sep { border-top: 1px dashed var(--outline-variant); margin: 8px 0; }
.district-opt.opt-org {
  display: flex; flex-direction: column; gap: 4px;
  background: var(--primary-container); border: 1px solid rgba(10, 132, 255, 0.3);
}
.district-opt.opt-org span { color: var(--primary); font-weight: 600; }
.district-opt.opt-org small { font-weight: 500; color: var(--text-main); font-size: 13px; opacity: 0.8; }
'''

with open('css/styles.css', 'a', encoding='utf-8') as f:
    f.write(css)

html = open('index.html', encoding='utf-8').read()
html = html.replace('v=41', 'v=42')
open('index.html', 'w', encoding='utf-8').write(html)

admin = open('admin.html', encoding='utf-8').read()
admin = admin.replace('v=41', 'v=42')
open('admin.html', 'w', encoding='utf-8').write(admin)
