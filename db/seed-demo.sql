-- Sample disputes for development and as a demo fallback. Clearly marked is_demo; real disputes come from PayPal.
DELETE FROM agent_runs WHERE dispute_id LIKE 'PP-D-DEMO-%';
DELETE FROM disputes WHERE is_demo; DELETE FROM orders WHERE is_demo;

INSERT INTO orders (id, capture_id, status, amount, items, buyer_email, shipping, tracking, created_at, is_demo) VALUES
('DEMO-ORDER-1','DEMO-CAP-1','COMPLETED',149.00,'[{"name":"Burr Grinder Pro","sku":"KOVA-GRN-01","quantity":"1","unit_amount":{"value":"149.00"}}]',
 'maya.buyer@example.com','{"name":{"full_name":"Maya R"},"address":{"address_line_1":"1 Main St","admin_area_2":"San Jose","admin_area_1":"CA","postal_code":"95131","country_code":"US"}}',
 '{"carrier":"USPS","number":"9400111202555842761234","status":"DELIVERED","delivered_at":"2026-10-24T15:12:00Z","delivered_to":"San Jose, CA 95131, front porch","signature":false}', now() - interval '20 days', true),
('DEMO-ORDER-2','DEMO-CAP-2','COMPLETED',79.00,'[{"name":"Gooseneck Kettle","sku":"KOVA-KTL-02","quantity":"1","unit_amount":{"value":"79.00"}}]',
 'leo.buyer@example.com','{"name":{"full_name":"Leo K"},"address":{"address_line_1":"22 Oak Ave","admin_area_2":"Austin","admin_area_1":"TX","postal_code":"78701","country_code":"US"}}',
 '{"carrier":"UPS","number":"1Z999AA10123456784","status":"DELIVERED","delivered_at":"2026-10-28T11:40:00Z","delivered_to":"Austin, TX 78701"}', now() - interval '14 days', true),
('DEMO-ORDER-3','DEMO-CAP-3','COMPLETED',38.00,'[{"name":"Ethiopia Yirgacheffe 1kg","sku":"KOVA-BNS-03","quantity":"1","unit_amount":{"value":"38.00"}}]',
 'sam.buyer@example.com','{"name":{"full_name":"Sam T"},"address":{"address_line_1":"9 Pine Rd","admin_area_2":"Denver","admin_area_1":"CO","postal_code":"80202","country_code":"US"}}',
 NULL, now() - interval '25 days', true);

INSERT INTO disputes (id, reason, status, stage, amount, currency, capture_id, respond_by, raw, is_demo) VALUES
('PP-D-DEMO-0001','MERCHANDISE_OR_SERVICE_NOT_RECEIVED','WAITING_FOR_SELLER_RESPONSE','INQUIRY',149.00,'USD','DEMO-CAP-1', now() + interval '6 days',
 jsonb_build_object('dispute_id','PP-D-DEMO-0001','reason','MERCHANDISE_OR_SERVICE_NOT_RECEIVED','status','WAITING_FOR_SELLER_RESPONSE','dispute_life_cycle_stage','INQUIRY',
  'dispute_amount',jsonb_build_object('currency_code','USD','value','149.00'),'seller_response_due_date',(now() + interval '6 days')::text,
  'disputed_transactions',jsonb_build_array(jsonb_build_object('seller_transaction_id','DEMO-CAP-1','buyer',jsonb_build_object('email','maya.buyer@example.com'))),
  'messages',jsonb_build_array(jsonb_build_object('posted_by','BUYER','time_posted',(now() - interval '1 day')::text,'content','I never got my grinder. It has been almost 3 weeks.'))), true),
('PP-D-DEMO-0002','MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED','WAITING_FOR_SELLER_RESPONSE','INQUIRY',79.00,'USD','DEMO-CAP-2', now() + interval '8 days',
 jsonb_build_object('dispute_id','PP-D-DEMO-0002','reason','MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED','status','WAITING_FOR_SELLER_RESPONSE','dispute_life_cycle_stage','INQUIRY',
  'dispute_amount',jsonb_build_object('currency_code','USD','value','79.00'),'seller_response_due_date',(now() + interval '8 days')::text,
  'disputed_transactions',jsonb_build_array(jsonb_build_object('seller_transaction_id','DEMO-CAP-2','buyer',jsonb_build_object('email','leo.buyer@example.com'))),
  'messages',jsonb_build_array(jsonb_build_object('posted_by','BUYER','time_posted',(now() - interval '2 days')::text,'content','Kettle says temperature hold but it cools down after 10 minutes. Not what was advertised.'))), true),
('PP-D-DEMO-0003','MERCHANDISE_OR_SERVICE_NOT_RECEIVED','WAITING_FOR_SELLER_RESPONSE','INQUIRY',38.00,'USD','DEMO-CAP-3', now() + interval '4 days',
 jsonb_build_object('dispute_id','PP-D-DEMO-0003','reason','MERCHANDISE_OR_SERVICE_NOT_RECEIVED','status','WAITING_FOR_SELLER_RESPONSE','dispute_life_cycle_stage','INQUIRY',
  'dispute_amount',jsonb_build_object('currency_code','USD','value','38.00'),'seller_response_due_date',(now() + interval '4 days')::text,
  'disputed_transactions',jsonb_build_array(jsonb_build_object('seller_transaction_id','DEMO-CAP-3','buyer',jsonb_build_object('email','sam.buyer@example.com'))),
  'messages',jsonb_build_array(jsonb_build_object('posted_by','BUYER','time_posted',(now() - interval '3 days')::text,'content','Beans never arrived.'))), true);
