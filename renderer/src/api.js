function ensureApi() {
  if (!window.api) {
    throw new Error('API local indisponível. Reinicie o aplicativo.');
  }
  return window.api;
}

const IPC_TIMEOUT_MS = 15000;

function withTimeout(promise, timeoutMs = IPC_TIMEOUT_MS) {
  let timer = null;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error('Tempo limite excedido na comunicação com o aplicativo. Tente novamente.'));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export async function callApi(method, payload) {
  const api = ensureApi();
  if (typeof api[method] !== 'function') {
    throw new Error(`Método não encontrado: ${method}`);
  }

  const result = await withTimeout(api[method](payload));
  if (result?.error) {
    throw new Error(result.error.message || 'Erro na operação.');
  }
  return result;
}

export async function getUpdateStatus() {
  const api = ensureApi();
  return withTimeout(api.getUpdateStatus());
}

export async function checkForUpdates() {
  const api = ensureApi();
  return withTimeout(api.checkForUpdates());
}

export async function installUpdateNow() {
  const api = ensureApi();
  return withTimeout(api.installUpdateNow());
}

export function subscribeUpdateStatus(callback) {
  const api = ensureApi();
  return api.onUpdateStatus(callback);
}

export async function getAppMeta() {
  const api = ensureApi();
  return withTimeout(api.getAppMeta());
}

export async function getAthletePayments(payload) {
  const api = ensureApi();
  return withTimeout(api.getAthletePayments(payload));
}

export async function addPayment(payload) {
  const api = ensureApi();
  return withTimeout(api.addPayment(payload));
}
