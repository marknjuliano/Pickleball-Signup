(async () => {
  const app = document.getElementById('app');
  try {
    await import('./app.js?v=3.7.4');
  } catch (err) {
    console.error('PowerDink bootstrap failed:', err);
    if (app) {
      const msg = String(err?.message || err || 'Unknown module loading error');
      app.innerHTML = `<div style="max-width:760px;margin:40px auto;padding:20px;font-family:Arial,sans-serif"><div style="background:white;border:1px solid #d8e0ec;border-radius:18px;padding:24px"><h2>PowerDink could not start</h2><p>The page loaded, but the app JavaScript did not. This build now shows the actual startup error instead of staying on the Loading screen.</p><pre style="white-space:pre-wrap;background:#f6f8fb;padding:12px;border-radius:10px">${msg.replace(/[&<>]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]))}</pre><button onclick="location.reload()">Reload App</button></div></div>`;
    }
  }
})();
