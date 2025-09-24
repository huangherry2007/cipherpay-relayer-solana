-- src/db/migrations/001_init.sql (new canonical names)

CREATE TABLE IF NOT EXISTS merkle_meta (
  tree_id INT NOT NULL,
  k       VARCHAR(64) NOT NULL,
  v       VARBINARY(255) NOT NULL,
  PRIMARY KEY (tree_id, k)
) ENGINE=InnoDB;

-- leaves: (tree_id, leaf_index) -> commitment
CREATE TABLE IF NOT EXISTS leaves (
  tree_id    INT NOT NULL,
  leaf_index BIGINT UNSIGNED NOT NULL,
  fe         BINARY(32) NOT NULL,
  fe_hex     CHAR(64)   NOT NULL,
  PRIMARY KEY (tree_id, leaf_index),
  KEY idx_leaf_hex (tree_id, fe_hex)
) ENGINE=InnoDB;

-- nodes: (tree_id, node_layer, node_index) -> node hash
CREATE TABLE IF NOT EXISTS nodes (
  tree_id    INT NOT NULL,
  node_layer INT NOT NULL,
  node_index BIGINT UNSIGNED NOT NULL,
  fe         BINARY(32) NOT NULL,
  fe_hex     CHAR(64)   NOT NULL,
  PRIMARY KEY (tree_id, node_layer, node_index),
  KEY idx_nodes_hex (tree_id, fe_hex)
) ENGINE=InnoDB;

-- roots ring buffer (unchanged)
CREATE TABLE IF NOT EXISTS roots (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tree_id    INT NOT NULL,
  fe         BINARY(32) NOT NULL,
  fe_hex     CHAR(64)   NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_roots_tree_time (tree_id, created_at DESC)
) ENGINE=InnoDB;
