import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

// Базовые стили
import '@fontsource-variable/geist';
import './styles/tokens.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/theme-dark.css';
import './styles/mobile.css';
import './styles/skin-alt.css';

import App from './App.jsx';
import { startTranslator } from './i18n';
import { registerWorker } from './push';

document.documentElement.dataset.skin = 'alt';

startTranslator();
registerWorker();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);