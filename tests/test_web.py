import csv, io, json, unittest
from pathlib import Path
import numpy as np
from fastapi.testclient import TestClient
from app import app
ROOT=Path(__file__).resolve().parents[1]

class ResearchWebTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.context=TestClient(app);cls.client=cls.context.__enter__();cls.lab=app.state.lab
    @classmethod
    def tearDownClass(cls):cls.context.__exit__(None,None,None)
    def test_static_web_and_metadata_are_lightweight(self):
        root=self.client.get('/');self.assertEqual(root.status_code,200)
        self.assertNotIn('streamlit',root.text.lower());self.assertNotIn('__ASSET_VERSION__',root.text)
        self.assertEqual(self.client.get('/healthz').json()['status'],'ok')
        b=self.client.get('/api/bootstrap');self.assertLess(len(b.content),18000)
        self.assertEqual(len(b.json()['default_models']),7)
    def test_profile_filters_and_bounds(self):
        cold=self.client.get('/api/profiles?cohort=cold&limit=646').json()
        self.assertEqual(cold['total'],550);self.assertTrue(all(not x['target_warm'] for x in cold['items']))
        empty=self.client.get('/api/profiles?history=empty').json()
        self.assertEqual(empty['total'],31);self.assertTrue(all(x['fallback'] for x in empty['items']))
        self.assertEqual(self.client.get('/api/profiles?limit=0').status_code,422)
        self.assertEqual(self.client.get('/api/profiles?query=no-such-id').json()['total'],0)
    def test_comparison_protocols_and_strict_history(self):
        for protocol,count in [('full_catalog',2934),('sampled100',100)]:
            result=self.client.post('/api/experiments',json={'profile_id':'KH-0001','protocol':protocol}).json()
            self.assertEqual(result['candidate_count'],count);self.assertEqual(len(result['results']),7)
            self.assertTrue(all(x['timestamp']<result['cutoff'] for x in result['history']))
            for row in result['results']:
                self.assertEqual(len(row['top10']),10)
                self.assertEqual(row['hit10'],row['rank']<=10)
                ids=[x['item_id'] for x in row['top10']]
                self.assertEqual(len(ids),len(set(ids)))
                self.assertEqual(result['target']['item_id'] in ids,row['hit10'])
    def test_direction_comparison_covers_full_cohort_and_matches_case(self):
        for protocol, candidate_count in [("full_catalog", 2934), ("sampled100", 100)]:
            with self.subTest(protocol=protocol):
                response = self.client.get("/api/direction-comparison", params={"protocol": protocol})
                self.assertEqual(response.status_code, 200)
                data = response.json()
                self.assertEqual(data["candidate_count"], candidate_count)
                self.assertEqual(len({profile["id"] for profile in data["profiles"]}), 646)
                models = {row["id"]: row["model"] for row in data["directions"]}
                self.assertEqual(set(models), {"h1", "h2", "h3"})
                for row in data["directions"]:
                    hits = sum(profile["ranks"][row["id"]] <= data["top_k"] for profile in data["profiles"])
                    self.assertEqual(hits, row["hits"])
                    self.assertAlmostEqual(hits / data["users"], row["recall"])
                for profile in (data["profiles"][0], data["profiles"][-1]):
                    case = self.client.post("/api/experiments", json={
                        "profile_id": profile["id"], "protocol": protocol, "models": list(models.values()),
                    }).json()
                    rank_by_model = {row["model"]: row["rank"] for row in case["results"]}
                    self.assertEqual(profile["ranks"], {key: rank_by_model[value] for key, value in models.items()})

    def test_invalid_requests(self):
        for payload in [{'profile_id':'unknown'}, {'profile_id':'KH-0001','models':['../../secret']},
                        {'profile_id':'KH-0001','models':['m1','m1']}, {'profile_id':'KH-0001','models':[]},
                        {'profile_id':'KH-0001','protocol':'unrecognized'}]:
            self.assertIn(self.client.post('/api/experiments',json=payload).status_code,[404,422])
    def test_empty_profile_has_identical_popularity_fallback(self):
        profile=self.client.get('/api/profiles?history=empty').json()['items'][0]['id']
        data=self.client.post('/api/experiments',json={'profile_id':profile}).json()
        self.assertTrue(data['fallback']);rankings=[[x['item_id'] for x in r['top10']] for r in data['results']]
        self.assertTrue(all(x==rankings[0] for x in rankings))
    def test_all_exported_metrics_recomputed_from_scores(self):
        profiles=self.lab.profiles;targets=np.array([p['target'] for p in profiles]);warm=np.array([x['in_train'] for x in self.lab.catalog],dtype=bool)
        for protocol in ['full_catalog','sampled100']:
            base=np.broadcast_to(np.arange(len(self.lab.catalog)),(len(profiles),len(self.lab.catalog))) if protocol=='full_catalog' else np.array([sorted(p['candidates']) for p in profiles])
            for model in self.lab.models:
                values=np.take_along_axis(self.lab.arrays[model],base,axis=1)
                ranked=np.take_along_axis(base,np.argsort(-values,axis=1,kind='stable'),axis=1)
                ranks=(ranked==targets[:,None]).argmax(1)+1
                for cohort in ['all','warm','cold']:
                    mask=np.ones(len(profiles),dtype=bool) if cohort=='all' else warm[targets] if cohort=='warm' else ~warm[targets]
                    expected=next(x for x in self.lab.metrics if (x['model'],x['protocol'],x['cohort'])==(model,protocol,cohort))
                    self.assertEqual(int(mask.sum()),expected['users'])
                    self.assertAlmostEqual(float((ranks[mask]<=10).mean()),expected['recall10'])
                    self.assertEqual(int((ranks[mask]<=10).sum()),expected['hits10'])
                    ndcg=np.where(ranks[mask]<=10,1/np.log2(ranks[mask]+1),0.)
                    self.assertAlmostEqual(float(ndcg.mean()),expected['ndcg10'])
                    self.assertAlmostEqual(len(np.unique(ranked[mask,:10]))/len(self.lab.catalog),expected['coverage10'])
    def test_case_rank_matches_aggregate_and_lexical_ties(self):
        profile=self.lab.profiles[0];indices=np.array(sorted(profile['candidates']))
        result=self.client.post('/api/experiments',json={'profile_id':profile['profile'],'protocol':'sampled100'}).json()
        for row in result['results']:
            scores=self.lab.arrays[row['model']][profile['row']]
            ordered=sorted(indices,key=lambda j:(-float(scores[j]),self.lab.catalog[j]['item_id']))
            self.assertEqual(ordered.index(profile['target'])+1,row['rank'])
    def test_study_definitions_and_direction_groups(self):
        response=self.client.get('/api/study');self.assertEqual(response.status_code,200)
        study=response.json();self.assertEqual(study['run_id'],self.lab.manifest['run_id'])
        splits={r['id']:r for r in study['data']['splits']}
        self.assertEqual(splits['train']['interactions'],self.lab.manifest['audit']['train_rows'])
        self.assertEqual(splits['test']['users'],len(self.lab.profiles))
        self.assertEqual(study['data']['warm_targets']+study['data']['cold_targets'],len(self.lab.profiles))
        self.assertEqual(sum(x['users'] for x in study['data']['history_groups']),len(self.lab.profiles))
        for group in study['groups']:
            self.assertTrue(set(group['models']).issubset(self.lab.models))
            self.assertEqual(len(group['models']),len(set(group['models'])))
        h3=next(x for x in study['directions'] if x['id']=='h3')
        self.assertEqual(h3['parameters']['Trọng số H1'],self.lab.manifest['audit']['h3_weights']['h1'])
        self.assertIn('h3',h3['experiment_models'])
        if h3['collapses_to_content']:
            self.assertTrue(np.array_equal(self.lab.arrays['h3'],self.lab.arrays['content']))
        self.assertTrue(all(set(['input','processing','output','scope','status']).issubset(d) for d in study['directions']))
    def test_neural_output_scope_and_fallback_are_explicit(self):
        profile=next(p for p in self.lab.profiles if not p['target_warm'] and not p['fallback'])
        result=self.client.post('/api/experiments',json={'profile_id':profile['profile']}).json()
        rows={r['model']:r for r in result['results']}
        for key in ['m1','m2','m3']:
            self.assertFalse(rows[key]['target_in_learned_output']);self.assertFalse(rows[key]['uses_fallback'])
        empty=next(p for p in self.lab.profiles if p['fallback'])
        result=self.client.post('/api/experiments',json={'profile_id':empty['profile']}).json()
        self.assertTrue(all(r['uses_fallback'] for r in result['results']))
    def test_exports_training_and_api_documentation(self):
        response=self.client.get('/api/export/metrics.csv');self.assertEqual(response.status_code,200)
        self.assertEqual(len(list(csv.DictReader(io.StringIO(response.text)))),48)
        report=self.client.get('/api/export/report.md?cohort=cold')
        self.assertIn('Chưa có trong tập huấn luyện',report.text);self.assertIn('MiniLM',report.text)
        training=self.client.get('/api/training').json()['rows']
        self.assertTrue({'H1 base','H1 gap','H1 decay','H2 LightGCN-Text'}.issubset({r['model'] for r in training}))
        self.assertEqual(self.client.get('/api/docs').status_code,200)

if __name__=='__main__':unittest.main()
