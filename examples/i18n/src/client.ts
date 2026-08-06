import { boot, i18n } from 'janux/client';
import { Counter } from './components/Counter';

boot({ defs: [Counter], i18n: i18n() });
