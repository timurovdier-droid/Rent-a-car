import { useSearchParams } from 'react-router-dom';
import OwnersPage from './OwnersPage';
import DispatchersPage from './DispatchersPage';

const TABS = [
  ['owners', 'Арендодатели'],
  ['dispatchers', 'Диспетчеры'],
];

export default function UsersPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([key]) => key === params.get('tab')) ? params.get('tab') : 'owners';

  return (
    <div>
      <h1 className="page-title">Пользователи</h1>
      <div className="tabs">
        {TABS.map(([key, label]) => (
          <button key={key} className={`tab ${tab === key ? 'tab--on' : ''}`} onClick={() => setParams({ tab: key }, { replace: true })}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'owners' ? <OwnersPage embedded /> : <DispatchersPage embedded />}
    </div>
  );
}
