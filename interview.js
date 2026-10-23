(function () {
  'use strict';
  const core = InterviewCore;
  const storageKey = 'devprep-interviews-v1';
  const catalog = new Map();
  studySubjects.forEach(subject => {
    subject.groups.forEach(group => {
      const lesson = subject.lessons[group.id];
      catalog.set(`lesson:${group.id}`, {
        key: `lesson:${group.id}`, title: group.title, topic: subject.topic, scope: subject.scope,
        context: JSON.stringify({ overview: lesson.overview, problem: lesson.problem, solution: lesson.solution, concepts: lesson.concepts, workflow: lesson.workflow, tradeoffs: lesson.tradeoffs, example: lesson.example, comparison: lesson.comparison }),
        questions: subject.questions.filter(q => q.group === group.id).map(q => ({ id: q.id, title: q.title, kind: q.kind, answer: q.answer, minimum: q.minimum, middle: q.middle, deep: q.deep, deepAnswer: q.deepAnswer, sources: q.sources.map(id => subject.sources[id]) })),
      });
    });
  });
  studyProjects.forEach(project => project.cases.forEach(item => catalog.set(`project:${item.id}`, {
    key: `project:${item.id}`, title: item.title, topic: project.topic,
    scope: `${subjectsByTopic[project.topic].scope} Phân biệt đúng chi tiết đã cung cấp với thiết kế đề xuất.`,
    context: JSON.stringify({ status: item.status, basis: item.basis, perspective: item.perspective, problem: item.problem, why: item.why, flow: item.flow, implementation: item.implementation, spoken: item.spoken }),
    questions: item.questions.map((q, i) => ({ id: `${item.id}-interview-${i + 1}`, title: q.title, kind: 'scenario', answer: q.answer, minimum: q.answer, middle: item.frame, sources: item.sources.map(id => project.sources[id]) })),
  })));
  let sessions = [];
  let activeId = null;
  let storageAvailable = true;
  let aiProvider = InterviewAI.hasBridgeToken() ? 'gemini' : 'chrome';
  let aiReady = false;
  let aiBusy = false;
  let aiController = null;
  const discussions = new Map();
  const cursors = new Map();
  try {
    const raw = localStorage.getItem(storageKey);
    const stored = raw && raw.length <= 1500000 ? JSON.parse(raw) : null;
    if (stored?.version === 1 && Array.isArray(stored.sessions)) {
      sessions = stored.sessions.slice(0, 10).flatMap(record => {
        try {
          const saved = record.session, entry = catalog.get(saved.catalogKey);
          if (!entry || !Array.isArray(saved.questions)) return [];
          const session = core.makeSession(entry, saved.level, saved.questions.map(q => q.id), saved.id, saved.createdAt);
          const report = record.report ? core.validateReport(record.report, session) : null;
          return [{ session, report }];
        } catch { return []; }
      });
      if (sessions.some(record => record.session.id === stored.activeId)) activeId = stored.activeId;
    }
  } catch { storageAvailable = false; }
  const dialog = document.querySelector('#interview-dialog');
  const content = document.querySelector('#interview-content');
  const status = document.querySelector('#interview-status');
  const esc = escapeHtml;
  const current = () => sessions.find(record => record.session.id === activeId);
  const listHtml = items => `<ul>${items.map(item => `<li>${esc(item)}</li>`).join('')}</ul>`;
  function setStatus(message, error = false) { status.textContent = message; status.classList.toggle('error', error); }
  function save() {
    try { localStorage.setItem(storageKey, JSON.stringify({ version: 1, activeId, sessions })); storageAvailable = true; }
    catch { storageAvailable = false; }
  }
  function show() {
    setStatus(storageAvailable ? '' : 'Chưa lưu được vào trình duyệt. Phiên hiện chỉ giữ khi trang còn mở.');
    if (!dialog.open) { if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', ''); }
  }
  function close() { aiController?.abort(); if (typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open'); }
  dialog.addEventListener('cancel', () => aiController?.abort());
  function renderSetup(key) {
    const entry = catalog.get(key);
    if (!entry) { setStatus('Chủ đề chưa có câu hỏi để phỏng vấn.', true); return; }
    const counts = [...new Set([Math.min(3, entry.questions.length), Math.min(5, entry.questions.length), Math.min(10, entry.questions.length)])];
    content.innerHTML = `<p class="interview-kicker">${esc(entry.topic)}</p><h3>${esc(entry.title)}</h3><p>Trả lời và tranh luận với AI ngay tại đây. Chọn AI Chrome chạy trên máy hoặc kết nối Gemini của bạn qua cầu nối cục bộ.</p>
      <form id="interview-setup" data-entry="${esc(key)}"><div class="interview-options"><label>Mức luyện<select name="level"><option>Middle</option><option>Middle+</option></select></label><label>Số câu chính<select name="count">${counts.map(count => `<option value="${count}">${count} câu</option>`).join('')}</select></label></div><button type="submit" class="interview-primary">Tạo phiên phỏng vấn</button></form>
      <details class="interview-rubric"><summary>Tiêu chí đánh giá</summary>${listHtml(core.rubric.map(item => `${item.title} (${item.weight}%): ${item.description}`))}<p>Mỗi tiêu chí chấm 0–4, có lý do. Điểm là gợi ý tự luyện; lỗi bản chất được chỉ rõ dù tổng điểm cao. Không đòi Middle trả lời chi tiết vận hành quá sâu.</p></details>
      <button type="button" class="interview-link" data-interview-action="history">Xem các phiên đã tạo</button>`;
    show();
  }
  function create(key, level, count) {
    const entry = catalog.get(key);
    if (!entry) throw new Error('Chủ đề không hợp lệ.');
    const id = `iv-${globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;
    const ids = core.selectQuestions(entry.questions, count);
    const session = core.makeSession(entry, level, ids, id, new Date().toISOString());
    sessions = [{ session, report: null }, ...sessions].slice(0, 10);
    activeId = id; save(); renderActive();
    return session;
  }
  function renderReport(record) {
    if (!record.report) return '';
    const summary = core.summarize(record.report, record.session);
    const byId = new Map(record.session.questions.map(q => [q.id, q]));
    return `<section class="interview-report" aria-labelledby="interview-report-title"><h3 id="interview-report-title">Kết quả phiên</h3><p class="interview-score"><strong>${summary.score}/100</strong> · Đã đánh giá ${summary.answered}/${summary.total} câu${summary.complete ? '' : ' · Phiên chưa đủ kết quả'}</p>
      ${summary.hasConceptError ? '<p class="interview-alert">Còn lỗi bản chất cần sửa. Đọc nhận xét từng câu trước khi dựa vào điểm tổng.</p>' : ''}
      <div class="comparison-scroll"><table class="pattern-comparison"><thead><tr><th>Tiêu chí</th><th>Trung bình / 4</th><th>Trọng số</th></tr></thead><tbody>${summary.criteria.map(item => `<tr><th scope="row">${esc(item.title)}</th><td>${item.value.toFixed(1)}</td><td>${item.weight}%</td></tr>`).join('')}</tbody></table></div>
      <h4>Câu nên cải thiện</h4>${summary.needsReview.length ? listHtml(summary.needsReview.map(item => `${byId.get(item.questionId).title} — ${item.score}/100`)) : '<p>Không có ý cần sửa được ghi trong báo cáo này. Bạn có thể thử phần hỏi thêm hoặc luyện nói gọn hơn.</p>'}
      ${record.session.questions.flatMap(question => {
        const item = summary.results.find(result => result.questionId === question.id);
        if (!item) return [];
        return [`<details class="interview-result" data-interview-result="${esc(question.id)}"><summary>${esc(question.title)} <span>${item.score}/100</span></summary><div><h4>Câu trả lời đã chấm</h4><blockquote>${esc(item.answer)}</blockquote>
          <h4>Chấm theo từng tiêu chí</h4><dl>${core.rubric.map(criterion => `<dt>${esc(criterion.title)} · ${item.scores[criterion.id].value}/4</dt><dd>${esc(item.scores[criterion.id].reason)}</dd>`).join('')}</dl>
          ${item.strengths.length ? `<h4>Đã làm tốt</h4>${listHtml(item.strengths)}` : ''}
          ${item.issues.length ? `<h4>Cần sửa cụ thể</h4>${item.issues.map(issue => `<div class="interview-issue"><p><strong>${issue.severity === 'concept' ? 'Lỗi bản chất' : issue.severity === 'missing' ? 'Ý còn thiếu' : 'Cách trình bày'}</strong></p>${issue.quote ? `<blockquote>${esc(issue.quote)}</blockquote>` : ''}<p>${esc(issue.problem)}</p><p><strong>Cách cải thiện:</strong> ${esc(issue.fix)}</p></div>`).join('')}` : ''}
          ${item.missing.length ? `<h4>Ý cần bổ sung</h4>${listHtml(item.missing)}` : ''}
          <h4>Câu trả lời gợi ý tốt hơn</h4><blockquote class="interview-better">${esc(item.improvedAnswer)}</blockquote><h4>Câu luyện tiếp</h4><p>${esc(item.followUp)}</p>
          ${item.uncertainties.length ? `<h4>Cần đối chiếu thêm</h4>${listHtml(item.uncertainties)}` : ''}
          ${validIds.has(question.id) ? `<button type="button" class="interview-link" data-interview-review="${esc(question.id)}">${state.saved.includes(question.id) ? 'Đã lưu để ôn lại' : 'Lưu câu này để ôn lại'}</button>` : ''}</div></details>`];
      }).join('')}<p class="interview-small">Nhận xét do AI tạo, có thể sai. Đối chiếu với tài liệu trong bài, nhất là khi dùng model nhỏ và bản dịch. Web tính điểm theo trọng số và lưu báo cáo trên trình duyệt này.</p></section>`;
  }
  function renderActive() {
    const record = current();
    if (!record) { renderHistory(); return; }
    const session = record.session;
    let index = cursors.get(session.id);
    if (index === undefined) { index = session.questions.findIndex(q => !record.report?.results.some(item => item.questionId === q.id)); if (index < 0) index = 0; cursors.set(session.id, index); }
    const question = session.questions[index];
    const conversation = (discussions.get(session.id) || []).filter(item => item.questionId === question.id);
    content.innerHTML = `<p class="interview-kicker">${esc(session.topic)} · ${esc(session.level)} · ${session.questions.length} câu</p><h3>${esc(session.title)}</h3>
      <details class="ai-connection" ${aiReady ? '' : 'open'}><summary>Nguồn AI · ${aiReady ? 'Đã kết nối' : 'Cần kết nối'}</summary><label for="ai-provider">Sử dụng AI</label><select id="ai-provider"><option value="chrome" ${aiProvider === 'chrome' ? 'selected' : ''}>AI Chrome · chạy trên máy</option><option value="gemini" ${aiProvider === 'gemini' ? 'selected' : ''}>Gemini · tài khoản Google qua cầu nối</option></select>
      <div id="ai-chrome-info" ${aiProvider === 'chrome' ? '' : 'hidden'}><p>Không cần API key. Dùng Chrome máy tính hỗ trợ Gemini Nano; lần đầu Chrome có thể tải model. Tiếng Việt được dịch trên máy trước và sau khi AI xử lý.</p><p id="ai-browser-check" role="status"></p></div>
      <div id="ai-gemini-info" ${aiProvider === 'gemini' ? '' : 'hidden'}><p>Cài một lần trên máy: Node.js 22+, sau đó <code>npm install -g @google/gemini-cli</code>. Chạy <code>gemini</code> và chọn <strong>Sign in with Google</strong>.</p><p><a href="downloads/gemini-bridge.cjs" download>Tải cầu nối Gemini</a>, chạy <code>node gemini-bridge.cjs</code>, giữ cửa sổ đó mở rồi bấm link kết nối được in ra. Trình duyệt có thể hỏi quyền truy cập mạng cục bộ.</p><label for="ai-bridge-token">Hoặc dán mã kết nối của cầu nối</label><input id="ai-bridge-token" type="password" autocomplete="off" spellcheck="false" placeholder="Mã kết nối cục bộ, không phải mật khẩu Google"><p class="interview-small">Dùng tài khoản đã đăng nhập Gemini CLI trên máy này. Chỉ đăng nhập gemini.google.com ở tab khác chưa đủ. Câu trả lời sẽ được gửi tới Google; hạn mức phụ thuộc tài khoản.</p></div>
      <button type="button" class="interview-primary" data-ai-connect>${aiReady ? 'Kết nối lại' : 'Khởi động / kết nối AI'}</button></details>
      <section class="ai-practice" aria-labelledby="ai-current-question"><div class="ai-question-nav"><span>Câu ${index + 1}/${session.questions.length}</span><button type="button" data-ai-move="-1" ${index === 0 ? 'disabled' : ''}>Trước</button><button type="button" data-ai-move="1" ${index === session.questions.length - 1 ? 'disabled' : ''}>Tiếp</button></div><h4 id="ai-current-question">${esc(question.title)}</h4><p class="sources">Đối chiếu: ${(question.sources || []).map(source => `<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.title)}</a>`).join(' · ')}</p>
      <div id="ai-conversation" class="ai-conversation" aria-label="Trao đổi với AI">${conversation.map(item => `<div class="ai-message ${item.role === 'user' ? 'ai-user' : 'ai-assistant'}"><strong>${item.role === 'user' ? 'Bạn' : 'AI'}</strong><p>${esc(item.text)}</p></div>`).join('')}</div>
      <form id="ai-answer-form"><label for="ai-answer">Câu trả lời hoặc điều bạn muốn phản biện</label><textarea id="ai-answer" required maxlength="10000" rows="5" placeholder="Trả lời như khi phỏng vấn. Bạn có thể hỏi lại hoặc phản biện nhận xét của AI…"></textarea><div class="interview-buttons"><button type="submit" name="intent" value="grade" class="interview-primary" ${aiReady ? '' : 'disabled'}>Gửi trả lời & chấm</button><button type="submit" name="intent" value="debate" ${aiReady ? '' : 'disabled'}>Tranh luận / hỏi thêm</button><button type="button" data-ai-stop disabled>Dừng</button></div></form>
      <p class="interview-small">Chấm theo 4 tiêu chí bên dưới. Tranh luận không ghi đè điểm câu trả lời trước. Báo cáo lưu trên trình duyệt; trao đổi trong khung chat giữ trong lần mở trang này.</p></section>
      ${renderReport(record)}<div class="interview-footer"><span>Mã phiên: ${esc(session.id)}</span><button type="button" class="interview-link" data-interview-action="history">Lịch sử</button><button type="button" class="interview-link" data-interview-new="${esc(session.catalogKey)}">Luyện phiên mới</button></div>`;
    show();
    if (aiProvider === 'chrome' && !aiReady) checkBrowser();
  }
  async function checkBrowser() {
    const target = content.querySelector('#ai-browser-check');
    if (!target) return;
    try { const value = await InterviewAI.availability(); if (target.isConnected) target.textContent = value === 'available' ? 'AI và bộ dịch đã sẵn sàng trên máy.' : value === 'downloadable' ? 'Máy hỗ trợ; bấm khởi động để tải hoặc mở model.' : 'Máy / trình duyệt này chưa hỗ trợ AI Chrome. Có thể chọn Gemini qua cầu nối.'; }
    catch { if (target.isConnected) target.textContent = 'Chưa kiểm tra được AI Chrome. Có thể thử khởi động hoặc chọn Gemini.'; }
  }
  function busy(value) {
    aiBusy = value;
    content.querySelectorAll('button, select, input, textarea').forEach(element => { if (value) { element.dataset.wasDisabled = element.disabled ? '1' : '0'; element.disabled = true; } else { element.disabled = element.dataset.wasDisabled === '1'; delete element.dataset.wasDisabled; } });
    const stop = content.querySelector('[data-ai-stop]'); if (stop) stop.disabled = !value || !aiController;
  }
  async function connectAI() {
    const token = content.querySelector('#ai-bridge-token')?.value;
    busy(true); setStatus('Đang kết nối AI… Lần đầu tải model có thể mất vài phút.');
    try {
      if (aiProvider === 'chrome') await InterviewAI.connectLocal(message => setStatus(message));
      else await InterviewAI.connectBridge(token);
      aiReady = true; busy(false); renderActive(); setStatus(aiProvider === 'chrome' ? 'AI Chrome đã sẵn sàng. Nhập câu trả lời để bắt đầu.' : 'Đã kết nối cầu nối Gemini. Nhập câu trả lời để bắt đầu.');
    } catch (error) { busy(false); setStatus(error.message, true); }
  }
  async function answerWithAI(mode) {
    if (!aiReady || aiBusy) return;
    const record = current(), sessionId = record.session.id;
    const question = record.session.questions[cursors.get(sessionId) || 0];
    const input = content.querySelector('#ai-answer'), answer = input.value.trim();
    if (!answer) return;
    const history = discussions.get(sessionId) || [];
    const controller = new AbortController(); aiController = controller;
    busy(true); setStatus(mode === 'grade' ? 'AI đang đọc và đánh giá câu trả lời…' : 'AI đang phản hồi lập luận của bạn…');
    try {
      const response = await InterviewAI.run({ provider: aiProvider, question, level: record.session.level, answer, mode, history: history.filter(item => item.questionId === question.id), signal: controller.signal });
      controller.signal.throwIfAborted();
      if (response.result) {
        const incoming = core.validateReport({ schemaVersion: 1, sessionId, level: record.session.level, results: [response.result] }, record.session);
        const merged = new Map((record.report?.results || []).map(item => [item.questionId, item])); merged.set(question.id, incoming.results[0]);
        record.report = { ...incoming, results: record.session.questions.flatMap(q => merged.has(q.id) ? [merged.get(q.id)] : []) };
        save();
      }
      discussions.set(sessionId, [...history, { questionId: question.id, role: 'user', text: answer }, { questionId: question.id, role: 'assistant', text: response.reply }].slice(-40));
      busy(false); if (activeId === sessionId && dialog.open) { renderActive(); setStatus(storageAvailable ? 'AI đã trả lời. Bạn có thể phản biện hoặc chuyển câu tiếp.' : 'AI đã trả lời; trình duyệt chưa cho lưu báo cáo.', !storageAvailable); }
    } catch (error) { busy(false); setStatus(error.name === 'AbortError' ? 'Đã dừng. Câu trả lời đang nhập vẫn được giữ.' : error.message, error.name !== 'AbortError'); }
    finally { if (aiController === controller) aiController = null; }
  }
  function renderHistory() {
    content.innerHTML = `<h3>Lịch sử phỏng vấn</h3><p class="interview-small">Lưu riêng trên trình duyệt này, tối đa 10 phiên gần nhất.</p>${sessions.length ? `<ol class="interview-history">${sessions.map(record => `<li><button type="button" data-interview-session="${esc(record.session.id)}"><strong>${esc(record.session.title)}</strong><span>${esc(record.session.topic)} · ${esc(record.session.level)} · ${esc(new Date(record.session.createdAt).toLocaleString('vi-VN'))}</span><span>${record.report ? `${core.summarize(record.report, record.session).score}/100 · ${record.report.results.length}/${record.session.questions.length} câu đã chấm` : 'Đã tạo đề · Chưa có đánh giá'}</span></button></li>`).join('')}</ol>` : '<p>Chưa có phiên. Mở một chủ đề hoặc case dự án rồi chọn “Phỏng vấn mục này”.</p>'}`;
    show();
  }
  async function copyPrompt(openChatGPT) {
    const record = current();
    if (!record) throw new Error('Chưa có phiên để sao chép.');
    try { await navigator.clipboard.writeText(core.buildPrompt(record.session)); }
    catch {
      const prompt = content.querySelector('.interview-prompt');
      if (prompt) prompt.open = true;
      const input = content.querySelector('#interview-prompt-text'); input?.focus(); input?.select();
      setStatus('Trình duyệt chưa cho sao chép tự động. Nội dung đề đã được chọn; hãy sao chép rồi mở chatgpt.com.', true);
      return;
    }
    if (openChatGPT) {
      const link = document.createElement('a'); link.href = 'https://chatgpt.com/'; link.target = '_blank'; link.rel = 'noopener noreferrer'; document.body.append(link); link.click(); link.remove();
    }
    setStatus(openChatGPT ? 'Đã sao chép đề. Dán vào ChatGPT để bắt đầu. Nếu tab mới chưa mở, vào chatgpt.com.' : 'Đã sao chép đề.');
  }
  function applyReport(input) {
    const record = current();
    if (!record) throw new Error('Hãy mở đúng phiên phỏng vấn trước khi đưa kết quả về.');
    const incoming = typeof input === 'string' ? core.parseReport(input, record.session) : core.validateReport(input, record.session);
    const merged = new Map((record.report?.results || []).map(item => [item.questionId, item]));
    incoming.results.forEach(item => merged.set(item.questionId, item));
    record.report = { ...incoming, results: record.session.questions.flatMap(q => merged.has(q.id) ? [merged.get(q.id)] : []) };
    save(); renderActive();
    const summary = core.summarize(record.report, record.session);
    setStatus(storageAvailable ? 'Đã cập nhật và lưu đánh giá trên trình duyệt này.' : 'Đã hiển thị đánh giá; chưa lưu được vào trình duyệt.', !storageAvailable);
    return { saved: storageAvailable, sessionId: record.session.id, score: summary.score, answered: summary.answered, total: summary.total };
  }
  let agentReady = false;
  document.addEventListener('click', event => {
    const start = event.target.closest('[data-interview-entry]');
    if (start) renderSetup(start.dataset.interviewEntry);
    if (event.target.closest('#interview-history')) renderHistory();
  });
  dialog.querySelector('[data-interview-close]').addEventListener('click', close);
  dialog.addEventListener('submit', event => {
    event.preventDefault();
    try {
      if (event.target.id === 'ai-answer-form') { answerWithAI(event.submitter?.value === 'debate' ? 'debate' : 'grade'); return; }
      if (event.target.id === 'interview-setup') create(event.target.dataset.entry, event.target.elements.level.value, Number(event.target.elements.count.value));
      if (event.target.id === 'interview-import') applyReport(content.querySelector('#interview-report-input').value);
    } catch (error) { setStatus(error.message, true); }
  });
  dialog.addEventListener('click', async event => {
    const button = event.target.closest('button'); if (!button) return;
    try {
      if (button.hasAttribute('data-ai-stop')) { aiController?.abort(); return; }
      if (aiBusy) return;
      if (button.hasAttribute('data-ai-connect')) { await connectAI(); return; }
      if (button.dataset.aiMove) { const record = current(); cursors.set(record.session.id, Math.max(0, Math.min(record.session.questions.length - 1, (cursors.get(record.session.id) || 0) + Number(button.dataset.aiMove)))); renderActive(); return; }
      if (button.dataset.interviewAction === 'history') renderHistory();
      if (button.dataset.interviewAction === 'copy-open') await copyPrompt(true);
      if (button.dataset.interviewAction === 'copy') await copyPrompt(false);
      if (button.dataset.interviewNew) renderSetup(button.dataset.interviewNew);
      if (button.dataset.interviewSession && sessions.some(record => record.session.id === button.dataset.interviewSession)) { activeId = button.dataset.interviewSession; save(); renderActive(); }
      const id = button.dataset.interviewReview;
      if (id && validIds.has(id)) {
        state.saved = [...new Set([...state.saved, id])]; persist(); renderStats(); button.textContent = 'Đã lưu để ôn lại';
        if (document.querySelector('#only-saved').checked) renderQuestions();
      }
    } catch (error) { setStatus(error.message, true); }
  });
  dialog.addEventListener('change', event => { if (event.target.id === 'ai-provider') { aiProvider = event.target.value; aiReady = false; renderActive(); } });
  window.addEventListener('pagehide', () => { aiController?.abort(); InterviewAI.destroy(); }, { once: true });
  const registry = document.modelContext;
  if (typeof registry?.registerTool === 'function') {
    const lifecycle = new AbortController();
    window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
    const noExtra = input => { if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length) throw new Error('Không nhận tham số.'); };
    const tools = [
      { name: 'get_interview_session', description: 'Read the interview session the learner opened on this page, its curated question references and grading rubric. Ask one question at a time in Vietnamese. Only the current browser session is available.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true }, execute(input) { noExtra(input); const record = current(); if (!record) throw new Error('Người học chưa tạo phiên trên web.'); return { session: record.session, rubric: core.rubric, reportSchema: core.reportSchema, existingReport: record.report }; } },
      { name: 'record_interview_feedback', description: 'Store the learner-requested assessment on this page after interviewing them in ChatGPT. Use actual learner answers, exact session/question IDs and evidence-based rubric scores. This updates local interview history and the visible report; it does not call an AI API.', inputSchema: { type: 'object', additionalProperties: false, required: ['report'], properties: { report: core.reportSchema } }, execute(input) { if (!input || typeof input !== 'object' || Object.keys(input).some(key => key !== 'report')) throw new Error('Chỉ nhận trường report.'); return applyReport(input.report); } },
    ];
    try {
      Promise.all(tools.map(tool => Promise.resolve(registry.registerTool(tool, { signal: lifecycle.signal })))).then(() => {
        agentReady = true; const hint = content.querySelector('#interview-agent-hint'); if (hint) hint.hidden = false;
      }).catch(() => { agentReady = false; });
    } catch { agentReady = false; }
  }
})();
