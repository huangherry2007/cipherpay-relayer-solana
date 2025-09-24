/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/cipherpay_anchor.json`.
 */
export type CipherpayAnchor = {
  "address": "9dsJPKp8Z6TBtfbhHu1ssE8KSUMWUNUFAXy8SUxMuf9o",
  "metadata": {
    "name": "cipherpayAnchor",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "CipherPay Solana program using Anchor framework"
  },
  "instructions": [
    {
      "name": "depositTokens",
      "docs": [
        "Optional SPL hook (no-op in your current design)"
      ],
      "discriminator": [
        176,
        83,
        229,
        18,
        191,
        143,
        176,
        150
      ],
      "accounts": [
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "tokenMint"
        },
        {
          "name": "userTokenAccount",
          "writable": true
        },
        {
          "name": "vaultTokenAccount",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "depositHash",
          "type": "bytes"
        }
      ]
    },
    {
      "name": "initializeRootCache",
      "docs": [
        "Create an empty Merkle root cache."
      ],
      "discriminator": [
        176,
        36,
        151,
        206,
        90,
        44,
        48,
        181
      ],
      "accounts": [
        {
          "name": "rootCache",
          "writable": true,
          "signer": true
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initializeTreeState",
      "discriminator": [
        61,
        37,
        70,
        72,
        104,
        99,
        240,
        39
      ],
      "accounts": [
        {
          "name": "tree",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "depth",
          "type": "u8"
        },
        {
          "name": "genesisRoot",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "initializeVault",
      "discriminator": [
        48,
        191,
        163,
        44,
        71,
        129,
        63,
        164
      ],
      "accounts": [
        {
          "name": "vault",
          "docs": [
            "PDA to be derived with VAULT_SEED; created off-chain or here if you prefer."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "shieldedDepositAtomic",
      "docs": [
        "Atomic deposit: Memo(deposit_hash) + SPL TransferChecked to vault ATA in the *same* tx,",
        "then accept zk-proof and roll the Merkle root forward."
      ],
      "discriminator": [
        146,
        234,
        221,
        142,
        37,
        191,
        224,
        183
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "tree",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "rootCache",
          "writable": true
        },
        {
          "name": "depositMarker",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  112,
                  111,
                  115,
                  105,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "depositHash"
              }
            ]
          }
        },
        {
          "name": "vaultPda"
        },
        {
          "name": "vaultTokenAccount",
          "writable": true
        },
        {
          "name": "tokenMint"
        },
        {
          "name": "instructions"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        }
      ],
      "args": [
        {
          "name": "depositHash",
          "type": "bytes"
        },
        {
          "name": "proofBytes",
          "type": "bytes"
        },
        {
          "name": "publicInputsBytes",
          "type": "bytes"
        }
      ]
    },
    {
      "name": "shieldedTransfer",
      "discriminator": [
        191,
        130,
        5,
        127,
        124,
        187,
        238,
        188
      ],
      "accounts": [
        {
          "name": "tree",
          "docs": [
            "The global tree state (strict sync mode: must match proof's spent root)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "rootCache",
          "docs": [
            "Rolling root cache (useful for withdraws/telemetry)"
          ],
          "writable": true
        },
        {
          "name": "nullifierRecord",
          "docs": [
            "Nullifier record: one-time use"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  110,
                  117,
                  108,
                  108,
                  105,
                  102,
                  105,
                  101,
                  114
                ]
              },
              {
                "kind": "arg",
                "path": "nullifier"
              }
            ]
          }
        },
        {
          "name": "payer",
          "docs": [
            "Payer for rent when creating the nullifier record"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "nullifier",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "proofBytes",
          "type": "bytes"
        },
        {
          "name": "publicInputsBytes",
          "type": "bytes"
        }
      ]
    },
    {
      "name": "shieldedWithdraw",
      "docs": [
        "Spend one note, withdraw SPL tokens from the program’s vault ATA to the recipient."
      ],
      "discriminator": [
        212,
        34,
        45,
        239,
        90,
        192,
        208,
        2
      ],
      "accounts": [
        {
          "name": "nullifierRecord",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  110,
                  117,
                  108,
                  108,
                  105,
                  102,
                  105,
                  101,
                  114
                ]
              },
              {
                "kind": "arg",
                "path": "nullifier"
              }
            ]
          }
        },
        {
          "name": "rootCache",
          "writable": true
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "vaultPda",
          "docs": [
            "Program vault PDA (authority of the vault ATA)."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "vaultTokenAccount",
          "docs": [
            "Program vault ATA for the mint being withdrawn."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vaultPda"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "tokenMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "recipientTokenAccount",
          "docs": [
            "Recipient’s ATA for the same mint."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "recipientOwner"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "tokenMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "recipientOwner",
          "docs": [
            "Owner of the recipient ATA (will receive funds)."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenMint",
          "docs": [
            "Mint being withdrawn (must match both ATAs)."
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        }
      ],
      "args": [
        {
          "name": "nullifier",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "proofBytes",
          "type": "bytes"
        },
        {
          "name": "publicInputsBytes",
          "type": "bytes"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "depositMarker",
      "discriminator": [
        193,
        208,
        159,
        74,
        46,
        132,
        191,
        58
      ]
    },
    {
      "name": "merkleRootCache",
      "discriminator": [
        126,
        183,
        252,
        198,
        190,
        104,
        88,
        26
      ]
    },
    {
      "name": "nullifier",
      "discriminator": [
        18,
        56,
        142,
        165,
        181,
        158,
        187,
        133
      ]
    },
    {
      "name": "treeState",
      "discriminator": [
        251,
        163,
        240,
        50,
        165,
        217,
        193,
        100
      ]
    }
  ],
  "events": [
    {
      "name": "depositCompleted",
      "discriminator": [
        87,
        191,
        139,
        46,
        172,
        192,
        191,
        52
      ]
    },
    {
      "name": "transferCompleted",
      "discriminator": [
        208,
        78,
        51,
        21,
        201,
        117,
        155,
        42
      ]
    },
    {
      "name": "withdrawCompleted",
      "discriminator": [
        180,
        77,
        152,
        99,
        248,
        179,
        163,
        44
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "depositAlreadyUsed",
      "msg": "Deposit hash already used."
    },
    {
      "code": 6001,
      "name": "unknownMerkleRoot",
      "msg": "Merkle root not found in root cache."
    },
    {
      "code": 6002,
      "name": "leafIndexMismatch",
      "msg": "Leaf index in proof does not match on-chain next_leaf_index."
    },
    {
      "code": 6003,
      "name": "invalidZkProof",
      "msg": "Zero-knowledge proof verification failed."
    },
    {
      "code": 6004,
      "name": "invalidProofBytesLength",
      "msg": "Invalid Groth16 proof byte length."
    },
    {
      "code": 6005,
      "name": "invalidPublicInputsLength",
      "msg": "Invalid public inputs byte length."
    },
    {
      "code": 6006,
      "name": "invalidVerifyingKey",
      "msg": "Invalid or truncated verifying key bytes."
    },
    {
      "code": 6007,
      "name": "publicInputCountMismatch",
      "msg": "Mismatched number of public inputs for this circuit."
    },
    {
      "code": 6008,
      "name": "payloadBindingMismatch",
      "msg": "Public input payload binding mismatch."
    },
    {
      "code": 6009,
      "name": "nullifierAlreadyUsed",
      "msg": "Nullifier already used."
    },
    {
      "code": 6010,
      "name": "nullifierMismatch",
      "msg": "Nullifier provided does not match one in proof."
    },
    {
      "code": 6011,
      "name": "invalidWithdrawAmount",
      "msg": "Invalid withdrawal amount."
    },
    {
      "code": 6012,
      "name": "tokenTransferFailed",
      "msg": "Token transfer failed."
    },
    {
      "code": 6013,
      "name": "vaultMismatch",
      "msg": "Provided vault account does not match program's vault."
    },
    {
      "code": 6014,
      "name": "vaultAuthorityMismatch",
      "msg": "Vault authority PDA does not match."
    },
    {
      "code": 6015,
      "name": "memoMissing",
      "msg": "Required Memo instruction not found in transaction."
    },
    {
      "code": 6016,
      "name": "requiredSplTransferMissing",
      "msg": "Required SPL Token transfer not found in transaction."
    },
    {
      "code": 6017,
      "name": "unauthorized",
      "msg": "You are not authorized to perform this action."
    },
    {
      "code": 6018,
      "name": "invalidInput",
      "msg": "Invalid input."
    },
    {
      "code": 6019,
      "name": "arithmeticError",
      "msg": "Arithmetic overflow or underflow."
    },
    {
      "code": 6020,
      "name": "oldRootMismatch",
      "msg": "Old Merkle root does not match on-chain state."
    },
    {
      "code": 6021,
      "name": "nextLeafIndexMismatch",
      "msg": "Next leaf index mismatch."
    }
  ],
  "types": [
    {
      "name": "depositCompleted",
      "docs": [
        "Emitted after a successful shielded_deposit:",
        "- `deposit_hash` was marked processed",
        "- `commitment` inserted at `next_leaf_index`",
        "- root cache updated with `new_merkle_root`"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "depositHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "ownerCipherpayPubkey",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "commitment",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "oldMerkleRoot",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "newMerkleRoot",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "nextLeafIndex",
            "type": "u32"
          },
          {
            "name": "mint",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "depositMarker",
      "docs": [
        "Marker PDA keyed by `deposit_hash` that makes `shielded_deposit` idempotent."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "processed",
            "docs": [
              "Has this deposit_hash already been consumed (commitment inserted)?"
            ],
            "type": "bool"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump"
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "merkleRootCache",
      "docs": [
        "Ring-buffer-ish cache of recent Merkle roots (simple Vec variant).",
        "",
        "Layout: Anchor serializes `Vec<[u8;32]>` as `4 (len) + len * 32` bytes.",
        "We allocate enough space for `MAX_ROOTS` entries; at runtime we keep length",
        "≤ MAX_ROOTS and drop the oldest when full."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "roots",
            "docs": [
              "Recent roots (most recent is at the end)."
            ],
            "type": {
              "vec": {
                "array": [
                  "u8",
                  32
                ]
              }
            }
          }
        ]
      }
    },
    {
      "name": "nullifier",
      "docs": [
        "Optional on-chain nullifier record (if you decide to persist spent notes)."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "used",
            "docs": [
              "Whether this nullifier has been seen/used"
            ],
            "type": "bool"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump"
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "transferCompleted",
      "docs": [
        "Emitted after a successful shielded_transfer:",
        "- proves membership of the input note (root = `merkle_root_before`)",
        "- inserts two new commitments at indices `next_leaf_index` and `next_leaf_index + 1`",
        "- binds ciphertext tags to outputs & recipients"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "nullifier",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "out1Commitment",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "out2Commitment",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "encNote1Hash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "encNote2Hash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "merkleRootBefore",
            "docs": [
              "Root before appends (from membership proof)"
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "newMerkleRoot1",
            "docs": [
              "Root after inserting out1"
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "newMerkleRoot2",
            "docs": [
              "Root after inserting out2"
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "nextLeafIndex",
            "docs": [
              "Starting leaf index for out1 (out2 uses +1)"
            ],
            "type": "u32"
          },
          {
            "name": "mint",
            "docs": [
              "SPL mint that identifies the vault this applies to"
            ],
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "treeState",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "version",
            "type": "u16"
          },
          {
            "name": "currentRoot",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "nextIndex",
            "type": "u32"
          },
          {
            "name": "depth",
            "type": "u8"
          },
          {
            "name": "reserved",
            "type": {
              "array": [
                "u8",
                31
              ]
            }
          }
        ]
      }
    },
    {
      "name": "withdrawCompleted",
      "docs": [
        "Emitted after a successful shielded_withdraw:",
        "- proves inclusion, nullifies the note, and performs SPL transfer to `recipient`"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "nullifier",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "recipient",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "mint",
            "docs": [
              "SPL mint that identifies the vault this came from"
            ],
            "type": "pubkey"
          }
        ]
      }
    }
  ]
};
