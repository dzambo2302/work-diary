import { todayIso } from './domain/dates.js';

const app = document.querySelector<HTMLDivElement>('#app');
if (app) app.textContent = `Pracovný denník — ${todayIso()}`;
