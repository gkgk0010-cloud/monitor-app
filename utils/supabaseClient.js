import { createClient } from '@supabase/supabase-js';

// Supabase 대시보드 → Project Settings → API 에서 복사. 변수 이름 전체 필수: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || 'https://shfmyqdbnvrudumckvat.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
