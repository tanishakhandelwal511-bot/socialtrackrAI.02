import { GeminiService, Post } from './services/gemini.ts';
import { supabase } from './services/supabase.ts';
import './index.css';

// ═══════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════
interface User {
  id: string;
  name: string;
  email: string;
}

const DB: {
  user: User | null;
  session: string | null;
} = {
  user: null,
  session: null,
};

interface AppState {
  ob: {
    plt: string | null;
    niche: string | null;
    cts: string[];
    freq: number | null;
  };
  obStep: number;
  calY: number;
  calM: number;
  cal: Record<string, Post>;
  done: Record<string, boolean>;
  edits: Record<string, { cap?: string; notes?: string }>;
  metrics: Array<{ date: string; views: number; likes: number; comments: number; saves: number }>;
  streak: number;
  best: number;
  openKey: string | null;
  aiInited: boolean;
  dark: boolean;
}

const U: AppState = {
  ob: { plt: null, niche: null, cts: [], freq: null },
  obStep: 1,
  calY: new Date().getFullYear(),
  calM: new Date().getMonth(),
  cal: {},
  done: {},
  edits: {},
  metrics: [],
  streak: 0,
  best: 0,
  openKey: null,
  aiInited: false,
  dark: localStorage.getItem('st_dark') === 'true',
};

// ═══════════════════════════════════════════════════════
// PERSISTENCE
// ═══════════════════════════════════════════════════════
function dbLoad() {
  try {
    DB.session = localStorage.getItem('st_session') || null;
  } catch (e) {
    DB.session = null;
  }
}

function dbSave() {
  if (DB.session) localStorage.setItem('st_session', DB.session);
  else localStorage.removeItem('st_session');
}

async function uLoad() {
  if (!DB.user) return;
  try {
    // 1. Try loading from Supabase first
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('data')
      .eq('id', DB.user.id)
      .single();

    let d: any = null;

    if (!error && profile?.data) {
      console.log('Loaded data from Supabase');
      d = profile.data;
    } else {
      // 2. Fallback to local storage for migration or offline
      console.log('Supabase load failed or empty, trying local storage');
      const raw = localStorage.getItem('st_u_' + DB.user.id);
      if (raw) d = JSON.parse(raw);
    }

    if (!d) return;

    U.ob = d.ob || { plt: null, niche: null, cts: [], freq: null };
    U.cal = d.cal || {};
    U.done = d.done || {};
    U.edits = d.edits || {};
    U.metrics = d.metrics || [];
    U.obStep = d.obStep || 1;
    U.dark = d.dark !== undefined ? d.dark : (localStorage.getItem('st_dark') === 'true');
    const now = new Date();
    U.calY = now.getFullYear();
    U.calM = now.getMonth();
    applyDark();
  } catch (e) {
    console.error('Error in uLoad:', e);
  }
}

async function uSave() {
  if (!DB.user) return;
  const data = {
    ob: U.ob, cal: U.cal, done: U.done,
    edits: U.edits, metrics: U.metrics,
    obStep: U.obStep, dark: U.dark
  };

  // 1. Save locally for immediate persistence
  localStorage.setItem('st_u_' + DB.user.id, JSON.stringify(data));
  localStorage.setItem('st_dark', String(U.dark));

  // 2. Sync to Supabase (Upsert)
  try {
    const { error } = await supabase
      .from('profiles')
      .upsert({ 
        id: DB.user.id, 
        data: data,
        updated_at: new Date().toISOString()
      });
    
    if (error) {
      if (error.code === '42P01') {
        console.warn('Supabase "profiles" table not found. Data saved locally only.');
      } else {
        console.error('Supabase sync error:', error);
      }
    }
  } catch (e) {
    console.error('Supabase sync failed:', e);
  }
}

function applyDark() {
  if (U.dark) document.documentElement.classList.add('dark');
  else document.documentElement.classList.remove('dark');
  
  const icons = ['darkIcon', 'darkIcon2', 'darkIcon3'];
  const texts = ['darkTxt', 'darkTxt2', 'darkTxt3'];
  
  icons.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = U.dark ? '☀️' : '🌙';
  });
  texts.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = U.dark ? 'Light Mode' : 'Dark Mode';
  });
}

function toggleDark() {
  U.dark = !U.dark;
  uSave();
  applyDark();
}

function resetU() {
  U.ob = { plt: null, niche: null, cts: [], freq: null };
  U.obStep = 1;
  U.calY = new Date().getFullYear();
  U.calM = new Date().getMonth();
  U.cal = {};
  U.done = {};
  U.edits = {};
  U.metrics = [];
  U.streak = 0;
  U.best = 0;
  U.openKey = null;
  U.aiInited = false;
}

// ═══════════════════════════════════════════════════════
// UI UTILITIES
// ═══════════════════════════════════════════════════════
function showPage(name: string) {
  // Hide all pages first
  document.querySelectorAll('.pg').forEach(p => {
    p.classList.remove('active');
  });

  // Show the target page
  const el = document.getElementById('pg-' + name);
  if (el) {
    el.classList.add('active');
    // Scroll to top on page change
    window.scrollTo(0, 0);
  } else {
    console.error(`Page pg-${name} not found`);
  }
}

function confetti() {
  const wrap = document.getElementById('confWrap')!;
  const colors = ['#6C5CE7', '#10B981', '#F97316', '#2563EB', '#EF4444'];
  for (let i = 0; i < 50; i++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.left = Math.random() * 100 + 'vw';
    c.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    c.style.width = (Math.random() * 8 + 4) + 'px';
    c.style.height = (Math.random() * 8 + 4) + 'px';
    c.style.animationDuration = (Math.random() * 2 + 1) + 's';
    c.style.animationDelay = (Math.random() * 0.5) + 's';
    wrap.appendChild(c);
    setTimeout(() => c.remove(), 3000);
  }
}

function showToast(msg: string) {
  const t = document.getElementById('toast')!;
  t.textContent = msg;
  t.classList.add('on');
  setTimeout(() => t.classList.remove('on'), 2800);
}

interface ModalOptions {
  title: string;
  desc: string;
  icon?: string;
  input?: string;
  confirmTxt?: string;
  cancelTxt?: string;
}

function openModal(opts: ModalOptions): Promise<string | boolean> {
  return new Promise((resolve) => {
    const ov = document.getElementById('modalOv')!;
    const title = document.getElementById('modalTitle')!;
    const desc = document.getElementById('modalDesc')!;
    const icon = document.getElementById('modalIcon')!;
    const input = document.getElementById('modalInput') as HTMLInputElement;
    const confirm = document.getElementById('modalConfirm')!;
    const cancel = document.getElementById('modalCancel')!;

    title.textContent = opts.title;
    desc.textContent = opts.desc;
    icon.textContent = opts.icon || '✦';
    
    if (opts.input !== undefined) {
      input.classList.remove('hidden');
      input.value = opts.input;
    } else {
      input.classList.add('hidden');
    }

    confirm.textContent = opts.confirmTxt || 'Confirm';
    cancel.textContent = opts.cancelTxt || 'Cancel';

    const cleanup = () => {
      ov.classList.remove('show');
      confirm.replaceWith(confirm.cloneNode(true));
      cancel.replaceWith(cancel.cloneNode(true));
    };

    document.getElementById('modalConfirm')!.addEventListener('click', () => {
      const val = opts.input !== undefined ? (document.getElementById('modalInput') as HTMLInputElement).value : true;
      cleanup();
      resolve(val);
    });

    document.getElementById('modalCancel')!.addEventListener('click', () => {
      cleanup();
      resolve(false);
    });

    ov.classList.add('show');
  });
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// ═══════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════
let authMode: 'login' | 'signup' = 'login';

function toggleAuthMode() {
  authMode = authMode === 'login' ? 'signup' : 'login';
  const nameGrp = document.getElementById('nameGrp')!;
  const authBtn = document.getElementById('authBtn')!;
  const toggleTxt = document.getElementById('toggleTxt')!;
  const toggleLnk = document.getElementById('toggleAuthMode')!;

  if (authMode === 'signup') {
    nameGrp.style.display = 'block';
    authBtn.textContent = 'Create Account';
    toggleTxt.textContent = 'Already have an account?';
    toggleLnk.textContent = 'Sign in →';
  } else {
    nameGrp.style.display = 'none';
    authBtn.textContent = 'Sign in';
    toggleTxt.textContent = "Don't have an account?";
    toggleLnk.textContent = 'Create one →';
  }
}

async function handleAuth() {
  const email = (document.getElementById('emailIn') as HTMLInputElement).value.trim().toLowerCase();
  const pass = (document.getElementById('passIn') as HTMLInputElement).value;
  const authErr = document.getElementById('authErr')!;
  const authBtn = document.getElementById('authBtn') as HTMLButtonElement;

  if (!email || pass.length < 6) {
    authErr.textContent = 'Please fill all fields correctly.';
    authErr.classList.add('show');
    return;
  }

  authBtn.disabled = true;
  authBtn.textContent = 'Processing...';

  try {
    if (authMode === 'signup') {
      const name = (document.getElementById('nameIn') as HTMLInputElement).value.trim();
      if (!name) {
        authErr.textContent = 'Please enter your name.';
        authErr.classList.add('show');
        return;
      }
      const { data, error } = await supabase.auth.signUp({
        email,
        password: pass,
        options: {
          data: { full_name: name }
        }
      });
      if (error) throw error;
      if (data.user) {
        showToast('Account created! Please check your email for verification.');
        // Supabase might auto-login depending on settings, but we'll wait for onAuthStateChange
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password: pass,
      });
      if (error) throw error;
    }
  } catch (e: any) {
    authErr.textContent = e.message || 'Authentication failed.';
    authErr.classList.add('show');
  } finally {
    authBtn.disabled = false;
    authBtn.textContent = authMode === 'signup' ? 'Create Account' : 'Sign in';
  }
}

async function handleGoogleAuth() {
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    });
    if (error) throw error;
  } catch (e: any) {
    const authErr = document.getElementById('authErr')!;
    authErr.textContent = e.message || 'Google Auth failed.';
    authErr.classList.add('show');
  }
}

async function doLogin(user: any) {
  DB.session = user.id;
  DB.user = {
    id: user.id,
    email: user.email || '',
    name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User'
  };
  dbSave();
  resetU();
  await uLoad(); // Wait for data to load from Supabase
  updateNavUser();
  const onboarded = U.ob.plt && U.ob.niche && U.ob.cts.length > 0 && U.ob.freq;
  if (onboarded) {
    goto('dash');
  } else {
    U.obStep = 1;
    showPage('ob');
    renderOb();
  }
}

function updateNavUser() {
  if (!DB.user) return;
  const name = DB.user.name;
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  ['sbAv1', 'sbAv2', 'sbAv3'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = initials;
  });
  ['sbName1', 'sbName2', 'sbName3'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = name;
  });
}

// ═══════════════════════════════════════════════════════
// ONBOARDING
// ═══════════════════════════════════════════════════════
const PLATFORMS = [
  { v: 'instagram', label: 'Instagram', icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>' },
  { v: 'linkedin', label: 'LinkedIn', icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path><rect x="2" y="9" width="4" height="12"></rect><circle cx="4" cy="4" r="2"></circle></svg>' },
  { v: 'youtube', label: 'YouTube', icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.42a2.78 2.78 0 0 0-1.94 2C1 8.14 1 12 1 12s0 3.86.42 5.58a2.78 2.78 0 0 0 1.94 2c1.71.42 8.6.42 8.6.42s6.88 0 8.6-.42a2.78 2.78 0 0 0 1.94-2C23 15.86 23 12 23 12s0-3.86-.42-5.58z"></path><polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02"></polygon></svg>' },
  { v: 'twitter', label: 'X (Twitter)', icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4l11.733 16h4.267l-11.733 -16zM4 20l6.768 -6.768M12.466 12.466l7.534 7.534"></path></svg>' },
  { v: 'tiktok', label: 'TikTok', icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5"></path></svg>' },
  { v: 'threads', label: 'Threads', icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"></path><path d="M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"></path><path d="M12 8c2.5 0 4.5 2 4.5 4.5s-2 4.5-4.5 4.5s-4.5-2-4.5-4.5s2-4.5 4.5-4.5z"></path></svg>' },
];

const NICHES = [
  '🧘 Lifestyle & Wellness', '💪 Fitness & Health', '💻 Tech & AI', '💰 Personal Finance', 
  '✈️ Luxury Travel', '👗 Sustainable Fashion', '🍳 Gourmet Food', '🎓 Online Education', 
  '🚀 SaaS Business', '📈 Digital Marketing', '🎮 Gaming & Esports', '🧠 Mental Health',
  '🏠 Real Estate', '🪙 Crypto & Web3', '👶 Parenting', '📸 Photography',
  '🎨 Art & Design', '🎵 Music & Audio', '🚗 Automotive', '🐾 Pets & Animals'
];

const CONTENT_TYPES: Record<string, Array<{ v: string; i: string; s: string }>> = {
  instagram: [
    { v: 'Reels', i: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2" ry="2"></rect><path d="M2 8h20"></path><path d="M2 16h20"></path><path d="M8 2v20"></path><path d="M16 2v20"></path></svg>', s: 'Short-form video' },
    { v: 'Carousel', i: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="16" height="16" rx="2" ry="2"></rect><path d="M6 22h16a2 2 0 0 0 2-2V6"></path></svg>', s: 'Educational slides' },
    { v: 'Static Post', i: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>', s: 'Single high-quality image' },
    { v: 'Stories', i: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 8v8"></path><path d="M8 12h8"></path></svg>', s: 'Behind the scenes' },
    { v: 'Guide', i: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>', s: 'Curated resources' },
  ],
  linkedin: [
    { v: 'Text Post', i: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>', s: 'Thought leadership' },
    { v: 'Carousel', i: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="16" height="16" rx="2" ry="2"></rect><path d="M6 22h16a2 2 0 0 0 2-2V6"></path></svg>', s: 'Document slides' },
    { v: 'Poll', i: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"></line><line x1="18" y1="20" x2="18" y2="4"></line><line x1="6" y1="20" x2="6" y2="16"></line></svg>', s: 'Market research' },
    { v: 'Article', i: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v16H4z"></path><path d="M8 8h8"></path><path d="M8 12h8"></path><path d="M8 16h5"></path></svg>', s: 'Long-form content' },
  ],
  youtube: [
    { v: 'Shorts', i: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path></svg>', s: 'Viral vertical video' },
    { v: 'Long Video', i: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line><line x1="17" y1="17" x2="22" y2="17"></line><line x1="17" y1="7" x2="22" y2="7"></line></svg>', s: 'Deep dive tutorials' },
    { v: 'Community Post', i: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 1 1-7.6-10.6 8.5 8.5 0 0 1 7 3.7"></path></svg>', s: 'Audience engagement' },
  ],
  twitter: [
    { v: 'Text Post', i: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>', s: 'Quick insights' },
    { v: 'Thread', i: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>', s: 'Storytelling chains' },
    { v: 'Poll', i: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"></line><line x1="18" y1="20" x2="18" y2="4"></line><line x1="6" y1="20" x2="6" y2="16"></line></svg>', s: 'Feedback' },
  ],
  tiktok: [
    { v: 'Video', i: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5"></path></svg>', s: 'Short-form viral' },
    { v: 'Carousel', i: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="16" height="16" rx="2" ry="2"></rect><path d="M6 22h16a2 2 0 0 0 2-2V6"></path></svg>', s: 'Photo mode' },
  ],
  threads: [
    { v: 'Text Post', i: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 1 1-7.6-10.6 8.5 8.5 0 0 1 7 3.7"></path><polyline points="16 12 12 8 8 12"></polyline><line x1="12" y1="16" x2="12" y2="8"></line></svg>', s: 'Conversational updates' },
  ],
};

function renderOb() {
  const s = U.obStep;
  ['ob-s1', 'ob-s2', 'ob-s3', 'ob-s4'].forEach((id, i) => {
    const el = document.getElementById(id)!;
    if (i + 1 === s) {
      el.style.display = 'block';
      el.style.animation = 'fadeUp 0.4s ease both';
    } else {
      el.style.display = 'none';
    }
  });
  document.getElementById('obFill')!.style.width = (s / 4 * 100) + '%';
  document.getElementById('obBackBtn')!.style.visibility = s > 1 ? 'visible' : 'hidden';
  document.getElementById('obNextBtn')!.textContent = s < 4 ? 'Continue →' : 'Generate Calendar →';
  document.getElementById('obLbl')!.textContent = `Step ${s} of 4`;

  // Validation check
  let isValid = false;
  if (s === 1) {
    isValid = !!U.ob.plt;
    buildPltGrid();
  }
  if (s === 2) {
    isValid = !!U.ob.niche;
    buildNicheGrid();
  }
  if (s === 3) {
    isValid = U.ob.cts.length > 0;
    buildCTGrid();
  }
  if (s === 4) {
    isValid = !!U.ob.freq;
    ['freq3', 'freq5', 'freq7'].forEach(id => {
      const el = document.getElementById(id)!;
      const v = parseInt(el.dataset.v!);
      if (U.ob.freq === v) el.classList.add('sel');
      else el.classList.remove('sel');
    });
  }

  const nextBtn = document.getElementById('obNextBtn') as HTMLButtonElement;
  if (isValid) {
    nextBtn.disabled = false;
    nextBtn.style.opacity = '1';
  } else {
    nextBtn.disabled = true;
    nextBtn.style.opacity = '0.5';
  }
}

function buildPltGrid() {
  const g = document.getElementById('pltGrid')!;
  g.innerHTML = PLATFORMS.map(p =>
    `<div class="oc${U.ob.plt === p.v ? ' sel' : ''}" data-v="${p.v}">
      <div class="oc-icon">${p.icon}</div>
      <div class="oc-label">${p.label}</div>
    </div>`
  ).join('');
  g.querySelectorAll('.oc').forEach(el => el.addEventListener('click', (e) => {
    const v = (e.currentTarget as HTMLElement).dataset.v!;
    U.ob.plt = v;
    U.ob.cts = [];
    renderOb();
  }));
}

function buildNicheGrid() {
  const g = document.getElementById('nicheGrid')!;
  const isCustom = U.ob.niche && !NICHES.includes(U.ob.niche);
  
  g.innerHTML = NICHES.map(n =>
    `<div class="oc${U.ob.niche === n ? ' sel' : ''}" data-v="${n}">
      <div class="oc-label">${n}</div>
    </div>`
  ).join('') + `<div class="oc${isCustom ? ' sel' : ''}" data-v="Custom"><div class="oc-label">Custom</div></div>`;
  
  g.querySelectorAll('.oc').forEach(el => el.addEventListener('click', (e) => {
    const v = (e.currentTarget as HTMLElement).dataset.v!;
    if (v === 'Custom') {
      const row = document.getElementById('customRow')!;
      row.classList.add('show');
      const input = document.getElementById('customIn') as HTMLInputElement;
      input.focus();
      input.oninput = () => {
        U.ob.niche = input.value.trim();
        renderOb();
      };
    } else {
      U.ob.niche = v;
      document.getElementById('customRow')!.classList.remove('show');
      renderOb();
    }
  }));
}

function buildCTGrid() {
  const plt = U.ob.plt || 'instagram';
  const types = CONTENT_TYPES[plt] || CONTENT_TYPES.instagram;
  const g = document.getElementById('ctGrid')!;
  g.innerHTML = types.map(t => {
    const isSel = U.ob.cts.includes(t.v);
    return `<div class="oc ct-card${isSel ? ' sel' : ''}" data-v="${t.v}">
      <div class="ct-check">${isSel ? '✓' : ''}</div>
      <div class="oc-icon">${t.i}</div><div class="oc-label">${t.v}</div><div class="oc-sub">${t.s}</div>
    </div>`;
  }).join('');
  g.querySelectorAll('.oc').forEach(el => el.addEventListener('click', (e) => {
    const v = (e.currentTarget as HTMLElement).dataset.v!;
    const idx = U.ob.cts.indexOf(v);
    if (idx >= 0) U.ob.cts.splice(idx, 1);
    else U.ob.cts.push(v);
    renderOb();
  }));
}

async function startGeneration(theme?: string, tone?: string) {
  console.log("Starting generation for:", { theme, tone, month: MONTHS[U.calM], year: U.calY });
  showPage('gen');
  const steps = ['gs1', 'gs2', 'gs3'];
  steps.forEach(id => {
    const el = document.getElementById(id)!.parentElement!;
    el.style.opacity = '0.3';
  });

  try {
    // Step 1
    console.log("Step 1: Calling Gemini API...");
    document.getElementById('gs1')!.parentElement!.style.opacity = '1';
    
    const posts = await GeminiService.generateMonthlyPlan({
      platform: U.ob.plt!,
      niche: U.ob.niche!,
      contentTypes: U.ob.cts,
      frequency: U.ob.freq!,
      month: MONTHS[U.calM],
      year: U.calY,
      theme,
      tone
    });

    console.log(`Generated ${posts.length} posts.`);

    // Step 2
    console.log("Step 2: Updating local calendar state...");
    document.getElementById('gs2')!.parentElement!.style.opacity = '1';
    
    // Only clear posts for the current month being generated
    const monthPrefix = `${U.calY}-${String(U.calM + 1).padStart(2, '0')}`;
    console.log(`Clearing posts starting with prefix: ${monthPrefix}`);
    Object.keys(U.cal).forEach(key => {
      if (key.startsWith(monthPrefix)) {
        delete U.cal[key];
      }
    });

    posts.forEach(p => {
      U.cal[p.key] = p;
    });
    
    // Step 3
    console.log("Step 3: Saving and finalizing...");
    document.getElementById('gs3')!.parentElement!.style.opacity = '1';
    
    uSave();
    renderCal(); // Ensure calendar is re-rendered with new posts
    confetti();
    showToast('Calendar ready! 🚀');
    goto('dash');
  } catch (e: any) {
    console.error("Generation error:", e);
    const msg = e.message || "AI Generation failed. Please try again.";
    showToast(msg);
    showPage('ob');
  }
}

// ═══════════════════════════════════════════════════════
// CALENDAR
// ═══════════════════════════════════════════════════════
function renderCal() {
  const y = U.calY, m = U.calM;
  document.getElementById('calMonthLbl')!.textContent = MONTHS[m] + ' ' + y;
  document.getElementById('calMeta')!.textContent = `${U.ob.plt} • ${U.ob.niche}`;
  
  const grid = document.getElementById('calGrid')!;
  const firstDOW = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  
  let html = '';
  for (let i = 0; i < firstDOW; i++) html += '<div class="cal-cell other"></div>';
  
  const todayStr = new Date().toISOString().split('T')[0];
  const upcoming: Post[] = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const post = U.cal[key];
    const isDone = U.done[key];
    const isToday = key === todayStr;
    
    if (post && !isDone && key >= todayStr) {
      upcoming.push(post);
    }

    html += `
      <div class="cal-cell ${post ? 'has-post' : ''} ${isToday ? 'today' : ''} ${isDone ? 'done' : ''}" data-key="${key}">
        <div class="cal-num">${d}</div>
        ${post ? `
          <div class="cal-content-area">
            <div class="cal-hook-txt">${post.hook}</div>
          </div>
          <div class="ct-tag" data-ct="${post.ct}">${post.ct}</div>
        ` : ''}
        <div class="cal-flame">🔥</div>
      </div>
    `;
  }
  
  grid.innerHTML = html;
  grid.querySelectorAll('.has-post').forEach(el => el.addEventListener('click', (e) => {
    openSP((e.currentTarget as HTMLElement).dataset.key!);
  }));

  // Render Upcoming
  const ucList = document.getElementById('ucList')!;
  ucList.innerHTML = upcoming.slice(0, 5).map(p => `
    <div class="uc-item" data-key="${p.key}">
      <div class="uc-date">${p.key.split('-')[2]} ${MONTHS[parseInt(p.key.split('-')[1]) - 1].slice(0, 3)}</div>
      <div class="uc-info">
        <div class="uc-hook">${p.hook}</div>
        <div class="ct-tag" data-ct="${p.ct}">${p.ct}</div>
      </div>
    </div>
  `).join('') || '<div style="padding:20px;text-align:center;color:var(--muted);font-size:13px;">No upcoming posts.</div>';
  ucList.querySelectorAll('.uc-item').forEach(el => el.addEventListener('click', (e) => {
    openSP((e.currentTarget as HTMLElement).dataset.key!);
  }));
}

function openSP(key: string) {
  const post = U.cal[key];
  if (!post) return;
  U.openKey = key;
  
  const todayStr = new Date().toISOString().split('T')[0];
  const isFuture = key > todayStr;
  
  document.getElementById('spMeta')!.textContent = post.ct;
  document.getElementById('spTitle')!.textContent = post.hook;
  document.getElementById('spHook')!.textContent = post.hook;
  (document.getElementById('spCap') as HTMLTextAreaElement).value = U.edits[key]?.cap || post.cap;
  document.getElementById('spCTA')!.textContent = post.cta;
  document.getElementById('spTags')!.innerHTML = post.tags.map(t => `<span class="sp-tag">${t}</span>`).join('');
  
  const markBtn = document.getElementById('spMarkBtn') as HTMLButtonElement;
  const metricsBtn = document.getElementById('btnLogMetrics')!;
  const futureWarn = document.getElementById('spFutureWarn')!;
  
  if (isFuture) {
    futureWarn.classList.remove('hidden');
    markBtn.disabled = true;
    markBtn.style.opacity = '0.5';
    markBtn.title = "You can only mark today's or past posts as complete.";
  } else {
    futureWarn.classList.add('hidden');
    markBtn.disabled = false;
    markBtn.style.opacity = '1';
    markBtn.title = "";
  }

  if (U.done[key]) {
    markBtn.textContent = '✓ Done';
    markBtn.classList.add('done');
    metricsBtn.classList.remove('hidden');
  } else {
    markBtn.textContent = '🔥 Mark Done';
    markBtn.classList.remove('done');
    metricsBtn.classList.add('hidden');
  }

  document.getElementById('spOv')!.classList.add('on');
  document.getElementById('sp')!.classList.add('on');
}

function toggleDone() {
  if (!U.openKey) return;
  
  const todayStr = new Date().toISOString().split('T')[0];
  if (U.openKey > todayStr) {
    showToast("⚠️ You can only mark today's or past posts as complete.");
    return;
  }

  U.done[U.openKey] = !U.done[U.openKey];
  uSave();
  calcStreak();
  updateStats();
  renderCal();
  
  if (U.done[U.openKey] && U.streak > 0) {
    if (U.streak % 3 === 0) {
      sendMilestoneEmail(U.streak);
    }
    if (U.streak % 7 === 0) {
      confetti();
      showToast(`🔥 ${U.streak}-Day Streak Reached! You are unstoppable!`);
    }
  }

  // Update UI in side panel without closing it
  const markBtn = document.getElementById('spMarkBtn')!;
  const metricsBtn = document.getElementById('btnLogMetrics')!;
  if (U.done[U.openKey]) {
    markBtn.textContent = '✓ Done';
    markBtn.classList.add('done');
    metricsBtn.classList.remove('hidden');
  } else {
    markBtn.textContent = '🔥 Mark Done';
    markBtn.classList.remove('done');
    metricsBtn.classList.add('hidden');
  }
}

async function sendMilestoneEmail(streak: number) {
  if (!DB.user) return;
  const user = DB.user;

  try {
    const res = await fetch('/api/milestone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: user.email,
        name: user.name,
        streak: streak
      })
    });
    
    let data;
    const contentType = res.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      data = await res.json();
    } else {
      const text = await res.text();
      console.error("Non-JSON response from server:", text);
      // If it's a 404, the server might not be serving the API correctly
      if (res.status === 404) {
        showToast(`⚠️ API Route not found (404). Check server logs.`);
      } else {
        showToast(`⚠️ Server error (${res.status}). Check console.`);
      }
      return;
    }

    if (res.ok) {
      showToast(`📧 Milestone email sent!`);
    } else {
      console.error("Email failed:", data.error);
      showToast(`⚠️ Email failed: ${data.error || 'Unknown error'}`);
    }
  } catch (e: any) {
    console.error("Failed to send milestone email", e);
    showToast(`⚠️ Connection error sending email.`);
  }
}

function calcStreak() {
  const today = new Date().toISOString().split('T')[0];
  const doneKeys = Object.keys(U.done).filter(k => U.done[k]).sort().reverse();
  
  let streak = 0;
  let current = new Date(today);
  
  for (const key of doneKeys) {
    const d = new Date(key);
    const diff = (current.getTime() - d.getTime()) / (1000 * 3600 * 24);
    if (diff <= 1) {
      streak++;
      current = d;
    } else break;
  }
  U.streak = streak;
  U.best = Math.max(U.best, streak);
}

function updateStats() {
  const planned = Object.keys(U.cal).length;
  const done = Object.keys(U.done).filter(k => U.done[k]).length;
  const pct = planned ? Math.round((done / planned) * 100) : 0;
  const totalViews = U.metrics.reduce((acc, m) => acc + m.views, 0);

  document.getElementById('streakVal')!.textContent = String(U.streak);
  document.getElementById('qPlanned')!.textContent = String(planned);
  document.getElementById('qDone')!.textContent = String(done);
  document.getElementById('qPct')!.textContent = pct + '%';
  document.getElementById('qBest')!.textContent = String(U.best);
  
  // Streak Details
  const streakStatus = document.getElementById('streakStatus');
  const streakNext = document.getElementById('streakNext');
  if (streakStatus) {
    if (U.streak >= 21) streakStatus.textContent = '👑 Unstoppable!';
    else if (U.streak >= 14) streakStatus.textContent = '💎 Elite Consistency';
    else if (U.streak >= 7) streakStatus.textContent = '🔥 On fire!';
    else if (U.streak > 0) streakStatus.textContent = '⚡ Building up';
    else streakStatus.textContent = '❄️ Cold';
  }
  if (streakNext) {
    const nextMilestone = Math.ceil((U.streak + 1) / 3) * 3;
    streakNext.textContent = `Next milestone: ${nextMilestone} days 🏆`;
  }

  // Dashboard Summary
  const dsViews = document.getElementById('dsViews');
  if (dsViews) dsViews.textContent = totalViews.toLocaleString();
  const dsStreak = document.getElementById('dsStreak');
  if (dsStreak) dsStreak.textContent = U.streak + 'd';
  const dsGoal = document.getElementById('dsGoal');
  if (dsGoal) {
    if (totalViews > 10000) dsGoal.textContent = 'Authority';
    else if (totalViews > 1000) dsGoal.textContent = 'Trust';
    else dsGoal.textContent = 'Awareness';
  }

  const bar = document.getElementById('streakBar')!;
  bar.style.width = Math.min(100, (U.streak / 7) * 100) + '%';
}

// ═══════════════════════════════════════════════════════
// AI ASSISTANT
// ═══════════════════════════════════════════════════════
async function sendAI() {
  const input = document.getElementById('aiIn') as HTMLInputElement;
  const msg = input.value.trim();
  if (!msg) return;
  input.value = '';

  const msgs = document.getElementById('aiMsgs')!;
  msgs.innerHTML += `<div class="ai-msg u"><div class="ai-bub usr">${msg}</div></div>`;
  
  const typing = document.createElement('div');
  typing.className = 'ai-msg';
  typing.innerHTML = '<div class="ai-bub bot">Thinking...</div>';
  msgs.appendChild(typing);
  msgs.scrollTop = msgs.scrollHeight;

  try {
    const reply = await GeminiService.chat(msg, {
      plt: U.ob.plt,
      niche: U.ob.niche,
      cts: U.ob.cts,
      metrics: U.metrics
    });
    typing.remove();
    msgs.innerHTML += `<div class="ai-msg"><div class="ai-bub bot">${reply}</div></div>`;
  } catch (e: any) {
    typing.textContent = e.message || "Error connecting to AI.";
  }
  msgs.scrollTop = msgs.scrollHeight;
}

function renderAnalytics() {
  const main = document.getElementById('anMain')!;
  const doneKeys = Object.keys(U.done).filter(k => U.done[k]).sort().reverse();
  const totalDone = doneKeys.length;
  const totalPlanned = Object.keys(U.cal).length;
  const pct = totalPlanned ? Math.round((totalDone / totalPlanned) * 100) : 0;

  const totalViews = U.metrics.reduce((acc, m) => acc + m.views, 0);
  const totalLikes = U.metrics.reduce((acc, m) => acc + m.likes, 0);

  main.innerHTML = `
    <div class="an-header">
      <h1 class="an-title">Growth Analytics</h1>
      <p class="an-sub">Tracking your progress in the ${U.ob.niche} niche on ${U.ob.plt}.</p>
    </div>
    
    <div class="an-grid">
      <div class="an-card">
        <div class="an-card-lbl">Posts Completed</div>
        <div class="an-card-val">${totalDone}</div>
        <div class="an-card-sub">Total posts marked as done</div>
      </div>
      <div class="an-card">
        <div class="an-card-lbl">Completion Rate</div>
        <div class="an-card-val">${pct}%</div>
        <div class="an-card-sub">Of planned posts finished</div>
      </div>
      <div class="an-card">
        <div class="an-card-lbl">Current Streak</div>
        <div class="an-card-val">${U.streak}d</div>
        <div class="an-card-sub">Consistency is key</div>
      </div>
    </div>

    <div class="an-chart-box">
      <div class="an-chart-head">
        <div class="an-chart-title">Log Metrics for a Completed Post</div>
        <p style="font-size:12px;color:var(--muted);margin-top:4px;">Enter the actual numbers from your platform.</p>
      </div>
      <div class="log-form">
        <div class="log-grid">
          <div>
            <label class="log-lbl">Post Date</label>
            <select class="log-sel" id="logDate">
              ${doneKeys.map(k => `<option value="${k}">${k} - ${U.cal[k]?.hook.slice(0, 20)}...</option>`).join('') || '<option disabled>No completed posts yet</option>'}
            </select>
          </div>
          <div>
            <label class="log-lbl">Views / Impressions</label>
            <input class="log-input" id="logViews" type="number" placeholder="e.g. 1200">
          </div>
          <div>
            <label class="log-lbl">Likes</label>
            <input class="log-input" id="logLikes" type="number" placeholder="e.g. 84">
          </div>
          <div>
            <label class="log-lbl">Comments</label>
            <input class="log-input" id="logComments" type="number" placeholder="e.g. 12">
          </div>
          <div>
            <label class="log-lbl">Saves</label>
            <input class="log-input" id="logSaves" type="number" placeholder="e.g. 43">
          </div>
        </div>
        <button class="btn-sm2" id="btnSaveMetrics">Save Metrics</button>
      </div>
    </div>

    <div class="an-chart-box" style="margin-top:24px;">
      <div class="an-chart-head">
        <div class="an-chart-title">Engagement Progress</div>
      </div>
      <div class="an-chart-body" id="anChart">
        ${U.metrics.length > 0 ? `
          <div style="height:200px;display:flex;align-items:flex-end;gap:12px;padding:20px 0;">
            ${U.metrics.slice(-7).map(m => {
              const h = Math.max(10, Math.min(100, (m.views / (Math.max(...U.metrics.map(x => x.views)) || 1)) * 100));
              return `<div style="flex:1;background:var(--accent);height:${h}%;border-radius:4px 4px 0 0;opacity:0.8;position:relative;" title="${m.views} views">
                <div style="position:absolute;top:-20px;left:50%;transform:translateX(-50%);font-size:10px;font-weight:700;">${m.views}</div>
              </div>`;
            }).join('')}
          </div>
          <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);">
            ${U.metrics.slice(-7).map(m => `<span>${m.date.split('-')[2]}</span>`).join('')}
          </div>
        ` : `
          <div style="height:200px;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:14px;">
            Log metrics for your completed posts to see growth charts.
          </div>
        `}
      </div>
    </div>

    <div class="an-chart-box" style="margin-top:24px;">
      <div class="an-chart-head">
        <div class="an-chart-title">Logged Metrics History</div>
      </div>
      <div class="metrics-list">
        ${U.metrics.length > 0 ? U.metrics.map((m, i) => `
          <div class="metric-row">
            <div class="metric-date">${m.date}</div>
            <div class="metric-vals">👁️ ${m.views.toLocaleString()} • ❤️ ${m.likes.toLocaleString()} • 💬 ${m.comments} • 🔖 ${m.saves}</div>
            <button class="metric-del" data-idx="${i}">Delete</button>
          </div>
        `).join('') : '<div class="empty-note">No metrics logged yet.</div>'}
      </div>
    </div>
  `;

  main.querySelector('#btnSaveMetrics')?.addEventListener('click', () => {
    const date = (document.getElementById('logDate') as HTMLSelectElement).value;
    const views = parseInt((document.getElementById('logViews') as HTMLInputElement).value) || 0;
    const likes = parseInt((document.getElementById('logLikes') as HTMLInputElement).value) || 0;
    const comments = parseInt((document.getElementById('logComments') as HTMLInputElement).value) || 0;
    const saves = parseInt((document.getElementById('logSaves') as HTMLInputElement).value) || 0;

    if (!date || date === 'No completed posts yet') {
      showToast('Please select a completed post date.');
      return;
    }

    const existingIdx = U.metrics.findIndex(m => m.date === date);
    const newMetric = { date, views, likes, comments, saves };

    if (existingIdx >= 0) {
      U.metrics[existingIdx] = newMetric;
    } else {
      U.metrics.push(newMetric);
    }
    
    uSave();
    showToast('Metrics logged! 📊');
    renderAnalytics();
  });

  main.querySelectorAll('.metric-del').forEach(el => el.addEventListener('click', (e) => {
    const idx = parseInt((e.currentTarget as HTMLElement).dataset.idx!);
    U.metrics.splice(idx, 1);
    uSave();
    renderAnalytics();
  }));
}
// ═══════════════════════════════════════════════════════
function goto(page: string) {
  showPage(page);
  if (page === 'dash') {
    renderCal();
    calcStreak();
    updateStats();
  } else if (page === 'an') {
    renderAnalytics();
  } else if (page === 'ai' && !U.aiInited) {
    U.aiInited = true;
    document.getElementById('aiMsgs')!.innerHTML = '<div class="ai-msg"><div class="ai-bub bot">Hello! I am your SocialTrackr AI. How can I help you grow today?</div></div>';
    
    const chips = [
      { l: '✨ Improve a hook', m: 'Improve this hook: "' },
      { l: '✍️ Rewrite caption', m: 'Rewrite this caption: ' },
      { l: '🏷️ Hashtags', m: 'Give me 15 targeted hashtags for ' + U.ob.niche },
      { l: '💡 Content angles', m: 'Give me 3 content angles for ' + U.ob.niche },
    ];
    document.getElementById('aiChips')!.innerHTML = chips.map(c =>
      `<button class="ai-chip" data-msg="${c.m}">${c.l}</button>`
    ).join('');
    document.getElementById('aiChips')!.querySelectorAll('.ai-chip').forEach(el => el.addEventListener('click', (e) => {
      const msg = (e.currentTarget as HTMLElement).dataset.msg!;
      const input = document.getElementById('aiIn') as HTMLInputElement;
      input.value = msg;
      input.focus();
    }));
  }
}

// ═══════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════
function init() {
  dbLoad();
  applyDark();
  
  // Check Supabase Config
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    const authErr = document.getElementById('authErr')!;
    authErr.innerHTML = `
      <div style="background:var(--el); color:var(--err); padding:12px; border-radius:8px; font-size:13px; margin-bottom:16px; border:1px solid var(--err);">
        <strong>⚠️ Supabase Not Configured</strong><br>
        Please add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to your Secrets.
      </div>
    `;
    authErr.classList.add('show');
  }

  // Supabase Auth Listener
  supabase.auth.onAuthStateChange(async (event, session) => {
    console.log('Auth event:', event);
    if (session?.user) {
      await doLogin(session.user);
    } else {
      DB.session = null;
      DB.user = null;
      dbSave();
      resetU();
      showPage('login');
    }
    
    // Hide loading after initial auth check
    const loader = document.getElementById('app-loading');
    if (loader) {
      loader.style.opacity = '0';
      setTimeout(() => loader.remove(), 300);
    }
  });

  // Event Listeners
  document.getElementById('authBtn')?.addEventListener('click', handleAuth);
  document.getElementById('googleAuthBtn')?.addEventListener('click', handleGoogleAuth);
  document.getElementById('toggleAuthMode')?.addEventListener('click', toggleAuthMode);
  document.getElementById('obNextBtn')?.addEventListener('click', () => {
    if (U.obStep < 4) {
      U.obStep++;
      renderOb();
    } else startGeneration();
  });
  document.getElementById('obBackBtn')?.addEventListener('click', () => {
    if (U.obStep > 1) {
      U.obStep--;
      renderOb();
    }
  });
  
  document.getElementById('freq3')?.addEventListener('click', () => { U.ob.freq = 3; renderOb(); });
  document.getElementById('freq5')?.addEventListener('click', () => { U.ob.freq = 5; renderOb(); });
  document.getElementById('freq7')?.addEventListener('click', () => { U.ob.freq = 7; renderOb(); });
  
  document.getElementById('navDash')?.addEventListener('click', () => goto('dash'));
  document.getElementById('navAn')?.addEventListener('click', () => goto('an'));
  document.getElementById('navAi')?.addEventListener('click', () => goto('ai'));
  document.getElementById('navDash2')?.addEventListener('click', () => goto('dash'));
  document.getElementById('navAn2')?.addEventListener('click', () => goto('an'));
  document.getElementById('navAi2')?.addEventListener('click', () => goto('ai'));
  document.getElementById('navDash3')?.addEventListener('click', () => goto('dash'));
  document.getElementById('navAn3')?.addEventListener('click', () => goto('an'));
  
  const signOut = async () => {
    await supabase.auth.signOut();
  };
  document.getElementById('navSignOut')?.addEventListener('click', signOut);
  document.getElementById('navSignOut2')?.addEventListener('click', signOut);
  document.getElementById('navSignOut3')?.addEventListener('click', signOut);

  document.getElementById('btnToggleDark')?.addEventListener('click', toggleDark);
  document.getElementById('btnToggleDark2')?.addEventListener('click', toggleDark);
  document.getElementById('btnToggleDark3')?.addEventListener('click', toggleDark);
  
  document.getElementById('aiIn')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendAI();
  });
  document.getElementById('btnSendAI')?.addEventListener('click', sendAI);
  
  document.getElementById('btnPrevMonth')?.addEventListener('click', () => {
    U.calM--;
    if (U.calM < 0) { U.calM = 11; U.calY--; }
    renderCal();
  });
  document.getElementById('btnNextMonth')?.addEventListener('click', () => {
    U.calM++;
    if (U.calM > 11) { U.calM = 0; U.calY++; }
    renderCal();
  });
  document.getElementById('btnRegen')?.addEventListener('click', async () => {
    const theme = await openModal({
      title: 'Regenerate Calendar',
      desc: "Choose a theme for this month's strategy:",
      input: 'Educational & Authority',
      confirmTxt: 'Next',
      icon: '↻'
    });
    if (theme === false) return;

    const tone = await openModal({
      title: 'Select Tone',
      desc: "How should the AI sound? (e.g. Witty, Professional, Bold)",
      input: 'Professional & Actionable',
      confirmTxt: 'Regenerate',
      icon: '🎭'
    });
    if (tone === false) return;

    await startGeneration(theme as string, tone as string);
  });
  
  document.getElementById('btnSaveSP')?.addEventListener('click', () => {
    if (!U.openKey) return;
    U.edits[U.openKey] = {
      cap: (document.getElementById('spCap') as HTMLTextAreaElement).value,
      notes: (document.getElementById('spNotes') as HTMLTextAreaElement).value,
    };
    uSave();
    showToast('✓ Saved');
    document.getElementById('spOv')!.classList.remove('on');
    document.getElementById('sp')!.classList.remove('on');
  });

  document.getElementById('btnAiHelp')?.addEventListener('click', async () => {
    const post = U.cal[U.openKey!];
    if (!post) return;
    
    goto('ai');
    const input = document.getElementById('aiIn') as HTMLInputElement;
    input.value = `Help me improve this ${post.ct} post about ${post.niche}: "${post.hook}"`;
    input.focus();
    
    // Automatically send the message
    await sendAI();
  });
  document.getElementById('spMarkBtn')?.addEventListener('click', toggleDone);
  
  document.getElementById('btnLogMetrics')?.addEventListener('click', async () => {
    if (!U.openKey) return;
    const views = await openModal({
      title: 'Log Views',
      desc: 'How many views did this post get?',
      input: '0',
      confirmTxt: 'Next'
    });
    if (views === false) return;
    
    const likes = await openModal({
      title: 'Log Likes',
      desc: 'How many likes did this post get?',
      input: '0',
      confirmTxt: 'Save Metrics'
    });
    if (likes === false) return;

    // Update existing or push new
    const existingIdx = U.metrics.findIndex(m => m.date === U.openKey);
    const newMetric = {
      date: U.openKey!,
      views: parseInt(views as string) || 0,
      likes: parseInt(likes as string) || 0,
      comments: 0,
      saves: 0
    };

    if (existingIdx >= 0) {
      U.metrics[existingIdx] = newMetric;
    } else {
      U.metrics.push(newMetric);
    }
    
    uSave();
    showToast('Metrics logged! 📊');
    renderAnalytics();
  });

  document.getElementById('btnCloseSP')?.addEventListener('click', () => {
    document.getElementById('spOv')!.classList.remove('on');
    document.getElementById('sp')!.classList.remove('on');
  });
  document.getElementById('spOv')?.addEventListener('click', () => {
    document.getElementById('spOv')!.classList.remove('on');
    document.getElementById('sp')!.classList.remove('on');
  });
}

// Run init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
