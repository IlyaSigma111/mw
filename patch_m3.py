import re

css = '''/* ============================================================
   МедиаволнApp — MATERIAL YOU (M3) DESIGN
   Тёмная тема, скругления 28px, тональные поверхности, без теней.
   ============================================================ */

:root {
  --bg: #0d1117; 
  --surface: #161b22; 
  --surface-2: #21262d; 
  --surface-3: #30363d;
  
  --primary: #91C7ED;
  --on-primary: #003351;
  --primary-container: #004B73;
  --on-primary-container: #CBE6FF;
  
  --secondary: #A119FF;
  --secondary-container: #4D0083;
  --on-secondary-container: #E9D5FF;
  
  --tertiary: #F59E0B;
  --tertiary-container: #5C3A00;
  --on-tertiary-container: #FFDDAE;
  
  --error: #FFB4AB;
  --error-container: #93000A;
  --on-error-container: #FFDAD6;
  
  --text-main: #E2E2E9;
  --text-dim: #C4C6D0;
  
  --outline: #8E9099;
  --outline-variant: #44474E;
  
  --radius-xl: 28px;
  --radius-lg: 16px;
  --radius-sm: 12px;
  --radius-full: 9999px;
  
  --ease: cubic-bezier(0.2, 0, 0, 1);
}

* { margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
html, body { min-height: 100%; background: var(--bg); color: var(--text-main); font-family: 'Inter', system-ui, sans-serif; }

body { padding-bottom: 120px; font-size: 16px; line-height: 1.5; }

@keyframes rise {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
.rise { animation: rise 0.4s var(--ease) both; }
.rise-1 { animation-delay: 0.05s; }
.rise-2 { animation-delay: 0.1s; }
.rise-3 { animation-delay: 0.15s; }

.shell { max-width: 600px; margin: 0 auto; padding: 0 16px; }

.appbar {
  display: flex; align-items: center; padding: calc(env(safe-area-inset-top, 16px) + 16px) 0 24px;
}
.appbar-logo {
  display: flex; align-items: center; gap: 12px; font-size: 22px; font-weight: 500;
  color: var(--text-main); letter-spacing: 0;
}
.appbar-logo .feather { color: var(--primary); width: 24px; height: 24px; }

.hdr {
  display: flex; align-items: center; gap: 16px; margin-bottom: 16px;
}
.hdr-avatar {
  width: 64px; height: 64px; border-radius: var(--radius-full);
  background: var(--primary-container); color: var(--on-primary-container);
  display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 500;
}
.hdr-avatar img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
.hdr-name { flex: 1; }
.hdr-name span { display: block; font-size: 24px; font-weight: 400; line-height: 1.2; }
.hdr-name small { display: block; font-size: 14px; color: var(--text-dim); margin-top: 4px; }
.hdr-score {
  background: var(--secondary-container); color: var(--on-secondary-container);
  padding: 12px 20px; border-radius: var(--radius-full); font-size: 16px; font-weight: 500;
  display: flex; align-items: center; gap: 8px;
}
.hdr-score .feather { width: 18px; height: 18px; }

.sec { margin-top: 24px; }
.sec-head { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.sec-head h2 { font-size: 20px; font-weight: 500; }
.sec-head .feather { color: var(--primary); }
.sec-sub { color: var(--text-dim); font-size: 14px; margin-bottom: 16px; }

.link-btn { 
  background: var(--surface-3); color: var(--text-main); border: none; border-radius: var(--radius-full);
  padding: 8px 16px; font-size: 14px; font-weight: 500; cursor: pointer; transition: background 0.2s;
}
.link-btn:active { background: var(--outline-variant); }

.card, .acc, .row-item, .district-opt, .task, .stat {
  background: var(--surface);
  border-radius: var(--radius-xl);
  padding: 20px; margin-bottom: 12px;
  border: none; box-shadow: none;
}
.card-2 { background: var(--surface-2); }

.acc { padding: 0; }
.acc-head {
  padding: 20px; display: flex; justify-content: space-between; align-items: center;
  font-size: 18px; font-weight: 500; color: var(--text-main); background: transparent; border: none; width: 100%; text-align: left;
}
.acc-head .feather { transition: transform 0.3s var(--ease); }
.acc.open .acc-head .feather { transform: rotate(180deg); }
.acc-body { display: none; padding: 0 20px 20px; }
.acc.open .acc-body { display: block; }

.ev { display: flex; gap: 16px; padding: 16px 0; border-top: 1px solid var(--outline-variant); align-items: flex-start; }
.ev:first-child { border-top: none; }
.ev-time-col { min-width: 60px; }
.ev-time { font-size: 14px; font-weight: 500; color: var(--text-dim); }
.ev-info { flex: 1; display: flex; flex-direction: column; gap: 6px; }
.ev-title { font-size: 16px; font-weight: 400; color: var(--text-main); line-height: 1.4; }
.ev-badge { display: inline-block; font-size: 12px; font-weight: 500; padding: 4px 12px; border-radius: var(--radius-full); width: max-content; }
.badge-now { background: var(--primary-container); color: var(--on-primary-container); }
.badge-soon { background: var(--tertiary-container); color: var(--on-tertiary-container); }

.ev-now .ev-title { font-weight: 500; color: var(--primary); }
.ev-now .ev-time { color: var(--primary); }
.ev-soon .ev-time { color: var(--tertiary); }
.ev-past { opacity: 0.5; }

.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  background: var(--primary); color: var(--on-primary);
  border: none; border-radius: var(--radius-full);
  padding: 16px 24px; font-size: 15px; font-weight: 500; font-family: inherit;
  cursor: pointer; transition: background 0.2s, transform 0.1s;
}
.btn:active { transform: scale(0.97); }
.btn-block { width: 100%; }
.btn-ghost { background: var(--surface-2); color: var(--primary); }
.btn-danger { background: var(--error-container); color: var(--on-error-container); }
.btn-warn { background: var(--tertiary-container); color: var(--on-tertiary-container); }

.switch, .sw { position: relative; width: 52px; height: 32px; flex-shrink: 0; background: var(--surface-3); border-radius: var(--radius-full); transition: 0.2s; border: 2px solid var(--outline); }
.switch input { opacity: 0; width: 0; height: 0; position: absolute; }
.slider { position: absolute; inset: 0; cursor: pointer; border-radius: var(--radius-full); }
.switch input:checked + .slider, .sw.on { background: var(--primary); border-color: var(--primary); }
.slider::before, .sw i {
  content: ""; position: absolute; left: 4px; top: 4px; width: 20px; height: 20px;
  background: var(--outline); border-radius: 50%; transition: 0.2s var(--ease);
}
.switch input:checked + .slider::before, .sw.on i {
  transform: translateX(20px) scale(1.2); background: var(--on-primary);
}

.set-row { display: flex; align-items: center; gap: 16px; padding: 12px 0; border-bottom: 1px solid var(--outline-variant); }
.set-row:last-child { border-bottom: none; }
.set-row .grow { flex: 1; }
.set-row .grow b { font-size: 16px; font-weight: 400; }
.set-row .grow small { font-size: 14px; color: var(--text-dim); display: block; }
.set-row > .feather { color: var(--text-dim); }

.rating-list { display: flex; flex-direction: column; gap: 8px; }
.rate-row { display: flex; align-items: center; gap: 16px; padding: 16px; background: var(--surface); border-radius: var(--radius-xl); margin-bottom: 0; }
.rate-rank { font-size: 16px; font-weight: 500; color: var(--text-dim); width: 24px; text-align: center; }
.rank-1 { color: var(--tertiary); font-size: 20px; }
.rank-2 { color: var(--text-main); }
.rank-3 { color: #CD7F32; }
.rate-avatar { width: 48px; height: 48px; border-radius: var(--radius-full); object-fit: cover; }
.rate-name { font-size: 16px; font-weight: 500; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rate-pts { font-size: 16px; font-weight: 500; color: var(--primary); }
.rate-me { background: var(--surface-2); }

.task { display: flex; align-items: center; gap: 16px; }
.task-pts { background: var(--secondary-container); color: var(--on-secondary-container); padding: 6px 12px; border-radius: var(--radius-full); font-weight: 500; font-size: 14px; }
.task-text { font-size: 16px; flex: 1; line-height: 1.4; }
.task.done { opacity: 0.5; }
.task.done .task-text { text-decoration: line-through; }
.btn-photo { background: var(--surface-2); border: none; padding: 8px; border-radius: 50%; color: var(--primary); }

.field { margin-bottom: 24px; }
.field label { display: block; font-size: 14px; color: var(--text-dim); margin-bottom: 8px; }
.input, .textarea, select.input {
  width: 100%; background: var(--surface-2); border: none; border-bottom: 2px solid var(--outline-variant);
  border-radius: var(--radius-sm) var(--radius-sm) 0 0; color: var(--text-main); font-size: 16px; padding: 16px;
  outline: none; transition: 0.2s;
}
.input:focus, .textarea:focus { border-bottom-color: var(--primary); background: var(--surface-3); }

.dock {
  position: fixed; bottom: 0; left: 0; right: 0; height: 80px;
  background: var(--surface-2); display: flex; justify-content: space-around; align-items: center;
  padding-bottom: env(safe-area-inset-bottom, 0); z-index: 50; border-top: none;
}
.dock-item {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  background: transparent; border: none; color: var(--text-dim); cursor: pointer;
  min-width: 64px;
}
.dock-item .dock-icon-wrap {
  width: 64px; height: 32px; border-radius: 16px;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.2s var(--ease);
}
.dock-item.on { color: var(--text-main); }
.dock-item.on .dock-icon-wrap { background: var(--primary-container); }
.dock-item.on .feather { color: var(--on-primary-container); }
.dock-item span { font-size: 12px; font-weight: 500; }

.app-pane { display: none; }
.app-pane.active { display: block; animation: rise 0.3s var(--ease); }

.skel { background: var(--surface-3); border-radius: var(--radius-lg); animation: pulse 1.5s infinite alternate; }
@keyframes pulse { from { opacity: 1; } to { opacity: 0.4; } }
.skel.h18 { height: 24px; margin-bottom: 12px; }

#toasts { position: fixed; bottom: 100px; left: 16px; right: 16px; display: flex; flex-direction: column; gap: 8px; z-index: 100; pointer-events: none; }
.toast {
  background: var(--surface-3); color: var(--text-main); padding: 16px; border-radius: var(--radius-lg);
  font-size: 14px; font-weight: 500; display: flex; align-items: center; gap: 12px; pointer-events: auto;
}
.toast.err { background: var(--error-container); color: var(--on-error-container); }

.modal-back { position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 90; display: flex; align-items: flex-end; }
.modal { background: var(--surface); width: 100%; border-radius: var(--radius-xl) var(--radius-xl) 0 0; padding: 32px 24px 48px; max-height: 85vh; overflow-y: auto; }

.empty { text-align: center; color: var(--text-dim); padding: 32px; }
'''

open('css/styles.css', 'w', encoding='utf-8').write(css)

html = open('index.html', encoding='utf-8').read()
html = re.sub(r'<button class="dock-item(.*?)><i data-feather="(.*?)"></i></button>', r'<button class="dock-item\1><div class="dock-icon-wrap"><i data-feather="\2"></i></div><span class="dock-label-\2"></span></button>', html)

html = html.replace('<span class="dock-label-calendar"></span>', '<span>План</span>')
html = html.replace('<span class="dock-label-zap"></span>', '<span>Баллы</span>')
html = html.replace('<span class="dock-label-award"></span>', '<span>Топ</span>')
html = html.replace('<span class="dock-label-user"></span>', '<span>Профиль</span>')

html = html.replace('v=33', 'v=34')
open('index.html', 'w', encoding='utf-8').write(html)
