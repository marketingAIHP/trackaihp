const { test } = require('node:test');
const assert=require('node:assert/strict');
const {loadTs}=require('./load-ts.cjs');
test('foreground subscriber records stationary and in-flight fixes with original timestamp and accuracy',async()=>{
 const points=[];let callback;const values=new Map();let release;
 const storage={getItem:async k=>values.get(k)??null,setItem:async(k,v)=>values.set(k,v),removeItem:async k=>values.delete(k),multiRemove:async keys=>keys.forEach(k=>values.delete(k)),multiSet:async entries=>entries.forEach(([k,v])=>values.set(k,v))};
 const manager={start:async()=>{},requestPermission:async()=>true,subscribeToLocationUpdates:cb=>(callback=cb,()=>{}),getCachedLocationSnapshot:()=>null};
 let upload=0;const svc=loadTs('src/services/LocationTrackingService.ts',{
  '@react-native-async-storage/async-storage':storage,'expo-location':{hasStartedLocationUpdatesAsync:async()=>true},'expo-task-manager':{isTaskDefined:()=>true},
  '../utils/geofence':{isGpsAccurateEnough:()=>true},'../utils/logger':{logger:{log:()=>{}}},
  './attendanceLocationManager':manager,'./locationTimelineService':{recordTimelineLocation:async p=>points.push(p),retryPendingTimelineEvents:async()=>{}},
  './api':{employeeApi:{updateLiveLocation:async()=>{upload++;await new Promise(r=>release=r);return {success:true}}}}
 }).default;
 await storage.setItem('@LocSvc:configurationVersion','2');await svc.checkInEmployee(36,1,undefined,1);
 const timestamp=Date.now()-10000;const snapshot={coordinates:{latitude:28.49,longitude:77.08},accuracy:8,timestamp};
 callback(snapshot);callback({...snapshot,timestamp:timestamp+1000});
 assert.equal(points.length,2);assert.equal(upload,1);assert.equal(points[0].eventTime,new Date(timestamp).toISOString());assert.equal(points[0].accuracy,8);release();
});
test('background persists every batched fix before stale/live throttle and awaits retry completion',async()=>{
 let callback;const points=[];let release;let done=false;
 const svc=loadTs('src/services/backgroundLocationTask.ts',{
  'expo-task-manager':{defineTask:(name,cb)=>callback=cb},'expo-location':{},
  '@react-native-async-storage/async-storage':{getItem:async()=> '36'},
  './locationTimelineService':{recordTimelineLocation:async p=>points.push(p),retryPendingTimelineEvents:async()=>new Promise(r=>release=r)},
  './supabase':{createHeadlessSupabaseClient:async()=>({})},'./api':{employeeApi:{}},
  './locationState':{getLatestLocation:()=>({timestamp:10000}),updateLocation:async()=>false},'../utils/geofence':{}
 });
 const fix=t=>({timestamp:t,coords:{latitude:28.49,longitude:77.08,accuracy:8}});
 const work=callback({data:{locations:[fix(3000),fix(1000),fix(2000)]}}).then(()=>done=true);
 await new Promise(r=>setImmediate(r));assert.equal(points.length,3);assert.deepEqual(points.map(p=>p.eventTime),[1000,2000,3000].map(t=>new Date(t).toISOString()));assert(points.every(p=>p.deferUpload));assert.equal(done,false);release();await work;assert.equal(done,true);
});
