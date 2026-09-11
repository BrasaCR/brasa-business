const baseUrl = String(process.env.STAGING_BASE_URL || '').replace(/\/$/, '');
if (!/^https:\/\//.test(baseUrl)) throw new Error('STAGING_BASE_URL must be an https URL');
for (const path of ['/health', '/api/v1/opportunities?limit=1', '/api/v1/experiences/retail?locale=es']) {
  const response = await fetch(`${baseUrl}${path}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
  const body = await response.json();
  const validApi = path.startsWith('/api/v1/experiences/') ? body.data?.type === 'business-experience' && body.data?.locale === 'es' : !path.startsWith('/api/') || Array.isArray(body.data);
  if (!response.ok || !validApi) throw new Error(`${path} failed (${response.status})`);
  console.log(JSON.stringify({ check: path, status: response.status }));
}
