import tempfile, unittest
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import numpy as np
import pandas as pd
from src.business import RetailStore, validate_inventory, recommend, funnel

class RetailTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.path=Path(self.tmp.name)/'shop.sqlite'
        self.store=RetailStore(self.path)
        self.catalog=pd.DataFrame({'item_id':['a','b','c'],'title':['Skin serum','Makeup brush','Hair oil'],'group':['Chăm sóc da','Cọ & dụng cụ','Chăm sóc tóc']})
        self.store.seed_sample(self.catalog)
    def tearDown(self):self.tmp.cleanup()
    def inventory(self,stocks=(3,2,0)):
        return pd.DataFrame({'item_id':['a','b','c'],'stock':stocks,'price':[100,200,300],'active':[1,1,1]})
    def test_inventory_validation_and_snapshot(self):
        self.store.import_inventory(self.inventory().iloc[:1],self.catalog.item_id)
        state=self.store.inventory().set_index('item_id')
        self.assertEqual(int(state.loc['b','active']),0)
        self.assertEqual(self.store.setting('inventory_source'),'operator_csv')
        before=self.store.inventory()
        for col,value in [('stock',-1),('stock',1.5),('price',float('nan')),('active',2),('item_id','unknown')]:
            bad=self.inventory().astype(object);bad.loc[0,col]=value
            with self.assertRaises(ValueError):self.store.import_inventory(bad,self.catalog.item_id)
            pd.testing.assert_frame_equal(before,self.store.inventory())
    def test_exposures_actions_are_attributable_and_deduplicated(self):
        request=self.store.expose('v','personalized','content',['a'],3.)
        self.store.action('v',request,'a','click');self.store.action('v',request,'a','click')
        with self.assertRaises(ValueError):self.store.action('other',request,'a','cart')
        with self.assertRaises(ValueError):self.store.action('v',request,'b','click')
        f=funnel(self.store.tables()).iloc[0]
        self.assertEqual(f['clicks'],1);self.assertEqual(f['CTR'],1.)
    def test_checkout_atomic_and_idempotent(self):
        self.store.import_inventory(self.inventory(),self.catalog.item_id)
        request=self.store.expose('v','treatment','content',['a','b'],3.)
        cart={'a':{'quantity':2,'request_id':request},'b':{'quantity':1,'request_id':request}}
        order=self.store.checkout('v',cart,'key')
        self.assertEqual(order,self.store.checkout('v',cart,'key'))
        other=RetailStore(self.path)
        self.assertEqual(len(other.tables()['orders']),1)
        self.assertEqual(int(other.tables()['orders'].iloc[0].total),400)
        self.assertEqual(other.inventory().set_index('item_id').loc['a','stock'],1)
        self.assertEqual(funnel(other.tables()).iloc[0].session_conversion,1.)
    def test_failed_order_rolls_back_everything(self):
        self.store.import_inventory(self.inventory(),self.catalog.item_id)
        request=self.store.expose('v','treatment','content',['a','c'],3.)
        cart={'a':{'quantity':1,'request_id':request},'c':{'quantity':1,'request_id':request}}
        with self.assertRaises(ValueError):self.store.checkout('v',cart,'key')
        self.assertEqual(self.store.inventory().set_index('item_id').loc['a','stock'],3)
        self.assertEqual(len(self.store.tables()['orders']),0)
        self.assertEqual((self.store.tables()['events'].event=='purchase').sum(),0)
    def test_concurrent_orders_cannot_oversell(self):
        self.store.import_inventory(self.inventory((1,0,0)),self.catalog.item_id)
        req={v:self.store.expose(v,'treatment','content',['a'],3.) for v in ['v1','v2']}
        def purchase(v):
            try:return RetailStore(self.path).checkout(v,{'a':{'quantity':1,'request_id':req[v]}},v)
            except ValueError:return None
        with ThreadPoolExecutor(max_workers=2) as pool:result=list(pool.map(purchase,['v1','v2']))
        self.assertEqual(sum(x is not None for x in result),1)
        self.assertEqual(self.store.inventory().set_index('item_id').loc['a','stock'],0)
    def test_variant_stable_and_both_branches_exist(self):
        self.store.configure('experiment_enabled','1')
        first=[self.store.variant(str(i)) for i in range(20)]
        self.assertEqual(first,[RetailStore(self.path).variant(str(i)) for i in range(20)])
        self.assertEqual(set(first),{'control','treatment'})
    def test_recommendations_respect_stock_group_and_cart(self):
        inv=self.inventory();arrays={'popularity':np.array([[.9,.7,1.]]),'similarity':np.eye(3),'h3':np.array([[.1,.2,.3]])}
        profiles=[{'profile':'known','history':[0]}]
        for variant in ['control','treatment']:
            result,_=recommend(self.catalog,arrays,profiles,'known',[],inv,variant)
            self.assertEqual(result.item_id.tolist(),['b'])
        result,_=recommend(self.catalog,arrays,profiles,'Khách mới',[],inv,'personalized','Chăm sóc tóc')
        self.assertTrue(result.empty)
        result,_=recommend(self.catalog,arrays,profiles,'Khách mới',[],inv,'personalized',cart_ids=['a','b'])
        self.assertTrue(result.empty)

if __name__=='__main__':unittest.main()
