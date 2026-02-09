-- ============================================================
-- Seed Data - Reuse Canada Roofing Measurement Tool
-- ============================================================

-- Insert Reuse Canada as master company
INSERT OR IGNORE INTO master_companies (id, company_name, contact_name, email, phone, address, city, province, postal_code, api_key)
VALUES (
  1,
  'Reuse Canada',
  'Reuse Canada Leader',
  'admin@reusecanada.com',
  '587-000-0000',
  '123 Industrial Way',
  'Edmonton',
  'Alberta',
  'T5J 0A0',
  'rc_master_key_001'
);

-- Insert sample customer companies
INSERT OR IGNORE INTO customer_companies (id, master_company_id, company_name, contact_name, email, phone, city, province)
VALUES 
  (1, 1, 'Alberta Roofing Pros', 'Mike Johnson', 'mike@abcroofing.ca', '780-555-0101', 'Edmonton', 'Alberta'),
  (2, 1, 'Calgary Storm Repair', 'Sarah Chen', 'sarah@calgarystorm.ca', '403-555-0202', 'Calgary', 'Alberta'),
  (3, 1, 'Northern Shield Roofing', 'Dave Williams', 'dave@northernshield.ca', '780-555-0303', 'Fort McMurray', 'Alberta');

-- Insert sample test order
INSERT OR IGNORE INTO orders (id, order_number, master_company_id, customer_company_id, property_address, property_city, property_province, property_postal_code, latitude, longitude, homeowner_name, homeowner_phone, requester_name, requester_company, requester_email, service_tier, price, status, payment_status)
VALUES (
  1,
  'RM-20260209-0001',
  1,
  1,
  '10234 104 Street NW',
  'Edmonton',
  'Alberta',
  'T5J 1A7',
  53.5461,
  -113.4938,
  'John Smith',
  '780-555-1234',
  'Mike Johnson',
  'Alberta Roofing Pros',
  'mike@abcroofing.ca',
  'urgent',
  15.00,
  'completed',
  'paid'
);
