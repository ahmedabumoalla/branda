"""Run the exact packaged server with a disposable database and no browser."""
import base64
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import unittest
import urllib.error
import urllib.request
import uuid

ROOT=Path(__file__).resolve().parent
PACKAGE=Path(os.environ.get('BRANDA_TEST_PACKAGE',ROOT.parent/'output/offline-accounting-butcher-pos-20261114/Branda-Butcher-Windows'))


class HttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory()
        cls.proc=subprocess.Popen([str(PACKAGE/'runtime/python.exe'),str(PACKAGE/'app/server.py'),'--no-browser','--data',cls.temp.name],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        for _ in range(80):
            state=Path(cls.temp.name)/'running.json'
            if state.exists():break
            if cls.proc.poll() is not None:raise RuntimeError(cls.proc.communicate()[1].decode())
            time.sleep(.1)
        cls.origin=json.loads(state.read_text())['url']
        status,body,_=cls.request('status');cls.bootstrap=body['csrf']
        status,body,headers=cls.request('setup',{'company':'اختبار الملحمة','password':'owner-http-password'},csrf=cls.bootstrap)
        assert status==200,body
        cls.owner= headers['Set-Cookie'].split(';')[0];cls.owner_csrf=body['csrf']
        cls.request('cashier-settings',{'enabled':True,'password':'cashier-http-password'},cls.owner,cls.owner_csrf)
        status,body,headers=cls.request('login',{'password':'cashier-http-password','role':'cashier'},csrf=cls.bootstrap)
        assert status==200,body
        cls.cashier=headers['Set-Cookie'].split(';')[0];cls.cashier_csrf=body['csrf']

    @classmethod
    def tearDownClass(cls):
        cls.proc.terminate();cls.proc.communicate(timeout=10);cls.temp.cleanup()

    @classmethod
    def request(cls,path,payload=None,cookie='',csrf='',origin=None):
        headers={'Origin':origin or cls.origin}
        if cookie:headers['Cookie']=cookie
        if payload is not None:headers.update({'Content-Type':'application/json','X-CSRF-Token':csrf})
        req=urllib.request.Request(cls.origin+('/api/'+path if not path.startswith('/') else path),data=json.dumps(payload).encode() if payload is not None else None,headers=headers)
        try:response=urllib.request.urlopen(req,timeout=10)
        except urllib.error.HTTPError as error:response=error
        data=response.read();mime=response.headers.get('Content-Type','');status=response.status;response_headers=response.headers;response.close()
        return status,json.loads(data) if 'application/json' in mime else data,response_headers

    def test_01_assets_are_local(self):
        for path in ['/','/app.js','/butcher-ui.js','/qr.js','/app.css','/butcher.css','/pos.css','/branda-logo.png','/branda-logo-dark.png','/tajawal-regular.ttf']:
            status,body,headers=self.request(path)
            self.assertEqual(status,200,path);self.assertTrue(body);self.assertIn("connect-src 'self'",headers['Content-Security-Policy'])

    def test_02_cashier_get_restrictions(self):
        for path in ['report','butcher-report']:
            self.assertEqual(self.request(path,cookie=self.cashier)[0],403)
        status,data,_=self.request('snapshot',cookie=self.cashier)
        self.assertEqual(data['role'],'cashier');self.assertEqual(data['accounts'],[])
        self.assertFalse(any('password' in key for key in data['company']))

    def test_03_cashier_mutation_restrictions(self):
        for path in ['product','logo','settings','post','backup','restore','cashier-settings','account','party','period','quit']:
            self.assertEqual(self.request(path,{},self.cashier,self.cashier_csrf)[0],403,path)
        self.assertEqual(self.request('butcher',{'action':'purchase','request_id':str(uuid.uuid4())},self.cashier,self.cashier_csrf)[0],400)

    def test_04_csrf_origin(self):
        self.assertEqual(self.request('product',{},self.owner,'wrong')[0],403)
        self.assertEqual(self.request('product',{},self.owner,self.owner_csrf,origin='https://evil.invalid')[0],403)
        self.assertEqual(self.request('catalog')[0],401)

    def test_05_checkout_flow_and_restart_data(self):
        status,data,_=self.request('product',{'name':'لحم صافي','unit':'kg','stock_group':'اللحم','price':'80'},self.owner,self.owner_csrf);self.assertEqual(status,200);product=data['id']
        date=time.strftime('%Y-%m-%d')
        payload={'action':'purchase','request_id':str(uuid.uuid4()),'date':date,'basis':'carcass','carcass_count':1,'weight_kg':'20','stock_group':'ذبائح','reference':'HTTP-1','cost':'600','paid':'600'}
        status,data,_=self.request('butcher',payload,self.owner,self.owner_csrf);self.assertEqual(status,200,data)
        _,catalog,_=self.request('catalog',cookie=self.owner);lot=catalog['lots'][0]['id']
        status,data,_=self.request('butcher',{'action':'cut','request_id':str(uuid.uuid4()),'date':date,'lot_id':lot,'quarters':4,'output_kg':'15','waste_kg':'5','stock_group':'اللحم','note':'تقطيع فعلي'},self.owner,self.owner_csrf);self.assertEqual(status,200,data)
        payload={'action':'sale','request_id':str(uuid.uuid4()),'items':[{'product_id':product,'quantity':'1.125'}],'cash':'40','card':'50','customer_name':'عميل','customer_phone':'0500000000'}
        status,result,_=self.request('butcher',payload,self.cashier,self.cashier_csrf);self.assertEqual(status,200,result)
        self.assertEqual(self.request('butcher',payload,self.cashier,self.cashier_csrf)[1]['id'],result['id'])
        status,doc,_=self.request('document?id='+str(result['id']),cookie=self.cashier);self.assertEqual(status,200);self.assertEqual(doc['entries'],[]);self.assertNotIn('cost',doc['context']);self.assertEqual(doc['context']['customer_phone'],'0500000000')
        _,catalog,_=self.request('catalog',cookie=self.cashier);self.assertNotIn('lots',catalog);self.assertNotIn('cost',catalog['stocks'][0])
        _,report,_=self.request('butcher-report',cookie=self.owner);self.assertEqual(report['summary']['cash'],4000);self.assertEqual(report['summary']['card'],5000)
        self.assertEqual(report['summary']['cost'],3375)
        status,backup,_=self.request('backup',{},self.owner,self.owner_csrf);self.assertEqual(status,200);self.assertTrue(backup.startswith(b'SQLite format 3'))

    def test_06_outbound_denial(self):
        code="import sys,socket;from server import deny_outbound;sys.addaudithook(deny_outbound);\ntry:socket.create_connection(('example.com',443));raise AssertionError('outbound allowed')\nexcept PermissionError:print('blocked')"
        result=subprocess.run([str(PACKAGE/'runtime/python.exe'),'-c',code],capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr);self.assertEqual(result.stdout.strip(),'blocked')

    def test_07_logo_upload_validation(self):
        self.assertEqual(self.request('logo',{'image':'data:image/svg+xml;base64,PHN2Zz4='},self.owner,self.owner_csrf)[0],400)
        self.assertEqual(self.request('settings',{'company':'متجر','tax_number':'123','address':''},self.owner,self.owner_csrf)[0],400)

    def test_08_restart_persists_local_state(self):
        _,before,_=self.request('butcher-report',cookie=self.owner)
        self.proc.terminate();self.proc.communicate(timeout=10)
        state=Path(self.temp.name)/'running.json'
        state.unlink(missing_ok=True)
        type(self).proc=subprocess.Popen([str(PACKAGE/'runtime/python.exe'),str(PACKAGE/'app/server.py'),'--no-browser','--data',self.temp.name],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        for _ in range(80):
            if state.exists():break
            if self.proc.poll() is not None:raise RuntimeError(self.proc.communicate()[1].decode())
            time.sleep(.1)
        type(self).origin=json.loads(state.read_text())['url']
        _,status,_=self.request('status')
        self.assertTrue(status['initialized'])
        status,body,headers=self.request('login',{'password':'owner-http-password','role':'owner'},csrf=status['csrf'])
        self.assertEqual(status,200,body)
        type(self).owner=headers['Set-Cookie'].split(';')[0];type(self).owner_csrf=body['csrf']
        _,after,_=self.request('butcher-report',cookie=self.owner)
        self.assertEqual(before,after)


if __name__=='__main__':unittest.main()
