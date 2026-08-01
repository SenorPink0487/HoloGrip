#!/usr/bin/env node

import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const output = process.argv[2] || '/tmp/hologrip-metrics-seed.sql';
const classNames = [
  '函数与图像探究班', '几何思维训练班', '数学建模实践班', '竞赛基础提升班',
  '解析几何专题班', '概率统计研习班', '数列方法训练班', '立体几何进阶班',
  '代数思维拓展班', '高考数学冲刺班', '物理实验探究班', '化学基础提升班',
  '英语阅读训练班', '语文写作提升班', '科学思维启蒙班', '编程兴趣实践班',
  '智能设计创作班', '天文观测兴趣班', '机器人实践班', '创新实验研习班',
  '微积分预备班', '线性代数启蒙班', '逻辑推理训练班', '空间想象提升班',
  '数学阅读分享班', '理科综合提升班', '数理思维拓展班', '实验数据分析班',
  '信息技术实践班', '算法思维训练班', '函数专题研习班', '几何证明训练班',
  '综合素养提升班', '小组合作探究班', '学科融合实践班', '阶段复习提升班',
  '专题讲解研习班', '同步巩固训练班', '自主学习实践班', '综合能力拓展班',
];
const lessonTopics = [
  '基础概念与方法', '典型例题精讲', '图像变化规律', '问题建模实践', '错题整理与复盘',
  '小组合作探究', '综合应用训练', '阶段知识梳理', '开放问题讨论', '实验数据分析',
  '重点难点突破', '课堂练习讲评', '学习方法分享', '专题复习导入', '思维拓展练习',
  '实践任务设计', '课后反馈交流', '综合案例分析', '知识网络构建', '阶段成果展示',
];

function sql(value) {
  return `'${String(value).replaceAll('\\', '\\\\').replaceAll("'", "''")}'`;
}

function code() {
  return `HG${randomBytes(4).toString('hex').toUpperCase()}`;
}

const classRows = classNames.map((name, index) => ({
  name: `${name}${index + 1}`,
  description: `用于${name}的模拟教学数据`,
  inviteCode: code(),
  teacherOffset: index,
}));

const statements = ['START TRANSACTION;'];
for (const row of classRows) {
  statements.push(
    `INSERT INTO classes (name, description, teacher_id, invite_code) VALUES (${sql(row.name)}, ${sql(row.description)}, (SELECT id FROM users WHERE role = 'user' ORDER BY id LIMIT 1 OFFSET ${row.teacherOffset}), ${sql(row.inviteCode)});`
  );
}

for (let i = 0; i < 273; i += 1) {
  const classRow = classRows[i % classRows.length];
  const date = new Date(Date.UTC(2026, 4, 10) + Math.floor(i * 77_000_000));
  const dateText = date.toISOString().slice(0, 10);
  const title = `${lessonTopics[i % lessonTopics.length]}（第${i + 1}次）`;
  statements.push(
    `INSERT INTO lessons (class_id, title, lesson_date, created_by) VALUES ((SELECT id FROM classes WHERE name = ${sql(classRow.name)}), ${sql(title)}, ${sql(dateText)}, (SELECT teacher_id FROM classes WHERE name = ${sql(classRow.name)}));`
  );
}

statements.push(
  `INSERT INTO whiteboard_snapshots (user_id, data_json, updated_at) SELECT u.id, '{}', NOW() FROM users u LEFT JOIN whiteboard_snapshots w ON w.user_id = u.id WHERE w.user_id IS NULL ORDER BY u.id LIMIT 798;`
);
statements.push(
  `INSERT INTO lesson_whiteboard_snapshots (lesson_id, data_json, version, updated_by, updated_at) SELECT l.id, '{}', 1, (SELECT id FROM users ORDER BY id LIMIT 1), NOW() FROM lessons l LEFT JOIN lesson_whiteboard_snapshots w ON w.lesson_id = l.id WHERE w.lesson_id IS NULL ORDER BY l.id LIMIT 273;`
);
statements.push('COMMIT;');
statements.push('SELECT (SELECT COUNT(*) FROM classes) AS active_classes, (SELECT COUNT(*) FROM lessons) AS total_lessons, (SELECT COUNT(*) FROM whiteboard_snapshots) AS personal_whiteboards, (SELECT COUNT(*) FROM lesson_whiteboard_snapshots) AS lesson_whiteboards;');
await writeFile(output, `${statements.join('\n')}\n`, 'utf8');
console.log(JSON.stringify({ output, classes: classRows.length, lessons: 273, personalWhiteboards: 798, lessonWhiteboards: 273 }));
