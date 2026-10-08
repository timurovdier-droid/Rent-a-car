import { useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import Modal from './Modal';
import MoneyInput from './MoneyInput';
import { FUEL_TYPES } from '../labels';
import { CarVisual } from './CarTile';

function readImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
    img.src = url;
  });
}

async function shrinkPhoto(file) {
  const img = await readImage(file);
  const scale = Math.min(1, 1000 / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  const webp = canvas.toDataURL('image/webp', 0.85);
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png');
}

function initial(car) {
  return {
    plate: car?.plate || '',
    brand: car?.brand || '',
    model: car?.model || '',
    year: car?.year ? String(car.year) : '',
    color: car?.color || '',
    vin: car?.vin || '',
    mileage: car?.mileage != null ? String(car.mileage) : '',
    fuel_type: car?.fuel_type || '',
    insurance_expires: car?.insurance_expires ? String(car.insurance_expires).slice(0, 10) : '',
    inspection_expires: car?.inspection_expires ? String(car.inspection_expires).slice(0, 10) : '',
    owner_id: car?.owner_id ? String(car.owner_id) : '',
    branch_id: car?.branch_id ? String(car.branch_id) : '',
    daily_rate: '',
  };
}

export default function CarForm({ car, onClose, onSaved }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [form, setForm] = useState(() => initial(car));
  const [owners, setOwners] = useState([]);
  const [branches, setBranches] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [photo, setPhoto] = useState({ data: null, remove: false });

  async function choosePhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setPhoto({ data: await shrinkPhoto(file), remove: false });
    } catch {
      setError('Не получилось открыть фото — выберите JPG, PNG или WEBP');
    }
  }

  useEffect(() => {
    if (!isAdmin) return;
    api.get('/owners/active').then(setOwners).catch(() => setOwners([]));
    api.get('/branches/active').then((list) => {
      setBranches(list);
      if (!car && list.length === 1) setForm((f) => ({ ...f, branch_id: f.branch_id || String(list[0].id) }));
    }).catch(() => setBranches([]));
  }, [isAdmin, car]);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const body = {
        plate: form.plate,
        brand: form.brand,
        model: form.model,
        year: form.year || null,
        color: form.color,
        vin: form.vin,
        mileage: form.mileage === '' ? null : form.mileage,
        fuel_type: form.fuel_type || null,
        insurance_expires: form.insurance_expires || null,
        inspection_expires: form.inspection_expires || null,
      };
      if (isAdmin) {
        body.owner_id = form.owner_id || null;
        body.branch_id = form.branch_id || null;
      }
      let saved;
      if (car) {
        saved = await api.patch(`/cars/${car.id}`, body);
      } else {
        body.daily_rate = form.daily_rate || 0;
        saved = await api.post('/cars', body);
      }
      if (photo.data) {
        const r = await api.put(`/cars/${saved.id}/photo`, { image: photo.data });
        saved = { ...saved, photo_version: r.photo_version };
      } else if (photo.remove && car?.photo_version) {
        await api.delete(`/cars/${saved.id}/photo`);
        saved = { ...saved, photo_version: 0 };
      }
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  }

  const hasPhoto = Boolean(photo.data || (car?.photo_version && !photo.remove));

  return (
    <Modal title={car ? 'Изменить автомобиль' : 'Новый автомобиль'} onClose={onClose} wide>
      <form onSubmit={submit} className="cf">
        <div className="photo-pick">
          <div className="photo-pick__preview">
            <CarVisual
              car={photo.remove ? { ...car, ...form, photo_version: 0 } : { ...car, ...form }}
              src={photo.data || undefined}
            />
          </div>
          <div className="photo-pick__body">
            <div className="photo-pick__title">Фото машины</div>
            <p className="photo-pick__hint">Лучше сбоку и на светлом фоне. Без фото покажем рисунок в цвете машины.</p>
            <div className="photo-pick__actions">
              <label className="btn btn--quiet btn--sm">
                {hasPhoto ? 'Заменить фото' : 'Загрузить фото'}
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={choosePhoto} hidden />
              </label>
              {hasPhoto && (
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPhoto({ data: null, remove: true })}>Убрать</button>
              )}
            </div>
          </div>
        </div>

        <fieldset className="cf__section">
          <legend className="cf__legend">Машина</legend>
          <div className="cf__grid">
            <div className="field">
              <label className="field__label" htmlFor="cf-brand">Марка *</label>
              <input id="cf-brand" className="field__input" value={form.brand} onChange={set('brand')} required placeholder="Chevrolet" />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="cf-model">Модель *</label>
              <input id="cf-model" className="field__input" value={form.model} onChange={set('model')} required placeholder="Cobalt" />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="cf-year">Год</label>
              <input id="cf-year" className="field__input" type="number" min="1980" max={new Date().getFullYear() + 1} value={form.year} onChange={set('year')} placeholder="2022" />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="cf-plate">Госномер *</label>
              <input id="cf-plate" className="field__input" value={form.plate} onChange={set('plate')} required placeholder="01A123BC" maxLength={12} />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="cf-color">Цвет</label>
              <input id="cf-color" className="field__input" value={form.color} onChange={set('color')} placeholder="Белый" />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="cf-fuel">Топливо</label>
              <select id="cf-fuel" className="field__input" value={form.fuel_type} onChange={set('fuel_type')}>
                <option value="">Не указано</option>
                {FUEL_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
        </fieldset>

        <fieldset className="cf__section">
          <legend className="cf__legend">Документы и пробег</legend>
          <div className="cf__grid cf__grid--2">
            <div className="field">
              <label className="field__label" htmlFor="cf-vin">VIN / номер кузова</label>
              <input id="cf-vin" className="field__input" value={form.vin} onChange={set('vin')} maxLength={32} />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="cf-mileage">Пробег сейчас</label>
              <MoneyInput id="cf-mileage" value={form.mileage} onChange={(v) => setForm({ ...form, mileage: v })} suffix="км" />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="cf-ins">Страховка до</label>
              <input id="cf-ins" className="field__input" type="date" value={form.insurance_expires} onChange={set('insurance_expires')} />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="cf-insp">Техосмотр до</label>
              <input id="cf-insp" className="field__input" type="date" value={form.inspection_expires} onChange={set('inspection_expires')} />
            </div>
          </div>
        </fieldset>

        {isAdmin && (
          <fieldset className="cf__section">
            <legend className="cf__legend">Принадлежность</legend>
            <div className="cf__grid cf__grid--2">
              <div className="field">
                <label className="field__label" htmlFor="cf-owner">Арендодатель</label>
                <select id="cf-owner" className="field__input" value={form.owner_id} onChange={set('owner_id')}>
                  <option value="">Не указан</option>
                  {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="field__label" htmlFor="cf-branch">Филиал *</label>
                <select id="cf-branch" className="field__input" value={form.branch_id} onChange={set('branch_id')} required>
                  <option value="">Выберите</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              {!car && (
                <div className="field">
                  <label className="field__label" htmlFor="cf-rate">Ставка аренды в день</label>
                  <MoneyInput id="cf-rate" value={form.daily_rate} onChange={(v) => setForm({ ...form, daily_rate: v })} />
                </div>
              )}
            </div>
          </fieldset>
        )}

        {error && <div className="notice notice--error">{error}</div>}
        <div className="cf__footer">
          <button className="btn btn--quiet" type="button" onClick={onClose}>Отмена</button>
          <button className="btn" type="submit" disabled={saving}>{saving ? 'Сохраняю…' : car ? 'Сохранить' : 'Добавить автомобиль'}</button>
        </div>
      </form>
    </Modal>
  );
}
