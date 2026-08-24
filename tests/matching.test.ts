import { describe, expect, it } from 'vitest';
import { buildIndexes } from '../src/domain/indexes.js';
import { matchExactSto } from '../src/domain/matchers.js';
import type { GateRecord, PlanningRecord, StatusRecord, RaipurRecord } from '../src/types/models.js';
const gate=(id:string,slip:string,sto:string):GateRecord=>({id,gateSlip:slip,sto,vehicleNumber:'HR61E6039',gateInDate:'2026-08-16',gateOutDate:'2026-08-17',cfa:'Goa',rawSheet:'Sheet1',sourceRow:Number(id)});
const baseP=(id:string,sto:string):PlanningRecord=>({id,date:'2026-08-16',location:'MAIN',plant:'Drools',cfa:'Goa',weight:18,sto,loadingPoint:'TOLAGAON LOADING',vehicleIn:'',vehicleNumber:'',vehicleOut:'',slipNumber:'',createdAt:'',updatedAt:''});
describe('exact STO and shared slip matching',()=>{
  it('keeps multiple STOs under the same slip',()=>{
    const indexes=buildIndexes([baseP('1','4210085500')],[],[gate('1','233877','4210085499'),gate('2','233877','4210085500'),gate('3','233877','4210085507')],[],[]);
    expect(indexes.stoToGates.get('4210085500')?.[0].gateSlip).toBe('233877');
    expect(indexes.stoToGates.get('4210085507')?.[0].gateSlip).toBe('233877');
  });
  it('does not fuzzy match nearby STOs',()=>{
    const indexes=buildIndexes([],[],[gate('1','233877','4210085507')],[],[]);
    const result=matchExactSto('4210085500',indexes);
    expect(result.matched).toBe(false);
  });
});
