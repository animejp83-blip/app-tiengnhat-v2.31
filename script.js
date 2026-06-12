const STORAGE_KEY = 'app_tiengnhat_v2_data';
const THEME_KEY = 'app_tiengnhat_v2_theme';
const APP_VERSION = '2.40';
const todayISO = () => new Date().toISOString().slice(0, 10);
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0,10); };
const reviewSteps = [1, 3, 7, 14, 30, 60];
let idCounter = Date.now();
const uid = (prefix='id') => `${prefix}_${++idCounter}`;
const escHtml = (s='') => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const stripHtml = (html='') => { const div=document.createElement('div'); div.innerHTML=html; return div.textContent || ''; };
const shuffle = (arr) => { const a=[...arr]; for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]];} return a; };
const sample = (arr,n) => shuffle(arr).slice(0,n);

function stripFurigana(htmlStr) {
  if (!htmlStr) return '';
  const div = document.createElement('div');
  div.innerHTML = htmlStr;
  div.querySelectorAll('rt, rp').forEach(el => el.remove());
  return div.textContent || div.innerText || '';
}

function normalizeSpeechText(input='') {
  let text = stripFurigana(String(input));
  // Nếu dữ liệu có dạng 漢字（かんじ） thì bỏ phần đọc trong ngoặc để tránh đọc lặp.
  text = text.replace(/([\p{Script=Han}々〆ヶ]+)（[\p{Script=Hiragana}\p{Script=Katakana}ー・\s]+）/gu, '$1');
  text = text.replace(/([\p{Script=Han}々〆ヶ]+)\([\p{Script=Hiragana}\p{Script=Katakana}ー・\s]+\)/gu, '$1');
  return text.replace(/\s+/g, ' ').trim();
}

function encodeSpeakText(input='') {
  return encodeURIComponent(normalizeSpeechText(input));
}

const state = {
  readings: [],
  currentReadingId: null,
  quiz: { mode:null, questions:[], current:0, score:0, answered:false, wrong:[] },
  stats: { attempts:0, correct:0, streak:0, lastStudyDate:null, days:{} },
  filter: 'all',
  furiganaVisible: true,
  speakingViVisible: true,
  audioEnabled: true,
  voiceName: '',
  activeTab: 'home'
};

function makeReviewMeta(x={}) {
  return {
    starred: !!x.starred,
    level: Number(x.level || 0),
    nextReview: x.nextReview || todayISO(),
    wrongCount: Number(x.wrongCount || 0),
    rightCount: Number(x.rightCount || 0)
  };
}

function normalizeData() {
  state.readings = (state.readings || []).map((r, idx) => ({
    id: r.id || uid('reading'),
    title: r.title || `Bài ${idx+1}`,
    createdAt: r.createdAt || todayISO(),
    readingHTML: r.readingHTML || '',
    rawText: r.rawText || '',
    sentenceTranslations: Array.isArray(r.sentenceTranslations) ? r.sentenceTranslations.map((x, i) => ({
      id: x.id || uid('s'),
      jp: x.jp || x.sentence || x.japanese || '',
      vi: x.vi || x.translation || x.vietnamese || '',
      order: Number(x.order || i + 1)
    })).filter(x => x.jp || x.vi) : [],
    conversation: Array.isArray(r.conversation) ? r.conversation.map((c, i) => ({
      id: c.id || uid('c'),
      role: c.role || (i % 2 === 0 ? 'A' : 'B'),
      jpFuri: c.jpFuri || '',
      vi: c.vi || ''
    })) : [],
    vocabList: (r.vocabList || []).map(v => ({ id:v.id||uid('v'), kanji:v.kanji||'', hira:v.hira||v.reading||'', meaning:v.meaning||'', example:v.example||'', type:'vocab', ...makeReviewMeta(v) })),
    grammarList: (r.grammarList || []).map(g => ({ id:g.id||uid('g'), pattern:g.pattern||'', reading:g.reading||'', meaning:g.meaning||'', example:g.example||'', type:'grammar', ...makeReviewMeta(g) }))
  }));
  if (!state.currentReadingId && state.readings[0]) state.currentReadingId = state.readings[0].id;
  state.stats = { attempts:0, correct:0, streak:0, lastStudyDate:null, days:{}, ...(state.stats||{}) };
}

function saveData(){ localStorage.setItem(STORAGE_KEY, JSON.stringify({ version:APP_VERSION, readings:state.readings, currentReadingId:state.currentReadingId, stats:state.stats, activeTab:state.activeTab, audioEnabled:state.audioEnabled, voiceName:state.voiceName })); }

function loadData(){
  const saved = localStorage.getItem(STORAGE_KEY);
  if(saved){ try{ Object.assign(state, JSON.parse(saved)); }catch(e){ console.error(e); } }
  normalizeData(); saveData();
  const savedTheme = localStorage.getItem(THEME_KEY) || 'sepia';
  setAppTheme(savedTheme);
}

function setAppTheme(themeName) {
  document.body.className = `theme-${themeName}`;
  localStorage.setItem(THEME_KEY, themeName);
  document.querySelectorAll('.theme-dot').forEach(dot => {
    dot.classList.toggle('active', dot.dataset.theme === themeName);
  });
}

const currentReading = () => state.readings.find(r=>r.id===state.currentReadingId) || state.readings[0] || null;
const allVocab = () => state.readings.flatMap(r => r.vocabList.map(v => ({...v, readingId:r.id, readingTitle:r.title})));
const allGrammar = () => state.readings.flatMap(r => r.grammarList.map(g => ({...g, readingId:r.id, readingTitle:r.title})));
const allItems = () => [...allVocab(), ...allGrammar()];
const isDue = (x) => !x.nextReview || x.nextReview <= todayISO();
const isHard = (x) => x.wrongCount > x.rightCount || ((x.level || 0) === 0 && (x.wrongCount || 0) > 0);

function findItem(id){
  for(const r of state.readings){
    const v = r.vocabList.find(x=>x.id===id); if(v) return v;
    const g = r.grammarList.find(x=>x.id===id); if(g) return g;
  }
  return null;
}
function toast(msg){ const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),1800); }
function getTabFromHash(){
  const h = (location.hash || '').replace('#tab-', '').replace('#', '');
  return document.getElementById(`tab-${h}`) ? h : null;
}
function goTab(tab, opts={}){
  if(!document.getElementById(`tab-${tab}`)) tab = 'home';
  const oldTab = state.activeTab;
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.toggle('active', p.id===`tab-${tab}`));
  state.activeTab = tab;
  saveData();
  if(opts.push !== false){
    const nextHash = `#tab-${tab}`;
    if(oldTab !== tab) history.pushState({tab}, '', nextHash);
    else if(location.hash !== nextHash) history.replaceState({tab}, '', nextHash);
  }
}
function restoreLastTab(){
  const tab = getTabFromHash() || state.activeTab || 'home';
  history.replaceState({tab}, '', `#tab-${tab}`);
  goTab(tab, {push:false});
}

function updateStatsStudy(correct){
  state.stats.attempts++;
  if(correct) state.stats.correct++;
  const today = todayISO();
  state.stats.days[today] = (state.stats.days[today] || 0) + 1;
  if(state.stats.lastStudyDate !== today){
    const y = new Date(); y.setDate(y.getDate()-1); const yesterday = y.toISOString().slice(0,10);
    state.stats.streak = state.stats.lastStudyDate === yesterday ? (state.stats.streak||0)+1 : 1;
    state.stats.lastStudyDate = today;
  }
}
function updateSRS(id, correct){
  const item = findItem(id); if(!item) return;
  if(correct){ item.rightCount++; item.level = Math.min((item.level||0)+1, reviewSteps.length-1); item.nextReview = addDays(reviewSteps[item.level]); }
  else { item.wrongCount++; item.level = 0; item.nextReview = addDays(1); item.starred = true; }
  updateStatsStudy(correct); saveData();
}

function renderAll(){ renderHome(); renderLibrary(); renderReading(); renderAnalyze(); renderSpeaking(); renderReview(); renderStats(); }
function renderHome(){
  const savedCount = allItems().filter(x => x.starred).length;
  setText('home-due-total', savedCount); setText('home-due-vocab', allVocab().filter(x => x.starred).length); setText('home-due-grammar', allGrammar().filter(x => x.starred).length);
  setText('stat-readings-home', state.readings.length); setText('stat-vocab-home', allVocab().length); setText('stat-grammar-home', allGrammar().length); setText('stat-streak-home', `${state.stats.streak||0} ngày`);
}
function setText(id, val){ const el=document.getElementById(id); if(el) el.textContent=val; }
function renderLibrary(){
  const el=document.getElementById('library-list'); if(!el) return;
  if(!state.readings.length){ el.innerHTML='<div class="empty-panel">Chưa có bài đọc nào. Hãy vào Reading để nạp bài đầu tiên.</div>'; return; }
  el.innerHTML = state.readings.map(r => `
    <div class="library-card ${r.id===state.currentReadingId?'active':''}">
      <div class="lib-top"><strong>${escHtml(r.title)}</strong><span>${escHtml(r.createdAt)}</span></div>
      <p>${escHtml(stripHtml(r.readingHTML).slice(0,120)) || 'Không có preview'}</p>
      <div class="lib-meta"><span>🟦 ${r.vocabList.length}</span><span>🟥 ${r.grammarList.length}</span><span>👄 ${r.conversation?.length || 0} câu thoại</span></div>
      <div class="toolbar"><button class="btn btn-primary btn-sm" onclick="openReading('${r.id}')">Mở</button><button class="btn btn-outline btn-sm" onclick="quizByReading('${r.id}')">Quiz bài này</button><button class="btn btn-ghost danger btn-sm" onclick="deleteReading('${r.id}')">Xóa</button></div>
    </div>`).join('');
}
function renderReading(){
  const r=currentReading(); const disp=document.getElementById('reading-display'); if(!disp) return;
  if(!r){ disp.innerHTML='<div class="empty-state"><span>文</span><p>Chưa có bài đọc. Hãy nạp JSON ở khung bên phải.</p></div>'; return; }
  disp.innerHTML = r.readingHTML || '<div class="empty-state"><span>文</span><p>Bài này chưa có nội dung đọc.</p></div>';
  disp.classList.toggle('furigana-hidden', !state.furiganaVisible);
  const title=document.getElementById('reading-title'); if(title && !title.value) title.value = r.title;
}

function renderAnalyze(){
  const el = document.getElementById('analyze-simple-list'); if(!el) return;
  const r = currentReading();
  if(!r){ el.innerHTML = '<div class="empty-panel">Chưa có bài đọc. Hãy nạp bài ở tab Reading.</div>'; return; }
  const list = Array.isArray(r.sentenceTranslations) ? r.sentenceTranslations : [];
  if(!list.length){ el.innerHTML = `<div class="empty-panel">Bài này chưa có dịch từng câu.</div>`; return; }
  el.innerHTML = list.map((x, idx) => `
    <div class="sentence-pair">
      <div class="sentence-index">${idx + 1}</div>
      <div class="sentence-body">
        <div class="sentence-jp">${x.jp || ''}</div>
        <div class="sentence-vi">→ ${escHtml(x.vi || 'Chưa có bản dịch')}</div>
      </div>
    </div>
  `).join('');
}

function renderSpeaking() {
  const el = document.getElementById('speaking-conversation-list'); if(!el) return;
  const r = currentReading();
  if(!r){ el.innerHTML = '<div class="empty-panel">Chưa có bài đọc. Chọn hoặc nạp bài trước nhé.</div>'; return; }
  const list = Array.isArray(r.conversation) ? r.conversation : [];
  if(!list.length){ el.innerHTML = `<div class="empty-panel">Bài đọc này chưa nạp hội thoại luyện nói công sở.<br><small>Hãy sử dụng khung bên phải để tạo Prompt và nạp riêng JSON hội thoại lịch sự cho bài này.</small></div>`; return; }
  
  el.innerHTML = list.map(c => {
    const isA = c.role === 'A';
    return `
      <div class="chat-item ${isA ? 'left' : 'right'}">
        <div class="chat-avatar">${escHtml(c.role)}</div>
        <div class="chat-bubble-group">
          <div class="chat-jp-bubble" onclick="speakText(decodeURIComponent('${encodeSpeakText(c.jpFuri)}'))">
            ${c.jpFuri}
          </div>
          <div class="chat-vi-translation">
            ${escHtml(c.vi)}
          </div>
        </div>
      </div>
    `;
  }).join('');
  
  // Áp dụng lớp hiển thị/ẩn furigana và vi dựa vào state hiện tại
  el.querySelectorAll('.chat-jp-bubble').forEach(b => b.classList.toggle('furi-hidden', !state.furiganaVisible));
  el.querySelectorAll('.chat-vi-translation').forEach(t => t.classList.toggle('vi-hidden', !state.speakingViVisible));
}

function getJapaneseVoices(){
  const voices = window.speechSynthesis?.getVoices?.() || [];
  return voices.filter(v => /^ja/i.test(v.lang) || /Japanese|Japan|Nanami|Haruka|Keita|Sayaka|Ayumi|Ichiro/i.test(v.name));
}
function voiceScore(v){
  const name = `${v.name} ${v.lang}`;
  if(/Natural|Online/i.test(name)) return 100;
  if(/Nanami/i.test(name)) return 90;
  if(/Haruka/i.test(name)) return 80;
  if(/Sayaka/i.test(name)) return 75;
  if(/Keita/i.test(name)) return 70;
  if(/Microsoft/i.test(name)) return 60;
  if(/^ja/i.test(v.lang)) return 40;
  return 0;
}
function getSelectedJapaneseVoice(){
  const voices = getJapaneseVoices();
  if(!voices.length) return null;
  return voices.find(v => v.name === state.voiceName) || [...voices].sort((a,b)=>voiceScore(b)-voiceScore(a))[0];
}
function populateVoiceSelects(){
  const voices = getJapaneseVoices().sort((a,b)=>voiceScore(b)-voiceScore(a) || a.name.localeCompare(b.name));
  const best = getSelectedJapaneseVoice();
  if(!state.voiceName && best) state.voiceName = best.name;
  ['voice-select','speak-voice-select'].forEach(id => {
    const sel = document.getElementById(id);
    if(!sel) return;
    const current = state.voiceName || best?.name || '';
    sel.innerHTML = voices.length
      ? voices.map(v => `<option value="${escHtml(v.name)}">${escHtml(v.name.replace(/^Microsoft\s+/i,'Microsoft '))}</option>`).join('')
      : '<option value="">Giọng Nhật mặc định</option>';
    sel.value = current;
  });
}
function changeVoice(name){
  state.voiceName = name || '';
  saveData();
  populateVoiceSelects();
  toast('Đã đổi giọng đọc');
}
function speakText(text) {
  const cleanText = normalizeSpeechText(text);
  if(!cleanText || !state.audioEnabled) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(cleanText);
  u.lang = 'ja-JP';
  u.rate = 0.82;
  u.pitch = 1.02;
  const jpVoice = getSelectedJapaneseVoice();
  if(jpVoice) u.voice = jpVoice;
  window.speechSynthesis.speak(u);
}
function stopAudio(){ window.speechSynthesis.cancel(); }
function syncAudioButtons(){
  const label = state.audioEnabled ? '🔈 Âm thanh: Bật' : '🔇 Âm thanh: Tắt';
  ['btn-audio-toggle','btn-speak-audio-toggle'].forEach(id => setText(id, label));
}
function toggleAudio(){
  state.audioEnabled = !state.audioEnabled;
  if(!state.audioEnabled) stopAudio();
  saveData(); syncAudioButtons();
  toast(state.audioEnabled ? 'Đã bật âm thanh' : 'Đã tắt âm thanh');
}
function collapseReadingImportAfterSuccess(){
  document.querySelectorAll('#tab-reading .import-panel details').forEach(d => d.open = false);
}
function showReadingPromptStep(){
  const panels = document.querySelectorAll('#tab-reading .import-panel details');
  if(panels[0]) panels[0].open = false;
  if(panels[1]) panels[1].open = true;
  if(panels[2]) panels[2].open = true;
}
function showSpeakingPromptStep(){
  const panels = document.querySelectorAll('#tab-speaking .speaking-import-panel details');
  if(panels[0]) panels[0].open = false;
  if(panels[1]) panels[1].open = true;
  if(panels[2]) panels[2].open = true;
}
function collapseSpeakingImportAfterSuccess(){
  document.querySelectorAll('#tab-speaking .speaking-import-panel details').forEach(d => d.open = false);
}

function renderReview(){
  const vf = allVocab().filter(x => x.starred);
  const gf = allGrammar().filter(x => x.starred);
  setText('vocab-count', `${vf.length} từ`); setText('grammar-count', `${gf.length} mẫu`);
  document.getElementById('vocab-list').innerHTML = vf.length ? vf.map(itemCard).join('') : '<div class="empty-panel">Chưa lưu từ nào. Vào Reading hoặc Library, bấm ⭐ vào từ muốn nhớ.</div>';
  document.getElementById('grammar-list').innerHTML = gf.length ? gf.map(itemCard).join('') : '<div class="empty-panel">Chưa lưu ngữ pháp nào. Bấm ⭐ vào mẫu muốn ôn lại.</div>';
}
function filterItems(list){ return list; }
function itemCard(x){
  const title = x.type==='vocab' ? x.kanji : x.pattern;
  const read = x.type==='vocab' ? x.hira : x.reading;
  const exampleLabel = x.type==='vocab' ? '例' : 'Ví dụ';
  return `<div class="review-item simple-card" onclick="toggleDetail(event,'${x.id}')">
    <button class="star-btn ${x.starred?'on':''}" onclick="toggleStar(event,'${x.id}')">${x.starred?'⭐':'☆'}</button>
    <div class="item-main"><div class="item-title">${escHtml(title)}</div><div class="item-reading">${escHtml(read)}</div><div class="item-meaning">${escHtml(x.meaning)}</div><div class="item-example" id="detail-${x.id}">${exampleLabel}: ${escHtml(x.example || 'Chưa có ví dụ')}<br><small>${escHtml(x.readingTitle||'')}</small></div></div>
    <div class="item-side"><button class="menu-btn" title="Xóa mục này" onclick="deleteItem(event,'${x.id}')">✕</button></div>
  </div>`;
}
function renderStats(){
  const attempts=state.stats.attempts||0, correct=state.stats.correct||0;
  setText('stat-accuracy', attempts ? `${Math.round(correct/attempts*100)}%` : '0%');
  setText('stat-known', allItems().filter(x=>x.level>=4).length);
  setText('stat-learning', allItems().filter(x=>x.level<4).length);
  setText('stat-starred', allItems().filter(x=>x.starred).length);
  const bars=document.getElementById('week-bars'); if(!bars) return;
  const days=[]; for(let i=6;i>=0;i--){ const d=new Date(); d.setDate(d.getDate()-i); const iso=d.toISOString().slice(0,10); days.push({iso, count:state.stats.days[iso]||0}); }
  const max=Math.max(1,...days.map(d=>d.count));
  bars.innerHTML=days.map(d=>`<div class="day-bar"><div class="bar" style="height:${12+d.count/max*90}px"></div><small>${d.iso.slice(5)}</small><b>${d.count}</b></div>`).join('');
}

window.openReading = (id) => { state.currentReadingId=id; saveData(); renderAll(); goTab('reading'); };
window.deleteReading = (id) => { if(!confirm('Xóa bài đọc này?')) return; state.readings=state.readings.filter(r=>r.id!==id); state.currentReadingId=state.readings[0]?.id||null; saveData(); renderAll(); };
window.toggleStar = (e,id) => { e.stopPropagation(); const item=findItem(id); if(item){ item.starred=!item.starred; if(item.starred && !item.nextReview) item.nextReview=todayISO(); saveData(); renderAll(); } };
window.toggleDetail = (e,id) => { const d=document.getElementById(`detail-${id}`); if(d) d.classList.toggle('show'); };
window.deleteItem = (e,id) => { e.stopPropagation(); if(!confirm('Xóa mục này?')) return; for(const r of state.readings){ r.vocabList=r.vocabList.filter(x=>x.id!==id); r.grammarList=r.grammarList.filter(x=>x.id!==id); } saveData(); renderAll(); };

function buildPrompt(raw){ return `Hãy phân tích văn bản tiếng Nhật sau và trả về DUY NHẤT một chuỗi JSON cấu trúc hoàn chỉnh dưới đây, không viết thêm lời giải thích hay bọc thẻ nào khác ngoài cấu trúc JSON.

Yêu cầu phân tích và sinh dữ liệu:
1. paragraphs: Mảng chứa các đoạn văn từ văn bản gốc, bắt buộc đính kèm Furigana bằng thẻ ruby dạng: <ruby>漢字<rt>かんじ</rt></ruby>
2. sentenceTranslations: Mảng dịch gọn từng câu gốc. Mỗi phần tử chứa thuộc tính "jp" (câu tiếng Nhật) và "vi" (câu dịch tiếng Việt tự nhiên).
3. vocabList: Tối thiểu 20 từ vựng quan trọng, mỗi từ gồm: kanji, hira, meaning, example.
4. grammarList: Tối thiểu 10 mẫu ngữ pháp, mỗi mẫu gồm: pattern, reading, meaning, example.

JSON mẫu chuẩn cần trả về:
{
  "paragraphs": [
    "<ruby>昨日<rt>きのう</rt></ruby>、<ruby>図書館<rt>としょかん</rt></ruby>へ<ruby>行<rt>い</rt></ruby>きました。"
  ],
  "sentenceTranslations": [
    {"jp": "昨日、図書館へ行きました。", "vi": "Hôm qua tôi đã đi đến thư viện."}
  ],
  "vocabList": [
    {"kanji": "図書館", "hira": "としょかん", "meaning": "thư viện", "example": "図書館で本を借りました。"}
  ],
  "grammarList": [
    {"pattern": "〜へ行く", "reading": "へいく", "meaning": "đi đến đâu...", "example": "東京へ行く。 -> Đi Tokyo."}
  ]
}

Văn bản tiếng Nhật cần xử lý:
${raw}`; }

function buildSpeakingPrompt(raw) {
  return `Dựa vào ngữ cảnh/chủ đề của đoạn văn bản tiếng Nhật sau đây, hãy sáng tạo ra một đoạn hội thoại ngắn độc lập phục vụ luyện nói phản xạ trong môi trường CÔNG SỞ (Business Japanese) và trả về duy nhất định dạng JSON theo đúng quy tắc dưới đây.

Quy tắc sinh hội thoại:
1. Độ dài: Gồm chính xác từ 6 đến 10 câu thoại ngắn, tương tác qua lại giữa hai nhân vật A và B (Ví dụ: Giữa mình và đồng nghiệp/Senpai trong công ty).
2. Phong cách ngôn ngữ: Sử dụng thể LỊCH SỰ (丁寧語 - đuôi chữ kết thúc bằng "〜です", "〜ます", "〜でしょうか"). Tuyệt đối KHÔNG dùng thể ngắn, từ lóng suồng sã (タメ口). Từ vựng đơn giản, tự nhiên, dễ luyện nói.
3. Cấu trúc JSON bắt buộc: Phải chứa duy nhất mảng "conversation". Mỗi phần tử có "role" ("A" hoặc "B"), "jpFuri" (chữ Nhật có gắn sẵn thẻ <ruby> để hiện Furigana) và "vi" (bản dịch dịch nghĩa tiếng Việt lịch sự).

JSON mẫu chuẩn cần trả về:
{
  "conversation": [
    {"role": "A", "jpFuri": "<ruby>最近<rt>さいきん</rt></ruby>、お<ruby>疲<rt>つ</rt></ruby>れ様です。ちょっといいでしょうか。", "vi": "Dạo này anh vất vả rồi ạ. Tôi trao đổi một chút có được không?"},
    {"role": "B", "jpFuri": "ええ、どうしましたか。<ruby>何<rt>なに</rt></ruby>かありましたか。", "vi": "Ừ, có chuyện gì thế? Có vấn đề gì xảy ra à?"}
  ]
}

Văn bản gốc để lấy bối cảnh:
${raw}`;
}

function parseAIJson(raw){ const cleaned=raw.replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/```\s*$/i,'').trim(); return JSON.parse(cleaned); }

function importReadingFromParsed(parsed, title, rawText='', opts={}){
  if(!Array.isArray(parsed.paragraphs)) throw new Error('Thiếu paragraphs dạng mảng');
  const cleanRaw = rawText || stripFurigana(parsed.paragraphs.join('\n'));
  const r={ 
    id:uid('reading'), title:title || `Bài ${state.readings.length+1}`, createdAt:todayISO(), rawText: cleanRaw, 
    readingHTML: parsed.paragraphs.map(p=>`<p>${p}</p>`).join(''), 
    sentenceTranslations:[], conversation:[], vocabList:[], grammarList:[] 
  };
  const sentenceSource = parsed.sentenceTranslations || parsed.sentenceList || [];
  if(Array.isArray(sentenceSource)){
    sentenceSource.forEach((x, i) => {
      const jp = x.jp || x.sentence || ''; const vi = x.vi || x.translation || '';
      if(jp || vi) r.sentenceTranslations.push({ id:uid('s'), jp, vi, order:i+1 });
    });
  }
  (parsed.vocabList||[]).forEach(v=>{ if(v.kanji && (v.hira||v.reading)) r.vocabList.push({ id:uid('v'), kanji:v.kanji, hira:v.hira||v.reading, meaning:v.meaning||'', example:v.example||'', type:'vocab', ...makeReviewMeta({starred:false}) }); });
  (parsed.grammarList||[]).forEach(g=>{ if(g.pattern) r.grammarList.push({ id:uid('g'), pattern:g.pattern, reading:g.reading||'', meaning:g.meaning||'', example:g.example||'', type:'grammar', ...makeReviewMeta({starred:false}) }); });
  
  state.readings.unshift(r); state.currentReadingId=r.id; saveData(); renderAll(); 
  collapseReadingImportAfterSuccess();
  toast(opts.quizNow ? 'Đã nạp bài. Bắt đầu quiz ngay!' : 'Đã nạp bài đọc thành công! Hãy sang tab Speaking để sinh tiếp hội thoại.');
  if(opts.quizNow) startQuiz('current-reading'); else goTab('reading');
  return r;
}

function importSpeakingConversation(parsed) {
  const r = currentReading();
  if(!r) throw new Error('Chưa chọn bài đọc nào để nạp hội thoại.');
  if(!Array.isArray(parsed.conversation)) throw new Error('Thiếu cấu trúc mảng conversation');
  
  r.conversation = parsed.conversation.map((c, i) => ({
    id: uid('c'),
    role: c.role || (i % 2 === 0 ? 'A' : 'B'),
    jpFuri: c.jpFuri || '',
    vi: c.vi || ''
  }));
  
  saveData(); renderSpeaking(); collapseSpeakingImportAfterSuccess();
  toast(`Đã nạp thành công ${r.conversation.length} câu thoại lịch sự vào bài học này!`);
}

function getQuizLimit(){ const el = document.getElementById('quiz-question-limit'); const val = el ? el.value : '10'; return val === 'all' ? Infinity : Math.max(1, Number(val || 10)); }
function quizModeLabel(mode){ return ({ 'current-reading':'Bài hiện tại','starred-mixed':'Từ đã lưu ⭐','random-mixed':'Ngẫu nhiên' })[mode] || mode; }
function buildChoiceQuestion(x, vocabPool, grammarPool){
  const isVocab = x.type === 'vocab'; const title = isVocab ? x.kanji : x.pattern;
  const sub = isVocab ? `(${x.hira || ''}) Nghĩa đúng là gì?` : (x.example || 'Ý nghĩa của mẫu ngữ pháp này là gì?');
  const pool = (isVocab ? vocabPool : grammarPool).filter(y => y.id !== x.id).map(y => y.meaning).filter(Boolean);
  const options = shuffle([...new Set([x.meaning || 'Chưa có nghĩa', ...sample(pool, 3)])]);
  return { kind:'choice', itemId:x.id, type:x.type, question:title, sub, correct:x.meaning || 'Chưa có nghĩa', options, explain:x.example || '' };
}
function buildQuestions(mode, readingId=null){
  let items=[]; const v=allVocab(), g=allGrammar(); const limit = getQuizLimit();
  if(readingId || mode==='current-reading'){
    const r = readingId ? state.readings.find(x=>x.id===readingId) : currentReading();
    items=[...(r?.vocabList||[]).map(x=>({...x,type:'vocab'})), ...(r?.grammarList||[]).map(x=>({...x,type:'grammar'}))];
  }
  else if(mode==='starred-mixed') items=allItems().filter(x=>x.starred);
  else if(mode==='random-mixed') items=allItems();
  if(items.length<1) return [];
  return sample(items, Math.min(limit, items.length)).map(x => buildChoiceQuestion(x, v, g)).filter(Boolean);
}
function startQuiz(mode, readingId=null){
  const err=document.getElementById('quiz-setup-error'); if(err) err.textContent='';
  const qs=buildQuestions(mode, readingId);
  if(!qs.length){ if(err) err.textContent='Chưa có mục phù hợp.'; goTab('quiz'); return; }
  state.quiz={ mode, questions:qs, current:0, score:0, answered:false, wrong:[] };
  document.getElementById('quiz-setup').style.display='none'; document.getElementById('quiz-result').style.display='none'; document.getElementById('quiz-arena').style.display='block';
  goTab('quiz'); renderQuestion();
}
window.quizByReading = (id) => { state.currentReadingId = id; saveData(); startQuiz('current-reading'); };
function renderQuestion(){
  const q=state.quiz, item=q.questions[q.current];
  document.getElementById('quiz-progress-fill').style.width = `${(q.current + 1)/q.questions.length*100}%`;
  setText('quiz-meta-type', quizModeLabel(q.mode)); setText('quiz-question-counter', `Câu ${q.current+1}/${q.questions.length}`);
  document.getElementById('quiz-question').innerHTML = `<div>${escHtml(item.question)}</div><div class="quiz-question-sub">${escHtml(item.sub||'')}</div>`;
  const opt=document.getElementById('quiz-options'); opt.innerHTML='';
  item.options.forEach((o,i)=>{ const b=document.createElement('button'); b.className='quiz-option'; b.innerHTML=`<span class="quiz-opt-num">${i+1}</span><span>${escHtml(o)}</span>`; b.onclick=()=>answerChoice(i); opt.appendChild(b); });
  document.getElementById('quiz-feedback').style.display='none'; document.getElementById('btn-next-question').style.display='none'; q.answered=false;
}
function answerChoice(idx){
  const q=state.quiz; if(q.answered) return; q.answered=true; const item=q.questions[q.current]; const chosen=item.options[idx]; const ok=chosen===item.correct; if(ok) q.score++; else q.wrong.push({question:item.question, chosen, correct:item.correct, explain:item.explain});
  document.querySelectorAll('.quiz-option').forEach((b,i)=>{ b.disabled=true; if(item.options[i]===item.correct) b.classList.add('correct'); if(i===idx && !ok) b.classList.add('wrong'); });
  updateSRS(item.itemId, ok); showFeedback(ok, ok?'✅ Chính xác!':`❌ Đáp án đúng: ${item.correct}`);
}
function showFeedback(ok,msg){ const fb=document.getElementById('quiz-feedback'); fb.className=`quiz-feedback ${ok?'correct-fb':'wrong-fb'}`; fb.textContent=msg; fb.style.display='block'; document.getElementById('btn-next-question').style.display='block'; saveData(); renderHome(); renderStats(); }
function finishQuiz(){
  const q=state.quiz; document.getElementById('quiz-arena').style.display='none'; document.getElementById('quiz-result').style.display='block';
  const pct=Math.round(q.score/q.questions.length*100); setText('result-score', `${pct}%`);
  document.getElementById('quiz-wrong-list').innerHTML = q.wrong.length ? '<h3>Câu sai / chưa biết</h3>'+q.wrong.map((w,i)=>`<div class="wrong-item-box"><b>${i+1}. ${escHtml(w.question)}</b><p>Đúng: <strong>${escHtml(w.correct)}</strong></p></div>`).join('') : '<div class="empty-panel">Tuyệt vời.</div>';
}
function exportData(){ const blob=new Blob([JSON.stringify({version:APP_VERSION, readings:state.readings, currentReadingId:state.currentReadingId, stats:state.stats}, null, 2)], {type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`app-tiengnhat-backup-${todayISO()}.json`; a.click(); URL.revokeObjectURL(a.href); }
function showQuizSetup(){ document.getElementById('quiz-result').style.display='none'; document.getElementById('quiz-arena').style.display='none'; document.getElementById('quiz-setup').style.display='block'; goTab('quiz'); }

document.addEventListener('DOMContentLoaded', () => {
  loadData(); renderAll(); restoreLastTab();
  document.querySelectorAll('.tab-btn').forEach(b=>b.onclick=()=>goTab(b.dataset.tab));
  document.querySelectorAll('[data-go-tab]').forEach(b=>b.onclick=()=>goTab(b.dataset.goTab));
  document.querySelectorAll('[data-quiz]').forEach(b=>b.onclick=()=>startQuiz(b.dataset.quiz));
  document.querySelector('.logo').onclick=()=>goTab('home');
  document.getElementById('btn-start-today').onclick=()=>startQuiz('random-mixed');
  // Xử lý đổi theme màu nền dịu mắt
  document.querySelectorAll('.theme-dot').forEach(dot => {
    dot.onclick = () => setAppTheme(dot.dataset.theme);
  });
  
  document.getElementById('btn-gen-prompt').onclick=()=>{ const raw=document.getElementById('reading-raw').value.trim(); if(!raw) return alert('Dán tiếng Nhật gốc trước nhé.'); document.getElementById('generated-prompt').textContent=buildPrompt(raw); showReadingPromptStep(); toast('Đã sinh prompt bài đọc'); };
  document.getElementById('btn-copy-prompt').onclick=()=>navigator.clipboard.writeText(document.getElementById('generated-prompt').textContent).then(()=>toast('Đã copy prompt bài đọc'));
  document.getElementById('btn-parse-reading').onclick=()=>{ const err=document.getElementById('reading-parse-error'); err.textContent=''; try{ const parsed=parseAIJson(document.getElementById('reading-ai-output').value); importReadingFromParsed(parsed, document.getElementById('reading-title').value.trim(), document.getElementById('reading-raw').value.trim()); }catch(e){ err.textContent='❌ '+e.message; } };
  document.getElementById('btn-parse-and-quiz').onclick=()=>{ const err=document.getElementById('reading-parse-error'); err.textContent=''; try{ const parsed=parseAIJson(document.getElementById('reading-ai-output').value); importReadingFromParsed(parsed, document.getElementById('reading-title').value.trim(), document.getElementById('reading-raw').value.trim(), {quizNow:true}); }catch(e){ err.textContent='❌ '+e.message; } };
  document.getElementById('btn-toggle-furigana').onclick=()=>{ state.furiganaVisible=!state.furiganaVisible; renderReading(); renderSpeaking(); };
  const copyReadingBtn = document.getElementById('btn-copy-reading'); if(copyReadingBtn) copyReadingBtn.onclick=()=>{ const r=currentReading(); navigator.clipboard.writeText(normalizeSpeechText(r?.readingHTML||'')).then(()=>toast('Đã copy bài đọc')); };
  document.getElementById('btn-read-aloud').onclick=()=>{ const r=currentReading(); speakText(r?.readingHTML||''); };
  document.getElementById('btn-save-current-reading').onclick=()=>{ const r=currentReading(); if(r){ const t=document.getElementById('reading-title').value.trim(); if(t) r.title=t; saveData(); renderAll(); toast('Đã lưu'); } };
  document.getElementById('btn-stop-audio').onclick=stopAudio;
  const audioToggleBtn = document.getElementById('btn-audio-toggle'); if(audioToggleBtn) audioToggleBtn.onclick=toggleAudio;
  document.getElementById('btn-speak-stop-audio').onclick=stopAudio;
  const speakAudioToggleBtn = document.getElementById('btn-speak-audio-toggle'); if(speakAudioToggleBtn) speakAudioToggleBtn.onclick=toggleAudio;
  const voiceSelect = document.getElementById('voice-select'); if(voiceSelect) voiceSelect.onchange = e => changeVoice(e.target.value);
  const speakVoiceSelect = document.getElementById('speak-voice-select'); if(speakVoiceSelect) speakVoiceSelect.onchange = e => changeVoice(e.target.value);
  populateVoiceSelects();
  if(window.speechSynthesis) window.speechSynthesis.onvoiceschanged = populateVoiceSelects;
  syncAudioButtons();
  
  // Điều khiển hiển thị Furigana và Nghĩa tiếng Việt ở Tab Speaking
  document.getElementById('btn-speak-toggle-furi').onclick = () => { state.furiganaVisible = !state.furiganaVisible; renderSpeaking(); };
  document.getElementById('btn-speak-toggle-vi').onclick = () => { state.speakingViVisible = !state.speakingViVisible; renderSpeaking(); };
  
  document.getElementById('btn-gen-speak-prompt').onclick = () => {
    const r = currentReading();
    if(!r) return alert('Hãy chọn một bài đọc trong Library hoặc nạp bài trước khi tạo hội thoại.');
    let textContext = r.rawText ? r.rawText.trim() : '';
    if (!textContext && r.readingHTML) { textContext = stripFurigana(r.readingHTML); }
    if(!textContext) return alert('Bài học này không có nội dung văn bản để phân tích ngữ cảnh.');
    document.getElementById('generated-speak-prompt').textContent = buildSpeakingPrompt(textContext);
    showSpeakingPromptStep();
    toast('Đã sinh prompt hội thoại lịch sự!');
  };
  
  document.getElementById('btn-copy-speak-prompt').onclick = () => {
    navigator.clipboard.writeText(document.getElementById('generated-speak-prompt').textContent).then(()=>toast('Đã copy prompt hội thoại'));
  };
  document.getElementById('btn-parse-speaking').onclick = () => {
    const err = document.getElementById('speaking-parse-error'); err.textContent = '';
    try {
      const parsed = parseAIJson(document.getElementById('speaking-ai-output').value);
      importSpeakingConversation(parsed);
    } catch(e) { err.textContent = '❌ ' + e.message; }
  };

  document.getElementById('btn-next-question').onclick=()=>{ state.quiz.current++; if(state.quiz.current>=state.quiz.questions.length) finishQuiz(); else renderQuestion(); };
  document.getElementById('btn-retry-quiz').onclick=()=>startQuiz(state.quiz.mode);
  document.getElementById('btn-change-quiz').onclick=showQuizSetup; document.getElementById('btn-back-quiz-setup').onclick=showQuizSetup;
  document.getElementById('btn-export-data').onclick=exportData; document.getElementById('btn-export-data-2').onclick=exportData;
  document.getElementById('btn-import-data').onclick=()=>{ try{ const data=JSON.parse(document.getElementById('import-json').value); state.readings=data.readings||[]; state.currentReadingId=data.currentReadingId||null; state.stats=data.stats||state.stats; normalizeData(); saveData(); renderAll(); toast('Import xong'); }catch(e){ alert(e.message); } };
  document.getElementById('btn-reset-all').onclick=()=>{ if(confirm('Xóa dữ liệu local?')){ localStorage.clear(); location.reload(); } };
  
  document.addEventListener('keydown', (e)=>{ const arena=document.getElementById('quiz-arena'); if(arena.style.display==='block'){ if(!state.quiz.answered && ['1','2','3','4'].includes(e.key)){ const btn=document.querySelectorAll('.quiz-option')[Number(e.key)-1]; if(btn) btn.click(); } else if(state.quiz.answered && (e.key===' '||e.key==='Enter')){ e.preventDefault(); document.getElementById('btn-next-question').click(); } } });
});

window.addEventListener('popstate', (e) => { const tab = (e.state && e.state.tab) || getTabFromHash() || state.activeTab || 'home'; goTab(tab, {push:false}); });