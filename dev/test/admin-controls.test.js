import {readFileSync} from 'node:fs'
import assert from 'node:assert/strict'
import {test} from 'node:test'
const source=readFileSync(new URL('../../static/admin.js',import.meta.url),'utf8')
const html=readFileSync(new URL('../../ui/admin.html',import.meta.url),'utf8')
test('settings uses an explicit bridge action with validation and numeric selects, without native submission',async()=>{
 assert.match(html,/<button id="save-settings" type="button">/)
 assert.match(html,/<button id="apply-entry-review" type="button">/)
 assert.doesNotMatch(html,/type="submit"/)
 const controls={settings:{reportValidity:()=>true},'save-settings':{disabled:false},wallet:{value:'wallet-demo'},error:{textContent:''},'setting-enabled':{type:'checkbox',checked:true,dataset:{}},'setting-game_price':{type:'number',value:'25',dataset:{}},'setting-close_weekday':{type:'select-one',value:'6',dataset:{numeric:'true'}}}
 const config={},calls=[],errors=[]
 const begin=source.indexOf('  async function saveSettings()'),end=source.indexOf('  $("save-settings").onclick',begin)
 const action=Function('$','labels','config','call','load','error',source.slice(begin,end)+';return saveSettings')((id)=>controls[id],{enabled:'',game_price:'',close_weekday:''},config,async(action,body)=>calls.push({action,body}),async()=>{},e=>errors.push(e))
 await action();assert.equal(calls.length,1);assert.equal(calls[0].action,'save-settings');assert.equal(calls[0].body.wallet_id,'wallet-demo');assert.deepEqual(calls[0].body.config,{enabled:true,game_price:25,close_weekday:6});assert.equal(controls['save-settings'].disabled,false)
 controls.settings.reportValidity=()=>false;await action();assert.equal(calls.length,1);assert.equal(errors.length,0)
})
