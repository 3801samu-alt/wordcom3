// ============================================================
// Firebase Authentication & Firestore Sync
// ============================================================

// Firebase references (loaded from CDN)
let auth;
let currentUser = null;

function initFirebase() {
  const firebaseConfig = {
    apiKey: "AIzaSyBk5QhTR9_7bRmVPfe8Z5wqu5UAvmAiqPU",
    authDomain: "tango-d45fe.firebaseapp.com",
    projectId: "tango-d45fe",
    storageBucket: "tango-d45fe.firebasestorage.app",
    messagingSenderId: "242253022009",
    appId: "1:242253022009:web:11c653858c97f1796b1ee8",
    measurementId: "G-BYR6Y8J378"
  };

  const app = firebase.initializeApp(firebaseConfig);
  auth = firebase.auth();

  // Persistence: remember login
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

  // Auth state listener
  auth.onAuthStateChanged(async user => {
    currentUser = user;
    updateAuthUI();
    if (user) {
      await loadUserSettings();
      loadVocabData();
      if (typeof window.startSrsSession === 'function') {
        window.startSrsSession();
      }
    }
  });
}

// ===== AUTH UI =====
function updateAuthUI() {
  const loginPage = document.getElementById('page-login');
  const logoutBtn = document.getElementById('btn-logout');
  const userLabel = document.getElementById('user-label');

  if (currentUser) {
    if (loginPage) loginPage.classList.add('hidden');
    if (logoutBtn) logoutBtn.classList.remove('hidden');
    if (userLabel) userLabel.textContent = currentUser.email;
    // Show home
    if (typeof showPage === 'function') showPage('page-home');
  } else {
    if (logoutBtn) logoutBtn.classList.add('hidden');
    if (userLabel) userLabel.textContent = '';
    // Show login page
    if (loginPage) loginPage.classList.remove('hidden');
    document.querySelectorAll('.page').forEach(p => {
      if (p.id !== 'page-login') p.classList.add('hidden');
    });
  }
}

// ===== REGISTER =====
async function registerUser(email, password) {
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    // Save credentials for auto-fill
    try {
      localStorage.setItem('vocabAuthEmail', email);
      localStorage.setItem('vocabAuthPw', password);
    } catch (e) { }
    return { success: true, user: cred.user };
  } catch (err) {
    return { success: false, error: getFirebaseErrorMessage(err.code) };
  }
}

// ===== LOGIN =====
async function loginUser(email, password) {
  try {
    const cred = await auth.signInWithEmailAndPassword(email, password);
    // Save credentials for auto-fill
    try {
      localStorage.setItem('vocabAuthEmail', email);
      localStorage.setItem('vocabAuthPw', password);
    } catch (e) { }
    return { success: true, user: cred.user };
  } catch (err) {
    return { success: false, error: getFirebaseErrorMessage(err.code) };
  }
}

// ===== LOGOUT =====
async function logoutUser() {
  try {
    await auth.signOut();
    currentUser = null;
  } catch (err) {
    console.error('Logout error:', err);
  }
}

// ===== GOOGLE SIGN-IN =====
async function googleSignIn() {
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    const result = await auth.signInWithPopup(provider);
    return { success: true, user: result.user };
  } catch (err) {
    return { success: false, error: getFirebaseErrorMessage(err.code) };
  }
}

// ===== LOCAL STORAGE SYNC =====
let localVocabData = {};
let localStudyLogs = {};

function initLocalData() {
  const allWords = window.VOCAB_SETS.flatMap(s => s.words.map(w => ({ ...w, setId: s.id })));
  const now = new Date().getTime();
  const initData = {};
  for (const w of allWords) {
    if (!w.en) continue;
    initData[w.en] = {
      en: w.en,
      ja: w.ja || '',
      pronunciation: w.pronunciation || '',
      etymology: w.etymology || '',
      ex1_en: w.ex1_en || '',
      ex1_ja: w.ex1_ja || '',
      ex2_en: w.ex2_en || '',
      ex2_ja: w.ex2_ja || '',
      ex3_en: w.ex3_en || '',
      ex3_ja: w.ex3_ja || '',
      setId: w.setId,
      nextReviewDate: now,
      interval: 0,
      repetition: 0,
      easeFactor: 2.5,
      mistakeCount: 0
    };
  }
  return initData;
}

function loadVocabData() {
  const uid = currentUser ? currentUser.uid : 'guest';

  const wordsJson = localStorage.getItem(`vocabWords_${uid}`);
  if (wordsJson) {
    try {
      localVocabData = JSON.parse(wordsJson);
    } catch (e) {
      localVocabData = initLocalData();
    }
  } else {
    localVocabData = initLocalData();
    saveVocabData();
  }

  const logsJson = localStorage.getItem(`vocabLogs_${uid}`);
  if (logsJson) {
    try {
      localStudyLogs = JSON.parse(logsJson);
    } catch (e) {
      localStudyLogs = {};
    }
  } else {
    localStudyLogs = {};
  }
}

function saveVocabData() {
  const uid = currentUser ? currentUser.uid : 'guest';
  localStorage.setItem(`vocabWords_${uid}`, JSON.stringify(localVocabData));
  localStorage.setItem(`vocabLogs_${uid}`, JSON.stringify(localStudyLogs));
}

function getTodayString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function incrementStudyCount() {
  const today = getTodayString();
  if (!localStudyLogs[today]) localStudyLogs[today] = { studiedCount: 0, studyTime: 0 };
  localStudyLogs[today].studiedCount++;
  saveVocabData();
}

async function undoStudyCount() {
  const today = getTodayString();
  if (localStudyLogs[today] && localStudyLogs[today].studiedCount > 0) {
    localStudyLogs[today].studiedCount--;
    saveVocabData();
  }
}

async function addStudyTime(seconds) {
  if (seconds <= 0) return;
  const today = getTodayString();
  if (!localStudyLogs[today]) localStudyLogs[today] = { studiedCount: 0, studyTime: 0 };
  localStudyLogs[today].studyTime += seconds;
  saveVocabData();
}

async function loadAllDueWords() {
  const now = new Date().getTime();
  let reviewWords = [];
  let newWords = [];

  for (const key in localVocabData) {
    const data = localVocabData[key];
    if (data.nextReviewDate <= now) {
      if (data.interval === 0) {
        newWords.push(data);
      } else {
        reviewWords.push(data);
      }
    }
  }

  reviewWords.sort((a, b) => {
    const aDate = new Date(a.nextReviewDate).setHours(0, 0, 0, 0);
    const bDate = new Date(b.nextReviewDate).setHours(0, 0, 0, 0);
    if (aDate === bDate) {
      return (b.mistakeCount || 0) - (a.mistakeCount || 0); // Descending mistake
    }
    return a.nextReviewDate - b.nextReviewDate; // Ascending date
  });

  newWords.sort((a, b) => (b.mistakeCount || 0) - (a.mistakeCount || 0));

  return { reviewWords, newWords };
}

async function getDashboardData() {
  let masteredCount = 0;
  let mistakeList = [];

  for (const key in localVocabData) {
    const d = localVocabData[key];
    if (d.interval >= 21) masteredCount++;
    mistakeList.push(d);
  }

  mistakeList.sort((a, b) => (b.mistakeCount || 0) - (a.mistakeCount || 0));

  let chartLabels = [];
  let chartData = [];
  let totalStudyTime = 0;
  let todayStudyTime = 0;
  const todayStr = getTodayString();

  const sortedKeys = Object.keys(localStudyLogs).sort();
  for (const date of sortedKeys) {
    const log = localStudyLogs[date];
    chartLabels.push(date);
    chartData.push(log.studiedCount || 0);
    totalStudyTime += (log.studyTime || 0);
    if (date === todayStr) {
      todayStudyTime = log.studyTime || 0;
    }
  }

  return { masteredCount, mistakeList, chartLabels, chartData, totalStudyTime, todayStudyTime };
}

async function saveSrsWord(wordEn, srsState) {
  if (localVocabData[wordEn]) {
    localVocabData[wordEn].interval = srsState.interval;
    localVocabData[wordEn].repetition = srsState.repetition;
    localVocabData[wordEn].easeFactor = srsState.easeFactor;
    localVocabData[wordEn].mistakeCount = srsState.mistakeCount;
    localVocabData[wordEn].nextReviewDate = srsState.nextReviewDate.getTime ? srsState.nextReviewDate.getTime() : srsState.nextReviewDate;
    localVocabData[wordEn].updatedAt = new Date().getTime();
    saveVocabData();
  }
}

async function saveUserSettings() {
  if (typeof state === 'undefined') return;
  const uid = currentUser ? currentUser.uid : 'guest';
  const dataToSave = {
    vocabStats: state.vocabStats || { totalSessions: 0, totalWords: 0, totalCorrect: 0 },
    settings: {
      qFormat: state.qFormat || 'ja-en',
      audioSeq: state.audioSeq || 'ja-en'
    },
    updatedAt: new Date().getTime()
  };
  localStorage.setItem(`vocabSettings_${uid}`, JSON.stringify(dataToSave));
}

async function loadUserSettings() {
  if (typeof state === 'undefined') return;
  const uid = currentUser ? currentUser.uid : 'guest';
  const dataJSON = localStorage.getItem(`vocabSettings_${uid}`);
  if (dataJSON) {
    try {
      const data = JSON.parse(dataJSON);
      if (data.vocabStats) state.vocabStats = data.vocabStats;
      if (data.settings) {
        state.qFormat = data.settings.qFormat || 'ja-en';
        state.audioSeq = data.settings.audioSeq || 'ja-en';
        const qf = document.getElementById('setting-q-format');
        const as = document.getElementById('setting-audio-seq');
        if (qf) qf.value = state.qFormat;
        if (as) as.value = state.audioSeq;
      }
      if (typeof renderStats === 'function') renderStats();
    } catch (e) { }
  }
}

function saveStorageLocal() {
  saveUserSettings();
}

// ===== ERROR MESSAGES =====
function getFirebaseErrorMessage(code) {
  const messages = {
    'auth/email-already-in-use': 'このメールアドレスは既に使用されています。',
    'auth/invalid-email': 'メールアドレスの形式が正しくありません。',
    'auth/operation-not-allowed': 'メール/パスワード認証が有効になっていません。',
    'auth/weak-password': 'パスワードは6文字以上で設定してください。',
    'auth/user-disabled': 'このアカウントは無効になっています。',
    'auth/user-not-found': 'このメールアドレスのアカウントが見つかりません。',
    'auth/wrong-password': 'パスワードが正しくありません。',
    'auth/too-many-requests': 'ログイン試行回数が多すぎます。しばらくしてからもう一度お試しください。',
    'auth/invalid-credential': 'メールアドレスまたはパスワードが正しくありません。',
  };
  return messages[code] || 'エラーが発生しました。もう一度お試しください。';
}

async function resetAllProgress() {
  const now = new Date().getTime();
  for (const key in localVocabData) {
    localVocabData[key].interval = 0;
    localVocabData[key].repetition = 0;
    localVocabData[key].easeFactor = 2.5;
    localVocabData[key].mistakeCount = 0;
    localVocabData[key].nextReviewDate = now;
    localVocabData[key].updatedAt = now;
  }
  localStudyLogs = {};
  saveVocabData();

  if (typeof state !== 'undefined' && state.vocabStats) {
    state.vocabStats = { totalSessions: 0, totalWords: 0, totalCorrect: 0 };
    await saveUserSettings();
  }
}

// ===== AUTO-FILL =====
function autoFillCredentials() {
  try {
    const email = localStorage.getItem('vocabAuthEmail');
    const pw = localStorage.getItem('vocabAuthPw');
    const emailInput = document.getElementById('login-email');
    const pwInput = document.getElementById('login-password');
    if (email && emailInput) emailInput.value = email;
    if (pw && pwInput) pwInput.value = pw;
  } catch (e) { }
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  initFirebase();
  autoFillCredentials();

  // Login form
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async e => {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const pw = document.getElementById('login-password').value;
      const errEl = document.getElementById('login-error');

      if (!email || !pw) {
        errEl.textContent = 'メールアドレスとパスワードを入力してください。';
        return;
      }

      errEl.textContent = '';
      const loginBtn = document.getElementById('btn-login');
      loginBtn.disabled = true;
      loginBtn.textContent = 'ログイン中...';

      const result = await loginUser(email, pw);
      loginBtn.disabled = false;
      loginBtn.textContent = 'ログイン';

      if (!result.success) {
        errEl.textContent = result.error;
      }
    });
  }

  // Register form
  const registerForm = document.getElementById('register-form');
  if (registerForm) {
    registerForm.addEventListener('submit', async e => {
      e.preventDefault();
      const email = document.getElementById('register-email').value.trim();
      const pw = document.getElementById('register-password').value;
      const pw2 = document.getElementById('register-password-confirm').value;
      const errEl = document.getElementById('register-error');

      if (!email || !pw) {
        errEl.textContent = 'メールアドレスとパスワードを入力してください。';
        return;
      }
      if (pw !== pw2) {
        errEl.textContent = 'パスワードが一致しません。';
        return;
      }
      if (pw.length < 6) {
        errEl.textContent = 'パスワードは6文字以上で設定してください。';
        return;
      }

      errEl.textContent = '';
      const regBtn = document.getElementById('btn-register');
      regBtn.disabled = true;
      regBtn.textContent = '登録中...';

      const result = await registerUser(email, pw);
      regBtn.disabled = false;
      regBtn.textContent = '新規登録';

      if (!result.success) {
        errEl.textContent = result.error;
      }
    });
  }

  // Toggle between login and register
  const showRegisterBtn = document.getElementById('btn-show-register');
  const showLoginBtn = document.getElementById('btn-show-login');
  const loginSection = document.getElementById('login-section');
  const registerSection = document.getElementById('register-section');

  if (showRegisterBtn) {
    showRegisterBtn.addEventListener('click', () => {
      loginSection.classList.add('hidden');
      registerSection.classList.remove('hidden');
    });
  }
  if (showLoginBtn) {
    showLoginBtn.addEventListener('click', () => {
      registerSection.classList.add('hidden');
      loginSection.classList.remove('hidden');
    });
  }

  // Logout button
  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await logoutUser();
    });
  }

  // Google login buttons
  const googleLoginBtn = document.getElementById('btn-google-login');
  const googleRegisterBtn = document.getElementById('btn-google-register');

  async function handleGoogleSignIn() {
    const result = await googleSignIn();
    if (!result.success) {
      const errEl = document.getElementById('login-error') || document.getElementById('register-error');
      if (errEl) errEl.textContent = result.error;
    }
  }

  if (googleLoginBtn) {
    googleLoginBtn.addEventListener('click', handleGoogleSignIn);
  }
  if (googleRegisterBtn) {
    googleRegisterBtn.addEventListener('click', handleGoogleSignIn);
  }
});
