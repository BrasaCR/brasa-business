import { OPPORTUNITIES } from './opportunities.js';

const SEARCH={
  retail:{en:'customer service',es:'servicio al cliente'},restaurant:{en:'operations',es:'operaciones'},
  'personal-care':{en:'customer service',es:'servicio al cliente'},'human-services':{en:'customer service',es:'servicio al cliente'},
  'hospitality-entertainment':{en:'hospitality',es:'hospitalidad'},'home-maintenance':{en:'safety',es:'seguridad'},
  'earth-energy':{en:'sustainable',es:'sostenible'},delivery:{en:'logistics',es:'logística'},construction:{en:'safety',es:'seguridad'}
};
const json=(value,status=200,extra={})=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','x-content-type-options':'nosniff','referrer-policy':'no-referrer',...extra}});

export async function listExperienceLearning(request,env,experienceId){
  if(!env.EDUCATION)return json({error:'education_service_unavailable'},503,{'cache-control':'no-store'});
  if(!/^[a-z0-9-]{1,80}$/.test(experienceId))return json({error:'invalid_experience_id'},400,{'cache-control':'no-store'});
  if(!OPPORTUNITIES.some(item=>item.id===experienceId))return json({error:'experience_not_found'},404,{'cache-control':'no-store'});
  const requested=new URL(request.url).searchParams.get('locale')||'en';
  if(!/^[a-z]{2,3}(?:-[A-Za-z0-9]+)*$/.test(requested))return json({error:'invalid_locale'},400,{'cache-control':'no-store'});
  const locale=requested.toLowerCase().startsWith('es')?'es':'en',query=SEARCH[experienceId][locale];
  const upstream=new URL('/api/v1/schools/brasa-open-staging/lessons','https://brasa-education');
  upstream.searchParams.set('locale',locale);upstream.searchParams.set('q',query);upstream.searchParams.set('offlineEligible','true');upstream.searchParams.set('limit','6');
  const response=await env.EDUCATION.fetch(new Request(upstream,{headers:{accept:'application/json'}}));
  if(!response.ok)return json({error:'education_service_unavailable'},503,{'cache-control':'no-store'});
  const result=await response.json();
  const origin=typeof env.EDUCATION_PUBLIC_ORIGIN==='string'&&/^https:\/\/[A-Za-z0-9.-]+$/.test(env.EDUCATION_PUBLIC_ORIGIN)?env.EDUCATION_PUBLIC_ORIGIN:null;
  const data=(result.data||[]).slice(0,6).map(lesson=>({schemaVersion:1,id:lesson.id,slug:lesson.slug,locale:lesson.locale,title:lesson.title,summary:lesson.summary,offlineEligible:Boolean(lesson.offlineEligible),lessonUrl:origin?`${origin}/lesson.html?slug=${encodeURIComponent(lesson.slug)}&t=${encodeURIComponent(lesson.title)}`:null}));
  return json({data,meta:{experienceId,locale,query,schoolId:'brasa-open-staging',personalized:false,progressTracked:false}},200,{'cache-control':'public, max-age=300, stale-while-revalidate=3600'});
}
