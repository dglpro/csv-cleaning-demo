// Parse quoted CSV records without converting identifiers or dates to numbers.
export function parseCsv(text) {
  if(text.startsWith('\uFEFF')) text=text.slice(1);
  if(!text.length)return [];
  const rows=[];let row=[],field='',state='plain',ended=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];ended=false;
    if(state==='quoted'){
      if(c==='"'){
        if(text[i+1]==='"'){field+='"';i++;}
        else state='closed';
      }else field+=c;
      continue;
    }
    if(c===',' ){row.push(field);field='';state='plain';continue;}
    if(c==='\r'||c==='\n'){
      if(c==='\r'&&text[i+1]==='\n')i++;
      row.push(field);rows.push(row);row=[];field='';state='plain';ended=true;continue;
    }
    if(state==='closed')throw new Error(`第 ${i+1} 个字符：闭引号后只能是逗号或换行`);
    if(c==='"'){
      if(field.length)throw new Error(`第 ${i+1} 个字符：未转义的引号`);
      state='quoted';
    }else field+=c;
  }
  if(state==='quoted')throw new Error('CSV 引号未闭合');
  if(!ended){row.push(field);rows.push(row);}
  return rows;
}

export function encodeCsv(rows){
  const cell=v=>/[",\r\n]/.test(v)?'"'+v.replaceAll('"','""')+'"':v;
  return rows.map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
}

export function cleanTables(tables,config){
  if(!tables.length)throw new Error('至少需要一个输入文件');
  const options={keys:[],trim:[],required:[],deduplicate:true,...config};
  if(typeof options.deduplicate!=='boolean')throw new Error('deduplicate 必须是布尔值');
  for(const name of ['keys','trim','required']){
    if(!Array.isArray(options[name])||options[name].some(x=>typeof x!=='string'))throw new Error(name+' 必须是列名数组');
  }
  if(!options.keys.length)throw new Error('必须明确指定去重键 keys');
  let headers;const candidates=[],rejected=[],blankRows=[],changes=[];
  for(const {source,rows} of tables){
    if(!rows.length)throw new Error(`${source}：空文件`);
    const head=rows[0].map(x=>x.trim());
    if(head.some(x=>!x)||new Set(head).size!==head.length)throw new Error(`${source}：列名为空或重复`);
    if(!headers){
      headers=head;
      for(const name of ['keys','trim','required'])for(const col of options[name])if(!head.includes(col))throw new Error(`未找到 ${name} 列：${col}`);
    }else if(JSON.stringify(head)!==JSON.stringify(headers))throw new Error(`${source}：表头与首文件不一致，已停止`);
    for(let r=1;r<rows.length;r++){
      const original=rows[r];const origin={source,record:r+1};
      if(original.every(v=>v.trim()==='')){blankRows.push(origin);continue;}
      if(original.length!==head.length){rejected.push({...origin,reason:'列数不匹配',values:original});continue;}
      const values=original.map((v,i)=>options.trim.includes(head[i])?v.trim():v);
      if(JSON.stringify(values)!==JSON.stringify(original))changes.push(origin);
      const missing=[...new Set([...options.keys,...options.required])].filter(col=>values[head.indexOf(col)].trim()==='');
      if(missing.length){rejected.push({...origin,reason:'必填值为空：'+missing.join('、'),values});continue;}
      candidates.push({...origin,values,key:JSON.stringify(options.keys.map(col=>values[head.indexOf(col)]))});
    }
  }
  const groups=new Map();for(const record of candidates){const a=groups.get(record.key)||[];a.push(record);groups.set(record.key,a);}
  const cleaned=[],duplicates=[],conflicts=[];
  for(const group of groups.values()){
    const first=group[0];
    if(group.some(x=>JSON.stringify(x.values)!==JSON.stringify(first.values))){
      // A conflicting key has no automatic winner: keep every original for review.
      const key=Object.fromEntries(options.keys.map(col=>[col,first.values[headers.indexOf(col)]]));
      conflicts.push({key,records:group.map(({key,...x})=>x)});
    }else{
      if(options.deduplicate){
        cleaned.push(first.values);
        duplicates.push(...group.slice(1).map(({key,...x})=>x));
      }else cleaned.push(...group.map(record=>record.values));
    }
  }
  const report={schemaVersion:1,keys:options.keys,headers,summary:{inputRecords:tables.reduce((n,t)=>n+Math.max(0,t.rows.length-1),0),outputRecords:cleaned.length,duplicateRecords:duplicates.length,conflictKeys:conflicts.length,conflictRecords:conflicts.reduce((n,c)=>n+c.records.length,0),rejectedRecords:rejected.length,blankRecords:blankRows.length,trimmedRecords:changes.length},duplicates,conflicts,rejected,blankRows,trimmed:changes};
  const s=report.summary;
  if(s.inputRecords!==s.outputRecords+s.duplicateRecords+s.conflictRecords+s.rejectedRecords+s.blankRecords)throw new Error('内部记录数量不平衡');
  return {rows:[headers,...cleaned],report};
}

