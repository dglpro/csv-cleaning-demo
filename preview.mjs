import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const server=createServer(async(request,response)=>{
  if(request.url!=='/'&&request.url!=='/index.html'){response.writeHead(404);response.end();return;}
  response.writeHead(200,{'Content-Type':'text/html;charset=utf-8','X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});
  response.end(await readFile(new URL('./index.html',import.meta.url)));
});
server.listen(4173,'127.0.0.1',()=>console.log('Preview http://127.0.0.1:4173'));
