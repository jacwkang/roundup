import './env';
import { readConfig } from '../src/lib/messaging/config';
import { apiHeaders } from '../src/lib/messaging/sendblue';
async function main(){
 const config=readConfig();
 const queries=[['local-health','http://127.0.0.1:3108/api/health'],['webhooks','https://api.sendblue.com/api/account/webhooks'],['inbound',`https://api.sendblue.com/api/v2/messages?${new URLSearchParams({is_outbound:'false',sendblue_number:config.phoneNumber,message_type:'group',order_by:'createdAt',order_direction:'desc',limit:'20'})}`]];
 for(const [i,result] of (await Promise.allSettled(queries.map(async([label,url])=>{
  const response=await fetch(url,{headers:label==='local-health'?{}:apiHeaders(config),signal:AbortSignal.timeout(15000)});
  const data=await response.json();
  if(label==='webhooks')return {label,status:response.status,receive:data.webhooks?.receive?.map((w:string|{url:string;secret?:string})=>({url:typeof w==='string'?w:w.url,secretMatches:typeof w==='object' && w.secret===config.webhookSecret}))};
  if(label==='inbound')return {label,status:response.status,messages:data.data?.map((m:Record<string,unknown>)=>({id:m.message_handle,group:m.group_id,allowed:config.allowedChatIds.includes(String(m.group_id)),createdAt:m.createdAt,updatedAt:m.updatedAt,status:m.status}))};
  return {label,status:response.status,data};
 }))).entries())console.log(JSON.stringify(result.status==='fulfilled'?result.value:{label:queries[i][0],error:'request_failed'}));
 console.log(JSON.stringify({aiEnabled:process.env.ARA_AI_ENABLED,bookingsEnabled:process.env.ARA_BOOKINGS_ENABLED,allowedGroups:config.allowedChatIds}));
}
main().catch(()=>{console.error('Messaging diagnostic failed; no credentials logged.');process.exitCode=1;});
