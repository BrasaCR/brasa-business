export const OPPORTUNITIES = [
  ['retail','Retail','/Retail.html',['customer-service','inventory','sales','digital-commerce']],
  ['restaurant','Restaurant','/Restaurant.html',['food-safety','hospitality','operations','customer-service']],
  ['personal-care','Personal Care','/PersonalCare.html',['personal-care','customer-service','scheduling']],
  ['human-services','Human Services','/HumanServices.html',['caregiving','communication','community-service']],
  ['hospitality-entertainment','Hospitality & Entertainment','/HospitalityEntertainment.html',['hospitality','events','tourism','customer-service']],
  ['home-maintenance','Home Maintenance','/HomeMaintenance.html',['repair','maintenance','safety']],
  ['earth-energy','Earth & Energy','/EarthEnergy.html',['sustainability','energy','environment']],
  ['delivery','Delivery','/Delivery.html',['logistics','navigation','customer-service']],
  ['construction','Construction','/Construction.html',['construction','safety','project-coordination']]
].map(([id,title,url,capabilities]) => ({ schemaVersion: 1, id, type: 'business-pathway', title, url, experienceUrl: `/experience.html?id=${encodeURIComponent(id)}`, capabilities, countryCodes: ['*'], status: 'active' }));

export function queryOpportunities(searchParams) {
  const capability = (searchParams.get('capability') || '').trim().toLowerCase();
  const countryCode = (searchParams.get('countryCode') || '').trim().toUpperCase();
  const requestedLimit = Number(searchParams.get('limit') || 10);
  if (capability && !/^[a-z0-9-]{1,80}$/.test(capability)) return { error: 'invalid_capability' };
  if (countryCode && !/^[A-Z]{2}$/.test(countryCode)) return { error: 'invalid_country_code' };
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1) return { error: 'invalid_limit' };
  const limit = Math.min(requestedLimit, 50);
  const matches = OPPORTUNITIES.filter((item) => (!capability || item.capabilities.includes(capability)) && (!countryCode || item.countryCodes.includes('*') || item.countryCodes.includes(countryCode)));
  return { data: matches.slice(0, limit), meta: { total: matches.length, limit, filters: { capability: capability || null, countryCode: countryCode || null } } };
}
