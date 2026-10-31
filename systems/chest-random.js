/* Multinomial draws use binomial order-statistic recursion. Integer rewards remain exact;
   batches have the same capped weighted distribution without looping over every box. */
const ChestRandom=(()=>{
 function uniform(next){return (next()+.5)/4294967296;}
 function normal(next){return Math.sqrt(-2*Math.log(uniform(next)))*Math.cos(2*Math.PI*uniform(next));}
 function gamma(shape,next){const d=shape-1/3,c=1/Math.sqrt(9*d);for(;;){const x=normal(next),base=1+c*x;if(base<=0)continue;const v=base**3,u=uniform(next);if(u<1-.0331*x**4||Math.log(u)<x*x/2+d*(1-v+Math.log(v)))return d*v;}}
 function binomial(n,p,next){let successes=0;while(n>32&&p>0&&p<1){const m=Math.floor(n/2),a=gamma(m+1,next),b=gamma(n-m,next),pivot=a/(a+b);if(pivot<=p){successes+=m+1;n-=m+1;p=(p-pivot)/(1-pivot);}else{n=m;p/=pivot;}}if(p>=1)return successes+n;for(let i=0;i<n;i++)if(uniform(next)<p)successes++;return successes;}
 function counts(n,weights,next){let total=weights.reduce((a,b)=>a+b,0),left=n;return weights.map((w,i)=>{const q=i===weights.length-1?left:binomial(left,w/total,next);left-=q;total-=w;return q;});}
 return {counts,binomial};
})();
