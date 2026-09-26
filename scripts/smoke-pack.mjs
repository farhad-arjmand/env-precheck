import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const root=process.cwd();
const npm=(args,options={})=>execFileSync(process.execPath,[process.env.npm_execpath,...args],options);
const packed=JSON.parse(npm(['pack','--json'],{encoding:'utf8'}))[0];
for(const file of packed.files) if(!['README.md','LICENSE','package.json'].includes(file.path)&&!file.path.startsWith('dist/')&&!file.path.startsWith('bin/')) throw new Error(`Unexpected file: ${file.path}`);
const dir=mkdtempSync(join(tmpdir(),'env-precheck-consumer-'));
try {
  writeFileSync(join(dir,'package.json'),JSON.stringify({private:true,type:'module'}));
  npm(['install','--ignore-scripts','--no-audit','--no-fund',resolve(packed.filename)],{cwd:dir,stdio:'pipe'});
  const expression="const report=checkEnv({contract:{name:'example',text:'A='},environment:{A:'ok'}}); if(!report.ok)throw new Error('Validation failed');";
  execFileSync(process.execPath,['--input-type=module','-e',"import {checkEnv} from 'env-precheck';"+expression],{cwd:dir,stdio:'inherit'});
  execFileSync(process.execPath,['-e',"const {checkEnv}=require('env-precheck');"+expression],{cwd:dir,stdio:'inherit'});
  writeFileSync(join(dir,'.env.example'),'A=');writeFileSync(join(dir,'.env'),'A=NOT_A_REAL_SECRET');
  const output=npm(['exec','--offline','--','env-precheck','--format','json'],{cwd:dir,encoding:'utf8'});
  if(!JSON.parse(output).ok||output.includes('NOT_A_REAL_SECRET'))throw new Error('CLI failed');
  for(const ext of ['mts','cts']) {
    writeFileSync(join(dir,`consumer.${ext}`),"import {checkEnv,type Report} from 'env-precheck'; const r:Report=checkEnv({contract:{name:'example',text:'A='},environment:{A:'ok'}}); void r;");
    execFileSync(process.execPath,[join(root,'node_modules/typescript/bin/tsc'),'--noEmit','--strict','--module','NodeNext','--moduleResolution','NodeNext','--target','ES2022',`consumer.${ext}`],{cwd:dir,stdio:'inherit'});
  }
  console.log(`Packed artifact verified: ${packed.filename}; ${packed.size} bytes; CLI, ESM, CommonJS and declarations passed.`);
} finally {rmSync(dir,{recursive:true,force:true});}
