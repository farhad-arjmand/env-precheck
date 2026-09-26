import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkEnv} from '../dist/esm/index.js';
const check=(contract,text='',extra={})=>checkEnv({contract:{name:'contract',text:contract},files:[{name:'input',text}],...extra});
const codes=r=>r.issues.map(i=>i.code);
test('contract values are documentation, never fallbacks',()=>{const r=check('TOKEN=sample');assert.deepEqual(codes(r),['missing']);assert.equal(r.status,'fail');});
test('valid keys, export, CRLF, BOM, whitespace and comments',()=>{assert.equal(check('\uFEFFexport MY_KEY = example\r\nlow_2=x','export MY_KEY=abc # comment\r\nlow_2=2').ok,true);});
test('quoted hashes, equals and multiline values',()=>{assert.equal(check('A=\nB=\nC=','A="hash#equals="\nB=\'line one\nline two\'\nC=unquoted=equals').ok,true);});
test('unquoted hashes are comments; quoted whitespace is preserved',()=>{assert.deepEqual(codes(check('A=','A=# secret')),['empty']);assert.equal(check('# @env type=string minLength=3\nA=','A=" x "').ok,true);});
test('blank required variables fail; blank optional variables skip validation',()=>{assert.deepEqual(codes(check('A=\n# @env optional type=port\nB=','A=\nB=')),['empty']);});
test('annotation scopes to next key across ordinary comments',()=>{const r=check('# @env optional\n# explanation\n\nA=\nB=');assert.deepEqual(r.issues.map(i=>i.key),['B']);});
test('multiple annotation lines merge',()=>{assert.equal(check('# @env type=integer\n# @env min=1 max=5\nA=','A=3').ok,true);});
test('later files override earlier sources',()=>{const r=check('A=',undefined,{files:[{name:'base',text:'A='},{name:'overlay',text:'A=value'}]});assert.equal(r.ok,true);});
test('duplicates within a file fail even when another file overrides them',()=>{const r=check('A=',undefined,{files:[{name:'base',text:'A=1\nA=2'},{name:'overlay',text:'A=3'}]});assert.equal(r.status,'invalid');assert.equal(r.issues[0].line,2);});
test('duplicate contract keys fail',()=>{assert.deepEqual(codes(check('A=1\nA=2')),['duplicate_key']);});
test('process environment overrides files without changing original objects',()=>{const env=Object.freeze({A:'2',UNRELATED:'anything'});assert.equal(check('# @env type=integer\nA=','A=bad',{environment:env,strict:true}).ok,true);});
test('inherited process properties are not used',()=>{assert.deepEqual(codes(check('A=',undefined,{environment:Object.create({A:'x'})})),['missing']);});
test('undefined process properties do not erase file values',()=>{assert.equal(check('A=','A=x',{environment:{A:undefined}}).ok,true);});
test('empty process variable overrides nonempty file and reports no invented line',()=>{const r=check('A=','A=x',{environment:{A:''}});assert.equal(r.issues[0].source,'process.env');assert.equal(r.issues[0].line,undefined);});
test('strict checks unknown file keys but ignores unrelated process keys',()=>{assert.deepEqual(codes(check('A=','A=x\nB=y',{strict:true,environment:{PATH:'x'}})),['unknown_key']);assert.equal(check('A=','A=x\nB=y').ok,true);});
test('prototype-looking keys work without prototype mutation',()=>{assert.equal(check('__proto__=\nconstructor=','__proto__=safe\nconstructor=ok',{strict:true}).ok,true);assert.equal({}.safe,undefined);});
for(const [type,good,bad] of [
 ['integer','-123','1.2'],['integer','9007199254740991','9007199254740992'],['number','1.2e3','NaN'],['number','.5','Infinity'],['number','1','0xff'],['port','65535','65536'],['port','1','0'],['boolean','true','1'],['boolean','false','TRUE'],['url','https://example.com/a','https:example.com'],['url','postgres://user:pass@localhost/db','not-a-url'],['json',"'{\"ok\":true}'",'{bad}'],['string','anything','']
]) test(`${type}: accepts ${good.length}-char valid value; rejects invalid input ${bad.length}`,()=>{assert.equal(check(`# @env type=${type}\nA=`,`A=${good}`).ok,true);assert.equal(check(`# @env type=${type}\nA=`,`A=${bad}`).ok,false);});
test('URLs support protocol allowlists without disclosing credentials',()=>{const c='# @env type=url protocols=https,postgres\nA=';assert.equal(check(c,'A=postgres://user:secret@host/db').ok,true);const r=check(c,'A=http://user:DO_NOT_LEAK@host/db');assert.deepEqual(codes(r),['invalid_type']);assert.ok(!JSON.stringify(r).includes('DO_NOT_LEAK'));});
test('URL rejects embedded whitespace and non-host schemes',()=>{for(const v of ['https://exam ple.com','mailto:a@b.com','file:///tmp/x'])assert.equal(check('# @env type=url\nA=',`A=${v}`).ok,false);});
test('enum values are exact and never included in reports',()=>{const c='# @env type=enum values=red,blue\nA=';assert.equal(check(c,'A=blue').ok,true);assert.deepEqual(codes(check(c,'A=green')),['invalid_type']);});
test('numeric ranges include endpoints',()=>{const c='# @env type=number min=-2 max=3\nA=';for(const n of [-2,3,0])assert.equal(check(c,`A=${n}`).ok,true);for(const n of [-3,4])assert.deepEqual(codes(check(c,`A=${n}`)),['out_of_range']);});
test('minLength counts unicode code points',()=>{const c='# @env minLength=2\nA=';assert.equal(check(c,'A=😀😀').ok,true);assert.deepEqual(codes(check(c,'A=😀')),['too_short']);});
for(const rule of ['type=unknown','type=enum','values=a,b','type=url protocols=HTTPS','type=string min=1','minLength=-1','minLength=1.5','type=integer min=3 max=1','optional required','optional optional','type=boolean type=port','what=foo','type=enum values=a,,b','type=enum values=a,a','optional=yes','min=NaN','protocols=https','min=','type=integer min=Infinity']) {
 test(`invalid annotation ${rule}`,()=>assert.equal(check(`# @env ${rule}\nA=`,'A=x').status,'invalid'));
}
test('orphan and empty annotations fail',()=>{assert.ok(codes(check('A=\n# @env optional','A=x')).includes('orphan_rule'));assert.ok(codes(check('# @env\nA=','A=x')).includes('invalid_rule'));});
test('empty contract fails closed',()=>{assert.equal(check('# only a comment','X=y').status,'invalid');});
for(const text of ['NO_EQUALS','BAD-KEY=value','A="unterminated','A="value" trailing','A=`shell`']) test(`syntax error is redacted (${text.length})`,()=>{const r=check('A=',text);assert.equal(r.status,'invalid');assert.ok(!JSON.stringify(r).includes(text));});
test('syntax errors do not leak source lines, invalid keys, JSON parser errors or secrets',()=>{for(const text of ['SUPERSECRET','A="SUPERSECRET','A="SUPERSECRET" tail','SECRET-KEY=SUPERSECRET','A=SUPERSECRET']) {const r=check('# @env type=json\nA=',text);assert.equal(r.ok,false);assert.ok(!JSON.stringify(r).includes('SUPERSECRET'));}});
test('invalid rules never echo annotation contents',()=>{const r=check('# @env password=SUPERSECRET\nA=','A=x');assert.equal(r.status,'invalid');assert.ok(!JSON.stringify(r).includes('SUPERSECRET'));});
test('input limit fails closed',()=>{assert.deepEqual(codes(check('A=','A='+ 'x'.repeat(1048576))),['input_too_large']);});
test('shell substitutions remain literal and are never evaluated',()=>{assert.equal(check('A=','A=$(anything)').ok,true);assert.equal(check('# @env type=url\nA=','A=${URL}').ok,false);});
