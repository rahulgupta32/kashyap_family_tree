'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/auth-context';
const API=process.env.NEXT_PUBLIC_API_URL||'http://127.0.0.1:3000';
export default function Dashboard(){
 const router=useRouter();
 const {user,accessToken,isLoading}=useAuth();const [data,setData]=useState<any>(null),[error,setError]=useState('');
 useEffect(()=>{if(!isLoading&&(!user||!accessToken))router.replace('/login');},[isLoading,user,accessToken,router]);
 useEffect(()=>{if(isLoading||!accessToken)return;let stopped=false;fetch(`${API}/audit/dashboard`,{headers:{Authorization:`Bearer ${accessToken}`}}).then(async r=>{const value=await r.json();if(!r.ok)throw new Error(value.message||'Dashboard unavailable');if(!stopped){setData(value);setError('');}}).catch(e=>{if(!stopped)setError(e.message);});return()=>{stopped=true;};},[accessToken,isLoading]);
 if(isLoading)return <p>लोड हुँदैछ…</p>;
 if(!user||!accessToken)return <p>प्रवेश पृष्ठमा लगिँदैछ… (Opening sign in…)</p>;
 return <section className="space-y-6"><div><p className="text-sm text-slate-500">कश्यप अधिकारी वंशावली</p><h1 className="text-3xl font-bold text-slate-900">ड्यासवोर्ड सारांश (Executive Dashboard)</h1><p className="text-slate-600 mt-2">Your family, community and current work in one place.</p></div>
  {error&&<p role="alert" className="text-red-800">{error}</p>}
  {data&&<><p className="text-sm text-slate-500">{data.scope==='GLOBAL'?'Platform overview':'Your assigned branches'} · Updated {new Date(data.generatedAt).toLocaleString()}</p><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[['Persons',data.persons,'/people'],['Pending claims',data.pendingClaims,'/claims'],['Change requests',data.pendingChanges,'/change-requests'],['Location reviews',data.pendingLocations,'/map']].map(([label,value,href])=><Link key={String(label)} href={String(href)} className="border rounded-xl p-5 bg-white hover:border-amber-700"><p className="text-sm text-slate-600">{label}</p><p className="text-3xl font-semibold mt-2">{value}</p></Link>)}</div></>}
  <nav aria-label="Application areas" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[['वंशावली','Family tree','/people'],['समुदाय','Community','/community'],['पात्रो','Calendar','/calendar'],['सन्देश','Messages','/chat'],['परिवारको स्थान','Household localities','/map'],['मेरो प्रोफाइल','Your profile','/profile']].map(([ne,en,href])=><Link key={href} href={href} className="border rounded-xl p-5 hover:bg-slate-50"><h2 className="font-semibold text-lg">{ne}</h2><p className="text-slate-600">{en}</p></Link>)}</nav>
  <p className="text-sm text-slate-600">Cultural calculations display unavailable when approved rules or calendar sources are missing. Factual family-tree records remain accessible according to privacy settings.</p>
 </section>;
}
