alter table disputes add column if not exists previous_order_status order_status;
update disputes set previous_order_status='completed' where previous_order_status is null;
