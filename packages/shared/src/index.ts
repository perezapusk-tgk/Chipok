export type OrderStatus="created"|"paid"|"seller_confirmed"|"ready_for_handover"|"completed"|"cancelled"|"refunded"|"disputed";
export type FulfillmentType="meeting"|"pickup";
export type ProductStatus="draft"|"moderation"|"published"|"rejected"|"archived";
export interface Product{id:string;title:string;priceMinor:number;currency:string;stock:number;sellerId:string;status:ProductStatus;}
export interface CommissionSnapshot{rateBps:number;platformFeeMinor:number;sellerAmountMinor:number;}
export interface CatalogItem extends Product{availableStock:number;imageUrl?:string;}
export interface AuthUser{id:string;telegramId:number;firstName:string;lastName?:string;username?:string;role:"buyer"|"seller"|"admin";}