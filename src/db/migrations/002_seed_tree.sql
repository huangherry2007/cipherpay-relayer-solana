-- seed a default tree (tree_id = 1)
-- src/db/migrations/002_seed_tree.sql
INSERT INTO merkle_meta (tree_id, k, v)
VALUES
  (1, 'depth',      0x10),       -- u8 = 16
  (1, 'next_index', 0x0000000000000000)  -- u64 = 0
ON DUPLICATE KEY UPDATE v = VALUES(v);
