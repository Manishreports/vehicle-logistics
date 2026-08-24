import { describe, expect, it } from 'vitest';
import { buildPage1Groups, buildPage2Groups } from '../src/domain/matchers.js';
import { vehicleCallPending, vehicleCalledPlanPending, onloadingVehicles, vehiclePending } from '../src/domain/analytics.js';
import type { PlanningRecord, StatusRecord } from '../src/types/models.js';
const p=(id:string,date:string,cfa:string,lp:string,vin:string='',vout:string=''):PlanningRecord=>({id,date,location:'MAIN',plant:'Drools',cfa,weight:1,sto:id,loadingPoint:lp,vehicleIn:vin,vehicleNumber:'V1',vehicleOut:vout,slipNumber:'S1',createdAt:'',updatedAt:''});
const s=(id:string,demand:string,loc:string,lp:string,vin=''):StatusRecord=>({id,demandDate:demand,requiredDate:'2026-08-14',location:loc,loadingPoint:lp,weight:1,vehicleNumber:'',vehicleIn:vin,vehicleOut:'',remark:'',createdAt:'',updatedAt:''});
describe('group matching and derived categories',()=>{
  it('matches Page 2 Location to Page 1 CFA',()=>{const pgs=buildPage1Groups([p('1','2026-08-16','Goa','LP')],[]); const sgs=buildPage2Groups([s('s','2026-08-16','Goa','LP')],pgs,[]); expect(sgs[0].page1Match?.cfa).toBe('Goa');});
  it('calculates call pending and plan pending without creating rows',()=>{const pgs=buildPage1Groups([p('1','2026-08-16','Goa','LP'),p('2','2026-08-17','Agra','LP')],[]); const sgs=buildPage2Groups([s('s','2026-08-16','Goa','LP'),s('s2','2026-08-18','Jaipur','LP')],pgs,[]); expect(vehicleCallPending(pgs,sgs).map(x=>x.cfa)).toEqual(['Agra']); expect(vehicleCalledPlanPending(sgs).map(x=>x.location)).toEqual(['Jaipur']);});
  it('allows same-day dispatch and rejects no-auto-date assumptions',()=>{const g=buildPage1Groups([p('1','2026-08-16','Goa','LP','2026-08-16','2026-08-16')],[])[0]; expect(g.status).toBe('Dispatched');});
  it('onloading requires In and blank Out',()=>{const g=buildPage1Groups([p('1','2026-08-16','Goa','LP','2026-08-16','')],[]); expect(onloadingVehicles(g).length).toBe(1);});
  it('vehicle pending uses Required Date delta',()=>{const rows=vehiclePending([s('s','2026-08-14','Thane','LP')],'2026-08-14',[]); expect(rows[0].pendingBy).toBe('0 Days');});
});
