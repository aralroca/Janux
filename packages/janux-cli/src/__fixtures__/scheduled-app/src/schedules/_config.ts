import { createMemoryStorage, defineScheduleConfig } from '@janux/agent';

/** Exported so a test can seed a due occurrence and prove the handler really fires. */
export const storage = createMemoryStorage();

export default defineScheduleConfig({ storage });
