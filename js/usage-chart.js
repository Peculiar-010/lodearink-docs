// Immutable Atta runtime and builder were validated together, including their hashes.
const runtime={
  url:'https://replit-cdn.com/atta-chart-preview/atta-chart-preview.c6b800258f92.js',
  integrity:'sha256-xrgAJY+SyrykdDaKStQl2ojwpji6tn5r/X2mage2Y54='
};
let loading;
const handles=new WeakMap();
function script(src,integrity){
  return new Promise((resolve,reject)=>{
    const element=document.createElement('script');element.src=src;
    if(integrity){element.integrity=integrity;element.crossOrigin='anonymous';}
    element.onload=resolve;element.onerror=()=>reject(new Error('The chart renderer could not load. Request totals remain available below.'));
    document.head.append(element);
  });
}
export async function renderTrafficChart(element,data){
  if(!element)return;
  handles.get(element)?.dispose();handles.delete(element);
  if(!data?.points?.length){element.textContent='No observed request-volume samples in this window.';return;}
  loading??=Promise.all([script(runtime.url,runtime.integrity),script('/js/charts/traffic.chart.js')]).catch(error=>{loading=null;throw error;});
  try{
    await loading;
    if(!element.isConnected)return;
    element.textContent='';
    const handle=await globalThis.AttaChartPreview.render({el:element,data,builder:globalThis.buildUsageVolume,theme:'AttaDark'});
    handles.set(element,handle);
  }catch(error){element.textContent=error.message;}
}
export function disposeTrafficChart(element){handles.get(element)?.dispose();handles.delete(element);}
