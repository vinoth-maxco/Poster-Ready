const json=(res,status,payload)=>res.status(status).json(payload);
const cleanDomain=value=>String(value||'').trim().toLowerCase().replace(/^https?:\/\//,'').replace(/\/.*$/,'').replace(/^www\./,'');
const validDomain=value=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(value)&&!value.endsWith('.vercel.app');

async function verifiedAdmin(request){
  const token=String(request.headers.authorization||'').replace(/^Bearer\s+/i,'');
  const apiKey=process.env.FIREBASE_API_KEY;
  const allowed=String(process.env.VERCEL_DOMAIN_ADMIN_EMAILS||'').split(',').map(value=>value.trim().toLowerCase()).filter(Boolean);
  if(!token||!apiKey||!allowed.length)return false;
  const response=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:token})});
  if(!response.ok)return false;
  const data=await response.json(),email=String(data.users?.[0]?.email||'').toLowerCase();
  return allowed.includes(email);
}

function vercelUrl(path){
  const team=process.env.VERCEL_TEAM_ID?`?teamId=${encodeURIComponent(process.env.VERCEL_TEAM_ID)}`:'';
  return `https://api.vercel.com${path}${team}`;
}

async function vercelRequest(path,options={}){
  const response=await fetch(vercelUrl(path),{...options,headers:{Authorization:`Bearer ${process.env.VERCEL_TOKEN}`,'Content-Type':'application/json',...(options.headers||{})}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){const error=new Error(data.error?.message||data.message||'Vercel domain request failed');error.status=response.status;throw error}
  return data;
}

export default async function handler(req,res){
  if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});
  if(!process.env.VERCEL_TOKEN||!process.env.VERCEL_PROJECT_ID)return json(res,503,{error:'Domain connection is not configured. Add VERCEL_TOKEN and VERCEL_PROJECT_ID in Vercel environment variables.'});
  try{
    if(!(await verifiedAdmin(req)))return json(res,403,{error:'Only an approved Poster Ready admin can manage domains.'});
    const {action,domain:rawDomain}=req.body||{},domain=cleanDomain(rawDomain);
    if(!validDomain(domain))return json(res,400,{error:'Enter a valid client custom domain.'});
    const project=encodeURIComponent(process.env.VERCEL_PROJECT_ID),encodedDomain=encodeURIComponent(domain);
    let domainData;
    if(action==='connect'){
      try{domainData=await vercelRequest(`/v9/projects/${project}/domains`,{method:'POST',body:JSON.stringify({name:domain})})}
      catch(error){if(error.status!==400&&error.status!==409)throw error;domainData=await vercelRequest(`/v9/projects/${project}/domains/${encodedDomain}`)}
    }else if(action==='verify'){
      domainData=await vercelRequest(`/v9/projects/${project}/domains/${encodedDomain}/verify`,{method:'POST',body:'{}'});
    }else return json(res,400,{error:'Unknown domain action.'});
    return json(res,200,{domain:domainData});
  }catch(error){console.error('Domain API error',error);return json(res,error.status||500,{error:error.message||'Could not manage this domain.'})}
}
