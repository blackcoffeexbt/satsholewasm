"""Invoke the compiled component with the same Wasmtime engine limits as LNbits.
Run with an existing LNbits Python environment; installs no dependencies.
Host I/O is simulated. No real invoices or transfers are created.
"""
import os
import hashlib
import json
import re
import secrets
import time
from pathlib import Path
from wasmtime import Config, Engine, Store, WasiConfig, component

ROOT = Path(__file__).resolve().parents[2]
config = Config()
config.wasm_component_model = True
config.consume_fuel = True
config.max_wasm_stack = 1024 * 1024
engine = Engine(config)
compiled = component.Component.from_file(engine, str(ROOT / 'wasm/module.wasm'))
tables = {}
clock = 1791288000
fuel_used = []
FUEL = int(os.environ.get("SATSHOLE_TEST_FUEL", "40000000000"))

def record(values):
    r = component.Record()
    for k, v in values.items():
        setattr(r, k, v)
    return r

def host(name, request=None):
    r = vars(request) if request is not None else {}
    if name in ('storage-get', 'storage-get-public'):
        row = tables.get(r['table'], {}).get(r['id'])
        return record({'data-json': json.dumps(row) if row else None})
    if name == 'storage-set':
        row = json.loads(r['data-json'])
        tables.setdefault(r['table'], {})[row['id']] = row
        return record({'ok': True})
    if name == 'storage-delete':
        tables.get(r['table'], {}).pop(r['id'], None)
        return record({'ok': True})
    if name == 'storage-get-paginated':
        filters = json.loads(r['filters-json'])
        rows = [x for x in tables.get(r['table'], {}).values() if all(x.get(k) == v for k, v in filters.items())]
        if r['sort-by']:
            rows.sort(key=lambda x: x[r['sort-by']], reverse=r['descending'])
        return record({'rows-json': json.dumps(rows[r['offset']:r['offset']+r['limit']]), 'total': len(rows)})
    if name == 'list-user-wallets':
        return record({'wallets': [record({'id': 'wallet-1', 'name': 'Game wallet', 'currency': None})]})
    if name == 'now':
        return record({'timestamp': clock})
    if name == 'random-id':
        return record({'id': r['prefix'] + '_' + secrets.token_hex(8)})
    if name == 'log':
        return record({'ok': True})
    if name == 'random-secret-and-hash':
        secret = secrets.token_hex(r['length'])
        return record({'secret': secret, 'hash': hashlib.sha256(bytes.fromhex(secret)).hexdigest()})
    raise AssertionError(f'Unexpected host call: {name}')

linker = component.Linker(engine)
linker.add_wasip2()
wit = (ROOT / 'wasm/lnbits-extension.wit').read_text()
with linker.root() as root:
    for interface, contents in re.findall(r'interface ([\w-]+) \{(.*?)\n\}', wit, re.S):
        with root.add_instance('lnbits:extension/' + interface) as instance:
            for name, parameters in re.findall(r'([\w-]+): func\((.*?)\)', contents):
                if parameters:
                    instance.add_func(name, lambda store, request, name=name: host(name, request))
                else:
                    instance.add_func(name, lambda store, name=name: host(name))

def call(export, data):
    store = Store(engine)
    store.set_wasi(WasiConfig())
    store.set_fuel(FUEL)
    store.set_limits(memory_size=64 * 1024 * 1024, table_elements=10000, instances=8, tables=10, memories=8)
    instance = linker.instantiate(store, compiled)
    function = instance.get_func(store, export)
    started = time.monotonic()
    result = function(store, json.dumps(data))
    function.post_return(store)
    fuel_used.append(FUEL - store.get_fuel())
    value = json.loads(result)
    assert value['ok'], value
    print(export, data.get('action'), 'fuel', fuel_used[-1], 'seconds', round(time.monotonic()-started, 3))
    return value['data']

assert call('invoke-admin', {'action': 'settings'})['configured'] is False
saved = call('invoke-admin', {'action': 'save-settings', 'wallet_id': 'wallet-1', 'config': {'duration': int(os.environ.get('SATSHOLE_TEST_DURATION', '10')), 'ai_count': int(os.environ.get('SATSHOLE_TEST_AI', '16')), 'competitor_aggression': 10}})
a = saved['arena_id']
session = call('invoke-public', {'arenaId': a, 'action': 'session'})
base = {'arenaId': a, 'player_token': session['player_token']}
run = call('invoke-public', {**base, 'action': 'runs', 'free': True})
start = call('invoke-public', {**base, 'action': 'start', 'run_id': run['id']})
clock += start['config']['duration']
result = call('invoke-public', {**base, 'action': 'finish', 'run_id': run['id'], 'run_token': start['run_token'], 'inputs': [[0,100,0]]})
while result['status'] == 'VERIFYING':
    result = call('invoke-public', {**base, 'action': 'verify', 'run_id': run['id']})
assert result['status'] == 'VERIFIED'
print('Compiled component passed; maximum invocation fuel:', max(fuel_used))
