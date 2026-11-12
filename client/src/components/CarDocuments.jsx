import { useState } from 'react';
import { api, ApiError } from '../api';
import { fmtDay } from '../labels';

const CAR_DOCS = [
  ['TECH_PASSPORT', 'Техпаспорт', 'Технический паспорт автомобиля'],
  ['INSURANCE', 'Страховка', 'Полис страховки автомобиля'],
  ['TAKAFUL', 'Страховка Takaful', 'Полис страховки Takaful'],
  ['AD_PASSPORT', 'Рекламный паспорт', 'Рекламный паспорт для работы'],
  ['LICENSE', 'Лицензия', 'Лицензия на перевозку'],
];

export const DRIVER_DOCS = [
  ['PASSPORT', 'Паспорт', 'Скан паспорта'],
  ['LICENSE', 'Права', 'Водительское удостоверение'],
  ['RESIDENCE', 'Прописка', 'Место жительства'],
];

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_PDF = 2_400_000;

function readDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.readAsDataURL(file);
  });
}

function readImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Не получилось открыть фото')); };
    img.src = url;
  });
}

async function shrinkImage(file) {
  const img = await readImage(file);
  const scale = Math.min(1, 1800 / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  const webp = canvas.toDataURL('image/webp', 0.82);
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.82);
}

async function prepareFile(file) {
  if (file.type === 'application/pdf') {
    if (file.size > MAX_PDF) throw new Error('PDF больше 2,4 МБ — сожмите файл и загрузите снова');
    return readDataUrl(file);
  }
  if (!IMAGE_TYPES.includes(file.type)) throw new Error('Нужен файл PDF, JPG, PNG или WEBP');
  return shrinkImage(file);
}

export default function CarDocuments({
  carId,
  documents = [],
  canWrite = false,
  onChanged,
  filePath,
  kinds = CAR_DOCS,
  apiPrefix,
  title = 'Файлы документов',
  lead,
}) {
  const byKind = Object.fromEntries((documents || []).map((doc) => [doc.kind, doc]));
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  function apiPath(kind) {
    return apiPrefix ? `${apiPrefix}/${kind}` : `/cars/${carId}/documents/${kind}`;
  }

  function href(kind, doc) {
    const base = filePath ? filePath(kind) : `/api/v1${apiPath(kind)}`;
    return `${base}?v=${encodeURIComponent(doc.updated_at || '')}`;
  }

  async function upload(kind, event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(kind);
    setError('');
    try {
      const data = await prepareFile(file);
      await api.put(apiPath(kind), { file: data, name: file.name });
      onChanged?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err.message || 'Не удалось загрузить файл'));
    } finally {
      setBusy('');
    }
  }

  async function remove(kind) {
    if (!window.confirm('Убрать этот файл?')) return;
    setBusy(kind);
    setError('');
    try {
      await api.delete(apiPath(kind));
      onChanged?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось удалить файл');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="panel">
      <h3 className="panel__title">{title}</h3>
      <p className="doc-list__lead">
        {lead || (canWrite
          ? 'Техпаспорт, страховка, страховка Takaful, рекламный паспорт и лицензия. После загрузки файл видят водитель и арендодатель.'
          : 'Техпаспорт, страховка, страховка Takaful, рекламный паспорт и лицензия.')}
      </p>
      {error && <div className="notice notice--error">{error}</div>}
      <ul className="doc-list">
        {kinds.map(([kind, label, hint]) => {
          const doc = byKind[kind];
          const image = doc?.mime?.startsWith('image/');
          return (
            <li key={kind} className="doc-card">
              <div className="doc-card__preview">
                {doc && image && <img src={href(kind, doc)} alt="" />}
                {doc && !image && <span className="doc-card__badge">PDF</span>}
                {!doc && <span className="doc-card__empty">Нет файла</span>}
              </div>
              <div className="doc-card__body">
                <div className="doc-card__title">{label}</div>
                <div className="doc-card__meta">
                  {doc ? `${doc.name} · ${fmtDay(doc.updated_at)}` : hint}
                </div>
                <div className="doc-card__actions">
                  {doc && (
                    <a className="btn btn--quiet btn--sm" href={href(kind, doc)} target="_blank" rel="noopener noreferrer">Открыть</a>
                  )}
                  {canWrite && (
                    <label className={`btn btn--quiet btn--sm ${busy === kind ? 'is-disabled' : ''}`}>
                      {busy === kind ? 'Загружаю…' : (doc ? 'Заменить' : 'Загрузить')}
                      <input
                        type="file"
                        accept="application/pdf,image/jpeg,image/png,image/webp"
                        onChange={(event) => upload(kind, event)}
                        disabled={Boolean(busy)}
                        hidden
                      />
                    </label>
                  )}
                  {canWrite && doc && (
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => remove(kind)} disabled={Boolean(busy)}>Убрать</button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
