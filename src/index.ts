export interface EnvSource { name: string; text: string }
export type IssueCode = 'input_too_large' | 'invalid_syntax' | 'duplicate_key' | 'invalid_rule' | 'orphan_rule' | 'empty_contract' | 'missing' | 'empty' | 'invalid_type' | 'out_of_range' | 'too_short' | 'unknown_key';
export interface Issue { code: IssueCode; source: string; line?: number; key?: string; message: string }
export interface Report { ok: boolean; status: 'pass' | 'fail' | 'invalid'; checked: number; issues: Issue[] }
export interface CheckOptions {
  contract: EnvSource;
  /** Later files override earlier files. Duplicate keys inside one file are errors. */
  files?: readonly EnvSource[];
  /** Own properties matching contract keys override files. Other process variables are ignored. */
  environment?: Readonly<Record<string, string | undefined>>;
  /** Report file keys absent from the contract. Default: false. */
  strict?: boolean;
}
type Kind = 'string' | 'integer' | 'number' | 'port' | 'boolean' | 'url' | 'enum' | 'json';
interface Rule { type: Kind; optional: boolean; min?: number; max?: number; minLength?: number; values?: string[]; protocols?: string[] }
interface Item { key: string; value: string; line: number; rule: Rule }
const messages: Record<IssueCode,string> = {
  input_too_large: 'Input exceeds the 1 MiB character limit.',
  invalid_syntax: 'Invalid dotenv syntax; source values are omitted.',
  duplicate_key: 'Key is declared more than once in this file.',
  invalid_rule: 'Invalid or conflicting @env rule.',
  orphan_rule: 'An @env rule has no following variable.',
  empty_contract: 'The contract must declare at least one variable.',
  missing: 'Required variable is missing.',
  empty: 'Required variable is empty.',
  invalid_type: 'Value does not match the declared type.',
  out_of_range: 'Numeric value is outside the declared range.',
  too_short: 'Value is shorter than the declared minimum length.',
  unknown_key: 'File key is not declared in the contract.',
};
function issue(code: IssueCode, source: string, line?: number, key?: string): Issue {
  return { code, source, ...(line === undefined ? {} : {line}), ...(key === undefined ? {} : {key}), message: messages[code] };
}
const kinds = new Set<Kind>(['string','integer','number','port','boolean','url','enum','json']);
function ruleFrom(tokens: string[]): Rule | undefined {
  const rule: Rule = {type:'string',optional:false};
  const seen = new Set<string>();
  for (const token of tokens) {
    const match = /^([A-Za-z]+)(?:=(\S+))?$/.exec(token);
    if (!match) return;
    const [,name,value] = match;
    if (seen.has(name)) return;
    seen.add(name);
    if (name === 'optional' || name === 'required') {
      if (value !== undefined || (seen.has('optional') && seen.has('required'))) return;
      rule.optional = name === 'optional';
    } else if (name === 'type') {
      if (!kinds.has(value as Kind)) return;
      rule.type = value as Kind;
    } else if (name === 'min' || name === 'max' || name === 'minLength') {
      if (value === undefined || !/^-?(?:\d+\.?\d*|\.\d+)$/.test(value) || !Number.isFinite(Number(value))) return;
      rule[name] = Number(value);
    } else if (name === 'values' || name === 'protocols') {
      if (!value) return;
      const items = value.split(',');
      if (items.some(item => !item) || new Set(items).size !== items.length) return;
      rule[name] = items;
    } else return;
  }
  if (rule.min !== undefined || rule.max !== undefined) {
    if (!['integer','number','port'].includes(rule.type)) return;
    if (rule.min !== undefined && rule.max !== undefined && rule.min > rule.max) return;
  }
  if (rule.minLength !== undefined && (rule.type !== 'string' || !Number.isSafeInteger(rule.minLength) || rule.minLength < 0)) return;
  if (rule.type === 'enum' ? !rule.values : rule.values !== undefined) return;
  if (rule.protocols !== undefined && (rule.type !== 'url' || rule.protocols.some(p => !/^[a-z][a-z0-9+.-]*$/.test(p)))) return;
  return rule;
}
/** Strict dotenv subset: quotes, multiline quoted values, comments, export and CRLF. No expansion. */
function parse(source: EnvSource, contract: boolean): {items: Item[]; issues: Issue[]} {
  const issues: Issue[] = [], items: Item[] = [];
  if (source.text.length > 1048576) return {items,issues:[issue('input_too_large',source.name)]};
  const lines = source.text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split('\n');
  const seen = new Set<string>();
  let tokens: string[] = [], annotationLine: number | undefined;
  for (let i=0; i<lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('#')) {
      if (contract && /^#\s*@env(?:\s|$)/.test(trimmed)) {
        annotationLine ??= i+1;
        const body = trimmed.replace(/^#\s*@env\s*/,'');
        if (!body) issues.push(issue('invalid_rule',source.name,i+1));
        else tokens.push(...body.split(/\s+/));
      }
      continue;
    }
    const line = i+1;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(trimmed);
    if (!match) {
      issues.push(issue('invalid_syntax',source.name,line)); tokens=[]; annotationLine=undefined; continue;
    }
    const [,key,raw] = match;
    let value: string;
    const quote = raw[0];
    if (quote === '"' || quote === "'") {
      let rest=raw.slice(1), end=rest.indexOf(quote);
      while (end === -1 && i+1 < lines.length) { rest+='\n'+lines[++i]; end=rest.indexOf(quote); }
      if (end === -1 || !/^\s*(?:#.*)?$/.test(rest.slice(end+1))) {
        issues.push(issue('invalid_syntax',source.name,line,key)); tokens=[]; annotationLine=undefined; continue;
      }
      value=rest.slice(0,end);
    } else {
      value=raw.split('#',1)[0].trim();
      // Backtick quoting and shell expansion are not interpreted.
      if (value.startsWith('`')) { issues.push(issue('invalid_syntax',source.name,line,key)); tokens=[]; annotationLine=undefined; continue; }
    }
    const rule=ruleFrom(tokens);
    if (!rule) issues.push(issue('invalid_rule',source.name,annotationLine ?? line,key));
    if (seen.has(key)) issues.push(issue('duplicate_key',source.name,line,key));
    seen.add(key);
    items.push({key,value,line,rule:rule ?? {type:'string',optional:false}});
    tokens=[]; annotationLine=undefined;
  }
  if (annotationLine !== undefined) issues.push(issue('orphan_rule',source.name,annotationLine));
  return {items,issues};
}
function validate(value: string, rule: Rule): IssueCode | undefined {
  let valid=true;
  switch (rule.type) {
    case 'integer': valid=/^[+-]?\d+$/.test(value) && Number.isSafeInteger(Number(value)); break;
    case 'number': valid=/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value) && Number.isFinite(Number(value)); break;
    case 'port': valid=/^\d+$/.test(value) && Number(value)>=1 && Number(value)<=65535; break;
    case 'boolean': valid=value==='true' || value==='false'; break;
    case 'enum': valid=rule.values!.includes(value); break;
    case 'url':
      try { const url=new URL(value); valid=/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(value) && !/\s/.test(value) && !!url.hostname && (rule.protocols === undefined || rule.protocols.includes(url.protocol.slice(0,-1))); }
      catch { valid=false; } break;
    case 'json': try { JSON.parse(value); } catch { valid=false; } break;
  }
  if (!valid) return 'invalid_type';
  if ((rule.min !== undefined && Number(value)<rule.min) || (rule.max !== undefined && Number(value)>rule.max)) return 'out_of_range';
  if (rule.minLength !== undefined && [...value].length < rule.minLength) return 'too_short';
}
/** Validate without loading process.env, executing code, performing network I/O or returning values. */
export function checkEnv(options: CheckOptions): Report {
  const contract=parse(options.contract,true);
  const issues=[...contract.issues];
  if (contract.items.length === 0) issues.push(issue('empty_contract',options.contract.name));
  const values=new Map<string,{value:string;source:string;line?:number}>();
  for (const file of options.files ?? []) {
    const parsed=parse(file,false);
    issues.push(...parsed.issues);
    for (const item of parsed.items) values.set(item.key,{value:item.value,source:file.name,line:item.line});
  }
  if (issues.length) return {ok:false,status:'invalid',checked:0,issues};
  const keys=new Set(contract.items.map(item=>item.key));
  if (options.strict) for (const [key,entry] of values) if (!keys.has(key)) issues.push(issue('unknown_key',entry.source,entry.line,key));
  for (const item of contract.items) {
    const key=item.key;
    if (options.environment && Object.hasOwn(options.environment,key) && options.environment[key] !== undefined) {
      values.set(key,{value:options.environment[key]!,source:'process.env'});
    }
    const entry=values.get(key);
    if (!entry || entry.value.trim()==='') {
      if (!item.rule.optional) issues.push(issue(entry ? 'empty' : 'missing',entry?.source ?? options.contract.name,entry ? entry.line : item.line,key));
      continue;
    }
    const code=validate(entry.value,item.rule);
    if (code) issues.push(issue(code,entry.source,entry.line,key));
  }
  return {ok:issues.length===0,status:issues.length ? 'fail':'pass',checked:contract.items.length,issues};
}
