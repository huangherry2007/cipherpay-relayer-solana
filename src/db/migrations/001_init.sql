-- Fe = 32-byte (little-endian) field element
-- We store both binary (fast write) and hex (indexed) for convenience/speed.
-- src/db/migrations/001_init.sql
CREATE TABLE IF NOT EXISTS merkle_meta (
  tree_id INT NOT NULL,
  k       VARCHAR(64) NOT NULL,
  v       VARBINARY(255) NOT NULL,
  PRIMARY KEY (tree_id, k)
) ENGINE=InnoDB;

-- leaves table: (tree_id, index) -> commitment
CREATE TABLE IF NOT EXISTS leaves (
  tree_id INT NOT NULL,
  `index` BIGINT UNSIGNED NOT NULL,
  fe      BINARY(32) NOT NULL,
  fe_hex  CHAR(64)   NOT NULL,
  PRIMARY KEY (tree_id, `index`),
  UNIQUE KEY idx_leaf_hex (tree_id, fe_hex)
) ENGINE=InnoDB;

-- nodes table: (tree_id, layer, index) -> node hash
-- layer 0 = leaves, layer depth = root
CREATE TABLE IF NOT EXISTS nodes (
  tree_id INT NOT NULL,
  `layer` INT NOT NULL,
  `index` BIGINT UNSIGNED NOT NULL,
  fe      BINARY(32) NOT NULL,
  fe_hex  CHAR(64)   NOT NULL,
  PRIMARY KEY (tree_id, `layer`, `index`),
  KEY idx_nodes_hex (tree_id, fe_hex)
) ENGINE=InnoDB;

-- ring buffer-ish cache of roots for telemetry/withdraw convenience
CREATE TABLE IF NOT EXISTS roots (
  id      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tree_id INT NOT NULL,
  fe      BINARY(32) NOT NULL,
  fe_hex  CHAR(64)   NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_roots_tree_time (tree_id, created_at DESC)
) ENGINE=InnoDB;
