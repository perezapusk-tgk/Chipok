insert into users(id,telegram_id,first_name,username,role)
values
('00000000-0000-4000-8000-000000000001',900000001,'TacticalStore','chipok_demo_1','seller'),
('00000000-0000-4000-8000-000000000002',900000002,'UrbanWear','chipok_demo_2','seller'),
('00000000-0000-4000-8000-000000000003',900000003,'TechZone','chipok_demo_3','seller')
on conflict(telegram_id) do nothing;

insert into seller_profiles(user_id,display_name,description)
values
('00000000-0000-4000-8000-000000000001','TacticalStore','Товары для активного отдыха'),
('00000000-0000-4000-8000-000000000002','UrbanWear','Базовая городская одежда'),
('00000000-0000-4000-8000-000000000003','TechZone','Электроника и аксессуары')
on conflict(user_id) do nothing;

insert into stores(id,seller_id,name,description)
values
('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','TacticalStore','Товары для активного отдыха'),
('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','UrbanWear','Городская одежда'),
('10000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000003','TechZone','Электроника')
on conflict(seller_id) do nothing;

insert into categories(id,name,slug)
values
('20000000-0000-4000-8000-000000000001','Одежда','clothes'),
('20000000-0000-4000-8000-000000000002','Электроника','electronics'),
('20000000-0000-4000-8000-000000000003','Дом','home'),
('20000000-0000-4000-8000-000000000004','Еда','food')
on conflict(slug) do nothing;

insert into products(id,seller_id,store_id,category_id,title,slug,description,price_minor,currency,status,fulfillment_type)
values
('30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Тактический рюкзак 35 л','tactical-backpack-35','Надёжный удобный рюкзак для города, походов и активного отдыха.',499000,'RUB','published','pickup'),
('30000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','Худи оверсайз','oversize-hoodie','Плотное базовое худи свободного кроя.',249000,'RUB','published','meeting'),
('30000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002','Беспроводные наушники','wireless-headphones','Компактные наушники с хорошей автономностью.',399000,'RUB','published','meeting'),
('30000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003','Туристический стул','camping-chair','Складной стул для отдыха на природе.',199000,'RUB','published','pickup')
on conflict(id) do nothing;

insert into inventory(product_id,stock,reserved)
select id,25,0 from products where id in (
'30000000-0000-4000-8000-000000000001',
'30000000-0000-4000-8000-000000000002',
'30000000-0000-4000-8000-000000000003',
'30000000-0000-4000-8000-000000000004')
on conflict(product_id) do nothing;

insert into product_images(product_id,url,sort_order)
values
('30000000-0000-4000-8000-000000000001','https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=900&q=85',0),
('30000000-0000-4000-8000-000000000002','https://images.unsplash.com/photo-1556821840-3a63f95609a7?auto=format&fit=crop&w=900&q=85',0),
('30000000-0000-4000-8000-000000000003','https://images.unsplash.com/photo-1606220945770-b5b6c2c55bf1?auto=format&fit=crop&w=900&q=85',0),
('30000000-0000-4000-8000-000000000004','https://images.unsplash.com/photo-1598301257982-0cf014dabbcd?auto=format&fit=crop&w=900&q=85',0)
on conflict do nothing;
