const $ = selector => document.querySelector(selector);
const validIds = new Set(questions.map(q => q.id));
let stored;
try { stored = JSON.parse(localStorage.getItem('devprep-template')) || {}; } catch { stored = {}; }
const state = {
  saved: Array.isArray(stored.saved) ? stored.saved.filter(id => validIds.has(id)) : [],
  done: Array.isArray(stored.done) ? stored.done.filter(id => validIds.has(id)) : [],
  scratch: typeof stored.scratch === 'string' ? stored.scratch : '',
  notes: stored.notes && typeof stored.notes === 'object' && !Array.isArray(stored.notes) ? stored.notes : {},
};
let topic = 'Kafka';
let kind = 'all';
const opened = new Set();
const openedTopics = new Set();
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const kindLabel = value => value === 'scenario' ? 'Xử lý tình huống' : 'Lý thuyết';
function renderSources(ids, subjectTopic) {
  return ids.map(id => { const source = subjectsByTopic[subjectTopic].sources[id]; return `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.title)}</a>`; }).join(' · ');
}
function renderExample(example) {
  return example ? `<figure class="study-example"><figcaption>${escapeHtml(example.title)}</figcaption><pre><code>${escapeHtml(example.code)}</code></pre><p>${escapeHtml(example.explanation)}</p></figure>` : '';
}
function renderConcept(concept) {
  const rules = concept.rules?.length ? `<div class="concept-rules"><h5>Quy tắc cần nhớ</h5><ul>${concept.rules.map(rule => `<li>${escapeHtml(rule)}</li>`).join('')}</ul></div>` : '';
  const example = concept.practicalExample ? `<p class="concept-example"><strong>${escapeHtml(concept.exampleLabel || 'Trong luồng đơn hàng')}:</strong> ${escapeHtml(concept.practicalExample)}</p>` : '';
  const interview = concept.interviewAnswer ? `<div class="concept-interview"><h5>Câu trả lời mẫu khi phỏng vấn</h5><blockquote>${escapeHtml(concept.interviewAnswer)}</blockquote></div>` : '';
  return `<dt>${escapeHtml(concept.term)}</dt><dd><p>${escapeHtml(concept.meaning)}</p><p class="concept-purpose"><strong>Vì sao cần:</strong> ${escapeHtml(concept.purpose)}</p>${rules}${example}${interview}</dd>`;
}
function renderProjectFlow(steps) {
  return `<ol class="project-flow">${steps.map(step => `<li>${escapeHtml(step)}</li>`).join('')}</ol>`;
}
function renderProjectCase(item, index, project) {
  const prefix = `project-${item.id}`;
  const status = item.status === 'actual' ? (project.actualLabel || (project.topic === 'Database' ? 'Đã triển khai' : `Đã dùng ${project.topic}`)) : (project.proposalLabel || `Đề xuất ${project.topic}`);
  const sources = item.sources.map(id => {
    const source = project.sources[id];
    return `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.title)}</a>`;
  }).join(' · ');
  return `<details id="${prefix}" class="project-case" data-project-case="${item.id}" data-project-topic="${escapeHtml(project.topic)}">
    <summary><span class="project-case-title">${index + 1}. ${escapeHtml(item.title)}</span><span class="project-status ${item.status}">${status}</span></summary>
    <div class="project-case-body"><p class="project-basis">${escapeHtml(item.basis)}</p>
      <section class="project-step" data-project-step="1" aria-labelledby="${prefix}-user"><h4 id="${prefix}-user">1/ Góc nhìn người dùng</h4><p>${escapeHtml(item.perspective)}</p></section>
      <section class="project-step" data-project-step="2" aria-labelledby="${prefix}-problem"><h4 id="${prefix}-problem">2/ Bài toán của hệ thống</h4><p>${escapeHtml(item.problem)}</p><h5>${project.topic === 'Kafka' || project.topic === 'Redis' ? `Vì sao cân nhắc ${escapeHtml(project.topic)}?` : 'Vì sao chọn cách này?'}</h5><p>${escapeHtml(item.why)}</p></section>
      <section class="project-step" data-project-step="3" aria-labelledby="${prefix}-overview"><h4 id="${prefix}-overview">3/ Tổng quan xử lý</h4>${renderProjectFlow(item.flow)}<ul>${item.roles.map(role => `<li>${escapeHtml(role)}</li>`).join('')}</ul></section>
      <details id="${prefix}-implementation" class="project-implementation" data-project-step="4"><summary>4/ Ghi chú chi tiết / Implementation</summary><div>${item.implementation.map(block => `<section class="project-detail"><h5>${escapeHtml(block.title)}</h5><p>${escapeHtml(block.text)}</p>${block.flow ? renderProjectFlow(block.flow) : ''}${block.points?.length ? `<ul>${block.points.map(point => `<li>${escapeHtml(point)}</li>`).join('')}</ul>` : ''}</section>`).join('')}</div></details>
      <section class="project-speaking" aria-labelledby="${prefix}-spoken"><h4 id="${prefix}-spoken">Tập trả lời trong 30–60 giây</h4><p class="project-frame">${item.frame.map(escapeHtml).join(' → ')}</p><blockquote>${escapeHtml(item.spoken)}</blockquote></section>
      <section class="project-practice" aria-labelledby="${prefix}-practice"><h4 id="${prefix}-practice">Câu hỏi từ case này <span>${item.questions.length} câu</span></h4><button type="button" class="interview-start" data-interview-entry="project:${escapeHtml(item.id)}">Phỏng vấn case này</button>${item.questions.map((question, i) => `<details id="${prefix}-question-${i + 1}" class="project-question"><summary>${escapeHtml(question.title)}</summary><p>${escapeHtml(question.answer)}</p></details>`).join('')}</section>
      <p class="sources">Đối chiếu cơ chế: ${sources}</p>
    </div></details>`;
}
function initializeProject() {
  $('#project-section').innerHTML = `<summary><span class="learning-title">Áp dụng vào dự án</span><span class="topic-count" id="project-count"></span></summary>${studyProjects.map(project => `<div class="project-content" data-project-subject="${escapeHtml(project.topic)}"><h3>${escapeHtml(project.name)}</h3><p>${escapeHtml(project.context)}</p><p>${escapeHtml(project.introduction)}</p><div class="project-cases">${project.cases.map((item, index) => renderProjectCase(item, index, project)).join('')}</div><details id="${project.topic === 'Kafka' ? 'project-selection' : `project-selection-${project.slug}`}" class="project-selection"><summary>Các phần chưa chọn hoặc cần xác nhận thêm</summary><dl>${project.exclusions.map(item => `<dt>${escapeHtml(item.title)}</dt><dd>${escapeHtml(item.reason)}</dd>`).join('')}</dl></details><p class="project-source-note">Bối cảnh và số liệu lấy từ mô tả dự án bạn cung cấp. Chi tiết đề xuất là minh họa thiết kế. Các liên kết đối chiếu giải thích cơ chế, không xác nhận lịch sử triển khai của dự án.</p></div>`).join('')}`;
}
const projectCases = studyProjects.flatMap(project => project.cases.map(item => ({ ...item, topic: project.topic })));
const projectSearchText = new Map(projectCases.map(item => [item.id, [
  item.topic, item.title, item.basis, item.perspective, item.problem, item.why,
  ...item.flow, ...item.roles, ...item.frame, item.spoken,
  ...item.implementation.flatMap(block => [block.title, block.text, ...(block.points || []), ...(block.flow || [])]),
  ...item.questions.flatMap(question => [question.title, question.answer]),
].join(' ').toLocaleLowerCase('vi')]));
let projectBeforeSearch = null;
function filterProject(search) {
  const section = $('#project-section');
  const enabled = Boolean(topic === 'all' || subjectsByTopic[topic]) && kind !== 'theory' && !$('#only-saved').checked;
  const visible = projectCases.filter(item => (topic === 'all' || item.topic === topic) && projectSearchText.get(item.id).includes(search));
  if (search && projectBeforeSearch === null) {
    projectBeforeSearch = new Map([section, ...section.querySelectorAll('details')].map(item => [item.id, item.open]));
  }
  if (!search && projectBeforeSearch !== null) {
    [section, ...section.querySelectorAll('details')].forEach(item => { item.open = projectBeforeSearch.get(item.id) || false; });
    projectBeforeSearch = null;
  }
  section.querySelectorAll('[data-project-case]').forEach(item => {
    item.hidden = !visible.some(entry => entry.id === item.dataset.projectCase);
    if (search) {
      item.open = !item.hidden;
      item.querySelectorAll('details').forEach(detail => { detail.open = detail.textContent.toLocaleLowerCase('vi').includes(search); });
    }
  });
  section.hidden = !enabled || !visible.length;
  if (search && !section.hidden) section.open = true;
  section.querySelectorAll('[data-project-subject]').forEach(item => {
    item.hidden = !visible.some(entry => entry.topic === item.dataset.projectSubject);
  });
  section.querySelectorAll('.project-selection').forEach(item => { item.hidden = Boolean(search); });
  $('#project-count').textContent = `${visible.length} case · ${visible.reduce((total, item) => total + item.questions.length, 0)} câu hỏi`;
  return enabled ? visible.length : 0;
}
function renderTheory(group) {
  const lesson = studyLessons[group.id];
  const example = lesson.example || questions.find(question => question.group === group.id && question.example)?.example;
  const comparison = lesson.comparison?.length ? `<h4>Chọn cách nào?</h4><div class="comparison-scroll"><table class="pattern-comparison"><thead><tr><th scope="col">Lựa chọn</th><th scope="col">Khi phù hợp</th><th scope="col">Chi phí cần nhận</th></tr></thead><tbody>${lesson.comparison.map(row => `<tr><th scope="row">${escapeHtml(row.option)}</th><td>${escapeHtml(row.when)}</td><td>${escapeHtml(row.cost)}</td></tr>`).join('')}</tbody></table></div>` : '';
  return `<section class="topic-theory" aria-labelledby="theory-${group.id}">
    <h3 id="theory-${group.id}">Lý thuyết nền tảng</h3><p class="theory-intro">${escapeHtml(lesson.overview)}</p>
    <div class="theory-reason"><h4>${escapeHtml(lesson.whyTitle || 'Vì sao cần những cơ chế này?')}</h4><p>${escapeHtml(lesson.problem)}</p><p>${escapeHtml(lesson.solution)}</p></div>
    <h4>Các khái niệm cần hiểu</h4><dl class="theory-concepts">${lesson.concepts.map(renderConcept).join('')}</dl>
    <h4>Luồng hoạt động</h4><ol class="theory-flow">${lesson.workflow.map(step => `<li>${escapeHtml(step)}</li>`).join('')}</ol>
    ${renderExample(example)}
    ${comparison}<h4>Giới hạn & đánh đổi</h4><ul class="theory-tradeoffs">${lesson.tradeoffs.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
    <p class="sources theory-sources">Đọc thêm: ${renderSources(lesson.sources, group.topic)}</p>
    <button type="button" class="interview-start" data-interview-entry="lesson:${escapeHtml(group.id)}">Phỏng vấn mục này</button>
  </section>`;
}
const lessonSearchText = new Map(studyGroups.map(group => {
  const lesson = studyLessons[group.id];
  return [group.id, [group.topic, group.title, lesson.overview, lesson.whyTitle || '', lesson.problem, lesson.solution, ...lesson.concepts.flatMap(concept => [concept.term, concept.meaning, concept.purpose, ...(concept.rules || []), concept.practicalExample || '', concept.interviewAnswer || '']), ...lesson.workflow, ...lesson.tradeoffs, lesson.example?.code || '', lesson.example?.explanation || '', ...(lesson.comparison || []).flatMap(row => [row.option, row.when, row.cost])].join(' ').toLocaleLowerCase('vi')];
}));
const questionSearchText = new Map(questions.map(q => [q.id, [q.title, q.answer, q.minimum, ...q.middle, q.deep, q.deepAnswer, q.frame, ...(q.basics || []).flatMap(item => [item.term, item.text]), ...(q.pitfalls || []), q.example?.code || '', q.example?.explanation || ''].join(' ').toLocaleLowerCase('vi')]));
function persist() {
  try { localStorage.setItem('devprep-template', JSON.stringify(state)); $('#note-status').textContent = 'Đã lưu trên trình duyệt này'; }
  catch { $('#note-status').textContent = 'Chưa lưu được. Thay đổi hiện chỉ giữ trong phiên này.'; }
}
function renderStats() {
  const selected = questions.filter(question => topic === 'all' || question.topic === topic);
  const groupCount = studyGroups.filter(group => selected.some(question => question.group === group.id)).length;
  $('#section-title').textContent = topic === 'all' ? 'Chủ đề học' : `Chủ đề học ${topic}`;
  $('#question-total').textContent = `${groupCount} chủ đề · ${selected.length} câu hỏi`;
  $('#saved-count').textContent = `(${state.saved.length})`;
}
function renderGuide() {
  const selected = studySubjects.filter(subject => topic === 'all' || subject.topic === topic);
  $('#study-guide').hidden = !selected.length;
  $('#kind-filters').hidden = !selected.length;
  $('#study-guide').innerHTML = selected.length ? `<details class="guide-details"><summary>${escapeHtml(topic === 'all' ? 'Khung ôn tập' : topic)} · Middle / Middle+ <span>Cách trả lời & phạm vi học</span></summary><div class="guide-body"><p><strong>Lý thuyết:</strong> Định nghĩa → vì sao cần → cơ chế và quy tắc → ví dụ → giới hạn.</p><p><strong>Tình huống:</strong> Làm rõ giả định → khoanh vùng bằng dữ liệu → giải pháp → rủi ro → kiểm chứng.</p><p><strong>Mức trả lời:</strong> Middle cần giải thích được cơ chế và cửa sổ lỗi. Phần hỏi thêm dùng để luyện Middle+; không cần nhớ mọi tuning hạ tầng. Thử nói trong 30–60 giây trước khi mở đáp án. Đây là khung tự luyện, không phải chuẩn tuyển dụng cố định.</p>${selected.map(subject => `<p class="scope"><strong>${escapeHtml(subject.topic)}:</strong> ${escapeHtml(subject.scope)}</p>`).join('')}</div></details>` : '';
}
function renderQuestion(question) {
  const q = question;
  const sourceLinks = renderSources(q.sources, q.topic);
  const foundation = q.basics?.length
    ? `<ul class="foundation-list">${q.basics.map(item => `<li><strong>${escapeHtml(item.term)}</strong><p>${escapeHtml(item.text)}</p></li>`).join('')}</ul>`
    : `<p>${escapeHtml(q.minimum)}</p>`;
  const example = renderExample(q.example);
  const pitfalls = q.pitfalls?.length ? `<div class="pitfalls"><h4>Dễ nhầm khi phỏng vấn</h4><ul>${q.pitfalls.map(point => `<li>${escapeHtml(point)}</li>`).join('')}</ul></div>` : '';
  return `<details class="note ${state.done.includes(q.id) ? 'completed' : ''}" data-id="${q.id}" ${opened.has(q.id) ? 'open' : ''}>
    <summary><span class="note-title">${escapeHtml(q.title)}</span><span class="question-kind ${q.kind}">${kindLabel(q.kind)}</span></summary>
    <div class="note-body">
      <div class="note-meta">${escapeHtml(q.topic)} / ${escapeHtml(q.level)}</div>
      <h4>Trả lời ngắn khi phỏng vấn</h4><p class="answer">${escapeHtml(q.answer)}</p>
      <p class="answer-frame"><strong>Khung trả lời</strong><span>${escapeHtml(q.frame)}</span></p>
      <dl class="answer-levels"><dt>1. Nền tảng</dt><dd>${foundation}${example}</dd><dt>2. Middle cần nêu</dt><dd><ul>${q.middle.map(point => `<li>${escapeHtml(point)}</li>`).join('')}</ul></dd></dl>
      ${pitfalls}
      <details class="follow-up"><summary>3. Đào sâu: ${escapeHtml(q.deep)}</summary><p>${escapeHtml(q.deepAnswer)}</p></details>
      <p class="sources">Đối chiếu: ${sourceLinks}</p>
      <div class="note-actions"><label><input type="checkbox" data-done="${q.id}" ${state.done.includes(q.id) ? 'checked' : ''}> Đã hiểu, đã ôn</label><button class="save-button" data-save="${q.id}" aria-pressed="${state.saved.includes(q.id)}">${state.saved.includes(q.id) ? 'Đã lưu để ôn lại' : 'Lưu để ôn lại'}</button></div>
    </div></details>`;
}
function renderQuestions() {
  // Chụp trạng thái trực tiếp, tránh mất trạng thái mở khi toggle chưa được dispatch.
  document.querySelectorAll('.note').forEach(note => { if (note.open) opened.add(note.dataset.id); else opened.delete(note.dataset.id); });
  document.querySelectorAll('[data-group]').forEach(section => { if (section.open) openedTopics.add(section.dataset.group); else openedTopics.delete(section.dataset.group); });
  const search = $('#search-input').value.trim().toLocaleLowerCase('vi');
  const selected = questions.filter(q => topic === 'all' || q.topic === topic);
  const visible = selected.filter(q => (kind === 'all' || q.kind === kind) && (!$('#only-saved').checked || state.saved.includes(q.id)) && [lessonSearchText.get(q.group), questionSearchText.get(q.id)].join(' ').includes(search));
  const visibleGroups = studyGroups.filter(group => visible.some(q => q.group === group.id));
  const projectCount = filterProject(search);
  $('#results-status').textContent = selected.length ? `${visibleGroups.length} chủ đề · ${visible.length}/${selected.length} câu hỏi kiến thức${projectCount ? ` · ${projectCount} case dự án` : ''}` : '';
  $('#question-list').innerHTML = visible.length ? studyGroups.map(group => {
    const items = visible.filter(q => q.group === group.id);
    return items.length ? `<details class="learning-topic" data-group="${group.id}" ${openedTopics.has(group.id) || search ? 'open' : ''}><summary><span class="learning-title">${topic === 'all' ? `<span class="subject-label">${escapeHtml(group.topic)} · </span>` : ''}${escapeHtml(group.title)}</span><span class="topic-count">${items.length} câu hỏi</span></summary><div class="topic-content">${renderTheory(group)}<section class="topic-practice" aria-labelledby="practice-${group.id}"><h3 id="practice-${group.id}">Câu hỏi phỏng vấn <span>${items.length} câu</span></h3><div class="topic-questions">${items.map(renderQuestion).join('')}</div></section></div></details>` : '';
  }).join('') : `<p class="empty">${selected.length ? (search && projectCount ? 'Các case dự án khớp từ khóa nằm ở phần bên dưới.' : 'Chưa có câu hỏi phù hợp. Thử đổi loại câu hỏi, từ khóa hoặc bộ lọc đã lưu.') : `${escapeHtml(topic)}: chưa có nội dung.`}</p>`;
  document.querySelectorAll('[data-group]').forEach(section => section.addEventListener('toggle', () => { if (!section.isConnected) return; if (section.open) openedTopics.add(section.dataset.group); else openedTopics.delete(section.dataset.group); }));
  document.querySelectorAll('.note').forEach(note => note.addEventListener('toggle', () => { if (!note.isConnected) return; if (note.open) opened.add(note.dataset.id); else opened.delete(note.dataset.id); }));
}
$('.topic-links').innerHTML = '<button data-topic="all" class="active">Tất cả</button>' + paths.map(path => `<button data-topic="${path.topic}"># ${path.title}</button>`).join('');
document.querySelectorAll('[data-topic]').forEach(button => button.addEventListener('click', () => {
  topic = button.dataset.topic;
  $('#search-input').value = '';
  kind = 'all';
  document.querySelectorAll('[data-kind]').forEach(item => { item.classList.toggle('active', item.dataset.kind === kind); item.setAttribute('aria-pressed', item.dataset.kind === kind); });
  document.querySelectorAll('[data-topic]').forEach(item => { const active = item === button; item.classList.toggle('active', active); item.setAttribute('aria-pressed', active); });
  renderStats(); renderGuide(); renderQuestions();
}));
document.querySelectorAll('[data-kind]').forEach(button => button.addEventListener('click', () => {
  kind = button.dataset.kind;
  document.querySelectorAll('[data-kind]').forEach(item => { item.classList.toggle('active', item === button); item.setAttribute('aria-pressed', item === button); });
  renderQuestions();
}));
$('#search-input').addEventListener('input', renderQuestions);
$('#only-saved').addEventListener('change', renderQuestions);
$('#question-list').addEventListener('change', event => {
  const id = event.target.dataset.done;
  if (!id) return;
  state.done = event.target.checked ? [...new Set([...state.done, id])] : state.done.filter(item => item !== id);
  event.target.closest('.note').classList.toggle('completed', event.target.checked);
  persist(); renderStats();
});
$('#question-list').addEventListener('click', event => {
  const button = event.target.closest('[data-save]');
  if (!button) return;
  const id = button.dataset.save;
  const saved = !state.saved.includes(id);
  state.saved = saved ? [...state.saved, id] : state.saved.filter(item => item !== id);
  button.setAttribute('aria-pressed', saved);
  button.textContent = saved ? 'Đã lưu để ôn lại' : 'Lưu để ôn lại';
  persist(); renderStats();
  if ($('#only-saved').checked && !saved) { renderQuestions(); $('#only-saved').focus(); }
});
document.querySelectorAll('[data-topic]').forEach(button => { button.classList.toggle('active', button.dataset.topic === topic); button.setAttribute('aria-pressed', button.dataset.topic === topic); });
document.querySelectorAll('[data-kind]').forEach(button => button.setAttribute('aria-pressed', button.dataset.kind === kind));
initializeProject();
renderStats(); renderGuide(); renderQuestions();
