-- Store Cloudinary public_ids (folder/file, no extension in id) instead of local /choma paths.
-- Upload assets once (see api/scripts/upload-product-images.ts), then API builds HTTPS URLs.

UPDATE products SET photo_url = 'mbuzzi-choma/quarter-025' WHERE id = 'quarter-025';
UPDATE products SET photo_url = 'mbuzzi-choma/half-05' WHERE id = 'half-05';
UPDATE products SET photo_url = 'mbuzzi-choma/one-1' WHERE id = 'one-1';
UPDATE products SET photo_url = 'mbuzzi-choma/two-2' WHERE id = 'two-2';
UPDATE products SET photo_url = 'mbuzzi-choma/three-3' WHERE id = 'three-3';
UPDATE products SET photo_url = 'mbuzzi-choma/five-5' WHERE id = 'five-5';
