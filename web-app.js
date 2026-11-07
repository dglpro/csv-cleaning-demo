(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const tabs = ['clean', 'review', 'all'];
  let tables = [], result = null, activeTab = 'clean', loadId = 0, demo = true;
  let toastTimer;

  const sampleA = '客户编号,姓名,电话,城市,备注\n0001, 张一 ,013000000001, 北京 ,"第一行\n第二行"\n0002,李二,013000000002,上海,"他说""你好"""\n0003,王三,013000000003,广州,需要复核城市\n0005,,013000000005,成都,姓名缺失\n,, ,,\n';
  const sampleB = '客户编号,姓名,电话,城市,备注\n0001,张一,013000000001,北京,"第一行\n第二行"\n0003,王三,013000000003,深圳,需要复核城市\n0004,赵四,013000000004,杭州,"包含,逗号"\n';

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function error(message) {
    $('error').textContent = message;
    $('error').hidden = !message;
  }

  function notify(message) {
    clearTimeout(toastTimer);
    $('toast').textContent = message;
    $('toast').hidden = false;
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3500);
  }

  function disableDownloads(disabled) {
    $('download-clean').disabled = disabled;
    $('download-report').disabled = disabled;
  }

  function showFiles() {
    $('file-list').replaceChildren();
    for (const table of tables) {
      const li = element('li', undefined, 'file');
      li.append(element('span', table.source, 'filename'), element('small', `${table.rows.length - 1} 条`));
      $('file-list').append(li);
    }
  }

  function populateRules() {
    const headers = tables[0].rows[0].map(value => value.trim());
    const previousKey = $('key').value;
    const previousRequired = $('required').value;
    $('key').replaceChildren();
    $('required').replaceChildren(element('option', '不指定'));
    $('required').firstElementChild.value = '';
    for (const header of headers) {
      const keyOption = element('option', header);
      keyOption.value = header;
      $('key').append(keyOption);
      $('required').append(keyOption.cloneNode(true));
    }
    $('key').value = headers.includes(previousKey) ? previousKey : headers[0];
    $('required').value = demo ? (headers.includes('姓名') ? '姓名' : '') : (headers.includes(previousRequired) ? previousRequired : '');
  }

  function reviewRows() {
    if (!result) return [];
    const report = result.report;
    return [
      ...report.conflicts.flatMap(group => group.records.map(record => ({ ...record, reason: '同一编号，内容不同' }))),
      ...report.rejected
    ];
  }

  function recordsToCheck() {
    return [
      ...reviewRows(),
      ...result.report.duplicates.map(record => ({ ...record, reason: '完全重复，已合并' })),
      ...result.report.blankRows.map(record => ({ ...record, reason: '空记录，已跳过', values: [] }))
    ];
  }

  function withExtraColumns(headers, records, offset = 0) {
    let width = headers.length;
    for (const row of records) width = Math.max(width, row.length - offset);
    return [...headers, ...Array.from({length: width - headers.length}, (_, i) => `额外列 ${i + 1}`)];
  }

  function renderTable() {
    if (!result) return;
    const headers = result.report.headers;
    let records;
    let columnNames;
    if (activeTab === 'clean') {
      columnNames = headers;
      records = result.rows.slice(1);
    } else if (activeTab === 'review') {
      records = reviewRows().map(row => [row.reason, `${row.source} · ${row.record}`, ...row.values]);
      columnNames = ['原因', '来源', ...withExtraColumns(headers, records, 2)];
    } else {
      const lookup = new Map();
      for (const row of recordsToCheck()) lookup.set(JSON.stringify([row.source, row.record]), row.reason);
      records = tables.flatMap(table => table.rows.slice(1).map((values, index) => {
        const reason = lookup.get(JSON.stringify([table.source, index + 2])) || '保留';
        return [reason, `${table.source} · ${index + 2}`, ...values];
      }));
    }
    if(activeTab === 'all') columnNames = ['状态', '来源', ...withExtraColumns(headers, records, 2)];
    const head = element('tr');
    for (const name of columnNames) {
      const th = element('th', name);
      th.scope = 'col';
      head.append(th);
    }
    $('table-head').replaceChildren(head);
    $('table-body').replaceChildren();
    for (const values of records.slice(0, 100)) {
      const tr = element('tr');
      for (let i = 0; i < columnNames.length; i++) {
        const td = element('td');
        const value = String(values[i] ?? '');
        if (i === 0 && activeTab !== 'clean') {
          const category = value === '保留' ? '' : /重复|空记录/.test(value) ? ' quiet' : ' warn';
          td.append(element('span', value, 'status' + category));
        } else {
          td.textContent = value || '—';
          if (/^[+]?\d[\d ()-]{3,}$/.test(value)) td.style.whiteSpace = 'nowrap';
        }
        tr.append(td);
      }
      $('table-body').append(tr);
    }
    if (!records.length) {
      const td = element('td', activeTab === 'review' ? '没有需要确认的记录。' : '没有可显示的记录。', 'empty-cell');
      td.colSpan = columnNames.length;
      const tr = element('tr'); tr.append(td); $('table-body').append(tr);
    }
    $('preview-note').textContent = records.length > 100 ? `预览前 100 / ${records.length} 条` : `共 ${records.length} 条`;
  }

  function calculate() {
    if (!tables.length) return;
    error('');
    try {
      const headers = tables[0].rows[0].map(value => value.trim());
      result = cleanTables(tables, {
        keys: [$('key').value],
        trim: $('trim').checked ? headers : [],
        required: $('required').value ? [$('required').value] : [],
        deduplicate: $('exact').checked
      });
      const s = result.report.summary;
      const needsReview = s.conflictRecords + s.rejectedRecords;
      $('stat-input').textContent = s.inputRecords;
      $('stat-output').textContent = s.outputRecords;
      $('stat-review').textContent = needsReview;
      $('count-clean').textContent = s.outputRecords;
      $('count-review').textContent = needsReview;
      $('count-all').textContent = s.inputRecords;
      $('dataset-label').textContent = demo ? '演示数据' : `${tables.length} 个文件 · 本地处理`;
      $('result-note').textContent = `合并 ${tables.length} 个文件 · ${s.duplicateRecords} 条重复已合并 · ${s.blankRecords} 条空记录已跳过`;
      $('notice').classList.toggle('good', !needsReview);
      $('notice').textContent = needsReview
        ? `${s.conflictRecords} 条内容冲突，${s.rejectedRecords} 条格式或必填异常。已单独保留，未混入清洗结果。`
        : '检查完成，没有内容冲突或必填异常。';
      disableDownloads(false);
      renderTable();
    } catch (cause) {
      result = null;
      disableDownloads(true);
      error(cause.message);
      $('stat-input').textContent = '—'; $('stat-output').textContent = '—'; $('stat-review').textContent = '—';
      $('table-head').replaceChildren(); $('table-body').replaceChildren();
      $('result-note').textContent = '请检查文件或规则后重试。';
      $('notice').textContent = '尚未生成清洗结果。';
      for (const name of ['clean', 'review', 'all']) $('count-' + name).textContent = '';
      $('preview-note').textContent = '';
    }
  }

  function useExample() {
    loadId++;
    demo = true;
    tables = [{source: '客户表-A.csv', rows: parseCsv(sampleA)}, {source: '客户表-B.csv', rows: parseCsv(sampleB)}];
    $('files').value = '';
    $('trim').checked = true; $('exact').checked = true;
    populateRules(); $('key').value = '客户编号'; $('required').value = '姓名';
    showFiles(); calculate();
  }

  async function loadFiles(files) {
    const id = ++loadId;
    if (!files.length) return;
    error('');
    if (files.reduce((sum, file) => sum + file.size, 0) > 10 * 1024 * 1024) {
      error('文件合计超过 10 MB，请分批处理。'); return;
    }
    if (new Set(files.map(file => file.name)).size !== files.length) {
      error('有同名文件，请重命名后再选择，方便核对来源。'); return;
    }
    disableDownloads(true);
    $('dataset-label').textContent = '正在读取文件';
    try {
      const loaded = await Promise.all(files.map(async file => {
        if (!file.name.toLowerCase().endsWith('.csv')) throw new Error(`${file.name}：请选择 CSV 文件`);
        let text;
        try { text = new TextDecoder('utf-8', {fatal:true}).decode(await file.arrayBuffer()); }
        catch { throw new Error(`${file.name}：请另存为 CSV UTF-8 后重试`); }
        let rows;
        try { rows = parseCsv(text); } catch (cause) { throw new Error(`${file.name}：${cause.message}`); }
        if (!rows.length) throw new Error(`${file.name}：文件为空`);
        return {source: file.name, rows};
      }));
      if (id !== loadId) return;
      tables = loaded; demo = false;
      populateRules(); showFiles(); calculate();
    } catch (cause) {
      if (id !== loadId) return;
      error(cause.message);
      $('dataset-label').textContent = demo ? '演示数据' : '保留上次结果';
      disableDownloads(!result);
    }
  }

  function download(name, rows) {
    const url = URL.createObjectURL(new Blob(['\uFEFF', encodeCsv(rows)], {type:'text/csv;charset=utf-8'}));
    const a = element('a');
    a.href = url; a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('文件已生成。用 Excel 查看时，按文本导入可保留编号。');
  }

  function selectTab(name, focus = false) {
    activeTab = name;
    for (const tab of tabs) {
      $('tab-' + tab).setAttribute('aria-selected', String(tab === name));
      $('tab-' + tab).tabIndex = tab === name ? 0 : -1;
    }
    $('data-panel').setAttribute('aria-labelledby', 'tab-' + name);
    if (focus) $('tab-' + name).focus();
    renderTable();
  }

  $('upload').addEventListener('click', () => $('files').click());
  $('files').addEventListener('change', () => loadFiles([...$('files').files]));
  $('upload').addEventListener('dragover', event => { event.preventDefault(); $('upload').classList.add('dragging'); });
  $('upload').addEventListener('dragleave', () => $('upload').classList.remove('dragging'));
  $('upload').addEventListener('drop', event => { event.preventDefault(); $('upload').classList.remove('dragging'); loadFiles([...event.dataTransfer.files]); });
  $('sample').addEventListener('click', useExample);
  for (const control of ['key', 'required', 'trim', 'exact']) $(control).addEventListener('change', calculate);
  for (const tab of tabs) {
    $('tab-' + tab).addEventListener('click', () => selectTab(tab));
    $('tab-' + tab).addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (tabs.indexOf(activeTab) + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
      selectTab(tabs[index], true);
    });
  }
  $('download-clean').addEventListener('click', () => { if (result) download('清洗结果.csv', result.rows); });
  $('download-report').addEventListener('click', () => {
    if (!result) return;
    const records = recordsToCheck();
    const headers = withExtraColumns(result.report.headers, records.map(record => record.values ?? []));
    const rows = records.map(record => [record.source, String(record.record), record.reason, ...headers.map((_, i) => record.values?.[i] ?? '')]);
    download('核对清单.csv', [['来源文件', '记录序号', '处理原因', ...headers], ...rows]);
  });
  useExample();
})();
