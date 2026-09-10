const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./load-ts.cjs');
const realConsoleLog = console.log;
const time = minute => new Date(Date.UTC(2026,8,8,3,0) + minute * 60000).toISOString();
function fixture() {
  const values = new Map();
  const storage = { getItem: async k => values.get(k) ?? null, setItem: async(k,v)=>{values.set(k,v)}, removeItem:async k=>{values.delete(k)}, getAllKeys:async()=>[...values.keys()], multiGet:async keys=>keys.map(k=>[k,values.get(k)??null]) };
  const attendance = [{id:1,employee_id:36,check_in_time:time(0),check_out_time:time(60),checkout_type:'manual_checkout'}, {id:2,employee_id:36,check_in_time:time(70),check_out_time:time(90),checkout_type:'manual_checkout'}];
  const sites = [{id:1,name:'Site A',latitude:28.49,longitude:77.08,geofence_radius:100,is_active:true},{id:2,name:'Site B',latitude:28.50,longitude:77.09,geofence_radius:100,is_active:true}];
  const rows = []; let attempts=0, offline=false;
  const db = { auth: {getSession:async()=>({data:{session:{}}})}, from:table=>{
    let filters=[], orders=[], max=Infinity, rangeStart=0, single=false, write;
    const q={select:()=>q,eq:(k,v)=>(filters.push(r=>r[k]===v),q),in:(k,v)=>(filters.push(r=>v.includes(r[k])),q),
      lt:(k,v)=>(filters.push(r=>r[k]<v),q),lte:(k,v)=>(filters.push(r=>r[k]<=v),q),gte:(k,v)=>(filters.push(r=>r[k]>=v),q),
      not:(k,op,v)=>(filters.push(r=>r[k]!=null),q),or:s=>(filters.push(r=>!r.check_out_time||r.check_out_time>=s.split('.gte.')[1]),q),
      order:(k,opt={})=>(orders.push([k,opt.ascending!==false]),q),limit:n=>(max=n,q),range:(a,b)=>(rangeStart=a,max=b-a+1,q),maybeSingle:()=>(single=true,q),
      upsert:r=>(write=r,q),then:(resolve,reject)=>Promise.resolve().then(()=>{
        if(offline) return {data:null,error:{code:'NETWORK_ERROR',message:'Network unavailable'}};
        if(write){attempts++;const existing=rows.find(r=>r.idempotency_key===write.idempotency_key);if(existing)return {data:[],error:null};const row={...write,id:rows.length+1,created_at:new Date().toISOString()};rows.push(row);return {data:[row],error:null};}
        const data=[...(table==='attendance'?attendance:table==='work_sites'?sites:rows)].filter(r=>filters.every(f=>f(r)));
        data.sort((a,b)=>{for(const[k,asc]of orders){if(a[k]!==b[k])return(a[k]<b[k]?-1:1)*(asc?1:-1);}return 0;});
        const page=data.slice(rangeStart,rangeStart+max);return {data:single?page[0]??null:page,error:null};
      }).then(resolve,reject)};return q;
  }};
  const service=loadTs('src/services/locationTimelineService.ts',{'@react-native-async-storage/async-storage':storage,'../constants/config':{GPS_ACCURACY_BUFFER:15,ATTENDANCE_GPS_ACCURACY_THRESHOLD:50},'./supabase':{supabase:db,createHeadlessSupabaseClient:async()=>db}});
  const observe=(minute,coords={latitude:28.49,longitude:77.08},extra={})=>service.recordTimelineLocation({employeeId:36,eventTime:time(minute),coordinates:coords,accuracy:8,source:'test',...extra});
  return {service,storage,values,rows,attendance,observe,db,attempts:()=>attempts,offline:v=>offline=v};
}
// Keep detailed diagnostic lines in the captured test log; they are not device evidence.
test('72 stationary callbacks preserve 72 observations and consolidate into one segment',async()=>{
 const f=fixture(); for(let i=0;i<72;i++)await f.observe(i/2);
 assert.equal(f.rows.length,72);assert.equal(f.attempts(),72);assert.equal(f.service.buildTimelineSegments(f.rows).length,1);
 assert.equal(f.rows[0].event_time,time(0));assert.notEqual(f.rows[0].created_at,time(0));
});
test('GPS identity deduplicates retries but preserves different timestamps',async()=>{
 const f=fixture();await f.observe(1);await f.observe(1);await f.observe(2);assert.equal(f.rows.length,2);
});
test('same-site and direct Site A to Site B observations are all stored',async()=>{
 const f=fixture();await f.observe(1);await f.observe(2);await f.observe(10,{latitude:28.50,longitude:77.09});
 assert.deepEqual(f.rows.map(r=>r.event_type),['location_update','location_update','site_arrival']);assert.equal(f.rows[2].site_id,2);
});
test('outside-site fix does not reuse check-in site and travelling has no location label',async()=>{
 const f=fixture();await f.observe(1);await f.observe(10,{latitude:28.495,longitude:77.085});await f.observe(11,{latitude:28.495,longitude:77.085});
 assert.equal(f.rows[1].event_type,'site_departure');assert.equal(f.rows[1].location_name,'');assert.equal(f.rows[1].site_id,null);assert.equal(f.rows[2].event_type,'unknown_location');
});
test('late upload before and exactly at checkout accepted; post-checkout rejected',async()=>{
 const f=fixture();await f.observe(59);await f.observe(60);await f.observe(61);assert.equal(f.rows.length,2);
});
test('invalid timestamp is rejected without substituting upload time',async()=>{
 const f=fixture();await f.observe(1,undefined,{eventTime:''});assert.equal(f.rows.length,0);assert.equal(f.values.size,0);
});
test('stale local attendance does not attach overtime to main shift',async()=>{
 const f=fixture();await f.storage.setItem('@LocSvc:attendanceId','1');await f.observe(75);assert.equal(f.rows[0].attendance_id,2);
});
test('network failures retain more than three fixes across more than three retries',async()=>{
 const f=fixture();f.offline(true);for(let i=1;i<=8;i++)await f.observe(i);for(let i=0;i<5;i++)await f.service.retryPendingTimelineEvents(36);
 assert.equal([...f.values.keys()].filter(k=>k.includes('pending:v2')).length,8);f.offline(false);await f.service.retryPendingTimelineEvents(36);assert.equal(f.rows.length,8);assert.equal(f.values.size,0);
});
test('a historical backlog does not starve a current attendance fix',async()=>{
 const f=fixture();f.offline(true);
 for(let i=0;i<80;i++)await f.observe(i/100);
 await f.observe(75,undefined,{attendanceId:2});
 f.offline(false);await f.service.retryPendingTimelineEvents(36);
 assert.equal(f.rows.length,50);
 assert.ok(f.rows.some(row=>row.attendance_id===2&&row.event_time===time(75)));
 assert.ok(f.values.size>0,'unprocessed historical fixes remain durable');
});
test('concurrent foreground/background queue writes do not evict distinct fixes',async()=>{
 const f=fixture();await Promise.all(Array.from({length:12},(_,i)=>f.observe(i+1,undefined,{deferUpload:true})));assert.equal(f.values.size,12);await f.service.retryPendingTimelineEvents(36);assert.equal(f.rows.length,12);
});
test('retries of an older fix do not inherit a newer site or session',async()=>{
 const f=fixture();await f.observe(10);await f.observe(50,{latitude:28.50,longitude:77.09});await f.observe(20);assert.equal(f.rows[2].site_id,1);assert.equal(f.rows[2].event_type,'location_update');
});
test('only one terminal is stored per attendance',async()=>{
 const f=fixture();for(let i=0;i<2;i++)await f.service.recordTimelineEvent({employeeId:36,attendanceId:1,eventType:'check_out',eventTime:time(60)});assert.equal(f.rows.length,1);
});
test('report query retrieves more than 1000 records; no attendance fallback',async()=>{
 const f=fixture();for(let i=0;i<1205;i++)f.rows.push({id:i+1,employee_id:36,attendance_id:1,event_time:new Date(Date.parse(time(0))+i*1000).toISOString(),event_type:'location_update',site_id:1,location_name:'Site A'});
 const segments=await f.service.getLocationTimeline(36,time(0),time(60));assert.equal(segments[0].end_time,f.rows[1204].event_time);
 f.rows.length=0;assert.deepEqual(await f.service.getLocationTimeline(36,time(0),time(60)),[]);
});


test('projection orders a late GPS fix at checkout before one terminal and never reopens it',()=>{
 const f=fixture();const base={employee_id:36,attendance_id:1,created_at:time(60)};
 const rows=[{...base,id:1,event_time:time(60),event_type:'check_out'},{...base,id:2,event_time:time(60),event_type:'location_update',site_id:1,location_name:'Site A'},{...base,id:3,event_time:time(61),event_type:'location_update',site_id:1},{...base,id:4,event_time:time(60),event_type:'check_out'}];
 const s=f.service.buildTimelineSegments(rows);assert.equal(s.length,2);assert.equal(s[0].event_type,'at_site');assert.equal(s[0].end_time,time(60));assert.equal(s[1].event_type,'check_out');
});

test('report keeps persistent timeline rows when admin cannot read attendance boundaries',async()=>{
 const f=fixture();
 f.rows.push({id:1,employee_id:36,attendance_id:999,event_time:time(10),event_type:'location_update',site_id:1,location_name:'Site A'});
 const segments=await f.service.getLocationTimeline(36,time(0),time(60));
 assert.equal(segments.length,1);
 assert.equal(segments[0].location_name,'Site A');
});

test('authoritative projection excludes orphan, post-checkout, and mismatched terminal rows',()=>{
 const f=fixture(); const attendance=[{id:1,employee_id:36,check_in_time:time(0),check_out_time:time(60),checkout_type:'manual_checkout'}];
 const base={employee_id:36,created_at:time(0)};
 const rows=[
  {...base,id:1,attendance_id:null,event_time:time(1),event_type:'movement'},
  {...base,id:2,attendance_id:999,event_time:time(2),event_type:'auto_checkout'},
  {...base,id:3,attendance_id:1,event_time:time(10),event_type:'location_update',site_id:1,location_name:'Site A'},
  {...base,id:4,attendance_id:1,event_time:time(60),event_type:'auto_checkout'},
  {...base,id:5,attendance_id:1,event_time:time(60),event_type:'check_out'},
  {...base,id:6,attendance_id:1,event_time:time(61),event_type:'movement'},
 ];
 const result=f.service.buildTimelineSegments(rows,attendance);
 assert.deepEqual(result.map(row=>row.event_type),['at_site','check_out']);
 assert.equal(result[0].end_time,time(60));
});
