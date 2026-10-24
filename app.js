// Danh sách chủ đề. Bổ sung câu hỏi vào questions khi phát triển nội dung.
const paths = [
  { topic: 'Database', title: 'Database' },
  { topic: 'Java', title: 'Java' },
  { topic: 'Spring', title: 'Spring' },
  { topic: 'Web & API', title: 'Web & API' },
  { topic: 'Kafka', title: 'Kafka' },
  { topic: 'Redis', title: 'Redis' },
  { topic: 'Keycloak', title: 'Keycloak' },
  { topic: 'Design pattern', title: 'Design pattern' },
];
const studySubjects = [
  { ...databaseSubject, slug: 'database', project: databaseProject },
  { ...javaSubject, slug: 'java', project: javaProject },
  { ...springSubject, slug: 'spring', project: springProject },
  { ...webApiSubject, slug: 'web-api', project: webApiProject },
  {
    topic: 'Kafka', slug: 'kafka', sources: kafkaGuide.sources, lessons: kafkaLessons,
    groups: kafkaGuide.groups.map(group => ({ ...group, topic: 'Kafka' })), questions: kafkaQuestions,
    scope: 'Kafka 4.1 và Java client; consumer group thông thường, không phải share group. Các ví dụ ISR giả sử không bật ELR (Eligible Leader Replicas).',
    project: kafkaProject,
  },
  { ...redisSubject, slug: 'redis', project: redisProject },
  { ...keycloakSubject, slug: 'keycloak', project: keycloakProject },
  { ...patternSubject, slug: 'patterns', project: patternProject },
];
const subjectsByTopic = Object.fromEntries(studySubjects.map(subject => [subject.topic, subject]));
const studyGroups = studySubjects.flatMap(subject => subject.groups);
const studyLessons = Object.assign({}, ...studySubjects.map(subject => subject.lessons));
const questions = studySubjects.flatMap(subject => subject.questions);
const studyProjects = studySubjects.map(subject => ({ ...subject.project, topic: subject.topic, slug: subject.slug, sources: { ...subject.sources, ...subject.project.sources } }));
