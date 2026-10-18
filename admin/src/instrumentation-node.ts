import { assertSecrets, ensureAdmins } from './lib/boot';

assertSecrets();
await ensureAdmins();
