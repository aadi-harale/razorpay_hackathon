import { inflateRawSync } from "node:zlib";
import type { ExtractedInvoice } from "@/lib/openrouter";

const MAX_UNCOMPRESSED_ENTRY = 8 * 1024 * 1024;
const MAX_TOTAL_UNCOMPRESSED = 16 * 1024 * 1024;

function decodeXml(value:string){
  return value.replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,"&");
}

function parseCsvRows(text:string){
  const rows:string[][]=[];let row:string[]=[];let cell="";let quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(quoted){
      if(ch==='"'&&text[i+1]==='"'){cell+='"';i++;}
      else if(ch==='"')quoted=false;
      else cell+=ch;
    }else if(ch==='"')quoted=true;
    else if(ch===","){row.push(cell.trim());cell="";}
    else if(ch==="\n"){row.push(cell.trim());rows.push(row);row=[];cell="";}
    else if(ch!=="\r")cell+=ch;
  }
  if(cell||row.length){row.push(cell.trim());rows.push(row);}
  return rows.filter(r=>r.some(Boolean));
}

function unzipSelected(buffer:Buffer,wanted:Set<string>){
  let eocd=-1;
  for(let i=buffer.length-22;i>=Math.max(0,buffer.length-65_557);i--){if(buffer.readUInt32LE(i)===0x06054b50){eocd=i;break;}}
  if(eocd<0)throw new Error("XLSX_ZIP_INVALID");
  const count=buffer.readUInt16LE(eocd+10);const centralOffset=buffer.readUInt32LE(eocd+16);
  const files=new Map<string,string>();let offset=centralOffset;let total=0;
  for(let i=0;i<count;i++){
    if(buffer.readUInt32LE(offset)!==0x02014b50)throw new Error("XLSX_ZIP_INVALID");
    const compression=buffer.readUInt16LE(offset+10);const compressedSize=buffer.readUInt32LE(offset+20);const uncompressedSize=buffer.readUInt32LE(offset+24);
    const nameLength=buffer.readUInt16LE(offset+28);const extraLength=buffer.readUInt16LE(offset+30);const commentLength=buffer.readUInt16LE(offset+32);const localOffset=buffer.readUInt32LE(offset+42);
    const name=buffer.subarray(offset+46,offset+46+nameLength).toString("utf8");
    if(uncompressedSize>MAX_UNCOMPRESSED_ENTRY)throw new Error("XLSX_ENTRY_TOO_LARGE");
    total+=uncompressedSize;if(total>MAX_TOTAL_UNCOMPRESSED)throw new Error("XLSX_EXPANDED_TOO_LARGE");
    if(wanted.has(name)){
      if(buffer.readUInt32LE(localOffset)!==0x04034b50)throw new Error("XLSX_ZIP_INVALID");
      const localNameLength=buffer.readUInt16LE(localOffset+26);const localExtraLength=buffer.readUInt16LE(localOffset+28);
      const start=localOffset+30+localNameLength+localExtraLength;const compressed=buffer.subarray(start,start+compressedSize);
      const raw=compression===0?compressed:compression===8?inflateRawSync(compressed):null;
      if(!raw)throw new Error("XLSX_COMPRESSION_UNSUPPORTED");
      files.set(name,raw.toString("utf8"));
    }
    offset+=46+nameLength+extraLength+commentLength;
  }
  return files;
}

function columnIndex(reference:string){
  const letters=reference.match(/^[A-Z]+/i)?.[0]?.toUpperCase()??"A";let value=0;
  for(const letter of letters)value=value*26+letter.charCodeAt(0)-64;
  return value-1;
}

function xlsxRows(buffer:Buffer){
  const files=unzipSelected(buffer,new Set(["xl/sharedStrings.xml","xl/worksheets/sheet1.xml"]));
  const sheet=files.get("xl/worksheets/sheet1.xml");if(!sheet)throw new Error("XLSX_FIRST_SHEET_MISSING");
  const shared=(files.get("xl/sharedStrings.xml")?.match(/<si\b[\s\S]*?<\/si>/g)??[]).map(si=>decodeXml([...si.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m=>m[1]).join("")));
  const rows:string[][]=[];
  for(const rowXml of sheet.match(/<row\b[\s\S]*?<\/row>/g)??[]){
    const row:string[]=[];
    for(const cellXml of rowXml.match(/<c\b[\s\S]*?<\/c>/g)??[]){
      const ref=cellXml.match(/\br="([A-Z]+\d+)"/i)?.[1]??"A1";const type=cellXml.match(/\bt="([^"]+)"/)?.[1];
      const value=cellXml.match(/<v>([\s\S]*?)<\/v>/)?.[1]??cellXml.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/)?.[1]??"";
      row[columnIndex(ref)]=type==="s"?shared[Number(value)]??"":decodeXml(value);
    }
    if(row.some(Boolean))rows.push(row.map(v=>v??""));
  }
  return rows;
}

const aliases:Record<string,string[]>= {
  productName:["product","productname","item","itemname","description"],brand:["brand"],pack:["pack","packsize","size"],quantity:["quantity","qty","units"],grossLineAmount:["grossamount","grosslineamount","amount","total","lineamount"],gstRatePercent:["gst","gstrate","gstpercent"],supplierName:["supplier","suppliername","vendor"],invoiceDate:["invoicedate","date"]
};
function normalizeHeader(value:string){return value.toLowerCase().replace(/[^a-z0-9]/g,"");}

export function invoiceFromRows(rows:string[][]):ExtractedInvoice{
  if(rows.length<2)throw new Error("TABULAR_INVOICE_EMPTY");
  const headers=rows[0].map(normalizeHeader);const index=(field:string)=>headers.findIndex(h=>aliases[field].includes(h));
  const product=index("productName"),quantity=index("quantity"),amount=index("grossLineAmount");
  if(product<0||quantity<0||amount<0)throw new Error("TABULAR_INVOICE_REQUIRED_COLUMNS_MISSING");
  const brand=index("brand"),pack=index("pack"),gst=index("gstRatePercent"),supplier=index("supplierName"),date=index("invoiceDate");
  const items:ExtractedInvoice["items"]=[];
  for(const row of rows.slice(1)){
    const name=String(row[product]??"").trim();const qty=Number(String(row[quantity]??"").replace(/,/g,""));const gross=String(row[amount]??"").replace(/[₹,\s]/g,"");
    if(!name||!Number.isInteger(qty)||qty<=0||!/^\d+(?:\.\d{1,2})?$/.test(gross))continue;
    const gstValue=String(gst>=0?row[gst]??"0":"0").replace(/[%\s]/g,"");
    items.push({productName:name,brand:brand>=0?String(row[brand]??""):"",pack:pack>=0?String(row[pack]??""):"",quantity:qty,grossLineAmount:gross,gstRatePercent:/^\d+(?:\.\d{1,4})?$/.test(gstValue)?gstValue:"0"});
  }
  if(!items.length)throw new Error("TABULAR_INVOICE_NO_VALID_LINES");
  return {supplierName:supplier>=0?String(rows[1][supplier]??"Imported supplier")||"Imported supplier":"Imported supplier",invoiceDate:date>=0?String(rows[1][date]??""):"",currency:"INR",items};
}

export function extractTabularInvoice(bytes:Buffer,mimeType:string):ExtractedInvoice{
  const rows=mimeType==="text/csv"?parseCsvRows(bytes.toString("utf8")):xlsxRows(bytes);
  return invoiceFromRows(rows);
}
