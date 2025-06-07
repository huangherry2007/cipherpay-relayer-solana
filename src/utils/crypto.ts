import * as tweetnacl from 'tweetnacl';
import { ShieldedTransaction } from '../config/types';

export function encryptTransaction(
  transaction: ShieldedTransaction,
  publicKey: Uint8Array
): Uint8Array {
  try {
    // Convert transaction to bytes
    const messageBytes = new TextEncoder().encode(JSON.stringify(transaction));

    // Generate ephemeral key pair
    const ephemeralKeyPair = tweetnacl.box.keyPair();

    // Generate nonce
    const nonce = tweetnacl.randomBytes(tweetnacl.box.nonceLength);

    // Encrypt the message
    const encryptedMessage = tweetnacl.box(
      messageBytes,
      nonce,
      publicKey,
      ephemeralKeyPair.secretKey
    );

    // Combine nonce, ephemeral public key, and encrypted message
    const combined = new Uint8Array(
      nonce.length + ephemeralKeyPair.publicKey.length + encryptedMessage.length
    );
    combined.set(nonce);
    combined.set(ephemeralKeyPair.publicKey, nonce.length);
    combined.set(encryptedMessage, nonce.length + ephemeralKeyPair.publicKey.length);

    return combined;
  } catch (error) {
    throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export function decryptTransaction(
  encryptedData: Uint8Array,
  privateKey: Uint8Array
): ShieldedTransaction {
  try {
    // Extract nonce, ephemeral public key, and encrypted message
    const nonce = encryptedData.slice(0, tweetnacl.box.nonceLength);
    const ephemeralPublicKey = encryptedData.slice(
      tweetnacl.box.nonceLength,
      tweetnacl.box.nonceLength + tweetnacl.box.publicKeyLength
    );
    const encryptedMessage = encryptedData.slice(
      tweetnacl.box.nonceLength + tweetnacl.box.publicKeyLength
    );

    // Decrypt the message
    const decryptedMessage = tweetnacl.box.open(
      encryptedMessage,
      nonce,
      ephemeralPublicKey,
      privateKey
    );

    if (!decryptedMessage) {
      throw new Error('Decryption failed');
    }

    // Parse the decrypted message back to a ShieldedTransaction
    return JSON.parse(new TextDecoder().decode(decryptedMessage));
  } catch (error) {
    throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export function generateKeyPair(): { publicKey: Uint8Array; privateKey: Uint8Array } {
  const keyPair = tweetnacl.box.keyPair();
  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.secretKey
  };
}

export function hashMessage(message: string): Uint8Array {
  return tweetnacl.hash(new TextEncoder().encode(message));
}
