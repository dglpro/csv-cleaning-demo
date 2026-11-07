import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseCsv,encodeCsv,cleanTables,run} from './clean-csv.mjs';

let checks=0;
function check(name,fn){fn();checks++;console.log('PASS '+name);}
const config={keys:['id'],trim:['name'],required:['name']};
const make=(source,rows)=>({source,rows:[['id','name','phone','note'],...rows]});
check('quoted newline, comma, quotes and BOM survive parse/encode',()=>{
 const original=[['id','note'],['0001','第一行\r\n第二行,"你好"'],['0002','']];
 assert.deepEqual(parseCsv('\uFEFF'+encodeCsv(original)),original);
});
check('ambiguous malformed CSV is rejected',()=>{
 for(const csv of ['id,name\n1,"unfinished','id,name\n1,ab"cd','id,name\n1,"a"extra'])assert.throws(()=>parseCsv(csv));
});
check('only declared fields are trimmed; leading zero strings survive',()=>{
 const x=cleanTables([make('a',[['0001',' 张一 ','013000000001','  保留空格  ']])],config);
 assert.deepEqual(x.rows[1],['0001','张一','013000000001','  保留空格  ']);
});
check('exact duplicates keep one and record the discarded source',()=>{
 const x=cleanTables([make('a',[['0001','张一','013000000001','']]),make('b',[['0001','张一','013000000001','']])],config);
 assert.equal(x.rows.length,2);assert.equal(x.report.duplicates[0].source,'b');
});
check('all rows with a conflicting key are held for review',()=>{
 const x=cleanTables([make('a',[['0001','张一','013000000001','北京'],['0001','张一','013000000001','深圳'],['0001','张一','013000000001','北京']])],config);
 assert.equal(x.rows.length,1);assert.equal(x.report.conflicts[0].records.length,3);assert.equal(x.report.duplicates.length,0);
});
check('keeping duplicates does not auto-resolve conflicting keys',()=>{
 const x=cleanTables([make('a',[['1','A','01',''],['1','A','01',''],['2','B','02',''],['2','C','02','']])],{...config,deduplicate:false});
 assert.equal(x.report.summary.outputRecords,2);assert.equal(x.report.summary.duplicateRecords,0);assert.equal(x.report.summary.conflictRecords,2);
 assert.throws(()=>cleanTables([make('a',[])],{...config,deduplicate:'false'}));
});
check('missing keys, required values and wrong widths are recorded',()=>{
 const x=cleanTables([make('a',[['','张一','1',''],['0002','  ','2',''],['0003','王三'],['','','','']])],config);
 assert.equal(x.report.summary.rejectedRecords,3);assert.equal(x.report.summary.blankRecords,1);
});
check('mismatched and duplicate headers stop processing',()=>{
 assert.throws(()=>cleanTables([make('a',[]),{source:'b',rows:[['name','id','phone','note']]}],config));
 assert.throws(()=>cleanTables([{source:'a',rows:[['id','id']]}],{keys:['id']}));
});
check('compound keys remain distinct with embedded delimiters',()=>{
 const x=cleanTables([{source:'a',rows:[['a','b'],['x|y','z'],['x','y|z']]}],{keys:['a','b']});
 assert.equal(x.report.summary.outputRecords,2);
});

// Exercise the actual file interface and verify that it never replaces input or prior output.
const tempRoot=process.argv[2]??tmpdir();
await mkdir(tempRoot,{recursive:true});
const temp=await mkdtemp(join(tempRoot,'csv-cleaning-verification-'));
const input=join(temp,'input.csv'),rules=join(temp,'rules.json'),out=join(temp,'result');
await writeFile(input,'id,name,phone,note\r\n0001, 张一 ,013000000001,说明\r\n');
await writeFile(rules,JSON.stringify(config));
const original=await readFile(input);
await run(['--config',rules,'--out',out,input]);
assert.deepEqual(await readFile(input),original);
assert.equal((await readFile(join(out,'cleaned.csv'),'utf8')).includes('0001,张一,013000000001,说明'),true);
await assert.rejects(run(['--config',rules,'--out',out,input]),/EEXIST/);
assert.deepEqual(await readFile(input),original);
checks++;console.log('PASS actual file interface preserves input and refuses existing output');

const invalid=join(temp,'invalid.csv'),invalidOut=join(temp,'invalid-output');
await writeFile(invalid,'id,name\n1,"unfinished');
await assert.rejects(run(['--config',rules,'--out',invalidOut,invalid]));
await mkdir(invalidOut); // It must not have been created before validation failed.
checks++;console.log('PASS invalid input produces no output folder');
const nonUtf8=join(temp,'non-utf8.csv'),nonUtf8Out=join(temp,'non-utf8-output');
await writeFile(nonUtf8,Buffer.from([0x69,0x64,0x2c,0x6e,0x61,0x6d,0x65,0x0a,0x31,0x2c,0xff]));
await assert.rejects(run(['--config',rules,'--out',nonUtf8Out,nonUtf8]),/UTF-8/);
await mkdir(nonUtf8Out);
checks++;console.log('PASS invalid UTF-8 is rejected before output');
console.log(JSON.stringify({passed:checks,failed:0}));
