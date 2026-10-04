// 保留 Rust 依赖的许可原文及署名；完整依赖源码另在源码归档中提供。
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const vendor = path.join(root, '.cache/source-vendor');
const destination = path.join(root, 'mobile/android/app/src/main/assets/licenses/dependencies');
fs.mkdirSync(destination,{recursive:true});
let count = 0;
for(const entry of fs.readdirSync(vendor,{withFileTypes:true})) {
  if(!entry.isDirectory()) continue;
  const source = path.join(vendor,entry.name);
  const dir = path.join(destination,entry.name);
  const names = fs.readdirSync(source).filter(name=>/^(license|copying|notice|copyright|authors)/i.test(name));
  fs.mkdirSync(dir,{recursive:true});
  for(const name of names) fs.cpSync(path.join(source,name),path.join(dir,name),{recursive:true});
  const cargo = fs.readFileSync(path.join(source,'Cargo.toml'),'utf8');
  const license = cargo.match(/^license\s*=\s*"([^"]+)"/m)?.[1] ?? '见对应源码';
  const version = cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1] ?? '';
  fs.writeFileSync(path.join(dir,'PACKAGE.txt'),`${entry.name} ${version}\nLicense: ${license}\n对应完整源码：source-vendor/${entry.name}/\n`);
  count++;
}
fs.writeFileSync(path.join(destination,'README.txt'),`保留 ${count} 个锁定 Rust 包的许可文件（含其他构建目标使用的包）。完整源代码随源码归档提供。\n`);
console.log(`已保留 ${count} 个依赖包的许可与来源记录。`);
