// Public client settings. The publishable key is designed to ship inside apps;
// row-level security on the database is what keeps each beekeeper's data private.
// Override at build time with SUPABASE_URL / SUPABASE_KEY environment variables.
const envUrl = import.meta.env.SUPABASE_URL as string;
const envKey = import.meta.env.SUPABASE_KEY as string;

export const SUPABASE_URL = envUrl || 'https://qtpawlgptjeebcqftxvx.supabase.co';
export const SUPABASE_KEY = envKey || 'sb_publishable_D6Lo3IYwL4u5XehXhsHyBQ_qq30zTnx';
export const APP_VERSION = '0.9.0';
