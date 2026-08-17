export const dynamic = "force-dynamic";
export async function GET(){ return Response.json({ ok:true, app:"kodely", ts:new Date().toISOString() }); }
