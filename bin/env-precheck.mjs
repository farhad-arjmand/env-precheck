#!/usr/bin/env node
import {openSync,readSync,closeSync,statSync,readFileSync} from 'node:fs';
import {checkEnv} from '../dist/esm/index.js';
const help=`env-precheck — catch broken configuration before deployment

Usage: env-precheck [options]

  --contract FILE   Annotated .env.example contract (default: .env.example)
  --env FILE        Input file; repeat for ordered overlays (default: .env)
  --process         Overlay declared keys from the current process environment
                    With no --env, validate process variables only
  --strict          Reject input-file keys absent from the contract
  --format FORMAT   text (default) or json
  --help            Show this help
  --version         Show the installed version

Values are never included in validation reports. Files are never modified.
Exit codes: 0 pass, 1 validation failed, 2 invalid input or usage.
`;
const args=process.argv.slice(2);
let contract='.env.example',files=[],useProcess=false,strict=false,format='text';
const safeError=(code,message,source)=>({ok:false,status:'invalid',checked:0,issues:[{code,message,...(source?{source}:{})}]});
function print(report) {
  if (format==='json') console.log(JSON.stringify(report,null,2));
  else {
    for (const item of report.issues) console.log(`${JSON.stringify(item.source ?? 'CLI')}${item.line ? `:${item.line}` : ''} ${item.code}${item.key ? ` ${item.key}` : ''}: ${item.message}`);
    console.log(report.ok ? `PASS: ${report.checked} variables checked.` : `FAIL: ${report.issues.length} issue(s). Values omitted.`);
  }
  process.exitCode=report.status==='invalid' ? 2 : report.ok ? 0 : 1;
}
try {
  for(let i=0;i<args.length;i++) {
    const arg=args[i];
    if(arg==='--help') {console.log(help);process.exit(0);}
    if(arg==='--version') {console.log(JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version);process.exit(0);}
    if(arg==='--process') useProcess=true;
    else if(arg==='--strict') strict=true;
    else if(['--contract','--env','--format'].includes(arg)) {
      const value=args[++i];
      if(!value || value.startsWith('--')) throw safeError('invalid_usage','A flag value is missing.');
      if(arg==='--contract') contract=value;
      else if(arg==='--env') files.push(value);
      else if(value==='text'||value==='json') format=value;
      else throw safeError('invalid_usage','Format must be text or json.');
    } else throw safeError('invalid_usage','Unknown argument. Use --help for usage.');
  }
  if(!files.length && !useProcess) files=['.env'];
  const read=path=>{
    let fd;
    try {
      if(!statSync(path).isFile()) throw new Error('not-file');
      fd=openSync(path,'r');
      const buffer=Buffer.alloc(1048577); let size=0,count;
      while(size<buffer.length && (count=readSync(fd,buffer,size,buffer.length-size,null))>0) size+=count;
      if(size>1048576) throw safeError('input_too_large','File exceeds the 1 MiB byte limit.',path);
      return {name:path,text:new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,size))};
    } catch(error) {
      if(error?.status==='invalid') throw error;
      throw safeError('unreadable_file','Cannot read a regular UTF-8 file.',path);
    } finally {if(fd!==undefined)closeSync(fd);}
  };
  print(checkEnv({contract:read(contract),files:files.map(read),environment:useProcess ? process.env:undefined,strict}));
} catch(error) {
  print(error?.status==='invalid' ? error : safeError('internal_error','Unable to complete validation. Values omitted.'));
}
