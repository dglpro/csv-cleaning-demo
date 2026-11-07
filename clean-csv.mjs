import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';

import {parseCsv,encodeCsv,cleanTables} from './csv-core.mjs';
export {parseCsv,encodeCsv,cleanTables} from './csv-core.mjs';

export async function run(argv){
  let configFile,outDir;const files=[];
  for(let i=0;i<argv.length;i++){
    if(argv[i]==='--config'){if(!argv[i+1])throw new Error('--config 缺少路径');configFile=argv[++i];}
    else if(argv[i]==='--out'){if(!argv[i+1])throw new Error('--out 缺少路径');outDir=argv[++i];}
    else if(argv[i].startsWith('--'))throw new Error('未知参数：'+argv[i]);
    else files.push(argv[i]);
  }
  if(!configFile||!outDir||!files.length)throw new Error('用法：node clean-csv.mjs --config rules.json --out 新目录 input-a.csv input-b.csv');
  const options=JSON.parse(await readFile(configFile,'utf8'));
  const tables=[];
  for(const file of files){
    const bytes=await readFile(file);
    let text;
    try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
    catch{throw new Error(`${file}：请使用 UTF-8 CSV`);}
    tables.push({source:file,rows:parseCsv(text)});
  }
  const result=cleanTables(tables,options);
  const destination=resolve(outDir);await mkdir(dirname(destination),{recursive:true});
  // Refuse to replace an existing folder, including any customer's previous output.
  await mkdir(destination);
  await writeFile(resolve(destination,'cleaned.csv'),encodeCsv(result.rows),{flag:'wx'});
  await writeFile(resolve(destination,'report.json'),JSON.stringify(result.report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({output:destination,...result.report.summary},null,2));
  return result;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  run(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});
}
