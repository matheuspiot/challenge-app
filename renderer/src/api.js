function ensureApi() {
  if (!window.api) {
    throw new Error('API local indisponível. Reinicie o aplicativo.');
  }
  return window.api;
}

export async function callApi(method, payload) {
  const api = ensureApi();
  if (typeof api[method] !== 'function') {
    throw new Error(`Método não encontrado: ${method}`);
  }

  const result = await api[method](payload);
  if (result?.error) {
    throw new Error(result.error.message || 'Erro na operação.');
  }
  return result;
}
