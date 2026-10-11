const API_BASE_URL = '/api/v1';

// Кастомный класс ошибки для удобной обработки на фронтенде
export class ApiError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function request(method, path, body = null, extra = {}) {
  const options = {
    method,
    credentials: 'include', // Обязательно для отправки и получения HTTP-only cookie
    headers: {
      'Content-Type': 'application/json',
      ...(extra.headers || {}),
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  options.signal = controller.signal;

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, options);
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new ApiError('TIMEOUT', 'Сервер долго не отвечает, обновите страницу', 0);
    }
    throw new ApiError('NETWORK_ERROR', 'Нет связи с сервером', 0);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    let errData;
    try {
      errData = await response.json();
    } catch {
      errData = { error: { code: 'NETWORK_ERROR', message: 'Ошибка сети или неверный формат ответа' } };
    }
    
    const err = errData.error || { code: 'UNKNOWN', message: 'Неизвестная ошибка' };
    throw new ApiError(err.code, err.message, response.status);
  }

  // Если сервер вернул 204 No Content
  if (response.status === 204) return null;

  return response.json();
}

// Ответы GET запоминаются ненадолго: повторный заход в раздел открывается сразу,
// а любое изменение (POST/PATCH/PUT/DELETE) сбрасывает всё запомненное.
const CACHE_TTL = 60000;
const REFRESH_AFTER = 5000;
const NO_CACHE = ['/auth/'];
const cache = new Map();
const inflight = new Map();
let generation = 0;

function copy(data) {
  return data && typeof data === 'object' ? structuredClone(data) : data;
}

function fetchFresh(path) {
  if (inflight.has(path)) return inflight.get(path);
  const started = generation;
  const promise = request('GET', path)
    .then((data) => {
      if (started === generation) cache.set(path, { at: Date.now(), data });
      return data;
    })
    .finally(() => { if (inflight.get(path) === promise) inflight.delete(path); });
  inflight.set(path, promise);
  return promise;
}

function cachedGet(path) {
  if (NO_CACHE.some((prefix) => path.startsWith(prefix))) return request('GET', path);
  const hit = cache.get(path);
  const age = hit ? Date.now() - hit.at : Infinity;
  if (age < CACHE_TTL) {
    if (age > REFRESH_AFTER) fetchFresh(path).catch(() => {});
    return Promise.resolve(copy(hit.data));
  }
  return fetchFresh(path).then(copy);
}

function mutate(method, path, body, extra) {
  return request(method, path, body, extra).finally(() => {
    generation += 1;
    cache.clear();
    inflight.clear();
  });
}

export const api = {
  get: cachedGet,
  prefetch: (path) => { cachedGet(path).catch(() => {}); },
  post: (path, body, extra) => mutate('POST', path, body, extra),
  patch: (path, body, extra) => mutate('PATCH', path, body, extra),
  put: (path, body, extra) => mutate('PUT', path, body, extra),
  delete: (path) => mutate('DELETE', path),
};