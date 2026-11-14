"""Local measurements of the clean serving environment, not a hosted SLA."""
import argparse, gzip, json, subprocess, time, urllib.error, urllib.request
from pathlib import Path
import statistics

ROOT=Path(__file__).resolve().parents[1]
def request(url,payload=None):
    headers={'Accept-Encoding':'gzip'}
    if payload is not None:headers['Content-Type']='application/json'
    data=json.dumps(payload).encode() if payload is not None else None
    started=time.perf_counter()
    with urllib.request.urlopen(urllib.request.Request(url,data=data,headers=headers),timeout=15) as response:
        body=response.read();encoding=response.headers.get('Content-Encoding')
        elapsed=(time.perf_counter()-started)*1000
        decoded=gzip.decompress(body) if encoding=='gzip' else body
    return decoded,len(body),elapsed

def main(python,port):
    base=f'http://127.0.0.1:{port}'
    start=time.perf_counter()
    log=open('/tmp/reclab-benchmark-server.log','w')
    process=subprocess.Popen([python,'-m','uvicorn','app:app','--host','127.0.0.1','--port',str(port)],cwd=ROOT,stdout=log,stderr=log)
    try:
        while True:
            if process.poll() is not None:raise RuntimeError('Server exited; see /tmp/reclab-benchmark-server.log')
            try:request(base+'/healthz');break
            except (urllib.error.URLError,ConnectionError):
                if time.perf_counter()-start>15:raise RuntimeError('Local readiness timeout')
                time.sleep(.02)
        startup=(time.perf_counter()-start)*1000
        bootstrap,size,load=request(base+'/api/bootstrap')
        latencies=[];server_times=[];sizes=[]
        for i in range(31):
            data,length,elapsed=request(base+'/api/experiments',{'profile_id':f'KH-{i+1:04}','protocol':'full_catalog'})
            if i:
                latencies.append(elapsed);server_times.append(json.loads(data)['server_ms']);sizes.append(length)
        p95=lambda values:sorted(values)[int(.95*(len(values)-1))]
        result={'run_id':json.loads(bootstrap)['run_id'],'scope':'Loopback, clean serving venv, one process, six models, full catalog; excludes Internet/Render cold start and neural inference.',
                'samples':30,'startup_to_health_ms':round(startup,2),'bootstrap_ms':round(load,2),'bootstrap_gzip_bytes':size,'bootstrap_decoded_bytes':len(bootstrap),
                'api_p50_ms':round(statistics.median(latencies),2),'api_p95_ms':round(p95(latencies),2),
                'ranking_p50_ms':round(statistics.median(server_times),2),'ranking_p95_ms':round(p95(server_times),2),
                'case_gzip_bytes_mean':round(statistics.mean(sizes))}
        (ROOT/'docs/web-performance.json').write_text(json.dumps(result,indent=2))
        print(json.dumps(result,indent=2))
    finally:
        process.terminate()
        try:process.wait(timeout=5)
        except subprocess.TimeoutExpired:process.kill();process.wait()
        log.close()
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--python',default='/workspace/reclab-web-venv/bin/python');p.add_argument('--port',type=int,default=8531);a=p.parse_args();main(a.python,a.port)
