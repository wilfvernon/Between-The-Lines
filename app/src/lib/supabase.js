import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env file.');
}

// Serialize auth operations in this tab to avoid navigator lock timeouts
// during quick sign-out/sign-in flows in installed PWAs.
let authLockQueue = Promise.resolve();

const inTabAuthLock = async (_lockName, _acquireTimeout, fn) => {
  const task = authLockQueue.then(async () => fn());
  authLockQueue = task.catch(() => undefined);
  return task;
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    lock: inTabAuthLock,
  },
});
