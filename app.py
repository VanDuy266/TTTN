"""Standalone, read-only research web application. No Streamlit on the serving path."""
from contextlib import asynccontextmanager
import csv, hashlib, io, json, math, time
from pathlib import Path
from typing import Literal
import numpy as np
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import HTMLResponse, PlainTextResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

ROOT=Path(__file__).resolve().parent
DATA=ROOT/'artifacts/web'

class Experiment(BaseModel):
    profile_id:str=Field(min_length=1,max_length=32)
    protocol:Literal['full_catalog','sampled100']='full_catalog'
    models:list[str]=Field(default_factory=lambda:['popularity','content','m1','m2','m3','h2','h3'],min_length=1,max_length=8)

class ResearchLab:
    def __init__(self,path=DATA):
        self.path=Path(path)
        read=lambda name:json.loads((self.path/name).read_text())
        self.manifest=read('manifest.json');self.catalog=read('catalog.json')
        self.profiles=read('profiles.json');self.by_id={p['profile']:p for p in self.profiles}
        self.metrics=read('metrics.json');self.contrasts=read('contrasts.json')
        self.models={m['id']:m for m in self.manifest['models']}
        self.arrays={k:np.load(self.path/f'{k}.npy',mmap_mode='r',allow_pickle=False) for k in self.models}
        for a in self.arrays.values():
            if a.shape!=(len(self.profiles),len(self.catalog)):raise RuntimeError('Score artifact shape mismatch')
    def item(self,index):
        item=self.catalog[int(index)]
        return {'item_id':item['item_id'],'title':item['title'],'warm':bool(item['in_train'])}
    def compare(self,payload):
        if payload.profile_id not in self.by_id:raise HTTPException(404,'Không tìm thấy hồ sơ trong tập test.')
        if len(set(payload.models))!=len(payload.models):raise HTTPException(422,'Danh sách mô hình bị trùng.')
        if any(m not in self.models for m in payload.models):raise HTTPException(422,'Mô hình không thuộc lần chạy đã kiểm chứng.')
        started=time.perf_counter();profile=self.by_id[payload.profile_id]
        # Candidate IDs are canonically ordered before scoring so ties never favor the target.
        candidates=np.arange(len(self.catalog)) if payload.protocol=='full_catalog' else np.array(sorted(profile['candidates']))
        result=[]
        for key in payload.models:
            scores=self.arrays[key][profile['row'],candidates]
            ordered=candidates[np.argsort(-scores,kind='stable')]
            rank=int(np.flatnonzero(ordered==profile['target'])[0])+1
            top=[dict(self.item(j),rank=n+1,is_target=bool(j==profile['target']),score=float(self.arrays[key][profile['row'],j])) for n,j in enumerate(ordered[:10])]
            result.append({'model':key,'name':self.models[key]['name'],'rank':rank,'hit10':rank<=10,
                           'ndcg10':float(1/math.log2(rank+1)) if rank<=10 else 0.,'top10':top})
        history=[dict(self.item(h['item_index']),timestamp=h['timestamp']) for h in profile['history_records']]
        return {'run_id':self.manifest['run_id'],'profile_id':profile['profile'],'protocol':payload.protocol,
                'candidate_count':len(candidates),'execution_mode':'saved_scores','fallback':profile['fallback'],
                'cutoff':profile['cutoff'],'history':history,'target':self.item(profile['target']),
                'results':result,'server_ms':round((time.perf_counter()-started)*1000,3)}

@asynccontextmanager
async def lifespan(application):
    application.state.lab=ResearchLab()
    yield

app=FastAPI(title='DAD · Thực nghiệm hệ thống gợi ý',version='2.0',lifespan=lifespan,docs_url='/api/docs',redoc_url=None)
app.add_middleware(GZipMiddleware,minimum_size=1000)
app.mount('/static',StaticFiles(directory=ROOT/'web/static'),name='static')

@app.middleware('http')
async def response_headers(request,call_next):
    response=await call_next(request)
    response.headers['X-Content-Type-Options']='nosniff'
    if request.url.path.startswith('/static/'):
        response.headers['Cache-Control']='public, max-age=86400'
    return response

def lab(request):return request.app.state.lab

@app.get('/',response_class=HTMLResponse)
def index():
    assets=b''.join((ROOT/'web/static'/f).read_bytes() for f in ['app.js','style.css'])
    version=hashlib.sha256(assets).hexdigest()[:12]
    page=(ROOT/'web/index.html').read_text().replace('__ASSET_VERSION__',version)
    return HTMLResponse(page,headers={'Cache-Control':'no-cache'})

@app.get('/healthz')
def health(request:Request):return {'status':'ok','run_id':lab(request).manifest['run_id']}

@app.get('/api/bootstrap')
def bootstrap(request:Request):
    return lab(request).manifest

@app.get('/api/profiles')
def profiles(request:Request,query:str=Query('',max_length=80),cohort:Literal['all','warm','cold']='all',history:Literal['all','short','long','empty']='all',limit:int=Query(60,ge=1,le=646)):
    items=[]
    for p in lab(request).profiles:
        if query.lower() not in p['profile'].lower():continue
        if cohort!='all' and p['target_warm']!=(cohort=='warm'):continue
        if history=='short' and not 1<=p['history_length']<=2:continue
        if history=='long' and p['history_length']<10:continue
        if history=='empty' and p['history_length']!=0:continue
        items.append({'id':p['profile'],'history_length':p['history_length'],'target_warm':p['target_warm'],'fallback':p['fallback']})
    return {'total':len(items),'items':items[:limit]}

@app.post('/api/experiments')
def experiment(payload:Experiment,request:Request):
    result=lab(request).compare(payload)
    return Response(json.dumps(result,ensure_ascii=False),media_type='application/json',headers={'Server-Timing':f'ranking;dur={result["server_ms"]}'})

@app.get('/api/metrics')
def metrics(request:Request,protocol:Literal['full_catalog','sampled100']='full_catalog',cohort:Literal['all','warm','cold']='all'):
    data=lab(request)
    return {'run_id':data.manifest['run_id'],'protocol':protocol,'cohort':cohort,'top_k':10,
            'rows':[r for r in data.metrics if r['protocol']==protocol and r['cohort']==cohort],
            'contrasts':[r for r in data.contrasts if r['protocol']==protocol] if cohort=='all' else [],
            'ci_note':'Bootstrap 95% theo người dùng, 500 lần, seed 42; một seed huấn luyện; chưa hiệu chỉnh nhiều phép so sánh.'}

@app.get('/api/training')
def training(request:Request):
    with (ROOT/'artifacts/training.csv').open() as f:rows=list(csv.DictReader(f))
    return {'run_id':lab(request).manifest['run_id'],'rows':[dict(r,epoch=int(r['epoch']),loss=float(r['loss']),val_ndcg=float(r['val_ndcg'])) for r in rows]}

@app.get('/api/export/metrics.csv')
def export_metrics():return Response((DATA/'metrics.csv').read_bytes(),media_type='text/csv',headers={'Content-Disposition':'attachment; filename="research_metrics.csv"'})

@app.get('/api/export/report.md',response_class=PlainTextResponse)
def report(request:Request,protocol:Literal['full_catalog','sampled100']='full_catalog',cohort:Literal['all','warm','cold']='all'):
    data=lab(request);manifest=data.manifest
    rows=[r for r in data.metrics if r['protocol']==protocol and r['cohort']==cohort]
    lines=['# Nhóm DAD — Kết quả thực nghiệm hệ thống gợi ý','',f"Run ID: {manifest['run_id']}",f"Giao thức: {manifest['protocols'][protocol]}",f'Nhóm: {cohort}; K = 10','',
           '| Mô hình | Users | Recall@10 | NDCG@10 | Coverage@10 |','|---|---:|---:|---:|---:|']
    for r in rows:lines.append(f"| {data.models[r['model']]['name']} | {r['users']} | {r['recall10']:.6f} | {r['ndcg10']:.6f} | {r['coverage10']:.6f} |")
    lines+=['','## Phạm vi và hạn chế','',manifest['execution_note'],
            'H1 gồm M1/M2/M3; H2 dùng LightGCN + tiêu đề TF-IDF/SVD, chưa phải MiniLM trong slide. H3 là mở rộng ngoài hai hướng gốc.',
            'Train, epoch và trọng số được chọn bằng validation. Chỉ xem test để báo cáo; không chọn lại mô hình theo hồ sơ dự đoán đẹp.',
            'Timestamp chưa xác minh đơn vị; lịch sử strictly trước cutoff. Catalog được giả định sẵn trước target. Split theo user, graph transductive; chưa thay thế split thời gian toàn cục.',
            'Một seed huấn luyện; CI bootstrap người dùng chưa phản ánh biến thiên giữa các seed. Chưa có bằng chứng tăng hiệu quả kinh doanh.',
            'Full catalog cho phép mua lại với mọi mô hình. Không so trực tiếp với số full catalog cũ có lọc lịch sử.',
            '',f"Input SHA256: {json.dumps(manifest['audit']['input_sha256'],ensure_ascii=False)}"]
    return PlainTextResponse('\n'.join(lines),headers={'Content-Disposition':'attachment; filename="research_report.md"'})
