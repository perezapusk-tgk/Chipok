import { createHmac, timingSafeEqual } from "node:crypto";
export interface TelegramUser { id:number; first_name:string; last_name?:string; username?:string; language_code?:string; is_premium?:boolean }
export function validateTelegramInitData(raw:string, botToken:string, maxAgeSeconds=86400):TelegramUser {
  const params=new URLSearchParams(raw); const hash=params.get("hash"); const authDate=Number(params.get("auth_date"));
  if(!hash||!Number.isFinite(authDate)) throw new Error("Invalid Telegram init data");
  if(Math.abs(Math.floor(Date.now()/1000)-authDate)>maxAgeSeconds) throw new Error("Telegram init data expired");
  const pairs:string[]=[]; params.forEach((v,k)=>{if(k!=="hash") pairs.push(`${k}=${v}`)}); pairs.sort();
  const secret=createHmac("sha256","WebAppData").update(botToken).digest();
  const calculated=createHmac("sha256",secret).update(pairs.join("\n")).digest(); const provided=Buffer.from(hash,"hex");
  if(provided.length!==calculated.length||!timingSafeEqual(provided,calculated)) throw new Error("Invalid Telegram signature");
  const userRaw=params.get("user"); if(!userRaw) throw new Error("Telegram user is missing");
  const user=JSON.parse(userRaw) as TelegramUser; if(!Number.isSafeInteger(user.id)) throw new Error("Invalid Telegram user"); return user;
}