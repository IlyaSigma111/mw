import re

css = '''/* ============================================================
   МедиаволнApp — NEON GLASS (High Contrast & Vibrant)
   Основа: Глубокий темный фон, яркие неоновые акценты и градиенты.
   ============================================================ */

:root {
  --bg: #03040A; /* OLED Black */
  --surface: rgba(14, 17, 30, 0.75);
  --surface-2: rgba(22, 28, 48, 0.85);
  --surface-3: rgba(35, 43, 70, 0.9);
  
  --primary: #4DEEEA;     /* Vivid Cyan */
  --on-primary: #001C1A;
  --primary-container: rgba(77, 238, 234, 0.15);
  
  --secondary: #B026FF;   /* Vivid Purple */
  --secondary-container: rgba(176, 38, 255, 0.15);
  
  --tertiary: #FFDF00;    /* Vivid Yellow/Gold */
  --tertiary-container: rgba(255, 223, 0, 0.15);
  
  --error: #FF3366;
  --error-container: rgba(255, 51, 102, 0.15);
  
  --text-main: #FFFFFF;
  --text-dim: #9BA3C2;
  
  --outline: rgba(255, 255, 255, 0.1);
  --outline-variant: rgba(255, 255, 255, 0.04);
  
  --radius-xl: 20px;
  --radius-lg: 16px;
  --radius-sm: 12px;
  --radius-full: 9999px;
  
  --ease: cubic-bezier(0.2, 0.8, 0.2, 1);
  --glow-cyan: 0 0 20px rgba(77, 238, 234, 0.4);
  --glow-purple: 0 0 24px rgba(176, 38, 255, 0.5);
}

* { margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
html, body { min-height: 100%; background: var(--bg); color: var(--text-main); font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif; }

/* Dynamic Background Glow */
body { 
  background-image: 
    radial-gradient(800px circle at 15% 15%, rgba(176, 38, 255, 0.15), transparent 60%),
    radial-gradient(600px circle at 85% 85%, rgba(77, 238, 234, 0.1), transparent 60%);
  background-attachment: fixed;
  padding-bottom: 120px; font-size: 16px; line-height: 1.5; 
}

@keyframes rise {
  from { opacity: 0; transform: translateY(15px) scale(0.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.rise { animation: rise 0.4s var(--ease) both; }
.rise-1 { animation-delay: 0.05s; }
.rise-2 { animation-delay: 0.1s; }
.rise-3 { animation-delay: 0.15s; }

.shell { max-width: 600px; margin: 0 auto; padding: 0 16px; }

/* Glass App Bar */
.appbar {
  position: sticky; top: 0; z-index: 40;
  background: rgba(3, 4, 10, 0.5);
  backdrop-filter: blur(30px); -webkit-backdrop-filter: blur(30px);
  padding: calc(env(safe-area-inset-top, 16px) + 16px) 16px 16px;
  margin: 0 -16px 24px -16px;
  border-bottom: 1px solid rgba(255,255,255,0.03);
  display: flex; align-items: center;
}
.appbar-logo {
  display: flex; align-items: center; gap: 10px; font-size: 20px; font-weight: 700;
  color: var(--text-main); letter-spacing: 0.5px; text-transform: uppercase;
}
.appbar-logo .feather { color: var(--primary); width: 22px; height: 22px; filter: drop-shadow(0 0 8px var(--primary)); }

/* Header Profile - Vibrant Edition */
.hdr {
  display: flex; align-items: center; gap: 16px; margin-bottom: 24px;
}
.hdr-avatar {
  width: 64px; height: 64px; border-radius: var(--radius-full);
  background: linear-gradient(135deg, var(--secondary), var(--primary));
  display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 700;
  color: #fff; box-shadow: var(--glow-purple); padding: 2px;
}
.hdr-avatar img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; border: 2px solid #000; }
.hdr-name { flex: 1; }
.hdr-name span { display: block; font-size: 24px; font-weight: 800; line-height: 1.1; letter-spacing: -0.5px; 
  background: linear-gradient(90deg, #fff, #CBE6FF); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
.hdr-name small { display: block; font-size: 14px; color: var(--text-dim); margin-top: 4px; font-weight: 500; }
.hdr-score {
  background: rgba(176, 38, 255, 0.1); color: var(--secondary);
  padding: 10px 16px; border-radius: var(--radius-full); font-size: 16px; font-weight: 700;
  display: flex; align-items: center; gap: 6px; border: 1px solid rgba(176, 38, 255, 0.3);
  box-shadow: inset 0 0 10px rgba(176, 38, 255, 0.1);
}
.hdr-score .feather { width: 18px; height: 18px; }

/* Sections */
.sec { margin-top: 16px; }
.sec-head { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
.sec-head h2 { font-size: 22px; font-weight: 700; letter-spacing: -0.5px; }
.sec-head .feather { color: var(--primary); filter: drop-shadow(0 0 5px var(--primary)); }
.sec-sub { color: var(--text-dim); font-size: 15px; margin-bottom: 16px; }

.link-btn { 
  background: var(--surface-3); color: var(--text-main); border: 1px solid var(--outline-variant); border-radius: var(--radius-full);
  padding: 8px 16px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; text-transform: uppercase; letter-spacing: 0.5px;
}
.link-btn:active { background: rgba(255,255,255,0.1); transform: scale(0.95); }

/* Neon Glass Cards */
.card, .acc, .row-item, .district-opt, .task, .stat {
  background: var(--surface);
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
  border-radius: var(--radius-xl);
  padding: 20px; margin-bottom: 12px;
  border: 1px solid var(--outline-variant); 
  box-shadow: 0 8px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05);
  transition: transform 0.2s, border-color 0.2s;
}
.card:hover, .task:hover { border-color: rgba(77, 238, 234, 0.2); }
.card-2 { background: var(--surface-2); }

/* Accordion (Schedule) */
.acc { padding: 0; }
.acc-head {
  padding: 20px; display: flex; justify-content: space-between; align-items: center;
  font-size: 18px; font-weight: 600; color: var(--text-main); background: transparent; border: none; width: 100%; text-align: left;
}
.acc-head .feather { transition: transform 0.3s var(--ease); color: var(--primary); }
.acc.open .acc-head .feather { transform: rotate(180deg); }
.acc-body { display: none; padding: 0 20px 20px; }
.acc.open .acc-body { display: block; }

/* Timeline Events */
.ev { display: flex; gap: 16px; padding: 16px 0; border-top: 1px solid var(--outline-variant); align-items: flex-start; }
.ev:first-child { border-top: none; }
.ev-time-col { min-width: 60px; }
.ev-time { font-size: 14px; font-weight: 700; color: var(--text-dim); }
.ev-info { flex: 1; display: flex; flex-direction: column; gap: 6px; }
.ev-title { font-size: 16px; font-weight: 500; color: var(--text-main); line-height: 1.3; }
.ev-badge { display: inline-block; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: var(--radius-sm); width: max-content; text-transform: uppercase; letter-spacing: 0.5px; }
.badge-now { background: var(--primary); color: #000; box-shadow: var(--glow-cyan); }
.badge-soon { background: var(--tertiary); color: #000; box-shadow: 0 0 15px rgba(255, 223, 0, 0.4); }

.ev-now .ev-title { font-weight: 700; color: var(--primary); text-shadow: 0 0 8px rgba(77,238,234,0.3); }
.ev-now .ev-time { color: var(--primary); }
.ev-soon .ev-time { color: var(--tertiary); }
.ev-past { opacity: 0.4; }

/* Punchy Buttons */
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  background: linear-gradient(135deg, #00D2FF, #3A7BD5); color: #FFF;
  border: none; border-radius: 14px;
  padding: 14px 20px; font-size: 15px; font-weight: 700; font-family: inherit;
  cursor: pointer; transition: all 0.2s;
  box-shadow: 0 4px 15px rgba(0, 210, 255, 0.4); text-transform: uppercase; letter-spacing: 0.5px;
}
.btn:active { transform: translateY(2px); box-shadow: none; }
.btn-block { width: 100%; }
.btn-ghost { background: var(--surface-3); color: var(--primary); box-shadow: none; border: 1px solid var(--primary-container); text-shadow: none; }
.btn-danger { background: var(--error-container); color: var(--error); box-shadow: none; border: 1px solid rgba(255, 77, 77, 0.2); }
.btn-warn { background: var(--tertiary-container); color: var(--tertiary); box-shadow: none; border: 1px solid rgba(255, 223, 0, 0.2); }

/* Switch Neon Style */
.switch, .sw { position: relative; width: 50px; height: 28px; flex-shrink: 0; background: rgba(255,255,255,0.05); border-radius: var(--radius-full); transition: 0.3s; border: 1px solid rgba(255,255,255,0.1); }
.switch input { opacity: 0; width: 0; height: 0; position: absolute; }
.slider { position: absolute; inset: 0; cursor: pointer; border-radius: var(--radius-full); }
.switch input:checked + .slider, .sw.on { background: var(--primary); border-color: var(--primary); box-shadow: var(--glow-cyan); }
.slider::before, .sw i {
  content: ""; position: absolute; left: 2px; top: 2px; width: 22px; height: 22px;
  background: var(--text-dim); border-radius: 50%; transition: 0.3s var(--ease);
}
.switch input:checked + .slider::before, .sw.on i {
  transform: translateX(22px); background: #000;
}

/* Settings Rows */
.set-row { display: flex; align-items: center; gap: 16px; padding: 12px 0; border-bottom: 1px solid var(--outline-variant); }
.set-row:last-child { border-bottom: none; }
.set-row .grow { flex: 1; }
.set-row .grow b { font-size: 16px; font-weight: 500; }
.set-row .grow small { font-size: 13px; color: var(--text-dim); display: block; margin-top: 2px; }
.set-row > .feather { color: var(--text-dim); }

/* Rating */
.rating-list { display: flex; flex-direction: column; gap: 8px; }
.rate-row { display: flex; align-items: center; gap: 14px; padding: 12px 16px; background: var(--surface); border-radius: var(--radius-lg); margin-bottom: 0; border: 1px solid var(--outline-variant); }
.rate-rank { font-size: 16px; font-weight: 700; color: var(--text-dim); width: 24px; text-align: center; }
.rank-1 { color: var(--tertiary); font-size: 22px; text-shadow: 0 0 12px rgba(255, 223, 0, 0.6); }
.rank-2 { color: #E2E8F0; text-shadow: 0 0 10px rgba(255, 255, 255, 0.4); }
.rank-3 { color: #D97706; text-shadow: 0 0 10px rgba(217, 119, 6, 0.4); }
.rate-avatar { width: 44px; height: 44px; border-radius: var(--radius-full); object-fit: cover; border: 2px solid rgba(255,255,255,0.05); }
.rate-name { font-size: 15px; font-weight: 600; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rate-pts { font-size: 16px; font-weight: 800; color: var(--primary); text-shadow: 0 0 8px rgba(77,238,234,0.3); }
.rate-me { background: rgba(77, 238, 234, 0.1); border-color: rgba(77, 238, 234, 0.3); box-shadow: inset 0 0 15px rgba(77,238,234,0.05); }

/* Tasks */
.task { display: flex; align-items: center; gap: 14px; padding: 16px; }
.task-pts { background: rgba(176, 38, 255, 0.15); color: var(--secondary); padding: 6px 10px; border-radius: 10px; font-weight: 700; font-size: 13px; border: 1px solid rgba(176, 38, 255, 0.3); box-shadow: var(--glow-purple); }
.task-text { font-size: 15px; flex: 1; line-height: 1.4; font-weight: 500; }
.task.done { opacity: 0.5; filter: grayscale(1); border-color: transparent; background: rgba(255,255,255,0.02); box-shadow: none; }
.task.done .task-pts { box-shadow: none; border-color: transparent; }
.task.done .task-text { text-decoration: line-through; color: var(--text-dim); }
.btn-photo { background: rgba(77, 238, 234, 0.1); border: 1px solid rgba(77, 238, 234, 0.3); padding: 10px; border-radius: 12px; color: var(--primary); transition: 0.2s; box-shadow: var(--glow-cyan); }
.btn-photo:active { transform: scale(0.9); }

/* Forms */
.field { margin-bottom: 20px; }
.field label { display: block; font-size: 13px; font-weight: 600; color: var(--text-dim); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
.input, .textarea, select.input {
  width: 100%; background: rgba(0,0,0,0.3); border: 1px solid var(--outline-variant);
  border-radius: var(--radius-sm); color: var(--text-main); font-size: 16px; padding: 14px 16px;
  outline: none; transition: 0.2s; font-family: inherit;
  box-shadow: inset 0 2px 4px rgba(0,0,0,0.5);
}
.input:focus, .textarea:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(77,238,234,0.2), inset 0 2px 4px rgba(0,0,0,0.5); }

/* Neon Floating Dock */
.dock {
  position: fixed; bottom: 20px; left: 16px; right: 16px; height: 72px;
  background: rgba(10, 12, 22, 0.85);
  backdrop-filter: blur(20px) saturate(180%); -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 24px;
  display: flex; justify-content: space-around; align-items: center;
  z-index: 50; padding: 0 8px;
  box-shadow: 0 20px 40px rgba(0,0,0,0.6), 0 0 20px rgba(77, 238, 234, 0.1);
}
.dock-item {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  background: transparent; border: none; color: var(--text-dim); cursor: pointer;
  min-width: 60px; padding: 8px 0; transition: color 0.2s;
}
.dock-item .dock-icon-wrap {
  position: relative;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.3s var(--ease);
}
.dock-item.on { color: var(--primary); }
.dock-item.on .dock-icon-wrap { transform: translateY(-4px) scale(1.1); filter: drop-shadow(0 0 8px var(--primary)); }
.dock-item.on .feather { color: var(--primary); }
.dock-item span { font-size: 11px; font-weight: 700; letter-spacing: 0.2px; transition: transform 0.3s; }
.dock-item.on span { transform: translateY(-2px); }

.app-pane { display: none; }
.app-pane.active { display: block; animation: rise 0.4s var(--ease); }

/* Helpers */
.skel { background: rgba(255,255,255,0.05); border-radius: var(--radius-sm); animation: pulse 1.5s infinite alternate; }
@keyframes pulse { from { opacity: 1; } to { opacity: 0.3; } }
.skel.h18 { height: 20px; margin-bottom: 12px; }

#toasts { position: fixed; bottom: 100px; left: 16px; right: 16px; display: flex; flex-direction: column; gap: 8px; z-index: 100; pointer-events: none; }
.toast {
  background: rgba(14, 17, 30, 0.95); backdrop-filter: blur(10px);
  color: var(--text-main); padding: 14px 20px; border-radius: 16px; border: 1px solid var(--primary);
  font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 12px; pointer-events: auto;
  box-shadow: var(--glow-cyan);
}
.toast.err { border-color: var(--error); box-shadow: 0 0 20px rgba(255,51,102,0.4); }

.modal-back { position: fixed; inset: 0; background: rgba(0,0,0,0.7); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); z-index: 90; display: flex; align-items: flex-end; }
.modal { background: var(--surface-2); border-top: 1px solid rgba(255,255,255,0.1); width: 100%; border-radius: var(--radius-xl) var(--radius-xl) 0 0; padding: 32px 24px 48px; max-height: 85vh; overflow-y: auto; box-shadow: 0 -10px 40px rgba(0,0,0,0.8); }

.empty { text-align: center; color: var(--text-dim); padding: 32px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; font-size: 13px; }
'''

open('css/styles.css', 'w', encoding='utf-8').write(css)

import re
html = open('index.html', encoding='utf-8').read()
html = html.replace('v=36', 'v=37')
open('index.html', 'w', encoding='utf-8').write(html)
