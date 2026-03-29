INSERT INTO products (id, title, weight_kg, price_ugx, photo_url, popular)
VALUES
  ('quarter-025', 'Quarter (0.25kg)', 0.25, 20000, 'mbuzzi-choma/quarter-025', false),
  ('half-05', 'Half (0.5kg)', 0.5, 35000, 'mbuzzi-choma/half-05', false),
  ('one-1', '1kg', 1, 65000, 'mbuzzi-choma/one-1', true),
  ('two-2', '2kgs', 2, 120000, 'mbuzzi-choma/two-2', false),
  ('three-3', '3kgs', 3, 175000, 'mbuzzi-choma/three-3', false),
  ('five-5', '5kgs', 5, 285000, 'mbuzzi-choma/five-5', false)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  weight_kg = EXCLUDED.weight_kg,
  price_ugx = EXCLUDED.price_ugx,
  photo_url = EXCLUDED.photo_url,
  popular = EXCLUDED.popular,
  updated_at = now();
