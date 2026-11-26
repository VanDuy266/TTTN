"""Research web application with an isolated retail sandbox. No Streamlit on the serving path."""
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
from src.retail_web import StoreDemo, router as retail_router
from src.study import evaluation_method, model_study

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
        self.study=model_study(self.manifest,read('study_data.json'))
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
                           'ndcg10':float(1/math.log2(rank+1)) if rank<=10 else 0.,'top10':top,
                           'target_in_learned_output':not (key in {'m1','m2','m3'} and not self.catalog[profile['target']]['in_train']),
                           'uses_fallback':bool(profile['fallback'])})
        history=[dict(self.item(h['item_index']),timestamp=h['timestamp']) for h in profile['history_records']]
        return {'run_id':self.manifest['run_id'],'profile_id':profile['profile'],'protocol':payload.protocol,
                'candidate_count':len(candidates),'execution_mode':'saved_scores','fallback':profile['fallback'],
                'cutoff':profile['cutoff'],'history':history,'target':self.item(profile['target']),
                'results':result,'server_ms':round((time.perf_counter()-started)*1000,3)}

@asynccontextmanager
async def lifespan(application):
    application.state.lab=ResearchLab()
    application.state.store_demo = StoreDemo(application.state.lab, ROOT / "artifacts")
    try:
        yield
    finally:
        application.state.store_demo.directory.cleanup()

app=FastAPI(title='DAD · Thực nghiệm hệ thống gợi ý',version='2.0',lifespan=lifespan,docs_url='/api/docs',redoc_url=None)
app.add_middleware(GZipMiddleware,minimum_size=1000)
app.include_router(retail_router)
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

@app.get('/api/study')
def study(request:Request):return lab(request).study

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

@app.get("/api/direction-comparison")
def direction_comparison(request: Request, protocol: Literal["full_catalog", "sampled100"] = "full_catalog"):
    data = lab(request)
    h3 = next(direction for direction in data.study["directions"] if direction["id"] == "h3")
    directions = dict(h1=h3["selected_h1"], h2="h2", h3="h3")
    targets = np.array([profile["target"] for profile in data.profiles])
    candidates = (np.arange(len(data.catalog)) if protocol == "full_catalog" else
                  np.array([sorted(profile["candidates"]) for profile in data.profiles]))
    ranks = {}
    for direction, model in directions.items():
        matrix = data.arrays[model]
        scores = matrix if protocol == "full_catalog" else np.take_along_axis(matrix, candidates, axis=1)
        target_scores = matrix[np.arange(len(targets)), targets, None]
        # Match the case endpoint: higher score first, then earlier catalog index for a tie.
        ahead = (scores > target_scores) | ((scores == target_scores) & (candidates < targets[:, None]))
        ranks[direction] = (ahead.sum(axis=1) + 1).tolist()

    metrics = {row["model"]: row for row in data.metrics
               if row["protocol"] == protocol and row["cohort"] == "all"}
    return {
        "protocol": protocol,
        "top_k": data.manifest["top_k"],
        "users": len(targets),
        "candidate_count": candidates.shape[-1],
        "directions": [
            {"id": direction, "model": model, "name": data.models[model]["name"],
             "hits": metrics[model]["hits10"], "recall": metrics[model]["recall10"],
             "ndcg": metrics[model]["ndcg10"]}
            for direction, model in directions.items()
        ],
        "profiles": [
            {"id": profile["profile"], "ranks": {direction: values[i] for direction, values in ranks.items()}}
            for i, profile in enumerate(data.profiles)
        ],
    }


@app.get('/api/training')
def training(request:Request):
    with (ROOT/'artifacts/training.csv').open() as f:rows=list(csv.DictReader(f))
    return {'run_id':lab(request).manifest['run_id'],'rows':[dict(r,epoch=int(r['epoch']),loss=float(r['loss']),val_ndcg=float(r['val_ndcg'])) for r in rows]}

@app.get('/api/export/metrics.csv')
def export_metrics(request:Request):
    data=lab(request);output=io.StringIO();writer=csv.writer(output)
    writer.writerow(['Mô hình','Phạm vi đánh giá','Nhóm sản phẩm','Số người dùng','Số người tìm trúng','Recall@10','NDCG@10','Coverage@10','Cận dưới NDCG 95%','Cận trên NDCG 95%'])
    groups={'all':'Tất cả','warm':'Đã có trong tập huấn luyện','cold':'Chưa có trong tập huấn luyện'}
    for row in data.metrics:
        writer.writerow([data.models[row['model']]['name'],'Toàn bộ danh mục' if row['protocol']=='full_catalog' else '100 sản phẩm ứng viên',groups[row['cohort']],row['users'],row['hits10'],row['recall10'],row['ndcg10'],row['coverage10'],row['ndcg_ci_low'],row['ndcg_ci_high']])
    return Response(('\ufeff'+output.getvalue()).encode('utf-8'),media_type='text/csv',headers={'Content-Disposition':'attachment; filename="ket_qua_thuc_nghiem.csv"'})

@app.get('/api/export/report.md',response_class=PlainTextResponse)
def report(request:Request,protocol:Literal['full_catalog','sampled100']='full_catalog',cohort:Literal['all','warm','cold']='all'):
    data=lab(request);manifest=data.manifest
    rows=[r for r in data.metrics if r['protocol']==protocol and r['cohort']==cohort]
    lines=['# Nhóm DAD — Kết quả thực nghiệm hệ thống gợi ý','',f"Run ID: {manifest['run_id']}",f"Giao thức: {manifest['protocols'][protocol]}",f'Nhóm sản phẩm: '+{'all':'Tất cả','warm':'Đã có trong tập huấn luyện','cold':'Chưa có trong tập huấn luyện'}[cohort]+'; 10 kết quả đầu','',
           '| Mô hình | Số người dùng | Recall@10 | NDCG@10 | Coverage@10 |','|---|---:|---:|---:|---:|']
    for r in rows:lines.append(f"| {data.models[r['model']]['name']} | {r['users']} | {r['recall10']:.6f} | {r['ndcg10']:.6f} | {r['coverage10']:.6f} |")
    method = evaluation_method()
    for heading, key in [('Quy trình', 'workflow'), ('Tập ứng viên', 'protocols'), ('Cách tính chỉ số', 'metrics')]:
        lines.extend(['', f'## {heading}', ''])
        lines.extend(f"- **{entry['title']}** — {entry['description']}" for entry in method[key])
    lines.extend(['', method['bootstrap']])
    lines+=['','## Phạm vi và hạn chế','',manifest['execution_note'],
            'H1 gồm M1/M2/M3; H2 sử dụng LightGCN và TF-IDF/SVD, chưa sử dụng MiniLM. H3 là mô hình tích hợp được nhóm bổ sung.',
            'Các mô hình được học từ tập huấn luyện. Số vòng học và trọng số kết hợp được chọn bằng tập xác thực; chỉ số cuối cùng được tính trên tập kiểm tra.',
            'Đơn vị mốc thời gian chưa được xác minh. Lịch sử chỉ gồm tương tác trước thời điểm kiểm tra; danh mục được giả định có sẵn trước đó. Dữ liệu hiện chia theo người dùng, chưa theo thời gian toàn hệ thống.',
            'Kết quả dựa trên một lần khởi tạo huấn luyện. Khoảng tin cậy tính bằng lấy mẫu lại theo người dùng, chưa phản ánh biến thiên giữa các lần huấn luyện.',
            'Đánh giá toàn danh mục bao gồm cả sản phẩm từng xuất hiện trong lịch sử cho mọi mô hình.',
            '',f"Mã kiểm tra SHA256 của dữ liệu đầu vào: {json.dumps(manifest['audit']['input_sha256'],ensure_ascii=False)}"]
    return PlainTextResponse('\n'.join(lines),headers={'Content-Disposition':'attachment; filename="research_report.md"'})
