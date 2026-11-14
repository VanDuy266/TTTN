"""Rebuild all three directions on the uploaded split; never load uploaded pickle/PT files."""
from pathlib import Path
import argparse, copy, hashlib, json, time
import numpy as np
import pandas as pd
import scipy.sparse as sp
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.decomposition import TruncatedSVD
from sklearn.preprocessing import normalize
import torch
from torch import nn
from src.ranking import scale, topk, metric

ROOT = Path(__file__).resolve().parent
SEED = 42
NAMES = ['Popularity', 'Content TF-IDF', 'Graph branch', 'H1 GRU', 'H2 Graph + Text', 'H3 Hybrid']

class SequenceModel(nn.Module):
    def __init__(self, n, mode='base'):
        super().__init__()
        self.mode = mode
        self.emb = nn.Embedding(n + 1, 32, padding_idx=0)
        self.gru = nn.GRU(33 if mode == 'gap' else 32, 48, batch_first=True)
        self.out = nn.Linear(48, n)
    def forward(self, ids, gaps, ages, lengths):
        x = self.emb(ids)
        if self.mode == 'gap':
            x = torch.cat([x, gaps[..., None]], -1)
        if self.mode == 'decay':
            x = x * torch.exp(-ages[..., None])
        packed = nn.utils.rnn.pack_padded_sequence(x, lengths.cpu(), batch_first=True, enforce_sorted=False)
        _, hidden = self.gru(packed)
        return self.out(hidden[-1])

class GraphText(nn.Module):
    def __init__(self, nu, ni, features, warm, adjacency):
        super().__init__()
        self.u = nn.Parameter(torch.randn(nu, 32) * .05)
        self.i = nn.Parameter(torch.randn(ni, 32) * .05)
        self.project = nn.Linear(features.shape[1], 32, bias=False)
        self.register_buffer('features', features)
        self.register_buffer('warm', torch.tensor(warm[:, None], dtype=torch.float32))
        self.register_buffer('adj', adjacency)
        self.nu = nu
    def forward(self):
        x = torch.cat([self.u, self.i * self.warm + self.project(self.features)])
        layers = [x]
        for _ in range(2):
            x = torch.sparse.mm(self.adj, x)
            layers.append(x)
        z = sum(layers) / len(layers)
        return z[:self.nu], z[self.nu:]

def histories(frame, users):
    groups = {u: list(zip(g.item_id, g.timestamp)) for u,g in frame.groupby('user_id')}
    return [groups.get(u, []) for u in users]

def encode(hs, mapping, gap_scale):
    ids, gaps, ages, lengths = [], [], [], []
    for hist in hs:
        hist = [(i,t) for i,t in hist if i in mapping][-30:]
        if not hist:
            # A zero embedding is an explicit empty-profile fallback, not a fabricated interaction.
            hist = [(None, 0)]
        ii = [mapping[i]+1 if i is not None else 0 for i,t in hist]
        tt = np.array([t for i,t in hist], dtype=float)
        gg = np.log1p(np.maximum(np.diff(tt, prepend=tt[0]), 0) / gap_scale)
        aa = np.maximum(tt[-1]-tt, 0) / gap_scale
        pad = 30-len(ii)
        ids.append(ii+[0]*pad);gaps.append(np.pad(gg,(0,pad)));ages.append(np.pad(aa,(0,pad)));lengths.append(len(ii))
    return (torch.tensor(ids), torch.tensor(np.array(gaps),dtype=torch.float32),
            torch.tensor(np.array(ages),dtype=torch.float32),torch.tensor(lengths))

def evaluate(scores, targets, candidates, ids, split, warm, prefix='all'):
    details=[]; covered=set(); rng=np.random.default_rng(SEED)
    for u, target in enumerate(targets):
        if prefix == 'warm' and target not in warm: continue
        if prefix == 'cold' and target in warm: continue
        subset = candidates[u]
        hit, ndcg = metric(scores[u,subset], ids[subset], target)
        ranked=topk(scores[u,subset], ids[subset])
        covered.update(ids[subset][ranked])
        details.append((u,hit,ndcg))
    vals=np.array([x[2] for x in details]); hits=np.array([x[1] for x in details])
    if len(vals):
        boots=np.array([vals[rng.integers(0,len(vals),len(vals))].mean() for _ in range(500)])
        ci=np.quantile(boots,[.025,.975]).tolist()
    else: ci=[0.,0.]
    return {'split':split,'cohort':prefix,'users':len(details),'Recall@10':float(hits.mean()) if len(hits) else 0.,
            'NDCG@10':float(vals.mean()) if len(vals) else 0.,'Coverage@10':len(covered)/len(ids),
            'NDCG_CI_low':ci[0],'NDCG_CI_high':ci[1]},details

def main(epochs):
    started=time.time(); np.random.seed(SEED); torch.manual_seed(SEED);torch.set_num_threads(2)
    data=ROOT/'data';out=ROOT/'artifacts';out.mkdir(exist_ok=True)
    frames={s:pd.read_csv(data/f'{s}.csv',dtype={'user_id':str,'item_id':str}) for s in ['train','val','test']}
    for d in frames.values():
        assert not d[['user_id','item_id','timestamp']].isna().any().any()
    rawtrain,val,test=[frames[s] for s in ['train','val','test']]
    users=sorted(rawtrain.user_id.unique()); nu=len(users); umap={u:j for j,u in enumerate(users)}
    # Exclude ambiguous events at the validation timestamp from every learned component.
    vcut=val.set_index('user_id').timestamp
    train=rawtrain[rawtrain.timestamp < rawtrain.user_id.map(vcut)].copy()
    meta=pd.read_csv(data/'item_metadata.csv',dtype={'item_id':str}).drop_duplicates('item_id')
    extra=pd.read_csv(data/'catalog.csv',dtype={'item_id':str}).drop_duplicates('item_id').set_index('item_id')
    meta=meta.set_index('item_id');meta['title']=extra.title.combine_first(meta.title);meta=meta.fillna('')
    ids=np.array(sorted(meta.index)); ni=len(ids);imap={i:j for j,i in enumerate(ids)};meta=meta.loc[ids]
    assert set(pd.concat(list(frames.values())).item_id).issubset(imap)
    warmset=set(train.item_id);warm=np.array([i in warmset for i in ids]); wi=np.flatnonzero(warm)
    # Use only titles: the supplied description/features fields are literal [List], not descriptive text.
    vec=TfidfVectorizer(ngram_range=(1,2),max_features=12000,stop_words='english',sublinear_tf=True)
    vec.fit(meta.loc[sorted(warmset),'title'])
    text=vec.transform(meta.title)
    svd=TruncatedSVD(n_components=64,random_state=SEED);svd.fit(text[wi])
    features=normalize(svd.transform(text)).astype('float32')
    similarity=(text @ text.T).toarray().astype('float32')
    train_h=histories(train.sort_values(['user_id','timestamp'],kind='stable'),users)
    valtargets=val.set_index('user_id').loc[users].item_id.to_numpy()
    testtargets=test.set_index('user_id').loc[users].item_id.to_numpy()
    valcut=val.set_index('user_id').loc[users].timestamp.to_numpy()
    testcut=test.set_index('user_id').loc[users].timestamp.to_numpy()
    val_h=[[(i,t) for i,t in h if t < cutoff] for h,cutoff in zip(train_h,valcut)]
    combined=histories(pd.concat([train,val]).sort_values(['user_id','timestamp'],kind='stable'),users)
    test_h=[[(i,t) for i,t in h if t < cutoff] for h,cutoff in zip(combined,testcut)]
    # Unknown timestamp units: train-derived relative scale, never assert days or calendar semantics.
    diffs=[b[1]-a[1] for h in train_h for a,b in zip(h,h[1:]) if b[1]>a[1]]
    gap_scale=float(np.median(diffs)) if diffs else 1.
    def content(hs):
        profiles=[]
        for h in hs:
            js=[imap[i] for i,t in h]
            weights=np.exp(-np.array([h[-1][1]-t for i,t in h])/gap_scale) if h else []
            profiles.append(np.average(features[js],axis=0,weights=weights) if js else np.zeros(64))
        return np.array(profiles) @ features.T
    cv,ct=content(val_h),content(test_h)
    pop=np.zeros(ni,dtype='float32')
    for i,n in train.item_id.value_counts().items():pop[imap[i]]=np.log1p(n)
    pv=np.tile(pop,(nu,1));pt=pv.copy()
    # Each target has 99 deterministic negatives sampled from metadata catalog excluding known profile.
    def candidates(targets,hs):
        rng=np.random.default_rng(SEED); result=[]
        for target,h in zip(targets,hs):
            forbidden={imap[i] for i,t in h}|{imap[target]}
            pool=np.array([j for j in range(ni) if j not in forbidden])
            result.append(np.r_[imap[target],rng.choice(pool,min(99,len(pool)),replace=False)])
        return result
    vc,tc=candidates(valtargets,val_h),candidates(testtargets,test_h)
    def val_ndcg(scores):
        return np.mean([metric((scores[u] if val_h[u] else pop)[c],ids[c],valtargets[u])[1] for u,c in enumerate(vc)])
    # GRU only predicts train catalog. True cold products have no learned output row.
    warmmap={ids[j]:k for k,j in enumerate(wi)}
    samples=[];labels=[]
    for h in train_h:
        for end in range(1,len(h)):
            prefix=[x for x in h[:end] if x[1]<h[end][1]][-30:]
            if prefix: samples.append(prefix);labels.append(warmmap[h[end][0]])
    tensors=encode(samples,warmmap,gap_scale);labels=torch.tensor(labels)
    vinputs=encode(val_h,warmmap,gap_scale);tinputs=encode(test_h,warmmap,gap_scale)
    logs=[];best_global=-1.;best_mode=None
    for mode in ['base','gap','decay']:
        torch.manual_seed(SEED);model=SequenceModel(len(wi),mode);optim=torch.optim.Adam(model.parameters(),lr=.003)
        best=-1.;state=None;wait=0
        for epoch in range(1,epochs+1):
            model.train();order=torch.randperm(len(labels));losses=[]
            for b in order.split(128):
                optim.zero_grad();logits=model(*(t[b] for t in tensors));loss=nn.functional.cross_entropy(logits,labels[b]);loss.backward();nn.utils.clip_grad_norm_(model.parameters(),5.);optim.step();losses.append(loss.item())
            model.eval()
            with torch.no_grad():
                scores=np.full((nu,ni),-1e6,dtype='float32');scores[:,wi]=model(*vinputs).numpy()
            score=val_ndcg(scores);logs.append({'model':'H1 '+mode,'epoch':epoch,'loss':float(np.mean(losses)),'val_ndcg':score})
            if score>best+1e-8: best=score;state=copy.deepcopy(model.state_dict());wait=0
            else:wait+=1
            if wait>=5:break
        model.load_state_dict(state);print('GRU',mode,'val',best,flush=True)
        if best>best_global:
            best_global=best;best_mode=mode
            with torch.no_grad():
                gv=np.full((nu,ni),-1e6,dtype='float32');gv[:,wi]=model(*vinputs).numpy()
                gt=np.full((nu,ni),-1e6,dtype='float32');gt[:,wi]=model(*tinputs).numpy()
            torch.save({'state_dict':state,'mode':mode},out/'gru.pt')
    # Exact normalized bipartite adjacency D^-1/2 A D^-1/2 from train edges only.
    rows=train.user_id.map(umap).to_numpy();cols=train.item_id.map(imap).to_numpy()
    rr=np.r_[rows,nu+cols];cc=np.r_[nu+cols,rows]
    adj=sp.coo_matrix((np.ones(len(rr)),(rr,cc)),shape=(nu+ni,nu+ni)).tocsr();adj.data[:]=1
    deg=np.asarray(adj.sum(1)).ravel();norm=1/np.sqrt(np.maximum(deg,1))
    adj=sp.diags(norm) @ adj @ sp.diags(norm);adj=adj.tocoo()
    tadj=torch.sparse_coo_tensor(np.array([adj.row,adj.col]),adj.data.astype('float32'),adj.shape).coalesce()
    torch.manual_seed(SEED);graph=GraphText(nu,ni,torch.tensor(features),warm,tadj)
    optim=torch.optim.Adam(graph.parameters(),lr=.01)
    positive={u:set(cols[rows==u]) for u in range(nu)};rng=np.random.default_rng(SEED)
    best=-1.;wait=0
    for epoch in range(1,max(epochs,25)+1):
        graph.train();optim.zero_grad();ue,ie=graph()
        negatives=np.array([rng.choice(wi) for _ in rows])
        for j,u in enumerate(rows):
            while negatives[j] in positive[u]:negatives[j]=rng.choice(wi)
        margin=(ue[rows]*(ie[cols]-ie[negatives])).sum(1)
        loss=-nn.functional.logsigmoid(margin).mean()+1e-4*(graph.u.square().mean()+graph.i.square().mean())
        loss.backward();optim.step();graph.eval()
        with torch.no_grad():ue,ie=graph();raw=(ue @ ie.T).numpy()
        score=val_ndcg(raw);logs.append({'model':'H2 LightGCN-Text','epoch':epoch,'loss':loss.item(),'val_ndcg':score})
        if score>best+1e-8:best=score;state=copy.deepcopy(graph.state_dict());wait=0
        else:wait+=1
        if wait>=7:break
    graph.load_state_dict(state);graph.eval()
    with torch.no_grad():ue,ie=graph();raw=(ue @ ie.T).numpy()
    # Inductive profile aggregation supplements learned user embeddings with strictly prior events.
    item_emb=ie.numpy(); graph_v=[];graph_t=[]
    for hs,dest in [(val_h,graph_v),(test_h,graph_t)]:
        for u,h in enumerate(hs):
            js=[imap[i] for i,t in h]
            profile=item_emb[js].mean(0) if js else np.zeros(32)
            dest.append((.5*ue[u].numpy()+.5*profile) @ item_emb.T)
    graph_v=np.array(graph_v);graph_t=np.array(graph_t)
    scaled=lambda matrix:np.array([scale(x) for x in matrix],dtype='float32')
    cv,ct=scaled(cv),scaled(ct);gv,gt=scaled(gv),scaled(gt)
    rawv,rawt=scaled(graph_v),scaled(graph_t);pv,pt=scaled(pv),scaled(pt)
    mixing=[]
    for beta in [0.,.25,.5,.75,1.]:
        hv=beta*rawv+(1-beta)*cv
        mixing.append((val_ndcg(hv),beta))
    _,beta=max(mixing,key=lambda x:x[0]);hv=beta*rawv+(1-beta)*cv;ht=beta*rawt+(1-beta)*ct
    # H3 selects weights on validation only, including ablations where a component is unhelpful.
    trials=[]
    for a in [0.,.1,.25,.5,.75,1.]:
        for p in [0.,.05,.15]:
            if a+p>1:continue
            mix=a*gv+(1-a-p)*hv+p*pv;trials.append((val_ndcg(mix),a,p))
    _,a,p=max(trials,key=lambda x:x[0]);fv=a*gv+(1-a-p)*hv+p*pv;ft=a*gt+(1-a-p)*ht+p*pt
    vs=[pv,cv,rawv,gv,hv,fv];ts=[pt,ct,rawt,gt,ht,ft];results=[];details=[]
    # Empty strict profiles use the same train popularity fallback across all serving models.
    for scores in vs:
        for u,h in enumerate(val_h):
            if not h:scores[u]=pv[u]
    for scores in ts:
        for u,h in enumerate(test_h):
            if not h:scores[u]=pt[u]
    for name,v,t in zip(NAMES,vs,ts):
        for split,scores,targets,cands in [('validation',v,valtargets,vc),('test',t,testtargets,tc)]:
            for cohort in ['all','warm','cold']:
                r,dd=evaluate(scores,targets,cands,ids,split,warmset,cohort);r['model']=name;results.append(r)
                if split=='test' and cohort=='all':
                    details.extend({'model':name,'profile':f'KH-{u+1:04}','hit':hit,'ndcg':ndcg} for u,hit,ndcg in dd)
    # Full-catalog check explicitly masks prior products except repeated target purchases.
    for name,scores in zip(NAMES,ts):
        full=scores.copy()
        for u,h in enumerate(test_h):
            for i,_ in h:
                if i!=testtargets[u]:full[u,imap[i]]=-np.inf
        r,_=evaluate(full,testtargets,[np.arange(ni) for _ in users],ids,'test_full_catalog',warmset)
        r['model']=name;results.append(r)
    pd.DataFrame(results).to_csv(out/'metrics.csv',index=False);pd.DataFrame(details).to_csv(out/'test_detail.csv',index=False)
    pd.DataFrame(logs).to_csv(out/'training.csv',index=False)
    pd.DataFrame([{'val_ndcg':s,'graph_weight':b} for s,b in mixing]).to_csv(out/'h2_selection.csv',index=False)
    pd.DataFrame([{'val_ndcg':s,'h1_weight':a,'popularity_weight':p,'h2_weight':1-a-p} for s,a,p in trials]).to_csv(out/'h3_selection.csv',index=False)
    catalog=pd.DataFrame({'item_id':ids,'title':meta.title.values,'in_train':warm})
    catalog.to_csv(out/'catalog.csv',index=False)
    # No raw Amazon user IDs or review text in the serving package.
    np.savez_compressed(out/'serving.npz',popularity=pt,content=ct,graph=rawt,h1=gt,h2=ht,h3=ft,features=features,similarity=similarity)
    profiles=[{'profile':f'KH-{u+1:04}','history':[imap[i] for i,t in h],
               'target':imap[testtargets[u]],'candidates':tc[u].tolist()} for u,h in enumerate(test_h)]
    (out/'profiles.json').write_text(json.dumps(profiles))
    audit={'users':nu,'raw_train_rows':len(rawtrain),'train_rows':len(train),'excluded_ambiguous_train_rows':len(rawtrain)-len(train),'val_rows':len(val),'test_rows':len(test),'catalog':ni,
           'train_items':len(wi),'test_items':test.item_id.nunique(),'cold_test_targets':int((~test.item_id.isin(warmset)).sum()),
           'train_val_equal_timestamps':int((rawtrain.groupby('user_id').timestamp.max()==val.set_index('user_id').timestamp).sum()),
           'val_test_equal_timestamps':int((val.set_index('user_id').timestamp==test.set_index('user_id').timestamp).sum()),
           'empty_strict_val_profiles':sum(not h for h in val_h),'empty_strict_test_profiles':sum(not h for h in test_h),
           'training_prefixes':len(labels),'timestamp_unit':'unknown; relative train-derived scale only','gap_scale':gap_scale,
           'gru_selected':best_mode,'h2_graph_weight':beta,'h3_weights':{'h1':a,'h2':1-a-p,'popularity':p},
           'metadata_assumption':'Metadata catalog assumed available before targets; publication timestamps absent.',
           'protocol':'100 candidates (one target + 99 negatives), fixed seed; full catalog also reported; strict prior profiles; per-user split, transductive train graph, not global temporal split.',
           'text_encoder':'TF-IDF bigrams + 64D SVD fitted on train-item titles; not MiniLM or LLM',
           'seed':SEED,'seconds':round(time.time()-started,1),
           'input_sha256':{f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in [data/'train.csv',data/'val.csv',data/'test.csv',data/'item_metadata.csv',data/'catalog.csv']}}
    (out/'audit.json').write_text(json.dumps(audit,indent=2,ensure_ascii=False))
    torch.save({'state_dict':graph.state_dict()},out/'graph.pt')
    print(json.dumps(audit,indent=2),flush=True)
    print(pd.DataFrame(results).query("split=='test' and cohort=='all'").to_string(index=False),flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--epochs',type=int,default=25);args=parser.parse_args();main(args.epochs)
