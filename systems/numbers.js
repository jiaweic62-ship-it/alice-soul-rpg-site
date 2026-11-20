/* Exact nonnegative integer arithmetic. Amounts are persisted as decimal strings, never formatted units. */
const GameNumber=(()=>{
 const units=Object.freeze(['万','億','兆','京','垓','秭','穣','溝','澗','正','載','極']);
 function valid(v){return typeof v==='bigint'?v>=0n:typeof v==='number'?Number.isSafeInteger(v)&&v>=0:typeof v==='string'&&/^\d+$/.test(v)}
 function from(v){return valid(v)?BigInt(v):0n}
 function min(a,b){a=from(a);b=from(b);return a<b?a:b}
 function max(a,b){a=from(a);b=from(b);return a>b?a:b}
 function add(a,b){return from(a)+from(b)}
 function subtract(a,b){a=from(a);b=from(b);return a>b?a-b:0n}
 function multiply(a,b){return from(a)*from(b)}
 function percent(value,total){total=from(total);return total===0n?0:Number(min(value,total)*10000n/total)/100}
 function format(v){const digits=from(v).toString(),group=Math.floor((digits.length-1)/4);if(!group)return digits;const head=digits.length-group*4,whole=digits.slice(0,head),fraction=digits.slice(head,head+2).replace(/0+$/,'');const suffix=units[(group-1)%units.length]+'*'.repeat(Math.floor((group-1)/units.length));return whole+(fraction?'.'+fraction:'')+suffix}
 function stringify(value){return JSON.stringify(value,(_key,v)=>typeof v==='bigint'?v.toString():v)}
 return Object.freeze({valid,from,min,max,add,subtract,multiply,percent,format,stringify,units});
})();
