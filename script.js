(function() {
    let appData = null;
    let vocabList = [];
    let grammarList = [];
    let fcIndex = 0;
    const vocabMap = {};
    let currentJLPT = 'all';
    let savedArticles = JSON.parse(localStorage.getItem('jp_saved_articles') || '[]');
    let fcMeaningVisible = false;
    
    // Starred map: lưu các từ cần ôn tập
    let starredMap = JSON.parse(localStorage.getItem('jp_starred_map') || '{}');
    let selectedVoiceURI = localStorage.getItem('jp_selected_voice_uri') || 'auto';
    let selectedVoiceRate = Number(localStorage.getItem('jp_voice_rate') || '0.9');
    let shareRoomConfig = JSON.parse(localStorage.getItem('jp_share_room_config') || '{}');

    function saveStarredMap() { localStorage.setItem('jp_starred_map', JSON.stringify(starredMap)); }

    function syncStarredToVocab() {
        for (let v of vocabList) {
            if (starredMap[v.word] !== undefined) v.starred = starredMap[v.word];
            else v.starred = false;
        }
    }

    function setStar(word, state, options = {}) {
        const key = String(word || '').trim();
        if (!key) return;
        const current = !!starredMap[key];
        starredMap[key] = !!state;
        saveStarredMap();
        const vocabItem = vocabList.find(v => v.word === key);
        if (vocabItem) vocabItem.starred = !!state;
        if (options.refresh !== false) refreshActiveStudyPanel();
        if (!options.silent && current !== !!state) {
            showToast(state ? '⭐ Đã thêm vào ôn tập' : '☆ Đã bỏ khỏi ôn tập');
        }
    }

    function toggleStar(word) {
        setStar(word, !starredMap[word]);
    }

    function refreshActiveStudyPanel() {
        const activeMain = document.querySelector('.main-panel.active');
        if (activeMain && activeMain.id === 'panel-learn') {
            const activeSub = document.querySelector('.sub-panel.active');
            if (activeSub) {
                if (activeSub.id === 'sub-flashcard') updateFlashcardUI();
                else if (activeSub.id === 'sub-vocab') renderVocabList();
                else if (activeSub.id === 'sub-quiz') renderQuizStarHint();
            }
        }
    }

    // Quiz variables
    let quizWords = [];
    let quizAnswers = [];
    let quizCurrentIndex = 0;

    function showToast(msg) {
        const container = document.getElementById('toastContainer');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = msg;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 2100);
    }

    function isTypingTarget(target) {
        if (!target) return false;
        const tag = target.tagName?.toLowerCase();
        return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
    }

    function getAvailableVoices() {
        if (!('speechSynthesis' in window) || !window.speechSynthesis.getVoices) return [];
        return window.speechSynthesis.getVoices();
    }

    function getJapaneseVoices() {
        const voices = getAvailableVoices();
        const jp = voices.filter(v => (v.lang || '').toLowerCase().startsWith('ja'));
        return jp.length ? jp : voices;
    }

    function getSelectedVoice() {
        const voices = getAvailableVoices();
        if (selectedVoiceURI && selectedVoiceURI !== 'auto') {
            const exact = voices.find(v => v.voiceURI === selectedVoiceURI);
            if (exact) return exact;
        }
        return voices.find(v => v.lang === 'ja-JP' && /nanami|haruka|kyoko|keita|ichiro|google|japan|日本/i.test(v.name))
            || voices.find(v => (v.lang || '').toLowerCase().startsWith('ja'))
            || null;
    }

    function populateVoiceSelect() {
        const select = document.getElementById('voiceSelect');
        const rateSelect = document.getElementById('voiceRate');
        if (!select) return;
        const voices = getJapaneseVoices();
        const previous = select.value || selectedVoiceURI;
        select.innerHTML = '<option value="auto">Tự động chọn giọng Nhật tốt nhất</option>';
        voices.forEach((voice) => {
            const opt = document.createElement('option');
            opt.value = voice.voiceURI;
            opt.textContent = `${voice.name} (${voice.lang || 'unknown'})${voice.localService ? '' : ' online'}`;
            select.appendChild(opt);
        });
        select.value = Array.from(select.options).some(o => o.value === previous) ? previous : selectedVoiceURI;
        if (!select.value) select.value = 'auto';
        if (rateSelect) rateSelect.value = String(selectedVoiceRate || 0.9);
    }

    function makeJapaneseUtterance(text) {
        const content = String(text || '').trim();
        if (!content) return null;
        const utterance = new SpeechSynthesisUtterance(content);
        utterance.lang = 'ja-JP';
        utterance.rate = Number(selectedVoiceRate || 0.9);
        utterance.pitch = 1;
        const voice = getSelectedVoice();
        if (voice) utterance.voice = voice;
        return utterance;
    }

    function stopSpeech() {
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    }

    function speakJapanese(text) {
        if (!String(text || '').trim()) return;
        if (!('speechSynthesis' in window)) {
            showToast('⚠️ Trình duyệt này chưa hỗ trợ phát âm.');
            return;
        }
        stopSpeech();
        const utterance = makeJapaneseUtterance(text);
        if (utterance) window.speechSynthesis.speak(utterance);
    }

    function splitTextForSpeech(text) {
        const raw = String(text || '').replace(/\s+/g, ' ').trim();
        if (!raw) return [];
        const sentences = raw.match(/[^。！？!?]+[。！？!?]?/g) || [raw];
        const chunks = [];
        sentences.forEach(sentence => {
            const clean = sentence.trim();
            if (!clean) return;
            if (clean.length <= 180) {
                chunks.push(clean);
                return;
            }
            for (let i = 0; i < clean.length; i += 160) {
                chunks.push(clean.slice(i, i + 160));
            }
        });
        return chunks;
    }

    function speakArticle() {
        if (!('speechSynthesis' in window)) {
            showToast('⚠️ Trình duyệt này chưa hỗ trợ phát âm.');
            return;
        }
        const text = appData?.fullText || '';
        const chunks = splitTextForSpeech(text);
        if (!chunks.length) {
            showToast('⚠️ Chưa có bài đọc để nghe.');
            return;
        }
        stopSpeech();
        chunks.forEach((chunk, idx) => {
            const utterance = makeJapaneseUtterance(chunk);
            if (!utterance) return;
            if (idx === chunks.length - 1) {
                utterance.onend = () => showToast('✅ Đã đọc xong bài đọc.');
            }
            window.speechSynthesis.speak(utterance);
        });
        showToast(`▶ Đang đọc bài đọc (${chunks.length} đoạn)...`);
    }

    function toggleSpeechPause() {
        if (!('speechSynthesis' in window)) return;
        if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
            showToast('▶ Đọc tiếp.');
        } else if (window.speechSynthesis.speaking) {
            window.speechSynthesis.pause();
            showToast('⏸ Đã tạm dừng.');
        } else {
            showToast('⚠️ Chưa có nội dung đang đọc.');
        }
    }

    function speakVocabSequence(words) {
        if (!('speechSynthesis' in window)) {
            showToast('⚠️ Trình duyệt này chưa hỗ trợ phát âm.');
            return;
        }
        const valid = (words || []).filter(v => v && v.word);
        if (!valid.length) {
            showToast('⚠️ Chưa có từ để đọc.');
            return;
        }
        stopSpeech();
        valid.forEach((v, idx) => {
            const example = v.example && v.example.length <= 45 ? `。${v.example}` : '';
            const utterance = makeJapaneseUtterance(`${v.word}${example}`);
            if (!utterance) return;
            if (idx === valid.length - 1) utterance.onend = () => showToast('✅ Đã nghe xong danh sách từ.');
            window.speechSynthesis.speak(utterance);
        });
        showToast(`▶ Đang đọc ${valid.length} từ vựng...`);
    }

    if ('speechSynthesis' in window) {
        window.speechSynthesis.onvoiceschanged = populateVoiceSelect;
        setTimeout(populateVoiceSelect, 50);
        setTimeout(populateVoiceSelect, 600);
    }

    document.getElementById('voiceSelect')?.addEventListener('change', (e) => {
        selectedVoiceURI = e.target.value || 'auto';
        localStorage.setItem('jp_selected_voice_uri', selectedVoiceURI);
        showToast('✅ Đã đổi giọng đọc.');
    });
    document.getElementById('voiceRate')?.addEventListener('change', (e) => {
        selectedVoiceRate = Number(e.target.value || 0.9);
        localStorage.setItem('jp_voice_rate', String(selectedVoiceRate));
        showToast('✅ Đã đổi tốc độ đọc.');
    });
    document.getElementById('btnStopSpeech')?.addEventListener('click', stopSpeech);
    document.getElementById('btnStopVocabSpeech')?.addEventListener('click', stopSpeech);
    document.getElementById('btnStopArticle')?.addEventListener('click', stopSpeech);
    document.getElementById('btnPauseArticle')?.addEventListener('click', toggleSpeechPause);
    document.getElementById('btnSpeakArticle')?.addEventListener('click', speakArticle);
    document.getElementById('btnSpeakAllVocab')?.addEventListener('click', () => {
        const words = getVocabInDisplayOrder(getFilteredVocab());
        speakVocabSequence(words);
    });

    function getShareRoomValue() {
        const roomInput = document.getElementById('shareRoom');
        const pinInput = document.getElementById('sharePin');
        const room = String(roomInput?.value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
        const pin = String(pinInput?.value || '').trim();
        return { room, pin };
    }

    function saveShareRoomConfig(room) {
        if (!room) return;
        shareRoomConfig.room = room;
        localStorage.setItem('jp_share_room_config', JSON.stringify(shareRoomConfig));
    }

    function showShareRoomLink(room) {
        const box = document.getElementById('shareRoomLinkBox');
        const urlEl = document.getElementById('shareRoomUrl');
        if (!box || !urlEl || !room) return;
        const url = `${location.origin}/room/${encodeURIComponent(room)}`;
        urlEl.textContent = url;
        box.style.display = 'block';
    }

    async function shareApi(action, payload = {}) {
        const res = await fetch('/api/share', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, ...payload })
        });
        let json = null;
        try { json = await res.json(); } catch (e) { json = {}; }
        if (!res.ok || json.ok === false) {
            throw new Error(json.error || `Lỗi API ${res.status}`);
        }
        return json;
    }

    function setOnlineStatus(message, type = '') {
        const el = document.getElementById('onlineStatus');
        if (!el) return;
        el.textContent = message;
        el.className = `online-status ${type}`.trim();
    }

    function getLessonPayloadForShare() {
        if (!appData || !appData.fullText || appData.title === 'Hướng dẫn sử dụng') return null;
        const data = normalizeLessonData(appData);
        return {
            title: data.title || 'Bài học không tiêu đề',
            fullText: data.fullText || '',
            fullTranslation: data.fullTranslation || '',
            sentenceTranslations: data.sentenceTranslations || [],
            vocabulary: data.vocabulary || [],
            grammar: data.grammar || []
        };
    }

    async function saveCurrentArticleOnline() {
        const { room, pin } = getShareRoomValue();
        if (!room || !pin) { showToast('⚠️ Nhập room và PIN trước.'); return; }
        if (pin.length < 4) { showToast('⚠️ PIN nên có ít nhất 4 ký tự.'); return; }
        const lesson = getLessonPayloadForShare();
        if (!lesson) { showToast('⚠️ Chưa có bài học để lưu online.'); return; }
        const size = new Blob([JSON.stringify(lesson)]).size;
        if (size > 200 * 1024) {
            alert('Bài này hơi lớn. Giới hạn hiện tại là 200KB để tránh đầy dữ liệu.');
            return;
        }
        const ok = confirm('Bài này sẽ được lưu online. Ai biết room + PIN đều có thể xem.\n\nKhông lưu tài liệu công ty hoặc thông tin cá nhân. Tiếp tục?');
        if (!ok) return;
        const btn = document.getElementById('btnSaveOnline');
        const oldText = btn?.textContent;
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Đang lưu...'; }
        try {
            const result = await shareApi('save', { room, pin, article: lesson });
            saveShareRoomConfig(room);
            showShareRoomLink(room);
            showToast('✅ Đã lưu online.');
            setOnlineStatus(`Đã lưu: ${lesson.title}`,'ok');
            await loadOnlineList(false);
            if (result.warning) alert(result.warning);
        } catch (err) {
            setOnlineStatus(err.message, 'error');
            alert('Không lưu được online:\n' + err.message);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = oldText || '☁ Lưu bài hiện tại online'; }
        }
    }

    function renderOnlineList(items = []) {
        const list = document.getElementById('onlineList');
        const empty = document.getElementById('onlineEmpty');
        if (!list || !empty) return;
        if (!items.length) {
            list.innerHTML = '';
            empty.style.display = 'block';
            return;
        }
        empty.style.display = 'none';
        list.innerHTML = items.map((item) => {
            const date = item.createdAt ? new Date(item.createdAt).toLocaleString('vi-VN') : '';
            return `<div class="online-item">
                <div class="online-main">
                    <div class="online-title">${escapeHtml(item.title || 'Không tiêu đề')}</div>
                    <div class="online-meta">${escapeHtml(date)} · ${Number(item.vocabCount || 0)} từ · ${Number(item.grammarCount || 0)} ngữ pháp</div>
                </div>
                <div class="online-actions">
                    <button class="btn btn-small btn-primary online-open" data-id="${escapeAttr(item.id)}">📂 Mở</button>
                    <button class="btn btn-small btn-outline online-delete" data-id="${escapeAttr(item.id)}">🗑 Xóa</button>
                </div>
            </div>`;
        }).join('');
        list.querySelectorAll('.online-open').forEach(btn => {
            btn.addEventListener('click', () => openOnlineArticle(btn.dataset.id));
        });
        list.querySelectorAll('.online-delete').forEach(btn => {
            btn.addEventListener('click', () => deleteOnlineArticle(btn.dataset.id));
        });
    }

    async function loadOnlineList(showSuccess = true) {
        const { room, pin } = getShareRoomValue();
        if (!room || !pin) { showToast('⚠️ Nhập room và PIN trước.'); return; }
        const btn = document.getElementById('btnLoadOnlineList');
        const oldText = btn?.textContent;
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Đang tải...'; }
        try {
            const result = await shareApi('list', { room, pin });
            saveShareRoomConfig(room);
            showShareRoomLink(room);
            renderOnlineList(result.items || []);
            setOnlineStatus(`Room ${room}: ${result.items?.length || 0} bài online.`, 'ok');
            if (showSuccess) showToast('✅ Đã tải danh sách online.');
        } catch (err) {
            renderOnlineList([]);
            setOnlineStatus(err.message, 'error');
            alert('Không mở được danh sách:\n' + err.message);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = oldText || '📚 Mở danh sách online'; }
        }
    }

    async function openOnlineArticle(id) {
        const { room, pin } = getShareRoomValue();
        if (!room || !pin || !id) return;
        try {
            const result = await shareApi('get', { room, pin, id });
            if (!result.article) throw new Error('Không tìm thấy bài.');
            loadFromJSON(result.article);
            showToast('📂 Đã mở bài online.');
        } catch (err) {
            alert('Không mở được bài:\n' + err.message);
        }
    }

    async function deleteOnlineArticle(id) {
        const { room, pin } = getShareRoomValue();
        if (!room || !pin || !id) return;
        const ok = confirm('Xóa bài online này khỏi room?');
        if (!ok) return;
        try {
            await shareApi('delete', { room, pin, id });
            showToast('🗑 Đã xóa bài online.');
            await loadOnlineList(false);
        } catch (err) {
            alert('Không xóa được bài:\n' + err.message);
        }
    }

    function initShareRoomUI() {
        const roomInput = document.getElementById('shareRoom');
        const pinInput = document.getElementById('sharePin');
        if (roomInput && !roomInput.value) roomInput.value = shareRoomConfig.room || '';
        const pathMatch = location.pathname.match(/^\/room\/([a-zA-Z0-9_-]+)/);
        if (pathMatch && roomInput) {
            roomInput.value = pathMatch[1].toLowerCase();
            switchMainTab('share');
            showShareRoomLink(roomInput.value);
            setOnlineStatus('Nhập PIN rồi bấm “Mở danh sách online”.');
            setTimeout(() => pinInput?.focus(), 100);
        } else if (roomInput?.value) {
            showShareRoomLink(roomInput.value);
        }
    }

    document.getElementById('btnSaveOnline')?.addEventListener('click', saveCurrentArticleOnline);
    document.getElementById('btnLoadOnlineList')?.addEventListener('click', () => loadOnlineList(true));
    document.getElementById('btnCopyRoomLink')?.addEventListener('click', () => {
        const text = document.getElementById('shareRoomUrl')?.textContent || '';
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => showToast('📋 Đã copy link phòng.'));
    });
    document.getElementById('shareRoom')?.addEventListener('input', (e) => {
        const clean = String(e.target.value || '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
        if (e.target.value !== clean) e.target.value = clean;
        if (clean) showShareRoomLink(clean);
    });

    function getEasyExample(wordObj, type = 'vocab') {
        if (type === 'vocab') {
            if (wordObj.example && wordObj.example.length < 60) return wordObj.example;
            const easyExamples = {
                '食べる': '私は毎日ご飯を食べます。',
                '飲む': '水を飲みます。',
                '行く': '学校へ行きます。',
                '見る': 'テレビを見ます。',
                '聞く': '音楽を聞きます。',
                '話す': '日本語を話します。',
                '読む': '本を読みます。',
                '書く': '手紙を書きます。',
                '買う': 'スーパーで買い物を買います。',
                '作る': '料理を作ります。'
            };
            if (easyExamples[wordObj.word]) return easyExamples[wordObj.word];
            return `Ví dụ: ${wordObj.word} là từ vựng tiếng Nhật.`;
        } else {
            if (wordObj.example && wordObj.example.length < 60) return wordObj.example;
            return `Ví dụ: ${wordObj.pattern} được sử dụng trong câu.`;
        }
    }

    function autoSaveCurrentArticle() {
        if (!appData) return;
        const title = appData.title || 'Bài học ' + new Date().toLocaleDateString();
        const existingIndex = savedArticles.findIndex(a => a.title === title && a.fullText === appData.fullText);
        if (existingIndex >= 0) {
            savedArticles[existingIndex] = { ...appData, savedAt: new Date().toISOString() };
        } else {
            savedArticles.push({ ...appData, savedAt: new Date().toISOString() });
        }
        localStorage.setItem('jp_saved_articles', JSON.stringify(savedArticles));
    }

    // TABS
    function switchMainTab(tabName) {
        document.querySelectorAll('.main-tab').forEach(t => t.classList.remove('active'));
        const activeTab = document.querySelector(`.main-tab[data-tab="${tabName}"]`);
        if (activeTab) activeTab.classList.add('active');
        document.querySelectorAll('.main-panel').forEach(p => p.classList.remove('active'));
        const activePanel = document.getElementById(`panel-${tabName}`);
        if (activePanel) activePanel.classList.add('active');
        if (tabName === 'learn') switchSubTab('read');
        if (tabName === 'saved') renderSavedList();
        if (tabName === 'share') initShareRoomUI();
    }

    function switchSubTab(subName) {
        document.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
        const activeSubTab = document.querySelector(`.sub-tab[data-sub="${subName}"]`);
        if (activeSubTab) activeSubTab.classList.add('active');
        document.querySelectorAll('.sub-panel').forEach(p => p.classList.remove('active'));
        const activeSubPanel = document.getElementById(`sub-${subName}`);
        if (activeSubPanel) activeSubPanel.classList.add('active');
        // Cập nhật số lượng và render
        applyJLPTFilter(); // cập nhật filteredCount
        if (subName === 'flashcard') { fcIndex = 0; updateFlashcardUI(); }
        else if (subName === 'quiz') updateQuizUI();
        else if (subName === 'vocab') renderVocabList();
        else if (subName === 'grammar') renderGrammarList();
        else if (subName === 'translation') renderTranslation();
        // sub-read không cần render gì thêm
    }

    document.querySelectorAll('.main-tab').forEach(tab => tab.addEventListener('click', () => switchMainTab(tab.dataset.tab)));
    document.querySelectorAll('.sub-tab').forEach(tab => tab.addEventListener('click', () => switchSubTab(tab.dataset.sub)));

    function applyJLPTFilter() {
        const filterSelect = document.getElementById('jlptFilter');
        currentJLPT = filterSelect ? filterSelect.value : 'all';
        let filtered = [];
        if (currentJLPT === 'starred') filtered = vocabList.filter(v => v.starred === true);
        else if (currentJLPT === 'all') filtered = vocabList;
        else filtered = vocabList.filter(v => v.jlpt === currentJLPT);
        const filteredCountSpan = document.getElementById('filteredCount');
        if (filteredCountSpan) filteredCountSpan.textContent = vocabList.length > 0 ? `(${filtered.length} từ)` : '';
        return filtered;
    }

    const filterSelect = document.getElementById('jlptFilter');
    if (filterSelect) {
        filterSelect.addEventListener('change', () => {
            if (document.getElementById('panel-learn')?.classList.contains('active')) {
                // Cập nhật số lượng
                const filtered = applyJLPTFilter();
                const activeSub = document.querySelector('.sub-panel.active');
                if (activeSub) {
                    if (activeSub.id === 'sub-vocab') renderVocabList();
                    else if (activeSub.id === 'sub-flashcard') { fcIndex = 0; updateFlashcardUI(); }
                    else if (activeSub.id === 'sub-quiz') updateQuizUI();
                    // sub-read và sub-grammar không bị ảnh hưởng bởi filter
                }
            }
        });
    }

    // PROMPT
    document.getElementById('btnGeneratePrompt')?.addEventListener('click', () => {
        const text = document.getElementById('inputText')?.value.trim();
        if (!text) { showToast('⚠️ Nhập nội dung bài đọc.'); return; }
        const prompt = `Bạn là trợ lý dạy tiếng Nhật cho người Việt đang học JLPT N2. Hãy phân tích đoạn văn sau và trả về **chính xác một đối tượng JSON thuần**. Không dùng markdown, không giải thích ngoài JSON.

Cấu trúc bắt buộc:
{
  "title": "Tiêu đề phù hợp bằng tiếng Việt",
  "fullText": "Toàn bộ đoạn văn gốc, giữ nguyên xuống dòng",
  "fullTranslation": "Bản dịch tiếng Việt tự nhiên, sát nghĩa toàn bài",
  "sentenceTranslations": [
    { "jp": "Một câu tiếng Nhật gốc", "vi": "Dịch tiếng Việt của câu đó" }
  ],
  "vocabulary": [
    {
      "word": "Từ hoặc cụm từ tiếng Nhật ở dạng thường gặp/từ điển",
      "reading": "Cách đọc bằng hiragana/katakana",
      "meaning": "Nghĩa tiếng Việt sát ngữ cảnh",
      "jlpt": "N5/N4/N3/N2/N1 hoặc ngoài JLPT",
      "type": "danh từ/động từ/tính từ/trạng từ/cụm từ...",
      "importance": "high/medium/low",
      "example": "Câu ví dụ ngắn bằng tiếng Nhật",
      "exampleMeaning": "Dịch câu ví dụ sang tiếng Việt"
    }
  ],
  "grammar": [
    {
      "pattern": "Mẫu ngữ pháp",
      "meaning": "Ý nghĩa bằng tiếng Việt",
      "usage": "Cách dùng thật ngắn",
      "example": "Câu ví dụ tiếng Nhật",
      "exampleMeaning": "Dịch câu ví dụ",
      "note": "Lưu ý/ngữ cảnh nếu có"
    }
  ]
}

Yêu cầu quan trọng:
- Lấy NHIỀU từ vựng hơn bình thường: ưu tiên 40–80 mục nếu đoạn đủ dài.
- Với mỗi từ vựng, bắt buộc thêm importance:
  + high = từ quan trọng, nên học trước để hiểu bài/N2-N3 hữu ích.
  + medium = từ thường gặp, nên biết để đọc tốt hơn.
  + low = từ phụ/biết thêm, tên riêng hoặc từ ít ưu tiên hơn.
- Không chỉ lấy từ khó; hãy lấy cả từ hay gặp, cụm động từ, cụm danh từ, trạng từ, liên từ hữu ích.
- Không lặp cùng một từ. Nếu có chia thể, đưa về dạng từ điển nhưng nghĩa phải sát ngữ cảnh.
- Ưu tiên từ N2/N3, nhưng vẫn giữ N4/N5 nếu từ đó cần để hiểu bài.
- Không tách trợ từ đơn lẻ như は, が, を trừ khi có điểm ngữ pháp đặc biệt.
- Ví dụ phải ngắn, dễ hiểu, đúng với nghĩa trong bài.
- Bản dịch tiếng Việt cần tự nhiên, không dịch word-by-word quá cứng.

Đoạn văn:
"""
${text}
"""`;
        const promptBox = document.getElementById('promptBox');
        if (promptBox) promptBox.textContent = prompt;
        const container = document.getElementById('promptContainer');
        if (container) container.style.display = 'block';
        showToast('✅ Prompt đã tạo. Nhấn nút Copy.');
    });

    document.getElementById('btnCopyPrompt')?.addEventListener('click', () => {
        const promptBox = document.getElementById('promptBox');
        if (promptBox) navigator.clipboard.writeText(promptBox.textContent).then(() => showToast('📋 Đã copy!'));
    });

    document.getElementById('btnFetchUrl')?.addEventListener('click', async function() {
        const url = document.getElementById('urlInput')?.value.trim();
        if (!url) return;
        this.textContent = '⏳'; this.disabled = true;
        try {
            const proxies = [
                `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
                `https://corsproxy.io/?${encodeURIComponent(url)}`,
                `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
            ];
            let html = null;
            for (const proxy of proxies) {
                try {
                    const r = await fetch(proxy, { signal: AbortSignal.timeout(15000) });
                    if (r.ok) { html = await r.text(); break; }
                } catch(e) {}
            }
            if (!html) {
                try { const r = await fetch(url, { signal: AbortSignal.timeout(10000) }); if (r.ok) html = await r.text(); } catch(e) {}
            }
            if (!html) { alert('Không tải được URL.'); return; }
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const main = doc.querySelector('article, .entry-content, main, body');
            if (main) {
                main.querySelectorAll('script, style, nav, footer, header').forEach(el => el.remove());
                const inputText = document.getElementById('inputText');
                if (inputText) inputText.value = main.textContent.replace(/\s{2,}/g, '\n').trim();
                showToast('✅ Đã lấy nội dung.');
            }
        } catch(e) { alert('Lỗi: ' + e.message); }
        finally { this.textContent = '🌐 Tải'; this.disabled = false; }
    });

    function normalizeLessonData(json) {
        const data = { ...json };
        data.fullTranslation = data.fullTranslation || data.translation || data.viTranslation || data.vietnameseTranslation || '';
        data.sentenceTranslations = data.sentenceTranslations || data.translations || data.sentences || [];
        if (!Array.isArray(data.sentenceTranslations)) data.sentenceTranslations = [];
        data.vocabulary = Array.isArray(data.vocabulary) ? data.vocabulary : [];
        data.grammar = Array.isArray(data.grammar) ? data.grammar : [];
        return data;
    }

    // LOAD JSON
    function loadFromJSON(json) {
        if (!json.fullText || !json.vocabulary) {
            alert('JSON không hợp lệ: thiếu fullText hoặc vocabulary');
            return;
        }
        appData = normalizeLessonData(json);
        vocabList = appData.vocabulary || [];
        grammarList = appData.grammar || [];
        for (let k in vocabMap) delete vocabMap[k];
        for (const v of vocabList) {
            vocabMap[v.word] = v;
            if (starredMap[v.word] !== undefined) v.starred = starredMap[v.word];
            else v.starred = false;
        }
        syncStarredToVocab();
        
        const tabLearn = document.getElementById('tabLearn');
        const filterBar = document.getElementById('jlptFilterBar');
        if (tabLearn) tabLearn.style.display = 'inline-flex';
        if (filterBar) filterBar.style.display = 'flex';
        
        updateAllUI();
        autoSaveCurrentArticle();
        switchMainTab('learn');
        showToast('✅ Dữ liệu đã sẵn sàng và tự động lưu!');
    }

    document.getElementById('btnLoadJson')?.addEventListener('click', () => {
        const raw = document.getElementById('jsonInput')?.value.trim();
        if (!raw) { showToast('⚠️ Dán JSON vào ô bên trên.'); return; }
        let json = null;
        try { json = JSON.parse(raw); } catch(e) {
            const cleaned = raw.replace(/```json\s*|\s*```/g, '').trim();
            try { json = JSON.parse(cleaned); } catch(e2) { alert('JSON không hợp lệ.\n' + e2.message); return; }
        }
        loadFromJSON(json);
    });

    function renderSavedList() {
        const list = document.getElementById('savedList');
        const empty = document.getElementById('savedEmpty');
        if (!list || !empty) return;
        if (savedArticles.length === 0) { list.innerHTML = ''; empty.style.display = 'block'; return; }
        empty.style.display = 'none';
        list.innerHTML = savedArticles.map((a, i) => `
            <div class="saved-item">
                <div>
                    <div class="title">${escapeHtml(a.title || 'Không tiêu đề')}</div>
                    <div style="font-size:0.85rem; color:var(--sub);">${a.vocabulary?.length || 0} từ, ${a.grammar?.length || 0} ngữ pháp</div>
                </div>
                <div class="actions">
                    <button class="btn btn-small btn-primary" data-idx="${i}">📂 Mở</button>
                    <button class="btn btn-small btn-outline" data-idx="${i}" data-action="delete">🗑 Xóa</button>
                </div>
            </div>
        `).join('');
        list.querySelectorAll('button').forEach(btn => {
            const idx = parseInt(btn.dataset.idx);
            if (btn.dataset.action === 'delete') {
                btn.addEventListener('click', () => {
                    savedArticles.splice(idx, 1);
                    localStorage.setItem('jp_saved_articles', JSON.stringify(savedArticles));
                    renderSavedList();
                    showToast('🗑 Đã xóa bài.');
                });
            } else {
                btn.addEventListener('click', () => {
                    loadFromJSON(savedArticles[idx]);
                });
            }
        });
    }

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str).replace(/[&<>]/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
    }

    function escapeAttr(str) {
        return escapeHtml(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function updateAllUI() {
        renderArticle();
        renderVocabList();
        renderGrammarList();
        renderTranslation();
        updateCounts();
        updateFlashcardUI();
        updateQuizUI();
        applyJLPTFilter(); // cập nhật số lượng
    }

    function updateCounts() {
        const vocabSpan = document.getElementById('vocabCount');
        const grammarSpan = document.getElementById('grammarCount');
        if (vocabSpan) vocabSpan.textContent = vocabList.length;
        if (grammarSpan) grammarSpan.textContent = grammarList.length;
    }

    function renderArticle() {
        const container = document.getElementById('articleContent');
        if (!container) return;
        if (!appData?.fullText) { container.textContent = 'Chưa có bài đọc. Hãy tải JSON lên.'; return; }
        const sorted = vocabList.map(v=>v.word).sort((a,b)=>b.length-a.length);
        if(!sorted.length){ container.textContent = appData.fullText; return; }
        const escaped = sorted.map(w=>w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
        const regex = new RegExp(`(${escaped.join('|')})`, 'g');
        const safeText = escapeHtml(appData.fullText);
        container.innerHTML = safeText.replace(regex, (match) => {
            if(vocabMap[match]) return `<span class="word" data-word="${escapeAttr(match)}">${escapeHtml(match)}</span>`;
            return match;
        });
        container.querySelectorAll('span.word').forEach(span => span.addEventListener('click', (e) => {
            e.stopPropagation();
            const v = vocabMap[span.dataset.word];
            if(v) showTooltip(e, v);
        }));
        document.addEventListener('click', (e) => { if(!e.target.classList.contains('word')) document.getElementById('wordTooltip').style.display='none'; });
    }

    function showTooltip(event, vocab) {
        const tip = document.getElementById('wordTooltip');
        if (!tip) return;
        tip.innerHTML = `
            <div class="tooltip-head">
                <div>
                    <div class="jp">${escapeHtml(vocab.word)}</div>
                    <div class="reading">${escapeHtml(vocab.reading || '')}</div>
                </div>
                <button class="sound-btn tooltip-speak" type="button" title="Phát âm">🔊</button>
            </div>
            <div class="meaning">${escapeHtml(vocab.meaning || '')}</div>
            ${vocab.example ? `<div class="example">📖 ${escapeHtml(vocab.example)}</div>` : ''}
            ${vocab.exampleMeaning ? `<div class="example-meaning">${escapeHtml(vocab.exampleMeaning)}</div>` : ''}
            <div class="tag-row">
                ${vocab.jlpt ? `<span class="tag">${escapeHtml(vocab.jlpt)}</span>` : ''}
                ${vocab.type ? `<span class="tag tag-soft">${escapeHtml(vocab.type)}</span>` : ''}
            </div>
        `;
        tip.querySelector('.tooltip-speak')?.addEventListener('click', (e) => {
            e.stopPropagation();
            speakJapanese(vocab.word);
        });
        tip.style.left = Math.min(event.clientX+10, window.innerWidth-340)+'px';
        tip.style.top = Math.max(event.clientY-40, 10)+'px';
        tip.style.display = 'block';
    }

    function getImportanceKey(vocab) {
        const raw = String(vocab?.importance || vocab?.priority || vocab?.level || '').trim().toLowerCase();
        if (['high', 'important', 'quan trọng', 'qtrong', '1', 'must'].includes(raw)) return 'high';
        if (['medium', 'common', 'thường gặp', 'thuong gap', '2', 'normal'].includes(raw)) return 'medium';
        if (['low', 'extra', 'phụ', 'phu', '3', 'optional'].includes(raw)) return 'low';
        const jlpt = String(vocab?.jlpt || '').toUpperCase();
        if (jlpt === 'N2' || jlpt === 'N1' || jlpt === 'N3') return 'high';
        if (jlpt === 'N4' || jlpt === 'N5') return 'medium';
        return 'low';
    }

    function getImportanceMeta(key) {
        if (key === 'high') return { label: 'Quan trọng', icon: '🔥', className: 'importance-high' };
        if (key === 'medium') return { label: 'Thường gặp', icon: '🌱', className: 'importance-medium' };
        return { label: 'Phụ / biết thêm', icon: '📌', className: 'importance-low' };
    }

    function groupVocabByImportance(items) {
        return {
            high: items.filter(v => getImportanceKey(v) === 'high'),
            medium: items.filter(v => getImportanceKey(v) === 'medium'),
            low: items.filter(v => getImportanceKey(v) === 'low')
        };
    }

    function getVocabInDisplayOrder(items) {
        const groups = groupVocabByImportance(items || []);
        return [...groups.high, ...groups.medium, ...groups.low];
    }

    function renderVocabList() {
        const list = document.getElementById('vocabList'), empty = document.getElementById('vocabEmpty');
        const summary = document.getElementById('vocabGroupSummary');
        if (!list || !empty) return;
        const filtered = applyJLPTFilter();
        if(filtered.length===0){
            list.innerHTML='';
            if (summary) summary.innerHTML = '';
            empty.style.display='block';
            return;
        }
        empty.style.display='none';
        const groups = groupVocabByImportance(filtered);
        if (summary) {
            summary.innerHTML = `
                <span>🔥 Quan trọng: <strong>${groups.high.length}</strong></span>
                <span>🌱 Thường gặp: <strong>${groups.medium.length}</strong></span>
                <span>📌 Phụ: <strong>${groups.low.length}</strong></span>
            `;
        }
        list.innerHTML = ['high', 'medium', 'low'].map(key => {
            const items = groups[key];
            if (!items.length) return '';
            const meta = getImportanceMeta(key);
            const itemHtml = items.map((v, idx) => {
                const starred = v.starred ? 'starred' : '';
                const starChar = v.starred ? '★' : '☆';
                const example = getEasyExample(v, 'vocab');
                return `<li class="vocab-row ${meta.className}">
                    <div class="vocab-row-no">${idx + 1}</div>
                    <div class="vocab-row-word">
                        <button class="sound-btn vocab-speak" type="button" data-speak="${escapeAttr(v.word)}" title="Phát âm">🔊</button>
                        <div class="vocab-main">
                            <div><span class="jp">${escapeHtml(v.word)}</span></div>
                            <div class="reading">${escapeHtml(v.reading||'')}</div>
                        </div>
                    </div>
                    <div class="vocab-row-meaning">${escapeHtml(v.meaning||'')}</div>
                    <div class="vocab-row-tags">
                        ${v.jlpt?`<span class="tag">${escapeHtml(v.jlpt)}</span>`:''}
                        ${v.type?`<span class="tag tag-soft">${escapeHtml(v.type)}</span>`:''}
                    </div>
                    <div class="vocab-row-example">
                        <div>📖 ${escapeHtml(example)}</div>
                        ${v.exampleMeaning ? `<div class="example-meaning">${escapeHtml(v.exampleMeaning)}</div>` : ''}
                    </div>
                    <div class="vocab-row-star">
                        <span class="star-icon-list ${starred}" data-word="${escapeAttr(v.word)}" title="Lưu để ôn">${starChar}</span>
                    </div>
                </li>`;
            }).join('');
            return `<li class="vocab-group-wrap">
                <div class="vocab-group-title ${meta.className}">${meta.icon} ${meta.label} <span>${items.length} từ</span></div>
                <ol class="vocab-horizontal-list">${itemHtml}</ol>
            </li>`;
        }).join('');
        list.querySelectorAll('.star-icon-list').forEach(el => {
            const word = el.dataset.word;
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleStar(word);
                renderVocabList();
            });
        });
        list.querySelectorAll('.vocab-speak').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                speakJapanese(btn.dataset.speak);
            });
        });
    }
    
    function renderGrammarList() {
        const list = document.getElementById('grammarList'), empty = document.getElementById('grammarEmpty');
        if (!list || !empty) return;
        if(grammarList.length===0){ list.innerHTML=''; empty.style.display='block'; return; }
        empty.style.display='none';
        list.innerHTML = grammarList.map((g, idx)=>`<li class="card grammar-card">
            <div class="grammar-index">${idx + 1}</div>
            <div class="grammar-body">
                <div class="jp grammar-pattern">${escapeHtml(g.pattern)}</div>
                <div class="grammar-meaning">${escapeHtml(g.meaning)}</div>
                ${g.usage ? `<div class="grammar-usage">🧩 ${escapeHtml(g.usage)}</div>` : ''}
                ${g.example?`<div class="grammar-example">📖 ${escapeHtml(g.example)}</div>`:`<div class="grammar-example">📖 ${escapeHtml(getEasyExample(g, 'grammar'))}</div>`}
                ${g.exampleMeaning?`<div class="example-meaning">${escapeHtml(g.exampleMeaning)}</div>`:''}
                ${g.note?`<div class="grammar-note">💡 ${escapeHtml(g.note)}</div>`:''}
            </div>
        </li>`).join('');
    }

    function renderTranslation() {
        const container = document.getElementById('translationContent');
        if (!container) return;
        if (!appData) {
            container.innerHTML = '<div class="empty">Chưa có dữ liệu bài dịch.</div>';
            return;
        }
        const fullTranslation = appData.fullTranslation || appData.translation || appData.viTranslation || appData.vietnameseTranslation || '';
        const sentenceTranslations = Array.isArray(appData.sentenceTranslations) ? appData.sentenceTranslations : [];
        if (!fullTranslation && sentenceTranslations.length === 0) {
            container.innerHTML = `
                <div class="empty">Chưa có bài dịch. Hãy tạo lại prompt mới ở tab Nhập liệu & Prompt để AI trả thêm <strong>fullTranslation</strong> và <strong>sentenceTranslations</strong>.</div>
            `;
            return;
        }
        const sentenceHtml = sentenceTranslations.map((item, idx) => {
            const jp = item.jp || item.sentence || item.text || item.japanese || '';
            const vi = item.vi || item.translation || item.meaning || item.vietnamese || '';
            return `<div class="translation-pair">
                <div class="translation-num">${idx + 1}</div>
                <div class="translation-jp-col">
                    <div class="pair-label">日本語</div>
                    <div class="translation-jp">${escapeHtml(jp)}</div>
                </div>
                <div class="translation-vi-col">
                    <div class="pair-label">Tiếng Việt</div>
                    <div class="translation-vi">${escapeHtml(vi)}</div>
                </div>
            </div>`;
        }).join('');
        container.innerHTML = `
            ${fullTranslation ? `<div class="translation-full card-box"><h3>🌏 Dịch toàn bài</h3><p>${escapeHtml(fullTranslation)}</p></div>` : ''}
            ${sentenceHtml ? `<div class="translation-list"><div class="translation-list-head"><h3>🔎 Song ngữ từng câu</h3><button class="btn btn-small btn-outline" id="btnToggleSentenceVi">Ẩn/hiện dịch Việt</button></div>${sentenceHtml}</div>` : ''}
        `;
        container.querySelector('#btnToggleSentenceVi')?.addEventListener('click', () => {
            container.querySelector('.translation-list')?.classList.toggle('hide-vi');
        });
    }

    // FLASHCARD
    function getFilteredVocab() { 
        if (currentJLPT === 'starred') return vocabList.filter(v => v.starred === true);
        if (currentJLPT === 'all') return vocabList;
        return vocabList.filter(v => v.jlpt === currentJLPT);
    }
    
    function updateFlashcardUI() {
        const filtered = getFilteredVocab();
        const fcWord = document.getElementById('fcWord');
        const fcReading = document.getElementById('fcReading');
        const fcMeaning = document.getElementById('fcMeaning');
        const fcBack = document.getElementById('fcBack');
        const fcProgress = document.getElementById('fcProgress');
        const starIcon = document.getElementById('starIcon');
        if (!fcWord || !fcReading || !fcMeaning || !fcBack || !fcProgress) return;
        
        if (filtered.length === 0) {
            fcWord.textContent = '?';
            fcReading.textContent = '';
            fcMeaning.textContent = '';
            fcProgress.textContent = '0/0';
            fcBack.style.opacity = '0';
            fcBack.style.visibility = 'hidden';
            if (starIcon) starIcon.style.display = 'none';
            return;
        }
        if (starIcon) starIcon.style.display = 'block';
        if (fcIndex >= filtered.length) fcIndex = 0;
        const v = filtered[fcIndex];
        fcWord.textContent = v.word;
        fcWord.title = 'Bấm để nghe phát âm';
        fcWord.onclick = () => speakJapanese(v.word);
        fcWord.classList.add('clickable-sound');
        fcReading.textContent = v.reading || '';
        fcMeaning.textContent = v.meaning || '';
        fcProgress.textContent = `${fcIndex+1}/${filtered.length}`;
        
        // Cập nhật ngôi sao
        if (starIcon) {
            starIcon.textContent = v.starred ? '★' : '☆';
            starIcon.classList.toggle('starred', v.starred);
            // Xóa event cũ để tránh trùng, gán mới
            const newStar = starIcon.cloneNode(true);
            starIcon.parentNode.replaceChild(newStar, starIcon);
            const newStarIcon = document.getElementById('starIcon');
            if (newStarIcon) {
                newStarIcon.onclick = () => toggleStar(v.word);
            }
        }
        
        fcMeaningVisible = false;
        fcBack.style.opacity = '0';
        fcBack.style.visibility = 'hidden';
    }

    function toggleMeaning() {
        fcMeaningVisible = !fcMeaningVisible;
        const fcBack = document.getElementById('fcBack');
        if (fcBack) {
            fcBack.style.opacity = fcMeaningVisible ? '1' : '0';
            fcBack.style.visibility = fcMeaningVisible ? 'visible' : 'hidden';
        }
    }

    document.getElementById('btnPrevCard')?.addEventListener('click', () => {
        const f = getFilteredVocab();
        if (f.length) { fcIndex = (fcIndex - 1 + f.length) % f.length; updateFlashcardUI(); }
    });
    document.getElementById('btnNextCard')?.addEventListener('click', () => {
        const f = getFilteredVocab();
        if (f.length) { fcIndex = (fcIndex + 1) % f.length; updateFlashcardUI(); }
    });
    document.getElementById('btnToggleMeaning')?.addEventListener('click', toggleMeaning);
    document.getElementById('btnSpeakCard')?.addEventListener('click', () => {
        const filtered = getFilteredVocab();
        if (filtered.length && filtered[fcIndex]) speakJapanese(filtered[fcIndex].word);
    });

    // Focus Mode
    function enableFocusMode() {
        document.body.classList.add('focus-mode');
        document.getElementById('btnFocusMode').style.display = 'none';
        document.getElementById('exitFocusBtn').style.display = 'block';
    }
    function disableFocusMode() {
        document.body.classList.remove('focus-mode');
        document.getElementById('btnFocusMode').style.display = 'inline-flex';
        document.getElementById('exitFocusBtn').style.display = 'none';
    }
    document.getElementById('btnFocusMode')?.addEventListener('click', enableFocusMode);
    document.getElementById('btnExitFocus')?.addEventListener('click', disableFocusMode);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.body.classList.contains('focus-mode')) {
            disableFocusMode();
        }
    });

    function renderQuizStarHint() {
        // Giữ quiz hiện tại không bị reset khi sao được cập nhật ở panel khác.
    }

    // QUIZ
    function updateQuizUI() {
        const area = document.getElementById('quizArea'), empty = document.getElementById('quizEmpty');
        const filtered = getFilteredVocab();
        if (!area || !empty) return;
        if (filtered.length < 4) { area.style.display = 'none'; empty.style.display = 'block'; return; }
        empty.style.display = 'none'; area.style.display = 'block';
        
        const maxQuestions = Math.min(10, filtered.length);
        const shuffled = [...filtered];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        quizWords = shuffled.slice(0, maxQuestions);
        quizAnswers = new Array(quizWords.length).fill(false);
        quizCurrentIndex = 0;
        
        const progressBar = document.getElementById('quizProgressBar');
        const progressText = document.getElementById('quizProgressText');
        if (progressBar) progressBar.style.width = '0%';
        if (progressText) progressText.textContent = `0/${quizWords.length}`;
        
        document.getElementById('quizSummary').style.display = 'none';
        displayQuizQuestion();
    }

    function displayQuizQuestion() {
        if (quizCurrentIndex >= quizWords.length) {
            endQuiz();
            return;
        }
        const currentWord = quizWords[quizCurrentIndex];
        document.getElementById('quizWord').textContent = currentWord.word;
        const quizReading = document.getElementById('quizReading');
        if (quizReading) quizReading.textContent = currentWord.reading ? `【${currentWord.reading}】` : '';
        
        const allVocab = getFilteredVocab();
        const otherWords = allVocab.filter(w => w.word !== currentWord.word);
        const options = [currentWord];
        while (options.length < 4 && otherWords.length) {
            const randIndex = Math.floor(Math.random() * otherWords.length);
            options.push(otherWords[randIndex]);
            otherWords.splice(randIndex, 1);
        }
        for (let i = options.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [options[i], options[j]] = [options[j], options[i]];
        }
        
        const optsDiv = document.getElementById('quizOptions');
        optsDiv.innerHTML = options.map((opt, idx) => `
            <div class="quiz-option" data-word="${escapeAttr(opt.word)}" data-index="${idx}">
                <span class="option-number">${idx+1}.</span> ${escapeHtml(opt.meaning || '(chưa có nghĩa)')}
            </div>
        `).join('');
        
        optsDiv.querySelectorAll('.quiz-option').forEach(opt => {
            opt.classList.remove('correct', 'wrong', 'disabled');
            opt.style.pointerEvents = 'auto';
            opt.addEventListener('click', () => answerQuizOption(opt));
        });
        document.getElementById('quizResult').innerHTML = '';
    }

    function answerQuizOption(optionEl) {
        if (!optionEl || optionEl.classList.contains('disabled')) return;
        const currentWord = quizWords[quizCurrentIndex];
        if (!currentWord) return;
        const selectedWord = optionEl.dataset.word;
        const isCorrect = (selectedWord === currentWord.word);
        quizAnswers[quizCurrentIndex] = isCorrect;
        if (isCorrect) {
            optionEl.classList.add('correct');
            document.getElementById('quizResult').innerHTML = '✅ Chính xác! Nhấn Enter hoặc Space để qua câu tiếp.';
        } else {
            optionEl.classList.add('wrong');
            const wasStarred = !!starredMap[currentWord.word];
            setStar(currentWord.word, true, { silent: true, refresh: false });
            document.getElementById('quizResult').innerHTML = `❌ Sai rồi! Đáp án đúng là: ${escapeHtml(currentWord.meaning)}<br><span class="auto-star-note">⭐ ${wasStarred ? 'Từ này đã nằm trong ôn tập.' : 'Đã tự thêm từ này vào ôn tập.'}</span>`;
            document.querySelectorAll('.quiz-option').forEach(opt2 => {
                if (opt2.dataset.word === currentWord.word) opt2.classList.add('correct');
            });
        }
        document.querySelectorAll('.quiz-option').forEach(opt2 => {
            opt2.classList.add('disabled');
            opt2.style.pointerEvents = 'none';
        });
        const percent = ((quizCurrentIndex + 1) / quizWords.length) * 100;
        const progressBar = document.getElementById('quizProgressBar');
        const progressText = document.getElementById('quizProgressText');
        if (progressBar) progressBar.style.width = `${percent}%`;
        if (progressText) progressText.textContent = `${quizCurrentIndex+1}/${quizWords.length}`;
    }

    function selectQuizOption(index) {
        const options = document.querySelectorAll('.quiz-option');
        const option = options[index];
        if (option) answerQuizOption(option);
    }

    function isQuizAnswered() {
        return Array.from(document.querySelectorAll('.quiz-option')).some(opt => opt.classList.contains('correct') || opt.classList.contains('wrong'));
    }

    function nextQuizQuestion() {
        if (quizCurrentIndex < quizWords.length) {
            if (!isQuizAnswered()) {
                showToast('⚠️ Hãy chọn đáp án trước khi sang câu tiếp!');
                return;
            }
            quizCurrentIndex++;
            displayQuizQuestion();
        } else {
            endQuiz();
        }
    }

    function endQuiz() {
        const total = quizAnswers.length;
        const correct = quizAnswers.filter(a => a === true).length;
        const percent = Math.round((correct / total) * 100);
        let icon = '';
        let message = '';
        if (percent === 100) { icon = '🎉🔥🌟'; message = 'Hoàn hảo! Bạn thật sự xuất sắc!'; }
        else if (percent >= 80) { icon = '🔥👍'; message = 'Rất tốt! Gần như thuộc bài rồi!'; }
        else if (percent >= 60) { icon = '📖✨'; message = 'Khá ổn, hãy ôn lại một chút nữa nhé!'; }
        else { icon = '💪📚'; message = 'Cố gắng hơn nữa! Ôn lại từ vựng và thử lại.'; }
        
        const summaryHtml = `
            <div style="text-align:center; margin-top:20px;">
                <h3>${icon} KẾT THÚC QUIZ ${icon}</h3>
                <p style="font-size:1.5rem; font-weight:bold;">Bạn đã làm đúng <span style="color:#27ae60;">${correct}</span> / ${total} câu</p>
                <p>${message}</p>
                <button class="btn btn-primary" id="restartQuizBtn">🔄 Làm lại</button>
            </div>
        `;
        document.getElementById('quizSummary').innerHTML = summaryHtml;
        document.getElementById('quizArea').style.display = 'none';
        document.getElementById('quizSummary').style.display = 'block';
        document.getElementById('restartQuizBtn')?.addEventListener('click', () => {
            document.getElementById('quizSummary').style.display = 'none';
            updateQuizUI();
        });
    }

    document.getElementById('btnNextQuiz')?.addEventListener('click', nextQuizQuestion);

    // PHÍM TẮT
    document.addEventListener('keydown', (e) => {
        if (isTypingTarget(e.target)) return;
        const activeMain = document.querySelector('.main-panel.active');
        if (!activeMain || activeMain.id !== 'panel-learn') return;
        const activeSub = document.querySelector('.sub-panel.active');
        if (!activeSub) return;
        const isSpace = e.key === ' ' || e.code === 'Space';
        
        if (activeSub.id === 'sub-flashcard') {
            const filtered = getFilteredVocab();
            if (filtered.length === 0) return;
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                fcIndex = (fcIndex - 1 + filtered.length) % filtered.length;
                updateFlashcardUI();
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                fcIndex = (fcIndex + 1) % filtered.length;
                updateFlashcardUI();
            } else if (isSpace) {
                e.preventDefault();
                toggleMeaning();
            }
        } else if (activeSub.id === 'sub-quiz') {
            const quizArea = document.getElementById('quizArea');
            if (quizArea && quizArea.style.display === 'block') {
                if (['1','2','3','4'].includes(e.key)) {
                    e.preventDefault();
                    selectQuizOption(Number(e.key) - 1);
                } else if (e.key === 'Enter' || isSpace || e.key === 'ArrowRight') {
                    e.preventDefault();
                    nextQuizQuestion();
                }
            }
        }
    });

    // KHỞI TẠO MẶC ĐỊNH
    function initDefaultLearnPanel() {
        const tabLearn = document.getElementById('tabLearn');
        const filterBar = document.getElementById('jlptFilterBar');
        if (tabLearn) tabLearn.style.display = 'inline-flex';
        if (filterBar) filterBar.style.display = 'flex';
        
        if (!appData) {
            appData = {
                fullText: `Chào mừng bạn đến với công cụ học tiếng Nhật!

Hãy bắt đầu bằng cách:
1️⃣ Dán một đoạn văn bản tiếng Nhật vào tab "Nhập liệu & Prompt"
2️⃣ Nhấn "Tạo Prompt" và copy nội dung
3️⃣ Gửi cho AI (ChatGPT, Gemini,...) để nhận JSON
4️⃣ Dán JSON vào tab "Dán JSON & Học" và nhấn "Xử lý & Học"

✨ Sau khi tải dữ liệu, bạn có thể:
- Học từ vựng chia nhóm Quan trọng / Thường gặp / Phụ
- Ôn tập với Flashcard (phím ← → và Space)
- Làm bài tập Quiz (sai tự lưu ⭐, có cách đọc dưới từ hỏi)
- Xem Bài dịch song ngữ từng câu
- Chọn giọng đọc và nghe toàn bộ từ vựng bằng nút ▶
- Lọc theo cấp độ JLPT hoặc chỉ xem từ đã đánh dấu sao ⭐
- Lưu online bằng Share Room để mở ở máy khác

Chúc bạn học tốt! 🎌`,
                fullTranslation: '',
                sentenceTranslations: [],
                vocabulary: [],
                grammar: [],
                title: 'Hướng dẫn sử dụng'
            };
            vocabList = [];
            grammarList = [];
            updateAllUI();
        }
    }
    
    initDefaultLearnPanel();
    initShareRoomUI();
    renderSavedList();
})();