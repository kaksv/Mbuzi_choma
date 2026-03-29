INSERT INTO products (id, title, weight_kg, price_ugx, photo_url, popular)
VALUES
  ('quarter-025', 'Quarter (0.25kg)', 0.25, 20000, '/choma/quarter-025.jpg', false),
  ('half-05', 'Half (0.5kg)', 0.5, 35000, '/choma/half-05.jpg', false),
  ('one-1', '1kg', 1, 65000, '/choma/one-1.jpg', true),
  ('two-2', '2kgs', 2, 120000, '/choma/two-2.jpg', false),
  ('three-3', '3kgs', 3, 175000, '/choma/three-3.jpg', false),
  ('five-5', '5kgs', 5, 285000, '/choma/five-5.jpg', false)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  weight_kg = EXCLUDED.weight_kg,
  price_ugx = EXCLUDED.price_ugx,
  photo_url = EXCLUDED.photo_url,
  popular = EXCLUDED.popular,
  updated_at = now();
