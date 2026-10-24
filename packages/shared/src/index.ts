export type OrderStatus="created"|"paid"|"seller_confirmed"|"ready_for_handover"|"completed"|"cancelled"|"refunded"|"disputed";
export type FulfillmentType="meeting"|"pickup";
export interface Product{id:string;title:string;priceMinor:number;currency:string;stock:number;sellerId:string;status:"draft"|"moderation"|"published"|"rejected";}
export interface CommissionSnapshot{rateBps:number;platformFeeMinor:number;sellerAmountMinor:number;}