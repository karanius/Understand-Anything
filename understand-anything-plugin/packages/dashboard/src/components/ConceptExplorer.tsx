import { useEffect, useMemo, useState } from "react";
import { useDashboardStore } from "../store";
import KnowledgeGraphView from "./KnowledgeGraphView";

type Saved = { concept: string; page: string; path: string; text: string };
const STORAGE = "togaf-concept-review-v1";
export default function ConceptExplorer({ accessToken }: { accessToken: string }) {
  const graph = useDashboardStore(s => s.graph);
  const [mode, setMode] = useState("explorer");
  const [query, setQuery] = useState("");
  const [book, setBook] = useState("all");
  const [selected, setSelected] = useState("");
  const [pageId, setPageId] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<Saved[]>(() => { try { const value = JSON.parse(localStorage.getItem(STORAGE) || "[]"); return Array.isArray(value) ? value.filter(x => x && typeof x.path === "string" && typeof x.text === "string") : []; } catch { return []; } });
  const [saveError, setSaveError] = useState("");
  const concepts = useMemo(() => {
    if (!graph) return [];
    const nodes = new Map(graph.nodes.map(n => [n.id,n]));
    return graph.nodes.filter(n => n.id.startsWith("ptm:concept:")).map(n => {
      const pages = graph.edges.filter(e => e.target === n.id && e.source.startsWith("article:")).map(e => nodes.get(e.source)!).filter(Boolean);
      return { ...n, pages, count: Number(n.summary.match(/(\d+) occurrences/)?.[1] || 0) };
    }).sort((a,b) => b.pages.length-a.pages.length);
  }, [graph]);
  const visible = concepts.filter(n => n.name.toLowerCase().includes(query.toLowerCase()) && (book === "all" || n.pages.some(p => p.id.startsWith(`article:${book}-`))));
  const concept = concepts.find(n => n.id === selected);
  const pages = concept?.pages.filter(p => book === "all" || p.id.startsWith(`article:${book}-`)) || [];
  const page = graph?.nodes.find(n => n.id === pageId);
  useEffect(() => {
    setText(""); setError("");
    if (!page?.filePath) return;
    const controller = new AbortController();
    fetch(`/file-content.json?${new URLSearchParams({token:accessToken,path:page.filePath})}`, {signal:controller.signal}).then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.error || "Source unavailable"); setText(data.content); }).catch(e => { if (!controller.signal.aborted) setError(String(e.message)); });
    return () => controller.abort();
  }, [page?.filePath, accessToken]);
  function persist(next: Saved[]) { try { localStorage.setItem(STORAGE,JSON.stringify(next)); setSaved(next); setSaveError(""); } catch { setSaveError("Browser storage is full or unavailable. Export your existing collection before continuing."); } }
  function exportReview() { const url = URL.createObjectURL(new Blob([JSON.stringify(saved,null,2)],{type:"application/json"})); const a = document.createElement("a"); a.href=url; a.download="togaf-review.json"; a.click(); URL.revokeObjectURL(url); }
  const button = {padding:"8px 12px", border:"1px solid #64748b", borderRadius:6, cursor:"pointer"};
  return <div style={{height:"100%",display:"flex",flexDirection:"column",color:"#f1f5f9",background:"#101820"}}>
    <div style={{padding:16,borderBottom:"1px solid #475569",display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
      <strong>TOGAF concept explorer</strong>
      {['explorer','graph','review'].map(m => <button style={{...button,background:mode===m?'#245c75':'#202e3a'}} key={m} onClick={() => setMode(m)}>{m==='review'?`Review collection (${saved.length})`:m==='graph'?'Graph':'Concepts & sources'}</button>)}
    </div>
    {mode==='graph' ? <div style={{flex:1,minHeight:0}}><KnowledgeGraphView /></div> : mode==='review' ? <div style={{padding:20,overflow:'auto'}}>
      <h2>Material for architecture and wizard review</h2><p>Saved in this browser. Export JSON to retain a portable copy. These are source selections, not validated design decisions.</p><button style={button} onClick={exportReview}>Export collection</button>
      {saved.length===0 && <p>No passages saved. Choose a concept, read a source page, then save it here.</p>}
      {saved.map((s,i) => <article key={s.path+s.concept} style={{padding:16,marginTop:12,border:'1px solid #475569'}}><strong>{s.concept} · {s.page}</strong><button style={{...button,marginLeft:12}} onClick={() => persist(saved.filter((_,j)=>j!==i))}>Remove</button><p>{s.path}</p><pre style={{whiteSpace:'pre-wrap',fontFamily:'inherit',lineHeight:1.6}}>{s.text}</pre></article>)}
    </div> : <div style={{display:'grid',gridTemplateColumns:'minmax(230px, 35%) 1fr',flex:1,minHeight:0}}>
      <section style={{overflow:'auto',padding:16,borderRight:'1px solid #475569'}}>
        <input aria-label="Find a concept" placeholder="Find a concept…" value={query} onChange={e=>setQuery(e.target.value)} style={{width:'100%',padding:10,background:'#202e3a',border:'1px solid #64748b'}} />
        <select aria-label="Filter source book" value={book} onChange={e=>{setBook(e.target.value);setPageId('');}} style={{width:'100%',padding:10,margin:'10px 0',background:'#202e3a'}}><option value="all">Both books</option><option value="core">Introduction and Core Concepts</option><option value="foundation">Foundation Study Guide</option></select>
        <p>{visible.length} recurring phrases · provisional lexical groups</p>
        {visible.map(n=><button key={n.id} onClick={()=>{setSelected(n.id);setPageId('');}} style={{width:'100%',textAlign:'left',padding:12,marginBottom:8,border:selected===n.id?'2px solid #67e8f9':'1px solid #475569',borderRadius:6,background:selected===n.id?'#164e63':'#202e3a'}}><strong>{n.name}</strong><div>{n.count} occurrences · {n.pages.length} pages</div><small>{n.pages.some(p=>p.id.startsWith('article:core-'))?'Core concepts ':''}{n.pages.some(p=>p.id.startsWith('article:foundation-'))?' · Foundation guide':''}</small></button>)}
      </section>
      <section style={{overflow:'auto',padding:20}}>
        {!concept ? <><h2>Read the evidence behind a phrase</h2><p>Select a phrase on the left to see its books and source pages. Read a page, then save it for architecture or wizard review.</p></> : <><h2>{concept.name}</h2><p>{concept.summary}</p><p>Group: {concept.tags.filter(t=>!['ptm','phrase'].includes(t)).join(', ')}. Wording groups are provisional; relationships have not been interpreted.</p>
        <div style={{display:'flex',flexWrap:'wrap',gap:8}}>{pages.map(p=><button key={p.id} style={{...button,background:p.id===pageId?'#164e63':'#202e3a'}} onClick={()=>setPageId(p.id)}>Read source · {p.id.includes(':core-')?'Core':'Foundation'} p.{p.id.split('-').pop()?.replace(/^0+/,'')}</button>)}</div>
        {page && <><h3 style={{marginTop:24}}>{page.name}</h3><p>PDF page numbering · full extracted text of this page</p>{error ? <p role="alert">{error}</p> : !text ? <p>Loading source…</p> : <><button style={button} onClick={()=>{if(!saved.some(s=>s.path===page.filePath && s.concept===concept.name)) persist([...saved,{concept:concept.name,page:page.name,path:page.filePath!,text}]);}}>Save page to review collection</button><pre style={{whiteSpace:'pre-wrap',fontFamily:'inherit',lineHeight:1.7,fontSize:15,marginTop:20}}>{text}</pre></>}</>}
        </>}
      </section>
    </div>}
    {saveError && <p role="alert">{saveError}</p>}
  </div>;
}
