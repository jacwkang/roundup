import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { resolve } from 'node:path';
async function main() {
 const root=resolve(__dirname,'..');
 const client=new Client({name:'ara-mcp-smoke',version:'1'});
 const transport=new StdioClientTransport({command:process.execPath,args:['--import',resolve(root,'node_modules/tsx/dist/loader.mjs'),resolve(root,'scripts/browser-mcp.ts')],cwd:'/tmp'});
 try {
  await client.connect(transport);const result=await client.listTools();
  for(const name of ['start','navigate','inspect_dom','open_venue','search','screenshot','release'])if(!result.tools.some(t=>t.name===name))throw new Error('missing_tool');
  const response=await client.callTool({name:'navigate',arguments:{url:'https://resy.com/'}});
  if(!JSON.stringify(response).includes('start_required'))throw new Error('missing_guard');
  console.log('PASS: MCP handshake, 7 tools, cross-directory startup, and no-session guard. No external session created.');
 } finally {await client.close();}
}
main().catch(()=>{console.error('MCP smoke failed');process.exitCode=1;});
