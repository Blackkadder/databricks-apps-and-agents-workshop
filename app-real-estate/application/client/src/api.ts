export type Listing = { id:string; title:string; price:number; beds:number; baths:number; sqft:number; propertyType:'Condo'|'Townhouse'|'Single family'; status:'For sale'|'Open house'; neighborhood:string; city:string; latitude:number; longitude:number; description:string };
export type ListingFilters = { query:string; maxPrice:string; minBeds:string; propertyType:string };
export type AdvisorMessage = { id:string; role:'user'|'assistant'; content:string; citations?:string[] };
export type AdvisorResponse = { message:AdvisorMessage; listingIds:string[] };

const fallbackListings: Listing[] = [
  ['L-1042','Sunlit garden condo',785000,2,2,1180,'Condo','Open house','Noe Valley',37.7504,-122.4337,'A quiet, renovated home with a private garden and an easy walk to neighborhood cafés.'],
  ['L-1048','Modern Mission loft',925000,2,2,1320,'Condo','For sale','Mission',37.7599,-122.4148,'Double-height windows, flexible workspace, and a roof deck with downtown views.'],
  ['L-1055','Bernal view townhouse',1195000,3,2.5,1680,'Townhouse','For sale','Bernal Heights',37.7412,-122.4146,'A three-level home with sweeping views, an attached garage, and a sunny terrace.'],
  ['L-1061','Classic Edwardian flat',1049000,3,2,1510,'Condo','Open house','Haight-Ashbury',37.7692,-122.4461,'Period details meet a new kitchen in a walkable location close to Golden Gate Park.'],
  ['L-1067','Potrero family retreat',1575000,4,3,2140,'Single family','For sale','Potrero Hill',37.7562,-122.4012,'A calm family home with a landscaped yard, solar panels, and excellent natural light.'],
  ['L-1073','Marina bay-window condo',1395000,3,2,1625,'Condo','For sale','Marina',37.8011,-122.4378,'Elegant bay windows, generous entertaining space, and a block from the waterfront.'],
  ['L-1080','Compact Castro gem',699000,1,1,790,'Condo','Open house','Castro',37.7621,-122.4350,'Smart storage and a leafy outlook in the center of one of the city’s liveliest districts.'],
  ['L-1086','North Beach hideaway',845000,2,1,1020,'Condo','For sale','North Beach',37.8002,-122.4101,'A charming top-floor home with skyline views and quick access to restaurants and transit.'],
  ['L-1092','Outer Sunset modern',1275000,3,2,1770,'Single family','For sale','Outer Sunset',37.7530,-122.4952,'Remodeled coastal home with a flexible lower level and a low-maintenance back garden.'],
  ['L-1098','Hayes Valley townhouse',1495000,3,2.5,1840,'Townhouse','Open house','Hayes Valley',37.7758,-122.4241,'Design-forward living with a private roof terrace in a highly walkable neighborhood.'],
  ['L-1104','Russian Hill studio',625000,0,1,610,'Condo','For sale','Russian Hill',37.7975,-122.4193,'An efficient pied-à-terre with iconic views, a doorman, and shared outdoor space.'],
  ['L-1110','Dogpatch warehouse home',975000,2,2,1430,'Condo','For sale','Dogpatch',37.7570,-122.3882,'Authentic warehouse character, large windows, and room for a serious home office.'],
].map(([id,title,price,beds,baths,sqft,propertyType,status,neighborhood,latitude,longitude,description]) => ({id,title,price,beds,baths,sqft,propertyType,status,neighborhood,city:'San Francisco',latitude,longitude,description})) as Listing[];
const json = async <T>(response:Response):Promise<T> => { if(!response.ok) throw new Error(`Request failed (${response.status})`); return response.json() as Promise<T> };
export const api = {
  async listings(signal?:AbortSignal):Promise<Listing[]> { try{return await json<Listing[]>(await fetch('/api/listings',{signal}))}catch(error){if(signal?.aborted)throw error;return fallbackListings} },
  async advise(prompt:string,signal?:AbortSignal):Promise<AdvisorResponse> { try{return await json<AdvisorResponse>(await fetch('/api/advisor',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt}),signal}))}catch(error){if(signal?.aborted)throw error;const lower=prompt.toLowerCase();let matches=fallbackListings.filter(item=>(!lower.includes('3 bed')||item.beds>=3)&&(!lower.includes('under $1m')||item.price<1_000_000)&&(!lower.includes('outdoor')||/garden|terrace|deck|outdoor|yard/i.test(item.description))).slice(0,3);if(!matches.length)matches=fallbackListings.slice(0,3);const ids=matches.map(x=>x.id);return{message:{id:crypto.randomUUID(),role:'assistant',content:`I found ${matches.length} strong options grounded in the current listings. Open a citation to inspect it on the map.`,citations:ids},listingIds:ids}}}
};
