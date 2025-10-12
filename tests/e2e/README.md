Step 1: npm i -D vitest snarkjs # snarkjs is optional; needed only if you want local proving

Step 2: create TEST_MINT
    solana-test-validator --reset
    spl-token create-token
    Creating token <TOKEN_PUBKEY>
    export TEST_MINT=<TOKEN_PUBKEY> or add TEST_MINT=<TOKEN_PUBKEY> to file .env
    spl-token authorize $MINT mint --disable   # (optional for tests)


