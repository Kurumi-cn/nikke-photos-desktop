import fs from 'node:fs'
import path from 'node:path'
import {validateRecord,validateDocument,RESOURCE_INCOME_VERSION} from './resource-income-model.mjs'
export function createResourceIncomeStore(dataRoot) {
  const directory=path.join(dataRoot,'tools'),file=path.join(directory,'resource-income.json')
  function read() {
    try{return validateDocument(JSON.parse(fs.readFileSync(file,'utf8')))}catch(error){
      if(error.code==='ENOENT')return {version:RESOURCE_INCOME_VERSION,records:[]}
      throw Error('每日资源文件读取失败，请先检查正式数据文件及 .bak 备份；未写入空数据。'+error.message)
    }
  }
  function write(doc) {
    fs.mkdirSync(directory,{recursive:true})
    const next=file+'.next'
    try {
      const fd=fs.openSync(next,'w')
      try {fs.writeFileSync(fd,JSON.stringify(doc,null,2)+'\n','utf8');fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
      // A recovery copy is durable application data, not a disposable cache.
      if(fs.existsSync(file))fs.copyFileSync(file,file+'.bak')
      fs.renameSync(next,file)
    }catch(error){throw Error('每日资源保存失败，原记录未在界面中确认保存：'+error.message)}
    return doc
  }
  return {
    file,read,
    upsert(input){const row=validateRecord(input),doc=read();doc.records=doc.records.filter(r=>r.date!==row.date);doc.records.push(row);return write(validateDocument(doc))},
    remove(date){validateRecord({date,stones:0});const doc=read();doc.records=doc.records.filter(r=>r.date!==date);return write(doc)},
    backupJSON(){return JSON.stringify(read(),null,2)+'\n'},
  }
}
