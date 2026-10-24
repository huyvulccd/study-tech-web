// Các hàm này chỉ chuẩn hóa dữ liệu; lời giải và ví dụ được viết riêng từng mục.
function studyConcept(term, meaning, purpose, rules, practicalExample, interviewAnswer) {
  return { term, meaning, purpose, rules, practicalExample, interviewAnswer, exampleLabel: 'Ví dụ thực tế' };
}
function studyQuestion(id, kind, title, answer, minimum, middle, followUp, frame, sources) {
  return { id, kind, title, answer, minimum, middle, deep: followUp[0], deepAnswer: followUp[1], frame, sources };
}
function defineStudySubject({ topic, scope, sources, chapters, level = 'Middle / Middle+' }) {
  const prefix = topic === 'Design pattern' ? 'pattern' : topic === 'Web & API' ? 'webapi' : topic.toLowerCase();
  const groups = chapters.map(chapter => ({ id: `${prefix}-${chapter.id}`, title: chapter.title, topic, level, questionIds: chapter.questions.map(question => question.id) }));
  return {
    topic, scope, sources, groups,
    lessons: Object.fromEntries(chapters.map((chapter, i) => [groups[i].id, chapter.lesson])),
    questions: chapters.flatMap((chapter, i) => chapter.questions.map(question => ({ ...question, topic, group: groups[i].id, level }))),
  };
}
