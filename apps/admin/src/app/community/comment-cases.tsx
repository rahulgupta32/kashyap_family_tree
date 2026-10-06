'use client';
import {useState} from 'react';
import {ApiClient} from '../../lib/api-client';
export function CommentCases({token,postId}:{token:string;postId:string}){
 const [page,setPage]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function load(before?:string){setBusy(true);setError('');try{setPage(await ApiClient.community(`/posts/${postId}/comment-reports${before?`?before=${encodeURIComponent(before)}`:''}`,token));}catch(e){setPage(null);setError((e as Error).message);}finally{setBusy(false);}}
 async function review(sequence:string,decision:string){const notes=window.prompt('Comment case review notes (at least 5 characters)');if(!notes)return;setBusy(true);setError('');try{await ApiClient.community(`/posts/${postId}/comment-reports/${sequence}/review`,token,'POST',{decision,notes});await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <details><summary>Comment report cases</summary><button disabled={busy} onClick={()=>void load()}>Load latest comment cases</button>{error&&<p role="alert">{error}</p>}{page&&<><ul>{page.items.map((c:any)=><li key={c.sequence} className="border p-3"><p>{c.content}</p><p>{c.category} · {c.reason}</p><p>{c.status} · {c.reviewNotes}</p>{c.status==='OPEN'&&!c.removed&&<><button disabled={busy} onClick={()=>void review(c.sequence,'KEEP')}>Keep comment</button><button disabled={busy} onClick={()=>void review(c.sequence,'REMOVE')}>Remove reported comment</button></>}</li>)}</ul>{!page.items.length&&<p>No eligible comment cases.</p>}<button disabled={busy||!page.nextBefore} onClick={()=>void load(page.nextBefore)}>Older comment cases</button></>}</details>;
}
