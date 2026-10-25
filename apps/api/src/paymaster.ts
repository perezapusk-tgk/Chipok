import { randomUUID } from "node:crypto";

type PayMasterInvoiceResult={paymentId:string;url:string};
type PayMasterPayment={id:string;status:string;merchantId?:string;amount?:{value:number;currency:string};invoice?:{orderNo?:string;description?:string}};

function required(name:string){const v=process.env[name];if(!v)throw Object.assign(new Error(`Missing ${name}`),{statusCode:503});return v}

async function paymasterFetch<T>(path:string,init:RequestInit):Promise<T>{
 const token=required("PAYMASTER_TOKEN");
 const r=await fetch("https://paymaster.ru"+path,{...init,headers:{
  Authorization:"Bearer "+token,"content-type":"application/json",Accept:"application/json",...(init.headers||{})
 }});
 const data=await r.json() as any;
 if(!r.ok)throw Object.assign(new Error(data?.message||data?.code||"PayMaster API error"),{statusCode:502});
 return data as T;
}

export async function createPayMasterInvoice(input:{orderId:string;title:string;description:string;amountMinor:number;currency:string}){
 const merchantId=required("PAYMASTER_MERCHANT_ID");
 const base=required("PAYMASTER_CALLBACK_BASE_URL");
 const web=process.env.TELEGRAM_WEBAPP_URL||base;
 const idempotencyKey="chipok-invoice-"+input.orderId;
 return paymasterFetch<PayMasterInvoiceResult>("/api/v2/invoices",{
  method:"POST",
  headers:{"Idempotency-Key":idempotencyKey},
  body:JSON.stringify({
   merchantId,
   testMode:process.env.PAYMASTER_TEST_MODE!=="false",
   invoice:{
    description:input.description.slice(0,255),
    orderNo:input.orderId,
    params:{chipok_order_id:input.orderId}
   },
   amount:{value:Number((input.amountMinor/100).toFixed(2)),currency:input.currency},
   paymentMethod:process.env.PAYMASTER_PAYMENT_METHOD||undefined,
   callbackUrl:new URL("/api/payments/paymaster/webhook",base).toString(),
   returnUrl:new URL("/?payment=return&order="+encodeURIComponent(input.orderId),web).toString()
  })
 });
}

export async function getPayMasterPayment(paymentId:string){
 const merchantId=required("PAYMASTER_MERCHANT_ID");
 const payment=await paymasterFetch<PayMasterPayment>("/api/v2/payments/"+encodeURIComponent(paymentId),{method:"GET"});
 if(payment.merchantId&&payment.merchantId!==merchantId)throw Object.assign(new Error("PayMaster merchant mismatch"),{statusCode:502});
 return payment;
}

export function payMasterIdempotencyKey(){return randomUUID()}
