import { createMemoryStorage, defineScheduleConfig } from '@janux/agent';

export const storage = createMemoryStorage();

export default defineScheduleConfig({ storage, leaseMs: 5_000 });
