/** 워크스페이스 전환 오버레이 — body에 직접 추가/제거 */

export function showSwitchOverlay(name?: string) {
  // 이미 있으면 이름만 업데이트
  const existing = document.getElementById('org-switch-overlay');
  if (existing) {
    updateSwitchOverlayName(name || '');
    return;
  }

  const isDark = document.documentElement.classList.contains('dark');
  const overlay = document.createElement('div');
  overlay.id = 'org-switch-overlay';
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:9999;
    background:${isDark ? 'rgba(0,0,0,0)' : 'rgba(255,255,255,0)'};
    display:flex;align-items:center;justify-content:center;
    transition:background 0.3s ease;
  `;
  overlay.innerHTML = `
    <div style="
      opacity:0;transform:scale(0.96);
      transition:opacity 0.3s ease,transform 0.3s ease;
    " id="org-switch-card">
      <div style="display:flex;flex-direction:column;align-items:center;gap:6px;">
        <span id="org-switch-name" style="font-size:1.4rem;font-weight:700;color:hsl(var(--foreground));${name ? '' : 'display:none;'}">
          ${name || ''}
        </span>
        <span style="
          font-size:0.95rem;font-weight:500;letter-spacing:0.04em;
          background:linear-gradient(90deg,hsl(var(--muted-foreground)),hsl(var(--primary)),hsl(var(--muted-foreground)));
          background-size:200% 100%;
          -webkit-background-clip:text;-webkit-text-fill-color:transparent;
          background-clip:text;
          animation:shimmerText 3.5s ease-in-out infinite;
        ">잠시만 기다려주세요</span>
      </div>
    </div>
    <style>
      @keyframes shimmerText {
        0% { background-position:200% 50%; }
        100% { background-position:-200% 50%; }
      }
    </style>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => {
    overlay.style.background = isDark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.7)';
    const card = document.getElementById('org-switch-card');
    if (card) { card.style.opacity = '1'; card.style.transform = 'scale(1)'; }
  });
}

export function updateSwitchOverlayName(name: string) {
  const el = document.getElementById('org-switch-name');
  if (el) {
    el.textContent = name;
    el.style.display = '';
  }
}

export function hideSwitchOverlay() {
  const overlay = document.getElementById('org-switch-overlay');
  if (!overlay) return;
  const isDark = document.documentElement.classList.contains('dark');
  overlay.style.background = isDark ? 'rgba(0,0,0,0)' : 'rgba(255,255,255,0)';
  const card = document.getElementById('org-switch-card');
  if (card) { card.style.opacity = '0'; card.style.transform = 'scale(0.95)'; }
  setTimeout(() => overlay.remove(), 300);
}
