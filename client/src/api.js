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

  const response = await fetch(`${API_BASE_URL}${path}`, options);

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

export const api = {
  get: (path) => request('GET', path),
  post: (path, body, extra) => request('POST', path, body, extra),
  patch: (path, body, extra) => request('PATCH', path, body, extra),
  put: (path, body, extra) => request('PUT', path, body, extra),
  delete: (path) => request('DELETE', path),
};