import { analyzeB } from './analyticB.js';
import { configB } from '../config/gameB.js';
const a = analyzeB(configB as any);
const { pk, buyEvDetail, ...r } = a;
console.log(JSON.stringify({ ...r, buyRtpAtPrice: a.buyEv / configB.buy.priceMult, parityPrice: a.buyEv / a.totalRtp, pkTrigger: pk.slice(6), pFullGivenBuy: buyEvDetail.pFull }, null, 1));
