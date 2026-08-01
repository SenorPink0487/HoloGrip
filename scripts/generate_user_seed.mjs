#!/usr/bin/env node

import { randomBytes, randomInt } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const count = 920;
const qqCount = 800;
const start = new Date('2026-05-10T00:00:00Z');
const end = new Date('2026-07-25T23:59:59Z');
const outputDir = process.argv[2] || '/tmp/hologrip-user-seed-20260729';

const chineseNicknames = ['小橘子', '清风自来', '星河漫游者', '晚风吹过', '一颗薄荷糖', '山止川行', '爱吃草莓', '今天也很困', '南巷清风', '半夏微凉', '云端散步', '月亮邮差', '热爱生活', '落日贩卖机', '青柠汽水', '小太阳', '听风看海', '慢慢长大', '银河系漫游', '橘子海', '不晚睡星人', '山野有雾', '桃桃乌龙', '快乐小狗', '安静的海', '晨光熹微', '小熊软糖', '风会记得', '旧巷听雨', '追风少年', '一米阳光', '云上旅行', '木棉花开', '柚子茶', '向日葵女孩', '浪漫收藏家', '远方来信', '雨后初晴', '晚安月亮', '蓝色星球', '小小宇航员', '温柔半两', '路过人间', '北岛来风', '夏日汽水', '猫与薄荷', '山高水长', '森林来信', '日落之前'];
const englishNicknames = ['Luna', 'Ethan', 'Olivia', 'Mason', 'Ivy', 'Noah', 'Chloe', 'Leo', 'Mia', 'Oliver', 'Sophie', 'Aiden', 'Emma', 'Lucas', 'Ella', 'Jack', 'Grace', 'Ryan', 'Alice', 'James', 'Stella', 'Henry', 'Zoe', 'Daniel', 'Aria', 'William', 'Nora', 'Owen', 'Mila', 'Theodore', 'Sunny', 'Moonlight', 'BlueSky', 'LittleStar', 'CoffeeTime', 'WildRose', 'OceanView', 'DreamWalker', 'QuietDays', 'GoldenHour', 'CloudNine', 'Wanderlust', 'MapleLeaf', 'MorningDew', 'AfterRain', 'SimpleJoy', 'NorthStar', 'RiverSong', 'SummerVibe'];
const chineseTails = ['看星星', '在路上', '爱喝茶', '听晚风', '去远方', '想吃甜', '等花开', '晒太阳', '慢慢走', '有点甜'];
const englishTails = ['River', 'Sky', 'Moon', 'Mills', 'Stone', 'Woods', 'Rain', 'Lake', 'Cloud', 'Bloom'];
const usedEmails = new Set();
const usedUsernames = new Set();

function sql(value) {
  return `'${String(value).replaceAll('\\', '\\\\').replaceAll("'", "''")}'`;
}

function randomDate() {
  return new Date(start.getTime() + Math.floor(Math.random() * (end.getTime() - start.getTime() + 1)));
}

function fmt(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function randomItem(items) {
  return items[randomInt(0, items.length)];
}

function makeUsername(index) {
  const isChinese = index % 2 === 0;
  const names = isChinese ? chineseNicknames : englishNicknames;
  const tails = isChinese ? chineseTails : englishTails;
  let username;
  do {
    const base = randomItem(names);
    const tail = randomItem(tails);
    const suffix = randomInt(0, 4);
    if (isChinese) {
      username = [base, `${base}${tail}`, `${base}·${tail}`, `${base}_${randomInt(1, 100)}`][suffix];
    } else {
      username = [base, `${base}${tail}`, `${base}_${tail}`, `${base}${randomInt(1, 100)}`][suffix];
    }
  } while (usedUsernames.has(username));
  usedUsernames.add(username);
  return username;
}

function makeRow(index) {
  const username = makeUsername(index);
  const domain = index < qqCount ? 'qq.com' : '163.com';
  let prefix;
  do {
    prefix = String(randomInt(1_000_000_000, 10_000_000_000));
  } while (usedEmails.has(prefix));
  usedEmails.add(prefix);
  const email = `${prefix}@${domain}`;
  const createdAt = fmt(randomDate());
  // Deliberately not a valid password hash: these are non-login placeholder accounts.
  const passwordHash = `disabled$${randomBytes(32).toString('hex')}`;
  return { index: index + 1, username, email, createdAt, passwordHash, domain };
}

const rows = Array.from({ length: count }, (_, index) => makeRow(index));
const csv = [
  '序号,用户名,邮箱,邮箱域名,创建时间,登录状态',
  ...rows.map((row) => `${row.index},${row.username},${row.email},${row.domain},${row.createdAt},不可登录`),
  '',
].join('\n');

const statements = rows.map((row) =>
  `INSERT INTO users (username, email, password_hash, role, created_at, updated_at) VALUES (${sql(row.username)}, ${sql(row.email)}, ${sql(row.passwordHash)}, 'user', ${sql(row.createdAt)}, ${sql(row.createdAt)});`
).join('\n');
const sqlText = [
  '-- HoloGrip synthetic user seed; generated 2026-07-29; review before production use.',
  '-- 800 qq.com accounts + 120 163.com accounts; all are deliberately non-login placeholders.',
  'START TRANSACTION;',
  statements,
  'COMMIT;',
  '',
].join('\n');

await mkdir(outputDir, { recursive: true });
await writeFile(path.join(outputDir, 'users_preview.csv'), csv, 'utf8');
await writeFile(path.join(outputDir, 'users_import.sql'), sqlText, 'utf8');
console.log(JSON.stringify({ outputDir, count: rows.length, qq: qqCount, one63: count - qqCount, minDate: rows.map((r) => r.createdAt).sort()[0], maxDate: rows.map((r) => r.createdAt).sort().at(-1) }, null, 2));
