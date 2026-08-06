import fs from 'fs';

let s = fs.readFileSync('physics.html', 'utf8');
s = s.replace('<html lang="zh-CN">', '<html lang="zh-CN" data-lab-mode="chem">');
s = s.replace('<body>', '<body data-lab-mode="chem">');
s = s.replace('未来物理实验室 · 交互实验', 'HoloChem · 化学实验室');
s = s.replaceAll('HoloPhysics', 'HoloChem');
s = s.replaceAll('未来物理实验室', '化学实验室');
s = s.replace('掌握了，进入物理世界 (E)', '掌握了，进入化学实验室 (E)');
s = s.replace('在物理实验室中', '在化学实验室中');
s = s.replace('大型物理仪器', '化学实验器材');
s = s.replace('物理理论推导公式', '化学实验步骤与成分');
fs.writeFileSync('chem.html', s, 'utf8');
console.log('chem.html written', {
  mode: s.includes('data-lab-mode="chem"'),
  title: s.match(/<title>([^<]+)/)?.[1],
});
