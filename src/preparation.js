import { OPPORTUNITIES } from './opportunities.js';

const SEARCH={retail:'patente comercial',restaurant:'alimentos','personal-care':'salud','human-services':'servicios sociales','hospitality-entertainment':'turismo','home-maintenance':'patente comercial','earth-energy':'ambiental',delivery:'transporte',construction:'construcción'};
const json=(value,status=200,extra={})=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','x-content-type-options':'nosniff','referrer-policy':'no-referrer',...extra}});

export async function listExperiencePreparation(request,env,experienceId){
  if(!env.GOVERNMENT)return json({error:'government_service_unavailable'},503,{'cache-control':'no-store'});
  if(!/^[a-z0-9-]{1,80}$/.test(experienceId))return json({error:'invalid_experience_id'},400,{'cache-control':'no-store'});
  if(!OPPORTUNITIES.some(item=>item.id===experienceId))return json({error:'experience_not_found'},404,{'cache-control':'no-store'});
  const countryCode=(new URL(request.url).searchParams.get('countryCode')||'CR').toUpperCase();
  if(countryCode!=='CR')return json({data:[],meta:{experienceId,countryCode,coverageAvailable:false,informationalOnly:true,legalAdvice:false,eligibilityDecision:false}},200,{'cache-control':'public, max-age=300, stale-while-revalidate=3600'});
  const upstream=new URL('/api/v1/services','https://brasa-government');upstream.searchParams.set('q',SEARCH[experienceId]);upstream.searchParams.set('countryCode','CR');upstream.searchParams.set('limit','6');
  const response=await env.GOVERNMENT.fetch(new Request(upstream,{headers:{accept:'application/json'}}));
  if(!response.ok)return json({error:'government_service_unavailable'},503,{'cache-control':'no-store'});
  const result=await response.json();
  const data=(result.data||[]).slice(0,6).map(service=>({schemaVersion:1,id:service.id,label:service.label,category:service.category,countryCode:service.countryCode,sourceUrl:service.sourceUrl,sourceStatus:service.sourceStatus,informationalOnly:true}));
  return json({data,meta:{experienceId,countryCode:'CR',coverageAvailable:true,query:SEARCH[experienceId],informationalOnly:true,legalAdvice:false,eligibilityDecision:false,notice:'Possible public-service wayfinding only. Confirm current requirements with the responsible authority.'}},200,{'cache-control':'public, max-age=300, stale-while-revalidate=3600'});
}
