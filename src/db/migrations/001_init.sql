-- Per-tree metadata (depth, next_index, roots_next_slot, etc.)
CREATE TABLE IF NOT EXISTS merkle_meta (
  tree_id INT NOT NULL,
  k       VARCHAR(64) NOT NULL,
  v       VARBINARY(255) NOT NULL,
  UNIQUE KEY uq_tree_k (tree_id, k)
) ENGINE=InnoDB;

-- Canonical leaves (layer 0)
CREATE TABLE IF NOT EXISTS leaves (
  tree_id    INT NOT NULL,
  leaf_index BIGINT UNSIGNED NOT NULL,
  fe         BINARY(32) NOT NULL,
  fe_hex     CHAR(64)   NOT NULL,
  PRIMARY KEY (tree_id, leaf_index),
  KEY idx_leaves_hex (tree_id, fe_hex)
) ENGINE=InnoDB;

-- Internal nodes only (layers >= 1)
CREATE TABLE IF NOT EXISTS nodes (
  tree_id    INT NOT NULL,
  node_layer INT NOT NULL,             -- >= 1
  node_index BIGINT UNSIGNED NOT NULL,
  fe         BINARY(32) NOT NULL,
  fe_hex     CHAR(64)   NOT NULL,
  PRIMARY KEY (tree_id, node_layer, node_index),
  KEY idx_nodes_hex (tree_id, node_layer, fe_hex),
  CHECK (node_layer >= 1)
) ENGINE=InnoDB;

-- Unified read surface (layer 0 via leaves; >=1 via nodes)
CREATE OR REPLACE VIEW nodes_all AS
SELECT tree_id, 0 AS node_layer, leaf_index AS node_index, fe, fe_hex
FROM leaves
UNION ALL
SELECT tree_id, node_layer, node_index, fe, fe_hex
FROM nodes;

-- Fixed-size (128) ring buffer of roots per tree
-- slot_index: 0..127; latest slot = (roots_next_slot - 1) mod 128
CREATE TABLE IF NOT EXISTS roots (
  tree_id    INT NOT NULL,
  slot_index TINYINT UNSIGNED NOT NULL, -- 0..127
  fe         BINARY(32) NOT NULL,
  fe_hex     CHAR(64)   NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                      ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (tree_id, slot_index)
) ENGINE=InnoDB;
