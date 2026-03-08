const statusEl = document.getElementById('status');
const checkBtn = document.getElementById('check-btn');
const installBtn = document.getElementById('install-btn');

window.appApi.onUpdateStatus((message) => {
  statusEl.textContent = message;

  if (message.includes('gotowa')) {
    installBtn.disabled = false;
  }
});

checkBtn.addEventListener('click', async () => {
  checkBtn.disabled = true;
  statusEl.textContent = 'Ręczne sprawdzanie aktualizacji...';

  try {
    await window.appApi.checkNow();
  } catch (error) {
    statusEl.textContent = `Nie udało się sprawdzić aktualizacji: ${error.message}`;
  } finally {
    checkBtn.disabled = false;
  }
});

installBtn.addEventListener('click', async () => {
  statusEl.textContent = 'Instalowanie aktualizacji i restart...';
  await window.appApi.installNow();
});
