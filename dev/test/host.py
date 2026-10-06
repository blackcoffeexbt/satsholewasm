"""Check native config/permissions and real SQLite storage without touching live LNbits.
Run with the existing LNbits Python environment. All test data stays in dev/.test.
"""
import asyncio
import json
import os
from pathlib import Path
import tempfile

ROOT = Path(__file__).resolve().parents[2]
TEST_ROOT = ROOT / 'dev/.test'
TEST_ROOT.mkdir(exist_ok=True)
TEST_DATA = Path(tempfile.mkdtemp(prefix='storage-', dir=TEST_ROOT))
os.environ['LNBITS_DATA_FOLDER'] = str(TEST_DATA)
os.environ['LNBITS_DATABASE_URL'] = ''
os.environ['LNBITS_WASM_EXTENSIONS_PATH'] = str(ROOT.parent)

from lnbits.settings import settings
settings.lnbits_data_folder = str(TEST_DATA)
settings.lnbits_database_url = None
settings.lnbits_wasm_extensions_path = str(ROOT.parent)
from lnbits.core.wasm_ext.wasm.config import parse_wasm_extension_config
from lnbits.core.wasm_ext.api.permissions import validate_extension_permissions
from lnbits.core.wasm_ext.api.host import ExtensionHostAPI
from lnbits.core.wasm_ext.api.models import StorageGetRequest, StorageSetRequest, StoragePaginatedRequest
from lnbits.core.wasm_ext.storage.crud import _run_storage_migration
from lnbits.db import Database

config = parse_wasm_extension_config('satsholewasm', json.loads((ROOT / 'config.json').read_text()))
assert len(validate_extension_permissions('satsholewasm', config.permissions)) == len(config.permissions)

async def main():
    database = Database('ext_satsholewasm')
    async with database.connect() as conn:
        await _run_storage_migration(conn, ROOT / 'storage/migrations/0001_initial.json')
    # Public owner-context routes execute in event context in the native router.
    owner = ExtensionHostAPI('satsholewasm', config.permissions, context='event', owner_id='owner-one')
    other = ExtensionHostAPI('satsholewasm', config.permissions, context='event', owner_id='owner-two')
    arena = {'id':'test-arena','wallet_id':'wallet-one','name':'Test','config_json':'{}','created_at':1791288000}
    await owner.storage_set(StorageSetRequest(table='arenas', data=arena))
    result = await owner.storage_get(StorageGetRequest(table='arenas', id='test-arena'))
    assert json.loads(result.data_json) == arena
    assert (await other.storage_get(StorageGetRequest(table='arenas', id='test-arena'))).data_json is None
    await other.storage_set(StorageSetRequest(table='arenas', data={**arena,'name':'Wrong owner'}))
    assert json.loads((await owner.storage_get(StorageGetRequest(table='arenas', id='test-arena'))).data_json)['name'] == 'Test'
    row = {'id':'run-one','arena_id':'test-arena','player_id':'player-one','run_id':'','competition_id':'week-one','kind':'run','status':'READY','payload':'{"seed":42}','created_at':1791288000}
    await owner.storage_set(StorageSetRequest(table='records', data=row))
    page = await owner.storage_get_paginated(StoragePaginatedRequest(table='records',filters={'kind':'run','player_id':'player-one'},limit=25,sort_by='created_at'))
    assert json.loads(page.rows_json) == [row]
    assert (await other.storage_get_paginated(StoragePaginatedRequest(table='records',filters={},limit=25))).total == 0
    anonymous = ExtensionHostAPI('satsholewasm',config.permissions,context='user')
    try:
        await anonymous.storage_get(StorageGetRequest(table='records',id='run-one'))
    except PermissionError:
        pass
    else:
        raise AssertionError('Owner context must be required')
    print('Native config, declared permissions, migrations, real SQLite storage and owner isolation passed.')

asyncio.run(main())
