import {createClient} from '@supabase/supabase-js';
import {LOCAL_ONLY} from './config';

const url=import.meta.env.VITE_SUPABASE_URL;
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const authClient=!LOCAL_ONLY&&url&&key?createClient(url,key):null;
