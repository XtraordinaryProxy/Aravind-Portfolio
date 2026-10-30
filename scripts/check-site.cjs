const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const pages = ['index.html', ...fs.readdirSync(path.join(root,'case-studies')).filter(n=>n.endsWith('.html')).map(n=>'case-studies/'+n)];
const errors=[];
const documents=new Map();
for(const file of pages){
  const html=fs.readFileSync(path.join(root,file),'utf8');
  const ids=[...html.matchAll(/\bid\s*=\s*["']([^"']+)["']/g)].map(m=>m[1]);
  if(new Set(ids).size!==ids.length) errors.push(`${file}: duplicate element IDs`);
  if(!/<html\b[^>]*lang=["']en["']/i.test(html)) errors.push(`${file}: missing page language`);
  if(!/<title>[^<]+<\/title>/i.test(html)) errors.push(`${file}: missing title`);
  if(!/name=["']viewport["']/i.test(html)) errors.push(`${file}: missing viewport`);
  documents.set(file,{html,ids:new Set(ids)});
  let n=0;
  for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
    if(/\bsrc\s*=/.test(match[1]) || /application\/(?:ld\+)?json/.test(match[1])) continue;
    try{new vm.Script(match[2],{filename:`${file}:inline-${++n}`});}catch(e){errors.push(e.message);}
  }
}
for(const [file,{html}] of documents){
  for(const match of html.matchAll(/\b(?:href|src)\s*=\s*["']([^"']+)["']/g)){
    const link=match[1];
    if(/^(?:[a-z][\w+.-]*:|\/\/)/i.test(link)) continue;
    const [rawPath,hash]=link.split('#');
    const localPath=decodeURIComponent(rawPath.split('?')[0]);
    const full=localPath?path.resolve(localPath.startsWith('/')?root:path.dirname(path.join(root,file)),localPath.replace(/^\//,'')):path.join(root,file);
    const relative=path.relative(root,full).split(path.sep).join('/');
    if(relative.startsWith('../')) {errors.push(`${file}: link escapes project`);continue;}
    if(!fs.existsSync(full)) errors.push(`${file}: missing local target ${link}`);
    if(hash && documents.has(relative) && !documents.get(relative).ids.has(decodeURIComponent(hash))) errors.push(`${file}: missing anchor ${link}`);
  }
}
for(const file of fs.readdirSync(path.join(root,'api')).filter(f=>f.endsWith('.js'))){
  try{execFileSync(process.execPath,['--check',path.join(root,'api',file)],{stdio:'pipe'});}catch(e){errors.push(`api/${file}: invalid JavaScript`);}
}
if(errors.length){console.error(errors.join('\n'));process.exit(1);}
console.log(`PASS: ${pages.length} pages — local links, anchors, metadata and JavaScript syntax.`);
