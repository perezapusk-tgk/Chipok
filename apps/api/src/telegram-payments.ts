export type InvoiceItem={label:string;amountMinor:number};

async function telegramCall<T>(method:string,body:Record<string,unknown>):Promise<T>{
  const token=process.env.TELEGRAM_BOT_TOKEN;
  if(!token) throw new Error("Missing TELEGRAM_BOT_TOKEN");
  const r=await fetch("https://api.telegram.org/bot"+token+"/"+method,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
  const data=await r.json() as {ok:boolean;result?:T;description?:string};
  if(!data.ok||!data.result){ const error=Object.assign(new Error(data.description||"Telegram Bot API error"),{statusCode:502}); throw error; }
  return data.result;
}

export async function createTelegramInvoiceLink(input:{title:string;description:string;payload:string;amountMinor:number;currency?:string;photoUrl?:string}){
  const providerToken=process.env.TELEGRAM_PROVIDER_TOKEN;
  if(!providerToken) throw Object.assign(new Error("Telegram payment provider is not configured"),{statusCode:503});
  return telegramCall<string>("createInvoiceLink",{
    title:input.title.slice(0,32),
    description:input.description.slice(0,255),
    payload:input.payload,
    provider_token:providerToken,
    currency:input.currency||process.env.TELEGRAM_PAYMENT_CURRENCY||"RUB",
    prices:[{label:input.title.slice(0,32),amount:input.amountMinor}],
    photo_url:input.photoUrl,
    need_name:false,
    need_phone_number:false,
    need_email:false
  });
}

export async function answerPreCheckout(queryId:string,ok:boolean,errorMessage?:string){
  return telegramCall<boolean>("answerPreCheckoutQuery",{pre_checkout_query_id:queryId,ok,...(!ok&&errorMessage?{error_message:errorMessage}:{})});
}
